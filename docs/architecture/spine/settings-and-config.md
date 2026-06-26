# Orbweaver — `settings & config`: the four natures of config (the spine)

> **Status: planning (authoritative detail).** §7.2 of the cross-cutting spine. Config in neo-tavern
> wears **four distinct natures** that were never named, all loosely called "env" because they pass
> through `process.env` or *emit* env vars. Naming them — and giving each ONE home — IS the config
> re-architecture. This doc is the canonical model the per-tier docs defer to: `domains/settings.md`
> (the owned core — AppSettings/UserSettings + the floor-merge) and `tiers/foundation.md` (env-read +
> observability) each implement a slice of it; `infra/providers/claude-sdk` houses the homeless one.
> Pairs with `domains/connection.md` (the `roleDefaults` consumer) and the preset doc (generation params).
> `domains.md` carries the summary. Sources: `_FANOUT-BRIEF.md §7.2`, `structure.md §7`,
> `reports/shared-dissolution.md §4/§8`; verified against `/tmp/neo-tavern-steady/src/server/env.ts`,
> `server/config/app-config.ts`, `server/providers/claude-sdk/env.ts`, `shared/settings/versioned-config.ts`,
> `server/domain/credentials/boot-seed.ts`.

## 0. The principle — four natures, four homes, one shared primitive

The whole confusion is that one word ("env") covers four things that differ in *lifetime*, *trust*, and
*who may change them*. Orbweaver separates them by nature and pins each to exactly one home. Two of the
four are NOT settings at all (they only look like config); saying so out loud is half the work.

| Nature | What it is | Lifetime / who changes it | Home |
|---|---|---|---|
| **(a) true env** | boot / secret / identity | set before boot, frozen; operator via deploy | `foundation/env` |
| **(a/seed)** | env that writes a DB row once, then goes inert | first boot only; then it's a normal DB row | `credentials` domain (seed verb in `entry/`) |
| **(b) runtime toggles** | non-secret operational knobs, flippable at runtime | admin, live; **env floor ⊕ DB override** | `settings` domain → `AppSettings` |
| **(c) agent-sdk runtime config** | isolation pins + reserved-denylist + the 3-mode credential firewall | deploy-pinned constants, rebuilt every turn | `infra/providers/claude-sdk` (NOT a settings tier) |
| **(d) generation params** | per-turn reasoning / sampling / token budgets | per-turn, per-preset | `preset` → `UserIntent` |

> **The shared primitive cuts across (b) and (d):** AppSettings, UserSettings, AND preset's
> `PromptConfig` all use ONE `defineVersionedConfig` (the versioned-blob + lift-loop engine) →
> `@orb/contracts/versioned-config`. It is **boot-critical: it must compile before `contracts/settings`
> AND `contracts/preset`** (`shared-dissolution.md §8` — the most boot-fragile cross-slice edge). Detail
> in §6.

**The headline finding (`_FANOUT-BRIEF.md §7.2`): nature (c) has no home today.** It lives as 345 lines
of hardcoded literals inside `providers/claude-sdk/env.ts`, called "env" only because it emits env vars
for a subprocess. It is security-load-bearing (the firewall that must never leak the Max-sub OAuth
token) and it is NOT a config tier. Giving it a name — a backend-internal config of the claude-sdk
strategy — is §7.2's most important ruling. See §4.

---

## (a) true env — boot / secret / identity

The boot/secret/identity keys: `PORT`, `DATABASE_URL`, `CREDENTIALS_KEY`, `AUTH_MODE` + the OIDC quintet
+ `SESSION_SECRET` + the forward-header trust knobs, `IP_ALLOWLIST`, `EGRESS_FIREWALL`. Set before boot,
parsed once, frozen.

- **Home: `foundation/env`** — the ONE `process.env` reader (`server/env.ts`, un-moved). `dotenv.config`
  load → `envSchema.parse` → frozen `env`. Every other tier dot-accesses typed keys (`env.PORT`);
  nothing else touches `process.env`. This is a hard gate (§7).
- **The `superRefine` boot-fatality** (`env.ts:266`): `AUTH_MODE=oidc` without its five OIDC keys, or
  `=local` without `SESSION_SECRET`+`LOCAL_INITIAL_PASSWORD`, **fails `envSchema.parse` at module load** —
  it crashes boot, it does NOT warn-and-degrade. A half-configured SSO deploy that silently fell back to
  owner-on-the-public-FQDN would be a security incident. Must survive the move byte-faithfully (esoteric).
