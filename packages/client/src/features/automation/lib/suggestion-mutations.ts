// The S4 confirm/dismiss writes (`automation.confirmSuggestion` / `automation.dismissSuggestion`). Each is a
// module-scope `createEntityMutation` — the ONE mutation home (§13.1); TVars/TData are tRPC-INFERRED, so a
// wire reshape breaks here at compile time.
//
// NEITHER INVALIDATES ANYTHING, and that is the honest answer rather than an omission: a pending ask has NO
// query behind it. It lives in the server's in-RAM store (RULED F1) and reaches this tab as a host-only
// `suggestionRaised` bus event; the card's disappearance is the SOURCE's own state transition (the ask was
// taken — the take is what the mutation just did), not a refetch. The reads a CONFIRMED arm goes on to move
// — a committed turn, a lore entry, a background — are moved by that arm's own server-side writes and
// arrive on the chat bus that already covers them. `busDriven: true` says exactly that, and the XOR in the
// factory makes claiming both a type error.
//
// Both carry an `errorToast` because both have a REAL refusal path a host must see: take-once (someone
// already answered this card — possibly the host's own second click), TTL-swept, and the two typed
// re-check refusals (the rule was disabled; its author no longer hosts the room). A card that silently
// does nothing on click is the failure mode this toast exists to prevent.

import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

export const useConfirmSuggestion = createEntityMutation<
  inferInput<Trpc["automation"]["confirmSuggestion"]>,
  inferOutput<Trpc["automation"]["confirmSuggestion"]>
>({
  options: (trpc) => trpc.automation.confirmSuggestion.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't run that — the suggestion is no longer available.",
});

export const useDismissSuggestion = createEntityMutation<
  inferInput<Trpc["automation"]["dismissSuggestion"]>,
  inferOutput<Trpc["automation"]["dismissSuggestion"]>
>({
  options: (trpc) => trpc.automation.dismissSuggestion.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't dismiss that suggestion.",
});
