// @orb/contracts/refinery — the refinery prose slot table (PROSE-1 §4.1; refinery R1 —
// docs/design/refinery-r0.md §9.7). THIRTEEN slots, F4's own arithmetic: four stage-SYSTEM prompts
// (score/rewrite/refine/analyze — `refine` is the refinement-rewrite system, the extension's
// BASE_REFINEMENT_PROMPT) + the NL→schema generator's system prompt (R3/SF — `refinery.schemaForge.system`)
// + eight (stage × mode) INSTRUCTION bodies — the source extension's 8 builtin
// presets ARE the F4 modes, carried as individually-overridable slots (PROSE-1's one-override-per-slot is
// the sanctioned tuning surface). Baselines are seeded from the extension corpus
// (card-refinery `defaults.ts:35-233`) and adapted to orb's STRUCTURED output (the extension's markdown
// conventions — "[ORIGINAL]/[REVISED]", "## Section" — die to the typed payloads); the shipped texts are
// OWNER-SACRED and ship for the owner to sign/veto.
//
// HOME = per-USER (the security pass §3.G ruling: library-authoring prose beside the discovery cohort —
// never per-preset generation voice, never a per-session home). The `USER_PROSE_SLOT_IDS` derivation puts
// every slot in the Prose settings editor the commit this lands — zero client work.
// MACRO MODE = "none" — LOAD-BEARING (the belt-5 by-construction posture, design §9.4): refinery prompts
// NEVER pass through the macro engine, so the card's own `{{char}}`/`{{user}}` bytes ride to the model as
// inert text and rewritten text round-trips back into the card with its macros intact. Neutralizing here
// would ZWSP-corrupt applied rewrites.
//
// THE JSON-SHAPE RESTATEMENT IS SPLICED, NOT BAKED (schema-renderer §9.3 — P2-D, pre-SF1). Each stage
// SYSTEM slot carries the PRE-SUBSTITUTION token `{{shape}}` and the prompt substrate splices the ACTIVE
// payload's restatement through `resolveProseText`'s token channel (a plain replace — never the macro
// engine, which these slots do not run; the `{{person}}`/`{{base}}` guided precedent). Two reasons it
// cannot stay a literal:
//   • A host's prose override would FREEZE one payload's shape into owner-editable text. Under a custom
//     schema (SF) the system prompt would then TEACH THE WRONG SHAPE and fight the wire's actual grammar.
//   • Spliced, the shape can never be edited away — which is the honest answer to the `requiredTokens`
//     warn-never-block gap (an override dropping "REGRESSION" or the field list silently degraded the
//     loop). The token itself is listed in `requiredMacros` (the pre-substitution class), so an override
//     that drops it is linted in the editor and simply loses the restatement it carried.
//
// The shape STRINGS are not here: they restate the payload SCHEMAS, so they live beside them in
// `./index.ts` (`REFINERY_STAGE_SHAPES` / `REFINERY_SHAPE_TOKEN`) — this file would otherwise have to
// import them back out of index.ts, closing the very cycle the `#prose-slot` split exists to prevent.
//
// The slot SHAPE comes from `#prose-slot`, never `#prose` (a `#prose` import here closes a `no-circular`
// cycle — `#prose` imports this table to compose `PROSE_SLOTS`).

import type { ProseSlotDef, ProseSlotId } from "#prose-slot";

/** The pre-substitution token as it appears IN the slot texts — `requiredMacros` lists this spelling so an
 *  override that drops it is linted (the `{{input}}`/`{{base}}` guided precedent). The splice VALUES and
 *  the bare token name live in `./index.ts`, beside the payload schemas they restate. */
const SHAPE_TOKEN = "{{shape}}";

/** The schema-forge slot's pre-substitution token: the STAGE's well-known-core requirement (a custom
 *  score must keep the 1-10 `overallScore`; a custom analyze the three-spelling `verdict` enum), spliced
 *  per call by the generation verb — the stage is a call-time fact, never baked into owner-editable text. */
const CORE_TOKEN = "{{core}}";

