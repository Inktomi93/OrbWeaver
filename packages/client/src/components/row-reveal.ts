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
