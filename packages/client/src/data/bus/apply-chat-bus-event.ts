// `applyChatBusEvent` — the pure, exhaustive bus reducer (UI-Gates §11.1, carried from neo almost
// verbatim: "a pure, extracted, exhaustive switch over a server-authoritative discriminated union,
// node-testable with no SSE"). This is the ONE sanctioned place stream/canon events touch client
// state (gate `no-inline-cache-surgery-in-stream` scopes to subscription bodies — which must contain
// NOTHING but a call to this reducer):
//   • stream-transient events → the chat-stream store (the sanctioned LOCAL buffer, §11.1) —
//     slot lifecycle is owned by the TERMINAL turn events;
//   • canon events → `invalidate(event)` through the central seam (buffer-local + invalidate,
//     never a second store — gate `bus-onData-no-store-write`).
// The switch ends in `assertNever` (§7.5): a new `ChatBusEvent` member fails `tsc` here until the
// reducer says what it does — and the seam's map fails in parallel until it says what it refetches.

import type { ChatBusEvent, ChatWarningCode } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import type { ChatStreamApi } from "#state";

export interface ChatBusDeps {
  readonly stream: ChatStreamApi;
  /** The central seam's bus half (`createInvalidation().invalidate`). */
  readonly invalidate: (event: ChatBusEvent) => void;
  /** Optional user-visible surfacing for domain warnings (e.g. `image_dropped`). */
  readonly onWarning?: (code: ChatWarningCode, chatId: ChatId) => void;
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
      deps.invalidate(event);
      return;

    // ── Canon / attachment / lifecycle — refetch via the one seam ──
    case "messageCommitted":
      // The composer's clear-on-commit signal (UI-Gates §11.1): a USER-role commit is the caller's own
      // just-sent row landing durably — fire the transient signal `use-send-message` correlates against
      // to clear the draft. Gated to `role==="user"` so the assistant's own later `messageCommitted`
      // (same chat, same turn) can't falsely satisfy it. `view` is optional on the wire ("absent only
      // if the row raced a delete"); a missing view is inconclusive → don't clear (benign: the draft
      // stays, worst case a manual clear — never a wrong clear). NOTE (client-identity, task #50): the
      // order+role match is correct for the solo / single-outstanding-send case this spine targets;
      // disambiguating the caller's OWN row from ANOTHER human member's user row in a shared chat needs
      // `view.authorUserId` vs the current principal — blocked on the client auth/session store (task
      // #50), NOT fabricated here.
      if (event.view?.role === "user") {
        deps.stream.notifyUserMessageCommitted(event.chatId);
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
    // The five WiBusEvent members are REAL (tsc proves them): biome's resolver can't follow the
    // `#world-info` subpath ChatBusEvent embeds them through, so its narrowed union calls them
    // unreachable (and noSecrets pattern-matches one discriminator). Suppressed per line below.
    // biome-ignore lint/suspicious/noUnnecessaryConditions: see the WiBusEvent note above.
    case "wiBookAttached":
    // biome-ignore lint/suspicious/noUnnecessaryConditions: see the WiBusEvent note above.
    case "wiBookDetached":
    // biome-ignore lint/suspicious/noUnnecessaryConditions: see the WiBusEvent note above.
    case "wiEntryAttached":
    // biome-ignore lint/suspicious/noUnnecessaryConditions: see the WiBusEvent note above.
    case "wiEntryDetached":
    // biome-ignore lint/suspicious/noUnnecessaryConditions: see the WiBusEvent note above.
    // biome-ignore lint/security/noSecrets: a bus discriminator, not a secret.
    case "wiEntryScopeChanged":
    case "chatCreated":
    case "chatDeleted":
    case "chatOpened":
    case "historyTruncated":
    case "chatUpdated":
      deps.invalidate(event);
      return;

    default:
      assertNever(event);
  }
}
