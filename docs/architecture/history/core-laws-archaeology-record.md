---
kind: history
status: superseded
updated: 2026-07-13
---

# Core-Laws-and-Precedents — planning-era archaeology record

> Frozen 2026-07-13, extracted from the ledger index doc retired at the ledger split. The 2026-06-25/26 greenfield planning + reconciliation body of that doc (its §1–§6). The STANDING rulings these produced live in `../../adr/` (the D-ledger), the `Spine-*`/`Tier-*`/`Knowledge-Cluster` docs, and the built code + its file headers; this file is the how-we-got-here record only, not live law.

## §1 — Code-grounded reconciliation resolutions (the corrections verification caught)

Promoted 2026-06-25. The steady clone = the running neo-tavern reference. Live rulings among these are now in the registry + the built code; kept here as the reconciliation record.

| # | Decision | Why (verified against the steady clone) |
| - | - | - |
| R1 | **§8 cache: the rolling-tail history breakpoint is PRESERVED + upgraded to ST's rolling PAIR** (`depth` & `depth+2`), computed in SHAPE, placed by the runner | the original "drop it" was wrong — `computeHistoryBreakpoint` feeds a live 2nd `cache_control` (\~5300 tok/turn, `chat-completions.ts`); dropping = silent regression. ST `cachingAtDepth` confirms the pair pattern. |
| R2 | **The canonical character card is ALREADY fully typed** (`creator`/`cardVersion`/`regexScripts`/`extensions` columns, `raw` dropped) — preserve, don't re-derive | `db/schema/character.ts:137-140`; import + export agents both confirmed. character.md §7.3 was stale ("pending"). |
| R3 | **`resolveCharacterDepthPrompt` → `@orb/server/kit/serde`** (not `character/substrate`) | 2 server consumers (chat/assembly + export) — a domain-substrate home forces a cross-feature import. *(Audit 2026-07-09: the HOME holds — the capability lives at `server/kit/serde/card` as `parseDepthPrompt`; the R3 function name did not survive the build.)* |
| R4 | **`AssetKind` + `StoredAsset` → `@orb/contracts/assets`** (not domain-internal) | a cross-boundary wire union re-spelled across db enum + http + client + domain. |
| R5 | **`oidc-store.ts` → `domain/sessions/persistence`** (not `infra/auth`) | it imports `@orb/db` (`oidc_transactions`) → can't be sealed db-free infra. |
| R6 | **The PNG codec uses isomorphic base64/latin1 over `Uint8Array`, no `node:buffer`** | the steady codec imports `node:buffer` (`png-card-codec.ts:9,77,134`), illegal in kit per the kit-purity ruling. |
| R7 | **memory is a `chat/` SUBSYSTEM, not its own domain** | `core/Core-0-Architecture-and-Structure.md §4`; `domains/memory.md` "own domain" wording was stale (fixed). |
| R8 | **`http` registrars → `entry/http`** (not transport); `buildWorkloadsEnv`/runner-env → `entry/`; the jobs worker is the `transport/jobs` driver | composition wiring crosses every feature boundary → entry, per `core/Core-0-Architecture-and-Structure.md §3`. |
| R9 | **`infra/providers/resolve-chat` READS the capability descriptor on the request — never imports `resolveModelCapability`** | infra→domain is an illegal upward import (`domain/connection` self-contradiction, fixed). |
| R10 | **`core/Core-0-Architecture-and-Structure.md §7` gate table grown to 13** (added `no-inline-types`, `no-inline-union-redecl`, `exhaustive-dispatch`, `persistence-no-io`, `persistence-no-in-memory-state`, `test-presence`, `test-determinism` to the base set) | promoted from the §7.4/§7.5 spine + the persistence + testing rules. The canonical count is **13** (core/Core-0-Architecture-and-Structure.md §7). *(Audit 2026-07-09: 13 = the CONSTITUTIONAL CORE table only; the live battery has since grown past 50 active gates across 8 stages — `Core-Enforcement-Active-Gates.md` is the count that matters operationally. Both numbers are correct at their own scope.)* |
| R11 | **`infra/providers/vllm/` is nested** (not a sibling `infra/vllm/`); domain/credentials path reconciled | one tree location for the local engine. |
| R12 | **The 3 doubled docs merged into single homes** (chat→domains/chat, connection→domains/connection, providers→tiers/providers); the 5 spine docs grouped into `spine/` | one home per topic; no cross-file drift. |