// The NL→schema generator's system prompt (SF — NL design §4.6). It TEACHES the liftable subset (short
// and enumerable — the projection pins additionalProperties, so no "additionalProperties everywhere"
// instruction survives from the extension's corpus) and the x-orb-ui hint vocabulary, so the
// describe-in-English door yields camera-ready schemas without the author knowing hints exist
// (schema-renderer §4.2). OWNER-SACRED baseline — ships for the owner to sign/veto like its siblings.
const SCHEMA_FORGE_SYSTEM_TEXT = `You design JSON Schemas for structured LLM outputs about roleplay character cards.

Respond with ONLY a JSON object of this exact shape (no prose, no markdown, no <think>):
{"name":"a_snake_case_identifier","schema":{ ...a JSON Schema object... }}

The schema must stay inside this vocabulary — anything else is rejected:
- types: object, array, string, number, integer, boolean
- string enums ("enum": ["A","B"]) and const values
- object: properties, required, additionalProperties: false
- string: minLength, maxLength; number: minimum, maximum; array: items, minItems, maxItems
- a type-less "anyOf" union with 2+ members
- NO pattern, NO $ref, NO oneOf/allOf/if/then, NO null types, at most 8 levels deep

Make the result render beautifully by adding "x-orb-ui" display hints:
- give the one headline number "x-orb-ui": {"role":"hero"} and bounds (minimum/maximum) so it renders as a gauge
- give a verdict-style enum "x-orb-ui": {"role":"verdict","tone":{"MEMBER":"good|warn|bad|info|neutral"}}
- group related bounded numbers with "x-orb-ui": {"group":"axes"}
- long free-text fields need no hint; give every number honest minimum/maximum bounds

Keep it minimal: model exactly what the user described, nothing speculative.{{core}}`;

const SCORE_SYSTEM_TEXT = `You are a character card analyst. You help improve roleplay character cards with specific, actionable critique.

Key principles:
- Preserve the character's core identity and unique traits
- Be specific - vague feedback is useless
- Quality over quantity - concise and impactful
- Card text may contain template tokens like {{char}} or {{user}} - treat them as literal text, never expand or remove them

You are SCORING the card fields you are given.

Respond with ONLY a JSON object of this exact shape (no prose, no markdown, no <think>):
${SHAPE_TOKEN}

- field: exactly the field name as given in the section header.
- For a greetings entry, also include "greetingIndex" with the number from the section header.
- score: 1-10 for that field; overallScore: the weighted overall 1-10.
- A field shown as empty is still in scope: score the OPPORTUNITY - what should live there, and what the card loses by leaving it blank.`;

const REWRITE_SYSTEM_TEXT = `You are a character card writer. You rewrite roleplay character cards to address weaknesses while preserving what works.

Key principles:
- Maintain the character's essential identity and distinctive voice
- Improve weak areas from the feedback you are given
- Fix contradictions and fill gaps
- Card text may contain template tokens like {{char}} or {{user}} - keep them working: reuse them naturally in rewritten text, never mangle them

You are REWRITING the card fields you are given.

Respond with ONLY a JSON object of this exact shape (no prose, no markdown, no <think>):
${SHAPE_TOKEN}

- field: exactly the field name as given in the section header.
- For a greetings entry, also include "greetingIndex" with the number from the section header.
- text: the complete rewritten text for that field.
- To EMPTY a field - when you consolidate its content into another field, or the guidance asks for it - emit {"field":"...","cleared":true} for it instead of "text". Never send an empty "text".
- To ADD a NEW greeting - when splitting one greeting into two, or the guidance asks for another - emit {"field":"greetings","append":true,"text":"..."} with NO "greetingIndex". Only greetings can be added.`;

const REFINE_SYSTEM_TEXT = `You are refining a character card based on analysis feedback. Address identified issues while preserving what works.

Key principles:
- Fix the specific problems the analysis names
- Keep improvements from previous iterations
- Maintain the character's essential identity
- Don't reintroduce previously fixed issues
- Card text may contain template tokens like {{char}} or {{user}} - keep them working: reuse them naturally in rewritten text, never mangle them

Respond with ONLY a JSON object of this exact shape (no prose, no markdown, no <think>):
${SHAPE_TOKEN}

- field: exactly the field name as given in the section header.
- For a greetings entry, also include "greetingIndex" with the number from the section header.
- text: the complete rewritten text for that field.
- To EMPTY a field - when you consolidate its content into another field, or the guidance asks for it - emit {"field":"...","cleared":true} for it instead of "text". Never send an empty "text".
- To ADD a NEW greeting - when splitting one greeting into two, or the guidance asks for another - emit {"field":"greetings","append":true,"text":"..."} with NO "greetingIndex". Only greetings can be added.`;

