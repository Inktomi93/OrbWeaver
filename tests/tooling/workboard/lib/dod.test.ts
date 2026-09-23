// The pure half of the Definition-of-Done engine (#923): fence
// build/extract/upsert, the pairing stamp, and the mint-time spelling guards. The CRLF pins are the
// load-bearing ones — GitHub returns issue bodies with \r\n, so a stamp computed over \n that failed to
// normalize at read time would false-mismatch EVERY close and the whole gate would read as rot.
import {
  appendDodBlock,
  buildDodBlock,
  dodStamp,
  extractDod,
  normalizeIssueBody,
  upsertDodBlock,
  validateDodCommand,
} from "../../../../tooling/src/workboard/lib/dod.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const CMD = "pnpm test:scoped tests/x.test.ts --maxWorkers=4";

test("a built block round-trips through extract, and CRLF bodies stamp-match a \\n mint", () => {
  const body = `intro prose\n\n${buildDodBlock(CMD)}\n\ntrailing prose`;
  expect(extractDod(body)).toBe(CMD);
  // GitHub's wire shape: the same body with \r\n line endings extracts the SAME command, so the stamp
  // minted from the \n spelling still matches at close time.
  const crlf = body.replaceAll("\n", "\r\n");
  expect(extractDod(crlf)).toBe(CMD);
  expect(dodStamp(extractDod(crlf) ?? "")).toBe(dodStamp(CMD));
  expect(normalizeIssueBody(crlf)).toBe(body);
});

test("extract is two-sided: no block is null, two blocks refuse, an empty block refuses", () => {
  expect(extractDod("a body with no bar")).toBe(null);
  expect(() => extractDod(`${buildDodBlock("exit 1")}\n\n${buildDodBlock("exit 2")}`)).toThrow("more than one");
  expect(() => extractDod("```dod\n\n```")).toThrow("empty");
  // GitHub's empty-optional-form marker reads as ABSENT (#923 P5) — a form-filed row with a blank DoD
  // textarea must stay closable, and upsert still REPLACES that fence instead of appending a second.
  expect(extractDod("```dod\n_No response_\n```")).toBe(null);
  const replaced = upsertDodBlock("```dod\n_No response_\n```", "exit 1");
  expect(extractDod(replaced)).toBe("exit 1");
  expect(replaced.match(/```dod/gu) ?? []).toHaveLength(1);
});

test("upsert replaces the one existing block in place and appends when none exists", () => {
  const appended = appendDodBlock("owner brief text", CMD);
  expect(appended).toContain("owner brief text");
  expect(extractDod(appended)).toBe(CMD);
  const replaced = upsertDodBlock(appended, "exit 3");
  expect(extractDod(replaced)).toBe("exit 3");
  expect(replaced).toContain("owner brief text");
  // Replacement, not accumulation: exactly one fence remains.
  expect(replaced.match(/```dod/gu) ?? []).toHaveLength(1);
  expect(extractDod(upsertDodBlock("bare body", "exit 4"))).toBe("exit 4");
});

test("the stamp is stable, prefixed, and command-sensitive", () => {
  expect(dodStamp(CMD)).toBe(dodStamp(CMD));
  expect(dodStamp(CMD)).toMatch(/^sha256:[0-9a-f]{16}$/u);
  expect(dodStamp(CMD)).not.toBe(dodStamp("other command"));
});

test("validate refuses an unusable bar at parse: empty, fence-breaking, npx-spelled", () => {
  expect(() => validateDodCommand("   ")).toThrow("must not be empty");
  expect(() => validateDodCommand("echo '```dod'")).toThrow("must not contain");
  expect(() => validateDodCommand("npx vitest run tests/x.test.ts")).toThrow("must not invoke npx");
  expect(() => validateDodCommand("cd x && npx playwright test")).toThrow("must not invoke npx");
  // The sanctioned spellings pass, including names that merely CONTAIN the letters.
  expect(validateDodCommand("pnpm exec vitest run tests/x.test.ts")).toBe("pnpm exec vitest run tests/x.test.ts");
  expect(validateDodCommand("run-npx-shim --check")).toBe("run-npx-shim --check");
});
