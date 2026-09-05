// The cross-process CT run identity. The verify launcher opens exactly one reports/runs/ct slot, then
// Playwright's config, reporter and workers adopt it through these two environment keys.

/** Absolute directory of the CT invocation's run slot. */
export const CT_RUN_SLOT_ENV = "CT_RUN_SLOT_DIR";

/** Newline-separated concurrent-run labels captured when the launcher opened that slot. */
export const CT_RUN_RACING_ENV = "CT_RUN_SLOT_RACING";

/** Absolute directory this invocation builds its CT bundle in (#1581). The launcher mints one per run under
 *  `.cache/ct/` and `playwright-ct.config.ts` reads it into `use.ctCacheDir`; unset ⇒ playwright-ct's own
 *  `playwright/.cache` default, which is the SHARED dir two concurrent runners corrupted each other in. */
export const CT_CACHE_DIR_ENV = "ORB_CT_CACHE_DIR";
