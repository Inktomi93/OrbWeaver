// The AppSettings floor-merge moved config resolution into the settings domain's
// effective-config/ subsystem (docs/law/Tier-2-Foundation.md "does NOT own"). This tier keeps only the outbound
// app IDENTITY strings.
//
// `APP_VERSION` IS GONE (2026-09-18, the build-identity work). It read `packages/server/package.json`'s
// `version` — a workspace manifest nobody bumps, permanently `0.0.0` — while the release number the owner
// tags lives in the ROOT manifest. Two homes for one concept, and the wrong one was the one the tracer and
// the `/api/_debug/config` probe reported. Both now read `#foundation/version`, the single derivation that
// also answers `/healthz`, the boot line, the bug bundle and Settings → About.

/** App identity for outbound provider attribution (OpenRouter's `HTTP-Referer` / `X-Title` — the app's
 *  name + URL that appear on OpenRouter's leaderboard and let it attribute/scope our traffic). Not a
 *  setting: a static build-time identity. Edit if the canonical site/name changes. */
export const APP_NAME = "Orbweaver";
export const APP_URL = "https://github.com/Inktomi93/orbweaver";
