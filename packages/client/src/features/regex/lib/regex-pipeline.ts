// THE PIPELINE DEBUGGER's model (REGX2) — "what will my scripts do to this text, on this leg, in what
// order", as data. The panel over it is `../components/regex-pipeline-panel.tsx`.
//
// IT IS NOT THE TESTER, AND MUST NOT BE UNIFIED WITH IT. `regex-preview.ts`'s `previewRegexScript` answers
// "what does this find/replace DO" and deliberately NEUTRALISES the three run gates (enabled · placement ·
// the two tier masks) so a switched-off draft still previews — ST's test mode does the same. This module
// answers the opposite question, "what will ACTUALLY happen", so it honours every gate and reports the
// reason for each script that sits out. Both run through the SAME engine call
// (`runInstrumentedRegex`) — one executor, two questions.
//
// THE ORDER IS THE REAL ORDER, not a display convenience. `executeRegexScripts` applies its list in order and
// the chat turn's union is `global → preset → cast → chat`, deduped by row id (the resolver's own contract).
// So the stages below are: the owner's GLOBAL tier in its authored junction order, and then — only when the
// subject script is NOT itself global — the subject, appended. That is not a guess about where it would run:
// every scope that can attach it comes AFTER global in the union, so "after all of these" is its true
// earliest position. When the subject IS global it appears exactly once, in its own place.
//
// WHAT IT HONESTLY CANNOT SHOW, and the panel says so rather than implying otherwise:
//  · the preset / cast / room slices. A library surface has no room, no cast and no active preset, so the
//    scripts those scopes contribute are unknowable here.
//  · `historyDepth`. The gate needs a message's POSITION in an assembled history; a loose sample has none, so
//    the executor is called with no `depth` and the scope is inert (never half-applied).

import type { CreateRegexScriptInput, RegexScriptRow } from "@orb/contracts/regex";
import type { RegexPlacement, RegexScriptInput } from "@orb/kit/regex";
import { runInstrumentedRegex } from "./regex-preview.ts";

/** Why a script sat out this leg — the executor's own gates (`skipsScript`), in ITS order, named for a
 *  reader. `depth` is not among them: the debugger passes no position, so that gate never fires here.
 *
 *  The TUPLE is exported and the union is not (the `WORKLOAD_FILTERS` house shape): a consumer that needs
 *  the axis re-derives it — `Record<(typeof REGEX_SKIP_REASONS)[number], …>` — which is what makes a new
 *  member a tsc failure at every consumer instead of a silently-blank cell. */
export const REGEX_SKIP_REASONS = ["disabled", "not-on-this-leg", "display-only", "prompt-only"] as const;
type RegexSkipReason = (typeof REGEX_SKIP_REASONS)[number];

/** One stage of the run: the script, the text going in, the text coming out, and what the engine did. */
export interface RegexPipelineStage {
  /** Stable across a re-render (the row id, or `"draft"` for an unsaved subject) — the list's React key. */
  readonly key: string;
  readonly name: string;
  /** True for the script whose editor this panel sits under — the "you are here" mark. */
  readonly isSubject: boolean;
  /** True when the stage is the subject APPENDED after the global tier (it is not always-on; see header). */
  readonly isAppended: boolean;
  readonly before: string;
  readonly after: string;
  /** How many times the replacer fired. `0` with no error ⇒ valid pattern, no bite. */
  readonly matchCount: number;
  /** The executor's own failure message (invalid syntax, or the complexity cap), else `null`. */
  readonly error: string | null;
  /** `null` ⇒ the stage RAN. Otherwise the gate that skipped it, and `before === after`. */
  readonly skipped: RegexSkipReason | null;
}

export interface RegexPipelineRun {
  readonly stages: readonly RegexPipelineStage[];
  /** The text after every stage — what the leg hands on. */
  readonly output: string;
  /** True when the subject is in the owner's global tier (so it was not appended). */
  readonly subjectIsGlobal: boolean;
}

const DISPLAY: RegexPlacement = "DISPLAY";

/** THE GATE LADDER, mirroring `@orb/kit/regex`'s `skipsScript` arm for arm and in its order. It is written
 *  out rather than derived from the executor because the executor answers a BOOLEAN and this panel's whole
 *  job is the REASON — but any divergence is a defect: if a gate is ever added there, it is added here. */
function skipReasonFor(script: RegexScriptInput, placement: RegexPlacement): RegexSkipReason | null {
  if (!script.enabled) {
    return "disabled";
  }
  if (!script.placement.includes(placement)) {
    return "not-on-this-leg";
  }
  if (script.markdownOnly === true && placement !== DISPLAY) {
    return "display-only";
  }
  if (script.promptOnly === true && placement === DISPLAY) {
    return "prompt-only";
  }
  return null;
}

/** One script's stage. A skipped script still gets a stage — an omitted one would leave the reader asking
 *  where their script went, which is the exact question this panel exists to answer. */
function stageOf(
  entry: { readonly key: string; readonly name: string; readonly isSubject: boolean; readonly isAppended: boolean },
  script: RegexScriptInput,
  text: string,
  placement: RegexPlacement,
): RegexPipelineStage {
  const skipped = skipReasonFor(script, placement);
  if (skipped !== null) {
    return { ...entry, before: text, after: text, matchCount: 0, error: null, skipped };
  }
  const run = runInstrumentedRegex(script, text, placement);
  return { ...entry, before: text, after: run.output, matchCount: run.matchCount, error: run.error, skipped: null };
}

/** The subject as the executor reads it — the LIVE authored form values, so the pipeline moves with every
 *  keystroke exactly as the tester does. `historyDepth` is carried but inert (no `depth` is passed). */
function subjectInput(subject: CreateRegexScriptInput): RegexScriptInput {
  return subject;
}

export interface RunRegexPipelineArgs {
  /** The owner's GLOBAL tier, in junction order (`regex.listGlobal`'s answer, verbatim). */
  readonly globals: readonly RegexScriptRow[];
  /** The script being edited, as LIVE form values. */
  readonly subject: CreateRegexScriptInput;
  /** The subject's row id, or `null` while it has none — decides whether it is found in `globals`. */
  readonly subjectId: string | null;
  readonly sample: string;
  readonly placement: RegexPlacement;
}

/** Run the leg. Pure — safe to call in render, like the tester it sits beside. */
export function runRegexPipeline({ globals, subject, subjectId, sample, placement }: RunRegexPipelineArgs): RegexPipelineRun {
  const subjectIsGlobal = subjectId !== null && globals.some((row) => row.id === subjectId);
  const stages: RegexPipelineStage[] = [];
  let text = sample;

  for (const row of globals) {
    const isSubject = row.id === subjectId;
    // The SUBJECT's stage runs the LIVE form values, never the stored row: an unsaved edit that changes what
    // the pipeline does is the single most useful thing this panel can show.
    const input: RegexScriptInput = isSubject ? subjectInput(subject) : row;
    const stage = stageOf({ key: row.id, name: isSubject ? subject.name : row.name, isSubject, isAppended: false }, input, text, placement);
    stages.push(stage);
    text = stage.after;
  }

  if (!subjectIsGlobal) {
    const stage = stageOf({ key: subjectId ?? "draft", name: subject.name, isSubject: true, isAppended: true }, subjectInput(subject), text, placement);
    stages.push(stage);
    text = stage.after;
  }

  return { stages, output: text, subjectIsGlobal };
}
