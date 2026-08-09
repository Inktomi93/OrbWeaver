// domain/refinery/substrate/refine-prompt — PURE prompt assembly (zero I/O). The extension's prompt
// discipline carried as design (study §1.2): system slot / mode instructions / card sections / context
// (score results; analyze feedback when refining) / guidance — CONCATENATED, never token-spliced.
//
// BELT 5 BY CONSTRUCTION (design §9.4, coordinator-approved): NOTHING here touches the macro engine and
// nothing downstream of `summarize` does either — the card's own `{{char}}`/`{{user}}` bytes reach the
// model VERBATIM as inert text (the distill precedent), and a rewritten field round-trips back into the
// card with its macros intact. `neutralizeMacros` here would ZWSP-corrupt applied rewrites (the model
// echoes the split braces; `applyFields` writes them into canon; the card's macros die at chat time).
// The substrate test pins BOTH drift directions: a seeded `{{char}}` reaches the assembled prompt
// unresolved AND un-neutralized. Do not "harden" this file with either without re-reading the ruling.
//
// ANTI-DRIFT: `buildAnalyzePrompt` takes the session's ORIGINAL card as its comparison anchor — never a
// previous rewrite (a steered rewrite must not bootstrap itself across iterations). The rewrite stage
// works on the WORKING card (original overlaid with the latest rewrite) so iteration converges, while
// analyze always judges against the start-of-session snapshot.

import type { CharacterCard } from "@orb/contracts/character";
import type { ProseSlotId } from "@orb/contracts/prose";
import { resolveProseText } from "@orb/contracts/prose";
import type {
  RefinableField,
  RefineryAnalyzeMode,
  RefineryAnalyzePayload,
  RefineryRewriteMode,
  RefineryRewritePayload,
  RefineryScoreMode,
  RefineryScorePayload,
  RefinerySelection,
  RefineryStage,
} from "@orb/contracts/refinery";
import { isAppendedRewrite, isClearedRewrite, REFINABLE_FIELDS, REFINERY_SHAPE_TOKEN, REFINERY_STAGE_SHAPES } from "@orb/contracts/refinery";
import type { AnalyzePromptArgs, RewritePromptArgs, ScorePromptArgs, StagePrompts } from "../contract/prompts.ts";

// ── (stage, mode) → slot id — exhaustive mapped Records (spine §7.5; a new mode member fails tsc) ───────

const SCORE_MODE_SLOTS: Record<RefineryScoreMode, ProseSlotId> = {
  full: "refinery.score.mode.full",
  quick: "refinery.score.mode.quick",
};
const REWRITE_MODE_SLOTS: Record<RefineryRewriteMode, ProseSlotId> = {
  conservative: "refinery.rewrite.mode.conservative",
  balanced: "refinery.rewrite.mode.balanced",
  expansive: "refinery.rewrite.mode.expansive",
};
const ANALYZE_MODE_SLOTS: Record<RefineryAnalyzeMode, ProseSlotId> = {
  full: "refinery.analyze.mode.full",
  iteration: "refinery.analyze.mode.iteration",
  quick: "refinery.analyze.mode.quick",
};

/** Which greetings a selection names: absent indexes ⇒ every greeting (contracts law). */
function selectedGreetingIndexes(card: CharacterCard, selection: RefinerySelection): number[] {
  if (!selection.fields.includes("greetings")) {
    return [];
  }
  const all = card.greetings.map((_, i) => i);
  const named = selection.greetingIndexes;
  return named === undefined ? all : named.filter((i) => i < card.greetings.length);
}

/** One field's prose out of the card, or null when the card has none to offer. */
function fieldTextOf(card: CharacterCard, field: Exclude<RefinableField, "greetings">): string | null {
  switch (field) {
    case "description":
      return card.description;
    case "personality":
      return card.personality;
    case "scenario":
      return card.scenario;
    case "exampleMessages":
      return card.exampleMessages;
    case "systemPrompt":
      return card.systemPrompt;
    case "postHistoryInstructions":
      return card.postHistoryInstructions;
    case "depthPrompt":
      return card.depthPrompt?.prompt ?? null;
    case "creatorNotes":
      return card.creatorNotes;
    default:
      return assertNeverField(field);
  }
}

function assertNeverField(field: never): never {
  throw new Error(`unreachable refinable field: ${String(field)}`);
}

/** What a SELECTED-but-empty field renders as. EMPTINESS IS A STATE, NOT AN ABSENCE (schema-renderer §7c):
 *  before this, an empty selected field was silently omitted, so the model could not tell "scenario is
 *  blank" from "scenario was never in scope" — score never saw the hole, and a fill-empty rewrite could
 *  only happen if the model VOLUNTEERED an entry for a field it had never been shown (unpromptable yet
 *  applicable — an incoherent seam). The score system slot teaches this line as a scoreable OPPORTUNITY. */
const EMPTY_SECTION_TEXT = "(this field is empty)";