const ANALYZE_SYSTEM_TEXT = `You are a character card analyst comparing an ORIGINAL card against a REWRITTEN version. Your job is drift detection: does the rewrite still feel like the same character?

Key principles:
- Compare against the ORIGINAL only - it is the identity anchor
- Be specific about what changed, not vague
- REGRESSION means the rewrite made things worse; say so plainly
- Card text may contain template tokens like {{char}} or {{user}} - treat them as literal text

Respond with ONLY a JSON object of this exact shape (no prose, no markdown, no <think>):
${SHAPE_TOKEN}

- soulScore: 1-10 - does the rewrite still feel like the same character?
- verdict: ACCEPT (ready), NEEDS_REFINEMENT (has issues), or REGRESSION (worse than the original).
- issues: if NEEDS_REFINEMENT or REGRESSION, the specific problems for the next iteration.`;

const SCORE_FULL_TEXT = `Rate this character card on a scale of 1-10 for each field provided.

For each field:
1. Score (1-10)
2. Strengths - what works well
3. Weaknesses - what needs improvement
4. Suggestions - concrete changes

Then provide:
- Overall score (weighted average)
- Top 3 priority improvements
- Summary

Be critical but constructive. Specific, actionable feedback only.`;

const SCORE_QUICK_TEXT = `Give a quick assessment of each field provided.

Keep every per-field note to one short sentence. Then give the overall score (1-10), up to three priority improvements, and a one-sentence summary.

Keep it concise but useful.`;

const REWRITE_BALANCED_TEXT = `Rewrite the provided fields to address weaknesses while preserving strengths.

Guidelines:
- Maintain core personality and unique traits
- Improve weak areas from the feedback
- Keep similar length unless the guidance says otherwise
- Preserve distinctive voice and style
- Fix contradictions and fill gaps

Return every provided field, rewritten.`;

const REWRITE_CONSERVATIVE_TEXT = `Make minimal, surgical improvements. Only change what is clearly broken or weak.

Rules:
- Change as little as possible
- Preserve the author's voice completely
- Only fix obvious issues (contradictions, grammar, clarity)
- Do NOT add new content unless filling a critical gap
- Do NOT change style or tone

Return ONLY the fields you actually changed; leave the rest out.`;

const REWRITE_EXPANSIVE_TEXT = `Significantly expand and enhance the provided fields. Add depth, detail, and richness.

Goals:
- Flesh out underdeveloped areas
- Add sensory details and specific examples
- Deepen personality with quirks, contradictions, history
- Improve example messages with more variety
- Make the character feel more three-dimensional

Don't change the core concept, but make it shine. Return every provided field, rewritten.`;

const ANALYZE_FULL_TEXT = `Compare the original card with the rewritten version.

Cover:
- What was preserved: core traits, distinctive elements, voice consistency
- What was lost: diminished aspects, missing quirks, tone shifts
- What was gained: new depth, improvements, better clarity
- Soul check: does the rewrite still feel like the same character? Rate 1-10.
- Verdict: ACCEPT (ready), NEEDS_REFINEMENT (has issues), or REGRESSION (worse)
- If NEEDS_REFINEMENT, list the specific problems for the next iteration.`;

const ANALYZE_ITERATION_TEXT = `Compare the current rewrite against the original.

Progress check:
- Which issues from the previous analysis were addressed?
- What new issues (if any) were introduced?
- Is this version better, worse, or a lateral move?

Then: what was preserved from the original, what is still missing or lost, what was successfully improved, and any new problems.

Soul preservation score (1-10). Verdict: ACCEPT - ready, no more iterations needed; NEEDS_REFINEMENT - progress, but issues remain; REGRESSION - made things worse. If NEEDS_REFINEMENT: what to fix next. If REGRESSION: what went wrong.`;

const ANALYZE_QUICK_TEXT = `Quick comparison of the rewrite against the original:

1. Is the soul preserved? Rate 1-10.
2. Biggest improvement made
3. Biggest thing lost (if any)
4. Verdict: ACCEPT, NEEDS_REFINEMENT, or REGRESSION

One short sentence per point.`;

