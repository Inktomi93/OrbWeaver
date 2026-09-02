// The console-error ring (#1095) — the browser-failure capture the bug-report bundle reads. Driven through
// `recordConsoleError`, the module's own seam, because the three EVENTS that feed it in a browser
// (`console.error`, `error`, `unhandledrejection`) are not reproducible in a node lane; the install wiring is
// covered where it can be, by the bridge CT.
//
// The pins that matter are the HONESTY ones: wall-clock stamps (the window filter compares against them), the
// eviction TALLY (a capped ring that does not count its drops reads complete), and the read returning a COPY
// (the bundle holds what it read, not what the ring became).

import { beforeEach, describe } from "vitest";
// A RELATIVE import, not the `#lib` barrel: this ring is deliberately NOT re-exported there (it is a dev
// instrument the bridge installs — the `motion-flaggers.ts` rule), and the barrel is what a prod bundle pulls.
import { __resetConsoleErrors, consoleErrorRing, recordConsoleError } from "../../../packages/client/src/lib/console-error-ring.ts";
import { expect, test } from "../../support/fixtures.ts";

/** 2020-01-01. The stamp assertions below are about the ring's CLOCK CHOICE, not about "now": an epoch stamp
 *  is far past this, while the `performance.now()` OFFSET the motion rings record is a handful of seconds. A
 *  fixed floor says exactly that and asks the ambient clock nothing (`test-determinism`). */
const EPOCH_FLOOR_MS = 1_577_836_800_000;

describe("console-error ring", () => {
  beforeEach(() => {
    __resetConsoleErrors();
  });

  test("records the message, the source and a WALL-CLOCK stamp (epoch, not a performance offset)", () => {
    recordConsoleError("console", ["boom", 42]);
    const { records } = consoleErrorRing();
    expect(records).toHaveLength(1);
    expect(records[0]?.source).toBe("console");
    expect(records[0]?.text).toBe("boom 42");
    // The whole reason this ring is window-filterable: an offset here would compare as 1970 against a window
    // stated in wall-clock minutes, and every entry would silently fall outside every ask.
    expect(records[0]?.at).toBeGreaterThan(EPOCH_FLOOR_MS);
  });

  test("lifts the stack off an Error argument and names it", () => {
    const error = new Error("kaboom");
    recordConsoleError("uncaught", [error]);
    const record = consoleErrorRing().records[0];
    expect(record?.text).toBe("Error: kaboom");
    expect(record?.stack).toContain("kaboom");
  });

  test("an unserializable argument degrades to a label instead of throwing", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic["self"] = cyclic;
    expect(() => recordConsoleError("console", [cyclic])).not.toThrow();
    expect(consoleErrorRing().records[0]?.text).toBe("[unserializable]");
  });

  test("a rejection with a non-Error reason still records", () => {
    recordConsoleError("rejection", ["not an Error"]);
    expect(consoleErrorRing().records[0]).toMatchObject({ source: "rejection", text: "not an Error" });
  });

  test("the CAP evicts oldest-first and TALLIES the drops — a truncated ring never reads complete", () => {
    const { cap } = consoleErrorRing();
    for (let i = 0; i < cap + 5; i += 1) {
      recordConsoleError("console", [`error ${String(i)}`]);
    }
    const ring = consoleErrorRing();
    expect(ring.records).toHaveLength(cap);
    expect(ring.dropped).toBe(5);
    // Oldest-first eviction: the first five are gone, the newest survives.
    expect(ring.records[0]?.text).toBe("error 5");
    expect(ring.records.at(-1)?.text).toBe(`error ${String(cap + 4)}`);
  });

  test("the read returns a COPY — a later record cannot mutate an already-taken snapshot", () => {
    recordConsoleError("console", ["first"]);
    const taken = consoleErrorRing().records;
    recordConsoleError("console", ["second"]);
    expect(taken).toHaveLength(1);
    expect(consoleErrorRing().records).toHaveLength(2);
  });

  test("reset clears the records AND the drop tally", () => {
    const { cap } = consoleErrorRing();
    for (let i = 0; i < cap + 3; i += 1) {
      recordConsoleError("console", ["x"]);
    }
    expect(consoleErrorRing().dropped).toBe(3);
    __resetConsoleErrors();
    expect(consoleErrorRing()).toMatchObject({ records: [], dropped: 0 });
  });
});
