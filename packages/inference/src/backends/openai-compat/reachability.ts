// The endpoint REACHABILITY probe + the wake slice (§8.1, §4). Every `auth: endpoint` row alike: a cached
// `GET <baseUrl>/v1/models` says `up | down`; when the row's folded `features.sleep` names the pair, an
// `isSleepingPath` read that answers truthy says `asleep`, and one that does not answer says nothing. Before each
// task the backend asks `asleep` afresh and, when it is, `wake` POSTs `wakePath` once per server and polls until it answers awake — nothing here knows the word vLLM. The `up | down` cache is per
// base URL with a short TTL so a burst of availability reads (every composer render) shares one probe.

import { toError } from "@orb/kit/error-message";
import { isFetchFailure } from "@orb/kit/fetch-failure";
import type { Reachability } from "#contract";
import { ProviderError } from "#contract";
import type { ProbeTarget, ReachabilityDeps, ReachabilityProber, SleepTarget } from "#src/contract/openai-backend.ts";
import { deadlineSignal } from "../http/abort-flatten.ts";
import { authHeaders, fetchJson, onBaseOrigin, openAiPath, SERVER_READ_TIMEOUT_MS, serverRootOf, transportError } from "../http/fetch-json.ts";
import { NO_PROVIDER_SECRETS } from "../http/sanitize.ts";
import { waitForTimeout } from "../http/timers.ts";

const PROBE_TTL_MS = 10_000;
const WAKE_POLL_MS = 1000;
const WAKE_TIMEOUT_MS = 120_000;

interface CacheEntry {
  readonly at: number;
  readonly state: Reachability;
}

// vLLM serves its sleep pair at the server root, never under `/v1`. An off-origin sleep check reads awake (the catch in
// `readsSleeping`); an off-origin wake fails the task before the POST.
function sleepUrl(baseUrl: string, path: string): string {
  return onBaseOrigin(baseUrl, `${serverRootOf(baseUrl)}${path}`, "sleep path");
}

/** vLLM answers `{ "is_sleeping": true }`; any truthy `is_sleeping`/`sleeping` reads asleep. */
function readsAsleep(json: unknown): boolean {
  if (json === null || typeof json !== "object") {
    return false;
  }
  const record = json as Record<string, unknown>;
  return record["is_sleeping"] === true || record["sleeping"] === true;
}

function wakeAborted(cause?: unknown): ProviderError {
  return new ProviderError({ kind: "aborted", retryable: false, message: "the wake was cancelled", cause });
}

/** One bounded GET's JSON body; throws when the server does not answer in time or `signal` aborts. */
async function readJson(
  deps: ReachabilityDeps,
  target: ProbeTarget,
  { url, label }: { readonly url: string; readonly label: string },
  signal: AbortSignal,
): Promise<unknown> {
  const read = deadlineSignal(signal, SERVER_READ_TIMEOUT_MS, deps.scheduleTimeout);
  try {
    const answer = await fetchJson({
      fetch: deps.fetch,
      url,
      headers: authHeaders(target.secret, target.headers),
      secrets: NO_PROVIDER_SECRETS,
      label,
      signal: read.signal,
    });
    return answer.json;
  } finally {
    read.dispose();
  }
}

/** Whether the server says it sleeps. The sleep route is optional evidence: a server or proxy that does not serve it
 *  is not asleep, and only the model list can call that server down. */
async function readsSleeping(deps: ReachabilityDeps, target: ProbeTarget, sleepPath: string, signal: AbortSignal): Promise<boolean> {
  // A sleep read the server does not answer is `false`: `probeOnce` then asks the model list, and `wakeBeforeSend` in
  // openai-compat/index.ts lets the task run, where it meets the same server and rejects with its own classified
  // ProviderError. A cancel is rethrown here as `wakeAborted`, and any fault that is not an unanswered read rejects.
  try {
    return readsAsleep(await readJson(deps, target, { url: sleepUrl(target.baseUrl, sleepPath), label: "sleep probe" }, signal));
  } catch (err) {
    if (signal.aborted) {
      throw wakeAborted(err);
    }
    if (!(err instanceof ProviderError || isFetchFailure(err))) {
      throw err;
    }
    return false;
  }
}

async function probeOnce(deps: ReachabilityDeps, target: ProbeTarget, signal: AbortSignal): Promise<Reachability> {
  try {
    if (target.sleepPath !== undefined && (await readsSleeping(deps, target, target.sleepPath, signal))) {
      return "asleep";
    }
    await readJson(deps, target, { url: openAiPath(target.baseUrl, "/models"), label: "reachability probe" }, signal);
    return "up";
  } catch (error) {
    // A model list that does not answer (a classified ProviderError, or a body read that fails on the network or the
    // deadline) is the returned `down` state, which the availability fold in resolve/availability.ts maps to
    // `endpoint-unreachable`; reachability is advisory and never authorizes a request. Any other fault rejects.
    if (!(error instanceof ProviderError || isFetchFailure(error))) {
      throw error;
    }
    return "down";
  }
}

