// The PIPELINE DEBUGGER's model (REGX2) — the ordering + gate logic behind the panel.
//
// WHAT IS WORTH PINNING HERE, and what is not: the executor's own behaviour is pinned at
// tests/kit/regex/index.test.ts and must not be re-asserted; what belongs here is everything the DEBUGGER
// decides — the order stages run in, which gate skipped a script and therefore what the panel says, the
// text handed from one stage to the next, and where a NON-global subject sits in the union.
//
// The one claim that would be a tautology if it were checked any other way: the skip ladder mirrors
// `@orb/kit/regex`'s `skipsScript`. It is asserted here by OUTCOME (the executor produced no change AND the
// model named the reason), so a divergence between the two shows up as a stage that claims a reason while
// the engine would have run it.

import type { CreateRegexScriptInput, RegexScriptRow } from "@orb/contracts/regex";
import type { RegexScriptId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { runRegexPipeline } from "../../../../../packages/client/src/features/regex/lib/regex-pipeline.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const BASE = {
  findRegex: "quiet",
  replaceString: "LOUD",
  placement: ["AI_OUTPUT"],
  enabled: true,
  markdownOnly: false,
  promptOnly: false,
  runOnEdit: false,
  trimStrings: [],
  substituteRegex: 0,
} satisfies Omit<CreateRegexScriptInput, "name">;

function row(id: string, name: string, over: Partial<RegexScriptRow> = {}): RegexScriptRow {
  return { id: castId<RegexScriptId>(id), name, ...BASE, ...over } satisfies RegexScriptRow;
}

function subject(over: Partial<CreateRegexScriptInput> = {}): CreateRegexScriptInput {
  return { name: "strip ooc", ...BASE, findRegex: "\\(ooc\\)", replaceString: "", ...over } satisfies CreateRegexScriptInput;
}

const SAMPLE = "the quiet goblin says (ooc) hush";

describe("runRegexPipeline", () => {
  test("runs the global tier in its given order and feeds each stage the previous one's output", () => {
    const shout = row("s1", "shout");
    const cut = row("s2", "strip ooc", { findRegex: "\\(ooc\\)", replaceString: "" });
    const run = runRegexPipeline({ globals: [shout, cut], subject: subject(), subjectId: "s2", sample: SAMPLE, placement: "AI_OUTPUT" });

    expect(run.stages.map((s) => s.name)).toEqual(["shout", "strip ooc"]);
    expect(run.stages[0]?.before).toBe(SAMPLE);
    // The chain is real: stage 2's input is stage 1's output, not the original sample.
    expect(run.stages[1]?.before).toBe("the LOUD goblin says (ooc) hush");
    expect(run.output).toBe("the LOUD goblin says  hush");
    expect(run.subjectIsGlobal).toBe(true);
  });

  test("appends a NON-global subject after the tier — its true earliest position in the union", () => {
    const shout = row("s1", "shout");
    const run = runRegexPipeline({ globals: [shout], subject: subject(), subjectId: "s9", sample: SAMPLE, placement: "AI_OUTPUT" });

    expect(run.subjectIsGlobal).toBe(false);
    expect(run.stages.map((s) => s.name)).toEqual(["shout", "strip ooc"]);
    expect(run.stages.at(-1)?.isAppended).toBe(true);
    expect(run.stages.at(-1)?.isSubject).toBe(true);
    expect(run.output).toBe("the LOUD goblin says  hush");
  });

  test("runs the SUBJECT's stage from the live authored values, never the stored row", () => {
    // The stored row would replace with "LOUD"; the live subject replaces with "[cut]".
    const stored = row("s1", "strip ooc");
    const run = runRegexPipeline({
      globals: [stored],
      subject: subject({ findRegex: "quiet", replaceString: "[cut]" }),
      subjectId: "s1",
      sample: SAMPLE,
      placement: "AI_OUTPUT",
    });
    expect(run.output).toBe("the [cut] goblin says (ooc) hush");
  });

  // ── THE GATE LADDER, arm for arm against `@orb/kit/regex`'s `skipsScript` ────────────────────────────
  // Each case asserts BOTH halves: the reason the panel will print, and that the text really did pass
  // through untouched. A model that named a reason while the engine ran the script would fail the second.

  test.each([
    { why: "switched off", over: { enabled: false }, leg: "AI_OUTPUT", reason: "disabled" },
    { why: "not on this leg", over: {}, leg: "USER_INPUT", reason: "not-on-this-leg" },
    { why: "display-only on a prompt leg", over: { markdownOnly: true }, leg: "AI_OUTPUT", reason: "display-only" },
    { why: "prompt-only on DISPLAY", over: { promptOnly: true, placement: ["DISPLAY"] }, leg: "DISPLAY", reason: "prompt-only" },
  ] as const)("names the gate that skipped a script — $why", ({ over, leg, reason }) => {
    const run = runRegexPipeline({
      globals: [row("s1", "shout", over as Partial<RegexScriptRow>)],
      subject: subject({ placement: [] }),
      subjectId: "s9",
      sample: SAMPLE,
      placement: leg,
    });
    const stage = run.stages[0];
    expect(stage?.skipped).toBe(reason);
    expect(stage?.after).toBe(stage?.before);
    expect(stage?.matchCount).toBe(0);
  });

  test("reports a pattern that cannot compile, and carries the text on unchanged", () => {
    const run = runRegexPipeline({
      globals: [row("s1", "broken", { findRegex: "(unclosed" })],
      subject: subject({ placement: [] }),
      subjectId: "s9",
      sample: SAMPLE,
      placement: "AI_OUTPUT",
    });
    expect(run.stages[0]?.error).not.toBeNull();
    expect(run.stages[0]?.skipped).toBeNull();
    // Production's own posture: a failing script is reported and the next one runs on the text as-is.
    expect(run.output).toBe(SAMPLE);
  });

  test("a script that runs but does not match is NOT a skip — it is a zero-match stage", () => {
    const run = runRegexPipeline({
      globals: [row("s1", "shout", { findRegex: "nothinghere" })],
      subject: subject({ placement: [] }),
      subjectId: "s9",
      sample: SAMPLE,
      placement: "AI_OUTPUT",
    });
    expect(run.stages[0]?.skipped).toBeNull();
    expect(run.stages[0]?.matchCount).toBe(0);
  });

  test("`historyDepth` is INERT — the debugger passes no position, so a bound never half-applies", () => {
    // {min:3} would skip the three newest messages in a real assembled history. With no position supplied
    // the executor's gate cannot fire, so the script runs — which is what the panel says out loud.
    const scoped = row("s1", "deep", { placement: ["PROMPT_HISTORY"], historyDepth: { min: 3, max: null } });
    const run = runRegexPipeline({ globals: [scoped], subject: subject({ placement: [] }), subjectId: "s9", sample: SAMPLE, placement: "PROMPT_HISTORY" });
    expect(run.stages[0]?.skipped).toBeNull();
    expect(run.output).toBe("the LOUD goblin says (ooc) hush");
  });
});
