# Core-Laws-and-Precedents

> Auto-generated from reorg manifest.

---

<!-- Source: Core-Laws-and-Precedents.md -->

## Orbweaver — decisions ledger (the committed record)

> **Status: the single authoritative list of what's decided.** Every design choice across the docs is
> recorded here as **DECIDED** (committed, build against it) or **DEFERRED-TO-SCAFFOLD** (with a
> committed default + the criterion that finalizes it — never an open question). The per-doc "Lean: X"
> notes are the local rationale; this ledger promotes them to decisions so nothing is scattered or
> re-litigated. Updated 2026-06-25 at the end of the planning + reconciliation pass.

<!-- Source: Core-Laws-and-Precedents.md -->

## 0. Locked principles (the constitution — `Core-0-Architecture-and-Structure.md`)

1. Boundaries are physics (pnpm workspace packages), not lint — the cake `kit ← contracts ← db ← server ← client` is resolver-enforced.
2. `#` intra-package, package deps cross-package, ZERO `paths` aliases.
3. Name by role; **no `_shared` / `_` junk drawers** — services are features, primitives + engines are `kit`.
4. One central `tests/` tree mirroring `src` 1:1.
5. "unwired ≠ worthless" — evaluate intent, don't auto-delete.
6. **kit-purity ruling:** `@orb/kit` MAY use isomorphic npm (zod/typeid-js/luxon/remend); may NOT use `node:*` / contracts / db / domain / I/O. Node-only-pure → `@orb/server/kit`.
7. **Build path:** greenfield for everything incl. chat + memory, gated by a **cross-repo differential oracle** against running neo-tavern (diff SEND/ASSEMBLE/RECEIVE + cache-token counts). The steady clone is the reference, not deleted.

<!-- Source: Core-Laws-and-Precedents.md -->

## 1. Code-grounded reconciliation resolutions (the corrections verification caught)

| #   | Decision                                                                                                                                                                                                                                                         | Why (verified against the steady clone)                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **§8 cache: the rolling-tail history breakpoint is PRESERVED + upgraded to ST's rolling PAIR** (`depth` & `depth+2`), computed in SHAPE, placed by the runner                                                                                                    | the original "drop it" was wrong — `computeHistoryBreakpoint` feeds a live 2nd `cache_control` (~5300 tok/turn, `chat-completions.ts`); dropping = silent regression. ST `cachingAtDepth` confirms the pair pattern. |
| R2  | **The canonical character card is ALREADY fully typed** (`creator`/`cardVersion`/`regexScripts`/`extensions` columns, `raw` dropped) — preserve, don't re-derive                                                                                                 | `db/schema/character.ts:137-140`; import + export agents both confirmed. character.md §7.3 was stale ("pending").                                                                                                    |
| R3  | **`resolveCharacterDepthPrompt` → `@orb/server/kit/serde`** (not `character/substrate`)                                                                                                                                                                          | 2 server consumers (chat/assembly + export) — a domain-substrate home forces a cross-feature import.                                                                                                                 |
| R4  | **`AssetKind` + `StoredAsset` → `@orb/contracts/assets`** (not domain-internal)                                                                                                                                                                                  | a cross-boundary wire union re-spelled across db enum + http + client + domain.                                                                                                                                      |
| R5  | **`oidc-store.ts` → `domain/sessions/persistence`** (not `infra/auth`)                                                                                                                                                                                           | it imports `@orb/db` (`oidc_transactions`) → can't be sealed db-free infra.                                                                                                                                          |
| R6  | **The PNG codec uses isomorphic base64/latin1 over `Uint8Array`, no `node:buffer`**                                                                                                                                                                              | the steady codec imports `node:buffer` (`png-card-codec.ts:9,77,134`), illegal in kit per the kit-purity ruling.                                                                                                     |
| R7  | **memory is a `chat/` SUBSYSTEM, not its own domain**                                                                                                                                                                                                            | `core/Core-0-Architecture-and-Structure.md §4`; `domains/memory.md` "own domain" wording was stale (fixed).                                                                                      |
| R8  | **`http` registrars → `entry/http`** (not transport); `buildWorkloadsEnv`/runner-env → `entry/`; the jobs worker is the `transport/jobs` driver                                                                                                                  | composition wiring crosses every feature boundary → entry, per `core/Core-0-Architecture-and-Structure.md §3`.                                                                                                       |
| R9  | **`infra/providers/resolve-chat` READS the capability descriptor on the request — never imports `resolveModelCapability`**                                                                                                                                       | infra→domain is an illegal upward import (`domain/connection` self-contradiction, fixed).                                                                                                                        |
| R10 | **`core/Core-0-Architecture-and-Structure.md §7` gate table grown to 13** (added `no-inline-types`, `no-inline-union-redecl`, `exhaustive-dispatch`, `persistence-no-io`, `persistence-no-in-memory-state`, `test-presence`, `test-determinism` to the base set) | promoted from the §7.4/§7.5 spine + the persistence + testing rules. The canonical count is **13** (core/Core-0-Architecture-and-Structure.md §7).                                                                   |
| R11 | **`infra/providers/vllm/` is nested** (not a sibling `infra/vllm/`); domain/credentials path reconciled                                                                                                                                                              | one tree location for the local engine.                                                                                                                                                                              |
| R12 | **The 3 doubled docs merged into single homes** (chat→domains/chat, connection→domains/connection, providers→tiers/providers); the 5 spine docs grouped into `spine/`                                                                                            | one home per topic; no cross-file drift.                                                                                                                                                                             |