/** The SELECTED card fields as `## field` sections (greetings per index: `## greetings[i]`) — the shape
 *  the system slots teach the model to echo back as `field`/`greetingIndex`. Card bytes VERBATIM (header).
 *  The fence is SELECTION, never emptiness: every selected target gets a section, empty or not, and an
 *  unselected one never appears. */
export function buildCardSections(card: CharacterCard, selection: RefinerySelection): string {
  const parts: string[] = [`Name: ${card.name}`];
  for (const field of selection.fields) {
    if (field === "greetings") {
      for (const i of selectedGreetingIndexes(card, selection)) {
        const text = card.greetings[i]?.text ?? "";
        parts.push(`## greetings[${i}]\n${text.length > 0 ? text : EMPTY_SECTION_TEXT}`);
      }
      continue;
    }
    const text = fieldTextOf(card, field);
    parts.push(`## ${field}\n${text !== null && text.length > 0 ? text : EMPTY_SECTION_TEXT}`);
  }
  return parts.join("\n\n");
}

/** The WORKING card — the original overlaid with a rewrite payload's fields (greetings per index). The
 *  rewrite stage reads this so a refinement round refines the latest rewrite; `applyFields` uses the
 *  same overlay against the LIVE card with the accept-intersected entries. */
export function overlayRewrite(card: CharacterCard, rewrite: RefineryRewritePayload): CharacterCard {
  let out: CharacterCard = card;
  for (const entry of rewrite.fields) {
    if (isAppendedRewrite(entry)) {
      // The F-T1 append arm — analyze must judge the card the apply would PRODUCE, which has one more
      // greeting at the tail. (The apply belts may still refuse it at the ceiling; the overlay is the
      // optimistic view, exactly as it is for an unaddressable index below.)
      out = { ...out, greetings: [...out.greetings, { text: entry.text }] };
      continue;
    }
    if (entry.field === "greetings") {
      if (entry.greetingIndex === undefined || entry.greetingIndex >= out.greetings.length) {
        continue; // unaddressable — the apply belt itemizes these; the prompt overlay just skips.
      }
      const at = entry.greetingIndex;
      // A cleared greeting is a slot REMOVAL, not a blank slot (schema-renderer §15.2) — the analyze side
      // must see the card the apply would actually produce.
      const greetings = isClearedRewrite(entry)
        ? out.greetings.filter((_, i) => i !== at)
        : out.greetings.map((g, i) => (i === at ? { ...g, text: entry.text } : g));
      out = { ...out, greetings };
      continue;
    }
    out = overlayField(out, entry.field, isClearedRewrite(entry) ? null : entry.text);
  }
  return out;
}

/** `text: null` = the field is EMPTIED (the cleared arm). Every card field here is nullable, so the
 *  overlay speaks one spelling of empty; the apply verb owns the `description` write-wire asymmetry. */
function overlayField(card: CharacterCard, field: Exclude<RefinableField, "greetings">, text: string | null): CharacterCard {
  switch (field) {
    case "description":
      return { ...card, description: text };
    case "personality":
      return { ...card, personality: text };
    case "scenario":
      return { ...card, scenario: text };
    case "exampleMessages":
      return { ...card, exampleMessages: text };
    case "systemPrompt":
      return { ...card, systemPrompt: text };
    case "postHistoryInstructions":
      return { ...card, postHistoryInstructions: text };
    case "depthPrompt":
      // Clearing drops the note AND its authored `{depth, role}` directive together — a dangling directive
      // is the degenerate state. A card with NO note has nothing to hang a rewrite on, so the overlay
      // leaves it untouched (mirroring the apply belt's `not_applicable` drop).
      if (text === null) {
        return { ...card, depthPrompt: null };
      }
      return card.depthPrompt === null ? card : { ...card, depthPrompt: { ...card.depthPrompt, prompt: text } };
    case "creatorNotes":
      return { ...card, creatorNotes: text };
    default:
      return assertNeverField(field);
  }
}

/** A session's born selection — every refinable field the card actually populates (study §5.3). */
export function defaultSelectionOf(card: CharacterCard): RefinerySelection {
  const fields = REFINABLE_FIELDS.filter((field) => {
    if (field === "greetings") {
      return card.greetings.some((g) => g.text.length > 0);
    }
    const text = fieldTextOf(card, field);
    return text !== null && text.length > 0;
  });
  return { fields };
}

/** Render a score payload as rewrite-context text (per-field critique + priorities) — OUR OWN prior
 *  output, not card bytes; rendered compactly so the rewrite grounds on it. */
function renderScoreContext(score: RefineryScorePayload): string {
  const lines = score.fieldScores.map((f) => {
    const target = f.greetingIndex === undefined ? f.field : `${f.field}[${f.greetingIndex}]`;
    return `- ${target} (${f.score}/10): weaknesses: ${f.weaknesses} | suggestions: ${f.suggestions}`;
  });
  return [`Score results (overall ${score.overallScore}/10):`, ...lines, `Priority improvements: ${score.priorityImprovements.join("; ")}`].join("\n");
}

