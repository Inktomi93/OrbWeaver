// @orb/contracts/discovery — the discovery prose slot table (PROSE-1 §4.1). The three WHOLE system prompts
// the library-semantics side generations run under: the compare narrative, the ask-a-card answer, and the
// card distillation. Each is a substitution-free `systemPrompt:` argument — the caller's grounding data all
// rides the USER prompt — so all three are clean `text` slots with no §4.5 template machinery.
//
// These were the last model-facing prose in the tree with NO catalog entry at all (the inline-template scout,
// 08-02): `analyze.ts` / `distill.ts` carried them as file-local template literals and never imported the
// resolver. Homing them here is what makes the registry's completeness arm true.
//
// HOME = per-USER, resolved against the CALLER — the card owner whose library is being analyzed (the
// `resolveUserPresetParams` / imagery `resolvePromptTemplate` precedent, NOT the room-host rule: a distill
// or a compare is one human's request about their own library, never a room-level side generation). The
// whole-library batch distill has no single owner, so it resolves `{}` ⇒ the shipped defaults, exactly as
// its sampling rung already degrades.
// MACRO MODE = "none": the prompts run over a facet diff / a card / recent scenes, not a character context.
//
// Each default carries a literal JSON-shape contract (`{"summary":…}`) that `runStructuredTurn` validates
// against the zod payload. That shape is listed in `requiredTokens`: a host who edits it away still gets a
// parse (the structured-output `responseFormat` is the real constraint) but loses the in-prompt restatement
// that weak models lean on — a warn, never a block, like every other required token.
//
// The slot SHAPE comes from `#prose-slot`, never `#prose` (a `#prose` import here closes a `no-circular`
// cycle — `#prose` imports this table to compose `PROSE_SLOTS`).

import type { ProseSlotDef, ProseSlotId } from "#prose-slot";

const COMPARE_SYSTEM_TEXT = `You compare two roleplay characters for a user browsing their own library. You are given a precomputed facet diff (genres, tones, shared vs distinct tags). Ground your read in ONLY that diff — do not invent traits.

Respond with ONLY a JSON object of this exact shape (no prose, no markdown, no <think>):
{"summary":"...","overlap":"...","distinction":"..."}

- summary: ONE sentence — how alike these two are overall.
- overlap: what they genuinely share (from the shared genre/tone/tags).
- distinction: what sets them apart (from the distinct tags + differing genre/tone).`;

const ASK_SYSTEM_TEXT = `You answer a user's question about ONE of their roleplay characters, using ONLY the recent scenes provided. Do not invent facts not present in the scenes.

Respond with ONLY a JSON object of this exact shape (no prose, no markdown, no <think>):
{"answer":"...","grounded":true}

- answer: a direct answer to the question, drawn from the scenes.
- grounded: true if the scenes actually support the answer; false if they don't and you had to guess or the scenes were empty.`;

const DISTILL_SYSTEM_TEXT = `You distill a roleplay character card into a compact, FILTERABLE summary so a large library can be browsed at a glance.

Respond with ONLY a JSON object of this exact shape (no prose, no markdown, no <think>):
{"genre":"...","subGenres":["..."],"tone":"...","setting":"...","tags":["..."],"elevatorPitch":"...","overview":"..."}

- genre: the single best-fit primary genre (you will be constrained to a fixed list).
- subGenres: 0-3 secondary genres/modes.
- tone: the dominant tone (constrained to a fixed list).
- setting: a short phrase for the world/place ("modern urban fantasy", "feudal Japan").
- tags: 3-8 concrete, distinctive theme/content tags someone would filter by (not generic words).
- elevatorPitch: ONE sentence, broad strokes — who this character is and the hook.
- overview: 2-3 sentences — the character's premise, dynamic, and what RP with them is like. Concrete, no fluff.`;

export const DISCOVERY_PROSE_SLOTS = {
  "discovery.compare.system": {
    id: "discovery.compare.system",
    home: "user",
    version: 1,
    text: COMPARE_SYSTEM_TEXT,
    macros: "none",
    requiredMacros: [],
    requiredTokens: ['{"summary":"...","overlap":"...","distinction":"..."}'],
    title: "Character comparison narrative",
    fires: "`compareCharactersDeep` — the deep-compare panel, once per pair, over the precomputed facet diff.",
  },
  "discovery.ask.system": {
    id: "discovery.ask.system",
    home: "user",
    version: 1,
    text: ASK_SYSTEM_TEXT,
    macros: "none",
    requiredMacros: [],
    requiredTokens: ['{"answer":"...","grounded":true}'],
    title: "Ask-a-card answer prompt",
    fires: "`askCard` — a free-text question about one owned character, grounded in its recent played scenes.",
  },
  "discovery.distill.system": {
    id: "discovery.distill.system",
    home: "user",
    version: 1,
    text: DISTILL_SYSTEM_TEXT,
    macros: "none",
    requiredMacros: [],
    requiredTokens: ['{"genre":"...","subGenres":["..."],"tone":"...","setting":"...","tags":["..."],"elevatorPitch":"...","overview":"..."}'],
    title: "Card distillation prompt",
    fires: "Every distill pass — the on-demand single card AND the whole-library batch (which runs the default).",
  },
} as const satisfies Partial<Record<ProseSlotId, ProseSlotDef>>;
