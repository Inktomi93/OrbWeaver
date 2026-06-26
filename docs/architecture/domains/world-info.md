# Orbweaver — `world-info` domain

> **Status: planning.** Target spec for the `world-info` domain in `packages/server/src/domain/world-info/`.
> Grounded in whole-file recon of neo-tavern's `src/server/domain/world-info/`,
> `src/shared/world-info/`, and `src/server/domain/chat/assembly/world-info/`. The
> neo-tavern shape is already close to correct — the redesign is consolidation and
> type-hardening, not a structural overhaul.

---

## What this domain owns in orbweaver

**One books/entries store + scope junctions.** World info is books-only: a book is a container of
keyword-triggered lore entries; books are attached at one of four scopes (global / character / chat /
persona); the per-turn assembly unions all four into a single pool. The domain owns everything up to
the pool boundary.

Specifically:

- **Books CRUD** — list, get, create, update, remove, duplicate (6 verbs)
- **Entries CRUD** — list, get, create, update, remove, backfillTitles, applyEntryOrder (7 verbs)
- **Attachment junctions CRUD** — attach / detach / list × 4 scopes (chat / character / global /
  persona) = 12 verbs; character-scope enforces at-most-one-primary-per-character atomically
- **Ownership guards** — `ensureChatOwned`, `ensureCharacterOwned`, `ensurePersonaOwned`
  (in orbweaver: `ensureCharacterOwned` keys on `characters.id`, not a version id — see §Character
  association key below)
- **Entry metadata validation** — write-side guard (`entryMetadataWriteSchema`) rejects
  `assistant@depth-0`; read-side resolver functions (`resolveEntryScope`, `resolveEntryInjection`,
  `resolveEntryPosition`) are lenient and field-isolated
- **WiBusEvent emission** for chat-scoped attachment changes (`wiBookAttached`, `wiBookDetached`)

