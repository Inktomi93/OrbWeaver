// assembly/history-regex — the EPHEMERAL `PROMPT_HISTORY` leg, as a pure function. Pins the four things
// the leg promises: the DEPTH FRAME (0 = newest, counting backwards — the ST semantic), INPUT IMMUTABILITY
// (the rows it is handed are never touched, which is what keeps the transform off every persisted plane),
// the EVICTION cap (a failing script costs one watchdog window per BUILD, not one per message — the ReDoS
// posture in the module header), and the byte-identical fast path.
//
// The macro ORDER on this leg (D121-E) is pinned at the real seam in `history-regex.int.test.ts`, where the
// row's own macros have actually been resolved by `toShapeCanon` before the leg runs.

import type { ProcessMacroOptions } from "@orb/kit/macro";
import type { RegexScriptInput } from "@orb/kit/regex";
import { HISTORY_DEPTH_PLACEMENT } from "@orb/kit/regex";
import { vi } from "vitest";
import { applyPromptHistoryRegex } from "../../../../../packages/server/src/domain/chat/assembly/history-regex.ts";
import type { PromptHistoryRegexEnv } from "../../../../../packages/server/src/domain/chat/contract/regex.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const MACRO_CTX: ProcessMacroOptions = { char: "Aria", user: "Alex", persona: "", scenario: "", env: {} };

function script(partial: Partial<RegexScriptInput> = {}): RegexScriptInput {
  return {
    enabled: true,
    placement: [HISTORY_DEPTH_PLACEMENT],
    findRegex: "secret",
    replaceString: "[cut]",
    ...partial,
  };
}

function env(scripts: readonly RegexScriptInput[], onScriptFailure = vi.fn()): PromptHistoryRegexEnv {
  return {
    scripts,
    macroCtx: MACRO_CTX,
    // The server injects a node:vm-sandboxed replace here; the plain native one is the same seam.
    applyReplace: (text, regex, replacer): string => text.replace(regex, replacer),
    onScriptFailure,
  };
}

/** Four rows in canon order (oldest first) — so `rows[3]` is depth 0. */
const ROWS = [
  { role: "user" as const, content: "0 secret" },
  { role: "assistant" as const, content: "1 secret" },
  { role: "user" as const, content: "2 secret" },
  { role: "assistant" as const, content: "3 secret" },
];

const contents = (rows: readonly { content: string }[]): string[] => rows.map((r) => r.content);

test("depth counts BACKWARDS from the newest row: {min:0,max:0} rewrites only the last message", () => {
  const out = applyPromptHistoryRegex(ROWS, env([script({ historyDepth: { min: 0, max: 0 } })]));
  expect(contents(out)).toEqual(["0 secret", "1 secret", "2 secret", "3 [cut]"]);
});

test("a floor reaches only the OLDER rows; an unbounded scope reaches all of them", () => {
  const floored = applyPromptHistoryRegex(ROWS, env([script({ historyDepth: { min: 2, max: null } })]));
  expect(contents(floored)).toEqual(["0 [cut]", "1 [cut]", "2 secret", "3 secret"]);
  const whole = applyPromptHistoryRegex(ROWS, env([script({ historyDepth: { min: 0, max: null } })]));
  expect(contents(whole)).toEqual(["0 [cut]", "1 [cut]", "2 [cut]", "3 [cut]"]);
});

test("a mid-history window rewrites exactly its band", () => {
  const out = applyPromptHistoryRegex(ROWS, env([script({ historyDepth: { min: 1, max: 2 } })]));
  expect(contents(out)).toEqual(["0 secret", "1 [cut]", "2 [cut]", "3 secret"]);
});

// THE EPHEMERALITY MECHANISM, at the unit tier: the leg can only ever reach a persisted plane by MUTATING
// the rows it was handed (nothing writes its return value anywhere but the wire). It does not.
test("the input rows and their objects are never mutated — the leg returns copies", () => {
  const rows = ROWS.map((r) => ({ ...r }));
  const before = structuredClone(rows);
  const out = applyPromptHistoryRegex(rows, env([script({ historyDepth: { min: 0, max: null } })]));
  expect(rows).toEqual(before);
  expect(out[0]).not.toBe(rows[0]);
  expect(contents(out)).not.toEqual(contents(rows));
});

test("with no script on this leg the ORIGINAL array comes back — byte- and allocation-identical", () => {
  const rows = [...ROWS];
  // Wrong placement, and switched-off-on-the-right-placement: both are no-ops without a copy.
  expect(applyPromptHistoryRegex(rows, env([script({ placement: ["AI_OUTPUT"] })]))).toBe(rows);
  expect(applyPromptHistoryRegex(rows, env([script({ enabled: false, historyDepth: { min: 0, max: null } })]))).toBe(rows);
  expect(applyPromptHistoryRegex(rows, env([]))).toBe(rows);
});

// THE REDOS CAP. A history-wide pass is the only leg where one bad pattern could be paid for N times; the
// eviction rule makes the history LENGTH stop being a multiplier.
test("a failing script is EVICTED for the rest of the build — one report, not one per message", () => {
  const onScriptFailure = vi.fn();
  const bad = script({ findRegex: "(" }); // never compiles
  const out = applyPromptHistoryRegex(ROWS, env([bad], onScriptFailure));
  expect(onScriptFailure).toHaveBeenCalledTimes(1);
  expect(contents(out)).toEqual(contents(ROWS));
});

test("eviction is per-script: a healthy script keeps running on every row after a sibling fails", () => {
  const onScriptFailure = vi.fn();
  const out = applyPromptHistoryRegex(ROWS, env([script({ findRegex: "(" }), script({ historyDepth: { min: 0, max: null } })], onScriptFailure));
  expect(onScriptFailure).toHaveBeenCalledTimes(1);
  expect(contents(out)).toEqual(["0 [cut]", "1 [cut]", "2 [cut]", "3 [cut]"]);
});

test("the replacement TEMPLATE is macro-resolved while captured history text splices VERBATIM (D121-E)", () => {
  const rows = [{ content: "he said {{setvar::owned::true}} loudly" }];
  const out = applyPromptHistoryRegex(
    rows,
    env([script({ findRegex: "said (.+?) loudly", replaceString: "{{user}} heard $1", historyDepth: { min: 0, max: null } })]),
  );
  // `{{user}}` in the template resolved; the captured `{{setvar}}` came through as text and was never evaluated.
  expect(out[0]?.content).toBe("he Alex heard {{setvar::owned::true}}");
  expect(MACRO_CTX.env).toEqual({});
});

test("every replace runs through the injected watchdog seam", () => {
  const applyReplace = vi.fn((text: string, regex: RegExp, replacer: Parameters<PromptHistoryRegexEnv["applyReplace"]>[2]): string =>
    text.replace(regex, replacer),
  );
  applyPromptHistoryRegex(ROWS, { ...env([script({ historyDepth: { min: 0, max: null } })]), applyReplace });
  expect(applyReplace).toHaveBeenCalledTimes(ROWS.length);
});
