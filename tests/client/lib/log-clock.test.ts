// The [trpc]/[perf] console channels' wall-clock tag: HH:MM:SS.mmm from LOCAL date parts, fully
// zero-padded. Determinism: the Date is injected (the ambient default is the sanctioned
// observability clock, exercised only for shape — not value — here).

import { logClock } from "@orb/client/lib";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures";

const CLOCK_RE = /^\d{2}:\d{2}:\d{2}\.\d{3}$/u;

describe("logClock", () => {
  test("formats local H/M/S/ms with full zero-padding", () => {
    // Local-part constructor → tz-independent expectations.
    expect(logClock(new Date(2026, 6, 4, 3, 4, 5, 6))).toBe("03:04:05.006");
    expect(logClock(new Date(2026, 6, 4, 23, 59, 59, 999))).toBe("23:59:59.999");
    expect(logClock(new Date(2026, 6, 4, 0, 0, 0, 0))).toBe("00:00:00.000");
  });

  test("the no-arg form yields the same HH:MM:SS.mmm shape (ambient clock, shape-only)", () => {
    expect(logClock()).toMatch(CLOCK_RE);
  });
});
