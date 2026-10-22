// Shared refinery rubric, critique bounds and analysis validators. Character and schema authoring consume
// this leaf without importing the composing public root; it never imports character or that root.

import { estimateTokens } from "@orb/kit/tokens";
import { z } from "zod";

/** The extension's 1-10 rubric floor ("Rate this character card on a scale of 1-10"; the soul check is
 *  the same scale). Non-int: the overall score is a weighted average. */
export const SCORE_MIN = 1;
/** The rubric ceiling — see {@link SCORE_MIN}. */
export const SCORE_MAX = 10;

/** The analyze verdict — carried VERBATIM from the source extension (its prompt corpus teaches these
 *  exact uppercase spellings, and REGRESSION is the iterate loop's stop condition). */
export const REFINERY_VERDICTS = ["ACCEPT", "NEEDS_REFINEMENT", "REGRESSION"] as const;
export type RefineryVerdict = (typeof REFINERY_VERDICTS)[number];
export const refineryVerdictSchema = z.enum(REFINERY_VERDICTS) satisfies z.ZodType<RefineryVerdict>;

// ── The MODEL-AUTHORED payload ceilings (security pass 2026-08-08 —
// 2026-08-08 gap 1) ──────────────────────────────
// A character card is UNTRUSTED text; a prompt-injected card can steer the model that AUTHORS these
// payloads. The analyze payload is stamped into CANON (`characters.refinery.analysis`), rides every card
// detail read AND every `character_snapshots` blob; the score/rewrite payloads land in append-only run
// rows. Unbounded strings/arrays therefore were a store-and-serve amplification path with no belt at all
// (measured: a 2 MB `summary` and a 5 000-entry array parsed clean). Every bound below is a NATIVE zod
// keyword — so it survives `projectJsonSchema` as `maxLength`/`maxItems` and is GRAMMAR-ENFORCED on the
// guided-decoding wire, while the hosted wires strip the KEYWORD, relay the bound to the model in that
// node's `description` (`[Constraints: maxLength: 16000]`, task #40) and let the zod belt re-impose it on
// the reply (`contracts/inference/wire-subset.ts` states that contract). Critique prose additionally carries the ONE
// sanctioned refinement (the token cap — see the header).

/** The product cap for one free-prose critique string (`summary`, `soulAssessment`, a per-field critique),
 *  in TOKENS. OWNER RULING 2026-08-08 — the cap was 4 000 CHARS (the `PROSE_MAX_CHARS` twin) and that was
 *  the wrong UNIT for model-authored prose: "we are thinking in chars but it needs to be tokens ... 1000
 *  tokens is piddly, I have cards that are like 4k". Measured by `@orb/kit/tokens`, the ONE production
 *  estimator (never a re-implementation) — which makes this cap the same currency as every prompt budget
 *  in the tree. */
export const CRITIQUE_TOKEN_MAX = 4000;

/** The most characters ONE token can buy under the production estimator. `estimateTokens` (QuadChars,
 *  `@orb/kit/tokens`) charges a printable-ASCII run 1 token per 4 chars and EVERY other codepoint a whole
 *  token, so `estimateTokens(t) >= ceil(t.length / 4)` holds for every string — 4 is the ceiling, reached
 *  only by pure printable ASCII.
 *
 *  THIS IS A PREMISE, NOT A CONSTANT: if the estimator is ever swapped for a real BPE (where common words
 *  routinely exceed 4 chars per token) the inequality above becomes FALSE and the derivation below must be
 *  revisited in that same change. Deriving the backstop instead of writing `16_000` is what forces that —
 *  a literal would silently outlive its premise. */
const QUADCHARS_MAX_CHARS_PER_TOKEN = 4;

/** The DoS backstop for one critique string, in CHARS — the NATIVE keyword that survives projection and
 *  keeps the guided-decoding grammar preventing over-long prose at generation time (a grammar cannot count
 *  tokens). DERIVED, so it is exactly the char envelope of the token cap: by the inequality above a
 *  token-legal string is always within `4 × budget` chars, so this rejects NOTHING the token cap accepts
 *  while bounding bytes at half of the flat 32 000 a hand-picked literal would have cost.
 *
 *  It is deliberately NOT the whole belt: non-ASCII prose costs a token PER CODEPOINT, so 5 000 CJK
 *  characters is 5 000 tokens at only 5 000 chars — over the product cap and nowhere near this backstop.
 *  That gap is precisely why the token refinement exists. */
export const CRITIQUE_CHAR_BACKSTOP = CRITIQUE_TOKEN_MAX * QUADCHARS_MAX_CHARS_PER_TOKEN;

/** One free-prose critique string, DUAL-BOUND: a native char backstop (projected to the wire, grammar-
 *  enforced on vLLM) plus the token product cap (parse-only because JSON Schema cannot count tokens).
 *
 *  The `length` guard in front of `estimateTokens` is LOAD-BEARING, not defensive: zod string checks are
 *  NON-ABORTING, so without it a blob that already failed `.max()` would still be walked codepoint-by-
 *  codepoint by the estimator — the byte ceiling would have become a CPU amplifier (measured: 40 MB ≈ 1.9 s
 *  of tokenizing for a string already known to be refused). Answering `false` on length alone is exact, not
 *  an approximation: over `4 × budget` chars is over budget in tokens by the inequality above. */
export const critiqueProseSchema = z
  .string()
  .max(CRITIQUE_CHAR_BACKSTOP)
  .refine((text) => text.length <= CRITIQUE_CHAR_BACKSTOP && estimateTokens(text) <= CRITIQUE_TOKEN_MAX, `must be at most ${CRITIQUE_TOKEN_MAX} tokens`);

/** One bullet in a list payload (`issues[]`, `preserved[]`, …) — a bullet, not an essay. */
export const NOTE_MAX = 500;

/** Items in one bullet list. */
export const LIST_MAX = 50;

/** The anti-drift comparison verdict — ALWAYS rewrite-vs-ORIGINAL (the session's `original_card`
 *  snapshot), never rewrite-vs-previous-rewrite. The soul check is the 1-10 "does it still feel like
 *  the same character" rubric.
 *
 *  THE ONE PAYLOAD THAT REACHES CANON: R1 stamps it into `characters.refinery.analysis` (F6), so these
 *  bytes ride every card detail read AND every `character_snapshots` blob taken afterwards. Its ceilings
 *  are the tightest in this file for that reason. */
export const refineryAnalyzePayloadSchema = z.object({
  preserved: z.array(z.string().max(NOTE_MAX)).max(LIST_MAX),
  lost: z.array(z.string().max(NOTE_MAX)).max(LIST_MAX),
  gained: z.array(z.string().max(NOTE_MAX)).max(LIST_MAX),
  soulScore: z.number().min(SCORE_MIN).max(SCORE_MAX),
  soulAssessment: critiqueProseSchema,
  verdict: refineryVerdictSchema,
  issues: z.array(z.string().max(NOTE_MAX)).max(LIST_MAX),
  recommendations: z.array(z.string().max(NOTE_MAX)).max(LIST_MAX),
});

export type RefineryAnalyzePayload = z.infer<typeof refineryAnalyzePayloadSchema>;

// Output projections validate typed envelopes after model/read parsing has normalized and itemized them.
export const refineryAnalyzePayloadViewSchema = refineryAnalyzePayloadSchema.strict() satisfies z.ZodType<RefineryAnalyzePayload>;
