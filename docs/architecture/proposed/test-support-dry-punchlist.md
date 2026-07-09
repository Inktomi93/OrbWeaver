# Test-tree DRY punchlist — jscpd sweep 2026-07-09

```
kind: work-queue (dispatch-shaped, like ui-polish-punchlist)   status: triaged, unbuilt
source: manual jscpd v5 run over tests/ (normally gate-excluded): 724 files · 745 clones ·
        88 clusters · 7.72% duplicated lines / 9.32% tokens (~55.6k). Six investigators read the
        clone sites against Spine-Testing.md + the tests/support inventory; verdicts below are
        their merged output. Raw report + cluster packets: session scratchpad (regenerate with
        `pnpm exec jscpd -c <cfg>` pointing path at tests/ and dropping the test ignores).
verdict key: every item names its home + consumers; ~60% of the duplicated tokens were ruled
        ACCEPTABLE (correctness-critical arrange blocks, esoterica pins, belt-and-suspenders) —
        recorded in §4 so nobody re-litigates them.
```

## 0. The one-sentence diagnosis

The duplication is NOT missing infrastructure — it is existing `tests/support/` machinery
(the `test.extend` db fixture, `factories/user.ts::seedUser`, `clock.ts::FROZEN_AT_MS`) that
per-domain authors reinvented locally, plus a handful of per-tree `_support.ts` conventions that
individual trees (sessions, db/schema, tooling) never grew.

## 1. Wave 1 — mechanical, low-risk (mech-executor; run the touched trees' tests per item)

- **W1a — global `principal()` factory.** \~25 files define the same
  `{userId, role, handle, externalId: null, via: "cookie"}` builder (11 byte-identical in
  `server/domain/*/_support.ts`, 14 more under `server/domain/chat/**`; variants: role param in
  guard, handle-echoes-userId in invites). CREATE `tests/support/factories/principal.ts` —
  `principal(userId, overrides?)` — and swap every local def to the import.
- **W1b — stop reinventing `seedUser` / `FROZEN_AT`.** \~20 `server/domain/*/_support.ts` files +
  8 `db/schema` files re-implement `seedUser` (canonical:
  `tests/support/factories/user.ts::seedUser(db, overrides?)`) and hardcode
  `1_750_000_000_000` (canonical: `tests/support/clock.ts::FROZEN_AT_MS`). Mechanical import
  swap; watch the two positional-arg variants (`tag`, `discovery` pass a bare string second arg —
  one-line adapter each).
- **W1c — `tests/tooling/_support.ts` (gate-test scaffolding).** `ctxFor(files)` is byte-identical
  in 12 gate tests; `ctxAt(root)` + `withTree(files, fn)` repeat in 3 more. One support file,
  15 consumers. Gate SOURCE files untouched — only tests move; run the tooling suite after.
- **W1d — chat-domain `_support` hoists** (all into already-existing local `_support.ts` files):
  `TEST_CAPABILITY` + `testConnection()` (byte-identical in 6–7 engine files) · `scriptedTurn()` /
  `scriptedRoleTurn()` (5 files) · `makeLoadParticipantViews(db)` (20-line fake byte-identical in
  fork/invites/start-chat/read — the silent-drift hazard) · memory: hoist `seedThreeBlocks`,
  `sharedScope`, `seedTurns` · settings: `findSeedTheme(h, ownerId, name)` (5 theme-verb files).
- **W1e — `server/domain/sessions/_support.ts` (net-new).** The ONE verb-heavy domain with no
  `_support.ts`; 10 files hand-roll `PEPPER`, frozen clock, service construction. Match the
  sibling convention (stats/workloads/chat/preset/notifications).
