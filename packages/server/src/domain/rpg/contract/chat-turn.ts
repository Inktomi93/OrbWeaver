// The runtime-typed halves of the chat turn shapes rpg consumes, and the ops object rpg builds for chat. The data
// halves and every op type live in `@orb/contracts/chat`; chat's slot names the same op types, so the composition
// root's wiring checks the two against each other.

import type {
  ForkGameOp,
  GameBirthCommittedOp,
  GatherTurnContextOp,
  HandoffHealStatementsOp,
  HandoffRekeyActorsOp,
  HandoffWouldCopyGmPresetOp,
  MarkDicePreRollEligibleOp,
  PlanGameBirthOp,
  ReadChatUserMacrosOp,
  ResolveGmSeatHolderKindOp,
  ResolvePresetOverrideOp,
  ResolveReasoningHostOnlyOp,
  RpgGatherWithTools,
  RpgTurnAbortedOp,
  RpgTurnCompletedOp,
  RpgTurnRuntime,
  RpgUserCommitOp,
} from "@orb/contracts/chat";
import type { CancelStateRoundsOp } from "@orb/contracts/rpg";
import type { StatementToken } from "@orb/db/wiring";
import type { Resolved, ToolCallInput, WireTool } from "@orb/inference";

/** The completed turn's facts with the runtime values rpg's post-commit round runs on. */
export type RpgTurnContext = RpgTurnRuntime<Resolved<"chat">, ToolCallInput, AbortSignal>;

/** What a game turn's gather returns to chat: the data contribution plus the terminal tools chat mounts on this
 *  turn and never executes. */
export type RpgGatherResult = RpgGatherWithTools<WireTool>;

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
