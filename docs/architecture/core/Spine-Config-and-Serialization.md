---
kind: law
status: active
updated: 2026-08-22
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
| (c) agent-sdk runner machinery | `packages/inference/src/backends/agent-sdk/env.ts` | backend-internal, NOT a settings tier; rebuilt every turn |
| (d) generation params | `UserIntent`/preset (`@orb/contracts/preset`) → per-backend translate | typed SDK Options, not env |

- **(b) floors have TWO origins** ("env is the floor" is only half-true, kept legible in `layer.ts`): env-mirrored fields read `foundation/env` (`corpusAutoindex`, `importSkipCharacters`, `logLevel`, the `RATE_LIMIT_*` budgets, `AGENT_SDK_SUMMARIZE_CONCURRENCY`, `VLLM_GEN_PRESENCE_PENALTY` — deliberately boot-env); born-in-DB fields have a code floor only an admin override moves (`forbidExternalMedia`, `vllmConcurrency`, `promptTransformDeadlineMs`, … — NO env var; the D17 governance floors derive from `@orb/contracts/settings`). `EffectiveAppConfig` currently has 25 fields; `structuredOutputShape`, `structuredOutputVehicle`, and `promptCacheMinDepth` are among them. The `EffectiveAppConfig` interface in `packages/contracts/src/settings/index.ts` is the inventory (a line-number cite rots; the interface name does not). There is NO `IMPORT_DEFAULT_SOURCE` tier.
- **(c) is THE CREDENTIAL FIREWALL** (security-load-bearing, D8): three per-turn subprocess-env builders + the `RESERVED_CLAUDE_ENV_KEYS` denylist + ephemeral `CLAUDE_CONFIG_DIR` isolation. The ordering-is-the-security law lives in that file's header — read it before touching; the sub OAuth token must stay structurally unreachable from a paid/local spawn. It's called "env" only because it *emits* env vars.
- **(d):** reasoning is typed SDK Options (`thinking`/`effort` via `translate.ts`); only output/context caps + compaction ride subprocess env, preset-sourced (env-*shaped* only at the wire). The `UserIntent.advanced.claudeEnv` escape hatch is filtered through `RESERVED_CLAUDE_ENV_KEYS` BEFORE the auth firewall applies — a preset can neither set auth/routing env nor strip the firewall.
- **Shared machinery:** all versioned blobs ride the ONE `defineVersionedConfig` primitive (`@orb/contracts/versioned-config`). Memory tuning splits write-side (`AppSettings.memoryDefaults`/`memorySummarizer`) vs read-side (`UserSettings.memory.enabled` per-user opt-out).
- **DEGRADING IS A READ-ONLY PRIVILEGE (#471).** `parse` always returns a valid `T` — an unreadable stored blob renders as defaults instead of 500ing. A read-modify-WRITE that persists that stand-in destroys the user's real blob silently and permanently (the proven cause of the #461 settings wipe). So every write seam distinguishes three outcomes — **row absent** (a first write is legitimate) · **intact** (normal read-modify-write) · **degraded** (REFUSE; the bytes are what they are, so re-reading cannot help) — via `parseOutcome`'s provenance, never by convention. Enforcer: the write seams refuse at the write itself, so the guard is total over every present and future caller of each seam — the two settings whole-blob writers (`domain/settings/persistence/queries.ts::writeUserConfig` / `writeAppOverride`) and, for `presets.config`, `domain/preset/persistence/queries.ts::updatePresetRow` (#1026: the editor's degraded GET → whole-blob PUT is the same class one hop out over the wire). The refusal is one home (`packages/server/src/kit/stored-config/index.ts` → `DomainOperationError(stored_config_unreadable)`; it moved out of `domain/settings/substrate/` when preset became the second caller, since a domain→domain value import is dep-cruiser RED), pinned at `tests/server/kit/stored-config.test.ts` + `tests/server/domain/settings/persistence/queries.int.test.ts` + `…/verbs/update-user-settings-section.int.test.ts` + `tests/server/domain/preset/persistence/queries.int.test.ts`. **THE GUARD'S PREMISE IS DESCENT, NOT THE COLUMN**: a write whose content does not descend from a read of the row it replaces (a packaged constant, a `reset` verb's schema default, an uploaded backup file) carries no stand-in to persist, and guarding it would close the user's own explicit repair while preventing no loss — those writers are separated by NAME (`replacePresetConfig`, the two `reseed*` queries) and recorded as exact `json-column-write-parity` grants in `tooling/src/verify/lib/reviewed-grants.ts`; central authority checks that each permission still binds.

## Serialization / serde core (spine §7.3)

- **ONE canonical card:** `@orb/contracts/character`. The serde core is one file-pair home, `packages/server/src/kit/serde/card/` — tolerant IN-adapter `cardFromJson` (normalizes INTO the canonical model, never a parallel lossy shape) + strict OUT-emitter `buildCardV3` + `cardContentHash` (the single card-hash home; one emitter beside the one adapter). Co-location makes import → export → reimport a one-file invariant: the IN/OUT halves hash-mirror (the dedup property the determinism tests pin).
- **Lossiness closed:** `creator`/`cardVersion`/`regexScripts` are typed columns flat on the `characters` row (D28) — app-authored AND imported cards round-trip identically. `extensions` stays a JSON column reserved for genuinely-unknown vendor residue; there is NO `raw`-blob passthrough. Export serializes ACCEPTED `character_tags` names (pending tags are not serialized).
- **PNG codec:** `@orb/kit/png-card-chunk` — `readCardChunk`/`writeCardChunk` + `isPng`, a pure STRING engine (takes/returns card JSON as a string, never imports the card type — the layer-cake caveat). Byte surgery lives there; JSON parse + null-on-failure is the import parser's (`domain/import/substrate/card`); PNG packaging + DB reads are export's.
- **ST numeric role bimap:** `@orb/kit/message-role` (`messageRoleFromSt`/`messageRoleToSt`, D32) — the one home for `{0:system, 1:user, 2:assistant}`.
- **Preset shape:** ST semantics (`injection_order`/`injection_trigger`/`forbid_overrides`, …) are fully modeled in `@orb/contracts/preset` — no separate client-side ST mapper.
