// @orb/contracts/plugin — lifecycle vocabulary shared across the boundary (the plugins-row CHECK in `@orb/db`
// derives from this tuple, the install verb records it, the read/list views surface it). Homed in contracts
// (not the domain) because `@orb/db` — BELOW server — must derive its CHECK from the ONE tuple, exactly the
// `ASSET_KINDS` precedent.

/** How the host obtained the bundle bytes (owner-ruled 2026-07-18 — first-party catalog seam). ADDITIVE axis
 *  (D86 resolution-discriminant precedent — the bundle-validate funnel stays source-agnostic; a new origin is
 *  just another byte source, never a re-shape or a second install path):
 *    - `"upload"` — a file the installer handed over (or an admin fan-out's bytes); has NO remembered URL.
 *    - `"url"` — fetched from an installer-supplied URL through the egress guard (U8 2b).
 *      The row records the URL it came from (`plugins.source_url`) so the auto update-check + one-click upgrade
 *      can re-fetch it re-paste-free. This is the honest origin the 2a placeholder deferred: 2a recorded a URL
 *      install as `"upload"` while the source-agnostic funnel was the only thing built; 2b makes it truthful.
 *  A future first-party catalog adds `"catalog"` the same way. INVARIANT (a `plugins` CHECK enforces it):
 *  `"upload"` is the ONE origin with no source URL — every non-upload origin carries one. */
export const PLUGIN_ORIGINS = ["upload", "url"] as const;
export type PluginOrigin = (typeof PLUGIN_ORIGINS)[number];

/** A plugin row's lifecycle status. `disabled` = installed/granted but not activated (the default —
 *  enabling is a second explicit act, like rules); `enabled` = resident + activated; `errored` = an
 *  activation failure or the crash-policy auto-disable. The `@orb/db` plugins-row CHECK derives from
 *  this tuple (ASSET_KINDS precedent — one home). */
export const PLUGIN_STATUSES = ["disabled", "enabled", "errored"] as const;
export type PluginStatus = (typeof PLUGIN_STATUSES)[number];
