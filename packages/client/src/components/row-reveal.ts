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

/** The CONFIG SETTING ROW's reveal (#866 §3.4 row chrome) — {@link ROW_REVEAL}'s NAMED-GROUP cousin,
 *  keyed on `group/setting` because a settings row nests inside containers that may themselves carry the
 *  bare `group` class: the bare-`group` variant matches ANY ancestor's hover, so one hovered wrapper
 *  would reveal every row's menu at once. Same opacity-only law (a display/visibility swap under a hover
 *  key is a hit-test oscillator), same reserved box (zero layout shift is the owner's bar — the slot is
 *  permanently in flow, only its paint fades). `has-[[data-popup-open]]` pins the reveal while the menu
 *  it wraps is OPEN, so the trigger cannot fade out from under its own popup when the pointer leaves.
 *  NO coarse arm here — the config row's coarse posture is `HIDE_AT_COARSE` (pointer-variants.ts) composed by the
 *  consumer (the rider: touch reaches Reset through the teacher's About door, never a rest-invisible
 *  control), which is `display`-based and legal because a media state cannot oscillate. */
export const SETTING_ROW_REVEAL =
  "opacity-0 transition-opacity duration-(--motion-fast) ease-out-expo group-hover/setting:opacity-100 group-focus-within/setting:opacity-100 has-[[data-popup-open]]:opacity-100";
