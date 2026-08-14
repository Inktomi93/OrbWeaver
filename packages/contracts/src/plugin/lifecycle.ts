// @orb/contracts/plugin — lifecycle vocabulary shared across the boundary (the plugins-row CHECK in `@orb/db`
// derives from this tuple, the install verb records it, the read/list views surface it). Homed in contracts
// (not the domain) because `@orb/db` — BELOW server — must derive its CHECK from the ONE tuple, exactly the
// `ASSET_KINDS` precedent.

/** How the host obtained the bundle bytes (owner-ruled 2026-07-18 — first-party catalog seam). RESERVED
 *  SINGLE-ARM (D86 resolution-discriminant precedent): v1 has ONE arm, `"upload"`; a future first-party
 *  catalog adds `"catalog"` as an ADDITIVE member (never a re-shape, never a second install path — the
 *  bundle-validate funnel stays source-agnostic, a catalog fetcher is just another byte source). */
export const PLUGIN_ORIGINS = ["upload"] as const;
export type PluginOrigin = (typeof PLUGIN_ORIGINS)[number];

/** A plugin row's lifecycle status. `disabled` = installed/granted but not activated (the default —
 *  enabling is a second explicit act, like rules); `enabled` = resident + activated; `errored` = an
 *  activation failure or the crash-policy auto-disable. The `@orb/db` plugins-row CHECK derives from
 *  this tuple (ASSET_KINDS precedent — one home). */
export const PLUGIN_STATUSES = ["disabled", "enabled", "errored"] as const;
export type PluginStatus = (typeof PLUGIN_STATUSES)[number];
