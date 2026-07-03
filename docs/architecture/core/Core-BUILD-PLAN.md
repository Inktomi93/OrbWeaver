# Orbweaver — build plan (the ordered runbook)

> **Status: the single sequential guide — what to build, in what order, with the checkpoint that proves
> each phase done.** It consolidates the order from `core/Core-Laws-and-Precedents.md §4` (the sequence + the
> `@orb/contracts` DAG + the kit boot-order), the per-phase conditions from
> `core/Core-Planning-and-Checklists.md §A–E`, and the rationale from `core/Core-Audits-and-Debt.md`. If anything
> here disagrees with the ledger, the ledger wins (this doc is the expansion, not a new authority).
>
> **The spine of the order:** build bottom-up so every import resolves downward —
> `kit → contracts → db → server (foundation → infra → domain[leaf-first] → transport → entry) → client`,
> with **chat + memory LAST** behind the differential oracle. The cake is validated at resolve-time on the
> empty tree (Phase 0) before any feature code exists.
>
> **Progress (2026-06-30):** Phases 0–4 BUILT + committed; **Phase 5 (chat + memory + roster) ALMOST COMPLETE.**
> Committed (the leaf chunks, leaf-first): contract + DI foundation · persistence · auth substrate (PD-1
> `can()` unification) · bus + membership/roster/invites + host-handoff (chunks 1–5 + PD-60) · the turn
> VERBS (turn/edit/fork/compaction/start-chat/read/roster/chat-lifecycle) · **assembly** RESOLVE→GATHER→BUILD
> (chunk 8) · **engine** single-turn core execute+persist+emit (chunk 9) · the
> **memory/** subsystem build logic · the regex `node:vm` watchdog + host-tier resolver · the D45
> multimodal REQUEST seam · **composition root wiring** (`chat/service.ts` + `compose/chat.ts` fully assembled) · **turn regex pipeline** (SEND/RECEIVE completely wired) · **`runChatTurn` adapter** built.
> **STILL REMAINING (the final P5 seams):** (a) the transport chat router (PD-46); (b) **memory recall** has no caller (the trigger is wired, but recall is orphaned); (c) committed turn-coupled features — upload verb (D45 write side), guided routing (PD-63), OpenAI-path tool-loop (D48), image-gen-in-chat caller (D47#1); (d) `reapTemporaryChats` schema (PD-65); (e) `resolveHandle` identity lookup (PD-66). See `Core-Audits-and-Debt.md` for the exact remaining targets.
>
> **Scope note (post-2026-06-27 commitments):** decisions **D44–D50** + the scripting/automation proposal
> landed AFTER the original 0→6 plan was written, adding work this runbook now schedules: the born-compliant
> hooks + chat-coupled features inside Phase 5, the `@orb/ui`/CSP + client features in Phase 6, the committed
> **feature domains** (imagery · tool-use · databank · expressions) in **Phase 7**, and the **automation +
> plugin system** (D46) in **Phase 8**. Phases 6–8 depend only on Phase 5 — they are parallel post-chat
> tracks; the numbering is suggested priority (make chat usable → features → scripting), not a hard chain.

---

## Phase 0 — Workspace + gates (before ANY feature code)

The highest-leverage phase: stand up the fences before the code, so the cake is physics from commit one.

1. `pnpm` workspace + the 5 packages (`kit·contracts·db·server·client`) with `package.json` + `tsconfig`.
   **Pin versions now** — 2026-latest stable of the toolchain + core stack: Node/TS/Hono/Drizzle/tRPC (`ledger §3`; `@orb/*` already decided). UI engine stays deferred to Phase 6. **Per-tier runtime libs join the catalog as their tier is built**, not all here — e.g. observability's `pino`/`pino-pretty` + `@opentelemetry/*` land at 4a (`core/Tier-2-Foundation.md` › Runtime dependencies), `sharp` at 4b.
2. Stand up the **gate suite** (`core/Core-0-Architecture-and-Structure.md §7`, 13 gates) + the bespoke domain rules as dep-cruiser/biome/`tsc` patterns, wired so they **BLOCK**: the full `pnpm check` runs at **pre-push** (lefthook) + in **CI**, a fast Biome pass runs at **pre-commit** on staged files, and — since agents author — a **PostToolUse Biome belt** fires on every `Edit\|Write` (`exit 2`). `CHECKLIST §A1`.
3. Stand up **`tests/support/`** (composed `test.extend` → `freshDb`, frozen `clock`, seeded `ids`, factories) + the Vitest **node** projects in one `vitest.config.ts` via `test.projects` (`unit` `.test` · `integration` `.int.test` · `contract` `.contract.test` · `types` `.test-d.ts` · `parity` `.parity.test`, opt-in) + the `test-presence`/`test-determinism` gates. **Browser = Playwright, not Vitest** (it hangs): `playwright-ct.config.ts` (`.ct.tsx`) + `playwright.config.ts` (`.spec.ts`), separate runners, not in `check`. `CHECKLIST §A4`, `core/Spine-Testing.md`.
4. Reserve the AI-native seams in code (`ClipKind`/`clip.scope` types, `WorkloadKind:'world-state'` stub, `observer` participant kind). `CHECKLIST §A2`.

**✅ Checkpoint:** `pnpm check` is green on the empty cake; an intentional cross-tier import (e.g. `foundation`→`domain`) **fails to resolve**; an empty `.test.ts` runs.

---

## Phase 1 — `@orb/kit` (the leaf — everything imports down into it)

Build in the dissolution boot-order (`Core-Legacy-Migration-and-Gaps.md §8`):

1. `ids`, `errors` first (the universal leaf — `ids` had 446 importers).
2. The primitives: `guards`, `strings`, `objects`, `json`, `time`, `tokens`, `slug`, `error-message`, `fix-markdown`, `speaker-label`, `vector-math`, `replay-buffer`, `stats-tally`, `png-card-chunk`, `assets`, `message-role` (D32 — the canonical `system|user|assistant` axis + ST bimap; the role atom every injector + chat message shares).
3. The engines: **`macro/` first**, then `regex/` + `guided` (both depend on `macro`); `injection/` (D32 — the shared `{depth,role}` placement; depends on `message-role`); then `world-info/` + `persona/` (depend on `message-role` + `injection`), before the contracts that import their tuples.

**✅ Checkpoint:** kit unit tests green; `kit-purity` gate green (zero `node:*`/`contracts`/`db`/domain imports).

---

## Phase 2 — `@orb/contracts` (the wire) — in the internal DAG order

**Not alphabetical** — these edges cause `tsc` errors if violated (`ledger §4`):

1. `versioned-config`
2. `world-info` (role/scope tuples) · `connection` (`chatApi`/`chatSource`) · `chat` (`group-config` defaults) + `regex`
3. `settings` (pulls versioned-config + connection + chat + regex — the counterintuitive edge) · `preset` (pulls versioned-config)
4. `persona` + `character` (pull the world-info tuples)
5. provider result contracts (`EmbedResult`/`RerankResult`/`ImageEmbedResult`/`SummarizeResult`) → **then** `role-clients`
6. the remainder: `identity`, `session`, `credentials`, `assets`, `tag`, `stats`, `buddy`, `embeddings`, `search`, `memory`, `providers`, `discovery`, `workloads`, `import`, `export`, `admin`.

**✅ Checkpoint:** `tsc` clean (DAG honored); `.contract.test` schema round-trips green; `no-inline-types`/`no-inline-union-redecl`/`exhaustive-dispatch` gates green.

---

## Phase 3 — `@orb/db`

1. `custom-types` (the `vector32` F32_BLOB codec), `client` (libSQL factory + PRAGMAs), `db/kit` (batch / db-errors / fetch-owned / insert-chunk / parsers).
2. `schema/*` (one file per producing domain) + `relations`; `migrations/0000_baseline`.
3. **Write the migration DATA scripts, not just the schema** (`CHECKLIST §B1`): `proposedTags→character_tags.status`, `character_books` re-key (+ orphan pre-flight), stats regroup + character card-flatten (D28 — card content onto the flat `characters` row; no version table, no de-pin), WI persona-book join rewire, per-migration `PRAGMA foreign_keys=OFF`, `backupBeforeMigrate`.
4. `.credentials-key` boot decrypt-probe + the stdout backup warning (`CHECKLIST §B2`).

**✅ Checkpoint:** `migrate` + `assertReferentialIntegrity` (`foreign_key_check`) green; `.int.test`s pass against libSQL `:memory:`.

---

## Phase 4 — `@orb/server`, bottom-up tiers

### 4a. `foundation/` — `env` (sole `process.env` reader), `config` (version only), `observability` (+ `debug/inspect`, the dissolved debug domain). **Catalog gains the observability deps here:** `pino`/`pino-pretty` + `@opentelemetry/*` (`core/Tier-2-Foundation.md` › Runtime dependencies). The `noConsole` total-ban (`Core-Laws-and-Precedents.md`) goes live the moment server code lands — `getLog()`/`logger` is the only sanctioned output

### 4b. `infra/` — `crypto`, `network`, `storage`, `image` (the sharp adapter), `auth` (+ `modes/`), `providers/` (`roles`, `contract`, `backends/{openrouter(+runners), agent-sdk(+session), custom-byo, kit(+openai-compat)}`, `vllm/{engine,surfaces}`). Include the **local-light embed/rerank tier** (`CHECKLIST §A3`) and the `VLLM_DISABLED` escape hatch (`§D3`)

### 4c. `domain/` — **LEAF-FIRST**, in waves (a domain only builds after its injected deps)

- **Wave 1** (no cross-domain deps): `credentials` · `tag` · `persona` · `preset` · `world-info` · `assets` · `sessions` · `stats` · `settings` · `admin` · `character` (near-leaf — `mintSyntheticGroupCharacter` + flat-card CRUD; D38) · `notifications` (NEW — the per-user durable inbox + stream; chat emits into it via an injected op, so it lands before chat — `domain/notifications`, ledger D16). Intra-wave compose order: `sessions → admin/guard → {credentials, settings, …}` (D38 — `admin/guard.ts` is the `can()` seam, built first; others inject the guards).
- **Wave 1.5** (D38): `connection` — solo, BETWEEN W1 and W2. Injects `credentials.resolve` (W1) + `providers.fetchOrCatalog` (infra 4b); embeddings + search (W2) inject `connection.resolveRole`, so it must precede them. Lands `DEFAULT_CHAT_MODEL_ID`/`DEFAULT_OR_CHAT_MODEL_ID` in `@orb/contracts/connection` + re-wires foundation `/_debug/info`.
- **Wave 2** (consumed by the rest): `embeddings` · `search`
- **Wave 3**: `discovery` · `workloads` · `import` · `export` · `buddy`
- **Prerequisite (DONE, D38):** `@orb/contracts/events` — the closed in-process domain-event union (`character.updated` + `asset.created`) the Wave-1 emitters + the embeddings indexer reference.
- Per domain, build the slots in order: `contract/` → `persistence/` → `verbs/` → `service.ts`/`context.ts`/`index.ts`. Add the failure surfaces as you go (`§D1` fire-and-forget audit + `content_hash` catch-up sweep; `§D4` custom-byo `contextWindow`).

### 4d. `transport/` — `trpc` (+ `routers`), `jobs` (workloads worker + catalog scheduler), `rate-limit`. Wrap SSE subscriptions in the typed error middleware (`§D2`)

### 4e. `entry/` — `compose/` (services, runner-env, event-bus, role-clients, effective-config), `boot/` (migrate + seeds + reclaim-locks), `auth/seam.ts`, `http/`, `import/run-profile-import.ts`, `lifecycle.ts`

**✅ Checkpoint:** per-domain `.int` + `.contract` tests green; **all 13 gates green**; the app boots, migrates, serves `healthz`.

---

## Phase 5 — chat + memory + the UNIFIED roster/group/multi-human system (LAST, highest risk; built WHOLE)

> **No feature-phasing (ledger D16).** This phase delivers the ENTIRE unified system in ONE cohesive build — a chat is a roster of participants (humans + characters); group-ness is DATA, not a branch (`no-if(isGroup)`; solo = roster-of-1, byte-identical). neo-tavern's Phase A/B (solo-first → multi-human bolt-on) + its 12-step order are neo RETROFIT artifacts and are NOT carried — orbweaver greenfields everything. **`domains/chat.md` Part III is the authoritative design.** The `notifications` domain (Phase 4c) + presence (Phase 4d, transport) are wired here. **Born-compliant prerequisite (D44/D45) — land in the `@orb/contracts` pass BEFORE this phase assembles chat content:** the message-content model (`MessageContentBlock` — text/media/html-card blocks, NOT one string), `ChatHistoryMessage.content` widened `string`→content-parts (text/image), and the `ModelCapability.vision` axis. Widening these after chat is built whole is the cross-cutting retrofit the spec-it-first discipline avoids.
>
> **Also born-compliant IN this phase (D46) — the seams the Phase-8 automation/plugin system grafts onto, so they must be shaped into the turn pipeline NOW, not retrofitted:** the **two-plane variable model** (config = ChoiceBlock picks; runtime = per-variant `setvar`/`incvar` deltas FOLDED over the selected chain on `message_variants` — derive-don't-stamp, kills ST's swipe-clobber); a **non-human turn-initiator + per-turn budget axis** on the turn pipeline (a script/agent can drive a turn; per-rule/$ ceiling, independent of the D17 consent axis); **forced clock/PRNG injection** on the eval path (determinism); the chat **event-bus emit** (`ChatBusEvent` — contract done D50; emitted by the engine/verbs here). The `can()` capability axis (D46/PD-1) ALREADY landed in the auth substrate (chunk 4). Tool-calling adds its capability gates (D48) here too — see step 4.
>
> **PD backlog cleared by this phase:** the `blocked:chat(P5)` rows — PD-7 (agent-sdk reseed-from-canon), PD-8 (inspect-chat roster types), PD-17 (agent participant kind), PD-19 (tag `requireParticipant` wiring at compose), PD-20 (persona `setActivePersona`), PD-21 (stats group attribution), PD-24 (notifications tx-atomicity), PD-28 (assets roster-avatar `can()` arm), PD-30 (world-info chat-scope + `WiBusEvent`), PD-31 (character `getRosterCardView`), PD-34/35 (embeddings/search memory lenses), PD-41 (workloads memory/group-character runners), PD-46 (transport chat router). Wire each as its chat seam lands.

1. **Write the differential-oracle runbook + fixture FIRST** (`CHECKLIST §C1`) → `tests/server/domain/chat/pipeline-breakpoint.parity.test.ts` (at the mirror; steady-clone driver in `tests/support/parity-runner.ts`) against the steady clone (`/tmp/neo-tavern-steady`). The oracle gates the **assembly + cache-token PARITY surface only**; the multi-human/group/invites/notifications/presence/arbitration pieces are NOT diffable (intentional rewrites) — they ship with `.int`/`.contract` tests in the same build.
2. Build `chat/` WHOLE: the **roster + membership lifecycle** (`chat_participants` join/leave/visibility, `chat_invites` + the ONE insert chokepoint, kick/self-leave/host-handoff), the **turn-identity triple** + `pending_turns` + per-member **COUNT** budget + owner-consent (`max-pro-sub` by-proxy refused), **arbitration** (@mention/natural/list/pooled/manual/smart + auto-mode + ban-last-speaker, lock-per-speaker), **two-axis generation** (narrator/per-speaker × merged/scoped), **room overrides** (4 host-only fields), the **group macros**, the **typed per-verb auth matrix + the default-deny enforcer** (covering SSE subscribe + lineage + injections + fork + anchor); the explicit RESOLVE→GATHER→BUILD→SHAPE pipeline + the **§8 rolling-pair breakpoint** (preserve+upgrade; undefined for multi-responder/narrator tails — dropping it = ~5300-tok/turn regression).
3. Build the `memory/` subsystem (`build/`, `recall/`, `persistence/`) — the **6 chat-scoped semantics** + **group-as-character** (synthetic group char authors narrator turns — never NULL; `chat_digest_speakers`; `scopedCharacterId`; merged/scoped mirrors `cardScope`; egocentric-only; **host-only room search v1**) → `.int.test`s.
4. **Chat-coupled committed features (D47/D48) — they hook the turn lifecycle, so they land WITH the engine, not after:** (a) **image-generation IN CHAT** (D47 — the hosted `generateImage` role → a chat verb + asset store + a `MessageMedia` render block; the `domain/imagery` orchestrator itself is Phase 7, this is the chat caller); (b) **reasoning `<think>` auto-parse** (D47 — a parse step in the turn for non-native models; the D41 reasoning fields already exist; the collapsible UI is Phase 6); (c) **OpenAI-path tool-calling** (D48 — the recurse loop is **chat-domain-owned** (stateless backends can't loop); lands here against the D48 capability gates: the `tool` history role on the wire `HISTORY_ROLES`, tool-call/tool-result `ChatContentPart` members, `tools`/`toolChoice`/`responseFormat` request fields, the `WARNING_CODES` additions, the `ToolCallRecord[]` DTO + the `message_variants.toolCalls` retype — reconciled with the agent-sdk path into ONE `domain/tool-use` registry, Phase 7).
5. The **~150 "preserve exactly" esoterica → named tests** (`CHECKLIST §C2`) + neo's **§9 security must-dos** (host-wallet/count budget, server-stamp author + sanitize member content, host-only overrides, host-approved cross-user WI, invite hardening, server-derived presence, bus payload allowlist) + the **§10.4 cross-cutting invariants** (no-if(isGroup) byte-identical, turn-identity triple, max-pro-sub-by-proxy, trusted-label, AI-@mention-never-forces, presence→cast→cache) → named tests.

**✅ Checkpoint:** `pnpm test:parity` green (assembled-prompt + cache-token parity vs the steady clone); the unified-system `.int`/`.contract` suites green (roster lifecycle · invites/redeem · notifications durable-first · presence cast-gating · arbitration policies · two-axis generation · room overrides · memory 6-semantics + group-as-character); a **solo chat is byte-identical** before/after the roster (the no-if(isGroup) contract test).

---

## Phase 6 — `@orb/client` + `@orb/ui` (deferred rebuild)

**Authoritative spec: `docs/architecture/client.md` (ledger D42).** Build against it. In short:

1. Stand up **`@orb/ui`** (NEW package — the frontend cake leaf: `kit ← contracts ← ui ← client`): domain-agnostic primitives over **Base UI** (`@base-ui/react`) — **NO shadcn, NO Radix**; the satellites (cmdk/vaul/sonner/react-resizable-panels/@dnd-kit/ECharts — `echarts`+`echarts-for-react`, D52, replaces nivo) + **Streamdown** (`@orb/ui/markdown`) sealed behind it; CVA variant-unions; DTCG tokens → derived Tailwind v4 `@theme`. The UI boundaries are resolver PHYSICS (client's `package.json` lacks the primitive libs → cannot import them). **Per D44 (the trust-tiered expressive surface):** the security primitives `<ThemeScope>` (token-override theming, values clamped at the boundary), **`sandbox-frame`** (sandboxed-iframe + per-frame CSP for untrusted HTML cards — own the exact `sandbox`/CSP attrs), **`MessageMedia`** (img + native `<audio/video controls>`, asset-vs-external dispatch, autoplay-OFF on untrusted), and the **`@orb/ui/markdown` Tier-A sanitize allowlist** — plus the D44 gates (`no-untrusted-html-in-main-dom`, `no-external-media-without-gate`, `theme-override-only-via-scope`, CSP-present). CSP headers themselves are server (`entry/http`); the contracts model (`MessageContentBlock`/`ThemeOverride`, incl. the `background` token) already landed pre-Phase-5.
2. `@orb/client` — carry neo's STRUCTURE (feature-slice · surfaces/anchors · `state:files` · intent tokens · the gate battery); **container-driven** layout (4-tier; `@media` only in app-shell); Query (server) + gated Zustand (client); TanStack Router **minimal** (single-route shell, no file-based codegen); the 4 sealed cross-lib gotchas. `#` imports, no `@/`.
3. Client component tests = **Playwright CT** (`.ct.tsx` at the `tests/client/` mirror); e2e = **Playwright** (`.spec.ts` under `tests/e2e/`). No Vitest browser. Client pure-logic stays node `.test.ts`. Add **visual-regression** (Playwright screenshots) as a gate.
4. **Client-surfaced committed features (D47/D49):** the **welcome screen** (`{kind:landing}` center pane), **reasoning-block render + effort picker** (the D41 data already exists), the **gallery v1 grid** (over `assets.listOwned` — no new server state), the **token-counter panel** (over `@orb/kit/tokens` — pure client), **inline image display** (`MessageMedia`), and the **`/imagine` command surface** (a D46 Tier-1 automation action). The client's feature-slice structure ABSORBS the Phase-7/8 feature UIs additively as those server domains land — so this phase need not wait for 7/8 (see PD-2/29 `blocked:client(P6)`).

**✅ Checkpoint:** the full stack runs end-to-end; client component + e2e tests green; the UI-boundary physics hold (an app→raw-primitive import fails to resolve).

---

## Phase 7 — committed feature domains (post-chat additive grafts)

> **Authoritative: ledger D47/D48/D49 + the `docs/architecture/domains/proposed/` research docs.** These are
> committed feature DOMAINS that graft onto the Phase-5 chat seams (event bus, turn pipeline, `can()`,
> assets, embeddings/search). Each depends only on Phase 5 — build by product priority, not a hard chain.

1. **`domain/imagery`** (D49 → `proposed/image-studio/`) — a server orchestrator injecting the hosted `generateImage` role (D39) + a chat-shaper prompt-extract + the assets CAS → a `MessageMedia` block. Portrait/FACE/SCENARIO prompt-template modes; hosted image-EDIT (widen `ImageGenerateRequest` + a `"generated"` `ASSET_KIND`); `/imagine` rides a Tier-1 action (Phase 8). **Hosted-only — local SD stays rejected (D39).**
2. **`domain/tool-use`** (D48 → `proposed/tool-use/`, PD-54) — the ONE tool registry feeding BOTH wire projections (agent-sdk → MCP loop-internal; OpenAI-path → the domain-owned recurse loop built in Phase 5) + the structured-output (`response_format`) axis. Reconciles with the D46 `can()` plugin-capability surface (one registry, two sources).
3. **databank / document-RAG** (D49 → `proposed/databank/`, PD-57) — a `documents` single-owned canon producer + per-type FK scope junctions + a derived `document_chunks` vector table + a `@orb/kit/chunk` chunker + a **db-free `infra/extraction`** loader (pdfjs/mammoth/epub) + a `search.documents` lens + a chat `{{databank}}` injection slot + scraper verbs. ~70% reuse of the embeddings/search substrate; v1 = global+chat scopes, owner/host-only retrieval, txt/md/pdf/html.
4. **expressions** (D49 → `proposed/expression-stage/`, PD-56) — a `classify` provider role (v1 = `chat`-role shaper; v2 = a `local-light classify` role, D39 template) + a `character_sprites` model (`(characterId FK, label, assetId FK)`, owner DERIVED) + an `EXPRESSION_LABELS` tuple + a per-turn chat hook + a client render slot.
5. **Standalone D47 server features** — **direct model providers** (native Anthropic/OpenAI/Google keys; the clean D39 source-add, `CRED_PROVIDERS` reserves the slots), **translate** (a request-shaper over the `chat` role), **standalone caption** (an ad-hoc vision verb; pairs with D45). **gallery v2** (PD-55) — only if curated per-character media is wanted (a `"gallery"` `ASSET_KIND` + a single-owned `gallery_items` table).

**✅ Checkpoint:** each domain's `.int`/`.contract` suites green; the gates green; chat surfaces the new blocks (imagery `MessageMedia`, tool-call records, databank injection) end-to-end.

---

## Phase 8 — scripting / automation / plugin system (D46)

> **Authoritative: ledger D46 + `proposals/scripting-automation-extensibility.md`.** Built ON the Phase-5
> born-compliant hooks (the two-plane variables, the turn-initiator/budget axis, the `ChatBusEvent` bus, the
> clock/PRNG-injected eval path, the `can()` capability axis). Committed in full — NOT a maybe.

1. **Tier 1 — declarative automation:** `@orb/contracts/automation` + a `domain/automation` leaf — `on <event> where <CEL/macro predicate> do <closed action union>`; triggers from the closed `ChatBusEvent` bus + chat-lifecycle events; v1 owner/host-authored only (member rules reserved-additive); autonomous hosted-cred turns hit the per-rule/$ budget axis (independent of the D17 consent axis).
2. **Tier 2 — the plugin host:** `infra/plugin-host/` (a dual-mode **QuickJS-ng** `quickjs-emscripten` WASM sandbox behind a Figma-style membrane) + the frozen versioned `@orb/contracts/plugin` host surface + a `domain/plugin` leaf (registry/lifecycle + capability-manifest → `can()`); serves BOTH installed plugins AND ad-hoc inline snippets (closes the STscript "medium band"). Rejected: `isolated-vm`, SES/Compartments, WASM-component; the ST `getContext()` god-object + dynamic-`import()` model are permanently OUT.
3. **Macro-DX + CEL + global vars:** the `kit/macro` DX layer (registry metadata · arg validation · parse-span diagnostics · autocomplete API) + CEL (`@marcbachmann/cel-js`) as the expression/predicate layer over `MacroEnv`; per-user **global variables** = a `fetchOwned` KV table (single-owned).
4. **The prompt-transform seam** (D50): if a synchronous prompt-mutation hook is ever wanted (ST's interceptors), it is an ordered `PromptTransform` step on the turn pipeline + `kit/injection` — NEVER a fire-and-forget bus subscription. Authoring UIs surface in the client (feature-slice, additive).

**✅ Checkpoint:** a Tier-1 rule fires on a `ChatBusEvent` + runs a closed action under budget; a Tier-2 plugin runs in the QuickJS membrane with a capability-gated host surface (no ambient access); determinism (injected clock/PRNG) proven by a replay test.

---

## Cross-cutting (every phase)

- **Tests travel with code** — each new file's test lands at its mirror path or `check` goes red (`test-mirror` + `test-presence`).
- **Owned risks, no action** (`CHECKLIST §E`): the Qwen3-VL single-model concentration (cosine≈1.0 probe guards it); single-replica is the v1 stance (every `ASSUMES(single-replica)` site has a named DB-backed replacement seam).
- **The verification method that works** (keep using it): general-purpose agents reading whole files + a grep sweep for losing-side strings after any structural change.
