// domain/refinery/contract/prompts — the typed surface of the prompt + parse substrates (the §7.4 home
// for the feature's shapes; `substrate/refine-prompt.ts` and `substrate/stage-parse.ts` implement over
// these). The belt-5 law rides the prompt substrate's own header: card bytes are concatenated VERBATIM,
// never macro-processed.

import type { CharacterCard } from "@orb/contracts/character";
import type { ProseOverrides } from "@orb/contracts/prose";
import type {
  RefineryAnalyzeMode,
  RefineryAnalyzePayload,
  RefineryCustomRunConfig,
  RefineryForgeArm,
  RefineryRewriteMode,
  RefineryRewritePayload,
  RefinerySchemaStage,
  RefineryScoreMode,
  RefineryScorePayload,
  RefinerySelection,
  RefineryStage,
} from "@orb/contracts/refinery";
import type { ResponseFormat, RoleClients, SummarizeOptions } from "@orb/contracts/role-clients";
import type { SideGenSampling } from "@orb/kit/side-gen-posture";
import type { z } from "zod";

/** One stage call's parse seam (built fresh per run — the capture is per-call state). */
export interface StageParse<T> {
  /** Hand THIS to `runStructuredTurn` — it null-drops, captures, then validates. */
  readonly schema: z.ZodType<T>;
  /** After a successful turn: the dotted paths the strip-mode parse removed from the model's payload. */
  readonly strippedKeysOf: (parsed: T) => readonly string[];
}

/** The resolved prompt pair one stage call runs under. */
export interface StagePrompts {
  readonly system: string;
  readonly user: string;
}

export interface ScorePromptArgs {
  readonly card: CharacterCard;
  readonly selection: RefinerySelection;
  /** The fixed arm's instruction-slot selector; NULL on a custom run (no mode exists — the schema's own
   *  `customInstruction` carries the ask instead). */
  readonly mode: RefineryScoreMode | null;
  readonly guidance: string | null;
  readonly overrides: ProseOverrides;
  /** A custom run's instruction body — the schema's authored NL description (the author's ask IS the
   *  instruction). Read only when `mode` is null. */
  readonly customInstruction?: string | undefined;
  /** A custom run's `{{shape}}` restatement (the projected schema, labeled). Absent ⇒ the fixed example. */
  readonly shapeText?: string | undefined;
}

export interface RewritePromptArgs {
  readonly card: CharacterCard;
  readonly selection: RefinerySelection;
  readonly mode: RefineryRewriteMode;
  readonly guidance: string | null;
  readonly overrides: ProseOverrides;
  /** The latest score payload, when one exists — the rewrite's critique context. */
  readonly score: RefineryScorePayload | null;
  /** A refinement round: the latest analyze feedback rides the prompt and the system slot flips to
   *  `refinery.refine.system` (the extension's refinement discipline). */
  readonly analyzeFeedback: RefineryAnalyzePayload | null;
}

export interface AnalyzePromptArgs {
  /** The session's ORIGINAL card — the anti-drift anchor, never a previous rewrite. */
  readonly originalCard: CharacterCard;
  readonly selection: RefinerySelection;
  /** NULL on a custom run — see {@link ScorePromptArgs.mode}. */
  readonly mode: RefineryAnalyzeMode | null;
  readonly guidance: string | null;
  readonly overrides: ProseOverrides;
  /** The rewrite under judgement — rendered as the REWRITTEN side (the original overlaid). */
  readonly rewrite: RefineryRewritePayload;
  /** See {@link ScorePromptArgs.customInstruction}. */
  readonly customInstruction?: string | undefined;
  /** See {@link ScorePromptArgs.shapeText}. */
  readonly shapeText?: string | undefined;
}

/** How one stage pass runs (the stage-resolution substrate's output): the fixed arm (mode prose + typed
 *  contract) or the resolved custom arm — the OWNED schema row lifted + projected + EMBEDDED per call. */
export type StageResolution =
  | { readonly kind: "fixed" }
  | {
      readonly kind: "custom";
      readonly runConfig: RefineryCustomRunConfig;
      readonly payloadSchema: z.ZodObject;
      readonly responseFormat: ResponseFormat;
      readonly shapeText: string;
      readonly instruction: string;
    };