/** Render analyze feedback as refinement-context text (issues + recommendations + the verdict). */
function renderAnalyzeFeedback(analyze: RefineryAnalyzePayload): string {
  return [
    `Previous analysis verdict: ${analyze.verdict} (soul ${analyze.soulScore}/10).`,
    analyze.issues.length > 0 ? `Issues to address:\n${analyze.issues.map((i) => `- ${i}`).join("\n")}` : "",
    analyze.recommendations.length > 0 ? `Recommendations:\n${analyze.recommendations.map((r) => `- ${r}`).join("\n")}` : "",
  ]
    .filter((s) => s.length > 0)
    .join("\n");
}

const GUIDANCE_HEADER = "User guidance (apply to every stage):";
const SECTION_JOIN = "\n\n---\n\n";

/** The stage-SYSTEM slot's `{{shape}}` splice (schema-renderer §9.3): the JSON restatement is engine-fed,
 *  never baked into the owner-editable text, so a host override keeps an honest shape and the SF custom
 *  arm has exactly one seam to change — `shapeText` IS that seam: a custom run splices its own projected
 *  schema (labeled as a schema) in place of the fixed arm's example instance. A plain pre-substitution
 *  replace — these slots are `macros:"none"` and never enter the macro engine (belt 5). */
function shapeTokens(stage: RefineryStage, shapeText?: string): Record<string, string> {
  return { [REFINERY_SHAPE_TOKEN]: shapeText ?? REFINERY_STAGE_SHAPES[stage] };
}

/** The custom arm's `{{shape}}` text — the projected JSON Schema itself, labeled so the model knows it is
 *  reading a schema, not an example (the recorded R3 default; build plan §7.5). */
export function customShapeTextOf(projected: Record<string, unknown>): string {
  return `a JSON object matching this JSON Schema:\n${JSON.stringify(projected)}`;
}

/** The custom arm's instruction floor — read when the schema's own description is empty. */
const CUSTOM_INSTRUCTION_FALLBACK = "Produce the structured assessment the response schema describes, grounded in the card fields you are given.";

/** The instruction body: the fixed arm's mode slot, or the custom arm's authored description. */
function instructionOf(modeSlot: ProseSlotId | null, customInstruction: string | undefined, overrides: ScorePromptArgs["overrides"]): string {
  if (modeSlot !== null) {
    return resolveProseText(modeSlot, overrides);
  }
  const authored = customInstruction?.trim() ?? "";
  return authored.length > 0 ? authored : CUSTOM_INSTRUCTION_FALLBACK;
}

export function buildScorePrompt({ card, selection, mode, guidance, overrides, customInstruction, shapeText }: ScorePromptArgs): StagePrompts {
  const parts = [instructionOf(mode === null ? null : SCORE_MODE_SLOTS[mode], customInstruction, overrides), buildCardSections(card, selection)];
  if (guidance !== null && guidance.length > 0) {
    parts.push(`${GUIDANCE_HEADER}\n${guidance}`);
  }
  return { system: resolveProseText("refinery.score.system", overrides, shapeTokens("score", shapeText)), user: parts.join(SECTION_JOIN) };
}

export function buildRewritePrompt({ card, selection, mode, guidance, overrides, score, analyzeFeedback }: RewritePromptArgs): StagePrompts {
  const parts = [resolveProseText(REWRITE_MODE_SLOTS[mode], overrides), buildCardSections(card, selection)];
  if (score !== null) {
    parts.push(renderScoreContext(score));
  }
  if (analyzeFeedback !== null) {
    parts.push(renderAnalyzeFeedback(analyzeFeedback));
  }
  if (guidance !== null && guidance.length > 0) {
    parts.push(`${GUIDANCE_HEADER}\n${guidance}`);
  }
  const systemSlot: ProseSlotId = analyzeFeedback === null ? "refinery.rewrite.system" : "refinery.refine.system";
  // Both rewrite system slots restate the SAME payload — the refinement round produces a rewrite too.
  return { system: resolveProseText(systemSlot, overrides, shapeTokens("rewrite")), user: parts.join(SECTION_JOIN) };
}

export function buildAnalyzePrompt({
  originalCard,
  selection,
  mode,
  guidance,
  overrides,
  rewrite,
  customInstruction,
  shapeText,
}: AnalyzePromptArgs): StagePrompts {
  const rewritten = overlayRewrite(originalCard, rewrite);
  const parts = [
    instructionOf(mode === null ? null : ANALYZE_MODE_SLOTS[mode], customInstruction, overrides),
    `# ORIGINAL\n\n${buildCardSections(originalCard, selection)}`,
    `# REWRITTEN\n\n${buildCardSections(rewritten, selection)}`,
  ];
  if (guidance !== null && guidance.length > 0) {
    parts.push(`${GUIDANCE_HEADER}\n${guidance}`);
  }
  return { system: resolveProseText("refinery.analyze.system", overrides, shapeTokens("analyze", shapeText)), user: parts.join(SECTION_JOIN) };
}
