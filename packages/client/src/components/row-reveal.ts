// ROW_REVEAL — the ONE hover-reveal posture for a row's trailing action cluster (rest hidden, revealed on
// the row's `group` hover/:focus-within, always-on for coarse pointers). Homed client-shared beside
// RowActionsMenu (its primary consumer) so the character-card CTA and the ⋯ trigger can't drift
// (derive-modernization §W5 item 8 — a candidate client-side G25 skin-fragment signature later). Requires
// the row root to carry `group` (the reveal keys on `group-hover`/`group-focus-within`).
//
// `pointer-events-none` at rest (side-eye P3): an INVISIBLE control must not be hit-testable — an
// opacity-0 button still swallowed clicks aimed at the row body underneath/beside it, and (once the
// cluster floats over the text column, `ListRow.actionsFloat`) that dead zone would cover real text.
// Every arm that restores the opacity restores the hit-testing with it.
export const ROW_REVEAL =
  "pointer-events-none opacity-0 transition-opacity duration-(--motion-fast) ease-out-expo group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 pointer-coarse:pointer-events-auto pointer-coarse:opacity-100";
