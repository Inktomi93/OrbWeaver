// The ratified SELECTION-RAIL carrier set, as a CSS selector — the population design-audit's two §6
// accent-border bans are exempt on (owner ruling 2026-08-22, issue #485).
//
// WHY IT IS A MODULE AND NOT A LINE IN THE WALKER (#1823). The walker is a JS SOURCE STRING (ops/walker/
// core.ts, `WALKER_PRIMITIVES`), so a selector spelled there is unreachable from any test: the only way to
// prove the exemption still declines an UNSELECTED carrier and a NON-carrier rounded box is to run the
// same string a browser runs. Hoisting it here — the `INTERACTIVE_SELECTOR_JS` precedent, interpolated at
// the same seam — makes the control possible; the planted-control arm lives in
// tests/client/features/config/components/config-list-collection-group.ct.tsx, which is where the real
// carriers render.
//
// BOTH HALVES OF EVERY CLAUSE ARE LOAD-BEARING: the slot identity says the element is a ratified carrier,
// `[data-selected]` says it is in the selection STATE. Drop the state half and an unselected row's
// hardcoded accent goes unjudged; drop the slot half and the exemption becomes the rule's real target.
//
// THE RULING SURVIVES — ITS INPUT GAINED A CARRIER (#1823). #485 exempted the idiom while it had exactly
// one carrier, the `ListRow`; #1725 left the config LIST with no marked location at all, and the fix gave
// the config BAND the identical class pair through `@orb/ui`'s `SELECTION_RAIL` fragment. The exemption is
// about the IDIOM, so its population follows the FRAGMENT's carriers rather than one primitive's slots.
// A new carrier of `SELECTION_RAIL` owes a clause here, or the audit reports an owner ruling as a tell.
export const SELECTION_RAIL_SEL =
  "[data-slot='list-row-root'][data-selected],[data-slot='list-row-body'][data-selected],[data-slot='config-band'][data-selected]";
