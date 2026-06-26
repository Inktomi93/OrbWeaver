# Orbweaver — decisions ledger (the committed record)

> **Status: the single authoritative list of what's decided.** Every design choice across the docs is
> recorded here as **DECIDED** (committed, build against it) or **DEFERRED-TO-SCAFFOLD** (with a
> committed default + the criterion that finalizes it — never an open question). The per-doc "Lean: X"
> notes are the local rationale; this ledger promotes them to decisions so nothing is scattered or
> re-litigated. Updated 2026-06-25 at the end of the planning + reconciliation pass.

## 0. Locked principles (the constitution — `structure.md`)
1. Boundaries are physics (pnpm workspace packages), not lint — the cake `kit ← contracts ← db ← server ← client` is resolver-enforced.
2. `#` intra-package, package deps cross-package, ZERO `paths` aliases.
3. Name by role; **no `_shared` / `_` junk drawers** — services are features, primitives + engines are `kit`.
4. One central `tests/` tree mirroring `src` 1:1.
5. "unwired ≠ worthless" — evaluate intent, don't auto-delete.
6. **kit-purity ruling:** `@orb/kit` MAY use isomorphic npm (zod/typeid-js/luxon/remend); may NOT use `node:*` / contracts / db / domain / I/O. Node-only-pure → `@orb/server/kit`.
7. **Build path:** greenfield for everything incl. chat + memory, gated by a **cross-repo differential oracle** against running neo-tavern (diff SEND/ASSEMBLE/RECEIVE + cache-token counts). The steady clone is the reference, not deleted.

## 1. Code-grounded reconciliation resolutions (the corrections verification caught)
| # | Decision | Why (verified against the steady clone) |
|---|---|---|
| R1 | **§8 cache: the rolling-tail history breakpoint is PRESERVED + upgraded to ST's rolling PAIR** (`depth` & `depth+2`), computed in SHAPE, placed by the runner | the original "drop it" was wrong — `computeHistoryBreakpoint` feeds a live 2nd `cache_control` (~5300 tok/turn, `chat-completions.ts`); dropping = silent regression. ST `cachingAtDepth` confirms the pair pattern. |
| R2 | **The canonical character card is ALREADY fully typed** (`creator`/`cardVersion`/`regexScripts`/`extensions` columns, `raw` dropped) — preserve, don't re-derive | `db/schema/character.ts:137-140`; import + export agents both confirmed. character.md §7.3 was stale ("pending"). |
| R3 | **`resolveCharacterDepthPrompt` → `@orb/server/kit/serde`** (not `character/substrate`) | 2 server consumers (chat/assembly + export) — a domain-substrate home forces a cross-feature import. |
| R4 | **`AssetKind` + `StoredAsset` → `@orb/contracts/assets`** (not domain-internal) | a cross-boundary wire union re-spelled across db enum + http + client + domain. |
| R5 | **`oidc-store.ts` → `domain/sessions/persistence`** (not `infra/auth`) | it imports `@orb/db` (`oidc_transactions`) → can't be sealed db-free infra. |
| R6 | **The PNG codec uses isomorphic base64/latin1 over `Uint8Array`, no `node:buffer`** | the steady codec imports `node:buffer` (`png-card-codec.ts:9,77,134`), illegal in kit per the kit-purity ruling. |
| R7 | **memory is a `chat/` SUBSYSTEM, not its own domain** | `structure.md §4` + `domains/chat.md`; `knowledge-cluster.md` "own domain" wording was stale (fixed). |
| R8 | **`http` registrars → `entry/http`** (not transport); `buildWorkloadsEnv`/runner-env → `entry/`; the jobs worker is the `transport/jobs` driver | composition wiring crosses every feature boundary → entry, per `structure.md §3`. |
| R9 | **`infra/providers/resolve-chat` READS the capability descriptor on the request — never imports `resolveModelCapability`** | infra→domain is an illegal upward import (`domains/connection.md` self-contradiction, fixed). |
| R10 | **`structure.md §7` gate table 6 → 11** (+ `no-inline-types`, `no-inline-union-redecl`, `exhaustive-dispatch`, `persistence-no-io`, `persistence-no-in-memory-state`) | promoted from the §7.4/§7.5 spine + the persistence rules. |
| R11 | **`infra/providers/vllm/` is nested** (not a sibling `infra/vllm/`); credentials.md path reconciled | one tree location for the local engine. |
| R12 | **The 3 doubled docs merged into single homes** (chat→domains/chat, connection→domains/connection, providers→tiers/providers); the 5 spine docs grouped into `spine/` | one home per topic; no cross-file drift. |

