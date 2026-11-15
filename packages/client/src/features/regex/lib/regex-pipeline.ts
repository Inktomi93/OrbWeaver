// THE PIPELINE DEBUGGER's model (REGX2) — "what will my scripts do to this text, at this time, in what
// order", as data. The panel over it is `../components/regex-pipeline-panel.tsx`.
//
// IT IS NOT THE TESTER, AND MUST NOT BE UNIFIED WITH IT. `regex-preview.ts`'s `previewRegexScript` answers
// "what does this find/replace DO" and deliberately NEUTRALISES the run gates (enabled · passes · targets) so
// a switched-off draft still previews — ST's test mode does the same. This module
// answers the opposite question, "what will ACTUALLY happen", so it honours every gate and reports the
// reason for each script that sits out, read from the kit's own `regexSkipReason` so the panel can never name a
// gate the executor does not apply. Both run through the SAME engine call
// (`runInstrumentedRegex`, in the display-pass Worker) — one executor, two questions. The gate is read here, on the
// main thread, because it reads only the script and the call; only the scripts it admits go to the Worker.
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
import type { RegexScriptId } from "@orb/kit/ids";
import { NO_SEATS } from "@orb/kit/message-author";
import type {
  RegexPass,
  RegexPassCall,
  RegexPromptRowTarget,
  RegexRowStamps,
  RegexRowTarget,
  RegexScriptInput,
  RegexSkipReason,
  RegexTarget,
} from "@orb/kit/regex";
import { regexSkipReason } from "@orb/kit/regex";
import type { RegexPreviewEntry, RegexPreviewOutcome, RegexPreviewRequest } from "#lib";
import { PREVIEW_MACRO_CTX } from "./regex-preview.ts";

interface RegexPipelineEntry {
  readonly key: string;
  readonly name: string;
  readonly isSubject: boolean;
  readonly isAppended: boolean;
}

interface RegexPipelineStageBase extends RegexPipelineEntry {
  readonly before: string;
  readonly after: string;
}

/** What one stage did: sat out at the kit's gate, ran with the engine's match count and failure, was stopped at the
 *  Worker's deadline (this session, or on this run), or could not run because the browser could not start the Worker. */
export type RegexPipelineStage = RegexPipelineStageBase &
  (
    | { readonly status: "skipped"; readonly skipped: RegexSkipReason }
    | { readonly status: "ran"; readonly matchCount: number; readonly error: string | null }
    | { readonly status: "stopped" }
    | { readonly status: "unavailable" }
  );

export interface RegexPipelineRun {
  readonly stages: readonly RegexPipelineStage[];
  /** The text after every stage: what this time hands on. */
  readonly output: string;
  /** True when the subject is in the owner's global tier (so it was not appended). */
  readonly subjectIsGlobal: boolean;
}

/** The sample as a row: a plain message whose role follows its target, written by nobody a scope could name. */
function sampleRow(target: RegexRowTarget): RegexRowStamps {
  return { role: target === "USER_INPUT" ? "user" : "assistant", kind: "standard", authorUserId: null, characterId: null, personaId: null };
}

/** One text at one time, only as the kit reads them: world info only as the prompt is built, and reasoning never
 *  there, since the model's earlier reasoning goes back exactly as the provider signed it. */
export type RegexPipelinePair =
  | { readonly pass: "save"; readonly target: RegexRowTarget }
  | { readonly pass: "display"; readonly target: RegexRowTarget }
  | { readonly pass: "prompt"; readonly target: RegexPromptRowTarget | "WORLD_INFO" };

/** The pair for a picked time and text: picking a text the time does not read moves the time to one that reads it,
 *  so the panel never shows a pair the kit leaves unread. */
export function regexPipelinePair(pass: RegexPass, target: RegexTarget): RegexPipelinePair {
  if (target === "WORLD_INFO") {
    return { pass: "prompt", target };
  }
  if (pass === "save") {
    return { pass, target };
  }
  if (target === "REASONING" || pass === "display") {
    return { pass: "display", target };
  }
  return { pass, target };
}

