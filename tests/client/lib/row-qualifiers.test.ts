// The list-wide action-name disambiguator. The load-bearing arms are the COLLISIONS — the reason the
// qualifier stopped being a per-row derivation: eight forks minted in the same hour all show "9h ago", and a
// character's chat projection is N rows titled "Azarael" whose newest few all show "2h", so the per-row form
// produced N identical accessible names. The escalation must fire ONLY on the collided rows (a longer stamp
// everywhere is noise), and it must terminate even when two rows are identical to the millisecond.

import { rowQualifiers } from "@orb/client/lib";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures";

const HOUR = 3_600_000;
const MINUTE = 60_000;
const NOW = 1_750_000_000_000;

/** The shown stamp: hour-resolution, exactly like `formatRelative`'s "9h ago" — the form that collides. */
function stamp(at: number): string {
  return `${Math.floor((NOW - at) / HOUR)}h ago`;
}
/** The escalation: minute-resolution absolute, standing in for `formatDateTime`. */
function absolute(at: number): string {
  return `Jul 3, 2026, ${Math.floor((NOW - at) / MINUTE)}m`;
}

describe("rowQualifiers", () => {
  test("distinct rows keep the SHORT shown stamp — no escalation where none is needed", () => {
    const rows = [
      { name: "Default (edited)", at: NOW - HOUR },
      { name: "Default (edited)", at: NOW - 9 * HOUR },
    ];
    expect(rowQualifiers(rows, stamp, absolute)).toEqual(["1h ago", "9h ago"]);
  });

  test("a SAME-NAME + SAME-STAMP collision escalates to the absolute form (the 8 same-hour forks)", () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ name: "Default (edited)", at: NOW - 9 * HOUR - i * MINUTE }));
    const qualifiers = rowQualifiers(rows, stamp, absolute);

    // All eight showed "9h ago" — none of them keeps it, and all eight are now distinct.
    expect(qualifiers).not.toContain("9h ago");
    expect(new Set(qualifiers).size).toBe(8);
    expect(qualifiers[0]).toBe(absolute(rows[0]?.at ?? 0));
  });

  test("only the COLLIDED rows escalate — an already-distinct neighbour keeps its short stamp", () => {
    const rows = [
      { name: "Default (edited)", at: NOW - 9 * HOUR },
      { name: "Default (edited)", at: NOW - 9 * HOUR - 5 * MINUTE },
      { name: "A grand adventure", at: NOW - 9 * HOUR },
    ];
    const qualifiers = rowQualifiers(rows, stamp, absolute);

    // The third row shares the STAMP but not the name, so its action name was never ambiguous.
    expect(qualifiers[2]).toBe("9h ago");
    expect(qualifiers[0]).not.toBe(qualifiers[1]);
  });

  test("rows identical to the millisecond fall back to an ORDINAL (the escalation always terminates)", () => {
    const rows = [
      { name: "Azarael", at: NOW - 2 * HOUR },
      { name: "Azarael", at: NOW - 2 * HOUR },
      { name: "Azarael", at: NOW - 2 * HOUR },
    ];
    const qualifiers = rowQualifiers(rows, stamp, absolute);

    expect(new Set(qualifiers).size).toBe(3);
    // The ordinal is the row's place in the list the reader is walking, appended to what it already shows.
    expect(qualifiers).toEqual([`${absolute(NOW - 2 * HOUR)} · #1`, `${absolute(NOW - 2 * HOUR)} · #2`, `${absolute(NOW - 2 * HOUR)} · #3`]);
  });

  test("qualifiers come back IN LIST ORDER (result[i] belongs to rows[i])", () => {
    const rows = [
      { name: "B", at: NOW - 3 * HOUR },
      { name: "A", at: NOW - HOUR },
    ];
    expect(rowQualifiers(rows, stamp, absolute)).toEqual(["3h ago", "1h ago"]);
  });

  test("an empty list is an empty result (no surface has to guard the zero-row case)", () => {
    expect(rowQualifiers([], stamp, absolute)).toEqual([]);
  });
});
