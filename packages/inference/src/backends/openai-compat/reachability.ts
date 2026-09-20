// The endpoint REACHABILITY probe + the wake slice (§8.1, §4). Every `auth: endpoint` row alike: a cached
// `GET <baseUrl>/v1/models` says `up | down`; when the row's folded `features.sleep` names the pair, the
// `isSleepingPath` read says `asleep`, and `wakeForTask` POSTs `wakePath` and polls until the server answers
// awake — nothing here knows the word vLLM. The cache is per base URL with a short TTL so a burst of
// availability reads (every composer render) shares one probe; a wake invalidates it.

import type { Reachability } from "../../resolve/availability.ts";
import { authHeaders, fetchJson, openAiPath } from "../kit/fetch-json.ts";
import { NO_PROVIDER_SECRETS } from "../kit/sanitize.ts";

const PROBE_TTL_MS = 10_000;
const PROBE_TIMEOUT_MS = 3000;
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

interface CacheEntry {
  readonly at: number;
  readonly state: Reachability;
}

function withTimeout(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
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

async function probeOnce(deps: ReachabilityDeps, target: ProbeTarget): Promise<Reachability> {
  const headers = authHeaders(target.secret, target.headers);
  try {
    if (target.sleepPath !== undefined) {
      const sleeping = await fetchJson({
        fetch: deps.fetch,
        url: sleepUrl(target.baseUrl, target.sleepPath),
        headers,
        secrets: NO_PROVIDER_SECRETS,
        label: "sleep probe",
        signal: withTimeout(PROBE_TIMEOUT_MS),
      });
      if (readsAsleep(sleeping.json)) {
        return "asleep";
      }
    }
    await fetchJson({
      fetch: deps.fetch,
      url: openAiPath(target.baseUrl, "/models"),
      headers,
      secrets: NO_PROVIDER_SECRETS,
      label: "reachability probe",
      signal: withTimeout(PROBE_TIMEOUT_MS),
    });
    return "up";
    // @orb-waive caught-failure-ownership(catch): every probe failure is owned by the returned `down` state; reachability is advisory and never authorizes a request. Precedent: the gate mustPass fixture packages/server/src/domain/probe/failed-status.ts proves the same explicit failure result. Ends if callers need the failure cause.
  } catch {
    return "down";
  }
}

export interface ReachabilityProber {
  readonly probe: (target: ProbeTarget) => Promise<Reachability>;
  /** POST the row's wake path, then poll the sleep read until awake or the wake window closes. */
  readonly wake: (target: ProbeTarget & { readonly wakePath: string }) => Promise<boolean>;
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

  const wake = async (target: ProbeTarget & { readonly wakePath: string }): Promise<boolean> => {
    invalidate(target.baseUrl);
    const headers = authHeaders(target.secret, target.headers);
    // @orb-waive caught-failure-ownership(fetch): wake POST failure falls through to the bounded probe loop, whose final false is the wake verdict. Precedent: the gate mustPass fixture packages/server/src/domain/probe/failed-status.ts proves the same explicit failure result. Ends if the following loop stops deciding success or timeout.
    await deps
      .fetch(sleepUrl(target.baseUrl, target.wakePath), { method: "POST", headers, redirect: "manual", signal: withTimeout(PROBE_TIMEOUT_MS) })
      .catch(() => undefined);
    const deadline = deps.now() + WAKE_TIMEOUT_MS;
    while (deps.now() < deadline) {
      invalidate(target.baseUrl);
      const state = await probe(target);
      if (state === "up") {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, WAKE_POLL_MS));
    }
    return false;
  };

  return { probe, wake, invalidate };
}
