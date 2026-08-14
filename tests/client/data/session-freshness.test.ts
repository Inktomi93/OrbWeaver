// The visibility probe (staleness-and-session-freshness.md §4.4.1) — the sensor that catches a session
// which dies while the tab is asleep. Everything it touches is injected, so the rules are asserted against
// a fake clock instead of a timing hope.
//
// The rules, and why each is load-bearing:
//   • FLOOR — a probe past 5 minutes only. Under the floor the cookie's slide is not due either, so a probe
//     would be pure traffic on every tab switch.
//   • HIDDEN — never. A background tab probing is polling with extra steps (§3.6 bans polling).
//   • UNREACHABLE ≠ DEAD — a thrown probe leaves the clock untouched and signals nothing. Signing a user
//     out because their wifi blinked is a worse defect than the one being fixed.

import { __resetSessionFreshness, markSessionFresh, sessionFreshnessAgeMs, startSessionFreshness } from "@orb/client/data";
import { describe, vi } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const FLOOR_MS = 300_000;
const START = 1_000_000;

interface Harness {
  readonly fire: () => void;
  readonly probes: () => number;
  readonly deaths: () => number;
  readonly stop: () => void;
  setNow: (at: number) => void;
  setVisible: (visible: boolean) => void;
  setAuthenticated: (authenticated: boolean | "unreachable") => void;
}

function harness(): Harness {
  let now = START;
  let visible = true;
  let verdict: boolean | "unreachable" = true;
  let probes = 0;
  let deaths = 0;
  let listener: (() => void) | null = null;

  const stop = startSessionFreshness({
    now: (): number => now,
    isVisible: (): boolean => visible,
    probe: (): Promise<boolean> => {
      probes += 1;
      return verdict === "unreachable" ? Promise.reject(new Error("server unreachable")) : Promise.resolve(verdict);
    },
    onDead: (): void => {
      deaths += 1;
    },
    subscribe: (next): (() => void) => {
      listener = next;
      return (): void => {
        listener = null;
      };
    },
  });

  return {
    fire: (): void => listener?.(),
    probes: (): number => probes,
    deaths: (): number => deaths,
    stop,
    setNow: (at): void => {
      now = at;
    },
    setVisible: (next): void => {
      visible = next;
    },
    setAuthenticated: (next): void => {
      verdict = next;
    },
  };
}

describe("session freshness clock", () => {
  test("age is measured from the last confirmation", () => {
    __resetSessionFreshness(START);
    expect(sessionFreshnessAgeMs(START + 1000)).toBe(1000);
    markSessionFresh(START + 900);
    expect(sessionFreshnessAgeMs(START + 1000)).toBe(100);
  });
});

describe("the visibility probe", () => {
  test("a visible edge UNDER the floor probes nothing", () => {
    __resetSessionFreshness(START);
    const h = harness();
    h.setNow(START + FLOOR_MS - 1);
    h.fire();
    // `probe()` is invoked SYNCHRONOUSLY inside the listener, so a zero here is settled, not a race.
    expect(h.probes()).toBe(0);
    h.stop();
  });

  test("a visible edge PAST the floor probes exactly once and re-confirms on success", async () => {
    __resetSessionFreshness(START);
    const h = harness();
    h.setNow(START + FLOOR_MS + 1);
    h.fire();
    expect(h.probes()).toBe(1);
    // Barrier: the confirmation lands in the probe's `.then`, and it resets the clock to `now`.
    await vi.waitFor(() => expect(sessionFreshnessAgeMs(START + FLOOR_MS + 1)).toBe(0));
    // …so a second edge in the same window costs nothing.
    h.fire();
    expect(h.probes()).toBe(1);
    expect(h.deaths()).toBe(0);
    h.stop();
  });

  test("a HIDDEN edge past the floor probes nothing", () => {
    __resetSessionFreshness(START);
    const h = harness();
    h.setNow(START + FLOOR_MS * 10);
    h.setVisible(false);
    h.fire();
    expect(h.probes()).toBe(0);
    h.stop();
  });

  test("a resolved `authenticated: false` hands off to the recovery ladder", async () => {
    __resetSessionFreshness(START);
    const h = harness();
    h.setAuthenticated(false);
    h.setNow(START + FLOOR_MS + 1);
    h.fire();
    await vi.waitFor(() => expect(h.deaths()).toBe(1));
    h.stop();
  });

  // The distinction the route guard also draws: a THROWN read is "server momentarily unreachable", never a
  // verdict. It must not sign anyone out, and it must leave the clock stale so the next edge retries.
  test("an UNREACHABLE probe signals no death and leaves the clock stale for a retry", async () => {
    __resetSessionFreshness(START);
    const h = harness();
    h.setAuthenticated("unreachable");
    h.setNow(START + FLOOR_MS + 1);
    h.fire();
    expect(h.probes()).toBe(1);
    // Barrier: the rejection's handler clears the in-flight latch, which is what lets the retry through.
    await vi.waitFor(() => {
      h.fire();
      expect(h.probes()).toBe(2);
    });
    expect(h.deaths()).toBe(0);
    h.stop();
  });

  test("teardown unsubscribes — a torn-down shell never probes", () => {
    __resetSessionFreshness(START);
    const h = harness();
    h.stop();
    h.setNow(START + FLOOR_MS * 10);
    h.fire();
    expect(h.probes()).toBe(0);
  });
});
