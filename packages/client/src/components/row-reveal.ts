// ROW_REVEAL — the ONE hover-reveal posture for a row's trailing action cluster (rest hidden, revealed on
// the row's `group` hover/:focus-within, always-on for coarse pointers). Homed client-shared beside
// RowActionsMenu (its primary consumer) so the character-card CTA and the ⋯ trigger can't drift
// (derive-modernization §W5 item 8 — a candidate client-side G25 skin-fragment signature later). Requires
// the row root to carry `group` (the reveal keys on `group-hover`/`group-focus-within`).
//
// OPACITY ONLY — the rest-inertness side-eye P3 asked for is homed on the FLOAT arm of `listRowVariants`
// (`ListRow.actionsFloat`), not here. P3's harm is a hidden cluster covering the text column, which exists
// only when the cluster is lifted out of flow; that arm makes the whole cluster (wrapper AND children)
// non-hit-testable at rest and restores both on the row's hover/:focus-within. An IN-FLOW cluster overlays
// nothing — its wrapper reserves its own strip and is hit-testable regardless of what its children declare,
// so per-child `pointer-events-none` there protected nothing while it broke the control's hit target at
// rest: a hit-test taken BEFORE the pointer arrives (Playwright's actionability check, and any assistive /
// programmatic click) resolves to the wrapper and the control becomes unreachable. Proven by the
// library→chat CTA, which a real pointer clicks fine but `locator.click()` could never reach.
export const ROW_REVEAL =
  "opacity-0 transition-opacity duration-(--motion-fast) ease-out-expo group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100";

/** ROW_REVEAL's other half — for the rest-visible MARKER whose datum the revealed control also carries (a
 *  starred row's title-line ★ and the star toggle in the floated cluster are one concept). The marker shows
 *  exactly when the cluster is hidden and yields exactly when it reveals, so the row never paints the same
 *  state twice. Keyed on `group/row` (the `@orb/ui` ListRow root) rather than the consumer's bare `group`,
 *  because a marker on the title line sits INSIDE the row body, which is its own unnamed group.
 *
 *  LAYOUT STABILITY IS THE LAW HERE — the hover arms are `invisible` (visibility, which RESERVES the box),
 *  never `hidden` (display, which removes it). A display-swap keyed on hover is a hit-test OSCILLATOR: the
 *  marker leaves layout, the title line reflows, a span/flex boundary slides across the stationary pointer,
 *  hover recomputes, the marker returns, and the row flips at frame rate. MEASURED on the preset list
 *  (2026-08-02, real mouse): ~1,727 pointerover/out pairs, ~85 crossings/sec, with ZERO DOM mutations — pure
 *  CSS, no React involved, and invisible to every CT (a synthetic pointer does not re-hit-test on layout
 *  shift). `pointer-coarse:hidden` stays `display` on purpose: a media state is not hover-variable, so it
 *  cannot oscillate, and at coarse the always-visible cluster means the marker's box would be dead air. */
export const ROW_REVEAL_SWAP = "group-hover/row:invisible group-focus-within/row:invisible pointer-coarse:hidden";

/** ROW_REVEAL_SWAP's COARSE-COLLAPSE twin — the marker that must SURVIVE a coarse pointer.
 *
 *  `ROW_REVEAL_SWAP`'s `pointer-coarse:hidden` rests on one premise: at coarse the reveal cluster is
 *  permanently visible, so the control that carries the same datum is on screen and the marker's box would
 *  be dead air. `ROW_ACTION_INLINE` (below) DELETES that premise for the rows it collapses — their state
 *  toggle stands down at coarse and the datum moves into the overflow menu, which is closed. A row that
 *  keeps `ROW_REVEAL_SWAP` there paints NEITHER: measured on the 320px chats roster, a starred chat showed
 *  no star at all. So a collapsing row's marker swaps on hover ONLY, and coarse keeps it permanently. */
export const ROW_REVEAL_SWAP_COARSE_KEEP = "group-hover/row:invisible group-focus-within/row:invisible";

// ── THE COARSE COLLAPSE (side-eye 2026-08-07) ────────────────────────────────────────────────────────
// THE RULE: at `pointer: coarse`, a row's SECONDARY affordances collapse into its ONE overflow control.
//
// WHY it is a rule and not a taste: at coarse every icon button is 44-48px by token construction (D62 P1,
// the touch floor) while the row is 320px wide. Measured on the shipped tree at 320: the persona row spent
// 102px of a 272px rail on Unfavorite + kebab and left the NAME 38px ("Traveler" rendered "T.."); the chats
// roster spent 96px of 296px on a permanently-visible empty star + kebab and left
// "Example — The Ashen Spire" 62px. Both clusters exist because `ROW_REVEAL` turns hover-revealed controls
// permanently ON at coarse — the affordance is right, the BUDGET is not. The row's kebab is already the
// ruled home for a low-frequency row verb (§12.2), so the collapse costs one tap and buys back ~50-100px
// of the only column a phone reader is actually reading.
//
// CSS-ONLY, BY LAW: pointer/hover are axis-3 CAPABILITY (UI-Architecture §4b) — media-query-only, never a
// JS branch (`no-raw-matchmedia` keeps `matchMedia` inside app-shell). So the overflow menu carries the
// verb's MenuItem at ALL times and the two arms gate each other by display: exactly ONE of the pair is in
// the DOM's layout — and in the a11y tree, since `hidden` is `display:none` — for any given pointer class.
// That is what keeps this from becoming the double-telling the persona row's own header bans.

/** The INLINE arm of a collapsing pair: a secondary row control that stands down at `pointer: coarse`,
 *  where its twin `MenuItem` (wearing {@link ROW_ACTION_OVERFLOW}) is the one door. Goes on the control —
 *  or on a `<Row>` wrapping the several controls that collapse together.
 *
 *  ALSO THE FINE ARM OF A MARKER PAIR. A rest-visible marker whose fact is already named by an always-
 *  present control drops to ornament (`aria-hidden`) so the row never states one fact twice — but "always
 *  present" is a FINE-pointer claim once the row collapses: the control is `display:none` at coarse and its
 *  menu twin sits inside a CLOSED menu, so the ornament marker would be the row's only telling and it is
 *  unnamed. `aria-hidden` is a JS prop and cannot read a media query, so the two a11y arms are separate
 *  elements gated by display, exactly like the control pair — one in the a11y tree per pointer class.
 *  Live instance: the persona row's favorited heart. */
export const ROW_ACTION_INLINE = "pointer-coarse:hidden";

/** The OVERFLOW arm: the menu item that exists ONLY at `pointer: coarse`, standing in for the inline
 *  control that stood down — or (see {@link ROW_ACTION_INLINE}) the NAMED half of a marker pair, for the
 *  pointer class where no control is left to carry the name. Omit it where the menu ALREADY carries the
 *  verb for both pointers (the chats row's kebab keeps its Star item at every width by mirror-parity
 *  ruling — adding a coarse-only twin there would put the item in the menu twice). */
export const ROW_ACTION_OVERFLOW = "pointer-fine:hidden";
