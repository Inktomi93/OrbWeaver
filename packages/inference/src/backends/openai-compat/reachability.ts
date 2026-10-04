// The endpoint REACHABILITY probe + the wake slice (§8.1, §4). Every `auth: endpoint` row alike: a cached
// `GET <baseUrl>/v1/models` says `up | down`; when the row's folded `features.sleep` names the pair, the
// `isSleepingPath` read says `asleep`. Before each task the backend asks `asleep` afresh and, when it is, `wake` POSTs
// `wakePath` and polls until the server answers awake — nothing here knows the word vLLM. The `up | down` cache is per
// base URL with a short TTL so a burst of availability reads (every composer render) shares one probe.

import { setTimeout as sleep } from "node:timers/promises";
import { ProviderError } from "../../contract/errors.ts";
import type { Reachability } from "../../contract/runtime.ts";
import { deadlineSignal } from "../kit/abort-flatten.ts";
import { authHeaders, fetchJson, openAiPath, SERVER_READ_TIMEOUT_MS } from "../kit/fetch-json.ts";
import { NO_PROVIDER_SECRETS } from "../kit/sanitize.ts";

const PROBE_TTL_MS = 10_000;
const WAKE_POLL_MS = 1000;
const WAKE_TIMEOUT_MS = 120_000;
const TRAILING_SLASH_RE = /\/$/u;

export interface ReachabilityDeps {
  readonly fetch: typeof fetch;
  readonly now: () => number;
}

interface ProbeTarget {
  readonly baseUrl: string;
  readonly secret: string | null;
  readonly headers: Readonly<Record<string, string>> | undefined;
  readonly sleepPath: string | undefined;
}

/** A row whose folded features name the sleep pair. */
interface SleepTarget extends ProbeTarget {
  readonly sleepPath: string;
  readonly wakePath: string;
}

interface CacheEntry {
  readonly at: number;
  readonly state: Reachability;
}

function sleepUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(TRAILING_SLASH_RE, "")}${path}`;
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
  const read = deadlineSignal(signal, SERVER_READ_TIMEOUT_MS);
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
    // @orb-waive caught-failure-ownership(catch): every probe failure is owned by the returned `down` state; reachability is advisory and never authorizes a request. Precedent: the gate mustPass fixture packages/server/src/domain/probe/failed-status.ts proves the same explicit failure result. Ends if callers need the failure cause.
  } catch {
    return "down";
  }
}

export interface ReachabilityProber {
  readonly probe: (target: ProbeTarget) => Promise<Reachability>;
  /** Whether the server says it is asleep right now. Never cached: a server is put to sleep from outside the app at
   *  any moment, and a sleeping vLLM queues a request without answering, so only a fresh read may send to it. A read
   *  that fails is `false` (the task then meets the server's own answer); a `signal` abort rejects. */
  readonly asleep: (target: SleepTarget, signal: AbortSignal | undefined) => Promise<boolean>;
  /** POST the row's wake path, then poll the sleep read until awake or the wake window closes. A `signal` abort
   *  rejects at once with an `aborted` error. */
  readonly wake: (target: SleepTarget, signal: AbortSignal | undefined) => Promise<boolean>;
  readonly invalidate: (baseUrl: string) => void;
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
    // @orb-waive caught-failure-ownership(err): a sleep read the server does not answer is owned by the task it guards, which meets the same server and surfaces its own classified error; only a cancel is rethrown here. Ends if a caller needs the read's own failure.
    try {
      return readsAsleep(await readJson(deps, target, { url: sleepUrl(target.baseUrl, target.sleepPath), label: "sleep probe" }, signal));
    } catch (err) {
      if (signal?.aborted === true) {
        throw wakeAborted(err);
      }
      return false;
    }
  };

  const wake = async (target: SleepTarget, signal: AbortSignal | undefined): Promise<boolean> => {
    invalidate(target.baseUrl);
    const post = deadlineSignal(signal, SERVER_READ_TIMEOUT_MS);
    // @orb-waive caught-failure-ownership(fetch): wake POST failure falls through to the bounded probe loop, whose final false is the wake verdict. Precedent: the gate mustPass fixture packages/server/src/domain/probe/failed-status.ts proves the same explicit failure result. Ends if the following loop stops deciding success or timeout.
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
      if (signal?.aborted === true) {
        throw wakeAborted();
      }
      cache.set(target.baseUrl, { at: deps.now(), state });
      if (state === "up") {
        return true;
      }
      await sleep(WAKE_POLL_MS, undefined, signal === undefined ? undefined : { signal }).catch((err: unknown) => {
        throw wakeAborted(err);
      });
    }
    return false;
  };

  return { probe, asleep, wake, invalidate };
}
