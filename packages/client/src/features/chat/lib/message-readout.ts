// The metadata row's per-message readouts: who stopped a reply and the server-counted number, plus the gate for the
// on-demand settled-cost readout.
//
// PURE + PROP-DRIVEN, the `gen-duration.ts` precedent: these unit-test without a render, and the row stays
// a formatter over data it is handed.
//
// THE OUTCOME NOTICE WAS KILLED (#1876, owner ruling). The "cut off — length cap" badge caused confusion
// (not role-gated, an edit triggered it, unreadable on some themes) and was removed entirely.
// `messageOutcomeNotice`, `MessageOutcomeNotice` and the supporting types were deleted in the same commit.
// A stop the reader pressed is not that notice: it reads the stored abort reason, never a finish reason or an edit, and
// it is a neutral mark, not a badge about the model's output.

import type { MessageView, TurnAbortReason } from "@orb/contracts/chat";
import { builtinProvider } from "@orb/contracts/inference";

const READER_STOP = "user" satisfies TurnAbortReason;

/** Whether the reader's Stop ended this swipe's generation. The engine stores the abort reason that cut a kept reply as its
 *  terminal reason, and a reply continued past its stop is no longer the reply the reader stopped. */
export function readerStoppedReply(message: MessageView): boolean {
  return message.terminalReason === READER_STOP && !message.hasContinuation;
}

/** The server-counted #n of a row; null until a read numbers it, as with the rows `startChat` seeds into the cache. */
export function messageNumberLabel(message: MessageView): string | null {
  return message.position === undefined ? null : `#${message.position}`;
}

/** Whether a swipe can be settled against an upstream cost at all — the ONE home for the per-message
 *  cost affordance's gate, read by `MessageCostReadout` AND by the metadata row that decides whether to hand
 *  it a slot (two spellings of the same question is how a dangling trigger, or a `·` with nothing after it,
 *  ships). It lives in this pure lib rather than beside the component because a `.tsx` module may export only
 *  components (the react-refresh boundary rule), and because it unit-tests without a render.
 *
 *  GATED ON THE PROVIDER'S DIALECT, NOT ON THE ID. `generation_id` used to be written only by the OpenRouter
 *  transport, so "an id is present" WAS "this is an OpenRouter row"; the record-truth landing (inference audit
 *  B7) made the column the provider's own response id on EVERY hosted wire, so an Anthropic swipe now carries
 *  a `msg_…` there. `connection.generationCost` is an OpenRouter-only diagnostic — every other row gets
 *  `requireOpenRouter`'s typed refusal (`inference/backends/openai-compat/diagnostics.ts`) — so keying the
 *  reveal off the id offers a button whose only possible outcome is "cost n/a".
 *
 *  A provider id that is not a SHIPPED row (a plugin/admin registry row) resolves `undefined` and is hidden:
 *  the client has no synchronous registry for runtime rows, and hiding a button that would have worked is the
 *  honest direction to miss in — the other one spends a paid upstream call to display a refusal. */
export function canRevealGenerationCost(message: MessageView): boolean {
  const { generationId, connectionId, provider } = message;
  if (generationId === null || connectionId === null || provider === null) {
    return false;
  }
  return builtinProvider(provider)?.dialect === "openrouter";
}
