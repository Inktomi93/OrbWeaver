// The runtime-typed halves of the chat turn shapes rpg consumes, and the ops object rpg builds for chat. The data
// halves and every op type live in `@orb/contracts/chat`; chat's slot names the same op types, so the composition
// root's wiring checks the two against each other.

import type {
  ChatRpgGatherData,
  ForkGameOp,
  GameBirthCommittedOp,
  GatherTurnContextOp,
  GenerationObservationParent,
  HandoffHealStatementsOp,
  HandoffRekeyActorsOp,
  HandoffWouldCopyGmPresetOp,
  MarkDicePreRollEligibleOp,
  PlanGameBirthOp,
  ReadChatUserMacrosOp,
  ResolveGmSeatHolderKindOp,
  ResolvePresetOverrideOp,
  ResolveReasoningHostOnlyOp,
  RpgTurnAbortedOp,
  RpgTurnCompletedOp,
  RpgTurnFacts,
  RpgUserCommitOp,
} from "@orb/contracts/chat";
import type { CancelStateRoundsOp } from "@orb/contracts/rpg";
import type { StatementToken } from "@orb/db/wiring";
import type { GenerationObservationCallback, Resolved, ToolCallInput, WireTool } from "@orb/inference";

/** A completed turn's facts plus the resolved connection the post-commit round runs on, the folded terminal tool
 *  calls and the turn's cancellation signal. */
export interface RpgTurnContext extends RpgTurnFacts {
  readonly connection: Resolved<"chat">;
  /** Null means no usable folded channel; an empty array means it ran and recorded no calls. */
  readonly terminalToolCalls: readonly ToolCallInput[] | null;
  readonly signal: AbortSignal | undefined;
}

/** What a game turn's gather returns to chat: the data contribution plus the terminal tools chat mounts on this
 *  turn and never executes. */
export interface RpgGatherResult extends ChatRpgGatherData {
  /** Absent or empty means the turn is byte-identical to a tool-less one. */
  readonly terminalTools?: readonly WireTool[] | undefined;
}

/** Open a retained generation-observation sink for a host-door call; returns the callback the provider reports into. */
export type BeginGenerationObservation = (parent: GenerationObservationParent) => GenerationObservationCallback;

/** The ops rpg exposes to chat's turn, room and handoff seams (D58). Each is principal-free (chat gated the caller)
 *  and a byte-identical no-op for a non-game chat. */
export interface RpgChatOps {
  readonly planGameBirth: PlanGameBirthOp<StatementToken>;
  readonly gameBirthCommitted: GameBirthCommittedOp;
  readonly resolvePresetOverride: ResolvePresetOverrideOp;
  readonly resolveUserMacros: ReadChatUserMacrosOp;
  readonly gatherTurnContext: GatherTurnContextOp<RpgGatherResult>;
  readonly markDicePreRollEligible: MarkDicePreRollEligibleOp;
  readonly onUserCommit: RpgUserCommitOp;
  readonly onTurnCompleted: RpgTurnCompletedOp<RpgTurnContext>;
  readonly onTurnAborted: RpgTurnAbortedOp;
  readonly cancelStateRounds: CancelStateRoundsOp;
  readonly resolveGmSeatHolderKind: ResolveGmSeatHolderKindOp;
  readonly resolveReasoningHostOnly: ResolveReasoningHostOnlyOp;
  readonly forkGame: ForkGameOp;
  readonly handoffHealStatements: HandoffHealStatementsOp<StatementToken>;
  readonly handoffWouldCopyGmPreset: HandoffWouldCopyGmPresetOp;
  readonly handoffRekeyActors: HandoffRekeyActorsOp;
}
