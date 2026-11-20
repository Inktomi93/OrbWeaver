import type { ChatDeltaEvent, MemoryRecallPhase, ProviderWaitPhase, TurnAbortReason, TurnIntent } from "@orb/contracts/chat";
import type { CharacterId, ChatId, ChatTurnId, MessageId } from "@orb/kit/ids";

/** The per-chat turn slot — one phase at a time, fields per phase (never optional-field soup). A live slot belongs
 *  to `turnId`: only that turn's tokens and terminal reach it, because other turns run in the same chat. */
export type TurnSlot =
  | { readonly phase: "idle" }
  | {
      readonly phase: "pending";
      readonly turnId: ChatTurnId;
      readonly intent: TurnIntent;
      readonly speakerCharacterId: CharacterId | null;
      readonly targetMessageId: MessageId | null;
      readonly committedMessageId: MessageId | null;
      /** The server said the dispatched request has answered nothing for a while (`providerWait`). */
      readonly providerWaiting: boolean;
    }
  | {
      readonly phase: "streaming";
      readonly turnId: ChatTurnId;
      readonly intent: TurnIntent;
      readonly speakerCharacterId: CharacterId | null;
      readonly targetMessageId: MessageId | null;
      readonly committedMessageId: MessageId | null;
      readonly text: string;
      readonly reasoning: string;
    }
  | {
      readonly phase: "stopping";
      readonly turnId: ChatTurnId;
      readonly intent: TurnIntent;
      readonly speakerCharacterId: CharacterId | null;
      readonly targetMessageId: MessageId | null;
      readonly committedMessageId: MessageId | null;
      readonly text: string;
      readonly reasoning: string;
    }
  | {
      readonly phase: "completed";
      readonly intent: TurnIntent;
      readonly messageId: MessageId | null;
      readonly handover: GhostHandover | null;
    }
  | { readonly phase: "aborted"; readonly intent: TurnIntent; readonly reason: TurnAbortReason; readonly handover: GhostHandover | null };

/**
 * A closed turn's ghost, held until the message list shows the row the turn committed. The turn's terminal closes
 * the slot at once, but the list learns of the committed row through the query cache's own, later notification;
 * without the hold, the frames between show neither row. Null when the turn committed nothing, or once the list
 * showed the row.
 */
export interface GhostHandover {
  readonly committedMessageId: MessageId;
  /** The closing turn's own intent and target, so the list still knows where its ghost stood after the slot closed. */
  readonly intent: TurnIntent;
  readonly targetMessageId: MessageId | null;
  readonly speakerCharacterId: CharacterId | null;
  readonly text: string;
  readonly reasoning: string;
}

/** The per-chat memory-recall phase, kept on a separate axis from the turn slot. */
export type RecallState = { readonly phase: "recalling" } | { readonly phase: "recalled"; readonly count: number };

export interface ChatStreamApi {
  readonly beginTurn: (
    chatId: ChatId,
    turn: {
      turnId: ChatTurnId;
      intent: TurnIntent;
      speakerCharacterId: CharacterId | null;
      targetMessageId: MessageId | null;
    },
  ) => void;
  /** Close a live slot whose turn is not in the room's open set. */
  readonly closeDeadTurn: (chatId: ChatId, openTurnIds: readonly ChatTurnId[]) => void;
  readonly appendDelta: (turnId: ChatTurnId, delta: ChatDeltaEvent) => void;
  readonly completeTurn: (chatId: ChatId, turnId: ChatTurnId, messageId: MessageId | null) => void;
  readonly abortTurn: (chatId: ChatId, turnId: ChatTurnId, reason: TurnAbortReason) => void;
  readonly notifyUserMessageCommitted: (chatId: ChatId) => void;
  readonly markStopping: (chatId: ChatId) => "pending" | "streaming" | null;
  readonly recoverAfterStopFailure: (chatId: ChatId, previousPhase: "pending" | "streaming") => void;
  readonly markCommitted: (chatId: ChatId, messageId: MessageId, turnId: ChatTurnId | undefined) => void;
  /** Drop a closed turn's held ghost once the list shows `messageId`, so a later removal of that row never brings it back. */
  readonly releaseHandover: (chatId: ChatId, messageId: MessageId) => void;
  readonly setRecallPhase: (chatId: ChatId, phase: MemoryRecallPhase, count: number | null) => void;
  readonly setProviderWait: (chatId: ChatId, turnId: ChatTurnId, phase: ProviderWaitPhase) => void;
  readonly resetRecall: (chatId: ChatId) => void;
}
