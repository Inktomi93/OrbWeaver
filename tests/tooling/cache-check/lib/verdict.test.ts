// @instrument-proof: planted call pairs under the floor must FAIL. That includes the OpenRouter shape, where
// both calls agree on a system-only prefix, which a cached-share reference would read as 1.0. Pairs at or over
// the floor must PASS, and the worst pair in a multi-call case decides.
// @instrument-absence-proof: a call with no recorded usage, a prompt below the calibration prefix or the model's
// cache minimum, a case with one call, and a run whose every line is SKIPPED must never read as a clean verdict.
import process from "node:process";
import { printVerdictReceipt } from "@orb/tooling/_shared/evidence";
import type { CallUsage, CaseOutcome, CaseVerdict } from "@orb/tooling/cache-check";
import { CACHE_READ_FLOOR, exitFor, FLOOR_CALIBRATION, formatOutcome, judgeCase, runVerdict } from "@orb/tooling/cache-check";
import { vi } from "vitest";
import { EXIT } from "../../../../tooling/src/_shared/exit-contract.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const SONNET_CACHE_MIN = 1024;
// Prompt sizes from the live direct run on the resized fixture.
const LIVE_PROMPT = 18_584;
const SYSTEM_ONLY = 400;

function call(id: string, promptTokens: number | null, readTokens: number | null, writeTokens: number | null = 0): CallUsage {
  return { id, promptTokens, readTokens, writeTokens };
}

function judge(calls: readonly CallUsage[]): ReturnType<typeof judgeCase> {
  return judgeCase({ calls, floor: CACHE_READ_FLOOR, cacheMinTokens: SONNET_CACHE_MIN });
}

test("the floor is the calibration's kept share, and the calibration pair itself passes", () => {
  expect(CACHE_READ_FLOOR).toBeCloseTo(11_955 / 12_190, 10);
  const verdict = judge([call("prev", FLOOR_CALIBRATION.prefixTokens, 0), call("next", FLOOR_CALIBRATION.prefixTokens, FLOOR_CALIBRATION.keptTokens)]);
  expect(verdict.verdict).toBe("PASS");
});

test("one token under the floor fails and the floor itself passes", () => {
  const atFloor = Math.ceil(CACHE_READ_FLOOR * LIVE_PROMPT);
  expect(judge([call("prev", LIVE_PROMPT, 0), call("next", LIVE_PROMPT, atFloor)]).verdict).toBe("PASS");
  expect(judge([call("prev", LIVE_PROMPT, 0), call("next", LIVE_PROMPT, atFloor - 1)]).verdict).toBe("FAIL");
});

test("a pair that agrees on a system-only prefix fails against the whole prompt", () => {
  // The dropped-marker shape: the first call cached only the system block and the second read exactly that.
  const verdict = judge([call("gen-prev", LIVE_PROMPT, SYSTEM_ONLY, 0), call("gen-next", LIVE_PROMPT + 20, SYSTEM_ONLY, 20)]);
  expect(verdict).toMatchObject({ verdict: "FAIL", worst: { ratio: SYSTEM_ONLY / LIVE_PROMPT } });
});

test("a healthy pair passes with its ratio against the previous prompt", () => {
  const verdict = judge([call("msg_prev", 18_584, 0), call("msg_next", 18_610, 18_572, 27)]);
  expect(verdict).toMatchObject({ verdict: "PASS", worst: { ratio: 18_572 / 18_584 } });
});

test("the worst pair of a group case decides and every pair is kept for the report", () => {
  // The live round-boundary miss: the next round's first speaker read nothing of the previous round.
  const verdict = judge([
    call("r0-last", 18_796, 18_700),
    call("r1-first", 18_827, 0, 18_746),
    call("r1-second", 18_858, 18_746),
    call("r2-first", 18_897, 18_816),
  ]);
  expect(verdict.verdict).toBe("FAIL");
  if (!("worst" in verdict)) {
    throw new Error("a measured case must carry its pairs");
  }
  expect(verdict.worst.next.id).toBe("r1-first");
  expect(verdict.pairs.map((p) => p.next.id)).toEqual(["r1-first", "r1-second", "r2-first"]);
});