The domain does NOT own:
- **The per-turn pool builder** — `chat/assembly/world-info/pool.ts` stays in `chat` (the GATHER
  phase is a chat concern; `chat` reads the world-info tables as a db-layer consumer, not via the
  domain's front door)
- **The keyword matching engine** — `wi-keyword-match.ts` moves to `@orb/kit` (pure, zero-dep,
  isomorphic; §Movement table)
- **The entry runtime resolver functions** — `resolveEntryScope`, `resolveEntryInjection`,
  `resolveEntryPosition` move to `@orb/kit` (pure, zero-dep, multiple consumers: server pool +
  potentially client preview)

---

## 8-slot layout

```
domain/world-info/
├── index.ts              FRONT DOOR — re-exports WorldInfoService + params/views/errors
├── service.ts            COMPOSITION ROOT — wires verbs from all three verb groups + context
├── context.ts            DI BUNDLE — { db, emitWiEvent, ensureChatOwned, ensureCharacterOwned,
│                                        ensurePersonaOwned, loadOwnedBook, loadOwnedEntry }
├── contract/
│   ├── service.ts        interface WorldInfoService (25 verbs — the authoritative API listing)
│   ├── params.ts         *Params for all 25 verbs (BookId, EntryId as branded types)
│   ├── results.ts        void | view return types
│   ├── views.ts          BookView · EntryView (metadata: EntryMetadata | null) · BookAttachmentView
│   │                     WorldBookRole ('primary' | 'auxiliary') — DERIVED here from the canonical
│   │                     zod schema in `@orb/contracts/world-info` (one home; views.ts shadows it)
│   └── errors.ts         WorldInfoNotFoundError
├── verbs/
│   ├── books/            listBooks · getBook · createBook · updateBook · removeBook · duplicateBook
│   │   └── index.ts
│   ├── entries/          listEntries · getEntry · createEntry · updateEntry · removeEntry ·
│   │   │                 backfillTitles · applyEntryOrder
│   │   └── index.ts
│   └── attachments/
│       ├── chat.ts       attachToChat · detachFromChat · listForChat    (emits WiBusEvent)
│       ├── character.ts  attachToCharacter · detachFromCharacter · listForCharacter
│       │                 (db.batch primary-demote + upsert — ATOMIC; do not split)
│       ├── global.ts     attachGlobal · detachGlobal · listGlobal
│       ├── persona.ts    attachToPersona · detachFromPersona · listForPersona
│       └── index.ts
├── persistence/
│   ├── queries.ts        toBookView · toEntryView (parses metadata → EntryMetadata | null) ·
│   │                     loadOwnedBook · loadOwnedEntry
│   │                     NOTE: loadOwnedEntry uses an inArray subquery over owned book ids —
│   │                     entries have no ownerId column; this is the ONLY cross-tenant guard
│   └── ownership.ts      ensureChatOwned · ensureCharacterOwned · ensurePersonaOwned
│                         (ensureCharacterOwned keys on characters.id — not a version id)
├── substrate/            (none needed — the three resolve* functions move to kit; the
│                         entryMetadataWriteSchema moves to contracts)
└── (no named subsystems)
```

---

## Public surface

Exported from `index.ts` (the enforced front door):

| Export | Kind | Consumer |
|---|---|---|
| `WorldInfoService` | interface | transport (tRPC router), composition root |
| `WorldInfoServiceDeps` | type | entry-level composition root |
| `createWorldInfoService` | factory | entry-level composition root |
| `*Params` types (25) | types | tRPC router input handlers |
| `BookView` · `EntryView` · `BookAttachmentView` | types | tRPC router, client (via contracts — see §Movement) |
| `WorldBookRole` · `WORLD_BOOK_ROLES` | type + const | tRPC router, client |
| `WorldInfoNotFoundError` | class | transport error-boundary |

**Shared surface (in orbweaver, moves to `@orb/contracts` / `@orb/kit` — see §Movement):**

| Today | Orbweaver |
|---|---|
| `src/shared/world-info/world-info-schema.ts` — zod wire schemas + resolve* + entryMetadataWriteSchema | split: wire schemas → `@orb/contracts`; resolve* + matcher → `@orb/kit` |
| `src/shared/world-info/wi-keyword-match.ts` — keyword engine | `@orb/kit/world-info` |

---

## Movement table

| Unit | Outcome | Target | Rationale | Enforcement tier |
|---|---|---|---|---|
| **`createBookSchema` / `updateBookSchema` / `createEntrySchema` / `updateEntrySchema`** (zod wire schemas in `shared/world-info/world-info-schema.ts`) | → `contracts` | `@orb/contracts/world-info` | Cross-boundary shapes: tRPC router (server) + client form validators both need RUNTIME access to the same zod object. Today they live in `shared/` to dodge the client-no-backend-runtime dep-cruiser rule; in orbweaver `@orb/contracts` is the correct cross-boundary home. | Resolve-time: `@orb/contracts` is in `client`'s declared deps; `@orb/server` (runtime) is not |
| **`WorldBookRole` / `WORLD_BOOK_ROLES`** (declared twice: `contract/views.ts` + `shared/world-info/world-info-schema.ts`) | merge → `contracts` | `@orb/contracts/world-info` | One canonical declaration. The zod schema (`worldBookRoleSchema`) is the live gate; the plain TS type in `contract/views.ts` is a shadow. Both collapse into one zod-inferred type in contracts. | Compile-time: `WorldBookRole` in `contract/views.ts` derives from `@orb/contracts` — a type-import that fails if the dep is absent |
| **`entryMetadataWriteSchema`** (write-side validator in `shared/world-info/world-info-schema.ts`) | → `contracts` | `@orb/contracts/world-info` | A zod schema that is the cross-boundary write guard. Server verbs validate against it; tRPC router input validation references it. It is not pure-primitive; it belongs with the other wire schemas. | Resolve-time: same package as the other wire schemas |
| **`EntryMetadata` type + `entryMetadataSchema`** (the read shape) | → `contracts` | `@orb/contracts/world-info` | The typed shape the server returns in `EntryView.metadata` and the client consumes. Must move out of `shared/` (which dissolves in orbweaver) to its canonical cross-boundary home. | Resolve-time: same package |
| **`resolveEntryScope` / `resolveEntryInjection` / `resolveEntryPosition`** (pure reader functions in `shared/world-info/world-info-schema.ts`) | → `kit` | `@orb/kit/world-info` | Pure functions, zero runtime deps, isomorphic. Consumers: `chat/assembly/world-info/pool.ts` (server), potentially the COMPOSER live-preview (client). Same-package access with no upward dep. | Resolve-time: `@orb/kit` is at the base of the cake — both server and client packages have it in declared deps |
| **`wi-keyword-match.ts`** (`buildKeywordHaystack`, `matchEntryKeys`, LRU + CJK/Unicode logic) | → `kit` | `@orb/kit/world-info` | Pure, zero-dep, isomorphic keyword engine. Today it sits in `shared/world-info/` because `chat/assembly/context.ts` needs it server-side. In orbweaver it is a `kit` engine alongside `kit/macro` and `kit/regex` — one canonical location, callable from server assembly AND (future) client COMPOSER preview without reimplementing. | Resolve-time: `@orb/kit` has no deps; any package can import it |
| **`BookView` / `EntryView` / `BookAttachmentView`** (today in `contract/views.ts`, deep-imported by client) | → `contracts` | `@orb/contracts/world-info` | Cross-boundary wire shapes consumed by the client. Today `src/client/features/world-info/hooks/use-world-entries.ts` does `import type EntryView from #server/domain/world-info` — a client→server-domain reach (type-only today, but the intent is wrong). In orbweaver, view types that cross the server↔client boundary live in `@orb/contracts`. The domain's own `contract/views.ts` keeps a local view for internal use and derives from contracts. | Resolve-time: `@orb/client` does not have `@orb/server` in its runtime deps — importing the view type from `@orb/contracts` is the only legal path |
| **`EntryView.metadata: unknown \| null`** (widened type in `contract/views.ts:39`) | harden → `contracts` | `@orb/contracts/world-info` | The view should carry `EntryMetadata \| null` (the typed shape, not `unknown`). Parse once at `toEntryView()` — a `safeParse` against `entryMetadataSchema` at the DB read seam — and carry the typed shape downstream. Eliminates all three `resolveEntry*` call sites at the pool and any future consumer. | Compile-time: `EntryView.metadata: EntryMetadata \| null` — downstream code that accessed raw `unknown` breaks at `tsc` |
| **`WorldInfoPoolChat` interface** (inline in `chat/assembly/world-info/pool.ts:34-41`) | → chat's `contract/` | `@orb/server` `domain/chat/contract/views.ts` | A chat-internal assembly seam type. It describes the shape of a chat's roster context that the WI pool builder needs. It is a chat domain-internal type misfiled in a substrate file. Belongs in chat's `contract/` per the 8-slot rule: exported types live only in `contract/`. | Lint-time: `no-inline-types` gate (dep-cruiser rule flags exported types outside `contract/`) |
| **`BookExpansionRow` interface** (inline in `pool.ts:46-54`) | stays local | `chat/assembly/world-info/pool.ts` | Private row-projection shape; not exported; only used in one file. The `no-inline-types` gate targets EXPORTED shapes — an unexported local is fine. | N/A (not exported) |
| **`WiBusEvent` entry-level variants** (`wiEntryAttached`, `wiEntryDetached`, `wiEntryScopeChanged` in `shared/contracts/chat-bus.ts`) | **RESOLVED: keep-deferred (documented intent)** | `@orb/contracts/world-info` | Declared but never emitted (confirmed: only `wiBookAttached`/`wiBookDetached` fire in `verbs/attachments/chat.ts`). "Unwired ≠ worthless" — the bus shape is scaffolded for future per-entry keyword/scope changes. Orbweaver KEEPS the declarations with an explicit deferred-intent comment; does NOT auto-delete and does NOT pre-wire emitters. *Criterion to wire:* when a per-entry keyword/scope edit needs to invalidate a chat's WI pool — then emit from `entries/` verbs. | Compile-time: the type declaration + the deferred-intent comment is the marker; when wired, the emitter call type-checks against the union |
| **`WorldInfoScope` reference in `chat-bus.ts`** (imports from `shared/prompt/prompt-config.ts`) | → `contracts` | `@orb/contracts/world-info` | The bus event imports a prompt-domain concept (`WorldInfoScope`) for its event payload. In orbweaver the bus contract must not depend on the prompt domain. `WorldInfoScope` (or an equivalent injection-placement type) lives in `@orb/contracts` directly. | Resolve-time: `@orb/contracts` has no domain deps; a contracts-file importing a server-domain type is a resolver failure |
| **`verbs/attachments/character.ts` — `db.batch([demote, upsert])` for primary uniqueness** | stays in domain | `world-info/verbs/attachments/character.ts` | The at-most-one-primary-per-character enforcement is a single atomic batch. If split into two sequential awaits, a concurrent attach could leave two primary rows or a crash between them could leave zero. This is the only defense and must not be abstracted away. Carry a comment explaining the DISJOINT-rows proof (the `demote` statement excludes via `ne(bookId)` — the rows are guaranteed non-overlapping, so order is immaterial, but atomicity is not). | Compile-time: a typed `db.batch([...])` call; a `batchMany` helper that wraps it is acceptable as long as it stays a single db call |
| **`persistence/queries.ts` / `persistence/ownership.ts`** | stays in domain | `world-info/persistence/` | Correct placement. `toEntryView` is the DB→view projection (parse metadata once here). `loadOwnedEntry` inArray-subquery is the ownership guard for entries; do not simplify to a bare `eq(id)` — that would allow cross-tenant writes. | Compile-time: the ownership subquery is inlined in a typed drizzle call; a wrong simplification breaks type inference |
| **`chat/assembly/world-info/pool.ts`** | stays in chat | `domain/chat/assembly/world-info/pool.ts` | The pool builder is a chat concern: GATHER phase, per-turn, reads four junction tables directly (by design — no ownership guards needed here, ownership is pre-verified by the domain's attach verbs). The `pool.ts` is a direct db-layer consumer of world-info tables; that is the intended and documented separation. The boundary must be explicit: `pool.ts` is chat's internal substrate reader, consuming `@orb/db` schema directly, not going through the world-info domain's front door. | Lint-time: a dep-cruiser rule can assert `pool.ts` imports from `#db/schema` (the db package) and NOT from `domain/world-info/index.ts` |
| **`worldBooks` / `worldEntries` / `chatBooks` / `characterBooks` / `globalBooks` / `personaBooks` tables** | stays in `@orb/db` | `packages/db/src/schema/world-info.ts` | Correct schema ownership. `characterBooks` was keyed on `cv_id` (the pinned version); in orbweaver it keys on `characters.id` (live identity — **D28**, no cv exists at all). The attachment verbs' ownership guard (`ensureCharacterOwned`) is a plain `characters`-row join. Books are the live card's; the book set is read at assemble — no snapshot-resolution nuance survives (there is no version to resolve). See §Note on character association key below. | Compile-time: `characterBooks.characterId: CharacterId` is the only typed key; a `CharacterVersionId` reference fails (the brand is retired with the table) |

---

## Note on character association key (the D28 consequence)

neo-tavern's `character_books` is keyed on `cv_id` by design: a book attachment was semantically
"this book was attached when this version of the character was pinned," so the chat sees the
book-set as of its pinned version. Orbweaver has **no character versions at all** (D28 —
`participants-agents-identity.md` §4; the card is the flat `characters` row). With no version table:

- `characterBooks.characterId` references `characters.id` — the only key (live identity).
- At the GATHER phase, `pool.ts` reads character books by `characterId` directly (no cv join, nothing
  to resolve).
- Books are the live card's. The book set changes only when an author deliberately edits the card —
  mid-chat changes are explicit, by design. There is no "snapshot as of version X" to re-provide.
- A future "freeze lore at a snapshot" feature, if ever wanted, would reference a
  `character_snapshots` id in a separate junction — never a version pin on the chat row.

---

## Note on WI double-render (load-bearing for chat integration)

`domains/chat.md` §3 rule 3: "Render once; never re-render resolved output." The neo-tavern WI path
currently does `macro→regex→wrap→macro` — a double-render. In orbweaver the ASSEMBLE/BUILD phase
resolves each WI entry's content and `wiFormat` template in ONE pass (macro + regex in a single
stage); the assembled entry is then framed once. The `world-info` domain itself does not assemble
or render — it only stores and retrieves. The double-render is a chat-assembly bug, not a
world-info domain bug; it is called out here only so the domain's output (plain `content` strings)
remains easy to consume without inadvertent second-pass substitution.

---

## Note on pool.ts persona source-tagging (esoteric, load-bearing)

`pool.ts` tags persona-book rows with `source:'chat'` (not `source:'character'`). This determines
which persona `{{user}}` resolves against for lore entries in persona-attached books: the active
persona of the speaking participant, not the pinned anchor. Character books stay `source:'character'`
so their `{{user}}` resolves against the anchor. Swapping these source tags would silently produce
wrong pronoun/name substitution in persona-attached lore. This is a pool.ts internal detail; the
world-info domain has no opinion on it. It must not be disturbed when moving pool.ts's
`WorldInfoPoolChat` type to chat's `contract/`.

---

## Invariants (gate candidates)

1. **Books-only, four scopes, no per-entry pins.** Per-entry-pin tables (`chat_world_entries`,
   `cv_world_entries`) are absent from the schema. There is no per-attachment scope override — the
   only scope knob is `metadata.scopeMode` on the entry itself. Gate: schema has no
   `chat_world_entries` or `cv_world_entries` table.
2. **`characterBooks` keys on `characters.id`, not a version id.** D28 is a schema invariant.
   Gate: `characterBooks.characterId` column type is `CharacterId` (branded); `CharacterVersionId`
   does not exist as a type (the version table is gone).
3. **Primary attachment is atomic.** `attachToCharacter` with `role:'primary'` MUST use a single
   `db.batch([demote, upsert])`. Gate: a test verifies that two concurrent primary attaches leave
   exactly one primary row.
4. **Entry ownership is via book.** `updateEntry` and `removeEntry` must use the
   `inArray(worldEntries.worldBookId, ownedBookSubquery)` pattern — never a bare `eq(id)`.
   Gate: a test verifies that an entry update with a foreign entry id returns 404, not a silent write.
5. **`EntryView.metadata` is typed.** `toEntryView` parses the JSON blob to `EntryMetadata | null`
   at the DB seam. Downstream code receives the typed shape, not `unknown`.
   Gate: compile-time (`EntryView.metadata: EntryMetadata | null` in contracts).
6. **`WorldBookRole` has one declaration.** The zod schema in `@orb/contracts` is the canonical
   source; `contract/views.ts` derives its type from it.
   Gate: `no-inline-union-redecl` (§7.5 of `_FANOUT-BRIEF.md`) — the string union `'primary' | 'auxiliary'` appears in one place only.
7. **`resolveEntry*` and `matchEntryKeys` live in `@orb/kit`.** No server-domain code re-implements
   keyword matching or metadata resolution.
   Gate: `kit-purity` rule (structure.md §7) + resolve-time (kit has zero domain deps, so a domain
   import FROM kit cannot create a cycle).
8. **The pool is a db-layer consumer, not a domain consumer.** `pool.ts` imports from `#db/schema`,
   not from `domain/world-info/index.ts`.
   Gate: dep-cruiser rule asserting this import direction.