- **`LOG_LEVELS`/`LogLevel` is the one ONE-tuple seam:** the enum lives in `@orb/contracts/settings`;
  `foundation/env` imports the tuple DOWN for its `z.enum`, killing the hand-kept "mirror env.ts's enum"
  duplication.

## (a/seed) env → DB-once — the cleanest env→DB pattern (KEEP as the model)

A sub-nature worth naming because it's the *correct* shape for "env that should become data." The model
is `OPENROUTER_API_KEY`: in single-user mode, if the owner has no openrouter credential, boot upserts one
labeled `"env-seed"` and active — then the env value goes inert. The seeded row is editable, rotatable,
deletable like any other credential; **the env value is the first-run seed, not a permanent overlay**
(`credentials/boot-seed.ts:43` `seedOpenRouterFromEnv`).

- **Home: the `credentials` domain** owns the seed verb; **it runs in `entry/`** (the composition root
  calls it once at boot, `index.ts:111`) and it is **single-user-only** — multi-user modes ignore the env
  value entirely (a key would silently seed only the owner). Env (foundation) only *supplies the raw
  value*; the write is credentials'.
- **Why it's the model:** it replaced a pre-2026-06 turn-time host-fallback that read
  `env.OPENROUTER_API_KEY` on every turn and spent the owner's quota silently for keyless users. The
  seed is the generalization the floor-merge (b) gestures at: env is a *source*, not a runtime authority.
- **The tangle this leaves:** `OPENROUTER_API_KEY` historically wore three hats — secret (a) / seed
  (a/seed) / live-client-read. Orbweaver keeps only secret + seed; the live read is gone.

## (b) runtime toggles → AppSettings — env floor, DB override wins

Non-secret, non-bootstrap operational knobs an admin can flip at runtime. Today: `corpusAutoindex`,
`importSkipCharacters`, `logLevel`, `forbidExternalMedia`, `guidedActions`, `memoryDefaults`,
`memorySummarizer`.

- **Home: the `settings` domain (`AppSettings`).** The override blob lives under the reserved
  `APP_SETTINGS_KEY = "app"` row; resolution is `layer(overrides)` over `envDefaults()` →
  `EffectiveAppConfig`. **The floor-merge lives in the settings DOMAIN** (`effective-config/` subsystem),
  NOT in foundation — it is the read-side twin of `updateAppSettings` and belongs with the tier it
  resolves. Foundation owns the env *read*; settings owns the env⊕DB *resolution*. (Full detail:
  `settings.md`; foundation explicitly disclaims it: `foundation.md`.)
- **"env is the floor" is only HALF-TRUE — flag it.** `envDefaults()` returns seven fields but only
  THREE are env-mirrored (`corpusAutoindex ← CORPUS_AUTOINDEX`, `importSkipCharacters ←
  IMPORT_SKIP_CHARACTERS`, `logLevel ← LOG_LEVEL`, `app-config.ts:46-50`). The other four are
  **born-in-DB defaults** with no env source: `forbidExternalMedia:false`, `guidedActions:DEFAULT_…`,
  `memoryDefaults:{}`, `memorySummarizer:{}` (`app-config.ts:51-56`). The floor is "env where an env var
  exists, else the baked-in default." Orbweaver makes this legible: env-mirrored fields read `env`;
  born-in-DB fields read **schema defaults** on `appSettingsSchema` (not literal objects buried in a
  resolver).
- **STRANDED (b) toggles — env-only today, should be AppSettings.** Three knobs are runtime-operational
  by nature but have no DB override path: `IMPORT_DEFAULT_SOURCE` (`env.ts:43`), `RATE_LIMIT_*`
  (GENERAL/AI_TURN/PUBLIC_IP/AUTHED, `env.ts:259-264`), `VLLM_*_CONCURRENCY` (EMBED/SUMMARIZE,
  `env.ts:96-97`). Each is a candidate AppSettings field (env floor preserved, admin override added) —
  a wiring choice, not a foregone move (rate-limit budgets may stay boot-env; hot-reloading a limiter
  mid-flight is fiddly). See Open decisions.