interface WakeFlight {
  readonly controller: AbortController;
  readonly run: Promise<boolean>;
  waiters: number;
}

/** Wait on a shared wake under this task's own cancel: a cancel rejects this task at once and leaves the wake running
 *  for the others; the last task to leave stops it. */
function joinWake(flight: WakeFlight, signal: AbortSignal): Promise<boolean> {
  flight.waiters += 1;
  return new Promise<boolean>((resolve, reject) => {
    let left = false;
    // A task that cancelled has already left; the shared wake settling later must not count it out again.
    const leave = (): void => {
      if (left) {
        return;
      }
      left = true;
      signal.removeEventListener("abort", onAbort);
      flight.waiters -= 1;
    };
    const onAbort = (): void => {
      leave();
      if (flight.waiters === 0) {
        flight.controller.abort();
      }
      reject(wakeAborted());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
    }
    // the rejection arm below rejects this task's own promise, which its caller awaits; it ends if the handler stops rejecting with the error.
    flight.run.then(
      (woke) => {
        leave();
        resolve(woke);
      },
      (err: unknown) => {
        leave();
        reject(toError(err));
      },
    );
  });
}

export function createReachabilityProber(deps: ReachabilityDeps): ReachabilityProber {
  const cache = new Map<string, CacheEntry>();
  const inFlight = new Map<string, Promise<Reachability>>();

  const probe = async (target: ProbeTarget): Promise<Reachability> => {
    const hit = cache.get(target.baseUrl);
    if (hit !== undefined && deps.now() - hit.at < PROBE_TTL_MS) {
      return hit.state;
    }
    const pending = inFlight.get(target.baseUrl);
    if (pending !== undefined) {
      return await pending;
    }
    // Every caller of this server joins one cached probe, so no one caller's cancel may end it; each read keeps its
    // own deadline (`SERVER_READ_TIMEOUT_MS`).
    const run = probeOnce(deps, target, new AbortController().signal)
      .then((state) => {
        cache.set(target.baseUrl, { at: deps.now(), state });
        return state;
      })
      .finally(() => inFlight.delete(target.baseUrl));
    inFlight.set(target.baseUrl, run);
    return await run;
  };

  const invalidate = (baseUrl: string): void => {
    cache.delete(baseUrl);
  };

  const asleep = (target: SleepTarget, signal: AbortSignal): Promise<boolean> => readsSleeping(deps, target, target.sleepPath, signal);

  const wakeOnce = async (target: SleepTarget, signal: AbortSignal): Promise<boolean> => {
    invalidate(target.baseUrl);
    const post = deadlineSignal(signal, SERVER_READ_TIMEOUT_MS, deps.scheduleTimeout);
    // A wake POST the endpoint never takes (the network, its deadline, a refused endpoint) is a transport failure, read
    // as `transportError` reads the probe's. It falls through to the bounded probe loop below, whose final `false` makes
    // `wakeBeforeSend` (openai-compat/index.ts) throw a retryable `model_unavailable` ProviderError. A cancel of this
    // task's own signal throws `wakeAborted` at once.
    const refused = await deps
      .fetch(sleepUrl(target.baseUrl, target.wakePath), {
        method: "POST",
        headers: authHeaders(target.secret, target.headers),
        redirect: "manual",
        signal: post.signal,
      })
      .then(
        (): ProviderError | null => null,
        (error: unknown) => transportError({ label: "wake", signal: post.signal }, error),
      )
      .finally(post.dispose);
    if (refused !== null && signal.aborted) {
      throw wakeAborted(refused);
    }
    const deadline = deps.now() + WAKE_TIMEOUT_MS;
    while (deps.now() < deadline) {
      const state = await probeOnce(deps, target, signal);
      if (signal.aborted) {
        throw wakeAborted();
      }
      cache.set(target.baseUrl, { at: deps.now(), state });
      if (state === "up") {
        return true;
      }
      await waitForTimeout(WAKE_POLL_MS, signal, deps.scheduleTimeout).catch((err: unknown) => {
        throw wakeAborted(err);
      });
    }
    return false;
  };

  // One wake per server, keyed on its root so every spelling of its base URL shares it: concurrent tasks on one
  // sleeping engine share its POST and its poll. Each task keeps its own cancel; the shared wake stops only when every
  // task waiting on it has cancelled.
  const wakes = new Map<string, WakeFlight>();
  const wake = async (target: SleepTarget, signal: AbortSignal): Promise<boolean> => {
    const server = serverRootOf(target.baseUrl);
    let flight = wakes.get(server);
    if (flight === undefined || flight.controller.signal.aborted) {
      const controller = new AbortController();
      const started: WakeFlight = {
        controller,
        waiters: 0,
        run: wakeOnce(target, controller.signal).finally(() => {
          if (wakes.get(server) === started) {
            wakes.delete(server);
          }
        }),
      };
      wakes.set(server, started);
      flight = started;
    }
    return await joinWake(flight, signal);
  };

  return { probe, asleep, wake };
}

export type { ReachabilityDeps, ReachabilityProber } from "#src/contract/openai-backend.ts";
