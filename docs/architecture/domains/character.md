# Orbweaver — `character`: identity + versions-as-restorable-history

> **Status: planning (authoritative detail).** The character domain owns character identity and
> versioned card content. The defining change from neo-tavern: **de-pin** — chats no longer weld
> themselves to a version; everything references live identity. This doc is the target spec.
> Authoritative upstream: `participants-agents-identity.md` §4 (the de-pin contract + the
> association-key deliberate asymmetry), `_FANOUT-BRIEF.md` §4 (character pain ledger), `domains.md`
> (the domain map). `structure.md` §4 is the 8-slot template this domain follows.

---

## What this domain owns

- **Character identity** — the `characters` table row: `id`, `handle`, `ownerId`,
  `currentVersionId`, `starred`, `archived`, `synthetic`, `forbidExternalMedia`, `importHash`,
  `contentHash`.
- **Character content versions** — the `character_versions` table: every card field (`name`,
  `description`, `personality`, `scenario`, `greetings`, `exampleMessages`, `systemPrompt`,
  `postHistoryInstructions`, `depthPrompt`, `proposedTags`, `creatorNotes`, `avatarAssetId`), plus the
  **typed promotions** `creator`, `cardVersion`, `regexScripts`, `extensions` (verified present in the
  steady clone, `db/schema/character.ts:137-140`), plus refinery signals (`refineryScore`,
  `refineryAnalysis`), `version` counter, `createdAt`. **The `raw` blob is dropped** — the steady clone
  already retired it; the promotions below are the round-trip mechanism (§7.3).
- **Character-persona junction** — `character_personas` (identity-keyed on `characters.id`; personas
  survive every card edit by design — NOT keyed on a version).
- **Version history mutations** — mint, edit-in-place, snapshot (explicit named save), restore
  (copy-old-to-current). The COW fork/CAS branch (`forkVersion` + `editVersionInPlace` CAS guard)
  is **deleted** with de-pin; what remains is simpler: edit-in-place is always safe.
- **Default card seeder** — idempotent boot-time pack of well-known cards (the WELCOME_ASSISTANT
  among them), using the real service path.
- **Character CRUD** — `create`, `get`, `list`, `update`, `remove`, `duplicate`, `bulkRemove`,
  `bulkArchive`, `bulkAddCardTag`.
- **Synthetic group characters** — the `synthetic=true` hidden identity minted per-room for
  scoped-group memory buckets (§11.5 of the group-chat plan). In orbweaver this verb lives here, not
  in `_shared`, composed into `chat` via the injection model.
- **`resolveCurrentVersion`** — the identity→current-version resolver. In neo-tavern this lives in
  `chat/persistence`; in orbweaver it belongs here (character is responsible for resolving its own
  live version). Chat calls it through the injected cross-feature op.

This domain does **not** own: embeddings of card text (that is `embeddings`); book-scope junctions
(that is `world-info`, though the junction table FKs into `character_versions`); tag junctions (that
is `tag`); persona definitions (that is `persona`); the serialization mapper for import/export (that
is `import`+`export` sharing a serde core that reads `@orb/db` directly, same as today).

---

## The de-pin invariant (locked)

> **Chats never pin a character version.** Everything references `characters.id` (live identity) and
> resolves the current version at use.

This is the load-bearing change that simplifies the entire domain. What changes:

