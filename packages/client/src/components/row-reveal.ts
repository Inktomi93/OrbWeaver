// ROW_REVEAL — the ONE hover-reveal posture for a row's trailing action cluster (rest hidden, revealed on
// the row's `group` hover/:focus-within, always-on for coarse pointers). Homed client-shared beside
// RowActionsMenu (its primary consumer) so the character-card CTA and the ⋯ trigger can't drift
// (derive-modernization §W5 item 8 — a candidate client-side G25 skin-fragment signature later). Requires
// the row root to carry `group` (the reveal keys on `group-hover`/`group-focus-within`).
export const ROW_REVEAL =
  "opacity-0 transition-opacity duration-(--motion-fast) ease-out-expo group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100";