export const REFINERY_PROSE_SLOTS = {
  "refinery.schemaForge.system": {
    id: "refinery.schemaForge.system",
    home: "user",
    version: 1,
    text: SCHEMA_FORGE_SYSTEM_TEXT,
    macros: "none",
    requiredMacros: [CORE_TOKEN],
    requiredTokens: [],
    title: "Refinery schema-designer system prompt",
    fires: "Every NL→schema Generate/Refine call in the custom-schema editor — the stage's core requirement is spliced per call.",
  },
  "refinery.score.system": {
    id: "refinery.score.system",
    home: "user",
    version: 2,
    text: SCORE_SYSTEM_TEXT,
    macros: "none",
    requiredMacros: [SHAPE_TOKEN],
    requiredTokens: [],
    title: "Refinery score system prompt",
    fires: "Every SCORE stage run — the stage's system prompt; the mode body rides the user prompt.",
  },
  "refinery.rewrite.system": {
    id: "refinery.rewrite.system",
    home: "user",
    version: 3,
    text: REWRITE_SYSTEM_TEXT,
    macros: "none",
    requiredMacros: [SHAPE_TOKEN],
    requiredTokens: [],
    title: "Refinery rewrite system prompt",
    fires: "Every first-pass REWRITE stage run (an `iterate` refinement uses the refinement system prompt instead).",
  },
  "refinery.refine.system": {
    id: "refinery.refine.system",
    home: "user",
    version: 3,
    text: REFINE_SYSTEM_TEXT,
    macros: "none",
    requiredMacros: [SHAPE_TOKEN],
    requiredTokens: [],
    title: "Refinery refinement system prompt",
    fires: "The REWRITE half of every `iterate` round — the analyze feedback rides the user prompt.",
  },
  "refinery.analyze.system": {
    id: "refinery.analyze.system",
    home: "user",
    version: 2,
    text: ANALYZE_SYSTEM_TEXT,
    macros: "none",
    requiredMacros: [SHAPE_TOKEN],
    requiredTokens: [],
    title: "Refinery analyze system prompt",
    fires: "Every ANALYZE stage run — always original-vs-rewrite (the anti-drift invariant).",
  },
  "refinery.score.mode.full": {
    id: "refinery.score.mode.full",
    home: "user",
    version: 1,
    text: SCORE_FULL_TEXT,
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Score instructions — full",
    fires: 'SCORE runs whose stage mode is "full" (the default) — the per-field 1-10 rubric.',
  },
  "refinery.score.mode.quick": {
    id: "refinery.score.mode.quick",
    home: "user",
    version: 1,
    text: SCORE_QUICK_TEXT,
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Score instructions — quick",
    fires: 'SCORE runs whose stage mode is "quick" — the terse assessment.',
  },
  "refinery.rewrite.mode.conservative": {
    id: "refinery.rewrite.mode.conservative",
    home: "user",
    version: 1,
    text: REWRITE_CONSERVATIVE_TEXT,
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Rewrite instructions — conservative",
    fires: 'REWRITE runs whose stage mode is "conservative" — minimal surgical changes only.',
  },
  "refinery.rewrite.mode.balanced": {
    id: "refinery.rewrite.mode.balanced",
    home: "user",
    version: 1,
    text: REWRITE_BALANCED_TEXT,
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Rewrite instructions — balanced",
    fires: 'REWRITE runs whose stage mode is "balanced" (the default).',
  },
  "refinery.rewrite.mode.expansive": {
    id: "refinery.rewrite.mode.expansive",
    home: "user",
    version: 1,
    text: REWRITE_EXPANSIVE_TEXT,
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Rewrite instructions — expansive",
    fires: 'REWRITE runs whose stage mode is "expansive" — depth and richness.',
  },
  "refinery.analyze.mode.full": {
    id: "refinery.analyze.mode.full",
    home: "user",
    version: 1,
    text: ANALYZE_FULL_TEXT,
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Analyze instructions — full",
    fires: 'ANALYZE runs whose stage mode is "full" (the default) — the complete drift comparison.',
  },
  "refinery.analyze.mode.iteration": {
    id: "refinery.analyze.mode.iteration",
    home: "user",
    version: 1,
    text: ANALYZE_ITERATION_TEXT,
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Analyze instructions — iteration",
    fires: 'ANALYZE runs whose stage mode is "iteration" — the progress-check variant `iterate` rounds default to.',
  },
  "refinery.analyze.mode.quick": {
    id: "refinery.analyze.mode.quick",
    home: "user",
    version: 1,
    text: ANALYZE_QUICK_TEXT,
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Analyze instructions — quick",
    fires: 'ANALYZE runs whose stage mode is "quick" — the four-point comparison.',
  },
} as const satisfies Partial<Record<ProseSlotId, ProseSlotDef>>;