| neo-tavern | orbweaver |
|---|---|
| `chats.characterVersionId NOT NULL` — a chat is welded to a cv | `chats.characterVersionId` **gone** |
| `versionPinned()` subquery check before every edit | **deleted** |
| `forkVersion()` + INSERT-FROM-SELECT book-carry | **deleted** |
| `editVersionInPlace` CAS `WHERE NOT EXISTS(SELECT FROM chats WHERE characterVersionId=cv)` | **deleted** — edit-in-place is always safe |
| Versions = immutable-once-pinned | Versions = **restorable history**; `restore` copies old→current |
| `resolveCurrentVersion` owned by `chat/persistence` | **moved here** (character's responsibility) |

What **survives** de-pin (unchanged):

- `mintFirstVersion` — the first-write path (still needed; it's the only create path).
- `removeCharacterWithCleanup` — pre-cascade asset-id snapshot + circular FK break + delete + best-effort
  cleanup hooks. Correct and stays.
- `characters.currentVersionId` — still the live pointer; it just no longer has chats FK-ing into `characterVersions` from the chat side.

**Book-snapshot nuance (load-bearing — RESOLVED: identity-keyed + current-version resolution):**
`character_books` keys on `characterVersionId` in neo-tavern because book content was snapshotted per
pinned cv. De-pin does NOT simply move this FK to `characters.id` *without re-providing the snapshot
semantics deliberately* — but the chosen mechanism is the **simple path**: `character_books` re-keys to
`characters.id` (live identity, matching `character_personas`), and the snapshot guarantee is re-provided
by **current-version resolution** at assemble time (the chat always sees the active character's current
book set). This is the correct default — book sets change only when an author deliberately edits them;
mid-chat changes are explicit. A future "freeze lore at version X" feature would be a SEPARATE
`chatCharacterBookSnapshot` junction, NOT a chat-level version pin. (Locked consistently in
`world-info.md` §"Note on character association key" + `db.md` `character_books` row + `export.md` book
walk.) The `character_personas` asymmetry (already identity-keyed — correct, deliberate, survives) is the
model.

---

## The 8-slot layout

```
domain/character/
├── index.ts                  FRONT DOOR — the only legal external import
├── service.ts                COMPOSITION ROOT — wires verbs + injected deps. ZERO logic.
├── context.ts                DI BUNDLE — typed CharacterContext interface (explicit — not ReturnType<>)
├── contract/
│   ├── service.ts            CharacterService interface — read this to know everything the domain does
│   ├── params.ts             every verb's *Params (+ CvEdits / IdEdits sub-shapes currently in cow.ts)
│   ├── results.ts            every verb's *Result
│   ├── views.ts              CharacterDetail, CharacterSummary — what the client receives
│   └── errors.ts             CharacterNotFoundError, CharacterOperationError
├── verbs/
│   ├── create.ts
│   ├── get.ts
│   ├── list.ts
│   ├── update.ts
│   ├── remove.ts
│   ├── duplicate.ts
│   ├── bulk-remove.ts
│   ├── bulk-archive.ts
│   ├── bulk-add-card-tag.ts
│   ├── snapshot.ts           NEW — explicit named version save (the orbweaver "save history" verb)
│   └── restore.ts            NEW — copy old version → new current (replaces the de-pinned fork path)
├── persistence/
│   ├── queries.ts            all SELECT/JOIN for this domain; re-exports isConstraintViolation shim
│   └── versions.ts           mintFirstVersion, editVersionInPlace (simplified — no CAS), removeCharacterWithCleanup
├── substrate/
│   ├── resolve-version.ts    resolveCurrentVersion — moved from chat/persistence; identity→cv resolver
│   └── card-tokens.ts        cardTokenSize (list-specific token-size estimate; local to the domain)
└── seeder/
    ├── index.ts              createDefaultCharacterSeeder, DefaultCharacterSeeder type
    ├── seed.ts               the idempotent boot pack (5 default cards); same two-layer idempotency
    └── cards.ts              DEFAULT_CHARACTER_CARDS, WELCOME_ASSISTANT_HANDLE constants
```

**Named subsystem:** `seeder/` is the one internal subsystem — it has enough internal structure (in-process
memo + inFlight Map + the card definitions) to warrant its own folder rather than a flat verb file.

**`context.ts` — explicit interface:** the DI bundle type is `CharacterContext` as a named interface in
`contract/` (or inline at the top of `context.ts` as an exported interface), NOT a `ReturnType<>` inference.
The shape must be readable without hovering.

---

## Verbs (the `CharacterService` interface)

```
CharacterService = {
  // CRUD
  create(params: CreateCharacterParams): Promise<CharacterDetail>
  get(params: GetCharacterParams): Promise<CharacterDetail>
  list(params: ListCharactersParams): Promise<CharacterSummary[]>
  update(params: UpdateCharacterParams): Promise<CharacterDetail>
  remove(params: RemoveCharacterParams): Promise<void>
  duplicate(params: DuplicateCharacterParams): Promise<CharacterDetail>
  bulkRemove(params: BulkRemoveParams): Promise<void>
  bulkArchive(params: BulkArchiveParams): Promise<void>
  bulkAddCardTag(params: BulkAddCardTagParams): Promise<void>

  // Version history
  snapshot(params: SnapshotParams): Promise<VersionRef>    // explicit named save
  restore(params: RestoreParams): Promise<CharacterDetail>  // copy old cv → new current

  // Identity resolution (used by chat, roster, memory)
  resolveCurrentVersion(params: ResolveVersionParams): Promise<CurrentVersion | null>

  // Synthetic identity (group-memory bucket)
  mintSyntheticGroupCharacter(params: MintGroupCharParams): Promise<CharacterRef>
  findSyntheticGroupCharacter(params: FindGroupCharParams): Promise<CharacterRef | null>
}
```

**Cross-verb injection:** `bulkAddCardTag` receives the `update` verb as an injected dep (wired at
`service.ts`); that injection type lives in `contract/service.ts`, not inline in the verb.

---

## Public surface (`index.ts`)

```typescript
// Errors
export { CharacterNotFoundError, CharacterOperationError } from './contract/errors'

// Input types
export type { CreateCharacterParams, UpdateCharacterParams } from './contract/params'

// Zod schemas (wire validation — re-exported from @orb/contracts in orbweaver)
export { createCharacterSchema, updateCharacterSchema } from '@orb/contracts'

// Service types
export type { CharacterService, CharacterServiceDeps, CharacterContext } from './contract/service'

// View types (what the client receives)
export type { CharacterDetail, CharacterSummary } from './contract/views'

// Seeder
export {
  createDefaultCharacterSeeder,
  WELCOME_ASSISTANT_HANDLE,
  DEFAULT_CHARACTER_CARDS,
} from './seeder'
export type { DefaultCharacterSeeder, DefaultCharacterSeederDeps } from './seeder'

// Factory
export { createCharacterService } from './service'
```

**The Zod wire schemas (`createCharacterSchema`, `updateCharacterSchema`) live in `@orb/contracts`.**
In neo-tavern they live in `src/shared/character/character-schema.ts` because the client needs runtime
Zod and the dep-cruiser `client-no-backend-runtime` rule blocks importing from `server/`. In orbweaver
`@orb/contracts` is the explicit cross-boundary package for exactly this case — the client can declare
`@orb/contracts` as a dep. This is the right move; `shared/character/character-schema.ts` dissolves.

---

## Movement table

Every unit: where it goes, why, and what enforcement tier makes a violation RED.

| Unit | Outcome | Target | Rationale | Enforcement tier |
|---|---|---|---|---|
| `persistence/cow.ts` — `versionPinned` + `forkVersion` + `editVersionInPlace` CAS guard | **deleted** | — | Exists only because chats pin a cv. De-pin removes the need. Zero survivors in orbweaver. | compile-time: `chats.characterVersionId` column gone → any reference fails `tsc` |
| `persistence/cow.ts` — `mintFirstVersion` + `removeCharacterWithCleanup` | stays domain feature | `domain/character/persistence/versions.ts` | Correct logic, survives de-pin unchanged. Rename file for clarity. | resolve-time (same package) |
| `persistence/cow.ts` — `CvEdits`, `IdEdits` types | stays domain feature | `domain/character/contract/params.ts` | Input sub-shapes derived from the wire schema; currently in `persistence/` below the verb layer. Move to `contract/` per the types-in-contract rule. | lint-time: `no-inline-types` dep-cruiser gate |
| `persistence/cow.ts` — `MintFirstVersionArgs`, `ForkVersionArgs` (→ gone), `RemoveCharacterCleanup` | stays domain feature | `domain/character/contract/params.ts` (internal arg shapes) | Same `no-inline-types` fix. `ForkVersionArgs` is deleted with fork. | lint-time: `no-inline-types` |
| `persistence/queries.ts` — `isConstraintViolation` re-export shim | → `@orb/db` kit | `@orb/db/kit` or `@orb/server/kit` | A DB-error classifier — pure primitive, no domain knowledge. The re-export shim exists only because `create`/`update` import via `../persistence/queries`. In orbweaver import from `@orb/db` directly. | resolve-time: package dep (undeclared import won't resolve) |
| `persistence/queries.ts` — `fetchOwned` usage | → `@orb/server/kit` or `@orb/db/kit` | A db-kit helper | Pure owner-scoped row fetch; domain-agnostic. Dissolve `_shared/fetch-owned.ts` here. | resolve-time |
| `context.ts` — `ReturnType<>` inference (no explicit interface) | stays domain feature | `domain/character/contract/service.ts` or `context.ts` top — as `export interface CharacterContext` | The inferred type is invisible. Explicit interface is the `no-inline-types` target. | lint-time: `no-inline-types` |
| `shared/character/character-schema.ts` — `createCharacterSchema`, `updateCharacterSchema` (Zod) | → `contracts` | `@orb/contracts/character` | Cross-boundary wire schema: server validates, client renders forms. `@orb/contracts` is the right package-tier home. | resolve-time: `@orb/client` declares `@orb/contracts` dep, never `@orb/server` |
| `shared/character/character-schema.ts` — `resolveCharacterDepthPrompt` | → `@orb/server/kit/serde` | `@orb/server/kit/serde/depth-prompt.ts` | **CORRECTED 2026-06-25** (verified): it has TWO server consumers — `export/verbs/export-character.ts` AND `chat/assembly/context.ts` — so a `character/substrate` home would force export + chat to cross-feature-import character (illegal). It's a pure server-only helper (uses zod internally → server/kit, not isomorphic kit) consumed by the serde-out path and chat assembly. | resolve-time (server/kit is below domain; both consumers import down) |
| `verbs/bulk-add-card-tag.ts` — `UpdateFn` type alias (inline) | stays domain feature | `domain/character/contract/service.ts` | The injected cross-verb operation type belongs in the contract surface. | lint-time: `no-inline-types` |
| `chat/persistence/resolve-current-version.ts` | → `domain/character` | `domain/character/substrate/resolve-version.ts` (surfaced via `CharacterService.resolveCurrentVersion`) | Character resolves its own live version. Today it lives in `chat/persistence` as a workaround; in orbweaver it's character's responsibility and chat calls it through an injected op. | resolve-time: `chat` imports `character` front door only (dep-cruiser `domain-no-cross-feature` rule) |
| `_shared/group-character-rows.ts` — `buildGroupCharacterRows` | → `domain/character` | `domain/character/verbs/mint-synthetic-group-character.ts` | Chat mints a character without calling the character service today; the `_shared` drawer is the workaround for the cross-feature ban. In orbweaver the character domain owns identity creation; `mintSyntheticGroupCharacter` is injected into chat at the composition root. | resolve-time: `_shared` does not exist in orbweaver; dependency-cruiser `domain-no-cross-feature` enforces the injection model |
| `_shared/audit.ts` — `logAudit` (used by `create.ts`, `update.ts`) | → `foundation` | `foundation/observability` or a `kit` primitive | Cross-feature audit log; a foundation/infra concern. One of the `_shared` dissolve destinations. | resolve-time |
| `_shared/ids.ts` — `newTypeId` | → `@orb/kit` | `@orb/kit/ids` | Pure TypeID mint; zero I/O, zero domain. The canonical `kit` case. | resolve-time |
| `_shared/strip-undefined.ts` | → `@orb/kit` | `@orb/kit/objects` | Pure primitive; isomorphic. | resolve-time |
| `_shared/batch.ts` — `batchStmt` | → `@orb/db` | `@orb/db/kit` | DB-layer primitive; no domain logic. | resolve-time |
| `_shared/db-errors.ts` — `isConstraintViolation` | → `@orb/db` | `@orb/db/kit` | DB-error classifier; no domain. | resolve-time |
| `verbs/list.ts` — `cardTokenSize` (local function) | stays domain feature | `domain/character/substrate/card-tokens.ts` | Local list-presentation logic; no consumer outside list (move only if the domain ever needs a general token-size utility elsewhere). | lint-time: `kit-purity` gate would catch it if it migrated to `kit` with domain deps |
| `seed.ts` — `DefaultCharacterSeeder` with in-process memo + `inFlight Map` | stays domain feature | `domain/character/seeder/` | Correct and well-sized; the two-layer idempotency + `ASSUMES(single-replica)` concurrency guard are intentional. Reorganized as a named subsystem for legibility. | — |
| `import/verbs/import-character.ts` + `export/verbs/export-character.ts` — direct `@orb/db` reads | stays in import/export | The serialization core (shared by import+export per `spine/serialization-core.md` target) reads `@orb/db` directly | Expected pattern: import+export are bulk serializers, not CRUD callers. The serde core shares ONE mapper; it reads the schema tables directly (not through the character front door). Character's front door is for business-logic callers (tRPC, chat, buddy). | resolve-time: `@orb/db` is a declared dep of `@orb/server` |
| `character_embeddings` table (currently in `db/schema/search.ts`) | → `@orb/db` | `@orb/db/schema/character.ts` or `@orb/db/schema/embeddings.ts` | Schema-naming lie: the table is named for the consumer. In orbweaver the producer (character card text → `embeddings` domain's write path) drives schema ownership; the `embeddings` domain owns vector tables. | compile-time: schema file location is the type source |

---

## Cross-feature composition (the injection model)

Character is called by `chat`, `memory` (via roster for scoped-group digests), `import`, `export`,
`tag`, `workloads/discovery`. None of these import `domain/character` internals — all access is
through the front door or (for import/export) through `@orb/db` schema directly.

**Injected into `chat` at the composition root:**

| Op injected | Provided by | Used for |
|---|---|---|
| `character.resolveCurrentVersion` | character domain | ASSEMBLE RESOLVE phase — resolve live card fields per roster member |
| `character.mintSyntheticGroupCharacter` | character domain | room creation for scoped groups (replaces `_shared/group-character-rows.ts`) |
| `character.findSyntheticGroupCharacter` | character domain | group-character lookup on send |

**Injected into `embeddings` via the content-changed event path:**

Character emits a `character.updated` event on save; the `embeddings` indexer subscribes and calls
`embeddings.store(kind='card', lens='card-text', key=characterId, content=..., model=embedModel)`.
Character does NOT call embeddings directly — zero reach into the knowledge cluster.

**`tag` junction:** `character_tags` is owned by `tag` domain (a junction over `characters.id`). The
`bulkAddCardTag` verb goes through the injected `tag.attachToCharacter` op, not a direct table write.

---

## Spine thread intersections

### §7.3 serialization / serde core
The full card type (`CreateCharacterSchema`) belongs in `@orb/contracts` as the ONE canonical card shape
(the `spine/serialization-core.md` target: "model the FULL card as typed fields/columns"). **STATUS CORRECTED
2026-06-25 (verified against the steady clone): this promotion is already DONE, not pending.**
`creator`/`cardVersion`/`regexScripts`/`extensions` are typed columns on `character_versions`
(`db/schema/character.ts:137-140`) and the `raw` blob is dropped — so an app-authored card already
round-trips identically to an imported one. Orbweaver's job is to **preserve** this, not re-derive it:
the canonical shape lives in `@orb/contracts/character`; the Zod schema validates both the wire (tRPC)
and the import normalizer (the tolerant `RawCard` adapter normalizes INTO it). Character's
`contract/params.ts` re-exports the inferred TS type from `@orb/contracts/character`. (import.md +
export.md both independently confirmed this against the code — the earlier "promote (pending)" framing
was stale recon.)

### §7.4 types and schemas — one home, one direction
- `createCharacterSchema` / `updateCharacterSchema` → `@orb/contracts/character` (cross-boundary wire).
- `CharacterDetail` / `CharacterSummary` → `domain/character/contract/views.ts` (domain-internal view;
  re-exported from the front door for client type-only use).
- `CvEdits` / `IdEdits` / `MintFirstVersionArgs` / `RemoveCharacterCleanup` →
  `domain/character/contract/params.ts` (domain-internal arg shapes).
- `CharacterContext` → explicit named interface, not `ReturnType<>`.
- `CharacterRow` (`typeof characters.$inferSelect`) → stays in `persistence/queries.ts` (a DB-row
  type derived from the schema; no leak).

### §7.5 string-union dispatch discipline
The `synthetic` flag is a boolean, not a union axis — no dispatch concern. The `role` on
`character_books` (`primary | auxiliary`) is a 2-member union; it must have ONE importable canonical
union in `@orb/contracts` (not re-declared in 3 mapper sites — the current serde-mapper triplication
is exactly the `messageRole` antipattern). `characters.ownerId` / `characterId` are TypeID-branded
(`CharacterId`, `CharacterVersionId`) — the brand discipline from neo-tavern carries forward.

### §8.6 first-class principal blast radius
The `synthetic=true` character is the precedent for an agent-owned identity row (the `__group__${chatId}`
namespace). When agents become first-class principals (their own `users` row — `_FANOUT-BRIEF.md` §8.6),
the same provisioning pattern applies: `mintSyntheticGroupCharacter` ≈ `provisionAgentPrincipal`. Keep
the two concerns separate: character identity is the card; the principal (the seat at the chat table) is
a `chat_participants` row. A character agent has both.

---

## Invariants (gate candidates)

1. **Chats never pin a character version** — `chats.characterVersionId` is gone; any migration that adds
   it back is a compile-time error (the column does not exist in `@orb/db/schema/chat`).
   *Enforcement: compile-time (`tsc`) — column absence is a schema fact.*

2. **Character resolves its own live version** — `resolveCurrentVersion` is owned by the character
   domain; callers inject it. No sibling domain re-implements the `characters.currentVersionId` lookup.
   *Enforcement: lint-time (dep-cruiser `domain-no-cross-feature` rule — a domain may not reach
   into another domain's `persistence/` directly).*

3. **`synthetic=true` characters are filtered in every user-facing query** — `list` and every corpus
   consumer filters `WHERE synthetic = false`. A new query against `characters` that omits this filter
   silently exposes group buckets.
   *Enforcement: test-time — a character/list contract test asserts synthetic rows never appear in list results.*

4. **Edit-in-place is the only write path** — `forkVersion` does not exist; no verb may insert a new
   `character_versions` row except `mintFirstVersion` (create), `snapshot` (explicit save), and
   `restore` (copy old → new current).
   *Enforcement: compile-time — `forkVersion` is deleted; `CharacterService` interface is the
   exhaustive shape; any new insert path must go through a named verb.*

5. **Character associations key on `characters.id`, not a version** — `character_personas` and the
   re-keyed `character_books` both use the identity FK; the book set resolves via current-version
   resolution at assemble (no cv pin, no snapshot column in the initial port).
   *Enforcement: compile-time — `@orb/db/schema/character`/`world-info` carry the identity FK; the
   `character_books` old cv-keyed FK is gone post-migration.*

6. **The character front door is the only call-site for business logic** — import/export bypass it by
   reading `@orb/db` directly (expected, sanctioned); all other callers (tRPC, chat, buddy, workloads)
   import `domain/character/index.ts` only.
   *Enforcement: lint-time (dep-cruiser `domain-no-cross-feature` rule).*

7. **`mintSyntheticGroupCharacter` is a character verb, not a `_shared` helper** — the `__group__${chatId}`
   handle namespace is owned here; no code outside `domain/character` inserts into `characters`/
   `character_versions` directly.
   *Enforcement: lint-time (dep-cruiser — no direct `@orb/db/schema/character` writes outside
   `domain/character/persistence/`).*

---

## Resolved decisions (was: open)

- **`character_books` FK migration — RESOLVED: re-key to `characters.id` + current-version resolution.**
  The simple path (see §"Book-snapshot nuance" above): `character_books.characterId` references
  `characters.id`; the book set resolves at assemble via current-version resolution; no snapshot column in
  the initial port. A freeze-lore-at-version-X feature, if ever wanted, is a separate snapshot junction.
  Locked consistently with `world-info.md`, `db.md`, `export.md`.
- **`restore` verb — RESOLVED: full copy.** `restore` does a full copy of the old cv into a NEW current
  version (one `INSERT INTO character_versions … SELECT` with a new version counter). No partial restores
  (a partial restore is just an `update`).
- **`resolveCurrentVersion` null semantics — RESOLVED (locked as contract invariant).** Returns `null` for
  BOTH "not owned" AND "currentVersionId is null (mid-delete)"; callers treat `null` as "skip, not an
  error." Any rewrite that throws instead of returning `null` breaks the roster loop — this is a contract
  invariant, not an open question. (Gate: a contract test asserts null-not-throw for the not-owned and
  mid-delete cases.)
- **`raw` blob fate — RESOLVED: `raw` is dropped; residual unknown vendor keys live in `extensions`.** The
  steady clone already retired `raw` (verified `db/schema/character.ts:137-140`); there is no `raw` column
  in orbweaver. Genuinely-unknown vendor extras land in the typed `extensions` JSON column (the residual
  blob MINUS keys owned by typed columns). The gate that rejects promoting a KNOWN field into the residual
  blob is `spine/serialization-core.md` invariant 2 (compile-time: the typed column is the only home).

### Still open (deferred, with criterion)

- **`snapshot` verb UX — DEFERRED (presentation only; does not block the verb).** *Criterion:* decide at
  build time whether an explicit `snapshot` carries a user-visible label and surfaces in a version-history
  UI panel. The verb (mint a named restorable version) exists and is contract-stable regardless of the UX.