## 2. Committed decisions by area (promoted from the per-doc "Lean")

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

### Settings / config (`spine/settings-and-config`, settings, foundation)
- **Promote `IMPORT_DEFAULT_SOURCE` + `VLLM_*_CONCURRENCY` to AppSettings**; **`RATE_LIMIT_*` stays boot-env** (hot-reloading a limiter is fiddly, rarely wanted).
- **Split `envDefaults()`**: env-mirrored fields read `env`; born-in-DB defaults become `appSettingsSchema` defaults (the floor is one legible thing).
- **`IMPORT_DEFAULT_SOURCE` NODE_ENV auto-default stays the env floor**; the AppSettings override layers on top.
- **`EffectiveAppConfig`** lives in the settings `effective-config/` subsystem; injected as a **sync getter op** into chat/workloads; `entry/boot` reloads at startup.
- **`HOST_SECRET_ENV_KEYS`**: `foundation/env` exposes `processEnvSnapshot()`; `infra/providers/backends/agent-sdk` composes the denylist (policy travels with the firewall). *(path per §7 D8.)*
- **`lifecycle.ts` → `entry/`**; **`DbInspector` port dropped** (probes read `@orb/db` down); **`DEFAULT_*_MODEL_ID` → `@orb/contracts/connection`**.
- settings `results.ts`/`errors.ts` slots **omitted** until a non-view result / new failure mode appears.

### Infra (`tiers/infra`, `tiers/providers`)
- **`ip-ranges.ts` / `host.ts` stay `infra/network`** (pure but no client consumer; revisit if one appears). **`password.ts` → `infra/auth`**. **`ingress-allowlist.ts` → `infra/network`**. **`safeFetch` kept unwired** (hardening seam).
- **`sharp` variant transform → an `infra/image` op** injected into a thin `resolve-variant` verb.
- **providers tree: `infra/providers/` with `vllm/` nested**; `RoleClients` stays a bundle (binder fills via `resolveRole`); rerank-hosted = typed-throw arm + local fallback; the agent-sdk session is backend-internal.

### Knowledge cluster (`knowledge-cluster`, embeddings, search, discovery, stats)
- **Memory's `search` contract = a nested `MemoryQueryOptions` in `@orb/contracts/search`** with `scope:{chat}` + `candidates?:BlockKey[]` (bridge) as **first-class** fields; the other 4 semantics flat. (search.md, landed.)
- **`embeddings.store` accepts `fkRefs.speakers`** (atomic speaker-sync). **Re-index trigger** = connection→workloads. **Image caption** generated in `embeddings/indexer` inline (precedes the joint embed); **image `content_hash`** = SHA-256 of the resized/sliced bytes (shared across both lenses).
- **`buildCardEmbedText` lives with `character`** (producer); discovery reads the current-version card. **`character_summaries` schema → `@orb/db/schema/discovery.ts`** (writer owns; search reads down). **`sliceJsonObject` stays discovery-substrate** unless a non-discovery consumer appears. **`segment.ts` reference segmenter → `memory/substrate`**. **`similarChats` stays in-RAM** (centroid not in the store).
- **stats delta builders stay in `chat/engine`** (chat owns the row shapes; anti-drift = shared `kit/stats-tally`). **Economics `messages` projection**: constructor in `stats/persistence`, the result shape discovery receives in `@orb/contracts`. **`forgottenGems`/`modelRouting` stay discovery verbs** with an injected stats-economics op.

