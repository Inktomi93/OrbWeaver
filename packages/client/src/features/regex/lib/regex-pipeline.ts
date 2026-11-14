// THE PIPELINE DEBUGGER's model (REGX2) — "what will my scripts do to this text, at this time, in what
// order", as data. The panel over it is `../components/regex-pipeline-panel.tsx`.
//
// IT IS NOT THE TESTER, AND MUST NOT BE UNIFIED WITH IT. `regex-preview.ts`'s `previewRegexScript` answers
// "what does this find/replace DO" and deliberately NEUTRALISES the run gates (enabled · passes · targets) so
// a switched-off draft still previews — ST's test mode does the same. This module
// answers the opposite question, "what will ACTUALLY happen", so it honours every gate and reports the
// reason for each script that sits out, read from the kit's own `regexSkipReason` so the panel can never name a
// gate the executor does not apply. Both run through the SAME engine call
// (`runInstrumentedRegex`) — one executor, two questions.
//
// THE ORDER IS THE REAL ORDER, not a display convenience. `executeRegexScripts` applies its list in order and
// the chat turn's union is `global → preset → character → chat`, deduped by row id (the resolver's own contract).
// So the stages below are: the owner's GLOBAL tier in its authored junction order, and then — only when the
// subject script is NOT itself global — the subject, appended. That is not a guess about where it would run:
// every scope that can attach it comes AFTER global in the union, so "after all of these" is its true
// earliest position. When the subject IS global it appears exactly once, in its own place.
//
// WHAT IT HONESTLY CANNOT SHOW, and the panel says so rather than implying otherwise:
//  · the preset / character / room slices. A library surface has no room, no characters and no active preset, so the
//    scripts those scopes contribute are unknowable here.
//  · depth and the author scope. Both read a message's POSITION in a chat and who wrote it; a loose sample has
//    neither, so the call carries no depth and the scripts are run without their author scope: inert, never
//    half-applied.

import type { CreateRegexScriptInput, RegexScriptRow } from "@orb/contracts/regex";
import type { UserId } from "@orb/kit/ids";
import type { ParticipantRole, RoomStanding } from "@orb/kit/message-author";
import type { RegexPass, RegexPassCall, RegexRowStamps, RegexScriptInput, RegexSkipReason, RegexTarget } from "@orb/kit/regex";
import { regexSkipReason } from "@orb/kit/regex";
import { runInstrumentedRegex } from "./regex-preview.ts";

interface RegexPipelineStageBase {
  readonly key: string;
  readonly name: string;
  readonly isSubject: boolean;
  readonly isAppended: boolean;
  readonly before: string;
  readonly after: string;
}

/** Skipped stages do not execute; executed stages retain the engine's match count and failure. */
export type RegexPipelineStage = RegexPipelineStageBase &
  (
    | { readonly skipped: RegexSkipReason; readonly matchCount: 0; readonly error: null }
    | { readonly skipped: null; readonly matchCount: number; readonly error: string | null }
  );

export interface RegexPipelineRun {
  readonly stages: readonly RegexPipelineStage[];
  /** The text after every stage: what this time hands on. */
  readonly output: string;
  /** True when the subject is in the owner's global tier (so it was not appended). */
  readonly subjectIsGlobal: boolean;
}

/** A library page has no room, so no seat holds a standing. */
const NO_ROOM: RoomStanding = { seatedRoles: new Map<UserId, ParticipantRole>() };

/** The sample as a row: a plain message whose role follows its target, written by nobody a scope could name. */
function sampleRow(target: Exclude<RegexTarget, "WORLD_INFO">): RegexRowStamps {
  return { role: target === "USER_INPUT" ? "user" : "assistant", kind: "standard", authorUserId: null, characterId: null, personaId: null };
}

/** One text at one time. World info is read only as the prompt is built, so it pairs with the prompt pass alone. */
export type RegexPipelinePair =
  | { readonly pass: RegexPass; readonly target: Exclude<RegexTarget, "WORLD_INFO"> }
  | { readonly pass: "prompt"; readonly target: "WORLD_INFO" };

/** The pair for a picked time and text: picking world info moves the time to the prompt, the one pass that reads it. */
export function regexPipelinePair(pass: RegexPass, target: RegexTarget): RegexPipelinePair {
  return target === "WORLD_INFO" ? { pass: "prompt", target } : { pass, target };
}

/** The executor call for a pair. A save is a new message, never an edit; no call carries a depth. */
export function regexPipelineCall(pair: RegexPipelinePair): RegexPassCall {
  if (pair.target === "WORLD_INFO") {
    return { pass: "prompt", target: pair.target, depth: undefined };
  }
  if (pair.pass === "save") {
    return { pass: "save", target: pair.target, edit: false };
  }
  return { pass: pair.pass, target: pair.target, row: sampleRow(pair.target), room: NO_ROOM, depth: undefined };
}

/** A script as the run reads it: without its author scope, which a loose sample cannot answer (the header). */
function withoutAuthorScope(script: RegexScriptInput): RegexScriptInput {
  const { authors: _authors, ...rest } = script;
  return rest;
}

/** One script's stage. A skipped script still gets a stage — an omitted one would leave the reader asking
 *  where their script went, which is the exact question this panel exists to answer. */
function stageOf(
  entry: { readonly key: string; readonly name: string; readonly isSubject: boolean; readonly isAppended: boolean },
  script: RegexScriptInput,
  text: string,
  call: RegexPassCall,
): RegexPipelineStage {
  const input = withoutAuthorScope(script);
  const skipped = regexSkipReason(input, call);
  if (skipped !== null) {
    return { ...entry, before: text, after: text, matchCount: 0, error: null, skipped };
  }
  const run = runInstrumentedRegex(input, text, call);
  return { ...entry, before: text, after: run.output, matchCount: run.matchCount, error: run.error, skipped: null };
}

export interface RunRegexPipelineArgs {
  /** The owner's GLOBAL tier, in junction order (`regex.listGlobal`'s answer, verbatim). */
  readonly globals: readonly RegexScriptRow[];
  /** The script being edited, as LIVE form values. */
  readonly subject: CreateRegexScriptInput;
  /** The subject's row id, or `null` while it has none — decides whether it is found in `globals`. */
  readonly subjectId: string | null;
  readonly sample: string;
  readonly call: RegexPassCall;
}

/** Run one text at one time. Pure — safe to call in render, like the tester it sits beside. */
export function runRegexPipeline({ globals, subject, subjectId, sample, call }: RunRegexPipelineArgs): RegexPipelineRun {
  const subjectIsGlobal = subjectId !== null && globals.some((row) => row.id === subjectId);
  const stages: RegexPipelineStage[] = [];
  let text = sample;

  for (const row of globals) {
    const isSubject = row.id === subjectId;
    // The SUBJECT's stage runs the LIVE form values, never the stored row: an unsaved edit that changes what
    // the pipeline does is the single most useful thing this panel can show.
    const stage = stageOf({ key: row.id, name: isSubject ? subject.name : row.name, isSubject, isAppended: false }, isSubject ? subject : row, text, call);
    stages.push(stage);
    text = stage.after;
  }

  if (!subjectIsGlobal) {
    const stage = stageOf({ key: subjectId ?? "draft", name: subject.name, isSubject: true, isAppended: true }, subject, text, call);
    stages.push(stage);
    text = stage.after;
  }

  return { stages, output: text, subjectIsGlobal };
}
