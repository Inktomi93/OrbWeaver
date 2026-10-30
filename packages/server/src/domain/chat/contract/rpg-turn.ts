// RPG receives the turn's resolved route and story; the engine receives terminal hooks, not game authority.
import type { MarkDicePreRollEligibleOp, RpgTurnAbortedOp, RpgTurnCompletedOp, RpgTurnRuntime } from "@orb/contracts/chat";
import type { Resolved, ToolCallInput } from "@orb/inference";

/** The completed turn's facts with chat's runtime values filled in. */
export type RpgTurnContext = RpgTurnRuntime<Resolved<"chat">, ToolCallInput, AbortSignal>;

/** Terminal hooks receive resolved turn facts and cannot change membership, handoff or game configuration. */
export interface RpgTurnOps {
  /** Called only for a turn responding to the latest user slot; later rounds cannot reuse queued dice. */
  readonly markDicePreRollEligible: MarkDicePreRollEligibleOp;
  /** Flush staged tool writes onto this committed variant with the turn's resolved connection and transcript. */
  readonly onTurnCompleted: RpgTurnCompletedOp<RpgTurnContext>;
  /** Clear staging so a failed turn never flushes into its successor. */
  readonly onTurnAborted: RpgTurnAbortedOp;
}
