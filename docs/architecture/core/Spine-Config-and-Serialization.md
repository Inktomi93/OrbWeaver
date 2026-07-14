---
kind: law
status: active
updated: 2026-07-13
---

# Orbweaver — Spine: Config, Settings, and Serialization

Canonical doc for spine §7.2 (settings/config) and §7.3 (serialization) — `AGENTS.md` §5.2/§5.3 point here. BUILT — current law.

## Settings / config / the env FOUR natures (spine §7.2)

Every config value has exactly one of four natures; misfiling one re-tangles the env layer.

| Nature | Home | Shape |
| - | - | - |
| (a) true env — boot/secret/identity | `foundation/env` (the ONE `process.env` reader; gates: `sole-env-reader` + biome `noProcessEnv`) | frozen zod schema; `superRefine` boot-fatality per `AUTH_MODE` |
| (a/seed) env → DB row once, then inert | `entry/boot/seed-credential.ts` (`OPENROUTER_API_KEY` → labeled credential) | the model env→DB pattern; the var wears no second hat at runtime |
| (b) runtime toggles | `domain/settings/effective-config/layer.ts` → `EffectiveAppConfig` | `override ?? floor` per field; stored `null` = CLEAR sentinel |
| (c) agent-sdk runner machinery | `infra/providers/backends/agent-sdk/env.ts` | backend-internal, NOT a settings tier; rebuilt every turn |
| (d) generation params | `UserIntent`/preset (`@orb/contracts/preset`) → per-backend translate | typed SDK Options, not env |

- **(b) floors have TWO origins** ("env is the floor" is only half-true, kept legible in `layer.ts`): env-mirrored fields read `foundation/env` (`corpusAutoindex`, `importSkipCharacters`, `logLevel`, the `RATE_LIMIT_*` budgets — deliberately boot-env, the limiter reads them); born-in-DB fields have a code floor only an admin override moves (`forbidExternalMedia`, `vllmConcurrency` — NO env var; the D17 governance floors derive from `@orb/contracts/settings`). `EffectiveAppConfig` is 15 fields (`corpusAutoindex`, `importSkipCharacters`, `logLevel`, `forbidExternalMedia`, `trustHtml`, `memoryDefaults`, `memorySummarizer`, `rateLimits`, `vllmConcurrency`, `allowNonOwnerLocalCompute`, `nonOwnerLocalComputeBudget`, `allowNonOwnerMaxProSub`, `localMultiUser`, `discreetLogin`, `maxImageBytes` — `packages/contracts/src/settings/index.ts:600` is the truth). There is NO `IMPORT_DEFAULT_SOURCE` tier.
- **(c) is THE CREDENTIAL FIREWALL** (security-load-bearing, D8): three per-turn subprocess-env builders + the `RESERVED_CLAUDE_ENV_KEYS` denylist + ephemeral `CLAUDE_CONFIG_DIR` isolation. The ordering-is-the-security law lives in that file's header — read it before touching; the sub OAuth token must stay structurally unreachable from a paid/local spawn. It's called "env" only because it *emits* env vars.
- **(d):** reasoning is typed SDK Options (`thinking`/`effort` via `translate.ts`); only output/context caps + compaction ride subprocess env, preset-sourced (env-*shaped* only at the wire). The `UserIntent.advanced.claudeEnv` escape hatch is filtered through `RESERVED_CLAUDE_ENV_KEYS` BEFORE the auth firewall applies — a preset can neither set auth/routing env nor strip the firewall.
- **Shared machinery:** all versioned blobs ride the ONE `defineVersionedConfig` primitive (`@orb/contracts/versioned-config`). Memory tuning splits write-side (`AppSettings.memoryDefaults`/`memorySummarizer`) vs read-side (`UserSettings.memory.enabled` per-user opt-out).

## Serialization / serde core (spine §7.3)

- **ONE canonical card:** `@orb/contracts/character`. The serde core is one file-pair home, `packages/server/src/kit/serde/card/` — tolerant IN-adapter `cardFromJson` (normalizes INTO the canonical model, never a parallel lossy shape) + strict OUT-emitter `buildCardV3` + `cardContentHash` (the single card-hash home; one emitter beside the one adapter). Co-location makes import → export → reimport a one-file invariant: the IN/OUT halves hash-mirror (the dedup property the determinism tests pin).
- **Lossiness closed:** `creator`/`cardVersion`/`regexScripts` are typed columns flat on the `characters` row (D28) — app-authored AND imported cards round-trip identically. `extensions` stays a JSON column reserved for genuinely-unknown vendor residue; there is NO `raw`-blob passthrough. Export serializes ACCEPTED `character_tags` names (pending tags are not serialized).
- **PNG codec:** `@orb/kit/png-card-chunk` — `readCardChunk`/`writeCardChunk` + `isPng`, a pure STRING engine (takes/returns card JSON as a string, never imports the card type — the layer-cake caveat). Byte surgery lives there; JSON parse + null-on-failure is the import parser's (`domain/import/substrate/card`); PNG packaging + DB reads are export's.
- **ST numeric role bimap:** `@orb/kit/message-role` (`messageRoleFromSt`/`messageRoleToSt`, D32) — the one home for `{0:system, 1:user, 2:assistant}`.
- **Preset shape:** ST semantics (`injection_order`/`injection_trigger`/`forbid_overrides`, …) are fully modeled in `@orb/contracts/preset` — no separate client-side ST mapper.