<!-- Source: Core-Laws-and-Precedents.md -->

## 2. Committed decisions by area (promoted from the per-doc "Lean")

<!-- Source: Core-Laws-and-Precedents.md -->

### Identity / auth / permission (`spine/identity-auth-permission`, sessions, admin, credentials)

- **`Principal = { userId, role, handle, externalId, via }`** — does NOT carry `groups` (role is the sole authz axis; SSO groups fold into `role` at login).
- **Resolve identity ONCE at the `entry/auth/seam`** — `validate` returns the fields to assemble the Principal; `userId` carried out, never re-queried.
- **`can(principal, action, resource)` is the authority seam** — `requireAdmin` (global) + `requireParticipant`/`requireHost` (resource/chat) are its first implementations; capability is the third axis. `requireAdmin` lives in `domain/admin/guard.ts`.
- **Participant-membership replaces owner-equality** — `requireParticipant`/`requireHost` replace `loadOwnedChat` (~45 sites/31 files). `authorUserId` stamped with the real principal on the live persist path (new build).
- **`MaxProSubCredential` factory accepts a `Principal`** (does the admin check inside — one gate site). `CredentialSource` (4, dispatch) and `CredentialProvider` (5, storage) stay distinct types.
- **Custom/BYO**: add `modelProfile?: CustomModelProfile` to `providerMetadataSchema`. `google_vertex`/`anthropic`/`openai`: NO partial scaffolding — add union member + resolver arm + provider strategy together when implemented.
- **API tokens = a sessions verb** (`createApiToken`, far expiry + `label`, same table/revoke machinery).
- **vLLM admin verbs stay in `admin`** via an injected `VllmSupervisorPort` (no direct infra import).
- **`AdminUserView`**: domain-internal (promote to `@orb/contracts/identity` only if the client type-imports it).

<!-- Source: Core-Laws-and-Precedents.md -->

### Settings / config (`spine/settings-and-config`, settings, foundation)

- **Promote `IMPORT_DEFAULT_SOURCE` + `VLLM_*_CONCURRENCY` to AppSettings**; **`RATE_LIMIT_*` stays boot-env** (hot-reloading a limiter is fiddly, rarely wanted).
- **Split `envDefaults()`**: env-mirrored fields read `env`; born-in-DB defaults become `appSettingsSchema` defaults (the floor is one legible thing).
- **`IMPORT_DEFAULT_SOURCE` NODE_ENV auto-default stays the env floor**; the AppSettings override layers on top.
- **`EffectiveAppConfig`** lives in the settings `effective-config/` subsystem; injected as a **sync getter op** into chat/workloads; `entry/boot` reloads at startup.
- **`HOST_SECRET_ENV_KEYS`**: `foundation/env` exposes `processEnvSnapshot()`; `infra/providers/backends/agent-sdk` composes the denylist (policy travels with the firewall). _(path per §7 D8.)_
- **`lifecycle.ts` → `entry/`**; **`DbInspector` port dropped** (probes read `@orb/db` down); **`DEFAULT_*_MODEL_ID` → `@orb/contracts/connection`**.
- settings `results.ts`/`errors.ts` slots **omitted** until a non-view result / new failure mode appears.

<!-- Source: Core-Laws-and-Precedents.md -->

### Infra (`tiers/infra`, `tiers/providers`)

