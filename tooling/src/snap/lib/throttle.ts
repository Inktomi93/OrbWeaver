// LOAD EMULATION — the `--cpu-throttle` / `--network` vocabulary and its CDP payloads. Pure: the parse
// side (name → profile), the conditions table, and the RESULT-line spelling. The CDP calls themselves
// live in ops/session.ts, which is where a page exists to attach to.
//
// WHY THIS EXISTS (#826, from the #819 CLS attribution): a layout shift within 500ms of a real user input
// carries `hadRecentInput: true` and is EXCLUDED from CLS, so an unthrottled measurement of a
// "settles after you click it" surface is structurally optimistic — it reports 0.000 paid and says
// nothing about the margin. The arm that reveals the margin is CPU throttling, and it was unreachable
// from snap: the measurement that decided #819 cost 14 chrome-devtools MCP calls against a ~8 budget.
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { DriveBudgets, NetworkConditions, NetworkProfileName } from "../contract/types.ts";
import {
  NAV_TIMEOUT_MS,
  STAGE_NAV_TIMEOUT_MS,
  STAGE_READY_TIMEOUT_MS,
  THROTTLED_NAV_TIMEOUT_MS,
  THROTTLED_READY_TIMEOUT_MS,
  WAIT_SELECTOR_TIMEOUT_MS,
} from "./budgets.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

/** No throttling — CDP's own identity rate. */
export const NO_CPU_THROTTLE = 1;

// Chrome DevTools' predefined conditions, resolved from `front_end/core/sdk/NetworkManager.ts` (fetched
// 2026-08-30). Each derivation is written out so the number is auditable against that file rather than
// trusted: DevTools states a nominal link speed in bits/s and multiplies it by its own throughput factor,
// and states a target RTT which it multiplies by its own latency factor.
/** 500 Kbps × 0.8 ÷ 8 bits — Slow 3G, both directions. */
const SLOW_3G_BYTES_PER_S = 50_000;
/** 400ms target RTT × 5. */
const SLOW_3G_LATENCY_MS = 2000;
/** 1.6 Mbps × 0.9 ÷ 8 bits. */
const SLOW_4G_DOWN_BYTES_PER_S = 180_000;
/** 750 Kbps × 0.9 ÷ 8 bits. */
const SLOW_4G_UP_BYTES_PER_S = 84_375;
/** 150ms target RTT × 3.75. */
const SLOW_4G_LATENCY_MS = 562.5;
/** 9 Mbps × 0.9 ÷ 8 bits. */
const FAST_4G_DOWN_BYTES_PER_S = 1_012_500;
/** 1.5 Mbps × 0.9 ÷ 8 bits. */
const FAST_4G_UP_BYTES_PER_S = 168_750;
/** 60ms target RTT × 2.75. */
const FAST_4G_LATENCY_MS = 165;
/** CDP's own "no limit" sentinel for a throughput field. */
const CDP_NO_LIMIT = -1;
const NO_ADDED_LATENCY_MS = 0;

export const NETWORK_PROFILES: Readonly<Record<NetworkProfileName, NetworkConditions>> = {
  "slow-3g": { offline: false, downloadThroughput: SLOW_3G_BYTES_PER_S, uploadThroughput: SLOW_3G_BYTES_PER_S, latency: SLOW_3G_LATENCY_MS },
  // DevTools used to call this one "Fast 3G".
  "slow-4g": { offline: false, downloadThroughput: SLOW_4G_DOWN_BYTES_PER_S, uploadThroughput: SLOW_4G_UP_BYTES_PER_S, latency: SLOW_4G_LATENCY_MS },
  "fast-4g": { offline: false, downloadThroughput: FAST_4G_DOWN_BYTES_PER_S, uploadThroughput: FAST_4G_UP_BYTES_PER_S, latency: FAST_4G_LATENCY_MS },
  offline: { offline: true, downloadThroughput: CDP_NO_LIMIT, uploadThroughput: CDP_NO_LIMIT, latency: NO_ADDED_LATENCY_MS },
};

/** Every spelling the parser accepts, mapped to its profile. Case and separators are normalised first
 *  (`Slow 3G` / `slow-3g` / `SLOW3G` are one input), and `fast-3g` is DevTools' retired name for
 *  `slow-4g` — an alias, never a fifth condition. */
const PROFILE_ALIASES: Readonly<Record<string, NetworkProfileName>> = {
  slow3g: "slow-3g",
  fast3g: "slow-4g",
  slow4g: "slow-4g",
  fast4g: "fast-4g",
  offline: "offline",
};

/** The `--network` value → profile, or null when the spelling is not one of ours (the caller REFUSES;
 *  a silently-ignored throttle flag would report a load arm that never ran). */
export function parseNetworkProfile(raw: string): NetworkProfileName | null {
  return PROFILE_ALIASES[raw.toLowerCase().replace(/[\s_-]/gu, "")] ?? null;
}

/** The accepted spellings, for the refusal message and `--help`. */
export const NETWORK_PROFILE_SPELLINGS: readonly string[] = ["slow-3g", "fast-3g (= slow-4g)", "slow-4g", "fast-4g", "offline"];

/** The RESULT-line value: what a reader must be able to see WITHOUT re-reading the argv, because every
 *  number in that run was measured under it. */
export function throttleResultValue(cpuRate: number, network: NetworkProfileName | null): string {
  const cpu = cpuRate === NO_CPU_THROTTLE ? "cpu:1x" : `cpu:${cpuRate}x`;
  return `${cpu}/net:${network ?? "live"}`;
}

/** THE BUDGETS A LOAD ARM IS JUDGED AGAINST (#836). A declared throttle moves the wall clock the run
 *  happens on, so the un-throttled ceilings refuse it: measured, EVERY `--network slow-4g --cpu-throttle 4`
 *  run on `/` reported `app never signalled data-app-ready` inside the 10s budget — on the PROD build too,
 *  so it was never a dev-bundle fact. That reads as an app defect and is really the instrument declining
 *  the arm it advertises. Ceilings, not sleeps: a fast run never reaches them, and a throttled run that
 *  still misses 60s is a genuine finding about the surface.
 *
 *  A cold `--isolated` stage keeps its own (wider) nav budget — the two causes are independent, so the
 *  wider of the two applies rather than one overwriting the other. */
export function driveBudgets(opts: { readonly isolated: boolean; readonly cpuRate: number; readonly network: NetworkProfileName | null }): DriveBudgets {
  const throttled = opts.network !== null || opts.cpuRate > NO_CPU_THROTTLE;
  const nav = Math.max(opts.isolated ? STAGE_NAV_TIMEOUT_MS : NAV_TIMEOUT_MS, throttled ? THROTTLED_NAV_TIMEOUT_MS : 0);
  const ready = Math.max(opts.isolated ? STAGE_READY_TIMEOUT_MS : WAIT_SELECTOR_TIMEOUT_MS, throttled ? THROTTLED_READY_TIMEOUT_MS : 0);
  return { nav, ready };
}
