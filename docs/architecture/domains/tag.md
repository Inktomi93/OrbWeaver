# Orbweaver — `tag` domain

> **Status: planning (target spec).** Ground-truth: whole-file recon of neo-tavern's
> `src/server/domain/tag/` (19 files, 693 lines), `src/db/schema/tag.ts`, and
> `src/server/trpc/routers/tag.ts`. Cross-feature boundary violations are confirmed at
> file:line in the recon JSON. Most-relevant partitioning rule: **descriptive labels →
> `tag`; semantic facets (genre/tone/themes) → `discovery`** (`domains.md`,
> `AGENTS.md` §3).

---

## What this domain owns in orbweaver

**One user-scoped tag namespace + five per-type FK junctions with polymorphic DISPATCH.**
A tag is a named, colored, sortable label; every tag belongs to one owner (composite
unique key `(ownerId, name)`). Five entity types can be tagged; each has its own
per-type FK junction table (D24: NO polymorphic association tables — the tables are
per-type FK; only the registry-driven _dispatch_ is polymorphic). The domain owns
everything up to the junction boundary.

Specifically:

- **Tag CRUD** — list, get, create, update, remove (5 verbs)
- **Management verbs** — listWithUsage (5-junction usage rollup), pruneUnused (remove
  zero-usage tags), setOrder (Manual sort mode) (3 verbs)
- **Junction trio** — attachTag / detachTag / bulkAttachTag — each polymorphically
  dispatched via the junction registry (3 verbs in one file, sharing guard mechanics)
- **Junction registry** (`persistence/junctions.ts`) — the `(ownerTable, junction,
targetKey, targetCol)` map for the target types; module-load assertion enforces the
  cross-tenant guard (fires once at import). **Two scoping flavors (D30):** four
  **target-derived** junctions (character/worldBook/persona/preset) derive the owner from
  the target's `ownerTable.ownerId`; **`chat_tags` is the one PER-USER overlay** — its
  target (`chats`) has no `ownerId` (D18), so the junction carries its OWN `ownerId` (the
  tagger) and is membership-gated (`requireParticipant`), not target-derived. The assertion
  is "every target-derived `ownerTable` exposes `ownerId`; `chat_tags` is the explicit
  per-user exception."
- **`tags` table** — per-owner rows (name, color, color2, source, folderType,
  sortOrder, isHiddenOnCard)
- **Five junction tables** — `character_tags`, `chat_tags`, `world_book_tags`,
  `persona_tags`, `preset_tags` (PK composite; FK columns cascade on delete). **`chat_tags`
  additionally carries `ownerId` (the tagger) + `unique(chatId, tagId, ownerId)` — D30** (a
  per-user overlay: two members may apply the same tag to a shared chat independently, and
  each sees only their own).

This domain does NOT own:

- **`proposedTags`** — in neo-tavern, a staging JSON column on `character_versions`, in
  the `character` domain's schema scope. Orbweaver has no `character_versions` table at
  all (D28), so the column has no home and is not relocated to `characters`; the
  pre-accept staging surface is rebuilt as a `character_tags.status='pending'` junction
  row (see §Movement for the target redesign)
- **Analytics facets** — genre/tone/theme keywords from corpus distillation live in
  `character_summaries.tags` under `discovery`; they share the word "tags" but are a
  structurally separate concept
- **Tag reads in character/list and character/persistence** — the character domain's
  list view and `canonicalTagsFor()` read `characterTags + tags` directly (read-only
  joins); this is a deliberate db-layer consumer pattern (same as `pool.ts` in
  world-info), not a violation to fix by routing through the tag front door

---

## The two-surface problem (the central redesign)

neo-tavern carries **two separate surfaces** for character labels:

| Surface      | Location                                                    | Written by                                | Read by                         |
| ------------ | ----------------------------------------------------------- | ----------------------------------------- | ------------------------------- |
| **proposed** | `character_versions.proposedTags` (JSON `string[]`)         | import verb, corpus `applyTagSuggestions` | tag-management "Promote" dialog |
| **accepted** | `character_tags` junction (rows with `TagId + CharacterId`) | `attachTag` / `bulkAttachTag`             | character list view, filters    |