/** What one NL→schema FORGE turn needs (task #36). Homed here rather than beside the engine because a
 *  domain's exported shapes live in its `contract/` (§7.4, `no-inline-types`) — `substrate/schema-forge.ts`
 *  imports it back. `userPrompt` is the caller's own ask (describe-to-schema, or the modify-this-schema
 *  instruction); each arm appends its own per-call material. */
export interface ForgeTurnArgs {
  readonly stage: RefinerySchemaStage;
  readonly userPrompt: string;
  readonly overrides: ProseOverrides;
  readonly sampleOpts: SummarizeOptions;
  readonly arm: RefineryForgeArm;
  /** The caller's role-client bundle — every forge call is `structured` on it. */
  readonly rc: RoleClients;
}

/** What sizing ONE stage call's output cap needs (`substrate/output-budget`). Homed here for the same
 *  reason as {@link ForgeTurnArgs}: a domain's exported shapes live in its `contract/` (§7.4,
 *  `no-inline-types`), and the substrate imports them back. */
export interface StageOutputBudgetArgs {
  /** The §8 prediction for this stage (`outputEstimateOf`). */
  readonly estimate: number;
  /** The stage's shipped `SIDE_GEN_POSTURES` floor — the budget never resolves BELOW it. */
  readonly floor: number;
  /** The summarize role's resolved context window, or null when the connection reports none. */
  readonly contextTokens: number | null;
  /** This call's assembled-prompt estimate (the same `estimateTokens` the fit line reads). */
  readonly inputEstimate: number;
}

/**
 * WHAT the §8 output arithmetic is about to be asked for — the card and the slice of it under the stage,
 * plus (rewrite only) the mode whose prose promises a length. Deliberately NOT a session: a
 * `RefinerySessionView` satisfies it (`stageSubjectOf`), and so does the LIBRARY SWEEP's per-card pair,
 * which has no session at all and still has to size its cap off the payload rather than the raw posture
 * floor (live-e2e 2026-08-09 open fork 3 — the sweep shipped on the raw floor, the same defect class as
 * the 503). Stage-tagged so the rewrite arm can REQUIRE its mode instead of defaulting one in.
 */
export type StageEstimateSubject =
  // DERIVED, never re-spelled (`no-inline-union-redecl`): "every stage but the one that carries a mode".
  | { readonly stage: Exclude<RefineryStage, "rewrite">; readonly card: CharacterCard; readonly selection: RefinerySelection }
  | { readonly stage: "rewrite"; readonly card: CharacterCard; readonly selection: RefinerySelection; readonly mode: RefineryRewriteMode };

/** What deciding the RULED refusal needs: the payload's own need vs the ladder's top rung. Split out from
 *  {@link StageSamplingArgs} because the verdict is prompt-independent — the engine refuses BEFORE it
 *  assembles anything, so a guaranteed-overrun run spends no decode at all. */
export interface StageBudgetFitArgs {
  readonly subject: StageEstimateSubject;
  /** The caller's resolved preset generation params — the ladder's TOP rung, unchanged by any of this. */
  readonly presetParams: SideGenSampling | undefined;
}

/** The refusal RECEIPT (`stageBudgetMisfitOf` — null when the run fits): the two numbers the user needs to
 *  act, carried as data so the error class owns the ONE spelling of the sentence. */
export interface StageBudgetMisfit {
  /** The §8 prediction for this stage — the same number the fit line prints as `out ≈ N`. */
  readonly needTokens: number;
  /** The caller's own explicit preset `maxOutputTokens` — the cap that wins the ladder outright. */
  readonly capTokens: number;
}

/** What resolving ONE stage call's whole sampling posture needs — the ladder plus the payload-aware floor
 *  ({@link StageOutputBudgetArgs}). Both `preflight` and the stage engine pass this, which is what keeps
 *  the fit line's advertised ceiling and the wire's `maxTokens` ONE expression instead of two that agreed
 *  by luck (they did not agree, and the disagreement was a 503 — `substrate/output-budget`'s header). */
export interface StageSamplingArgs extends StageBudgetFitArgs {
  readonly contextTokens: number | null;
  /** This call's assembled-prompt estimate. */
  readonly inputEstimate: number;
}