- **`getEffectiveConfig()` is SYNC** (hot paths — engine/embedder — can't do a per-call DB read; they
  read an in-memory cache warmed by `reloadEffectiveConfig(db)` at boot + after every admin write,
  `ASSUMES(single-replica)`). **The `logger.level` rebind on reload is load-bearing** (`app-config.ts:93`):
  Pino captures `level` at construction, so without it the `AppSettings.logLevel` override is a docs-only
  knob effective only at restart. This is the one sanctioned higher-tier write into a foundation singleton.

## (c) the HOMELESS agent-sdk runtime config — NOT a settings tier

The headline. `providers/claude-sdk/env.ts` (345 lines) builds the **subprocess env for the Claude Agent
SDK child**. It is called "env" but it is a *backend-internal config of the claude-sdk strategy* —
security-load-bearing, rebuilt every turn, with three parts:

1. **~13 isolation pins** — `CLAUDE_CODE_DISABLE_*` deploy-only constants pinned ON
   (`DISABLE_1M_CONTEXT`, `DISABLE_AUTO_MEMORY`, `SIMPLE_SYSTEM_PROMPT`, `DISABLE_CRON`,
   `DISABLE_FILE_CHECKPOINTING`, `DISABLE_GIT_INSTRUCTIONS`, … + `DISABLE_CLAUDE_MDS` in the build fns).
   No per-preset override (`claudeRuntimeEnv` isolation block, `env.ts:96-110`).
2. **The 11-key reserved-denylist** — `RESERVED_CLAUDE_ENV_KEYS` (`env.ts:139`): the auth/firewall/model-
   routing keys a preset's `advanced.claudeEnv` escape hatch can NEVER set or unset, so a malicious
   preset can't repoint a spawn at a third-party endpoint (the st-claude-proxy ban shape) or strip the
   firewall (`claudeUserEnv` filters them, runner-owned fields always win).
3. **The 3-mode credential firewall** — three builders, each isolating credentials so the **Max-sub
   OAuth token never leaks to a paid/third-party spawn**:
   - **Mode 1 (Max sub)** `buildClaudeSdkEnv` (`env.ts:214`): an ephemeral `CLAUDE_CONFIG_DIR` with ONLY
     `.credentials.json` **symlinked** in (filesystem aliasing — the runtime authenticates without us
     ever reading the OAuth token), then null `ANTHROPIC_API_KEY/BASE_URL/AUTH_TOKEN` so a stale ambient
     export can't repoint the free sub at a paid base URL.
   - **Mode 2 (OR Anthropic skin)** `buildClaudeOpenRouterEnv`: an EMPTY ephemeral dir + null every host
     credential source; the only auth in scope is the OpenRouter key. `ANTHROPIC_API_KEY=""` (empty, not
     unset — unset falls through to other sources), `BASE_URL`→OpenRouter, `AUTH_TOKEN`→OR key.
   - **Mode 3 (local vLLM)** `buildClaudeVllmEnv`: same firewall as mode 2, base URL loopback, throwaway
     auth (`max-pro-sub` is admin-gated; non-admin buddy turns route here).
- **Home: `infra/providers/claude-sdk`** — a *named* backend-internal config of the strategy, NOT a
  settings tier and NOT `foundation/env`. The only piece that stays in `foundation/env` is the
  `process.env`-reading baseline producer `hostEnvForClaudeChild()` (it reads `process.env`, so it stays
  under the single-reader roof); the `HOST_SECRET_ENV_KEYS` *denylist policy* travels WITH the firewall.
- **Handle with care.** This is the firewall whose failure mode is a banned account, not a wrong reply.
  Port it byte-faithfully; the asymmetry between mode-1 (symlink the credential in) and mode-2/3 (null
  everything) is the point, not an inconsistency.

## (d) generation params — preset, not settings

`UserIntent`/preset, translated per-backend. **Not config in the env sense** — it's per-turn user intent.

- **Home: `preset` (`@orb/contracts/preset`), surfaced via `connection`'s capability descriptor.**
- **Verified TRUE (CLAUDE.md claim):** reasoning is **typed SDK Options, not env** (`effort`/`thinking`).
  Only `maxOutputTokens`/`maxContextTokens`/compaction ride env vars, and they are **preset-sourced —
  env-*shaped* only at the wire** (`claudeRuntimeEnv` generation block, `env.ts:80-92`).
