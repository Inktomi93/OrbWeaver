# Orbweaver — `persona` domain

> **Status: planning (target spec).** Ground-truth: recon of
> `src/server/domain/persona/` (7 files, 573 lines), `src/shared/persona/` (2
> files), and the load-bearing cross-domain seams in `chat/assembly/context.ts`
> + `chat/verbs/set-persona.ts`. Most-relevant spine docs:
> `participants-agents-identity.md` (authoritative) + `domains/chat.md`.

---

## What this domain OWNS in orbweaver

**Personas are the human side of the roster.** A persona is a named identity a
human participant carries into a chat. The domain owns:

- **CRUD for persona rows** — create, list, get, update, remove (ownership-scoped).
- **Character-connection verbs** — connect / disconnect / list connected (the M:N
  `character_personas` junction). Personas survive every card edit — these associations
  key on `characters.id`, not a version pin.
- **`createFromCharacter`** — mint a persona from a character card's description,
  optionally swapping `{{char}}` ↔ `{{user}}` macros. Redesigned to be non-lossy
  (see §Movement).
- **Per-participant active persona** — `chat_participants.activePersonaId` becomes the
  live truth (replacing the dormant scaffolding). Assembly reads it; `setActivePersona`
  writes it.
- **Chat anchor persona** — `chats.anchorPersonaId` (renamed from `pinnedPersonaId`):
  the stable `{{user}}` POV that card-authored sections resolve against. Never updated
  by a mid-chat persona switch.
- **Per-message attribution** — `messages.personaId` stamped from the speaking
  participant's active persona at send time (not a chat-level field).
- **Metadata / placement** — `personaMetadataSchema` (descriptionPosition, inject);
  `resolvePersonaDescriptionPlacement` decides whether the persona description injects
  at-depth or in-prompt.

This domain does NOT own: persona-book world-info scope (world-info domain), the
chat roster (chat domain), or macro resolution engines (`kit/macro`).

---

## 8-slot layout

```
domain/persona/
├── index.ts            FRONT DOOR — re-exports PersonaService (type), PersonaDetail
│                         (type), PersonaNotFoundError, CreatePersonaInput,
│                         UpdatePersonaInput, createPersonaService
├── service.ts          COMPOSITION ROOT — wires all verbs + injected cross-feature
│                         deps (character existence check). Zero logic.
├── context.ts          DI BUNDLE — createPersonaContext(db): ownership-scoped queries
│                         + detailOf (pure, no I/O). Seam: add CharacterServiceDeps
│                         callback if avatar-orphan reap is ever wanted.
├── contract/
│   ├── service.ts      interface PersonaService (9 verbs — the feature's API readme)
│   ├── params.ts       CreatePersonaParams, UpdatePersonaParams, ConnectParams,
│   │                     DisconnectParams, ListConnectedParams, SetActivePersonaParams
│   ├── results.ts      (thin — most verbs return PersonaDetail or void)
│   ├── views.ts        PersonaDetail (the client read-model; typed metadata)
│   └── errors.ts       PersonaNotFoundError, CharacterNotFoundError
├── verbs/
│   ├── create.ts           create — mints a new persona row (logAudit, newTypeId)
│   ├── list.ts             list — owner-scoped page
│   ├── get.ts              get — single by id + ownership check
│   ├── update.ts           update — name/description/metadata/avatarAssetId
│   ├── remove.ts           remove — cascade-safe (junction + messages FK SET NULL)
│   ├── create-from-character.ts  createFromCharacter — non-lossy mint (see §Movement)
│   ├── set-active.ts       setActivePersona — writes chat_participants.activePersonaId
│   │                         (replaces chat domain's setChatPersona verb — that verb
│   │                          wrote chats.personaId, which is dropped)
│   └── connection/
│       ├── index.ts
│       ├── connect.ts          connectToCharacter — idempotent junction insert
│       ├── disconnect.ts       disconnectFromCharacter — junction delete
│       └── list-connected.ts   listConnectedToCharacter — character-scoped list
├── persistence/
│   └── queries.ts      detailOf (pure join: persona + avatar asset), ensurePersonaOwned,
│                         ensureCharacterOwned (reads characters.ownerId directly from
│                         @orb/db schema — a schema import, not a feature import),
│                         listByOwner, getPersonaRow, activePersonaForParticipant
└── substrate/
    └── macro-swap.ts   swapPersonaMacros — the two-pass {{char}}↔{{user}} swap using
                          intermediate tokens (preserves collision invariant; pure,
                          zero-I/O). Used only by createFromCharacter.
```

