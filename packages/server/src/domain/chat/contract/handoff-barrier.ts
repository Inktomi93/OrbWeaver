import type { HandoffOffer } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import type { HandoffResumption } from "./context.ts";
import type { ChatService } from "./service.ts";

export interface HandoffReservation extends Disposable {
  readonly settle: () => Promise<void>;
}

/** Single-replica custody, independent of Stop ownership and the engine's native lease. */
export interface HandoffBarrier {
  readonly tryEnter: (chatId: ChatId) => Disposable | null;
  readonly close: (chatId: ChatId) => HandoffReservation;
  /** Close the room only while no admitted work is in it, without waiting; null when work is in flight or the
   *  room is already closed. Admissions refuse until the returned hold is disposed. */
  readonly tryCloseIdle: (chatId: ChatId) => Disposable | null;
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