- **The (c)/(d) tangle to UNTANGLE — `claudeRuntimeEnv()` mixes both in one object.** Its first half is
  per-preset generation knobs (d: `disableThinking`, `maxContextTokens`, `maxOutputTokens`,
  `disableAutoCompact`, `autoCompactPct`); its second half is deploy-pinned isolation (c). And
  `UserIntent.advanced.claudeEnv` is a preset (d) field reaching INTO (c), gated by a *runtime denylist*
  rather than a type. Orbweaver splits these: the generation knobs are preset translation (d) that the
  runner emits; the isolation pins + denylist + firewall are the named claude-sdk config (c). One object
  today, two concerns — separate them at the seam.

---

## Invariants (gate candidates)

Each names its enforcement tier (resolve / compile / lint / test). These reconcile with the per-tier
invariant lists in `settings.md` and `foundation.md` — this is the cross-cutting superset.

1. **`foundation/env` is the ONLY `process.env` reader.** *(lint)* — dep-cruiser/`check`: no
   `process.env` outside `foundation/env`; documented call-time exceptions (`sessions` owner-role reads)
   allowlisted. The claude-sdk firewall's `hostEnvForClaudeChild` reads via the env tier, never raw.

2. **The `env` `superRefine` boot-fatality survives.** *(test)* — `AUTH_MODE=oidc` with a missing OIDC
   key throws at parse; `=local` without `SESSION_SECRET`/`LOCAL_INITIAL_PASSWORD` throws. A
   half-configured auth deploy must crash, never degrade.

3. **ONE `defineVersionedConfig` for all three tiers (AppSettings/UserSettings/PromptConfig).** *(compile)* —
   the copy-pasted lift loops are deleted; all three are `defineVersionedConfig(...)` call-sites; a
   re-implemented lift loop fails the duplication gate.

4. **`storedVersion` (the DB column) beats the in-blob `schemaVersion` probe.** *(test)* — a stored-v2
   UserSettings blob with no in-blob version does NOT re-run the v1 lift on read; a non-idempotent-lift
   fixture proves the column wins. (See §6 — corruption guard.)

5. **The `null` = CLEAR sentinel survives; every `AppSettings` field is `.nullable()`.** *(compile + test)* —
   `z.infer<appSettingsSchema>` admits `null`; PATCH `{field:null}` wipes the override and the env floor
   reads back. Without `.nullable()`, the per-field `.catch(undefined)` swallows the clear at the boundary.

6. **The floor rule: env floor, DB override wins.** *(test)* — `layer({})` equals `envDefaults()` for
   env-mirrored fields; an override field wins; a `null`/absent override falls through to the floor.

7. **The floor-merge is NOT in foundation.** *(resolve + lint)* — `foundation/config` contains no
   `app-config.ts`/`layer()`/`EffectiveAppConfig` resolver; it resolves from `domain/settings/
   effective-config`. A foundation file referencing the resolver is RED.

8. **The agent-sdk runtime config (c) is NOT a settings tier.** *(lint)* — the isolation pins /
   denylist / credential firewall live in `infra/providers/claude-sdk`; `domain/settings/**` and
   `foundation/**` have zero references to them; such an import is RED.

9. **The credential firewall is byte-faithful and runner-owned.** *(test)* — each of the three builders
   nulls `ANTHROPIC_API_KEY/BASE_URL/AUTH_TOKEN` (or sets the mode-2/3 skin values) AFTER the
   `advanced.claudeEnv` escape hatch, so a preset can never strip it; `RESERVED_CLAUDE_ENV_KEYS` keys are
   filtered from `claudeUserEnv`. The mode-1 OAuth token is never read, only symlinked.

10. **`logger.level` rebinds on every settings reload.** *(test)* — after `reloadEffectiveConfig` with an
    `AppSettings.logLevel` override, `logger.level` equals the override (the one sanctioned cross-tier
    write into a foundation singleton).

11. **`APP_SETTINGS_KEY` is reserved in the generic KV setter.** *(test)* — `setGlobalSetting("app", …)`
    throws `DomainOperationError(reserved_key)`; the dedicated `updateAppSettings` is the only writer.

