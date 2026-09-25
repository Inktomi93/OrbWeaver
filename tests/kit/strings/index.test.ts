import { formatBytes, groupThousands, nextFreeLabel } from "@orb/kit/strings";
import { expect, test } from "../../support/fixtures.ts";

// The three `escapeRegExp` tests died with the function (Node-26 program §4.7 — `RegExp.escape` owns
// the job now). They are NOT re-pointed at the platform: asserting V8's escape output would be a
// tautology test, and the literal-match invariant they guarded is exercised where it MATTERS — the
// consumers' own suites (`tests/kit/speaker-label/*`, `tests/kit/world-info/*`, the openai-compat
// credential scrub), which run real names/keys/secrets through the built regexes.

// `formatBytes` — the ONE human byte-size formatter (promoted from `@orb/ui/file-dropzone` +
// `features/databank` when the per-chat document rack became its third consumer). The boundaries are what
// matter: sub-KB stays whole, the step happens AT 1024, and every unit rounds to one decimal.
test("formatBytes keeps sub-KB sizes whole and steps units at 1024", () => {
  expect(formatBytes(0)).toBe("0 B");
  expect(formatBytes(1023)).toBe("1023 B");
  expect(formatBytes(1024)).toBe("1 KB");
});

test("formatBytes rounds to one decimal at every unit, and GB is the ceiling", () => {
  expect(formatBytes(25_088)).toBe("24.5 KB");
  expect(formatBytes(4_404_019)).toBe("4.2 MB");
  expect(formatBytes(3_328_599_655)).toBe("3.1 GB");
  // Past the last unit the number keeps growing rather than inventing a TB step.
  expect(formatBytes(2 * 1024 ** 4)).toBe("2048 GB");
});

// ── numeric boundaries (#1359) ──────────────────────────────────────────────────────────────────────
// Both formatters take a SERVER-SUPPLIED count (a byte size, a token/chunk tally). A non-finite value
// there is a bug upstream, and the pre-guard behaviour laundered it into a plausible-looking string
// ("NaN B", "Infinity GB", "-1024 B") that a reader cannot distinguish from a real measurement. The
// refusal is `RangeError`, matching `@orb/kit/bounded-ring`'s existing capacity guard — one family, one
// failure mode.

test("formatBytes REFUSES a non-finite or negative size rather than rendering it", () => {
  expect(() => formatBytes(Number.NaN)).toThrow(RangeError);
  expect(() => formatBytes(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  expect(() => formatBytes(-1)).toThrow(RangeError);
  // -1024 never entered the unit loop pre-guard and rendered "-1024 B".
  expect(() => formatBytes(-1024)).toThrow(RangeError);
});

test("groupThousands groups the INTEGER part only — a fraction is never chopped into triples", () => {
  // The defect: `1234.5678` grouped the fractional digits too and read "1,234.5,678".
  expect(groupThousands(1234.5678)).toBe("1,234.5678");
  expect(groupThousands(1_234_567.5)).toBe("1,234,567.5");
  expect(groupThousands(0.5)).toBe("0.5");
});

test("groupThousands groups plain and negative counts, and leaves short runs alone", () => {
  expect(groupThousands(1170)).toBe("1,170");
  expect(groupThousands(999)).toBe("999");
  expect(groupThousands(0)).toBe("0");
  expect(groupThousands(1_234_567)).toBe("1,234,567");
  // A delta is legitimately negative; the sign must not be grouped into the first triple.
  expect(groupThousands(-1234)).toBe("-1,234");
  expect(groupThousands(-999)).toBe("-999");
});

test("groupThousands REFUSES a non-finite count", () => {
  expect(() => groupThousands(Number.NaN)).toThrow(RangeError);
  expect(() => groupThousands(Number.POSITIVE_INFINITY)).toThrow(RangeError);
});

test("nextFreeLabel keeps a free base and skips every taken suffix", () => {
  expect(nextFreeLabel("default", [])).toBe("default");
  expect(nextFreeLabel("default", ["default"])).toBe("default (2)");
  expect(nextFreeLabel("default", ["default", "default (2)", "default (3)"])).toBe("default (4)");
  expect(nextFreeLabel("default", ["default (2)"])).toBe("default");
});