test.each([
  ["no prompt count", call("a", null, 10), "no usage recorded on a"],
  ["no read count", call("a", LIVE_PROMPT, null), "no usage recorded on a"],
  ["no write count", call("a", LIVE_PROMPT, 10, null), "no usage recorded on a"],
  ["a prompt below the calibration prefix", call("a", FLOOR_CALIBRATION.prefixTokens - 1, 0), "below the floor's calibration prefix"],
  ["a prompt below the cache minimum", call("a", SONNET_CACHE_MIN - 1, 0), "below the model's cache minimum"],
] as const)("a call with %s is an ERROR, never a verdict", (_label, bad, reason) => {
  const verdict = judge([call("ok", LIVE_PROMPT, 0), bad]);
  expect(verdict.verdict).toBe("ERROR");
  expect("reason" in verdict ? verdict.reason : "").toContain(reason);
});

test("a case with a single measured call cannot be judged", () => {
  expect(judge([call("only", LIVE_PROMPT, LIVE_PROMPT)])).toMatchObject({ verdict: "ERROR" });
  expect(judge([])).toMatchObject({ verdict: "ERROR" });
});

function outcome(verdict: CaseVerdict): CaseOutcome {
  if (verdict === "SKIPPED" || verdict === "ERROR") {
    return { route: "agent-sdk", case: "solo", verdict, reason: "planted" };
  }
  const pair = { prev: call("p", LIVE_PROMPT, 0), next: call("n", LIVE_PROMPT, LIVE_PROMPT), ratio: 1 };
  return { route: "direct", case: "solo", verdict, worst: pair, pairs: [pair], floor: CACHE_READ_FLOOR };
}

test.each([
  ["every line passes", ["PASS", "PASS"], 0, EXIT.clean],
  ["a skipped optional route", ["PASS", "SKIPPED"], 0, EXIT.clean],
  ["a failed case", ["PASS", "FAIL", "SKIPPED"], 0, EXIT.violations],
  ["an unmeasured case", ["PASS", "FAIL", "ERROR"], 0, EXIT.toolError],
  ["a probe row left behind", ["PASS"], 1, EXIT.toolError],
] as const)("the exit when %s", (_label, verdicts, leftovers, expected) => {
  expect(exitFor(verdicts.map(outcome), leftovers)).toBe(expected);
});

function receipt(outcomes: readonly CaseOutcome[]): { readonly exit: number; readonly stdout: string } {
  let stdout = "";
  const write = vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
    stdout += String(chunk);
    return true;
  }) as typeof process.stdout.write);
  try {
    return { exit: printVerdictReceipt("cache-check", runVerdict(outcomes, 0)).exit, stdout };
  } finally {
    write.mockRestore();
  }
}

test("a run whose every line was skipped is an instrument error, not a clean pass", () => {
  const result = receipt([outcome("SKIPPED"), outcome("SKIPPED")]);
  expect(result.exit).toBe(EXIT.toolError);
  expect(result.stdout).toContain("RESULT cache-check verdict=INSTRUMENT-ERROR pass=0 fail=0 skipped=2 error=0");
});

test("a run with one judged case and a skipped route is clean", () => {
  const result = receipt([outcome("PASS"), outcome("SKIPPED")]);
  expect(result.exit).toBe(EXIT.clean);
  expect(result.stdout).toContain("pass=1 fail=0 skipped=1 error=0");
  expect(result.stdout).toContain("judged=1");
});

test("a FAIL line names every judged pair beneath it; a SKIPPED line prints its reason", () => {
  const fail = judge([call("msg_a", LIVE_PROMPT, 0), call("msg_b", LIVE_PROMPT, 0)]);
  const lines = formatOutcome({ route: "direct", case: "group", ...fail });
  expect(lines[0]).toMatch(/^FAIL {4}direct {5}group {5}read=0 .* id=msg_b floor=0\.981 pairs=1$/u);
  expect(lines[1]).toContain("pair 1: read=0 write=0 prev-prompt=18584 ratio=0.000 prev=msg_a id=msg_b");
  expect(formatOutcome(outcome("SKIPPED"))).toEqual(["SKIPPED agent-sdk  solo      planted"]);
});
