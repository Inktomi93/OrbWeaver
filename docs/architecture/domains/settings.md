# Orbweaver — `settings`: the config-tier owner (AppSettings + UserSettings + the floor-merge)

> **Status: planning (authoritative detail).** The settings domain owns the two DB-backed config
> tiers — per-user `UserSettings` and admin-runtime `AppSettings` — plus the raw global KV escape
> hatch, the per-user/per-app **write serializers**, and the **floor-merge** (`env` floor ⊕ stored
> override → `EffectiveAppConfig`). It does NOT own the _shapes_ (those move to `@orb/contracts`) and it
> does NOT own `process.env` (that is `foundation/env`, the one reader). The defining move from
> neo-tavern: the schemas + the `defineVersionedConfig` primitive leave `shared/settings/` for
> `@orb/contracts` (the client needs them for forms), three **misfiled chat blobs** leave for
> `@orb/contracts/chat`, and the floor-merge (`server/config/app-config.ts`) folds INTO this domain as a
> named subsystem. Authoritative upstream: `AGENTS.md` §7.2 (the FOUR natures of config — the
> spine for this doc) + §4 (settings pain: "confirm the floor rule"); `core/Core-Core-Legacy-Migration-and-Gaps.md`
> §4 (`contracts/settings`, `contracts/versioned-config`, the chat-blob misfiling), §5
> (`loadUserSettings`, `requireAdmin`), §8 (boot order — `contracts/settings`
> depends on `contracts/chat`); `Core-0-Architecture-and-Structure.md` §4 (the 8-slot template) + §6 (partitioning) + §7 (gates);
> `domains.md` ("settings — keep — app + user setting tiers"). Read those first.

---

## What this domain owns

- **The `UserSettings` per-user tier** — `getUserSettings` (parsed+defaulted view; a never-touched
  account reads the defaults synthesized from `{}` with NO write, `updatedAt: 0`), `updateUserSettings`
  (whole-blob replace), `updateUserSettingsSection` (deep-merge ONE namespace + re-validate). The
  `user_settings` table (PK `userId`, a `schemaVersion` COLUMN + a `config` json blob) is owned here;
  `persistence/` is the only writer.
- **The `AppSettings` admin-runtime tier** — `getAppSettings` / `updateAppSettings` (both admin-gated).
  The stored OVERRIDE blob lives under the reserved `APP_SETTINGS_KEY` (`"app"`) row of the `settings`
  table; **env is the floor, the DB override wins** (resolved through `layer()` → `EffectiveAppConfig`).
  This tier also carries the **D17 owner-box governance toggles**: `allowNonOwnerLocalCompute` (default
  ON), a per-member local-compute turn/request **COUNT budget**, and `allowNonOwnerMaxProSub` (default
  OFF). They govern whether non-owner members may use the owner's shared local compute / `max-pro-sub`;
  the `max-pro-sub` mint itself stays `requireOwner` regardless (the toggles are box governance, not the
  mint gate).
