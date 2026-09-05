// The DEFAULT seed palette's display name, as the CLIENT spells it — ONE home for a value that was
// hardcoded at two call sites (#1667: `appearance-looks-section.tsx` used it as the active-card predicate,
// `looks-fold-caption.tsx` RENDERED it in the fold gloss, and neither knew about the other).
//
// IT IS A DELIBERATE MIRROR OF A SERVER CONSTANT, NOT A SECOND HOME. The value of record is the db seed
// row's (`THEME_HEARTH_NAME`, `packages/server/src/domain/settings/constants.ts`), which is what
// `settings.listThemes` actually returns. The client cannot import it — `@orb/server` is ABOVE `client`
// on the package cake and is not a runtime dependency — so the mirror is pinned instead:
// `tests/client/features/settings/lib/seed-theme-identity.test.ts` reads BOTH and fails the moment they
// diverge. A silent divergence is exactly the defect #1667 names: the Looks grid would show NO active
// card and the fold caption would say the wrong look, with every type and gate still green.
//
// WHY THE MIRROR AND NOT A MOVE DOWN TO `@orb/contracts` (the obvious one-home answer): the server
// constant's own header records the opposite ruling in place — "Not cross-boundary (the view's derived
// isSeed flag is what the client reads), so this lives here, not @orb/contracts." That ruling's PREMISE
// is now false (this file is the proof: the client reads the NAME, not a derived flag), but reversing a
// recorded ruling is not a lane's call. The fork — move the identity to contracts, or give the theme VIEW
// a derived `isDefault` flag so the client reads a flag again exactly as the header says it should — is
// the orchestrator's; this module is the reversible half that kills the duplication and makes the
// divergence LOUD in the meantime.

/** The ONE seed whose selection is spelled `null` — it IS the base `@theme`, so it has no `[data-theme]`
 *  block to select into. Every other theme (seed or owned) writes its own id. Mirrors the db seed row's
 *  `THEME_HEARTH_NAME`; the pin above is what keeps that true. */
export const HEARTH_NAME = "Hearth";