**Verbs:** create · list · get · update · remove · createFromCharacter ·
setActivePersona · connectToCharacter · disconnectFromCharacter ·
listConnectedToCharacter (10 total).

**No `<subsystem>/` needed** — this is a flat 10-verb feature; all pure helpers fit in
`substrate/`.

---

## Public surface (`index.ts`)

```ts
// types (from contract/)
export type { PersonaService } from '#domain/persona/contract/service'
export type { PersonaDetail } from '#domain/persona/contract/views'
export type { CreatePersonaInput, UpdatePersonaInput }
  from '#domain/persona/contract/params'

// errors
export { PersonaNotFoundError } from '#domain/persona/contract/errors'

// factory
export { createPersonaService } from '#domain/persona/service'
```

Cross-domain seam: `chat/assembly` imports `resolvePersonaDescriptionPlacement` and the
`AssemblePersona` shape from `@orb/contracts` (NOT from this domain's front door). See
§Movement rows for those shapes.

---

## Movement table

| Unit | neo-tavern location | Outcome | Target | Rationale | Enforcement tier |
|---|---|---|---|---|---|
| `resolvePersonaDescriptionPlacement` + `PersonaDescriptionPlacement` type | `src/shared/persona/persona-schema.ts` | **→ `@orb/kit`** | `kit/persona/placement.ts` | Pure function, zero-I/O, zero-domain. Multiple consumers: server assembly (ASSEMBLE context, `domains/chat.md` §2 RESOLVE phase) AND client render. `kit` is the only package all three consumers (`@orb/server`, `@orb/client`) can import from without violating the cake direction. | Resolve-time (undeclared import fails to resolve; physics) |
| `createPersonaSchema` + `updatePersonaSchema` (wire input schemas) | `src/shared/persona/persona-schema.ts` | **→ `@orb/contracts`** | `contracts/persona/persona-schemas.ts` | Cross-boundary wire: validated by both server transport and client form. `contracts` deps `kit` (down) — legal. Today co-located with the placement resolver; they are distinct concerns. | Resolve-time (package deps) |
| `personaMetadataSchema` / `personaMetadataWriteSchema` | `src/shared/persona/persona-schema.ts` | **→ `@orb/contracts`** | `contracts/persona/persona-schemas.ts` | Same rationale as wire schemas — consumed at the server persistence boundary AND exported to the client for form validation. The orbweaver target makes `PersonaDetail.metadata` typed (not `Record<string, unknown>`), so the schema belongs in `contracts` alongside the wire shapes. | Resolve-time (package deps) |
| `PersonaDescriptionPlacement` type (the union) | `src/shared/persona/persona-schema.ts` | **→ `@orb/kit`** | `kit/persona/placement.ts` | Companion to `resolvePersonaDescriptionPlacement` (pure type, zero-dep). Both consumers import from the same `kit` export. | Resolve-time (package deps) |
| `PERSONA_DESCRIPTION_POSITIONS` (the const array) | `src/shared/persona/index.ts` | **→ `@orb/kit`** | `kit/persona/placement.ts` | Same file as the resolver — pure constant, no deps. | Resolve-time (package deps) |
| `AssemblePersona { name, description }` shape | `src/shared/prompt/prompt-assemble-types.ts` | **→ `@orb/contracts`** | `contracts/persona/assemble-persona.ts` | Cross-boundary assembly shape consumed by server `chat/assembly` AND client rendering macros. In orbweaver `shared/prompt` maps to `contracts`. Must flow DOWN (server assembly reads from `contracts`; kit reads from nothing — this shape is too domain-adjacent for `kit`). | Resolve-time (package deps) |
| `PersonaDetail.metadata` type — change from `Record<string, unknown>` to typed | `src/server/domain/persona/contract/views.ts` | **typed in `contract/views.ts` + validated against `contracts/persona/persona-schemas.ts`** | `domain/persona/contract/views.ts` | The placement fields (`descriptionPosition`, `inject`) are few and known. Model them as typed fields in the view (zod-parse at the DB seam — the `parseProviderMetadata` pattern). Callers no longer re-parse. | Compile-time (type error if caller bypasses the typed view) |
| `swapPersonaMacros` two-pass function | `src/server/domain/persona/verbs/create-from-character.ts` (inline) | **stays — extract to `substrate/macro-swap.ts`** | `domain/persona/substrate/macro-swap.ts` | Pure, zero-I/O, no domain import — but persona-specific (not a general macro engine concern). Extraction makes the two-pass collision invariant testable in isolation. The collision invariant MUST be preserved: `{{char}}` → `{{personaChar}}` then `{{user}}` → `{{char}}` then `{{personaChar}}` → `{{user}}` — any one-pass or reversed swap corrupts descriptions containing both macros. | Test-time (unit test on `substrate/macro-swap.ts`) |
| `createFromCharacter` lossiness fix | `src/server/domain/persona/verbs/create-from-character.ts` | **stays + redesigned** | `domain/persona/verbs/create-from-character.ts` | Today the swapped description is stored as a plain string with no back-reference to the source character or swap decision. Orbweaver stores `sourceCharacterId` + `swapMacros: boolean` as typed fields in `personaMetadata` (now typed — see above) so the provenance is recoverable. The `swapPersonaMacros` helper stays; the row gains structure. | Compile-time (typed metadata schema rejects unknown fields; `sourceCharacterId` is a typed FK-backed field) |
| `chats.personaId` column — the second home | `src/db/schema/chat.ts` | **→ DROP** | `@orb/db` schema change | `participants-agents-identity.md` §3: active persona moves to `chat_participants.activePersonaId` (per-participant, wired). The column is a neo-tavern second home that can diverge from the participant's active state. `setActivePersona` verb (persona domain) replaces `setChatPersona` (chat domain). WI persona-book pool join rewired through `chat_participants` (see esoteric §below). | Compile-time (column absent from schema = any read site is a `tsc` error) |
| `chats.pinnedPersonaId` → rename to `anchorPersonaId` | `src/db/schema/chat.ts` | **rename in `@orb/db` schema** | `@orb/db` schema column | `participants-agents-identity.md` §3: the dual-persona rule is kept; the anchor is the stable `{{user}}` POV for card-authored sections. Rename makes the role self-documenting. | Compile-time (old name absent from schema = tsc error at all callsites) |
| `chat_participants.activePersonaId` — make it live | `src/db/schema/chat.ts` (set at roster creation, never read by assembly) | **wire it** | `domain/persona/verbs/set-active.ts` + `chat/assembly` RESOLVE phase | `participants-agents-identity.md` §3: this is the scaffolding that was never read. Assembly's RESOLVE phase reads `activePersonaId` per human participant. `setActivePersona` updates it. No reseed needed (persona shapes the per-turn system prompt only). | Lint-time + test-time (dep-cruiser: assembly must import from persona front door, not chat's old verb; integration test confirms active persona flows into assembled prompt) |
| `PersonaWithAvatar` internal join shape | `src/server/domain/persona/persistence/queries.ts` | **stays in `persistence/`** | `domain/persona/persistence/queries.ts` | Internal row bundle (not exported from the feature front door). In orbweaver stays in `persistence/` per the 8-slot template. | Lint-time (dep-cruiser: `types-in-contract` gate — no exported type outside `contract/`; this type is not exported from the domain, so clean) |
| `logAudit` reach | `src/server/domain/_shared/audit.ts` | **→ `foundation/observability`** | `foundation/observability/audit.ts` (called from verbs) | `_shared` dissolves in orbweaver. `logAudit` is a foundation primitive (all verbs use it). Verbs import DOWN into `foundation` — legal in the server tier list. | Resolve-time (package-internal tier: dep-cruiser `domain→foundation` is the allowed down-import; `domain→_shared` ceases to exist) |
| `newTypeId` reach | `src/server/domain/_shared/ids.ts` | **→ `@orb/kit`** | `kit/ids.ts` | Pure TypeID mint, zero deps. Multiple consumers. `kit` is the right home. Server verbs import from `@orb/kit` — legal (server deps kit). | Resolve-time (package deps) |
| `ParsedPersona` / `ParsedPersonas` inline shapes | `src/server/domain/import/persona.ts` | **stays in `import` domain's `contract/`** | `domain/import/contract/params.ts` or `results.ts` | These are import-domain internal shapes (pure parser output), not persona-domain exports. The persona domain does not own import parsing. Per §7.4 no-inline-types rule, they leave the verb body and land in import's own `contract/`. | Lint-time (`no-inline-types` gate: no exported shape outside `contract/`) |

