import type { HandoffOffer } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import type { HandoffResumption } from "./context.ts";
import type { ChatOperationError } from "./errors.ts";
import type { ChatService } from "./service.ts";

export interface HandoffReservation extends Disposable {
  readonly settle: () => Promise<void>;
}

/** Single-replica custody, independent of Stop ownership and the engine's native lease. */
export interface HandoffBarrier {
  readonly tryEnter: (chatId: ChatId) => Disposable | null;
  readonly close: (chatId: ChatId) => HandoffReservation;
  /** Close the room for its removal only while no admitted work is in it, without waiting; null when work is in
   *  flight or the room is already closed. Admissions refuse until the returned hold is disposed. */
  readonly tryCloseIdle: (chatId: ChatId) => Disposable | null;
  /** The refusal for an admission `tryEnter` just turned away: `roomClosing` while a removal holds the room,
   *  `locked` while a handoff does. Read it before awaiting the caller's gate, since the closure can lift meanwhile. */
  readonly refusal: (chatId: ChatId) => ChatOperationError;
  readonly track: (chatId: ChatId, work: Promise<void>) => void;
}

export type HandoffAcceptance =
  | { readonly kind: "resume"; readonly resumption: HandoffResumption }
  | { readonly kind: "pending"; readonly offer: HandoffOffer };

export type AdmittedChatOperations = Pick<
  ChatService,
  | "send"
  | "commitMessage"
  | "forceCharacterTurn"
  | "swipe"
  | "continueTurn"
  | "generate"
  | "impersonateStream"
  | "compact"
  | "generateImage"
  | "acceptHostHandoff"
>;

export interface ChatAdmissionDeps {
  readonly barrier: HandoffBarrier;
  readonly operations: AdmittedChatOperations;
  readonly settleDeferredTurns: (chatId: ChatId) => Promise<void>;
}
