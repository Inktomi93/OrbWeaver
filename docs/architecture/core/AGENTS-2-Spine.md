## 5. The Cross-Cutting SPINE (Historical Context)

Some concerns aren't owned by one domain — they thread through many, and a per-domain reader must check
its slice against them rather than re-decide them. Each gets a **spine doc** (written before/with the
fanout); the fanout's readers + adversary treat these as fixed targets. (These join the existing cluster
docs — `domain/connection`, `core/Tier-3b-Providers.md`, `participants-agents-identity.md`,
`domains/memory.md` — as the checkable target surface.)

> **De-dup (2026-07-03):** §7.1–§7.4 used to carry full copies of the per-thread Spine docs, and the
> copies drifted (e.g. this file's agent-principal digest missed the D60 update). The `Spine-*.md`
> docs are CANONICAL; the sections below are pointers plus a one-paragraph orientation each — a
> citation of "AGENTS-2 §7.x" still resolves here and redirects. §7.5 (string-union dispatch) has no
> `Spine-*` home and remains full content, as does §8 (the AST-audit findings).

### 7.1 identity / auth / permission _(see `core/Spine-Identity-and-Auth.md`)_

**Canonical: [`Spine-Identity-and-Auth.md`](Spine-Identity-and-Auth.md) — the full findings live
there; read it before touching identity/auth/permission.** Orientation only: resolve identity ONCE at
the edge into one immutable `Principal`; permission = global-role × resource-role × capability (only
the first is wired in neo — `chat_participants.role: host|member` exists but gates nothing; access is
pure single-owner row-scoping, the assumption that breaks for multi-human + agents); **agents are
FIRST-CLASS PRINCIPALS** (the model is locked, and per D60 the mint mechanics are fully designed —
authoritative: `../proposed/agent-principal-design/`); the esoterica to preserve (`externalId`-keys-SSO
vs `handle`, the `viaFallback` discriminator, JWKS fails-closed, credential AAD binding, the
`max-pro-sub` construction site) and the BFF-session ≠ SDK-chat-session split are enumerated in the
Spine doc.

### 7.2 settings / config / the env FOUR natures _(see `core/Spine-Config-and-Serialization.md`)_

**Canonical: [`Spine-Config-and-Serialization.md`](Spine-Config-and-Serialization.md), its "Settings /
config" section (spine §7.2).** Orientation only: env has FOUR natures — (a) true env (boot/secret/
identity, plus the (a/seed) env→DB-once pattern to keep as the model), (b) runtime toggles →
AppSettings (env floor, DB override wins), (c) agent-sdk runtime config (**the homeless nature** — the
security-load-bearing credential firewall, to be extracted into a named backend-internal config of the
claude-sdk strategy, NOT a settings tier), and (d) generation params (`UserIntent`/preset, translated
per-backend). The stranded env-only keys, the tangles to undo (`claudeRuntimeEnv()` mixing (c)+(d),
`OPENROUTER_API_KEY`'s 3 hats), and the keep-list are in the Spine doc.

### 7.3 serialization / serde core _(see `core/Spine-Config-and-Serialization.md`)_

**Canonical: [`Spine-Config-and-Serialization.md`](Spine-Config-and-Serialization.md), its
"Serialization / serde core" section (spine §7.3).** Orientation only: the card shape is **LOCKED —
ONE fully-modeled canonical card in `contracts`** (the permissive `RawCard` reader survives only as a
tolerant input adapter; `raw` is for genuinely-unknown vendor extras); the PNG codec is a read/write
pair, not duplication → ONE string-based `kit/png-card-chunk` engine; the real strandings (the
client-only preset ST-mapper, the nonexistent regex-script mapping), the 4×-written ST role-map, and
the raw-blob lossiness to FIX are all detailed in the Spine doc, along with the target homes
(SHAPES → `contracts`, CODEC → `kit`, MAPPERS consolidated) and the already-clean don't-touch list.

### 7.4 types & schemas — one home, one direction, no inline _(see `core/Spine-TypeScript-and-Patterns.md`)_

**Canonical: [`Spine-TypeScript-and-Patterns.md`](Spine-TypeScript-and-Patterns.md).** Orientation
only: **one home per shape, derived by who needs it; flows DOWN only** — DB row → `db`; cross-boundary
wire → `contracts`; domain-internal → that domain's `contract/`; client-only view → client; pure
primitive → `kit` — enforced by the **`no-inline-types` gate** (no exported shape or structural cast
outside a proper home; inline shapes in `verbs/`/`persistence/`/`service.ts`/transport/client
components are RED). The home table, the exact gate definition, and the house TypeScript style
(utility-type policy, narrowing, `erasableSyntaxOnly`, classes-vs-factories, async-generator streaming)
are in the Spine doc.

### 7.5 string-union dispatch discipline _(NEW thread — grounded by the AST dispatch scout)_

The coupling an import-graph CANNOT see: runtime branching on string-union "kind" keys. The scout
**quantified the "touch N spots to add one variant" pain** (`reports/dispatch-scout.json`):

| axis                                  | touch-count | shape of the rot                                                                                                                  |
| ------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `messageRole` (system/user/assistant) | **132**     | 3 competing canonical const-arrays + 116 inline re-spellings; no importable union                                                 |
| `users.role` (admin/user)             | 35          | no exported `UserRole` union → 33 inline `"admin"\|"user"` re-decls                                                               |
| `guidedAction` (6)                    | 23          | 14 redecls + 4 **untyped** `Record`s (no exhaustiveness backstop)                                                                 |
| `routing.source` (4)                  | **18**      | **the user's lived pain, MEASURED** — 11 inline re-decls of the source union (dispatch IS gated; the cost is pure re-declaration) |
| `routing.api` (3)                     | 12          | 9 inline re-decls (dispatch fully `assertNever`-gated)                                                                            |

**The GOLD STANDARD to copy (already right):** `workloads.kind` dispatches through
`RUNNERS: { [K in WorkloadKind]: Runner<K> }` — a **mapped-type Record**, so a missing kind is a hard
`tsc` error. `routing.api`/`source` runner switches use typed-return / `assertNever`. **Target rule:**
every axis has (a) ONE importable canonical union/tuple (no inline re-spelling — gated), and (b) a
mapped-type Record or exhaustive `assertNever` dispatch (a new member fails the build). The leaky axes
(`messageRole` switches, `guidedAction` untyped Records, the `authMode`/`runner` if-chains) convert to
that shape. This is its own gate candidate: **`no-inline-union-redecl` + `exhaustive-dispatch`.**

---

## 6. Grounded Intelligence (Historical Context)

Eight whole-file/AST investigations ran (3 deep recons: auth · env · serde; 4 AST agents: coupling ·
type-census · dispatch · chat-map; 1 escape-hatch scout). Reports live in neo-tavern `reports/*.json`.
The instrument: **`scripts/codemods/codemod-kit.ts`** (the ts-morph toolkit — `createCodemodProject` +
`findImporters`/`findReferencesByName`/`findCallSites`/`listExports` + preview/apply harness) and the
**scout pattern** (`chat-domain-scout.ts` → emit JSON to `reports/`, slice with `jq`). **The fanout
readers REUSE this kit** — never hand-roll ts-morph bootstrap.

**8.1 Coupling is already clean — the rewrite is NOT decoupling features.** 1654 files, 8378 edges,
**zero cross-feature deep imports, zero domain→transport edges; `chat` imports no sibling feature**
(fan-out 0; fan-in 7, 100% front-door). Feature boundaries are already enforced + respected. The real
structural work:

- **Re-home the `_shared` drawer** (it has no front door, so its 221 "violations" are all just drawer
  reaches): `audit`(61 importers)/`ids`(58)/`errors`(54) → foundation/kit primitives; `role-clients`(29,
  all type-only) → the role-dispatch **contract** (infra-facing); `credentials`(25) → `domain/credentials`;
  `roster-rows`/`group-character-rows` → chat-private (misfiled); `batch`/`fetch-owned`/`db-errors` → db-kit.
- **`providers/contract/*` has NO barrel** → 25 of 32 provider deep-reaches are loose contract files; add
  `providers/contract/index.ts` (one front door seals the executor). Move `providers/_shared/vector-math.ts`
  → a math `kit` (5 consumers want cosine, not a provider). Move the 2 `DEFAULT_*_MODEL_ID` constants off
  `providers/index.ts` (kills the lone foundation→infra edge).
- **`workloads/contract/runner-env.ts`** is the one true cross-feature hub (the composition seam) — model
  it explicitly, keep it.

**8.2 Type/schema fragmentation (thread #4, grounded).** 1312 shape declarations. **57 cross-boundary
leaks** (exported shapes outside a proper home — top: `RoleClients`(19 refs), `Cas`(12), `SecretBox`(11),
`ChatBusEvent`(10), `MemoryConfig`(10)) + **181 over-exported locals** (down-scope, don't move — separate
workload). **31 duplicate-shape clusters**; the deepest is the **import↔export↔engine triangle** —
world-info entry (6×), chat message/variant (5×), character card (4×) re-declared because parse/serialize/
runtime never agreed on a contract shape. Plus the **client hand-redeclares server zod** (custom-OpenAI
metadata, asset result, browse filter). Identity/principal is fragmented too but DODGED the property-set
clustering (different field names for the same concept — `AuthContext`/`IdentityResolution`/`OwnerResolution`)
→ needs a manual reconcile. **Zero `enum`s anywhere** (all string-unions — good, keep).

**8.3 Chat resolution (all `domains/chat.md` claims CONFIRMED with file:line).** (a) Order **split across 3 files
with no single owner** — `assembly/context.ts` (macro#1 + WORLD_INFO regex + WI→injection + budget),
`assembly/assemble.ts` (section walk + macro#2 + framing + static/dynamic split), `engine/pipeline.ts`
(USER_INPUT regex → splice→squash→name-stamp→fit → AI_OUTPUT/REASONING regex), sequenced by `engine.ts`'s
loop; doctrine is prose-only. (b) **16 in-place mutation sites** on `prep.assembleCtx`, all in pipeline.ts
(applyInputs×6, setSpeaker×5, setNarrator×4, after-history×1); the per-speaker loop depends on re-reading
the mutated ctx → confirms the two-phase-immutable target. (c) **Name-stamp is a quartet-PLUS (5
mechanisms)** across names.ts/speaker-stamp.ts/store.ts/frames.ts/engine.ts. (d) Chat's only deep
reach-arounds are into `providers/contract/*` + `resolve-chat.ts` + `vector-math.ts` (mostly type-only) —
fixed by the providers barrel (8.1).

**8.5 Knowledge cluster (all claims CONFIRMED — `reports/knowledge-scout.json`).** 6 vector-write sites
across 5 tables; the embed→null-filter→upsert→**reset-hubScore** dance is duplicated in the **2 memory
writers** (`memory/db.ts`, `memory/generate.ts`) — corpus writers deliberately DON'T reset (advisory).
4 ranking impls (SQL `vector_distance_cos` scan · `vector-math.ts` all-pairs · `pair-cosine.ts` dot loop ·
MiniSearch/BM25 `field-search`); memory's recall uses the in-RAM `cosineSim` path, NOT the SQL scan search
uses — **two cosine paths over the same `chat_digests` table.** `hub_score` seam confirmed: `hubness.ts`
is the ONE writer (4 tables), search verbs the readers, memory nulls-on-write. Schema-naming lie confirmed:
`character_embeddings`/`image_embeddings`/`chat_digests`/`chat_segments`/`chat_digest_speakers` ALL live in
`db/schema/search.ts` (named for the consumer). **The preservation RISK (the reshape's central tension):
memory has 6 query semantics search's owner-wide scan does NOT model** — (1) the 5 recall modes
(off/mixA/mixB/mixC/tiered); (2) the tiered consolidation "bridge" (uncovered-digests-only); (3)
verbatimWindow/protected-tail; (4) egocentric scoped-query construction (POV bucket + name-prefixed query);
(5) in-chat single-chat focus (`WHERE chat_id` + in-RAM scoring vs owner-wide `WHERE owner_id`); (6)
keywordMatch/recencyBias/minScore. `stats` touches ZERO vector tables (confirmed); the gray zone is
`corpus/insights.ts` reading raw `messages` for economics-flavored aggregates.

**8.6 First-class-principal blast radius (grounded — `reports/principal-scout.json`).** THE load-bearing
finding: **`chat_participants.kind` is OVERLOADED** — it means BOTH identity-table (users vs characters)
AND human-vs-AI at once (`human`≡has-userId, `character`≡has-characterId, enforced by the XOR check). An
agent principal is _both_ userId-backed _and_ AI-driven, which is **currently unrepresentable** (the XOR
forbids a row with both a userId and a card link; arbitration only considers `kind:"character"`). The fix:
split the two meanings — a `kind:"agent"` (or an `isAi`/`principalKind` axis distinct from identity-table).
The `parseParticipant` `never` exhaustiveness guard + the XOR CHECK are the tripwires that enumerate the
work. Also: **`authorUserId` is NEVER stamped on the live send path** (only the one-time backfill, hardcoded
to owner) — so threading a real **principal-id** (≠ the access `userId`) into the persist path is a NEW
build. `role:host|member` confirmed **unwired** (33 writes, 0 authority reads) — it's the per-resource axis
to wire. **6 NEW builds** vs modifications: `provisionAgentPrincipal` (mint a non-SSO users-row from inside
the app — precedent: the `__group__${chatId}` synthetic namespace), a `users.isAgent`/`kind` column +
non-loginable semantics, `requireParticipant`/`requireHost` predicates (replacing the 45 `loadOwnedChat`
owner-equality sites — split resource-load from authority-check), principal-id threading, the agent seat
that's userId-backed yet AI-arbitrated, and the `buddies.userId` owner-link-vs-own-principal split (the
`buddy_turns` firewall inverts — an agent principal CAN write to `messages`). Credential inheritance (does
an agent inherit the owner's `max-pro-sub` tier?) is a flagged decision, not mechanical.

**8.7 Doc-claim verification round (the detail docs are now re-grounded).** Four agents re-checked every
un-verified assertion in `domain/connection`/`core/Tier-3b-Providers.md`/`participants-agents-identity.md`/
`domains/chat.md` against the AST. Most CONFIRMED; **6 corrected** (docs patched): (1) providers role dispatchers
are NOT vLLM-hard-pinned — they `switch (credential.source)`; the lock is a boot-binder default → the
multi-backend target is a one-site rebind, not a dispatcher rewrite; (2) `character_books`-on-cv vs
`character_personas`-on-id is **deliberate** in neo (book-snapshot semantics) → **superseded by D28**:
orbweaver has no version table, so both key on `characters.id` and the live card's book set is read at assemble; (3) "collapses most of cow.ts" → only the fork/CAS branch (~half); (4) chat
has **2** budget tallies not 3 (WI is already one unified walk); (5) `3` `derive*Profile` not 4; (6) the
params panel already has coarse source-level gating to build on. CONFIRMED-as-written: two-capability-
systems, reasoning-one-cascade (`effort:"none"`=off), translated-twice, `routing`-on-`runner`,
`resolveChat`-funnel, custom-openai hardcoding, `runner`=f(api,source), summarize-as-shaper, the vLLM
supervisor, `createFromCharacter` lossy (conditional on `swapMacros`), cow-exists-because-pin,
`characterVersionId` NOT NULL, primary-is-the-holdout, synthetic group char, WI double-render, guided
6-actions/2-paths/3-layers/opening-carveout/splice-convert, `computeHistoryBreakpoint` 1-invariant+3-aborts,
`runOnEdit` unwired, render-ctx-null fallback, `isSectionDynamic` split.

**8.4 Escape hatches — the backend is remarkably clean (the bar is high).** server+shared+db: **1 `any`,
0 `@ts-ignore`, 3 non-null `!`** — the entire surface is `as` casts (333). The dangerous work is FOUR
clusters: (1) inline `BatchItem<"sqlite">` tuple casts that bypass the existing `batchMany` helper (~59,
the clearest "abstraction exists, cast is laziness" — highest priority, on the chat send/persist path);
(2) corpus numeric-kernel index defeats (~49, pure math); (3) chat SDK-frame serialization double-casts
(`store.ts`/`frames.ts` — cache-lineage-critical → needs a typed frame model); (4) DB-row read-seam casts
(`r.model as string` → zod-parse like `parseProviderMetadata` already does). **LOAD-BEARING (preserve +
promote):** the credential/brand firewall — the `max-pro-sub` mint is the ONLY construction site
(`_shared/credentials.ts:565`, right after the admin gate); the rewrite should make the privileged variant
**unconstructable except behind the role check** (tier-1), so the `as` vanishes. TypeID brand discipline
is already biome-plugin-enforced (`no-raw-id`/`no-loose-id-cast`). The **zod-parse-at-the-wire/DB-seam**
pattern (`parseProviderMetadata`) is the model to generalize. Clean zones (the bar): `world-info`(0 `as`),
`persona`/`preset`/`models`/`credentials` services (≤1).

---