---

## Spine threads that touch this domain

### 7.1 Identity / auth / permission

`setActivePersona` is a **host-or-self** operation: a host can set any participant's
active persona; a member can only set their own. This requires the `can(principal,
action, resource)` seam (`_STATUS.md` §7.1) — the old `loadOwnedChat` owner-equality
predicate is insufficient for multi-human. The persona verb receives a resolved
`Principal` and checks `requireHost || isSelf`.

### 7.3 Serialization / serde core

`createFromCharacter`'s new `sourceCharacterId` typed field participates in the card
round-trip: a persona created from a character card can re-derive its description if
the card is edited. This does NOT mean the persona domain imports the character domain
— it records a `characterId` FK in metadata; the caller (import domain, character
domain's `restore` verb) invokes `persona.createFromCharacter` at the composition
root.

### 7.4 Types / schemas — one home, one direction, no inline

`resolvePersonaDescriptionPlacement` and the companion type `PersonaDescriptionPlacement`
are the clearest cross-boundary pure-function case: server assembly (ASSEMBLE context)
AND client render both need exactly this function. → `@orb/kit`. Wire schemas and
metadata schema → `@orb/contracts`. Per §7.4 table: pure primitive shapes belong in
`kit`; cross-boundary wire shapes belong in `contracts`.

### Chat assembly seam (`domains/chat.md` §2 RESOLVE phase)

RESOLVE reads, per human participant: `chat_participants.activePersonaId` → loads the
`PersonaDetail` (via persona front door) → contributes `AssemblePersona { name,
description }` to the turn context + the `personaMarkerActive` flag (from typed
metadata, not a re-parse of `Record<string, unknown>`). Card-authored sections resolve
`{{user}}` against `anchorPersonaId`; user-authored sections against the speaking
participant's `activePersonaId`. This dual-persona routing is a load-bearing correctness
invariant (see esoteric notes below) — RESOLVE must read BOTH per turn.

### WI persona-book pool seam

`chat/assembly/world-info/pool.ts` currently joins on `chats.personaId`. When that
column is dropped, the join rewires through `chat_participants` to reach the active
participant's `activePersonaId`. This is a **chat-domain assembly change**, not a
persona-domain change — the persona domain owns the column/table, the chat domain owns
the join strategy. Mis-wiring this silently stops persona-bound world-info from loading.

---

## Esoteric / load-bearing quirks to preserve

**Dual-persona routing in WI macro resolution** (`chat/assembly/context.ts`): WI
entries sourced from `'character'` resolve macros against `anchorPersonaId`; entries
sourced from `'chat'` resolve against the speaking participant's `activePersonaId`. A
refactor that unified the two personas would silently break per-source macro routing.
The dual behavior survives the `pinnedPersonaId → anchorPersonaId` rename and the
`chats.personaId` drop — but ONLY if RESOLVE reads both per turn and routes per
entry-source.

**Message attribution at send time** (`chat/engine/engine.ts`): `messages.personaId`
is stamped from the speaking human participant's `activePersonaId`, not a chat-level
field. After the `chats.personaId` drop, the attribution stamp must read from the
participant row. Missed → all messages get the same (wrong or null) persona after the
migration.

**`swapPersonaMacros` two-pass invariant**: the swap uses two intermediate tokens to
avoid a collision where a naive one-pass `{{char}}→{{user}}` followed by
`{{user}}→{{char}}` would double-swap descriptions containing both macros. **RESOLVED:
orbweaver KEEPS the string-swap approach** (the two-pass `swapPersonaMacros` stays,
extracted to `substrate/macro-swap.ts`); the row gains `sourceCharacterId` + `swapMacros`
provenance (see §Movement) so the swap decision is recoverable. The structural
reference-model alternative (which would delete the function) is explicitly NOT taken —
the two-pass collision invariant is therefore load-bearing and must be preserved.

**`personaMarkerActive` flag** (`context.ts activePersonaMetadata`): placement is
resolved from the ACTIVE persona's typed metadata separately from `AssemblePersona`
(which carries only `name` + `description`). The split is intentional — `AssemblePersona`
is the macro-resolution shape; metadata drives the injection-placement decision. These
two shapes must stay separate; merging them into one would cause the persona description
to double-inject.

**`character_personas` keys on `characters.id`**: this is deliberate and must
be preserved. Personas are local prefs that survive card edits — identity-keyed.
(`character_books` ALSO keys on `characters.id` — D28: there is no character-version
table, so both junctions key on the flat `characters` row. Both are identity-keyed;
there is no `cv` to normalize against.)

**No reseed on `setActivePersona`**: persona shapes the per-turn system prompt only; it
is not in the agent-sdk session turns. Calling `setActivePersona` must NOT trigger a
reseed. (Confirmed: `participants-agents-identity.md` §3, verified in
`chat/verbs/set-persona.ts`.)
