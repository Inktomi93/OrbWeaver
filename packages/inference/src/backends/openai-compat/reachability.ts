// The endpoint REACHABILITY probe + the wake slice (§8.1, §4). Every `auth: endpoint` row alike: a cached
// `GET <baseUrl>/v1/models` says `up | down`; when the row's folded `features.sleep` names the pair, the
// `isSleepingPath` read says `asleep`. Before each task the backend asks `asleep` afresh and, when it is, `wake` POSTs
// `wakePath` once per server and polls until it answers awake — nothing here knows the word vLLM. The `up | down` cache is per
// base URL with a short TTL so a burst of availability reads (every composer render) shares one probe.

import type { Reachability } from "#contract";
import { ProviderError } from "#contract";
import type { ProbeTarget, ReachabilityDeps, ReachabilityProber, SleepTarget } from "../../contract/openai-backend.ts";
import { deadlineSignal } from "../http/abort-flatten.ts";
import { authHeaders, fetchJson, openAiPath, SERVER_READ_TIMEOUT_MS, serverRootOf } from "../http/fetch-json.ts";
import { NO_PROVIDER_SECRETS } from "../http/sanitize.ts";
import { waitForTimeout } from "../http/timers.ts";

const PROBE_TTL_MS = 10_000;
const WAKE_POLL_MS = 1000;
const WAKE_TIMEOUT_MS = 120_000;

interface CacheEntry {
  readonly at: number;
  readonly state: Reachability;
}

// vLLM serves its sleep pair at the server root, never under `/v1`.
function sleepUrl(baseUrl: string, path: string): string {
  return `${serverRootOf(baseUrl)}${path}`;
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
  signal: AbortSignal | undefined,
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

async function probeOnce(deps: ReachabilityDeps, target: ProbeTarget, signal?: AbortSignal): Promise<Reachability> {
  try {
    if (
      target.sleepPath !== undefined &&
      readsAsleep(await readJson(deps, target, { url: sleepUrl(target.baseUrl, target.sleepPath), label: "sleep probe" }, signal))
    ) {
      return "asleep";
    }
    await readJson(deps, target, { url: openAiPath(target.baseUrl, "/models"), label: "reachability probe" }, signal);
    return "up";
    // every probe failure is the returned `down` state, which the availability fold in resolve/availability.ts maps to `endpoint-unreachable`; reachability is advisory and never authorizes a request. Ends if callers need the failure cause.
  } catch {
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
function joinWake(flight: WakeFlight, signal: AbortSignal | undefined): Promise<boolean> {
  flight.waiters += 1;
  return new Promise<boolean>((resolve, reject) => {
    let left = false;
    // A task that cancelled has already left; the shared wake settling later must not count it out again.
    const leave = (): void => {
      if (left) {
        return;
      }
      left = true;
      signal?.removeEventListener("abort", onAbort);
      flight.waiters -= 1;
    };
    const onAbort = (): void => {
      leave();
      if (flight.waiters === 0) {
        flight.controller.abort();
      }
      reject(wakeAborted());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted === true) {
      onAbort();
    }
    // the rejection arm calls `reject(err)` at reachability.ts:121 on this task's own promise, which its caller awaits. Ends if the handler stops rejecting with the error.
    flight.run.then(
      (woke) => {
        leave();
        resolve(woke);
      },
      (err: unknown) => {
        leave();
        reject(err);
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
    const run = probeOnce(deps, target)
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

  const asleep = async (target: SleepTarget, signal: AbortSignal | undefined): Promise<boolean> => {
    // a sleep read the server does not answer is `false`, and `wakeBeforeSend` in openai-compat/index.ts then lets the task run: the task meets the same server and rejects with its own classified ProviderError. A cancel is rethrown here as `wakeAborted`. Ends if a caller needs the read's own failure.
    try {
      return readsAsleep(await readJson(deps, target, { url: sleepUrl(target.baseUrl, target.sleepPath), label: "sleep probe" }, signal));
    } catch (err) {
      if (signal?.aborted === true) {
        throw wakeAborted(err);
      }
      return false;
    }
  };

  const wakeOnce = async (target: SleepTarget, signal: AbortSignal): Promise<boolean> => {
    invalidate(target.baseUrl);
    const post = deadlineSignal(signal, SERVER_READ_TIMEOUT_MS, deps.scheduleTimeout);
    // a failed wake POST falls through to the bounded probe loop below, whose final `false` makes `wakeBeforeSend` (openai-compat/index.ts) throw a retryable `model_unavailable` ProviderError, and whose cancel check throws `wakeAborted`. Ends if the loop stops deciding success or timeout.
    await deps
      .fetch(sleepUrl(target.baseUrl, target.wakePath), {
        method: "POST",
        headers: authHeaders(target.secret, target.headers),
        redirect: "manual",
        signal: post.signal,
      })
      .catch(() => undefined)
      .finally(post.dispose);
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
  const wake = async (target: SleepTarget, signal: AbortSignal | undefined): Promise<boolean> => {
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

  return { probe, asleep, wake, invalidate };
}

export type { ReachabilityDeps, ReachabilityProber } from "../../contract/openai-backend.ts";
