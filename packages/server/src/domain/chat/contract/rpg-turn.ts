// RPG receives the turn's resolved route and story; the engine receives terminal hooks, not game authority.
import type { TurnAbortReason } from "@orb/contracts/chat";
import type { ProseOverrides } from "@orb/contracts/prose";
import type { Resolved, ToolCallInput } from "@orb/inference";
import type { ChatId, ChatTurnId, MessageId, MessageVariantId, UserId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import type { TurnKind } from "./results.ts";

/** Model-plane story evidence keeps hidden spans; consumers slice the loaded chronological transcript. */
export interface RpgTurnTranscriptMessage {
  readonly role: MessageRole;
  readonly speakerName: string | null;
  readonly content: string;
  readonly tokens: number;
}

/** The completed turn's captured inputs are never re-resolved against a later host or preset. */
export interface RpgTurnContext {
  /** Continuation replaces its selected variant snapshot; other kinds write a new variant. */
  readonly kind: TurnKind;
  readonly connection: Resolved<"chat">;
  readonly transcript: readonly RpgTurnTranscriptMessage[];
  /** Null means no usable folded channel; an empty array means it ran and recorded no calls. */
  readonly terminalToolCalls: readonly ToolCallInput[] | null;
  /** A registry-name collision withheld the folded channel; distinct from an incapable connection. */
  readonly terminalToolsCollided: readonly string[];
  /** D19: the initiator owns cancellation, independently of the frozen host's execution authority. */
  readonly triggeredBy: UserId;
  readonly signal: AbortSignal | undefined;
  /** The turn's captured prose view, never a later re-resolve after commit. */
  readonly prose: ProseOverrides;
}

/** Terminal hooks receive resolved turn facts and cannot change membership, handoff or game configuration. */
export interface RpgTurnOps {
  /** Called only for a turn responding to the latest user slot; later rounds cannot reuse queued dice. */
  readonly markDicePreRollEligible: (turnId: ChatTurnId) => void;
  /** Flush staged tool writes onto this committed variant with the turn's resolved connection and transcript. */
  readonly onTurnCompleted: (chatId: ChatId, messageId: MessageId, variantId: MessageVariantId, turnId: ChatTurnId, turn: RpgTurnContext) => Promise<void>;
  /** Clear staging so a failed turn never flushes into its successor. */
  readonly onTurnAborted: (chatId: ChatId, turnId: ChatTurnId, reason: TurnAbortReason) => Promise<void>;
}
