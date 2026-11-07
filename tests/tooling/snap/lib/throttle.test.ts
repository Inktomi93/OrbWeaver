// The pure half of snap's load-emulation vocabulary (tooling/src/snap/lib/throttle.ts): the profile resolver, the
// RESULT-line spelling, and the drive budgets a declared load arm is judged against.

import { expect, test } from "@orb/testkit/tooling";
import { SNAP_CEILINGS_MS } from "../../../../tooling/src/snap/lib/budgets.ts";
import { driveBudgets, NETWORK_PROFILES, parseNetworkProfile, throttleResultValue } from "../../../../tooling/src/snap/lib/throttle.ts";

// Every ceiling distinct, and the stage and throttled pairs ordered opposite ways, so each budget names the one
// ceiling that produced it. The shipped stage and throttled bases are equal, which hides which side won.
const CEILINGS = { nav: 1, waitSelector: 2, stageNav: 30, stageReady: 7, throttledNav: 20, throttledReady: 9 } as const;

test("an un-throttled live-base drive keeps the tight budgets", () => {
  expect(driveBudgets({ isolated: false, cpuRate: 1, network: null }, CEILINGS)).toEqual({ nav: CEILINGS.nav, ready: CEILINGS.waitSelector });
  // With no ceilings passed, the drive reads the ones this process loaded.
  expect(driveBudgets({ isolated: false, cpuRate: 1, network: null })).toEqual({ nav: SNAP_CEILINGS_MS.nav, ready: SNAP_CEILINGS_MS.waitSelector });
});

test("a declared load arm widens both budgets, and either axis alone is enough", () => {
  // A throttled boot is deliberately slower, so holding it to the tight ceiling refuses the arm it asked for.
  const throttled = { nav: CEILINGS.throttledNav, ready: CEILINGS.throttledReady };
  expect(driveBudgets({ isolated: false, cpuRate: 1, network: "slow-4g" }, CEILINGS), "a network profile widens the drive").toEqual(throttled);
  expect(driveBudgets({ isolated: false, cpuRate: 4, network: null }, CEILINGS), "a CPU rate above 1x widens the drive").toEqual(throttled);
});

test("the stage's cold-vite budget and the load arm are independent causes, and the wider one wins on each axis", () => {
  expect(driveBudgets({ isolated: true, cpuRate: 1, network: null }, CEILINGS)).toEqual({ nav: CEILINGS.stageNav, ready: CEILINGS.stageReady });
  // Stage wins nav and the throttle wins ready, so preferring either cause outright fails one axis.
  expect(driveBudgets({ isolated: true, cpuRate: 4, network: "slow-3g" }, CEILINGS)).toEqual({ nav: CEILINGS.stageNav, ready: CEILINGS.throttledReady });
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
