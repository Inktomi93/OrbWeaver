// RPG receives the turn's resolved route and story; the engine receives terminal hooks, not game authority.
import type { MarkDicePreRollEligibleOp, RpgTurnAbortedOp, RpgTurnCompletedOp, RpgTurnFacts } from "@orb/contracts/chat";
import type { Resolved, ToolCallInput } from "@orb/inference";

/** The completed turn's captured inputs are never re-resolved against a later host or preset. */
export interface RpgTurnContext extends RpgTurnFacts {
  readonly connection: Resolved<"chat">;
  /** Null means no usable folded channel; an empty array means it ran and recorded no calls. */
  readonly terminalToolCalls: readonly ToolCallInput[] | null;
  readonly signal: AbortSignal | undefined;
}

/** Terminal hooks receive resolved turn facts and cannot change membership, handoff or game configuration. */
export interface RpgTurnOps {
  /** Called only for a turn responding to the latest user slot; later rounds cannot reuse queued dice. */
  readonly markDicePreRollEligible: MarkDicePreRollEligibleOp;
  /** Flush staged tool writes onto this committed variant with the turn's resolved connection and transcript. */
  readonly onTurnCompleted: RpgTurnCompletedOp<RpgTurnContext>;
  /** Clear staging so a failed turn never flushes into its successor. */
  readonly onTurnAborted: RpgTurnAbortedOp;
}
