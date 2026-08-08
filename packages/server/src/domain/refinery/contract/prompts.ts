// domain/refinery/contract/prompts — the typed surface of the prompt + parse substrates (the §7.4 home
// for the feature's shapes; `substrate/refine-prompt.ts` and `substrate/stage-parse.ts` implement over
// these). The belt-5 law rides the prompt substrate's own header: card bytes are concatenated VERBATIM,
// never macro-processed.

import type { CharacterCard } from "@orb/contracts/character";
import type { ProseOverrides } from "@orb/contracts/prose";
import type {
  RefineryAnalyzeMode,
  RefineryAnalyzePayload,
  RefineryRewriteMode,
  RefineryRewritePayload,
  RefineryScoreMode,
  RefineryScorePayload,
  RefinerySelection,
} from "@orb/contracts/refinery";
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
  readonly mode: RefineryScoreMode;
  readonly guidance: string | null;
  readonly overrides: ProseOverrides;
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
  readonly mode: RefineryAnalyzeMode;
  readonly guidance: string | null;
  readonly overrides: ProseOverrides;
  /** The rewrite under judgement — rendered as the REWRITTEN side (the original overlaid). */
  readonly rewrite: RefineryRewritePayload;
}