- **W1f — db/schema seed homes.** New `tests/support/factories/asset.ts` (`makeAsset`/`seedAsset`
  — 3 schema files duplicate a factory that doesn't exist) + a thin `tests/db/schema/_support.ts`
  for the raw FK-parent one-liners (`seedUser`/`seedChat` row inserts, \~24 of 35 schema files);
  adopt central factories where the signature already fits, keep raw inserts local where the test
  is deliberately below the factory layer.
- **W1g — small `_support` gaps** (each ≤5 consumers, all pure builders):
  `infra/providers/backends/agent-sdk/_support.ts` (streamOf/mock-SDK messages, 2 files) ·
  `infra/auth/_support.ts` (`makeAuthConfig` + `headers()`, 5 files) · credentials
  `seedCredential(db, h, overrides?)` (7 files) · admin `seedAdminCaller(db)` (7 files) · client
  `tests/client/features/chat/lib/_support.ts` (`makeParticipant`, 3 files — plain node-lane
  tests, CT footguns don't apply).

## 2. Wave 2 — earn-it (executor + MANDATORY verifier)

- **W2a — provider-role `describe.each` table.** The 5 embed-shaped role tests (embed, rerank,
  summarize, generate-image, image-embed) share the cred/spy/allBackends/happy-path/fail-closed
  skeleton; their SOURCE modules are already structurally identical 3-liners. Table-drive the
  five. **Exclude chat + agent** (real branching: (api,source) pair routing / hard-pinned
  backend). RISK: these are the source-allowlist firewall tests — a typo'd table row passes
  silently; verifier required.
- **W2b — agent-sdk session test redundancy adjudication.** `session.test.ts` vs
  `session/store.test.ts` may be overlapping COVERAGE (the former predates the store split), not
  shared-fixture duplication — read both, delete the stale overlap rather than DRY it.

## 3. Wave 3 — owner decision (the big lever; do not dispatch without a ruling)

- **W3 — per-domain fixture families.** `tests/support/fixtures.ts` already exports a lazy
  per-test `db` fixture; 232 call sites in 53 files across search/assets/tag/credentials/admin
  do `const db = await freshDb()` + inline harness/service construction instead. Proposal on the
  table: per-domain `test.extend` families (`searchApp`, `tagApp`, …) composing db + harness +
  seeded owner, mirroring the existing `app`/`ownerCaller` shape. HONEST TENSION: two other
  investigators independently ruled the same 3–4-line preambles ACCEPTABLE (below the
  consolidation bar; inline arrange keeps tests readable as specs). The churn is \~5 domains × a
  full-file mechanical sweep each. Owner call: big-lever consistency vs leave-the-preambles.

## 4. Ruled ACCEPTABLE — do not re-litigate

`turn.int.test.ts`'s 33 named esoterica pins (each names the law it protects) · db/schema
CASCADE-chain tests (a parameterized loop would hide which table's CASCADE broke) · the
`isConstraintViolation` try/catch shape (stack-trace locality) · `entry/compose/services.test.ts`
(each repetition proves a different wiring invariant) · buddy/preset verb preambles (already
routed through their `_support.ts`; the "dupes" are call sites) · discovery threshold-boundary
setups · search persistence-vs-verbs mirrors (the presence rule REQUIRES both layers tested
independently) · contracts/buddy ↔ db/schema enum pins (belt-and-suspenders by design) ·
entry/http mock-Hono ctx (4 consumers with genuinely differing shapes — revisit only if a 5th
lands) · OpenRouter runner siblings (2 API surfaces that change independently — revisit on a 3rd)
· per-domain `makeHarness` bodies (each domain's Context is a distinct interface; a generic
harness = configuration-object indirection) · \~96 tail clusters under the 3-file / 150-token bar.

## 5. Type-safety audit (ts-morph census 2026-07-09 — the "tests never know" problem)

Tests ARE in the strict net (`pnpm check` runs `typecheck` + `typecheck:graph` + `test:types`), and
hygiene on the classic axes is near-perfect across 894 files: `as any` ×12 · bare `any` ×13 ·
`@ts-ignore` ×11 · non-null `!` ×0 · `satisfies` ×12. The drift holes are elsewhere:

- **The real vector — fabricated entities: `as unknown as X` ×168 + object-literal `as X` ×67.**
  Both compile when the target type gains/renames a required field — the "source changed, tests
  never knew" hole. Concentrated on \~8 types: `ResolvedCredential` ×47 (server/infra owns 72 of
  the double-casts) · `ModelCapability` ×12 · `UpdateCharacterInput` ×11 · `ChatRequest` ×8 ·
  `MessageView` ×6 · `CharacterCard` ×5 · `ResolvedConnection` ×4 · `RoleClients` ×3.
  **Fix (W1h, mech-scale, \~235 sites):** typed factories for the top fabricated types (the
  factory-contract convention + gate already exist — `makeResolvedCredential(overrides?)` etc.,
  typed RETURN so a new required field errors in ONE place and every test inherits it), plus
  convert complete-value `as X` literals to `satisfies X`. Deliberate invalid-input probes (the
  `never` ×12 / `{__behaviors}` casts) are exempt — they are the negative-space tests.
- **`castId` ×1,251 is NOT a hole — leave it.** Ids are opaque brands; castId at test seams is the
  documented design (`kit/ids` header). Top mints: UserId ×209, CharacterId ×169, Handle ×162.
- **Contract-verb coverage (CORRECTED 2026-07-09 by the gate build): 269 Service-interface
  verbs, 267 covered — exactly TWO have zero tests anywhere:** `chat.getRoomOverridesForChat` ·
  `discovery.themes`. The first audit claimed 10; eight were false-negatives from a dot-anchored
  grep (`.method(`) — the real tests import verb closures and call them BARE (`listChats(...)`)
  or via `create<Verb>(...)` factories. The `contract-verb-presence` gate matches the real
  invocation shapes and carries the two genuine gaps as its DEFERRED list. W1i = two tests, not
  ten. (Measurement lesson: presence sweeps must match bare-call + factory shapes, never just
  dot-method.)
- **Two new gates hold the line (W2c):** (1) `contract-verb-presence` — ts-morph enumerates each
  domain's `*Service` interface methods and requires an invocation in that domain's test tree
  (grep-style presence, not filename convention — world-info/tag organize differently and are
  100% covered); adding a verb with no test then FAILS `pnpm check`, which is the "we add to the
  contract and never know" fix. (2) `no-test-fabrication` — ban `as unknown as` and
  object-literal `as X` in tests/ with an escape comment for deliberate invalid-input probes;
  holds the W1h cleanup ratcheted.

## 6. Expected reclaim

Wave 1 ≈ 6–8k duplicated tokens across \~120 files, all import-swap-shaped. Wave 2 ≈ 1k. Wave 3,
if ruled GO, takes the largest single share (\~4k+) but is churn-heavy. The remaining \~40k stays
by design (§4) — the test tree's honest duplication floor is well above the product gate's 5%,
and that is correct per the jscpd config's own "intentional mirror duplication is fine" law.
