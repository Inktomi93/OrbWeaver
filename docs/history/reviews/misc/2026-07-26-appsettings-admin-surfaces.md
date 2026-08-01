# Stint 2 — manifest ③: the three UI-less AppSettings admin surfaces (design + forks)

Lane: Phase B settings-surface. Scope: memoryDefaults (11 knobs) + memorySummarizer + rateLimits admin
surfaces, landed as SECTIONS in the existing admin pane via the stint-1 settings-section seam (new `"admin"`
anchor). Plus: DELETE `rateLimits.general`, ADD + WIRE `rateLimits.login`. Prune B2:* gate entries.

## Design call + forks

### Fork 1 — floor-vs-override honesty needs a stored-blob read (RESOLVED in-lane)
`getAppSettings` returns ONLY the resolved `EffectiveAppConfig` (floor ⊕ override merged, indistinguishable
— the existing system pane explicitly DEFERS the per-field floor annotation for this reason,
`system-settings-surface.tsx` header). The coordinator's HONESTY REQUIREMENT (show floor vs active override
+ a real "clear override" = write the `null` sentinel) can't be met against the resolved read alone.
Resolution: add an additive admin read `getAppSettingsWithOverrides` → `{ resolved: EffectiveAppConfig,
overrides: AppSettings }` (the stored blob is already readable server-side via `readAppOverrideRaw` +
`parseAppSettings`; no new persistence). `overrides.<field> != null` ⇒ an active override; `null`/absent ⇒
the floor governs. A pure additive admin-gated read (mirrors `getAppSettings`), not auth/security-sensitive
→ in-lane. The existing system pane stays on `getAppSettings` (out of scope, untouched).

### Fork 2 — section OWNERSHIP: all three in features/user-admin (deviates from the lean, on purpose)
The coordinator leaned "memoryDefaults/memorySummarizer contributed by CHAT". Two facts override that:
(a) these are the ADMIN memory-tuning TIER (`AppSettings.memoryDefaults`/`memorySummarizer`, admin-only,
b-nature override/floor) — a DIFFERENT concept from the per-user `UserSettings.memory.enabled` chat owns
(stint 1). Admin-tier config's truer owner is `features/user-admin` (it owns the admin pane +
`use-admin-mutations` + every AppSettings-adjacent admin surface). (b) The `knob-wire-coverage` arm B2 scope
is `features/(settings|user-admin)` BY DESIGN — the gate encodes "AppSettings admin knobs are written from
admin surfaces". Homing the memory sections in `features/chat` would put their write OUTSIDE arm B2's scope,
so a prune would leave them MISSING-RED — and widening the gate to make my own fix pass is a banned
enforcement-weakening. So all three sections are user-admin-owned. This keeps the per-domain contribution
SPIRIT (they're contributions through the seam, not god-feature growth) while respecting the admin-tier
ownership the gate already encodes.

### Fork 3 — memoryDefaults FLOOR home (one-home derive)
The 11-knob floor lived server-only (`domain/chat/memory/constants.ts DEFAULTS`), unreachable by the client
pane that must display it. Homed `DEFAULT_MEMORY_DEFAULTS` in `@orb/contracts/settings` (beside
`memoryDefaultsSchema`); server `constants.ts DEFAULTS` re-points to it (kills the doubling, derive-don't-
redeclare). memorySummarizer floor: `maxTokens` floor = the server `DEFAULT_OUTPUT_RESERVE_TOKENS = 1024`;
homed `DEFAULT_MEMORY_SUMMARIZER = { maxTokens: 1024 }` in contracts; `temperature` unset = provider default
(shown as "provider default" in the pane, no fabricated number).

### rateLimits.login — PROCEEDS (no security-executor handoff)
A login limiter ALREADY EXISTS and enforces (`auth-routes.ts`: `LOGIN_RATE_SCOPE`, `createRateLimiter`,
`throttleLogin`, 429 + `securityEvent`). The code documents the exact wiring (line 211-213): thread
`() => settings.getEffectiveConfig().rateLimits.login` in place of the `LOGIN_MAX_PER_WINDOW` constant. This
is config-wiring into EXISTING enforcement, not NEW auth-route enforcement → in-lane per the coordinator's
rule. Loosens nothing (default stays 10/min).

### rateLimits.general — DELETE (owner-final)
Never consumed (L1-verified; `rate-limit-gate.ts` NOTE documents it as unrecoverable-intent). Removed from
`rateLimitsSchema` + `ResolvedRateLimits` + the `resolveRateLimits` arm + the `RATE_LIMIT_GENERAL` env floor
+ default; the NOTE block updated; a standing-ruling note appended to D107.

## Seam extension
`SETTINGS_SECTION_ANCHORS` gains `"admin"` (one tuple entry). The contribution union stays single-shape
(`nav` + `body` per anchor); `admin` and `chat-behavior` share it. `adminPane` → `makeAdminPane(registry)`
factory (the `makeChatBehaviorPane` precedent); navs merged, registry threaded into `AdminSettingsSurface`.
