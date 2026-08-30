// The pure half of snap's load-emulation vocabulary (tooling/src/snap/lib/throttle.ts): the profile
// resolver, the RESULT-line spelling, and — the reason this file exists — the DRIVE BUDGETS a declared
// load arm is judged against (#836).
//
// THE LIE THIS PINS. `--network slow-4g` deliberately makes bytes arrive at 180 KB/s behind 562ms of
// added latency, and the drive still held that run to the un-throttled 10s readiness ceiling. Measured
// 2026-08-30 against a PROD build served off-band: `app never signalled data-app-ready` on every network
// run, which reads as an app defect and is really the instrument refusing the arm it advertises. The
// budgets now follow the arm, so a network receipt is reachable at all — and the dev-build limit that
// remains (447 requests, `page.goto` past 90s) is a real finding about the unbundled dev graph rather
// than a 10s stopwatch.
import { driveBudgets, NETWORK_PROFILES, parseNetworkProfile, throttleResultValue } from "../../../../tooling/src/snap/lib/throttle.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const UNTHROTTLED_READY_MS = 10_000;
const UNTHROTTLED_NAV_MS = 15_000;
const WIDE_READY_MS = 60_000;
const WIDE_NAV_MS = 90_000;

test("#836: an un-throttled live-base drive keeps the tight budgets", () => {
  expect(driveBudgets({ isolated: false, cpuRate: 1, network: null })).toEqual({ nav: UNTHROTTLED_NAV_MS, ready: UNTHROTTLED_READY_MS });
});

test("#836: a declared load arm widens BOTH budgets — either axis alone is enough", () => {
  // The network arm is the one that could not settle at all; the CPU arm is the same class of claim
  // (a 4x-throttled boot is deliberately slower) and must not be left holding the tight ceiling.
  expect(driveBudgets({ isolated: false, cpuRate: 1, network: "slow-4g" }), "a network profile widens the drive").toEqual({
    nav: WIDE_NAV_MS,
    ready: WIDE_READY_MS,
  });
  expect(driveBudgets({ isolated: false, cpuRate: 4, network: null }), "a CPU rate above 1x widens the drive").toEqual({
    nav: WIDE_NAV_MS,
    ready: WIDE_READY_MS,
  });
});

test("#836: the stage's cold-vite budget and the load arm are independent causes — the WIDER one wins", () => {
  // A cold stage already needed 90s/60s. Widening for a throttle must never NARROW it back.
  expect(driveBudgets({ isolated: true, cpuRate: 1, network: null })).toEqual({ nav: WIDE_NAV_MS, ready: WIDE_READY_MS });
  expect(driveBudgets({ isolated: true, cpuRate: 4, network: "slow-3g" })).toEqual({ nav: WIDE_NAV_MS, ready: WIDE_READY_MS });
});

test("the network vocabulary resolves DevTools' own names, aliases and refusals", () => {
  expect(parseNetworkProfile("Slow 4G"), "case and separators are normalised before lookup").toBe("slow-4g");
  expect(parseNetworkProfile("fast-3g"), "DevTools' retired name for Slow 4G is an alias, never a fifth condition").toBe("slow-4g");
  expect(parseNetworkProfile("2g"), "an unknown spelling REFUSES — a silently-ignored throttle reports an arm that never ran").toBeNull();
  expect(NETWORK_PROFILES["slow-4g"].downloadThroughput, "1.6 Mbps x 0.9 / 8 bits, straight from NetworkManager.ts").toBe(180_000);
});

test("the RESULT line states the arm every number in the run was measured under", () => {
  expect(throttleResultValue(1, null)).toBe("cpu:1x/net:live");
  expect(throttleResultValue(4, "slow-4g")).toBe("cpu:4x/net:slow-4g");
});
