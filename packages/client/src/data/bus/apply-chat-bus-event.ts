// The pure, exhaustive bus reducer — the one sanctioned place stream/canon events touch client state.
// Stream-transient events go to the chat-stream store (the local buffer); canon events invalidate
// through the central seam. Ends in assertNever: a new ChatBusEvent member fails tsc here until the
// reducer says what it does.

import type { ChatBusEvent, ChatWarningCode, TurnAbortReason } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import type { ChatStreamApi } from "#state";

export interface ChatBusDeps {
  readonly stream: ChatStreamApi;
  /** The central seam's bus half (`createInvalidation().invalidate`). */
  readonly invalidate: (event: ChatBusEvent) => void;
  /** Optional user-visible surfacing for domain warnings (e.g. `image_dropped`). */
  readonly onWarning?: (code: ChatWarningCode, chatId: ChatId) => void;
  /** Optional user-visible surfacing for a turn abort (the `onWarning` injected-callback precedent). The
   *  bus sees EVERY turnAborted (incl. detached auto-mode turns), so it is the one place a stale-lock
   *  takeover is always observable; the reason→copy decision is wired at the composition root (the feature
   *  layer — `data/` may not import `features/`). */
  readonly onTurnAbort?: (reason: TurnAbortReason, chatId: ChatId) => void;
  /** The room DIED on the bus — a host delete, a husk reap, or the TTL sweep against a tab still sitting on
   *  the room. Invalidating alone leaves that tab pointed at a chat that no longer exists, reading its cached
   *  canon; the seam `chat-lifecycle.ts` and design §4.5 both justify the reap emit with is exactly this
   *  transition, and until R3 nothing was on the other end of it. Wired at the composition root like the two
   *  callbacks above (`data/` may not import `features/`, and the landing action is `#state`'s). */
  readonly onChatDeleted?: (chatId: ChatId) => void;
}

function assertNever(value: never): never {
  throw new Error(`applyChatBusEvent: unhandled ChatBusEvent type ${JSON.stringify(value)}`);
}

export function applyChatBusEvent(event: ChatBusEvent, deps: ChatBusDeps): void {
  switch (event.type) {
    // ── Stream-transient (the local buffer; nothing durable changed yet) ──
    case "delta":
      deps.stream.appendDelta(event.delta);
      return;
    // A turn was ACCEPTED — open the slot NOW (before arbitration) so Stop renders through a hung smart
    // arbitration that fires `turnStarted` only once it completes. `speakerCharacterId` is null on accept;
    // `turnStarted` re-opens the same pending slot with the resolved speaker once arbitration picks one.
    case "turnAccepted":
    case "turnStarted":
      deps.stream.beginTurn(event.chatId, {
        intent: event.intent,
        speakerCharacterId: event.speakerCharacterId,
        targetMessageId: event.targetMessageId,
      });
      return;
    case "reasoningStreamDone":
      return; // display affordance only; the slot keeps buffering until terminal

    case "warning":
      deps.onWarning?.(event.code, event.chatId);
      return;

    // ── Turn terminals (own the slot lifecycle, then reconcile canon) ──
    case "turnCompleted":
      deps.stream.completeTurn(event.chatId, event.messageId);
      deps.invalidate(event);
      return;
    case "turnAborted":
      deps.stream.abortTurn(event.chatId, event.reason);
      deps.onTurnAbort?.(event.reason, event.chatId);
      deps.invalidate(event);
      return;

    // ── Canon / attachment / lifecycle — refetch via the one seam ──
    case "messageCommitted":
      // The composer's clear-on-commit signal: a user-role commit is the caller's own just-sent row
      // landing durably. A missing view is inconclusive — don't clear (the draft stays, never a wrong
      // clear).
      if (event.view?.role === "user") {
        deps.stream.notifyUserMessageCommitted(event.chatId);
      }
      // The GHOST HANDOVER (see `state/chat-stream.ts` TurnSlot): an ASSISTANT commit is the live turn's
      // own output landing in canon, and `invalidate` below applies the very same `view` into the message
      // list — so from here the ghost is rendering bytes the canon row already carries and it yields
      // (`use-message-items.ts`), instead of holding until `turnCompleted` and unmounting onto a row the
      // refetch has not replaced yet (the measured 100-400 ms tail flash). Assistant-only: the caller's
      // own USER row commits inside this same live slot on a send.
      if (event.view?.role === "assistant") {
        deps.stream.markCommitted(event.chatId, event.messageId);
      }
      deps.invalidate(event);
      return;
    case "messageEdited":
    case "messageHidden":
    case "variantSelected":
    case "messagesDeleted":
    case "messagesReordered":
    case "reasoningEdited":
    case "reasoningCleared":
    case "personaSwitched":
    case "worldInfoActivated":
    // The five WiBusEvent members are real (tsc proves them); biome's resolver can't follow the
    // #world-info subpath ChatBusEvent embeds them through, so it calls them unreachable.
    // biome-ignore lint/suspicious/noUnnecessaryConditions: see the WiBusEvent note above.
    case "wiBookAttached":
    // biome-ignore lint/suspicious/noUnnecessaryConditions: see the WiBusEvent note above.
    case "wiBookDetached":
    // biome-ignore lint/suspicious/noUnnecessaryConditions: see the WiBusEvent note above.
    case "wiEntryAttached":
    // biome-ignore lint/suspicious/noUnnecessaryConditions: see the WiBusEvent note above.
    case "wiEntryDetached":
    // biome-ignore lint/suspicious/noUnnecessaryConditions: see the WiBusEvent note above.
    case "wiEntryScopeChanged":
    // The room is GONE. Both halves fire: the list/detail reads go stale, AND a device with this room OPEN
    // has to leave it — a cached transcript for a deleted chat is the one state the reader can neither act
    // on nor get out of.
    case "chatDeleted":
      deps.onChatDeleted?.(event.chatId);
      deps.invalidate(event);
      return;
    case "chatCreated":
    case "chatOpened":
    case "historyTruncated":
    case "chatUpdated":
    // An entity this room renders was edited elsewhere in the box (the entity→room bridge). Invalidate-only,
    // like `chatUpdated`: the event is id-free and carries no payload by design — every affected read is
    // re-fetched through its already-clamped verb, so there is no client state to reconcile here.
    case "roomEntityChanged":
      deps.invalidate(event);
      return;

    default:
      assertNever(event);
  }
}