Promotion is **manual-only**: the user clicks "Promote" → `tag.create{source:'card'}` +
`tag.bulkAttach`. No event, no hook, no automatic conversion. The accepted surface
does NOT round-trip to export (export reads `character_versions.proposedTags`, not
`character_tags` — accepted tags are silently lost on re-export).

**Orbweaver target:** proposed = a **status field on the junction row**, not a parallel
JSON column. Orbweaver has no `character_versions` table for such a column to live on
(D28), and the column is not moved to `characters` — it is gone. One surface:
`character_tags` grows a `status: 'pending' | 'accepted'` column. Import and corpus
distillation write `status:'pending'` junction rows (replacing neo's
`character_versions.proposedTags`, which D28 removes with the table); the user's
"Accept" action flips the status. Export reads
the `character_tags` junction (exporting `accepted` rows). This collapses the two
surfaces into one, closes the round-trip gap, and makes "promote" a status flip rather
than a copy. (See §Movement and §Invariants for the enforcement plan.)

### DECIDED + the write side BUILT (Nate, 2026-06-28)

The two-surface collapse is now the **decided, unified tag-provenance model**, and the _population_ (write)
side is built. The mechanism is exactly `tags.source` × `character_tags.status` — **one junction, three
sources, one review surface, no separate flow** (the "without a whole nother aspect" constraint):

| source       | who writes it                                                                                              | status on write | meaning                                  |
| ------------ | ---------------------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------- |
| **`card`**   | **import** (an ST card's native `tags`) + **the default-character seeder** (the 5-card pack's author tags) | **`pending`**   | author-shipped suggestions               |
| **`auto`**   | the corpus **distill** pass (`discovery`, PD-40)                                                           | **`pending`**   | machine-snagged suggestions              |
| **`manual`** | the user (`character.bulkAddCardTag`)                                                                      | **`accepted`**  | a deliberate user add — live immediately |

- **The `pending` status replaces SillyTavern's import dialog.** ST (`references/sillytavern/.../tags.js`
  `importTags`) gates card tags behind a 4-way `tag_import_setting` (ASK | NONE | ALL | ONLY_EXISTING) +
  a blocking ASK dialog. Orbweaver is cleaner: **always import card tags as `pending` suggestions** and let
  the user curate from the ONE pending-review surface (Accept → `accepted`) — no per-import setting, no
  blocking dialog. (ST's `['ROOT','TAVERN']` internal-tag exclusion has no orbweaver analog; the carry only
  trims empties + dedupes case-insensitively.)
- **Import + distill JOIN on one surface, distinguished by `source`.** Both write `status:'pending'` rows to
  `character_tags`; the user's Accept flips `pending→accepted` regardless of origin. `source` is the only
  thing that differs — there is no second table, no parallel "proposed" store.
- **ONE parameterized attach op.** `tag.attachCardTagByName({ ownerId, characterId, tagName, source?, status? })`
  — defaults `source:'manual', status:'accepted'` (the user manual-add path, unchanged); import + the seeder
  pass `source:'card', status:'pending'`; distill (PD-40) will pass `source:'auto', status:'pending'`. Resolve-
  or-create is race-safe (`INSERT … ON CONFLICT (ownerId, name)`); the attach is idempotent. **(This op + its
  `source?`/`status?` params belong in the `TagService` interface + the verb list — the attach surface is
  `attachTag`/`attachCardTagByName`/`bulkAttachTag`; the "11 verbs / attachTag-only" listing below predates
  this built op and should be reconciled to include it.)**
- **A re-import never un-accepts.** Re-attaching a tag the user already `accepted` does NOT downgrade it back
  to `pending` (a card re-import must not silently revert curation).
- The **Accept/Reject UI** is the Phase-6 client surface; the server write side (import + seed → `card`/
  `pending`) is what's built now.

---

## 8-slot layout