- **`ip-ranges.ts` / `host.ts` stay `infra/network`** (pure but no client consumer; revisit if one appears). **`password.ts` → `infra/auth`**. **`ingress-allowlist.ts` → `infra/network`**. **`safeFetch` kept unwired** (hardening seam).
- **`sharp` variant transform → an `infra/image` op** injected into a thin `resolve-variant` verb.
- **providers tree: `infra/providers/` with `vllm/` nested**; `RoleClients` stays a bundle (binder fills via `resolveRole`); rerank-hosted = typed-throw arm + local fallback; the agent-sdk session is backend-internal.

<!-- Source: Core-Laws-and-Precedents.md -->

### Knowledge cluster (`knowledge-cluster`, embeddings, search, discovery, stats)

- **Memory's `search` contract = a nested `MemoryQueryOptions` in `@orb/contracts/search`** with `scope:{chat}` + `candidates?:BlockKey[]` (bridge) as **first-class** fields; the other 4 semantics flat. (domain/search, landed.)
- **`embeddings.store` accepts `fkRefs.speakers`** (atomic speaker-sync). **Re-index trigger** = connection→workloads. **Image caption** generated in `embeddings/indexer` inline (precedes the joint embed); **image `content_hash`** = SHA-256 of the resized/sliced bytes (shared across both lenses).
- **`buildCardEmbedText` lives with `character`** (producer); discovery reads the flat `characters` card row (D28 — no version table). **`character_summaries` schema → `@orb/db/schema/discovery.ts`** (writer owns; search reads down). **`sliceJsonObject` stays discovery-substrate** unless a non-discovery consumer appears. **`segment.ts` reference segmenter → `memory/substrate`**. **`similarChats` stays in-RAM** (centroid not in the store).
- **stats delta builders stay in `chat/engine`** (chat owns the row shapes; anti-drift = shared `kit/stats-tally`). **Economics `messages` projection**: constructor in `stats/persistence`, the result shape discovery receives in `@orb/contracts`. **`forgottenGems`/`modelRouting` stay discovery verbs** with an injected stats-economics op.

<!-- Source: Core-Laws-and-Precedents.md -->

## 3. Deferred to scaffold (committed default + the criterion that finalizes)