12. **The (a/seed) seed is single-user-only and inert after first write.** *(test)* —
    `seedOpenRouterFromEnv` no-ops when a credential exists or in multi-user modes; the seeded row is a
    normal editable credential, not a runtime overlay.

---

## Esoteric / load-bearing details

1. **`storedVersion` beats the in-blob probe (corruption guard).** `defineVersionedConfig.parse(raw,
   storedVersion?)` threads `user_settings.schemaVersion` (the COLUMN) in over the in-blob probe
   (`versioned-config.ts:47-67`). The persisted UserSettings blob does NOT carry `schemaVersion` — the
   column does. Without threading it, every blob probes as v1 and ALL lifts re-run on EVERY read, which
   silently corrupts data the moment a lift is non-idempotent (review V10-5). AppSettings differs: it
   stores `schemaVersion` INSIDE the `"app"` blob (the `settings` table has no version column).

2. **`defineVersionedConfig.parse` ALWAYS returns a valid `T`** — non-object / corrupt / `null` → the
   `default` (`versioned-config.ts:48,67`). PromptConfig's old throw-on-parse is intentionally converted
   to this lenient shape: a malformed stored preset degrading to default beats a hard mid-session load
   failure.

3. **The `null` = CLEAR sentinel** lets an admin PATCH `{field:null}` wipe a top-level override so the
   env floor reappears; a stored `null` reads identically to absent (`layer()` resolves both with `??`).
   Merge semantics: `undefined` = don't touch, `null` = clear, arrays/primitives = REPLACE (no
   array-concat — else "set `importSkipCharacters` to `[x]`" would be impossible).

4. **The v1→v2 UserSettings lift folds `defaultApi`/`defaultSource`/`defaultModel` into
   `routing.roleDefaults.chat`** — the flat grab-bag becomes named namespaces; the chat-role tuple
   becomes "just another role." Other flat fields move to their domain home
   (`wiScanDepth`→`worldInfo.scanDepth`, etc.). The AppSettings v1→v2 lift strips the dropped
   `memorySummarizer.source` (now read from `credential.source`). Both lifts move byte-identical with
   their schemas.

5. **Memory tuning split — keep it.** Write-side knobs (`blockSize`/`mode`/`summarizer` — they determine
   the SHAPE of stored digests) are `AppSettings.memoryDefaults` (admin, cross-chat); the per-chat on/off
   (`UserSettings.memory.enabled`, `chats.memoryEnabled`) is separate. Flipping a write-side knob mid-chat
   would put mismatched digests in `chat_digests` — that's why it's admin/subsystem-level, not per-chat.

6. **Additive namespace, NO version bump.** UserSettings namespaces added via `.prefault({})` (e.g.
   `onboarding`, `groupDefaults`, `workloads`, `profile`) need no version bump — a pre-existing blob
   reads the default. Only a SHAPE change an old blob can't satisfy needs a bump + lift.

---

## Open decisions

- **Promote the stranded (b) toggles?** `IMPORT_DEFAULT_SOURCE` + `VLLM_*_CONCURRENCY` lean PROMOTE
  (admin-tunable is genuinely useful); `RATE_LIMIT_*` may stay boot-env (hot-reloading a limiter is
  fiddly, rarely wanted). Decide per-knob at build; each promotion adds an `appSettingsSchema` field + a
  `layer()` arm. (Deferred to `settings.md`.)
- **Split `envDefaults()` env-mirrored vs born-in-DB.** Target: env-mirrored fields read `env`;
  born-in-DB defaults become schema defaults on `appSettingsSchema` so the "floor" is one legible thing.
  Confirm at skeleton.
- **`IMPORT_DEFAULT_SOURCE` NODE_ENV auto-default.** `env.ts` computes `max-pro-sub` in dev/test,
  `openrouter` in prod when unset (`env.ts:310`). If promoted to AppSettings, lean: keep the auto-default
  as the env floor; the admin override layers on top.
- **`HOST_SECRET_ENV_KEYS` denylist split.** Lean: `foundation/env` exposes a raw `processEnvSnapshot()`;
  `infra/providers/claude-sdk` composes the denylist (the policy travels with the firewall it serves).
- **The (c)/(d) seam shape in claude-sdk.** Confirm where the per-preset generation knobs (d) are emitted
  vs the pinned isolation config (c) — one module, two named exports, or two modules. (Tuning at build.)
