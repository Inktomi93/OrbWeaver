import type { ChatDeltaEvent, MemoryRecallPhase, TurnAbortReason, TurnIntent } from "@orb/contracts/chat";
import type { CharacterId, ChatId, MessageId } from "@orb/kit/ids";

/** The per-chat turn slot — one phase at a time, fields per phase (never optional-field soup). */
export type TurnSlot =
  | { readonly phase: "idle" }
  | {
      readonly phase: "pending";
      readonly intent: TurnIntent;
      readonly speakerCharacterId: CharacterId | null;
      readonly targetMessageId: MessageId | null;
      readonly committedMessageId: MessageId | null;
    }
  | {
      readonly phase: "streaming";
      readonly intent: TurnIntent;
      readonly speakerCharacterId: CharacterId | null;
      readonly targetMessageId: MessageId | null;
      readonly committedMessageId: MessageId | null;
      readonly text: string;
      readonly reasoning: string;
    }
  | {
      readonly phase: "stopping";
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
    }
  | { readonly phase: "aborted"; readonly intent: TurnIntent; readonly reason: TurnAbortReason };

/** The per-chat memory-recall phase, kept on a separate axis from the turn slot. */
export type RecallState = { readonly phase: "recalling" } | { readonly phase: "recalled"; readonly count: number };

export interface ChatStreamApi {
  readonly beginTurn: (
    chatId: ChatId,
    turn: {
      intent: TurnIntent;
      speakerCharacterId: CharacterId | null;
      targetMessageId: MessageId | null;
    },
  ) => void;
  readonly appendDelta: (delta: ChatDeltaEvent) => void;
  readonly completeTurn: (chatId: ChatId, messageId: MessageId | null) => void;
  readonly abortTurn: (chatId: ChatId, reason: TurnAbortReason) => void;
  readonly notifyUserMessageCommitted: (chatId: ChatId) => void;
  readonly markStopping: (chatId: ChatId) => "pending" | "streaming" | null;
  readonly recoverAfterStopFailure: (chatId: ChatId, previousPhase: "pending" | "streaming") => void;
  readonly markCommitted: (chatId: ChatId, messageId: MessageId) => void;
  readonly setRecallPhase: (chatId: ChatId, phase: MemoryRecallPhase, count: number | null) => void;
  readonly resetRecall: (chatId: ChatId) => void;
}
