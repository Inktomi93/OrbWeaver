import process from "node:process";
import { printVerdict } from "@orb/tooling/_shared/evidence";
import { vi } from "vitest";
import { EXIT } from "../../../tooling/src/_shared/exit-contract.ts";
import { expect, test } from "../../support/tool-fixtures.ts";

function capture(run: () => number): { readonly code: number; readonly stdout: string } {
  let stdout = "";
  const write = vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
    stdout += String(chunk);
    return true;
  }) as typeof process.stdout.write);
  try {
    return { code: run(), stdout };
  } finally {
    write.mockRestore();
  }
}

test("a clean verdict with no declared population is an instrument error", () => {
  const result = capture(() => printVerdict("fixture", { verdict: EXIT.clean, denominators: {}, pairs: [["findings", 0]] }));
  expect(result.code).toBe(EXIT.toolError);
  expect(result.stdout).toContain("INSTRUMENT ERROR");
  expect(result.stdout).toContain("RESULT fixture verdict=INSTRUMENT-ERROR findings=0");
});

test.each([
  ["absent", undefined],
  ["null", null],
  ["sentinel", -1],
  ["non-finite", Number.NaN],
] as const)("a clean verdict refuses an %s denominator", (_label, value) => {
  const result = capture(() =>
    printVerdict("fixture", {
      verdict: EXIT.clean,
      denominators: { scanned: { value, refuseWhen: "zero" } },
      pairs: [["findings", 0]],
    }),
  );
  expect(result.code).toBe(EXIT.toolError);
  expect(result.stdout).toContain("verdict=INSTRUMENT-ERROR");
});

test("zero, unstable, and below-floor policies refuse only clean verdicts", () => {
  const zero = capture(() =>
    printVerdict("fixture", {
      verdict: EXIT.clean,
      denominators: { scanned: { value: 0, refuseWhen: "zero" } },
      pairs: [],
    }),
  );
  const unstable = capture(() =>
    printVerdict("fixture", {
      verdict: EXIT.clean,
      denominators: { scanned: { value: -2, refuseWhen: "unstable" } },
      pairs: [],
    }),
  );
  const below = capture(() =>
    printVerdict("fixture", {
      verdict: EXIT.clean,
      denominators: { scanned: { value: 2, refuseWhen: "below", floor: 3 } },
      pairs: [],
    }),
  );
  const alreadyRed = capture(() =>
    printVerdict("fixture", {
      verdict: EXIT.violations,
      denominators: { scanned: { value: 0, refuseWhen: "zero" } },
      pairs: [["findings", 1]],
    }),
  );
  expect([zero.code, unstable.code, below.code]).toEqual([EXIT.toolError, EXIT.toolError, EXIT.toolError]);
  expect(alreadyRed.code).toBe(EXIT.violations);
  expect(alreadyRed.stdout).not.toContain("INSTRUMENT ERROR");
});

test("an explicitly reasoned honest empty stays clean and is said on the RESULT line", () => {
  const result = capture(() =>
    printVerdict("fixture", {
      verdict: EXIT.clean,
      denominators: {
        budgetedFrames: {
          value: 0,
          refuseWhen: "zero",
          honestEmpty: "all raw frames were classified into the sanctioned initialization arm",
        },
      },
      pairs: [["verdict", "PASS"]],
    }),
  );
  expect(result.code).toBe(EXIT.clean);
  expect(result.stdout).toContain("budgetedFrames=0");
  expect(result.stdout).toContain("honest-empty-budgetedFrames=all raw frames were classified");
});

test("the denominator declaration owns its RESULT value even when a caller repeats the key", () => {
  const result = capture(() =>
    printVerdict("fixture", {
      verdict: EXIT.clean,
      denominators: { scanned: { value: 7, refuseWhen: "zero" } },
      pairs: [
        ["findings", 0],
        ["scanned", 999],
      ],
    }),
  );
  expect(result.code).toBe(EXIT.clean);
  expect(result.stdout).toContain("findings=0 scanned=7");
  expect(result.stdout).not.toContain("scanned=999");
});
