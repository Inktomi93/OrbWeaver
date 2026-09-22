// @orb/contracts/refinery/core — the rubric bounds + verdict vocabulary, split out of index.ts so BOTH
// the payload schemas (index.ts) and the schema-authoring belt (schema-authoring.ts — the well-known-core
// check pins a custom score to this exact scale and a custom analyze to these exact verdict spellings)
// can import them without a module cycle (index.ts re-exports schema-authoring).

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
