// The character-refusal mapper — the ONE place a typed `character.*` refusal becomes user copy (#542).
//
// THE DEFECT IT EXISTS FOR: `character.create` already refused a duplicate handle with a fully structured
// answer — `{"message":"a character with handle X already exists","reason":"handle_conflict"}` — and the
// client threw the discriminator away, printing the mutation's generic "Couldn't create the character." So
// the ONE failure the user can actually fix (the name is taken; the handle is derived from it) read exactly
// like a server fault they cannot. Rename had the same hole with the same code.
//
// SHAPE: the `turn-abort-notice.ts` mapper, verbatim — key on the tRPC error's `data.reason` (the transport
// formatter's honest domain code, `transport/trpc/error-mapping.ts`), never on message text; keep the copy
// CLIENT-side keyed by code rather than echoing the server's sentence (a domain message names a `handle`,
// which is an internal derivation the create dialog never shows); fall through to the caller's own
// verb-specific fallback so a real fault still toasts unchanged.
//
// Pure, so it is unit-tested rather than CT'd: the CT QueryClient has no MutationCache seam, so toast copy
// is unobservable in a CT (the same reason the turn mapper is a unit — see its header).

import { CHARACTER_HANDLE_CONFLICT_OP_CODE, CHARACTER_HANDLE_RESERVED_OP_CODE } from "@orb/contracts/character";

/** The refusal reason off a tRPC error's `data.reason`, else `""`. The `turn-abort-notice.ts` reader. */
function reasonOf(error: unknown): string {
  const data = typeof error === "object" && error !== null && "data" in error ? (error as { data: unknown }).data : null;
  return typeof data === "object" && data !== null && "reason" in data && typeof (data as { reason: unknown }).reason === "string"
    ? (data as { reason: string }).reason
    : "";
}

/** The honest copy for a per-owner handle collision. Names the CAUSE in the user's own vocabulary (the name
 *  they typed, not the derived handle they never saw) and the one next step. The refusal is total — nothing
 *  was written — so it does not hedge about partial state. */
export const CHARACTER_HANDLE_CONFLICT_COPY = "You already have a character with that name. Pick a different name and try again.";

/** The honest copy for the synthetic group namespace. The app mints `__group__*` handles for group rooms, so
 *  a card may not claim one; again the fix is a different name. */
export const CHARACTER_HANDLE_RESERVED_COPY = "That name is reserved for group rooms. Pick a different name and try again.";

/**
 * The toast a `character.create` / `character.update` failure should show. Two coded refusals get copy that
 * names what is wrong and what to do; anything else falls through to the caller's verb-specific fallback, so
 * a genuine fault is never swallowed or re-labelled as a name problem.
 */
export function characterMutationToast(error: unknown, fallback: string): string {
  return characterRefusalCopy(error) ?? fallback;
}

/**
 * The same decision WITHOUT a fallback — `null` when the failure is not one of the coded, user-fixable
 * refusals. The New-character dialog renders this beside its name field: the dialog stays open on failure
 * and the fix is a field edit, so the surface the user is looking at owes the sentence too (WCAG 3.3.1). The
 * toast and the field line therefore quote ONE string, never two spellings of one refusal.
 */
export function characterRefusalCopy(error: unknown): string | null {
  switch (reasonOf(error)) {
    case CHARACTER_HANDLE_CONFLICT_OP_CODE:
      return CHARACTER_HANDLE_CONFLICT_COPY;
    case CHARACTER_HANDLE_RESERVED_OP_CODE:
      return CHARACTER_HANDLE_RESERVED_COPY;
    default:
      return null;
  }
}