## §2 — Committed decisions by area (promoted from the per-doc "Lean")

These were promoted 2026-06-25 from the per-doc "Lean: X" notes; each now lives in its canonical Spine/Tier/Knowledge home (Identity → `Spine-Identity-and-Auth.md`; Settings/config → `Spine-Config-and-Serialization.md`; Infra → `Tier-3-Infra.md`/`Tier-3b-Providers.md`; Knowledge cluster → `Knowledge-Cluster.md`) and the built code.

### Identity / auth / permission

- **`Principal = { userId, role, handle, externalId, via }`** — does NOT carry `groups` (role is the sole authz axis; SSO groups fold into `role` at login).
- **Resolve identity ONCE at the `entry/auth/seam`** — `validate` returns the fields to assemble the Principal; `userId` carried out, never re-queried.
- **`can(principal, action, resource)` is the authority seam** — `requireAdmin` (global) + `requireParticipant`/`requireHost` (resource/chat) are its first implementations; capability is the third axis. `requireAdmin` lives in `domain/admin/guard.ts`.
- **Participant-membership replaces owner-equality** — `requireParticipant`/`requireHost` replace `loadOwnedChat` (\~45 sites/31 files). `authorUserId` stamped with the real principal on the live persist path (new build).
- **`MaxProSubCredential` factory accepts a `Principal`** (does the admin check inside — one gate site). `CredentialSource` (4, dispatch) and `CredentialProvider` (5, storage) stay distinct types.
- **Custom/BYO**: add `modelProfile?: CustomModelProfile` to `providerMetadataSchema`. `google_vertex`/`anthropic`/`openai`: NO partial scaffolding — add union member + resolver arm + provider strategy together when implemented.
- **API tokens = a sessions verb** (`createApiToken`, far expiry + `label`, same table/revoke machinery).
- **vLLM admin verbs stay in `admin`** via an injected `VllmSupervisorPort` (no direct infra import).
- **`AdminUserView`**: domain-internal (promote to `@orb/contracts/identity` only if the client type-imports it).

### Settings / config

- **Promote `IMPORT_DEFAULT_SOURCE` + `VLLM_*_CONCURRENCY` to AppSettings**; **`RATE_LIMIT_*` stays boot-env** (hot-reloading a limiter is fiddly, rarely wanted).
- **Split `envDefaults()`**: env-mirrored fields read `env`; born-in-DB defaults become `appSettingsSchema` defaults (the floor is one legible thing).
- **`IMPORT_DEFAULT_SOURCE` NODE\_ENV auto-default stays the env floor**; the AppSettings override layers on top.
- **`EffectiveAppConfig`** lives in the settings `effective-config/` subsystem; injected as a **sync getter op** into chat/workloads; `entry/boot` reloads at startup.
- **`HOST_SECRET_ENV_KEYS`**: `foundation/env` exposes `processEnvSnapshot()`; `infra/providers/backends/agent-sdk` composes the denylist (policy travels with the firewall). *(path per registry D8.)*
- **`lifecycle.ts` → `entry/`**; **`DbInspector` port dropped** (probes read `@orb/db` down); **`DEFAULT_*_MODEL_ID` → `@orb/contracts/connection`**.
- settings `results.ts`/`errors.ts` slots **omitted** until a non-view result / new failure mode appears.

### Infra

- **`ip-ranges.ts` / `host.ts` stay `infra/network`** (pure but no client consumer; revisit if one appears). **`password.ts` → `infra/auth`**. **`ingress-allowlist.ts` → `infra/network`**. **`safeFetch` kept unwired** (hardening seam).
- **`sharp` variant transform → an `infra/image` op** injected into a thin `resolve-variant` verb.
- **providers tree: `infra/providers/` with `vllm/` nested**; `RoleClients` stays a bundle (binder fills via `resolveRole`); rerank-hosted = typed-throw arm + local fallback; the agent-sdk session is backend-internal.