```
domain/tag/
├── index.ts            FRONT DOOR — re-exports TagService (interface), TagView (type),
│                         TagWithUsage (type), TagUsage (type), TagNotFoundError (class),
│                         TagTargetType (type), TagSource (type), TagFolderType (type),
│                         CreateTagInput (type), UpdateTagInput (type), createTagService
├── service.ts          COMPOSITION ROOT — wires all 11 verbs + context. Zero logic.
├── context.ts          DI BUNDLE — { db, loadOwnedTag, ensureTargetOwned,
│                         insertJunction, deleteJunction } — thin (40 lines); verbs close
│                         over this, never see the junctions registry directly
├── contract/
│   ├── service.ts      interface TagService (11 verbs — the authoritative API listing)
│   ├── params.ts       CreateTagInput · UpdateTagInput · TagTargetType · TagSource ·
│   │                     TagFolderType — all declared once (see §Movement re: inline
│   │                     redeclarations in neo-tavern)
│   ├── results.ts      void | TagView | TagWithUsage returns
│   ├── views.ts        TagView · TagUsage · TagWithUsage (typed; TagFolderType derives
│   │                     from @orb/contracts/tag, not re-declared here)
│   └── errors.ts       TagNotFoundError (extends DomainNotFoundError from kit or
│                         foundation — NOT from _shared, which dissolves)
├── verbs/
│   ├── create.ts       createTag — insert with conflict-safe TOCTOU handling
│   ├── get.ts          getTag — ownership-scoped single fetch
│   ├── list.ts         listTags — owner-scoped collection
│   ├── update.ts       updateTag — partial patch; null color clears to theme default
│   ├── remove.ts       removeTag — junction rows cascade; NOT idempotent
│   ├── list-with-usage.ts  listTagsWithUsage — 5 GROUP BY queries merged in-process
│   ├── prune.ts        pruneUnusedTags — delete zero-usage tags; returns removed count
│   ├── set-order.ts    setTagOrder — db.batch([first, ...rest]) N-update (non-empty
│   │                     tuple required; typed drizzle updates, no as-cast)
│   └── attach.ts       attachTag · detachTag · bulkAttachTag — three ops in one file
│                         (share ownership + junction mechanics; splitting scatters
│                         identical guard patterns with no clarity gain)
├── persistence/
│   ├── junctions.ts    registry — { character, chat, worldBook, persona, preset } →
│   │                     { ownerTable, junction, targetKey, targetCol, scope }. Module-load
│   │                     assertion: every TARGET-DERIVED ownerTable exposes ownerId; chat is
│   │                     the per-user exception (scope:'membership', junction carries its own
│   │                     ownerId — D30). Preserve the `as never` cast on polymorphic insert.
│   └── queries.ts      loadOwnedTag · ensureTagOwned · fetchTargetOwned (target-derived: reads
│                         ownerId on ownerTable; chat: requireParticipant + junction.ownerId — D30)
│                         · listOwnedTags · listOwnedTagsWithUsage (5 GROUP
│                         BY queries in-process — correct at this scale; see §Esoteric) ·
│                         insertJunction · deleteJunction
├── substrate/          (none needed — no pure helpers; the junction dispatch is a
│                         persistence-layer registry, not a substrate transform)
└── (no named subsystems)
```

**Verbs:** createTag · getTag · listTags · updateTag · removeTag · listTagsWithUsage ·
pruneUnusedTags · setTagOrder · attachTag · detachTag · bulkAttachTag (11 total).

---

## Public surface (`index.ts`)

```ts
// Types (from contract/)
export type { TagService } from "#domain/tag/contract/service";
export type { TagView, TagUsage, TagWithUsage } from "#domain/tag/contract/views";
export type {
  TagTargetType,
  TagSource,
  TagFolderType,
  CreateTagInput,
  UpdateTagInput,
} from "#domain/tag/contract/params";

// Errors
export { TagNotFoundError } from "#domain/tag/contract/errors";

// Factory
export { createTagService } from "#domain/tag/service";
```

