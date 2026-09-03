// The cross-process CT run identity. The verify launcher opens exactly one reports/runs/ct slot, then
// Playwright's config, reporter and workers adopt it through these two environment keys.

/** Absolute directory of the CT invocation's run slot. */
export const CT_RUN_SLOT_ENV = "CT_RUN_SLOT_DIR";

/** Newline-separated concurrent-run labels captured when the launcher opened that slot. */
export const CT_RUN_RACING_ENV = "CT_RUN_SLOT_RACING";