| Item                                                                                                                     | Default                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Finalizes when                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| UI headless engine                                                                                                       | **Base UI** (radix-team successor); own the trivial atoms regardless                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | the `client` package is scaffolded (a client-rebuild call; doesn't gate kit→server)                                   |
| Stack version pins                                                                                                       | **2026-latest stable** Node/TS/Hono/Drizzle/tRPC                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `pnpm init` at scaffold (irreducibly a pin-what's-current act)                                                        |
| §8.6 agent-principal mechanics (`provisionAgentPrincipal`, `users.isAgent`/`kind`, the `buddy_turns` firewall inversion) | the model is locked in `spine/identity-auth-permission`; mechanics build as one coordinated multi-domain change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | the agent-as-first-class-principal feature is built (not part of the initial port)                                    |
| Agent credential inheritance                                                                                             | **the OWNER's agents INHERIT the owner's tier via owner-delegated `credentials.resolve` (default); a delegated admin (and its agents) + any non-owner agent get their own credential, never the owner's `max-pro-sub`** (revised 2026-06-26; clarified by D17 — the box belongs to `owner`, not any `admin`; was worded "admin-host"). The AAD stays owner-keyed (`${ownerUserId}\|provider`), so inheritance = the agent's `resolve()` delegates to the owner's `userId`, NOT a re-mint under the agent's id (a GCM-bound credential can't be row-lifted). One-arm addition to `credentials.resolve` at the agent-principal migration — the v1 borrowed-owner posture already delivers it for free (agent == owner at the credential seam). | confirmed when `users.isAgent` lands (spans sessions + credentials); default is INHERIT-for-OWNER, not own-credential |
| Event-bus concrete shape                                                                                                 | in-process typed bus, payloads from `@orb/contracts/events`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | wired at `entry/` when the first indexer subscription is built                                                        |
| `contracts/observability` mirror, t-digest latency, per-knob settings-form details                                       | the seams are noted; no module until needed (YAGNI)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | a real external consumer / measured need appears                                                                      |

<!-- Source: Core-Laws-and-Precedents.md -->

## 4. Build order + next step

**The expanded step-by-step runbook is `Core-BUILD-PLAN.md`** (phases + checkpoints); this section is the canonical order it consolidates. Scaffold in boundary-scan order (`core/Core-Audits-and-Debt.md`): **stand up the pnpm workspace + 5 packages + the gate suite (`core/Core-0-Architecture-and-Structure.md §7`, 13 gates) FIRST** (validates the cake at resolve-time), then bottom-up —
`kit → contracts → db → server (foundation → infra → domain[leaf-first: credentials/tag/persona/preset/world-info/assets/sessions/stats/settings/admin → embeddings/search → discovery/workloads/import/export/buddy] → transport → entry) → client`,
with **chat + memory LAST** behind the differential oracle. Populate `kit/ids` + `kit/errors` + the engines + `contracts/*` before any domain (the dissolution boot-order). Resolve §3's two scaffold-gating defaults (`@orb/*` already decided; UI engine + version pins at package creation).

> **embeddings + search inserted before discovery** (council/executability fix — discovery/memory/workloads consume them). The **composition root** is `entry/` — see `core/Tier-5-Entry.md`.

<!-- Source: Core-Laws-and-Precedents.md -->

### The `@orb/contracts` internal build DAG (promoted from `Core-Legacy-Migration-and-Gaps.md §8` — build in THIS order)

`contracts/` is not flat — these edges cause `tsc` errors if violated (an alphabetical setup breaks):

1. `contracts/versioned-config` **before** `contracts/settings` AND `contracts/preset`.
2. `contracts/world-info` (role/scope tuples) **before** `contracts/persona` AND `contracts/character`.
3. `contracts/connection` (`chatApiSchema`/`chatSourceSchema`) **before** `contracts/settings`.
4. `contracts/chat` (`group-config` defaults) + `contracts/regex` **before** `contracts/settings` — **the counterintuitive edge** (`UserSettings.groupDefaults`/`regexScripts` pull chat+regex types).
5. provider result contracts (`EmbedResult`/`RerankResult`/`ImageEmbedResult`/`SummarizeResult`) **before** `contracts/role-clients`.
   Within `kit`: `kit/macro` before `kit/regex` + `kit/guided`; `kit/world-info` tuples before the three contracts that import them.

<!-- Source: Core-Laws-and-Precedents.md -->

## 5. Council-driven decisions (2026-06-25 greenfield review)

The 5-seat council (skeptic · AI-native · ops · executability · product) unanimously signed off WITH conditions. Verdicts + the full condition list: `core/Core-Planning-and-Checklists.md`. The committed calls:

- **v1 authority scope — DECIDED: build human participant-membership in v1** (`requireParticipant`/`requireHost` replacing owner-equality; `can(principal,action,resource)` seam). It's free greenfield and avoids the measured 45-site/31-file retrofit. **DEFERRED: the agent-principal _mint_ mechanics** (`provisionAgentPrincipal`, `users.isAgent`/`kind:agent`, agent `authorUserId` stamping, the `buddy_turns` firewall inversion) — buddy ships v1 in the borrowed-owner posture (one principal; safe). Resolves the skeptic/product "docs point both ways" flag.
- **Local-light (CPU) embed/rerank tier — DECIDED: a v1 scaffold PREREQUISITE** (not "regret to fix"). A transformers.js/ONNX in-process backend (CPU+CUDA) sealed in `infra/providers/backends/` so a GPU-less, cloud-key-less user gets working memory search + reranking. Without it the "strict superset" claim fails for the "any box" crowd (product seat's one real risk). (`core/Tier-3b-Providers.md §2b`.)
- **The 4 AI-native swings — DECIDED: reserve the seams now, build the features v2.** Reservations (cheap, added now): type `ClipKind`/`ClipSourceKind`/`clip.scope` in `@orb/contracts/memory`; reserve `'world-state'` in the `WorkloadKind` union (stub runner); include an `'observer'` participant kind when the `chat_participants.kind` agent-split lands; keep search's cross-chat character scope + the stats↔discovery JOIN path open. The features (world-state substrate · narrative director · cross-chat character coherence · engagement-aware preset rec) are v2.
- **`can(principal, action, resource)` interface — DECIDED:** a function that **throws `DomainForbiddenError` on deny** (not bool — matches the `requireAdmin` pattern); `resource: ResourceRef` is a discriminated union `{ kind:'global' } | { kind:'chat', chatId } | { kind:'character', characterId } | …`; `requireAdmin`/`requireParticipant`/`requireHost` are named wrappers over it. Lives in `domain/admin/guard.ts` + the identity spine.
- **`no-inline-union-redecl` registry format — DECIDED: self-registering** via the `export const X_VALUES = [...] as const satisfies readonly Foo[]` convention; the AST gate scans for the canonical member-tuples and flags any _other_ inline spelling of the same set. Gate ONLY the measured-pain axes (`messageRole` 132, `users.role` 35, `guidedAction` 23, `ChatSource` 18, `ChatApi` 12) + the dispatch axes (`WorkloadKind`, `CredentialSource`, `RegexPlacement`, `AssetKind`, `TagTargetType`, `WorldBookRole`); **skip trivial 2-member/2-site unions** (skeptic's over-engineering call).
- **`no-inline-types` / `types-in-contract` exemption glob — DECIDED:** the gate flags EXPORTED `type`/`interface`/`z.object`/`z.enum` outside `**/contract/**`, `packages/{kit,contracts,db}/**`, `**/server/kit/**`. **Exempt:** `**/*.test.ts`; non-exported local aliases (one-file scope); drizzle `$inferSelect`/`$inferInsert` in `**/persistence/*.ts`.
- **Concentration risk — OWNED, not mitigated:** the knowledge cluster depends on Qwen3-VL existing at matching MRL-1024 + identical L2-norm on both vLLM and OpenRouter. The cosine≈1.0 probe guards it; if it fails, "free local↔hosted switch" degrades to a re-index. Acceptable single-vendor-model dependency for the stated product; documented in `core/Tier-3b-Providers.md §2b`.
- **Gate suite is a DAY-ONE BLOCKING deliverable** (skeptic's #1): the full dep-cruiser/biome ruleset + a blocking `check` (pre-commit + CI, ideally a PreToolUse hook since agents are the authors) lands WITH the packages, before the first domain compiles. The boundary scan proves the cake is clean today; nothing keeps it clean but gates that don't exist yet. See `core/Core-Planning-and-Checklists.md`.

The operational hardening the council surfaced (oracle runbook, migration scripts, `.credentials-key` boot-probe, fire-and-forget failure surface, the ~150 esoterica → named tests, etc.) is captured as the **pre-scaffold checklist** (`core/Core-Planning-and-Checklists.md`) — implementation-time, not doc edits.

<!-- Source: Core-Laws-and-Precedents.md -->

## 6. Testing standards consolidation (2026-06-26)

Two independent full-doc reads converged: the test _layout_ was locked (`core/Core-0-Architecture-and-Structure.md §5` + the `test-layout` gate) but the test _policy_ was scattered across 40 docs with no one-stop home. Consolidated into `core/Spine-Testing.md` (a spine peer — testing is a cross-cutting constitutional thread). The committed calls:

- **Authority — DECIDED: `core/Spine-Testing.md`.** `core/Core-0-Architecture-and-Structure.md §5` stays the terse layout + `test-layout` statement and points to the spine doc for the full policy. No doubling.
- **Test kinds — DECIDED: kind by SUFFIX, one centralized `tests/` tree (not neo's category dirs — suffixes are more CI-flexible).** NODE lanes are Vitest `test.projects` selected by suffix in ONE `vitest.config.ts` (`test.projects` is the modern "workspace" — the standalone `vitest.workspace.ts` was deprecated in Vitest 3.2): `unit` (`.test.ts`) · `integration` (`.int.test.ts`, real libSQL `:memory:`) · `contract` (`.contract.test.ts` — golden/surface) · `types` (`.test-d.ts`, typecheck-only) · `parity` (`.parity.test.ts` — differential oracle vs the steady clone, **opt-in**, excluded from the fast lane). BROWSER lanes are **Playwright, NOT Vitest** (Vitest browser-mode cold-cache _hangs_ — neo-tavern migrated off it): `.ct.tsx` (component, Playwright CT, `playwright-ct.config.ts`) · `.spec.ts` (e2e, `playwright.config.ts`) — separate runners, not in the fast `check`. Client pure-logic (`.test.ts`, no DOM) runs in the node `unit` project and gates. Plus Vitest **tags** (`slow`/`live`) for the runtime axis.
- **`test-presence` — DECIDED: the 12th gate, scoped (not blanket coverage).** Required tests on exactly three surfaces: every `verbs/*.ts` (≥1 `.test`/`.int.test`), every `contract/*.ts` exporting a schema (a `.contract.test`), every `persistence/*.ts` (a `.int.test`). Exempt: barrels, `context.ts`, pure-type contracts. Blanket per-file coverage rejected (breeds assertion-free filler). **Line-coverage threshold = report-only in v1** (hard % gets gamed); revisit post-v1.
- **Determinism — DECIDED: no ambient clock/random/unseeded-id under `tests/`.** The fixture injects a frozen clock + a seeded `typeid` generator via the same composition-root seam production uses (`core/Tier-5-Entry.md`). Gate candidate `test-determinism` (biome no-restricted-globals scoped to `tests/`). Determinism is a correctness property (stable rolling-pair + recall-ordering assertions), not a nicety.
- **Mock doctrine — DECIDED: fake at the edges, inject at the root, never mock an internal module.** Real `:memory:` db for `.int`; the model/provider made deterministic via the existing `scripted-override` seam (not a mock framework); cross-feature deps injected as ports at the composition root. `vi.mock` of a sibling `src/` module is a review-flag (`no-internal-mocks`, advisory).
- **Factory contract — DECIDED:** `makeX(overrides?): X` pure builder (deterministic defaults, no db) + `seedX(db, overrides?): Promise<X>` persisted variant; valid-minimal defaults, shallow-merge overrides, relations-as-ids unless explicitly expanded. Factories live only in `tests/support/factories/`.
- **Scattered obligations — gathered (index, not invented):** the ~150 esoterica (`CHECKLIST §C2`) each → a named test at its mirror; the oracle (`CHECKLIST §C1`) → `tests/server/domain/chat/pipeline-breakpoint.parity.test.ts` (at the mirror; steady-clone driver in `tests/support/parity-runner.ts`; runbook written before the chat scaffold); memory's 6 chat-scoped semantics → named `.int.test.ts` (the surface the oracle deliberately cannot cover); serde round-trip → one `.contract.test.ts`.
- **`tests/support/` is a DAY-ONE stand-up** (fixture `test.extend` + `freshDb` + `clock` + `ids` + factories) — folded into the gate-suite wave so the fixture doctrine has something to import (`CHECKLIST §A4`).
- **Client testing — DEFERRED with the client rebuild** (provisional rule stated: `tests/client/` mirrors `features/`, Playwright CT at mirror, e2e under `tests/client/e2e/`); full depth standard appended to `core/Spine-Testing.md §7` at client scaffold. Flagged as an honest gap, not a false lock.

<!-- Source: Core-Laws-and-Precedents.md -->

## 7. Conflict resolutions — the central path/home registry (2026-06-26)

A full-read audit of all 41 docs (6 agents, every doc end-to-end) surfaced cross-doc path conflicts where two docs named different homes for the same thing. **These are now DECIDED — this section is the single source of truth; every other doc is aligned to it.** If a doc ever disagrees with §7, §7 wins.


**The D-registry was split by decision-id range (2026-07-02) into sibling docs.** Cite as `Core-Laws-and-Precedents.md §7 Dxx`; resolve the id via its range below. D-numbers are stable global ids — a cross-reference like "supersedes D45" is found by grepping the id regardless of which file holds it.

- **D1–D34** → [`Core-Path-Registry-D1-D34.md`](Core-Path-Registry-D1-D34.md) — entry shape, kit/contracts homes, schema/ownership model
- **D35–D43** → [`Core-Path-Registry-D35-D43.md`](Core-Path-Registry-D35-D43.md) — providers/regex/db-enum, identity-resolution (D40), neo-client audit (D43)
- **D44–D52** (+ PD-11) → [`Core-Path-Registry-D44-D52.md`](Core-Path-Registry-D44-D52.md) — theming/multimodal/scripting/tool-use/ST-parity/charts specs
- **D53–D59** → [`Core-Path-Registry-D53-D59.md`](Core-Path-Registry-D53-D59.md) — client-foundation, regex, memory, RPG, chat-crew (D54 precedes D53 in source)
- **D60–D61** → [`Core-Path-Registry-D60-D61.md`](Core-Path-Registry-D60-D61.md) — agent-principal (D60), marinara-borrow disposition (D61)

## Enforcement registry

Split out 2026-07-02 into two sibling docs:

- **Active gates** — the six-layer catalog of what fails a build today → [`Core-Enforcement-Active-Gates.md`](Core-Enforcement-Active-Gates.md)
- **Deferred + dropped gates** — backlog (with activation triggers) + rejected neo gates → [`Core-Enforcement-Deferred-Dropped.md`](Core-Enforcement-Deferred-Dropped.md)