## 3. Deferred to scaffold (committed default + the criterion that finalizes)
| Item | Default | Finalizes when |
|---|---|---|
| UI headless engine | **Base UI** (radix-team successor); own the trivial atoms regardless | the `client` package is scaffolded (a client-rebuild call; doesn't gate kit→server) |
| Stack version pins | **2026-latest stable** Node/TS/Hono/Drizzle/tRPC | `pnpm init` at scaffold (irreducibly a pin-what's-current act) |
| §8.6 agent-principal mechanics (`provisionAgentPrincipal`, `users.isAgent`/`kind`, the `buddy_turns` firewall inversion) | the model is locked in `spine/identity-auth-permission`; mechanics build as one coordinated multi-domain change | the agent-as-first-class-principal feature is built (not part of the initial port) |
| Agent credential inheritance | **own credential, not inherited** (safer; an agent gets its own tier, not the owner's `max-pro-sub`) | confirmed when `users.isAgent` lands (spans sessions + credentials) |
| Event-bus concrete shape | in-process typed bus, payloads from `@orb/contracts/events` | wired at `entry/` when the first indexer subscription is built |
| `contracts/observability` mirror, t-digest latency, per-knob settings-form details | the seams are noted; no module until needed (YAGNI) | a real external consumer / measured need appears |

## 4. Build order + next step
**The expanded step-by-step runbook is `BUILD-PLAN.md`** (phases + checkpoints); this section is the canonical order it consolidates. Scaffold in boundary-scan order (`reports/boundary-scan.md`): **stand up the pnpm workspace + 5 packages + the gate suite (`structure.md §7`, 13 gates) FIRST** (validates the cake at resolve-time), then bottom-up —
`kit → contracts → db → server (foundation → infra → domain[leaf-first: credentials/tag/persona/preset/world-info/assets/sessions/stats/settings/admin → embeddings/search → discovery/workloads/import/export/buddy] → transport → entry) → client`,
with **chat + memory LAST** behind the differential oracle. Populate `kit/ids` + `kit/errors` + the engines + `contracts/*` before any domain (the dissolution boot-order). Resolve §3's two scaffold-gating defaults (`@orb/*` already decided; UI engine + version pins at package creation).

> **embeddings + search inserted before discovery** (council/executability fix — discovery/memory/workloads consume them). The **composition root** is `entry/` — see `tiers/entry.md`.

### The `@orb/contracts` internal build DAG (promoted from `shared-dissolution.md §8` — build in THIS order)
`contracts/` is not flat — these edges cause `tsc` errors if violated (an alphabetical setup breaks):
1. `contracts/versioned-config` **before** `contracts/settings` AND `contracts/preset`.
2. `contracts/world-info` (role/scope tuples) **before** `contracts/persona` AND `contracts/character`.
3. `contracts/connection` (`chatApiSchema`/`chatSourceSchema`) **before** `contracts/settings`.
4. `contracts/chat` (`group-config` defaults) + `contracts/regex` **before** `contracts/settings` — **the counterintuitive edge** (`UserSettings.groupDefaults`/`regexScripts` pull chat+regex types).
5. provider result contracts (`EmbedResult`/`RerankResult`/`ImageEmbedResult`/`SummarizeResult`) **before** `contracts/role-clients`.
Within `kit`: `kit/macro` before `kit/regex` + `kit/guided`; `kit/world-info` tuples before the three contracts that import them.

## 5. Council-driven decisions (2026-06-25 greenfield review)
The 5-seat council (skeptic · AI-native · ops · executability · product) unanimously signed off WITH conditions. Verdicts + the full condition list: `reports/COUNCIL-REVIEW.md`. The committed calls:

- **v1 authority scope — DECIDED: build human participant-membership in v1** (`requireParticipant`/`requireHost` replacing owner-equality; `can(principal,action,resource)` seam). It's free greenfield and avoids the measured 45-site/31-file retrofit. **DEFERRED: the agent-principal *mint* mechanics** (`provisionAgentPrincipal`, `users.isAgent`/`kind:agent`, agent `authorUserId` stamping, the `buddy_turns` firewall inversion) — buddy ships v1 in the borrowed-owner posture (one principal; safe). Resolves the skeptic/product "docs point both ways" flag.
- **Local-light (CPU) embed/rerank tier — DECIDED: a v1 scaffold PREREQUISITE** (not "regret to fix"). A transformers.js/ONNX in-process backend (CPU+CUDA) sealed in `infra/providers/backends/` so a GPU-less, cloud-key-less user gets working memory search + reranking. Without it the "strict superset" claim fails for the "any box" crowd (product seat's one real risk). (`tiers/providers.md §2b`.)
- **The 4 AI-native swings — DECIDED: reserve the seams now, build the features v2.** Reservations (cheap, added now): type `ClipKind`/`ClipSourceKind`/`clip.scope` in `@orb/contracts/memory`; reserve `'world-state'` in the `WorkloadKind` union (stub runner); include an `'observer'` participant kind when the `chat_participants.kind` agent-split lands; keep search's cross-chat character scope + the stats↔discovery JOIN path open. The features (world-state substrate · narrative director · cross-chat character coherence · engagement-aware preset rec) are v2.
- **`can(principal, action, resource)` interface — DECIDED:** a function that **throws `DomainForbiddenError` on deny** (not bool — matches the `requireAdmin` pattern); `resource: ResourceRef` is a discriminated union `{ kind:'global' } | { kind:'chat', chatId } | { kind:'character', characterId } | …`; `requireAdmin`/`requireParticipant`/`requireHost` are named wrappers over it. Lives in `domain/admin/guard.ts` + the identity spine.
- **`no-inline-union-redecl` registry format — DECIDED: self-registering** via the `export const X_VALUES = [...] as const satisfies readonly Foo[]` convention; the AST gate scans for the canonical member-tuples and flags any *other* inline spelling of the same set. Gate ONLY the measured-pain axes (`messageRole` 132, `users.role` 35, `guidedAction` 23, `ChatSource` 18, `ChatApi` 12) + the dispatch axes (`WorkloadKind`, `CredentialSource`, `RegexPlacement`, `AssetKind`, `TagTargetType`, `WorldBookRole`); **skip trivial 2-member/2-site unions** (skeptic's over-engineering call).
- **`no-inline-types` / `types-in-contract` exemption glob — DECIDED:** the gate flags EXPORTED `type`/`interface`/`z.object`/`z.enum` outside `**/contract/**`, `packages/{kit,contracts,db}/**`, `**/server/kit/**`. **Exempt:** `**/*.test.ts`; non-exported local aliases (one-file scope); drizzle `$inferSelect`/`$inferInsert` in `**/persistence/*.ts`.
- **Concentration risk — OWNED, not mitigated:** the knowledge cluster depends on Qwen3-VL existing at matching MRL-1024 + identical L2-norm on both vLLM and OpenRouter. The cosine≈1.0 probe guards it; if it fails, "free local↔hosted switch" degrades to a re-index. Acceptable single-vendor-model dependency for the stated product; documented in `tiers/providers.md §2b`.
- **Gate suite is a DAY-ONE BLOCKING deliverable** (skeptic's #1): the full dep-cruiser/biome ruleset + a blocking `check` (pre-commit + CI, ideally a PreToolUse hook since agents are the authors) lands WITH the packages, before the first domain compiles. The boundary scan proves the cake is clean today; nothing keeps it clean but gates that don't exist yet. See `reports/PRE-SCAFFOLD-CHECKLIST.md`.

The operational hardening the council surfaced (oracle runbook, migration scripts, `.credentials-key` boot-probe, fire-and-forget failure surface, the ~150 esoterica → named tests, etc.) is captured as the **pre-scaffold checklist** (`reports/PRE-SCAFFOLD-CHECKLIST.md`) — implementation-time, not doc edits.

## 6. Testing standards consolidation (2026-06-26)

Two independent full-doc reads converged: the test *layout* was locked (`structure.md §5` + the `test-layout` gate) but the test *policy* was scattered across 40 docs with no one-stop home. Consolidated into `spine/testing.md` (a spine peer — testing is a cross-cutting constitutional thread). The committed calls:

- **Authority — DECIDED: `spine/testing.md`.** `structure.md §5` stays the terse layout + `test-layout` statement and points to the spine doc for the full policy. No doubling.
- **Test kinds — DECIDED: kind by SUFFIX, one centralized `tests/` tree (not neo's category dirs — suffixes are more CI-flexible).** NODE lanes are Vitest `test.projects` selected by suffix in ONE `vitest.config.ts` (`test.projects` is the modern "workspace" — the standalone `vitest.workspace.ts` was deprecated in Vitest 3.2): `unit` (`.test.ts`) · `integration` (`.int.test.ts`, real libSQL `:memory:`) · `contract` (`.contract.test.ts` — golden/surface) · `types` (`.test-d.ts`, typecheck-only) · `parity` (`.parity.test.ts` — differential oracle vs the steady clone, **opt-in**, excluded from the fast lane). BROWSER lanes are **Playwright, NOT Vitest** (Vitest browser-mode cold-cache *hangs* — neo-tavern migrated off it): `.ct.tsx` (component, Playwright CT, `playwright-ct.config.ts`) · `.spec.ts` (e2e, `playwright.config.ts`) — separate runners, not in the fast `check`. Client pure-logic (`.test.ts`, no DOM) runs in the node `unit` project and gates. Plus Vitest **tags** (`slow`/`live`) for the runtime axis.
- **`test-presence` — DECIDED: the 12th gate, scoped (not blanket coverage).** Required tests on exactly three surfaces: every `verbs/*.ts` (≥1 `.test`/`.int.test`), every `contract/*.ts` exporting a schema (a `.contract.test`), every `persistence/*.ts` (a `.int.test`). Exempt: barrels, `context.ts`, pure-type contracts. Blanket per-file coverage rejected (breeds assertion-free filler). **Line-coverage threshold = report-only in v1** (hard % gets gamed); revisit post-v1.
- **Determinism — DECIDED: no ambient clock/random/unseeded-id under `tests/`.** The fixture injects a frozen clock + a seeded `typeid` generator via the same composition-root seam production uses (`tiers/entry.md`). Gate candidate `test-determinism` (biome no-restricted-globals scoped to `tests/`). Determinism is a correctness property (stable rolling-pair + recall-ordering assertions), not a nicety.
- **Mock doctrine — DECIDED: fake at the edges, inject at the root, never mock an internal module.** Real `:memory:` db for `.int`; the model/provider made deterministic via the existing `scripted-override` seam (not a mock framework); cross-feature deps injected as ports at the composition root. `vi.mock` of a sibling `src/` module is a review-flag (`no-internal-mocks`, advisory).
- **Factory contract — DECIDED:** `makeX(overrides?): X` pure builder (deterministic defaults, no db) + `seedX(db, overrides?): Promise<X>` persisted variant; valid-minimal defaults, shallow-merge overrides, relations-as-ids unless explicitly expanded. Factories live only in `tests/support/factories/`.
- **Scattered obligations — gathered (index, not invented):** the ~150 esoterica (`CHECKLIST §C2`) each → a named test at its mirror; the oracle (`CHECKLIST §C1`) → `tests/server/domain/chat/pipeline-breakpoint.parity.test.ts` (at the mirror; steady-clone driver in `tests/support/parity-runner.ts`; runbook written before the chat scaffold); memory's 6 chat-scoped semantics (`domains/chat.md`) → named `.int.test.ts` (the surface the oracle deliberately cannot cover); serde round-trip → one `.contract.test.ts`.
- **`tests/support/` is a DAY-ONE stand-up** (fixture `test.extend` + `freshDb` + `clock` + `ids` + factories) — folded into the gate-suite wave so the fixture doctrine has something to import (`CHECKLIST §A4`).
- **Client testing — DEFERRED with the client rebuild** (provisional rule stated: `tests/client/` mirrors `features/`, Playwright CT at mirror, e2e under `tests/client/e2e/`); full depth standard appended to `spine/testing.md §7` at client scaffold. Flagged as an honest gap, not a false lock.

## 7. Conflict resolutions — the central path/home registry (2026-06-26)

A full-read audit of all 41 docs (6 agents, every doc end-to-end) surfaced cross-doc path conflicts where two docs named different homes for the same thing. **These are now DECIDED — this section is the single source of truth; every other doc is aligned to it.** If a doc ever disagrees with §7, §7 wins.

- **D1 — The auth seam is `entry/auth/seam.ts`.** The ONE Principal construction site. NOT `entry/compose/auth-seam.ts`. (Winner: ledger §2 + `tiers/infra.md` + `domains/sessions.md`; `tiers/entry.md` was the outlier and is corrected.)
- **D2 — `entry/` canonical shape (LOCKED):** root files `index.ts`, `app.ts`, `lifecycle.ts`; `auth/` (the seam, D1); `boot/` (migrate + `seed-credential` + `seed-owner` + `seed-default-preset` + `seed-default-characters` + `reclaim-locks`); `compose/` (the non-auth wiring: `services`, `runner-env`, `event-bus`, `role-clients`, `effective-config`); `http/` (`blob`, `upload`, `auth-routes`, `healthz`); `import/` (`run-profile-import`, the bulk composition driver). `compose/` is KEPT for wiring; the auth seam lives in `auth/`, not `compose/`.
- **D3 — Bulk import has two distinct homes, both real:** `entry/http/upload.ts` = the HTTP multipart route; it delegates to `entry/import/run-profile-import.ts` = the composition driver. Not a conflict — two responsibilities.
- **D4 — `WorkloadRunnerEnv` builder = `entry/compose/runner-env.ts`** (not loose `entry/workloads-env.ts` / `entry/buddy-env.ts`). The type stays in `domain/workloads/contract`.
- **D5 — `lifecycle` = `entry/lifecycle.ts`** (not `foundation/lifecycle.ts`). Foundation's open question is closed.
- **D6 — Image variant transform = EXTRACT to `infra/image`.** A `sharp` adapter behind an `imageTransform` op, injected into `domain/assets/verbs/resolve-variant.ts` (width-snap = domain policy; `sharp` = infra I/O). NOT inline in the blob route. Closes the `tiers/infra.md`/`domains/assets.md` "open decision."
- **D7 — vLLM = `infra/providers/vllm/`** (nested under providers, with `engine/` + `surfaces/`), per the LOCKED R11. The `infra/vllm` sibling alternative is dropped; `shared-dissolution.md §6` is corrected.
- **D8 — Claude Agent SDK backend = `infra/providers/backends/agent-sdk/`** (+ `session/`). The `infra/providers/claude-sdk` name is dropped; `domains/settings.md`'s SDK-runtime-config references point here.
- **D9 — `content-hash` = `@orb/server/kit/content-hash`** (node-only-pure; NOT `@orb/kit`). (Winner: `shared-dissolution.md §2` + `domains/search.md` + `domains/character.md`.)
- **D10 — `replay-buffer` + `stats-tally` = `@orb/kit/{replay-buffer,stats-tally}`** (pure primitives; NOT feature-internal). (Winner: `shared-dissolution.md §8` boot-order + `domains/{buddy,workloads,stats}.md`.)
- **D11 — `kit/assets` is required** (`@orb/kit/assets`, the `isAssetHash` guard). `shared-dissolution.md §8` boot-list is corrected to include it (it was in §1 but dropped from the §8 list).
- **D12 — identity/session contracts split:** `@orb/contracts/identity` (`Principal`, `ResolvedIdentity`, `UserRole`) + `@orb/contracts/session` (`SessionView`, **singular**). The domain stays `domain/sessions` (plural). No `@orb/contracts/sessions`.
- **D13 — `tests/kit` exists** (the `spine/testing.md §2` tree snippet omitted it; the mirror rule governs — `packages/kit/src` ⇒ `tests/kit`). Snippet corrected.
- **D14 — `substrate`/`persistence` are optional template slots** (`structure.md §4`: "only if needed"). `domain/chat` and `domain/workloads` have NO top-level `substrate/` (helpers live in their named subsystems); `domain/export` has NO `persistence/`. Not omissions — deliberate.
- **D15 — Uniform directory-modules + ONE resolution map (2026-06-26).** Every importable module (kit primitive, contract namespace, server tier/feature, db sub-area) is a **directory with `index.ts`**; internal files are flat + relative-imported. All five packages use the identical `exports`/`imports`: `"./*": "./src/*/index.ts"`, `"#*": "./src/*/index.ts"`, `.` → `./src/index.ts`. **Rationale (verified):** Node `exports` wildcards map to ONE template with no directory-index and no file-existence fallback — the array form `["./src/*.ts","./src/*/index.ts"]` resolves the first *syntactically valid* target, NOT the first existing file (per the canonical exports guide), so it does NOT fall back flat→dir. A mixed flat/dir layout therefore forces per-package exception lists that rot (the neo-tavern failure mode). Uniform folders = one rule at any depth, free file→multi-file growth with no path/map change, zero maintenance. `kit` was the lone mixed package (19 flat primitives) — **restructured to all-dirs**. Front-door-is-a-folder also matches the §4 feature template (a feature's `index.ts` is its folder front door; verbs/persistence are flat internals). (Surfaced by the 5-agent Phase-0 sign-off panel.)