- **The raw global KV escape hatch** — `getGlobalSetting` / `setGlobalSetting` over the `settings`
  table (a generic `key → json` store; `APP_SETTINGS_KEY` is RESERVED — the generic setter refuses it).
  The OR model-catalog snapshot row (`'openrouter-model-catalog'`) is a TENANT of this table but is
  OWNED by `connection` (its `persistence/catalog-snapshot.ts` reads/writes it — settings owns the
  table mechanism, not that blob's meaning).
- **The floor-merge** — `layer(overrides)` over `envDefaults()` → `EffectiveAppConfig`, plus the
  in-process resolved-config cache (sync `getEffectiveConfig()` for hot paths; async
  `reloadEffectiveConfig(db)` at boot + after every admin write; the `logger.level` rebind on reload).
  In neo-tavern this is `server/config/app-config.ts`; in orbweaver it folds into this domain as the
  `effective-config/` subsystem.
- **The two write serializers** — the per-user promise-chain (keyed by `userId`, shared by BOTH
  user-settings write verbs, so it lives on `context.ts`) and the single process-wide app-settings
  chain (one verb uses it → closure state in the verb). Both are `ASSUMES(single-replica)`.
- **`loadUserSettings`** — the lenient "read this user's typed blob" loader that chat + workloads also
  need; un-exiled from `_shared/user-settings.ts` into this domain, surfaced cross-feature by injection.

This domain does **not** own:

- **The config SHAPES.** `AppSettings`/`UserSettings` + their zod schemas + parsers + `MemoryDefaults`/
  `MemorySummarizerConfig`/`LogLevel`/the section unions → `@orb/contracts/settings` (the client needs
  them for the settings forms; flows DOWN to server + client). `EffectiveAppConfig` likewise.
- **The `defineVersionedConfig` primitive.** → `@orb/contracts/versioned-config` — the ONE
  versioned-blob+lift-loop engine shared by `AppSettings`, `UserSettings`, AND `PromptConfig` (preset).
  Boot-critical: it must exist before `contracts/settings` AND `contracts/preset` can compile.
- **The three misfiled "chat" blobs.** `room-overrides.ts`, `group-config.ts`, `opening-policy.ts`
  live in `shared/settings/` today but they are **chat shapes** — chatMetadata sub-blobs + a
  start-chat union consumed by chat verbs, chat assemble types, and client chat forms. They → `@orb/
contracts/chat`, NOT settings. (See "CONFLICT resolved" below.) `UserSettings.groupDefaults` merely
  _references_ `groupConfigSchema` — that reference is why `contracts/settings` depends on
  `contracts/chat` (the boot-order edge, §8 of the dissolution inventory).
- **`process.env`.** The one reader is `foundation/env` (un-moved `server/env.ts`), with its boot-fatal
  `superRefine` per `AUTH_MODE`. Settings reads `env` DOWN through the floor-merge; it never writes env.
- **The admin gate.** `requireAdmin` is the `admin` domain's; it is INJECTED into the app-settings
  verbs at the composition root (the app-settings tier and the admin gate are different concerns).
- **`logAudit`.** → `foundation/observability/audit` (fan-in 60); injected/called, not owned.
- **The HOMELESS agent-sdk runtime config** — see "the fourth nature" below. It is NOT a settings tier;
  it is a backend-internal config of the agent-sdk strategy (`infra/providers/backends/agent-sdk`, per
  DECISIONS-LEDGER §7 D8 — the `infra/providers/claude-sdk` name is DROPPED). Explicitly
  excluded from this domain.
- **Generation params** (`UserIntent`/preset) — the `preset` domain (`contracts/preset`). Not settings.

---

## The four natures of config (the spine — `core/AGENTS.md §7.2`)

Config in neo-tavern wears four distinct natures that were never named. Making them legible IS the
settings re-architecture. This domain owns exactly natures (b) and the read-side of (a/seed); the
others have homes elsewhere and are listed so the boundary is explicit.

| Nature                                | What it is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Home                                                                                                               | This domain's role                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| **(a) true env**                      | boot / secret / identity (`PORT`, `DATABASE_URL`, `CREDENTIALS_KEY`, `AUTH_MODE`, OIDC, rate-limit budgets). The one `process.env` reader; `superRefine` boot-fatality per `AUTH_MODE`.                                                                                                                                                                                                                                                                                                                                                                                                          | `foundation/env`                                                                                                   | reads it DOWN as the floor; never writes it                                                        |
| **(a/seed) env→DB-once**              | env that writes a DB row once then goes inert. **The model: `OPENROUTER_API_KEY` → a labeled `openrouter` credential.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `credentials` domain (`entry/boot/seed-credential.ts`)                                                             | NOT owned here — cited as the pattern the floor-merge generalizes; the _seed verb_ is credentials' |
| **(b) runtime toggles → AppSettings** | non-secret, non-bootstrap operational knobs an admin can flip at runtime; **env floor, DB override wins** via `layer()` + a versioned blob. Today: `corpusAutoindex`, `importSkipCharacters`, `logLevel`, `forbidExternalMedia`, `memoryDefaults`, `memorySummarizer` (**NOT `guidedActions`** — guided actions live ONLY on the preset, D33; the neo "AppSettings.guidedActions" fallback was a phantom). Orbweaver adds the **D17 owner-box governance toggles**: `allowNonOwnerLocalCompute` (default ON), the per-member local-compute COUNT budget, `allowNonOwnerMaxProSub` (default OFF). | **`settings` domain (AppSettings)**                                                                                | **OWNED — the core job.**                                                                          |
| **(c) agent-sdk runtime config**      | THE homeless nature: ~13 isolation pins + the 11-key reserved-denylist + the 3-mode credential firewall (200+ lines, security-load-bearing, rebuilt every turn). Called "env" only because it _emits_ env vars.                                                                                                                                                                                                                                                                                                                                                                                  | `infra/providers/backends/agent-sdk` (a named backend-internal config of the strategy, per DECISIONS-LEDGER §7 D8) | **NOT a settings tier — explicitly excluded.**                                                     |
| **(d) generation params**             | `UserIntent`/preset, translated per-backend (reasoning is typed SDK Options, not env).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `preset` (`contracts/preset`)                                                                                      | not owned here                                                                                     |

**The stranded (b) toggles (env-only today, SHOULD be AppSettings).** Three knobs are runtime-operational
in nature but live env-only with no DB override path: `IMPORT_DEFAULT_SOURCE`, `RATE_LIMIT_*`
(`GENERAL`/`AI_TURN`/`PUBLIC_IP`/`AUTHED`), and `VLLM_*_CONCURRENCY` (`EMBED`/`SUMMARIZE`). In orbweaver
each is a candidate AppSettings field (env floor preserved, admin override added). See Open decisions —
this is a wiring choice, not a foregone move (some, like the rate-limit budgets, may stay env if
hot-reloading them is undesirable).

**"env is the floor" is only half-true (make it legible).** `envDefaults()` returns seven fields but
only THREE are env-mirrored (`corpusAutoindex` ← `CORPUS_AUTOINDEX`, `importSkipCharacters` ←
`IMPORT_SKIP_CHARACTERS`, `logLevel` ← `LOG_LEVEL`). The other three are **born-in-DB defaults** with no
env source: `forbidExternalMedia: false`, `memoryDefaults: {}`, `memorySummarizer: {}`. The floor is
"env where an env var exists, else the baked-in default." Orbweaver
makes this explicit: env-mirrored fields read `env`; born-in-DB fields read schema defaults (not literal
objects buried in `envDefaults()`). See Open decisions.

---

## The 8-slot layout

```
domain/settings/
├── index.ts                      FRONT DOOR — the only legal external import
├── service.ts                    COMPOSITION ROOT — wires verbs + injected deps (requireAdmin, audit). ZERO logic.
├── context.ts                    DI BUNDLE — explicit SettingsContext interface; OWNS the per-user write serializer
├── contract/
│   ├── service.ts                SettingsService interface — read this to know everything the domain does
│   ├── params.ts                 UpdateUserSettingsInput, UpdateUserSettingsSectionInput
│   ├── results.ts                (thin today — views are the results; promote if a verb grows a non-view result)
│   ├── views.ts                  UserSettingsView, GlobalSettingView (read-models; config is parsed, never a raw blob)
│   └── errors.ts                 (no custom class today — the only failures are DomainOperationError(reserved_key)
│                                  + the injected requireAdmin throw; documented, not invented)
├── verbs/
│   ├── get-user-settings.ts      getUserSettings — parsed+defaulted view; defaults for a never-touched account
│   ├── update-user-settings.ts   whole-blob replace (serialized per user; stamps the service-owned schemaVersion)
│   ├── update-user-settings-section.ts  deep-merge ONE namespace + re-validate (serialized per user)
│   ├── global-settings.ts        getGlobalSetting / setGlobalSetting (the raw KV pair; reserved-key guard)
│   ├── app-settings.ts           getAppSettings / updateAppSettings (admin pair + the process-wide write chain)
│   └── load-user-settings.ts     loadUserSettings — the lenient typed-blob loader (injected into chat/workloads)
├── persistence/
│   └── queries.ts                readUserSettings · ensureUserSettings · writeUserConfig ·
│                                 readGlobalSetting · upsertGlobalSetting  (DB only — toView Json-validates at the seam)
├── substrate/
│   └── merge.ts                  deepMergeAppSettings (typed; null=clear) + deepMergePlain (untyped section patch)
└── effective-config/             NAMED subsystem: the floor-merge + the resolved-config cache
    ├── layer.ts                  envDefaults() (reads foundation/env) + layer(overrides) → EffectiveAppConfig
    └── cache.ts                  in-memory resolved cache; getEffectiveConfig() (sync) + reloadEffectiveConfig(db);
                                  the logger.level rebind. ASSUMES(single-replica) — annotated.
```

**Renamed subsystem — `effective-config/`:** the neo-tavern `server/config/app-config.ts` is a config
tier reaching across `env` + `db`; it folds into the settings domain as a named subsystem (the floor

- the sync cache). It is the read-side twin of the `app-settings` write verb — co-located so the
  "reload after every admin write" seam is auditable.

**Moved out of the source folder:** `merge.ts` moves under `substrate/` (it is pure feature-local
helper logic, zero I/O — the 8-slot template's `substrate/` slot). `README.md` is deleted (the contract

- this doc are the map; the structure IS the documentation per `core/Core-0-Architecture-and-Structure.md §7`).

---

## Public surface (`domain/settings/index.ts`)

```typescript
// Service
export { createSettingsService } from "./service";
export type { SettingsService, SettingsServiceDeps, SettingsContext } from "./contract/service";

// Verb params + views (type-only; client/transport consume these)
export type { UpdateUserSettingsInput, UpdateUserSettingsSectionInput } from "./contract/params";
export type { GlobalSettingView, UserSettingsView } from "./contract/views";
```

**`AppSettings`, `UserSettings`, `EffectiveAppConfig`, `MemoryDefaults`, `MemorySummarizerConfig`,
`LogLevel`, `UserSettingsSection`, and every settings zod schema/parser** live in
`@orb/contracts/settings` — they are cross-boundary types (the client's settings forms validate against
them). They are NOT re-exported from this front door; callers import from `@orb/contracts` directly
(same pattern as `createCharacterSchema`).

**`defineVersionedConfig` / `VersionedConfig` / `VersionedConfigDef`** live in
`@orb/contracts/versioned-config` — the shared primitive, consumed by `contracts/settings` AND
`contracts/preset`. Not a settings export.

**`getEffectiveConfig` / `reloadEffectiveConfig`** are surfaced on the `SettingsService` (and injected
where hot paths need the sync read — see composition). `loadUserSettings` is surfaced on the service +
injected into chat/workloads.

---

## Verbs (the `SettingsService` interface)

```typescript
SettingsService = {
  // UserSettings (per-user tier)
  getUserSettings(params: { userId: UserId }): Promise<UserSettingsView>
  updateUserSettings(params: { userId: UserId }, input: UpdateUserSettingsInput): Promise<UserSettingsView>
  updateUserSettingsSection(params: { userId: UserId }, input: UpdateUserSettingsSectionInput): Promise<UserSettingsView>
  loadUserSettings(userId: UserId): Promise<UserSettings>   // lenient typed-blob loader (injected cross-feature)

  // Raw global KV (settings table)
  getGlobalSetting(key: string): Promise<GlobalSettingView | null>
  setGlobalSetting(key: string, value: JsonValue): Promise<GlobalSettingView>   // refuses APP_SETTINGS_KEY

  // AppSettings (admin-runtime tier; requireAdmin injected)
  getAppSettings(params: { userId: UserId; callerRole?: UserRole }): Promise<EffectiveAppConfig>   // UserRole from @orb/contracts/identity
  updateAppSettings(params: { userId: UserId; callerRole?: UserRole }, partial: AppSettings): Promise<EffectiveAppConfig>

  // Floor-merge read side (effective-config subsystem)
  getEffectiveConfig(): EffectiveAppConfig            // SYNC — hot-path read of the in-memory cache
  reloadEffectiveConfig(): Promise<EffectiveAppConfig> // boot + after every admin write
}
```

**`getAppSettings` returns `EffectiveAppConfig` (resolved), `updateAppSettings` takes `AppSettings`
(the partial override).** The asymmetry is deliberate: the admin edits the _override blob_ (every field
optional/nullable) but always reads back the _resolved floor⊕override_ config. `updateAppSettings` is a
read-merge-write through the process-wide chain, then calls `reloadEffectiveConfig` so the sync cache and
`logger.level` reflect the write before the call returns.

**`getEffectiveConfig` is SYNC by design.** Hot paths (chat engine, the embedder, workload runners)
must read the resolved config without a per-call DB round-trip — they read the in-memory cache. The
cache is `ASSUMES(single-replica)`: an admin write busts only this process's copy (true per the
one-image deploy invariant; the DB row is the multi-replica seam if that's ever reversed).

**`callerRole` is the fast path:** the transport auth seam already resolved the caller's role into
`ctx.auth.role`; passing it to the admin verbs lets the injected `requireAdmin` skip its role SELECT.

---

## Movement table

| Unit                                                                                                                                                                                                                                                                                      | Outcome                               | Target                                                                                                | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Enforcement tier                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `shared/settings/versioned-config.ts` — `defineVersionedConfig`, `VersionedConfig`, `VersionedConfigDef`                                                                                                                                                                                  | → `contracts`                         | `@orb/contracts/versioned-config`                                                                     | The ONE versioned-blob+lift primitive shared by AppSettings/UserSettings/PromptConfig. The client needs it (it parses settings forms); it depends only on `kit/guards` (`isPlainObject`). **Boot-critical: must exist before `contracts/settings` and `contracts/preset`** (the most boot-fragile cross-slice edge, dissolution §8).                                                                                                                                                          | resolve-time: package dep; both contracts namespaces import it down                                           |
| `shared/settings/app-settings.ts` — `AppSettings`, `appSettingsSchema`, `parseAppSettings`, `APP_SETTINGS_SCHEMA_VERSION`, `APP_SETTINGS_LIFTS`, `appSettingsConfig`, `memoryDefaultsSchema`/`MemoryDefaults`, `memorySummarizerSchema`/`MemorySummarizerConfig`, `LOG_LEVELS`/`LogLevel` | → `contracts`                         | `@orb/contracts/settings`                                                                             | Cross-boundary: the client's server-settings surface (`use-app-settings`, the memory/guided-actions admin forms) validates against these. `foundation/env` also imports `LOG_LEVELS` DOWN.                                                                                                                                                                                                                                                                                                    | resolve-time: package dep; `no-inline-types` keeps the schema single-homed                                    |
| `shared/settings/user-settings.ts` — `UserSettings`, `userSettingsSchema`, `parseUserSettings`, `USER_SETTINGS_SCHEMA_VERSION`, `USER_SETTINGS_LIFTS`, `userSettingsConfig`, `DEFAULT_USER_SETTINGS`, `USER_SETTINGS_SECTIONS`/`UserSettingsSection`                                      | → `contracts`                         | `@orb/contracts/settings`                                                                             | 74 consumers across server + client; the per-user settings forms parse it client-side. The v1→v2 lift (flat→namespaced) moves with the schema.                                                                                                                                                                                                                                                                                                                                                | resolve-time: package dep                                                                                     |
| `shared/settings/{room-overrides,group-config,opening-policy}.ts`                                                                                                                                                                                                                         | → **`contracts/chat`** (NOT settings) | `@orb/contracts/chat`                                                                                 | **MISFILED.** chatMetadata sub-blobs + a start-chat union consumed by chat verbs, chat assemble types, and client chat forms — never the settings KV. The settings domain owns ONLY AppSettings/UserSettings. `UserSettings.groupDefaults` _references_ `groupConfigSchema`, which is why `contracts/settings` depends on `contracts/chat`.                                                                                                                                                   | resolve-time: package dep; dep-cruiser: `domain/settings/**` must not import these                            |
| `server/config/app-config.ts` — `envDefaults`, `layer`, `getAppConfig`, `reloadAppConfig`, `cache`, `__resetAppConfigCache`, `EffectiveAppConfig`                                                                                                                                         | fold INTO domain (type → contracts)   | `domain/settings/effective-config/{layer,cache}.ts`; `EffectiveAppConfig` → `@orb/contracts/settings` | The floor-merge is the read-side twin of `updateAppSettings`; it belongs with the tier it resolves. It reads `foundation/env` (down) + `db` (down) — legal. `EffectiveAppConfig` is cross-boundary (the client reads resolved app settings), so the TYPE goes to contracts while the resolver stays domain.                                                                                                                                                                                   | resolve-time (the resolver moves with the domain); the type is a package dep                                  |
| `server/config/app-config.ts` — `APP_SETTINGS_KEY = "app"` constant                                                                                                                                                                                                                       | stays domain feature                  | `domain/settings/effective-config/layer.ts` (or `contract/`)                                          | The reserved KV key for the AppSettings row; consumed by the global-settings reserved guard + the app-settings verb. A domain constant, not cross-boundary.                                                                                                                                                                                                                                                                                                                                   | lint-time: `no-inline-types`/single-home                                                                      |
| `domain/_shared/user-settings.ts` — `loadUserSettings`                                                                                                                                                                                                                                    | un-exiled → domain feature            | `domain/settings/verbs/load-user-settings.ts`                                                         | Lived in `_shared` only so chat + workloads could reach it without a sideways import. In orbweaver it is a settings verb; chat/workloads receive it through composition-root injection.                                                                                                                                                                                                                                                                                                       | resolve-time: `_shared` does not exist; `domain-no-cross-feature` enforces injection                          |
| `domain/settings/merge.ts` — `deepMergeAppSettings`, `deepMergePlain`, `isPlainObject`                                                                                                                                                                                                    | stays, relocated                      | `domain/settings/substrate/merge.ts`                                                                  | Pure feature-local merge helpers (zero I/O) → the `substrate/` slot. `isPlainObject` is a duplicate of `kit/guards.isPlainObject` — import the kit one, drop the local copy.                                                                                                                                                                                                                                                                                                                  | lint-time: `feature-structure` (pure helpers live in `substrate/`); `kit-purity` keeps the guard single-homed |
| `shared/settings/app-settings.ts` — `resolveGuidedActions` projection                                                                                                                                                                                                                     | **RETIRED** (was neo phantom)         | —                                                                                                     | **D33: guided actions have ONE home — the preset.** Neo's `resolveGuidedActions(appSettings)` read a `AppSettings.guidedActions` field that **never existed** (a phantom fallback). Orbweaver carries NO `AppSettings.guidedActions` and NO settings-side projection; resolution is `activePreset.guidedActions ?? DEFAULT_GUIDED_ACTIONS` at the preset/assembly consumer. `DEFAULT_GUIDED_ACTIONS`/`GuidedActionsConfig`/`guidedActionsSchema` live in `contracts/preset` (their one home). | n/a — nothing lands in `settings`                                                                             |
| `domain/_shared/admin.ts` — `requireAdmin`                                                                                                                                                                                                                                                | → `admin` domain; INJECTED here       | `domain/admin` (provides `requireAdmin`); injected into `settings.context`                            | The admin gate is a different concern from the AppSettings tier. The app-settings verbs receive `requireAdmin` as an injected op, not a sideways import.                                                                                                                                                                                                                                                                                                                                      | resolve-time: `domain-no-cross-feature`; the op type lives in `settings/contract`                             |
| `domain/_shared/audit.ts` — `logAudit`                                                                                                                                                                                                                                                    | → foundation; injected/called         | `foundation/observability/audit`                                                                      | fan-in 60; an observability concern read down by all. The settings verbs call it through the foundation tier (foundation is below domain).                                                                                                                                                                                                                                                                                                                                                    | resolve-time: tier order (domain → foundation is downward)                                                    |
| `context.ts` — `SettingsContext = ReturnType<typeof createSettingsContext>`                                                                                                                                                                                                               | stays domain feature, made explicit   | `domain/settings/contract/service.ts` — `export interface SettingsContext`                            | The inferred type is invisible at a glance; the explicit interface matches the template + satisfies `types-in-contract`.                                                                                                                                                                                                                                                                                                                                                                      | lint-time: `types-in-contract` / `no-inline-types`                                                            |
| `server/env.ts` (whole)                                                                                                                                                                                                                                                                   | stays a tier (un-moved)               | `foundation/env`                                                                                      | The one `process.env` reader; keep the `superRefine` boot-fatality per `AUTH_MODE`. Imports `LOG_LEVELS` from `contracts/settings` (down). NOT a settings-domain file.                                                                                                                                                                                                                                                                                                                        | resolve-time: `foundation` tier; gate that it is the sole `process.env` reader                                |
| `server/env.ts` — `IMPORT_DEFAULT_SOURCE`, `RATE_LIMIT_*`, `VLLM_*_CONCURRENCY`                                                                                                                                                                                                           | candidate promotion (b)               | `@orb/contracts/settings` AppSettings fields (env floor preserved)                                    | Stranded runtime toggles with no DB override path; nature-(b) by behavior. Each gets an env floor + an admin override. **Not a foregone move** — see Open decisions (rate-limit budgets may stay boot-env).                                                                                                                                                                                                                                                                                   | resolve-time (if promoted): the field joins `appSettingsSchema`; `layer()` resolves it env⊕override           |
| `db/schema/settings.ts` — `settings`, `userSettings` tables                                                                                                                                                                                                                               | stays db                              | `@orb/db/schema/settings`                                                                             | DB row definitions; persistence reads/writes them. The `user_settings.schemaVersion` COLUMN is load-bearing (the `storedVersion` source).                                                                                                                                                                                                                                                                                                                                                     | resolve-time: db tier                                                                                         |

---

## Cross-feature composition (the injection model)

The settings domain is **consumed by** `chat`, `workloads`, and `connection` (which read user/app
config), and it **depends on** `admin` (the gate) + `foundation/observability` (audit) + `foundation/env`
(the floor). None of these are sideways imports — all access is the front door or composition-root
injection.

**Injected into `settings.context` at the composition root (deps OF this domain):**

| Dep injected             | Provided by    | Used for                                                           |
| ------------------------ | -------------- | ------------------------------------------------------------------ |
| `admin.requireAdmin`     | admin domain   | the `app-settings` verbs gate `getAppSettings`/`updateAppSettings` |
| `observability.logAudit` | foundation     | audit the user-settings writes + the global/app-settings writes    |
| `env` (the floor)        | foundation/env | `envDefaults()` reads env-mirrored toggles for the floor-merge     |

**Injected into `chat.context` at the composition root:**

| Op injected                   | Provided by     | Used for                                                                                                                                              |
| ----------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `settings.loadUserSettings`   | settings domain | per-turn read of the user's typed settings (routing/worldInfo/chat/memory/seeds)                                                                      |
| `settings.getEffectiveConfig` | settings domain | the engine/assembly read `memoryDefaults`, `corpusAutoindex`, `forbidExternalMedia` (NOT `guidedActions` — those resolve from the active preset, D33) |

**Injected into `workloads.runner-env` at the composition root:**

| Op injected                   | Provided by     | Used for                                                                   |
| ----------------------------- | --------------- | -------------------------------------------------------------------------- |
| `settings.loadUserSettings`   | settings domain | the triggering user's workload tunables (`dupThreshold`, `computeThemesK`) |
| `settings.getEffectiveConfig` | settings domain | runner reads `importSkipCharacters`, `memorySummarizer`, `corpusAutoindex` |

**`connection` is a CONSUMER of `UserSettings.routing.roleDefaults`, not of this domain's service** —
`connection.context` receives the `UserSettings` projection it needs (via `loadUserSettings` injection
or a narrower routing projection). `connection` owns role _resolution_; `settings` owns the KV. (See
`domains/connection.md` §7.2.)

**Boot wiring (`entry/`):** `entry/boot` calls `reloadEffectiveConfig(db)` once at startup to warm the
sync cache (before that first call, `getEffectiveConfig()` returns the env-only floor — the safe
default).

---

## Spine thread intersections

### §7.1 Identity / auth / permission

The `AppSettings` tier is **admin-only**: `getAppSettings`/`updateAppSettings` call the injected
`requireAdmin(db, userId, callerRole?)` before touching the `"app"` row. (Neo today: the gate is narrow —
only the owner, provisioned `role:'admin'` by `ensureUser`, passes. Orbweaver D17: `requireAdmin` =
`can(p,'admin',global)` passes for **owner ∪ admin**; the owner is provisioned `role:'owner'` by
`seed-owner`, and delegated admins also pass.) The raw global KV setter is admin-gated
at the _router_, not the verb (the `settings` table backs admin-only runtime config). `UserSettings`
verbs are **owner-scoped** by `userId` (a user reads/writes only their own row; PK is `userId`). The
admin gate is injected, never re-implemented — `settings` does not know how admin is determined, only
that an op enforces it.

### §7.2 Settings / config

This domain IS the §7.2 spine made concrete. The headline rulings it implements:

- **Nature (b) is owned here; (a) is read down from `foundation/env`; (c) is excluded (agent-sdk
  backend config); (d) is preset.** See "the four natures" above.
- **The floor rule, confirmed + made legible:** env floor, DB override wins (`layer()` resolves each
  field with `overrides.field ?? base.field`). The "env is the floor" claim is half-true — only 3 of 7
  `EffectiveAppConfig` fields are env-mirrored; the other 4 are born-in-DB defaults. Orbweaver splits
  these explicitly (env-mirrored → `env`; born-in-DB → schema defaults).
- **Memory tuning is correctly split** and stays split: the WRITE-side knobs (`blockSize`/`mode`/
  `summarizer` — they determine the SHAPE of stored digests) are `AppSettings.memoryDefaults`
  (admin-managed, cross-chat). **Enable/disable is GLOBAL, not per-chat (D36):** the master on/off is
  `AppSettings.memoryDefaults.mode` (`'off'` disables — no separate `enabled` boolean, which would double
  with `mode`); a per-USER opt-out (`UserSettings.memory.enabled`, a JSON field — NOT a column) layers under it. **There is NO
  `chats.memoryEnabled` column** (the per-chat layer was rejected — one fewer scattered knob). Changing a
  write-side knob mid-chat would put mismatched digests in `chat_digests` — that's why it is
  admin/subsystem-level, not per-chat. Preserve the split.
- **One `defineVersionedConfig` for all three tiers** (AppSettings/UserSettings/PromptConfig) — the
  primitive lives in `contracts/versioned-config`; the three configs are `defineVersionedConfig(...)`
  call-sites in their respective contracts modules.

### §7.4 Types & schemas — one home, one direction, no inline

- `AppSettings` / `UserSettings` / `EffectiveAppConfig` / `MemoryDefaults` / `MemorySummarizerConfig` /
  `LogLevel` / `UserSettingsSection` + all settings schemas → `@orb/contracts/settings`
  (cross-boundary; client forms + server). Flows DOWN to both.
- `defineVersionedConfig` + `VersionedConfig` + `VersionedConfigDef` → `@orb/contracts/versioned-config`
  (shared primitive; below `contracts/settings` and `contracts/preset`).
- `UpdateUserSettingsInput` / `UpdateUserSettingsSectionInput` → `domain/settings/contract/params.ts`
  (domain-internal arg shapes).
- `UserSettingsView` / `GlobalSettingView` → `domain/settings/contract/views.ts` (domain read-models;
  re-exported from the front door for type-only client use).
- `SettingsContext` → `domain/settings/contract/service.ts` top — explicit `export interface`, never
  `ReturnType<typeof createSettingsContext>`.
- `APP_SETTINGS_KEY` constant → `domain/settings/effective-config/` (a domain constant, single-homed).
- `room-overrides`/`group-config`/`opening-policy` shapes → `@orb/contracts/chat` (NOT settings — they
  are chat shapes that the settings KV merely references via `groupDefaults`).

### §7.5 String-union dispatch discipline

The settings tiers carry several string unions; none is heavily re-spelled today (settings is not a
dispatch hotspot), but each gets one canonical home:

- `LOG_LEVELS` / `LogLevel` → `@orb/contracts/settings` (`foundation/env` imports the tuple down for
  its `z.enum`; the hand-kept "mirror env.ts's enum" duplication is eliminated — ONE tuple).
- `USER_SETTINGS_SECTIONS` / `UserSettingsSection` → `@orb/contracts/settings`; the
  `updateUserSettingsSection` dispatch keys on it. Adding a section = extend the tuple; the section
  patch is generic (deep-merge), so no per-section switch needs `assertNever`.
- The `roleDefaults` chat-role `api`/`source` unions are `connection`'s (`@orb/contracts/connection`) —
  `UserSettings.routing.roleDefaults.chat` _references_ them; it does not re-spell them.

---

## Esoteric / load-bearing details

1. **`storedVersion` (the DB COLUMN) BEATS the in-blob version probe (must survive — corruption guard).**
   `parseUserSettings(raw, storedVersion?)` threads `user_settings.schemaVersion` (the column) in as
   `storedVersion`; `defineVersionedConfig.parse` uses it over the in-blob `schemaVersion` probe.
   **Why it is load-bearing:** the persisted UserSettings blob does NOT carry `schemaVersion` (the
   column does). Without threading the column, EVERY blob probes as v1 and ALL lifts re-run on EVERY
   read — which silently corrupts data the moment a lift is non-idempotent (review V10-5). Both
   `readUserSettings` and `loadUserSettings` MUST pass the column. (AppSettings differs — it stores
   `schemaVersion` INSIDE the `"app"` blob since the `settings` table has no version column; the probe
   reads it before the schema strips it, so its lifts run once per stored version too.)

2. **The `null` = CLEAR sentinel (the floor shows through).** Every `appSettingsSchema` field is
   `.nullable()` AS WELL AS `.optional().catch(undefined)`. An admin PATCH of `{ field: null }` wipes a
   top-level override so the env floor reappears; on READ a stored `null` behaves exactly like absent
   (`layer()` resolves both with `??`). **The `.nullable()` is required, not cosmetic:** without it the
   per-field `.catch(undefined)` would swallow the `null` at the input boundary and the clear could
   never reach `deepMergeAppSettings`. The merge semantics: `undefined` = "don't touch", `null` = "clear
   top-level override", arrays/primitives = REPLACE (no array-concat — else "set `importSkipCharacters`
   to `[x]`" would be impossible). Preserve exactly.

3. **`defineVersionedConfig` is the shared primitive (kills drift across three tiers).** The
   "versioned blob + lift loop" was copy-pasted across AppSettings/UserSettings/PromptConfig; collapsing
   it into one owner makes the fixture-migration meta-test a `for-each-registered-config` instead of
   three near-duplicate suites. Its parse contract is ALWAYS-returns-valid-T (non-object/corrupt/`null`
   → the `default`) — PromptConfig's old throw-on-parse path is intentionally converted to this lenient
   shape (a malformed stored preset degrading to default beats a hard mid-session load failure).

4. **The v1→v2 UserSettings lift folds `defaultApi`/`defaultSource`/`defaultModel` into
   `routing.roleDefaults.chat`.** The settings-revamp lift maps the flat grab-bag into named namespaces;
   the chat-role tuple becomes "just another role" under `roleDefaults`. Other flat fields move to their
   domain home (`wiScanDepth`→`worldInfo.scanDepth`, `memoryEnabled`→`memory.enabled`, etc.); unset
   fields are omitted so the v2 per-namespace defaults fill them. The AppSettings v1→v2 lift strips the
   dropped `memorySummarizer.source` (`local`/`hosted` → now read from `credential.source`). Both lifts
   must move byte-identical with their schemas.

5. **The per-user write serializer lives on the CONTEXT, not in a verb.** Both user-settings write
   paths (whole-blob replace + section patch) are read-merge-write against the same row; two concurrent
   same-user writes would each read the same base and last-write-wins would silently drop one. The fix
   is a promise chain keyed by `userId` — different users run concurrently, same-user writes queue.
   Because BOTH verbs share it, it must be ONE instance → it lives on `context.ts` (a failed write
   resolves the chain link so one error can't wedge the queue; the map entry is pruned once it's still
   the tail after settling). The post-write view is read INSIDE the serializer so a concurrent writer
   can't make the returned view reflect a different write. `ASSUMES(single-replica)`. The app-settings
   write has its OWN single process-wide chain (only one verb uses it → closure state there).

6. **`getEffectiveConfig()` is a sync read of a warm-on-reload cache (the hot-path seam).** Hot paths
   (engine/embedder) must not do a per-call DB read. `reloadEffectiveConfig(db)` runs at boot + after
   every admin write and rebuilds the cache; `getEffectiveConfig()` returns it sync. **The
   `logger.level` rebind is load-bearing:** Pino captures `level` at construction, so without the
   rebind on every reload the `AppSettings.logLevel` override would be a docs-only knob (effective only
   at restart). Cheap to set on every reload. Before the first reload, the cache is the env-only floor.

7. **Additive namespace, NO version bump (the lenient-parser dividend).** `onboarding`, `groupDefaults`,
   `workloads`, `profile` were added to UserSettings WITHOUT a schema-version bump: each namespace is
   `.prefault({})`, so a pre-existing blob reads as the default ("nothing seen yet" / "per-speaker ×
   merged") — correct, because those accounts predate the surfaces these gate. (`groupDefaults` also seeds
   the per-room `memberCardVisibility` toggle — default `sheet`, D22 — references `groupConfigSchema` in
   `@orb/contracts/chat`, the legal downward edge.) Per-field `.catch` keeps
   the parser self-healing as the shape grows. This is the intended growth path; only a SHAPE change
   that an old blob can't satisfy needs a version bump + a lift.

8. **`ensureUserSettings` is the first-touch seed; a pure read MUST NOT insert.** `getUserSettings` on a
   never-touched account returns `parseUserSettings({})` with `updatedAt: 0` and writes NOTHING. The
   write paths call `ensureUserSettings` (idempotent, `onConflictDoNothing` on the `userId` PK) before
   the UPDATE so the UPDATE can't silently no-op a never-touched user. Keep the read/write asymmetry.

---

## Invariants (gate candidates)

1. **`foundation/env` is the ONLY `process.env` reader; settings never writes env.**
   _Enforcement: lint-time — a `check`/dep-cruiser rule asserts no `process.env` access outside
   `foundation/env`; `domain/settings/**` containing `process.env` is RED._

2. **`storedVersion` (the DB column) beats the in-blob probe.**
   _Enforcement: test-time — a stored-v2 UserSettings blob with no in-blob `schemaVersion` does NOT
   re-run the v1 lift on read; a non-idempotent-lift fixture proves the column wins._

3. **The `null` = CLEAR sentinel survives; every `AppSettings` field is `.nullable()`.**
   _Enforcement: compile-time — `appSettingsSchema` field types are nullable (a contract test asserts
   `z.infer<…>` admits `null`); test-time — PATCH `{ field: null }` wipes the override and the env floor
   reads back._

4. **ONE `defineVersionedConfig` primitive for all three tiers.**
   _Enforcement: compile-time — the duplicated lift loops are deleted; AppSettings/UserSettings/
   PromptConfig are all `defineVersionedConfig(...)` call-sites; any re-implemented lift loop fails the
   `no-inline-types`/duplication gate._

5. **The floor rule: env floor, DB override wins.**
   _Enforcement: test-time — `layer({})` equals `envDefaults()` for env-mirrored fields; an override
   field wins over the env value; a `null`/absent override falls through to the floor._

6. **Per-user writes are serialized (same-user read-merge-write is atomic w.r.t. other same-user
   writes).**
   _Enforcement: test-time — two concurrent `updateUserSettingsSection` calls on sibling sections of the
   SAME user both land (neither clobbers the other); different users run concurrently._

7. **`APP_SETTINGS_KEY` is reserved in the generic setter.**
   _Enforcement: test-time — `setGlobalSetting("app", …)` throws `DomainOperationError(reserved_key)`;
   the dedicated `updateAppSettings` is the only writer of the `"app"` row._

8. **`UserSettingsView.config` is always parsed+defaulted — never a raw blob.**
   _Enforcement: compile-time — the view type is `UserSettings` (the parsed contract), not `unknown`;
   `persistence/queries.ts` is the only projection and always routes through `parseUserSettings`._

9. **The `app-settings` verbs are admin-gated via the INJECTED `requireAdmin` (admin domain).**
   _Enforcement: compile-time — `requireAdmin` is an injected op on `SettingsContext`, not a sideways
   import; `domain-no-cross-feature` makes a `domain/settings → domain/admin` source import RED.
   Test-time — a `role:'user'` caller gets `DomainForbiddenError`._

10. **The misfiled chat blobs are NOT owned by settings.**
    _Enforcement: lint-time — dep-cruiser: `domain/settings/**` must not import `group-config`/
    `room-overrides`/`opening-policy`; they live in `@orb/contracts/chat`. `UserSettings.groupDefaults`
    references `groupConfigSchema` from `contracts/chat` (the legal downward edge)._

11. **The agent-sdk runtime config (nature c) is NOT in this domain.**
    _Enforcement: lint-time — the isolation pins / credential-firewall config live in
    `infra/providers/backends/agent-sdk` (per DECISIONS-LEDGER §7 D8); `domain/settings/**` has zero
    references to them; a settings import of the agent-sdk env config is RED._

12. **`effective-config/cache.ts` carries the `ASSUMES(single-replica)` marker.**
    _Enforcement: lint-time — a `check` gate validates the annotation is present on the module-scope
    cache (same pattern credentials' `health/cache.ts` uses); the DB `"app"` row is the documented
    multi-replica seam._

---

## CONFLICT resolved (cite, don't re-litigate)

`core/AGENTS.md §4` grouped `room-overrides.ts` / `group-config.ts` / `opening-policy.ts` under
"settings (7 files)" — but `core/Core-Core-Legacy-Migration-and-Gaps.md` §4 + §7.4 ruled them **MISFILED**: they are
chat shapes (chatMetadata sub-blobs + the start-chat union), consumed by chat verbs, chat assemble
types, and client chat forms — never the settings KV. **Resolution (this doc follows the dissolution
inventory):** the settings DOMAIN owns only `AppSettings`/`UserSettings`; those three shapes →
`@orb/contracts/chat`. The only residual link is `UserSettings.groupDefaults` referencing
`groupConfigSchema`, which is exactly why `contracts/settings` depends on `contracts/chat` (the
counter-intuitive boot-order edge, dissolution §8 — `contracts/chat` builds before `contracts/settings`).

---

## Open decisions

- **Stranded (b) toggles — DECIDED (ledger §2).** Promote `VLLM_*_CONCURRENCY` to AppSettings (env floor +
  admin override — admin-tunable is genuinely useful); `RATE_LIMIT_*` **STAYS boot-env** (hot-reloading a
  limiter mid-flight is fiddly, rarely wanted). `IMPORT_DEFAULT_SOURCE` is **DROPPED entirely (PD-15)** —
  neo-jank, no chat-level default source. Each promotion adds a field to `appSettingsSchema` + a `layer()` arm.
- **`envDefaults()` split — DECIDED (ledger §2).** Env-mirrored fields read `env`; the 3 born-in-DB literals
  (`forbidExternalMedia`/`memoryDefaults`/`memorySummarizer`) become `appSettingsSchema` defaults (the floor
  is one legible thing). Implementation detail confirmed at the slice; not an open question.
- **Where the sync `EffectiveAppConfig` cache lives and how hot paths read it.** Proposed: the
  `effective-config/` subsystem holds the cache; `getEffectiveConfig()` (sync) is on the service and
  injected into `chat.context`/`workloads.runner-env`; `entry/boot` calls `reloadEffectiveConfig` at
  startup. Confirm the injection shape (a sync getter op, not the whole service).
- **`IMPORT_DEFAULT_SOURCE` auto-default (NODE_ENV-derived).** The `env` export computes
  `max-pro-sub` in dev/test, `openrouter` in prod when unset. If the knob becomes an AppSettings field,
  decide whether the NODE_ENV auto-default stays in `foundation/env` (as the floor) or moves into the
  resolver. Lean: keep the auto-default as the env floor; the AppSettings override layers on top.
- **`results.ts` — keep or drop.** Today every verb's result IS a view; `contract/results.ts` would be
  empty. Drop it unless a future verb grows a non-view result (the template tolerates an absent slot).
- **A typed error class?** Today the only failures are `DomainOperationError(reserved_key)` + the
  injected `requireAdmin` throw — both from foundation/kit. No `SettingsNotFoundError` (a missing
  user-settings row is _defaults_, not an error; a missing global key is `null`). Keep `errors.ts`
  absent unless a new failure mode appears.
