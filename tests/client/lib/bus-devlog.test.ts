// lib/bus-devlog — the duplicate-invalidate ALARM and its reset seam, armed in BOTH directions (#2399).
//
// The alarm is a claim about ONE app timeline: "this key was invalidated 3× inside 250ms". Its state is a
// module-level burst map, so it is honest only while every wave it counts came from the same event stream —
// and `tests/client/data/invalidation.test.ts` broke that premise, printing ~39 `⚠ … invalidated 3×` lines
// for fifteen independent scenarios driven ~3ms apart. `__resetBusDupBursts` is the fix, so this file pins
// the thing that MUST NOT change with it: the alarm still fires on a real burst, still stays silent at the
// commit+complete baseline of 2×, and still logs ONCE per burst rather than on every hit past the crossing.
import { __resetBusDupBursts, busDupCheck } from "@orb/client/lib";
import { describe, vi } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const KEY = "chat.listMessages";

/** The alarm lines only — `busDupCheck` logs nothing else, but keying on the marker keeps this honest if it
 *  ever shares the spy with another channel. */
function alarmLines(spy: { readonly mock: { readonly calls: readonly (readonly unknown[])[] } }): readonly string[] {
  return spy.mock.calls.map((call): string => String(call[0])).filter((line): boolean => line.includes("invalidated"));
}

describe("busDupCheck — the duplicate-invalidate alarm", () => {
  test("THE POSITIVE CONTROL: three same-key invalidations inside one window fire the alarm exactly once", () => {
    __resetBusDupBursts();
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    busDupCheck(KEY);
    busDupCheck(KEY);
    busDupCheck(KEY);
    // A 4th and 5th hit are the SAME storm — the crossing logs, the tail must not.
    busDupCheck(KEY);
    busDupCheck(KEY);

    const lines = alarmLines(info);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(`⚠ ${KEY} invalidated 3×`);
  });

  test("the commit+complete baseline (2× — messageCommitted then turnCompleted) is SILENT", () => {
    __resetBusDupBursts();
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    busDupCheck(KEY);
    busDupCheck(KEY);

    expect(alarmLines(info)).toEqual([]);
  });

  test("distinct keys never accumulate into one another's burst", () => {
    __resetBusDupBursts();
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    for (const key of [KEY, "chat.getChat", "persona", KEY, "chat.getChat", "persona"]) {
      busDupCheck(key);
    }

    expect(alarmLines(info)).toEqual([]);
  });

  test("THE NEGATIVE CONTROL: a reset between waves restarts the count — two waves of 2× stay silent", () => {
    __resetBusDupBursts();
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    busDupCheck(KEY);
    busDupCheck(KEY);
    __resetBusDupBursts();
    busDupCheck(KEY);
    busDupCheck(KEY);

    expect(alarmLines(info)).toEqual([]);
    // …and the very next same-key hit after the reset's own pair is still only the SECOND of that window,
    // so the alarm is delayed, never disarmed: one more hit fires it.
    busDupCheck(KEY);
    expect(alarmLines(info)).toHaveLength(1);
  });
});