The tRPC router (`transport/trpc/routers/tag.ts`) imports this front door only.
Character-domain read-only joins (`character/list.ts`, `character/persistence/queries.ts`)
import from `@orb/db` schema directly — a db-layer consumer pattern, not a domain
import — and are exempt from the front-door rule (same as `world-info/pool.ts`).

---

## Movement table

| Unit                                                                                                                                                                                                                               | Outcome                                                                                           | Target                                                                                             | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Enforcement tier                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`TagTargetType` union** (`"character" \| "chat" \| "worldBook" \| "persona" \| "preset"`) — today re-declared as `z.enum` twice in `trpc/routers/tag.ts` (lines 8 and 85) and as a TS type in `contract/params.ts`               | **→ `@orb/contracts`**                                                                            | `contracts/tag/tag-schemas.ts` — one `tagTargetTypeSchema` (zod); `TagTargetType` inferred from it | Cross-boundary wire value: the tRPC router (server) and client attachment UI both need the runtime zod schema. One declaration eliminates the `no-inline-union-redecl` violation (§7.5 of `AGENTS.md`).                                                                                                                                                                                                                                                            | Resolve-time: `@orb/contracts` is in both server and client declared deps; the two inline re-decls become import sites                                                                                                               |
| **`TagSource` union** (`"manual" \| "auto" \| "card"`) — today re-spelled as `z.enum` twice in `trpc/routers/tag.ts` (lines 36 and 46) and as `source` inline in `contract/params.ts`, `contract/views.ts`, and `db/schema/tag.ts` | **→ `@orb/contracts`**                                                                            | `contracts/tag/tag-schemas.ts` — `tagSourceSchema` alongside `tagTargetTypeSchema`                 | Same inline-union rationale. The db schema enum and the zod wire schema must agree; one source in contracts that the db schema derives its enum from (or mirrors with a test).                                                                                                                                                                                                                                                                                     | Compile-time: downstream re-spellings break at `tsc` if they diverge from the contracts import                                                                                                                                       |
| **`TagFolderType` union** (`"NONE" \| "OPEN" \| "CLOSED"`) — today declared in `contract/views.ts` but NOT re-exported from `index.ts`; consumed by `contract/params.ts` internally                                                | **→ `@orb/contracts`**                                                                            | `contracts/tag/tag-schemas.ts`                                                                     | Currently a mis-homed type: it is not in `params.ts` where it belongs (it's in `views.ts`), and it cannot be exported from the front door as-is because `views.ts` is the wrong slot. Move the declaration to contracts so both the update input shape and the view shape derive it from one place.                                                                                                                                                                | Resolve-time: single declaration; contract imports it; the previous `views.ts` occurrence becomes a re-export from contracts                                                                                                         |
| **Wire schemas** (`createTagSchema`, `updateTagSchema`) — today declared inline in `trpc/routers/tag.ts` as `z.object({...})` literals (no named extracted schema exists)                                                          | **→ `@orb/contracts`**                                                                            | `contracts/tag/tag-schemas.ts` — named `createTagSchema` + `updateTagSchema`, type-inferred        | Cross-boundary wire: client form validators and server tRPC input handlers should reference the same zod objects (§7.4 `no-inline-types` gate). Naming them in contracts makes the wire surface inspectable and drift-impossible.                                                                                                                                                                                                                                  | Resolve-time: the tRPC router imports named schemas; client form imports the same; any drift is a `tsc` error                                                                                                                        |
| **`TagView` / `TagUsage` / `TagWithUsage`** (today in `contract/views.ts`, deep-imported by the client)                                                                                                                            | **→ `@orb/contracts`**                                                                            | `contracts/tag/tag-views.ts`                                                                       | View types that cross the server↔client boundary. The domain's `contract/views.ts` derives from `@orb/contracts/tag`; it does not re-declare. Same pattern as `world-info.md` §Movement.                                                                                                                                                                                                                                                                           | Resolve-time: `@orb/client` has `@orb/contracts` in declared deps, not `@orb/server`; importing the view from contracts is the only legal path                                                                                       |
| **`proposedTags` column on `character_versions`** (neo source) — JSON `string[]`, written by import and corpus; drained manually into `character_tags`                                                                             | **→ status column on `character_tags` junction**                                                  | `character_tags.status: 'pending' \| 'accepted'` in `@orb/db` schema                               | Collapses the two-surface design. D28 deletes the `character_versions` table outright, so the column has no host in orbweaver and is NOT relocated to `characters` — the junction status replaces it regardless. Import and corpus distillation write `status:'pending'` junction rows (no JSON column). The "Accept" action is a status-flip (`UPDATE character_tags SET status='accepted' WHERE ...`). Export reads `accepted` rows, closing the round-trip gap. | Compile-time: no `character_versions` table and no `proposedTags` column exist in the orbweaver schema → any read site is a `tsc` error; the `status` enum is a typed drizzle column                                                 |
| **`corpus/verbs/tag-suggest.ts` writes directly to `tags + characterTags`** (bypasses tag front door; lines 117, 135)                                                                                                              | **→ route through `TagService.createTag` + `TagService.attachTag`** wired at the composition root | `discovery` domain (corpus → discovery rename) receives a `TagService` dep via `WorkloadRunnerEnv` | Direct table reach: `applyTagSuggestions` reimplements create-tag + link-character in 70 lines without the junction registry's ownership assertion, without the TOCTOU-safe conflict handler, and without audit. Route through the tag service eliminates the duplicate path. Per the cross-feature dep rule, the tag service is injected at the composition root (NOT a sideways domain import).                                                                  | Resolve-time: `@orb/server` package dep-cruiser rule — `domain/discovery/` may not import `#domain/tag/` directly; it receives the service dep as an injected type                                                                   |
| **`DomainNotFoundError` base class** (imported from `domain/_shared/errors.ts` in `contract/errors.ts`)                                                                                                                            | **→ `@orb/kit/errors`** (RESOLVED, `Core-Legacy-Migration-and-Gaps.md` §1 LOCKED)                 | `@orb/kit/errors.ts` — `DomainNotFoundError` as a pure error class (zero I/O, zero domain)         | `_shared` dissolves in orbweaver. `DomainNotFoundError` is a pure primitive (no domain knowledge); 4 callers in the tag domain extend or throw it. Kit is the correct home (no deps → any package imports it without a direction violation). **BOOT-CRITICAL: must exist before the tag front door re-exports `TagNotFoundError`.**                                                                                                                                | Resolve-time: `@orb/kit` is in `@orb/server`'s declared deps; `_shared/errors` ceases to exist                                                                                                                                       |
| **`fetchOwned` primitive** (`_shared/fetch-owned.ts`, imported by `persistence/queries.ts:5`)                                                                                                                                      | **→ `@orb/db/kit`** (RESOLVED, `Core-Legacy-Migration-and-Gaps.md` §3 LOCKED)                     | `@orb/db/kit/fetch-owned.ts`                                                                       | Generic owner-scoped single-row fetcher; the `OwnedTable` constraint (`SQLiteTable & { id; ownerId }`) **requires drizzle column types**, so it CANNOT be `@orb/kit`-pure — it lands in `@orb/db/kit` (resolves the earlier kit-vs-db question). Used by `loadOwnedTag` + `ensureTargetOwned`; `ownerId` → `principal.userId` under §7.1.                                                                                                                          | Resolve-time: `@orb/db/kit` is below `@orb/server`; the kit-purity gate rejects drizzle imports from `@orb/kit`                                                                                                                      |
| **`junctions.ts` registry**                                                                                                                                                                                                        | **stays in domain**                                                                               | `tag/persistence/junctions.ts`                                                                     | The registry pattern is exactly right: one-line to add a 6th target, module-load assertion catches misconfigured tables at boot. No over-indirection. The `as never` polymorphic insert cast must be preserved (see §Esoteric). The module-load `ownerId` assertion must stay or be promoted to a compile-time constraint (see §Esoteric).                                                                                                                         | Compile-time: module-load assertion promotes to a typed `OwnedTable` constraint on the registry value type (rejects tables without `ownerId` at `tsc`); the `as never` cast is preserved + suppressed via biome escape-hatch comment |
| **`listOwnedTagsWithUsage` — 5 GROUP BY queries in-process**                                                                                                                                                                       | **stays in domain**                                                                               | `tag/persistence/queries.ts`                                                                       | Five independent GROUP BY + in-process merge is correct at expected scale (dozens–hundreds of tags). A 5-way LEFT JOIN produces `N × 5` NULL-explosion rows. The comment in `queries.ts` explains the tradeoff; preserve it in orbweaver.                                                                                                                                                                                                                          | Test-time: a test verifies the usage rollup is correct when tags have mixed-junction coverage                                                                                                                                        |
| **`setTagOrder` — `db.batch([first, ...stmts.slice(1)])`**                                                                                                                                                                         | **stays in domain**                                                                               | `tag/verbs/set-order.ts`                                                                           | libSQL batch for N concurrent UPDATE statements. The non-empty-tuple `[first, ...rest]` pattern is correct and distinct from the `BatchItem` inline-cast antipattern (these are typed drizzle updates, no `as` cast). Replacing with sequential `await`s would serialize N round-trips.                                                                                                                                                                            | Compile-time: `db.batch` typed call; a wrong serialization change breaks the tuple type                                                                                                                                              |
| **`attach.ts` — three ops in one file**                                                                                                                                                                                            | **stays in domain**                                                                               | `tag/verbs/attach.ts`                                                                              | attachTag / detachTag / bulkAttachTag share the same ownership + junction dispatch mechanics. One file is the right grouping per the per-feature template: "one verb per file" means one LOGICAL verb, not one export; this is three related junction-manipulation ops sharing identical guard patterns. Splitting would scatter duplicated guards.                                                                                                                | Lint-time: `verb-naming` gate from `Core-0-Architecture-and-Structure.md` §7 — the file is named for its group; all three exports are verbs                                                                                          |
| **`character/list.ts` + `character/persistence/queries.ts` — direct table joins**                                                                                                                                                  | **stays as db-layer consumer**                                                                    | `@orb/db` schema imports in character domain persistence                                           | Read-only joins for the character list view and `canonicalTagsFor()`. These are the "pool.ts pattern": a domain that owns a view of a junction may read the junction tables directly from `@orb/db` schema without going through the junction-owning domain's front door. The access is read-only and ownership-safe (character already verified).                                                                                                                 | Lint-time: dep-cruiser rule asserting `domain/character/persistence/` imports from `#db/schema` for the tag tables, NOT from `domain/tag/index.ts`                                                                                   |

---

## Spine threads that touch this domain

### 7.1 Identity / auth / permission

Tag verbs use `{ userId }` as the owner discriminant — owner-equality scoping (every
fetch is `WHERE ownerId = userId`). This is unchanged in orbweaver; tags are personal
labels (no resource-role hierarchy). The `attachTag` / `detachTag` / `bulkAttachTag`
verbs also permission-check the **target** entity, in one of two ways (**D30**): for the
four **target-derived** types (character/worldBook/persona/preset) via `fetchTargetOwned`,
which reads the target's `ownerTable.ownerId`; for **`chat_tags`** — whose target `chats`
has no `ownerId` (D18) — via `requireParticipant(principal, chatId)` (the tag is a per-user
overlay, so the junction also carries the tagger's own `ownerId`, and a member sees/edits
only their own chat tags). When the identity model migrates to a `Principal` (§7.1), the tag
verb signatures change from `{ userId: UserId }` to `{ principal: Principal }`, and the
ownership scoping reads `principal.userId`. The only resource-role touch is `chat_tags`'
membership gate; the other four are pure owner-equality.

### 7.3 Serialization / serde core

The `proposedTags → character_tags status-pending` redesign is the **import/export
round-trip fix** identified in `domains.md` Open decisions: in neo-tavern accepted
canonical tags don't export because export reads `character_versions.proposedTags`, not
the `character_tags` junction. Orbweaver has no `character_versions` table to read (D28),
so there is no JSON column to fall back to; export reads `WHERE status='accepted'` from
the junction — a single join, no separate JSON column.
The tag domain does NOT own the export path; the export domain adds a join. The tag
domain owns the schema change (new `status` column on `character_tags`).

### 7.4 Types and schemas — one home, no inline

Three union types (`TagTargetType`, `TagSource`, `TagFolderType`) are currently spelled
inline 2–5 times each across `contract/params.ts`, `contract/views.ts`, and
`trpc/routers/tag.ts`. Per §7.4's `no-inline-types` gate: one canonical declaration per
shape, in `@orb/contracts/tag`. The tag domain's `contract/` derives its TS types from
contracts imports; the tRPC router imports the named zod schemas; the client imports the
same. Zero re-declarations downstream — each inline re-spelling becomes a type error if
it drifts.

### 7.5 String-union dispatch discipline

`TagTargetType` is today a 5-member union dispatched via the junction registry's
computed-key lookup — not a switch statement. This is already the correct shape:
the registry IS a mapped-type Record (`junctions: { [K in TagTargetType]: JunctionEntry<K> }`
in orbweaver). Adding a 6th target type extends the Record; the `tsc` exhaustiveness
guard fires immediately if the verbs' polymorphic dispatch doesn't handle it. No inline
re-spelling of the 5-member union anywhere — one importable `TagTargetType` from
contracts, one `tagTargetTypeSchema` zod validator, one registry Record. This is the
`workloads.kind` gold-standard pattern applied to the tag domain.

---

## Esoteric / load-bearing quirks to preserve

**Polymorphic insert `as never` cast** (`persistence/queries.ts:133`): the junction
insert uses `db.insert(j.junction).values({ tagId, [j.targetKey]: targetId } as never)`
because a computed-key object literal cannot be statically typed across five differently-
typed drizzle tables. The biome `no-loose-id-cast` suppression is correct here — this
is a drizzle shape cast, not an ID cast. In orbweaver: preserve the pattern or replace
the `as never` with a typed discriminated union of insert helpers, one per junction
type. Either way, removing the cast without a typed alternative breaks `tsc`. Verify
the biome escape-hatch comment survives the restructure.

**Module-load ownerId assertion** (`persistence/junctions.ts:62-68`): the for-loop at
module load validates every **target-derived** ownerTable has an `ownerId` column. Fires
once at import, not per request. **D30 nuance:** `chat_tags` is `scope:'membership'` (its
target `chats` has no `ownerId` — D18), so it is EXEMPT from the ownerTable-has-ownerId
check and instead asserted to carry its OWN `ownerId` on the junction + a membership gate;
the assertion branches on `scope`. In orbweaver the preferred upgrade is a **compile-time
`OwnedTable` constraint** on the target-derived registry values — a drizzle table type only
assignable when `ownerId` exists — so a misconfigured target-derived entry is a `tsc` error,
not a runtime throw (the membership-scoped `chat` entry is typed separately). Until that
constraint exists, keep the runtime assertion. Do NOT remove or defer it — without it, a new
target-derived entry with an unscoped table silently permits cross-tenant tag attachment.

**`TagNotFoundError extends DomainNotFoundError`** (`contract/errors.ts:1`): the base
class import is the one that must move when `_shared/errors` dissolves. `TagNotFoundError`
is re-exported from the front door and used by 4 callers. The base class lands in
`@orb/kit/errors` (RESOLVED — not `foundation`) before the tag domain is ported —
otherwise the tag front door's re-export fails to resolve. This is a boot-order
dependency for the orbweaver scaffold; add `DomainNotFoundError` to `@orb/kit/errors` first.

**`listOwnedTagsWithUsage` N-query merge** (`persistence/queries.ts:42-78`): five
GROUP BY queries (one per junction) merged in-process. The comment in the source
explains the tradeoff against a 5-way LEFT JOIN row-explosion. This is the correct
approach at the tag corpus scale. Do not "simplify" to a JOIN — the NULL explosion
defeats the merge at typical counts. Keep the comment when porting.

**`db.batch([first, ...stmts.slice(1)])` non-empty tuple** (`verbs/set-order.ts:23`):
libSQL `db.batch` requires a non-empty `[first, ...rest]` spread. This is structural,
not laziness. The early return guards `orderedIds.length >= 1` (the router enforces
`min(1)`), so `stmts[0]` is always defined. Do not flatten to `await Promise.all` — it
serializes round-trips.

**corpus bypass of the tag front door** (`corpus/verbs/tag-suggest.ts:117,135`):
today's `applyTagSuggestions` writes directly to `tags` and `characterTags` tables.
This bypasses the junction registry's ownership assertion, the TOCTOU-safe conflict
handler, and the audit log. The `proposedTags → status-pending` redesign eliminates
this path entirely (corpus writes a pending junction row, not a tag + accepted row),
so the bypass disappears at redesign time — not at "route through the service" time.
Until the redesign, the bypass is a live cross-tenant risk if corpus can distill
characters it doesn't own; the current auth logic in `applyTagSuggestions` is the only
guard. The orbweaver redesign must close this gap structurally.

---

## Invariants (gate candidates)

1. **One tag namespace, one owner.** `tags.ownerId + tags.name` is the composite
   unique key. No global shared tags, no cross-owner junction inserts. For the four
   target-derived junctions the defenses are the registry's ownerTable-ownerId assertion +
   `fetchTargetOwned`; for **`chat_tags`** (per-user overlay, D30) the defense is
   `requireParticipant` + the junction's own `ownerId` + `unique(chatId, tagId, ownerId)`.
   Gate: compile-time (typed `OwnedTable` constraint on target-derived registry entries) +
   test (a foreign-owner attach returns conflict/404 for the owned types; a non-member chat
   attach returns 404; a member sees only their own chat tags — never a silent cross-tenant write).

2. **`TagTargetType` has one declaration.** The string union lives in
   `@orb/contracts/tag/tag-schemas.ts` as a zod schema; the TS type is derived. No
   inline re-spelling anywhere.
   Gate: `no-inline-union-redecl` (§7.5) — a dep-cruiser or AST rule counts
   re-declarations of the 5-member union; the count must be 1.

3. **The junction registry is the only insertion path.** No direct drizzle insert into
   a junction table outside `persistence/queries.ts:insertJunction`. The corpus bypass
   is eliminated by the status-column redesign.
   Gate: dep-cruiser rule asserting no domain outside `tag/persistence/` imports a
   junction table for INSERT (reads via `@orb/db` schema are exempt).

4. **`character_tags.status` is the single proposed/accepted surface.** No
   `proposedTags` JSON column anywhere — neo's `character_versions` table (its only home)
   is gone under D28, and it is not relocated to `characters`.
   Gate: compile-time (no `character_versions` table and no `proposedTags` column in the
   orbweaver schema → any read site is a `tsc` error); the neo→orbweaver data port lands
   these as `status='pending'` junction rows, not a column.

5. **Semantic facets are NOT in this domain.** `discovery` owns genre/tone/theme
   keywords in `character_summaries`. The tag domain's `source` enum remains
   `"manual" | "auto" | "card"` — no facet-type values.
   Gate: compile-time (`TagSource` in contracts; a `"theme"` or `"facet"` value is a
   compile error if added without updating the schema and contracts).

6. **`TagView` + `TagUsage` + `TagWithUsage` have one declaration.** They live in
   `@orb/contracts/tag/tag-views.ts`; the domain's `contract/views.ts` re-exports, does
   not re-declare.
   Gate: resolve-time (`@orb/client` can import from contracts, not server — the
   resolve enforces the one-home rule).

7. **`listOwnedTagsWithUsage` uses N separate queries, not a JOIN.** The in-process
   merge is the correct strategy at scale.
   Gate: test (verifies the rollup is correct for tags with mixed-junction coverage;
   a JOIN refactor would be caught by correctness divergence).
