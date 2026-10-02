import { fileStem, formatBytes, formatUsd, groupThousands, nextFreeLabel, nextFreeName, stripLabelSuffix, stripNameSuffix } from "@orb/kit/strings";
import { expect, test } from "../../support/fixtures.ts";

// The three `escapeRegExp` tests died with the function (Node-26 program §4.7 — `RegExp.escape` owns
// the job now). They are NOT re-pointed at the platform: asserting V8's escape output would be a
// tautology test, and the literal-match invariant they guarded is exercised where it MATTERS — the
// consumers' own suites (`tests/kit/speaker-label/*`, `tests/kit/world-info/*`, the openai-compat
// credential scrub), which run real names/keys/secrets through the built regexes.

// `formatUsd` — `null` is unrecorded and renders a dash, never `$0.00`. Below a cent the figure keeps four
// decimals: 50 model rows once all read `$0.00` against a $0.0377 total, because two decimals can only
// print zero there. An overspent balance keeps its sign outside the dollar mark.
test("formatUsd: unrecorded is a dash, a measured zero is $0.00, and two decimals from a cent up", () => {
  expect(formatUsd(null)).toBe("—");
  expect(formatUsd(0)).toBe("$0.00");
  expect(formatUsd(1.2)).toBe("$1.20");
  expect(formatUsd(0.01)).toBe("$0.01");
  expect(formatUsd(0.037_678_5)).toBe("$0.04");
});

test("formatUsd keeps four decimals below a cent and signs a negative outside the dollar mark", () => {
  expect(formatUsd(0.0001)).toBe("$0.0001");
  expect(formatUsd(0.0042)).toBe("$0.0042");
  expect(formatUsd(-1.2)).toBe("-$1.20");
  expect(() => formatUsd(Number.NaN)).toThrow(RangeError);
});

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

// A reader that recognises a minted label strips exactly the suffix nextFreeLabel adds, so the two cannot drift.
test("stripLabelSuffix undoes exactly the suffix nextFreeLabel adds", () => {
  const base = "OpenRouter · openai/gpt-4";
  for (const taken of [[], [base], [base, `${base} (2)`, `${base} (3)`]]) {
    expect(stripLabelSuffix(nextFreeLabel(base, taken))).toBe(base);
  }
  // A parenthesis that is part of the name, not a collision count, stays.
  expect(stripLabelSuffix("Local (vLLM)")).toBe("Local (vLLM)");
});

test("fileStem keeps the last segment minus its final extension, from either separator, and trims", () => {
  expect(fileStem("worlds/Harbor Town.json")).toBe("Harbor Town");
  expect(fileStem("C:\\profile\\themes\\Night.Dock.json")).toBe("Night.Dock");
  expect(fileStem(" plain ")).toBe("plain");
  expect(fileStem(".json")).toBe("");
});

test("nextFreeName: a free name passes through; a taken one takes the lowest free ' N' from 2, skipping gaps", () => {
  expect(nextFreeName("Default (edited)", ["Roleplay", "Default"])).toBe("Default (edited)");
  expect(nextFreeName("Adventures", new Set())).toBe("Adventures");
  expect(nextFreeName("Default (edited)", ["Default (edited)"])).toBe("Default (edited) 2");
  expect(nextFreeName("Adventures", new Set(["Adventures", "Adventures 2", "Adventures 3"]))).toBe("Adventures 4");
  // A deleted ordinal is reused while a higher one lives — the scan wants FREE, not count+1.
  expect(nextFreeName("Copy of X", ["Copy of X", "Copy of X 3"])).toBe("Copy of X 2");
  expect(nextFreeName("Adventures", new Set(["Adventures", "Adventures 2"]))).toBe("Adventures 3");
  // Collision is the exact name only — a shared prefix is not a collision.
  expect(nextFreeName("Default", ["Default (edited)", "Default 2 backup"])).toBe("Default");
});

test("stripNameSuffix removes only a trailing ' N' count", () => {
  expect(stripNameSuffix("Alex 2")).toBe("Alex");
  expect(stripNameSuffix("Alex")).toBe("Alex");
  expect(stripNameSuffix("Agent 47")).toBe("Agent");
  expect(stripNameSuffix("Alex 2 backup")).toBe("Alex 2 backup");
});