### Knowledge cluster

- **Memory's `search` contract = a nested `MemoryQueryOptions` in `@orb/contracts/search`** with `scope:{chat}` + `candidates?:BlockKey[]` (bridge) as **first-class** fields; the other 4 semantics flat. (domain/search, landed.)
- **`embeddings.store` accepts `fkRefs.speakers`** (atomic speaker-sync). **Re-index trigger** = connection→workloads. **Image caption** generated in `embeddings/indexer` inline (precedes the joint embed); **image `content_hash`** = SHA-256 of the resized/sliced bytes (shared across both lenses).
- **`buildCardEmbedText` lives with `character`** (producer); discovery reads the flat `characters` card row (D28 — no version table). **`character_summaries` schema → `@orb/db/schema/discovery.ts`** (writer owns; search reads down). **`sliceJsonObject` stays discovery-substrate** unless a non-discovery consumer appears. **`segment.ts` reference segmenter → `memory/substrate`**. **`similarChats` stays in-RAM** (centroid not in the store).
- **stats delta builders stay in `chat/engine`** (chat owns the row shapes; anti-drift = shared `kit/stats-tally`). **Economics `messages` projection**: constructor in `stats/persistence`, the result shape discovery receives in `@orb/contracts`. **`forgottenGems`/`modelRouting` stay discovery verbs** with an injected stats-economics op.

## §3 — Deferred to scaffold (committed default + the criterion that finalizes)

**Audit 2026-07-09:** five of the six criteria below FIRED — those defaults became FINAL law: **UI headless engine** = Base UI (D42/D54) · **version pins** = pinned at scaffold (`package.json`s are the record) · **§8.6 agent-principal mechanics** = landed AP0–AP2 (D60; the seat wave remains) · **agent credential inheritance** = LIVE as written (`users.kind` landed 2026-07-09; INHERIT-for-OWNER stands) · **event-bus shape** = wired (`entry/compose/event-bus.ts`, D38). Only the last row (observability mirror / t-digest / per-knob settings-form) remains genuinely deferred (YAGNI). Rows kept verbatim as the decision record:

| Item | Default | Finalizes when |
| - | - | - |
| UI headless engine | **Base UI** (radix-team successor); own the trivial atoms regardless | the `client` package is scaffolded (a client-rebuild call; doesn't gate kit→server) |
| Stack version pins | **2026-latest stable** Node/TS/Hono/Drizzle/tRPC | `pnpm init` at scaffold (irreducibly a pin-what's-current act) |
| §8.6 agent-principal mechanics (`provisionAgentPrincipal`, `users.isAgent`/`kind`, the `buddy_turns` firewall inversion) | the model is locked in `Spine-Identity-and-Auth.md`; mechanics build as one coordinated multi-domain change (committed as planned work — D60) | the agent-as-first-class-principal feature is built (not part of the initial port) |
| Agent credential inheritance | **the OWNER's agents INHERIT the owner's tier via owner-delegated `credentials.resolve` (default); a delegated admin (and its agents) + any non-owner agent get their own credential, never the owner's `max-pro-sub`** (revised 2026-06-26; clarified by D17 — the box belongs to `owner`, not any `admin`; was worded "admin-host"). The AAD stays owner-keyed (`${ownerUserId}\|provider`), so inheritance = the agent's `resolve()` delegates to the owner's `userId`, NOT a re-mint under the agent's id (a GCM-bound credential can't be row-lifted). One-arm addition to `credentials.resolve` at the agent-principal migration — the v1 borrowed-owner posture already delivers it for free (agent == owner at the credential seam). | confirmed when `users.isAgent` lands (spans sessions + credentials); default is INHERIT-for-OWNER, not own-credential |
| Event-bus concrete shape | in-process typed bus, payloads from `@orb/contracts/events` | wired at `entry/` when the first indexer subscription is built |
| `contracts/observability` mirror, t-digest latency, per-knob settings-form details | the seams are noted; no module until needed (YAGNI) | a real external consumer / measured need appears |

## §4 — Build order + the contracts internal build DAG

The step-by-step runbook is `Core-BUILD-PLAN.md`; the canonical scaffold order it consolidates: stand up the pnpm workspace + 5 packages + the gate suite FIRST (validates the cake at resolve-time), then bottom-up —
`kit → contracts → db → server (foundation → infra → domain[leaf-first: credentials/tag/persona/preset/world-info/assets/sessions/stats/settings/admin → embeddings/search → discovery/workloads/import/export/buddy] → transport → entry) → client`,
with **chat + memory LAST** behind the differential oracle. Populate `kit/ids` + `kit/errors` + the engines + `contracts/*` before any domain. **embeddings + search inserted before discovery** (discovery/memory/workloads consume them). The **composition root** is `entry/` (`core/Tier-5-Entry.md`).

### The `@orb/contracts` internal build DAG (build in THIS order)

`contracts/` is not flat — these edges cause `tsc` errors if violated (an alphabetical setup breaks):

1. `contracts/versioned-config` **before** `contracts/settings` AND `contracts/preset`.
2. `contracts/world-info` (role/scope tuples) **before** `contracts/persona` AND `contracts/character`.
3. `contracts/connection` (`chatApiSchema`/`chatSourceSchema`) **before** `contracts/settings`.
4. `contracts/chat` (`group-config` defaults) + `contracts/regex` **before** `contracts/settings` — **the counterintuitive edge** (`UserSettings.groupDefaults`/`regexScripts` pull chat+regex types).
5. provider result contracts (`EmbedResult`/`RerankResult`/`ImageEmbedResult`/`SummarizeResult`) **before** `contracts/role-clients`.
   Within `kit`: `kit/macro` before `kit/regex` + `kit/guided`; `kit/world-info` tuples before the three contracts that import them.

## §5 — Council-driven decisions (2026-06-25 greenfield review)

The 5-seat council (skeptic · AI-native · ops · executability · product) signed off with conditions; the durable narrative + big-ideas record is `planning-council-record.md`. The committed calls (each now law in its canonical home):

- **v1 authority scope:** build human participant-membership in v1 (`requireParticipant`/`requireHost` replacing owner-equality; `can(principal,action,resource)` seam) — free greenfield, avoids the 45-site/31-file retrofit. DEFERRED: the agent-principal *mint* mechanics (`provisionAgentPrincipal`, `users.isAgent`/`kind:agent`, agent `authorUserId` stamping, the `buddy_turns` firewall inversion) — buddy shipped v1 borrowed-owner (one principal; safe). → `Spine-Identity-and-Auth.md`, D60.
- **Local-light (CPU) embed/rerank tier:** a v1 scaffold PREREQUISITE (not "regret to fix"). A transformers.js/ONNX in-process backend (CPU+CUDA) sealed in `infra/providers/backends/` so a GPU-less, cloud-key-less user gets working memory search + reranking. → D39, `Tier-3b-Providers.md §2b`.
- **The 4 AI-native swings:** reserve the seams now, build v2. Reservations: type `ClipKind`/`ClipSourceKind`/`clip.scope` in `@orb/contracts/memory`; reserve `'world-state'` in `WorkloadKind` (stub runner); include an `'observer'` participant kind at the `chat_participants.kind` agent-split; keep search's cross-chat character scope + the stats↔discovery JOIN path open. Features (world-state substrate · narrative director · cross-chat character coherence · engagement-aware preset rec) are v2.
- **`can(principal, action, resource)` interface:** a function that **throws `DomainForbiddenError` on deny** (not bool — matches `requireAdmin`); `resource: ResourceRef` is a discriminated union `{ kind:'global' } | { kind:'chat', chatId } | { kind:'character', characterId } | …`; `requireAdmin`/`requireParticipant`/`requireHost` are named wrappers. Lives in `domain/admin/guard.ts` + the identity spine.
- **`no-inline-union-redecl` registry format:** self-registering via `export const X_VALUES = [...] as const satisfies readonly Foo[]`; the AST gate scans for the canonical member-tuples and flags any *other* inline spelling. Gate ONLY the measured-pain axes (`messageRole` 132, `users.role` 35, `guidedAction` 23, `ChatSource` 18, `ChatApi` 12) + the dispatch axes (`WorkloadKind`, `CredentialSource`, `RegexPlacement`, `AssetKind`, `TagTargetType`, `WorldBookRole`); skip trivial 2-member/2-site unions. → `Spine-TypeScript-and-Patterns.md §5.5`.
- **`no-inline-types` / `types-in-contract` exemption glob:** the gate flags EXPORTED `type`/`interface`/`z.object`/`z.enum` outside `**/contract/**`, `packages/{kit,contracts,db}/**`, `**/server/kit/**`. Exempt: `**/*.test.ts`; non-exported local aliases; drizzle `$inferSelect`/`$inferInsert` in `**/persistence/*.ts`.
- **Concentration risk — OWNED, not mitigated:** the knowledge cluster depends on Qwen3-VL existing at matching MRL-1024 + identical L2-norm on both vLLM and OpenRouter. The cosine≈1.0 probe guards it; if it fails, "free local↔hosted switch" degrades to a re-index. Documented in `Tier-3b-Providers.md §2b`.
- **Gate suite is a DAY-ONE BLOCKING deliverable:** the full dep-cruiser/biome ruleset + a blocking `check` (pre-commit + CI, ideally a PreToolUse hook) lands WITH the packages, before the first domain compiles. See `Core-Planning-and-Checklists.md`.

The operational hardening the council surfaced (oracle runbook, migration scripts, `.credentials-key` boot-probe, fire-and-forget failure surface, the \~150 esoterica → named tests) was captured as the pre-scaffold checklist (`Core-Planning-and-Checklists.md`).

## §6 — Testing standards consolidation (2026-06-26)

The test *layout* was locked (`Core-0-Architecture-and-Structure.md §5` + the `test-layout` gate); the test *policy* was scattered across \~40 docs and was consolidated into `Spine-Testing.md` (a spine peer). The committed calls (all now live in `Spine-Testing.md`):

- **Authority: `Spine-Testing.md`.** `Core-0 §5` stays the terse layout + `test-layout` statement and points to the spine doc.
- **Test kinds: kind by SUFFIX, one centralized `tests/` tree.** NODE lanes are Vitest `test.projects` selected by suffix in ONE `vitest.config.ts`: `unit` · `integration` (real libSQL `:memory:`) · `contract` (golden/surface) · `types` (`.test-d.ts`) · `parity` (differential oracle vs the steady clone, opt-in). BROWSER lanes are **Playwright, NOT Vitest** (browser-mode cold-cache hangs): `.ct.tsx` (component) · `.spec.ts` (e2e). Client pure-logic runs in the node `unit` project. Plus Vitest tags (`slow`/`live`).
- **`test-presence`: scoped, not blanket coverage.** Required on `verbs/*.ts`, schema-exporting `contract/*.ts`, `persistence/*.ts`. Line-coverage threshold report-only in v1.
- **Determinism:** no ambient clock/random/unseeded-id under `tests/`; injected frozen clock + seeded id generator via the composition-root seam (gate `test-determinism`).
- **Mock doctrine:** fake at the edges, inject at the root, never mock an internal module. Real `:memory:` db for `.int`; model made deterministic via the `scripted-override` seam.
- **Factory contract:** `makeX(overrides?)` pure builder + `seedX(db, overrides?)` persisted variant; factories live only in `tests/support/factories/`.
- **`tests/support/` is a DAY-ONE stand-up.** Client testing DEFERRED with the client rebuild (provisional rule: `tests/client/` mirrors `features/`, Playwright CT at mirror, e2e under `tests/client/e2e/`).