/** The executor call for a pair. A save is a new message, never an edit; no call carries a depth. */
export function regexPipelineCall(pair: RegexPipelinePair): RegexPassCall {
  if (pair.pass === "save") {
    return { pass: "save", target: pair.target, edit: false };
  }
  // A library page has no room, so no seat holds a standing.
  if (pair.pass === "display") {
    return { pass: "display", target: pair.target, row: sampleRow(pair.target), room: NO_SEATS, depth: undefined };
  }
  const { target } = pair;
  return target === "WORLD_INFO"
    ? { pass: "prompt", target, depth: undefined }
    : { pass: "prompt", target, row: sampleRow(target), room: NO_SEATS, depth: undefined };
}

/** A script as the run reads it: without its author scope, which a loose sample cannot answer (the header). */
function withoutAuthorScope(script: RegexScriptInput): RegexScriptInput {
  const { authors: _authors, ...rest } = script;
  return rest;
}

/** One stage before the run: the kit's gate verdict, or the index of its entry in the Worker request. */
type PlannedStage = RegexPipelineEntry & ({ readonly skipped: RegexSkipReason } | { readonly skipped: null; readonly entry: number });

/** The run's plan: every stage in order, and the request carrying the stages the gate admits. */
export interface RegexPipelinePlan {
  readonly stages: readonly PlannedStage[];
  readonly request: RegexPreviewRequest;
  /** True when the subject is in the owner's global tier (so it was not appended). */
  readonly subjectIsGlobal: boolean;
}

export interface RunRegexPipelineArgs {
  /** The owner's GLOBAL tier, in junction order (`regex.listGlobal`'s answer, verbatim). */
  readonly globals: readonly RegexScriptRow[];
  /** The script being edited, as LIVE form values. */
  readonly subject: CreateRegexScriptInput;
  /** The subject's row id, or `null` while it has none — decides whether it is found in `globals`. */
  readonly subjectId: RegexScriptId | null;
  readonly sample: string;
  readonly call: RegexPassCall;
}

/** Plan one text at one time. A skipped script still gets a stage — an omitted one would leave the reader asking
 *  where their script went, which is the exact question this panel exists to answer. */
export function planRegexPipeline({ globals, subject, subjectId, sample, call }: RunRegexPipelineArgs): RegexPipelinePlan {
  const subjectIsGlobal = subjectId !== null && globals.some((row) => row.id === subjectId);
  const stages: PlannedStage[] = [];
  const entries: RegexPreviewEntry[] = [];
  const plan = (stage: RegexPipelineEntry, id: RegexScriptId | null, script: RegexScriptInput & { readonly name: string }): void => {
    const input = withoutAuthorScope(script);
    const skipped = regexSkipReason(input, call);
    if (skipped !== null) {
      stages.push({ ...stage, skipped });
      return;
    }
    stages.push({ ...stage, skipped: null, entry: entries.length });
    entries.push({ script: input, id, findRegex: script.findRegex, name: script.name });
  };

  for (const row of globals) {
    const isSubject = row.id === subjectId;
    // The SUBJECT's stage runs the LIVE form values, never the stored row: an unsaved edit that changes what
    // the pipeline does is the single most useful thing this panel can show.
    plan({ key: row.id, name: isSubject ? subject.name : row.name, isSubject, isAppended: false }, row.id, isSubject ? subject : row);
  }
  if (!subjectIsGlobal) {
    plan({ key: subjectId ?? "draft", name: subject.name, isSubject: true, isAppended: true }, subjectId, subject);
  }
  return { stages, request: { entries, text: sample, call, macroCtx: PREVIEW_MACRO_CTX }, subjectIsGlobal };
}

/** The run read off the Worker's outcomes, one per request entry, threading the text through every stage. */
export function regexPipelineRun(plan: RegexPipelinePlan, outcomes: readonly RegexPreviewOutcome[]): RegexPipelineRun {
  const stages: RegexPipelineStage[] = [];
  let text = plan.request.text;
  for (const planned of plan.stages) {
    const { skipped, ...entry } = planned;
    const before = text;
    if (skipped !== null) {
      stages.push({ ...entry, before, after: before, status: "skipped", skipped });
      continue;
    }
    const outcome = "entry" in planned ? outcomes[planned.entry] : undefined;
    if (outcome === undefined || outcome.kind !== "ran") {
      stages.push({ ...entry, before, after: before, status: outcome?.kind ?? "unavailable" });
      continue;
    }
    text = outcome.output;
    stages.push({ ...entry, before, after: text, status: "ran", matchCount: outcome.matchCount, error: outcome.error });
  }
  return { stages, output: text, subjectIsGlobal: plan.subjectIsGlobal };
}
