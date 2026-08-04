import { formatBytes } from "@orb/kit/strings";
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
