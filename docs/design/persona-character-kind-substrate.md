---
kind: design
status: draft
updated: 2026-08-14
---

# Persona ↔ character unification — the kind-polymorphic cast + the card-face substrate

> **Status: EXECUTED 2026-08-08 (D137) — owner approved the program in full with the recommendations; all five §10 forks ruled on the recommendations.** Built as three stacked commits (D1 additive cast machinery → D2 wire swap + deletions → C1 card-face). Execution supersessions, recorded here the way §10.1 records A.8's: (1) §11's "old files deleted in leg D1" was un-buildable against §8.7's own per-leg floor (the old loaders had \~14 live importers until D2's swap, and §8.2's equivalence pin needs old+new coexisting) — deletions moved to D2, orchestrator-approved; (2) §6.1 row 14's `cast.contract.test.ts` violated the test-layout mirror — the pins live in `tests/contracts/chat/producers.contract.test.ts`; (3) §6.1 row 13's "expect no edits" was stale for `macro-identity.suite.int.test.ts` (it imported the old loader directly), and the inventory was short by `read.int.test.ts`, `fixtures.ts`, `chat-detail.test.ts`, `transport/trpc/routers/chat.test.ts`, `index.contract.test.ts`, `persona-this-chat-section.tsx`(+its CT) — all re-pointed, assertions intact; (4) §4.1's "`CharacterSummary` extends `ResolvedCardFace`" was impossible without ADDING `description` to the list wire — the summary is deliberately not a face carrier (D137(E)); `CharacterDetail` conforms via the assignability pin (zod-inferred mutable members cannot `extends` the readonly face). The phase gate held: `persona-resolution.suite.int.test.ts` byte-untouched and green at every leg; `tests/kit/macro/row-macros.test.ts` needed ZERO edits. Original design text below, unmodified. FORGE lane #3, 2026-08-08. This is the design for the direction ruled in `docs/design/parked-options-persona-prose.md` item 1: **Option D first (kind-polymorphic cast at the resolution layer), then Option C (shared card-SHAPE substrate)** — built in the image of the CANON-IDENTITY message-kind collapse that landed this session (`dde07f52c`, D129, design at `docs/reviews/stickler/2026-08-08-canon-message-identity.md`). Reading B (persona-as-character-with-a-flag) stays OFF THE TABLE per the owner's word; §9.1 records why with receipts. A build lane executes this doc only after the owner rules §10.
>
> **The one-line shape:** Phase D collapses the per-kind name/avatar producer machinery (2 entry-type pairs · 3 loaders · 4 build fns · 3 wire fields × 2 views) into ONE kind-discriminated `CastEntry` producer with a total policy record — no table, no identity, no pin-layer byte moves. Phase C gives the four columns both tables already share (`name`/`description`/`starred`/`avatarAssetId`) their ONE contracts home, composed by both domains — shape only, walls intact. **Neither phase touches `0000_baseline.sql`.**

---

## 0. Method + evidence base

Read IN FULL this session: `docs/design/parked-options-persona-prose.md` · `docs/reviews/stickler/2026-08-08-canon-message-identity.md` (932 lines) · `packages/contracts/src/chat/participants.ts` (the landed MESSAGE\_KINDS/MESSAGE\_KIND\_POLICY spine) · `contracts/src/chat/producers.ts` · `contracts/src/chat/roster.ts` l.130–210 (`ParticipantView`) · `contracts/src/persona/index.ts` · `contracts/src/character/index.ts` l.100–205 (+ constant block l.15–20) · `db/schema/persona.ts` · `db/schema/character.ts` · `domain/chat/persistence/macro-names.ts` · `domain/chat/persistence/roster-avatars.ts` · `kit/src/macro/row-macros.ts` · `client/features/chat/lib/attribution.ts` · `client/features/chat/lib/message-render-context.ts` · `domain/persona/verbs/create-from-character.ts` · `FINAL-Persona-and-Immersive-Chat-Visuals.md` Part A (A.0–A.8) · `agent-principal-design/02-participants-and-attribution.md` l.25–150 · D-ledger entries D18/D28/D60/D122/D129/D131/D133/D134 verbatim · the sacred suite's header + import block (`tests/server/domain/chat/persona-resolution.suite.int.test.ts` l.1–60) · `tests/server/domain/chat/persistence/macro-names.int.test.ts` l.1–25 · the workboard I-8 block (`docs/retro-workboard.md:1344–1364`). Consumer sweeps: `ast-grep` (`-l ts` AND `-l tsx`) + literal grep over every `ChatMacroNameProducer`/`PersonaAvatarEntry`/`CharacterAvatarEntry`/`build*Map`/`load*Producer` site (§6's inventory is the output).

**Premise-kills (three brief/doc claims died on today's tree — the \~50% stale-row rate, live):**

1. **The sacred suite's briefed path is stale.** It is `tests/server/domain/chat/persona-resolution.suite.int.test.ts` (295 lines), NOT `…/chat/verbs/persona-resolution.suite.int.test.ts` (no such file). Every gate statement below uses the real path.
2. **A.8's "avatars split / characters inline off `ParticipantView.avatarHash`" is half-stale.** `loadCharacterAvatarProducer` has since landed (`domain/chat/persistence/roster-avatars.ts:54–71`) with the participant-independent portrait floor, closing the "since-left character avatar" gap A.8 documented. What REMAINS of A.8 is the per-kind machinery duplication (§1.2) — the "design for 2 kinds then rework for the 3rd" cost. Phase D targets THAT, not a gap already closed.
3. **`getRosterCardView` (cited by the agent design set as the D22 member card surface) does not exist on the tree** — zero matches, two methods (grep across `packages/`, plus the `domain/character/verbs/` listing). The member-visible card surface is `ParticipantView` (`contracts/chat/roster.ts:155–203`): `displayName` + `avatarHash` + render/theme facts — **no card description**. This decides §3.6.

---

## 1. Current state — the two layers this design touches

### 1.1 The resolution layer (phase D's target)

**Producers** (server, both files carry the names-only/chrome-split law in their headers):

| Producer | Output | Home |
| - | - | - |
| `loadChatMacroNameProducer` | `ChatMacroNameProducer { characterNames: {id,name}[], personaNames: {id,name,description}[] }` | `domain/chat/persistence/macro-names.ts:66–83` |
| `loadPersonaAvatarProducer` | `PersonaAvatarEntry { id, avatarHash }[]` | `domain/chat/persistence/roster-avatars.ts:29–46` |
| `loadCharacterAvatarProducer` | `CharacterAvatarEntry { id, avatarHash }[]` | `roster-avatars.ts:54–71` |

ONE coverage algorithm, already shared: `collectMacroIds` (`macro-names.ts:25–52`) — participants' `characterId`/`activePersonaId` ∪ message rows' `characterId`/`personaId` stamps (history-inclusive: since-switched personas, removed characters). `roster-avatars.ts` imports it precisely "so the loaders can never drift on which ids are covered" (`:6–8`).

**Contract shapes** (`contracts/src/chat/producers.ts`, whole file): 2 name entry types + 2 avatar entry types + 4 map-builder fns (`buildCharacterNameMap`/`buildPersonaNameMap`/`buildPersonaAvatarMap`/`buildCharacterAvatarMap`), re-exported at `contracts/src/chat/index.ts:168–180`.

**Wire**: `ChatDetail.macroNames` + `.personaAvatars` + `.characterAvatars` (`domain/chat/contract/views.ts:170–181`) and the same trio on `MessagesPage` (`:191–195`), with a documented detail ∪ pages last-write-wins merge contract.

**Consumers** — the maps flow into exactly THREE sinks, none of which phase D re-shapes:

- **The kit macro atom** `resolveRowMacros` (`kit/src/macro/row-macros.ts:113–132`) via `RowMacroNameContext { characterNamesById, personaNamesById, … }` (`:63–70`). `RowCharacterName { name }` / `RowPersonaName { name, description }` are DECLARED IN KIT (`:34–43`) because the atom's signature needs them and kit cannot import contracts — the names-only law is enforced by these types having no avatar field.
- **The assembly contract** `HistoryMacroNames` (`domain/chat/contract/results.ts:190–193`) → `renderHistoryMacros` (`assembly/macros.ts:175–180`), built at engine `engine.ts:1240–1244`, `:1552–1556`, preview `verbs/read.ts:879–883`, memory backfill `substrate/backfill.ts:73–78`.
- **The client render chrome**: `message-list-surface.tsx:129–136` builds all four maps (pages flatMap ∪ detail), feeds `resolveRowAttribution` (`lib/attribution.ts:153–210` — assistant rows: live-`ParticipantView` avatar wins, then `characterAvatarsById` floor, `:199–201`) and `resolveMessageRenderContext` (`lib/message-render-context.ts:63–77`); the draft-greeting path re-derives the same maps from fetched cards (`message-list-surface.tsx:369–410`).

**What sits BESIDE this and is NOT this layer** (the walls, drawn precisely):

- `resolvePersonasForRoster` (`domain/persona/verbs/resolve-personas-for-roster.ts`, the `ResolvePersonasForRoster` injected op) serves the D122 consent-gated `RosterPersonaView` (name+description+metadata+ownerId, deliberately NOT the row — `domain/persona/contract/views.ts:23–32`) that feeds `pinnedPersona`/`activePersona` into `AssembleContext`. **That is the PIN layer.** The cast producer is the history-inclusive display/name vocabulary. Two layers, two questions ("who is `{{user}}` NOW" vs "what is id X called"); phase D touches only the latter.
- `AssembleContext.cast`/`castMembers: SpeakerRef[]` (`assembly/context.ts:387–397`) — the PRESENT AI-driven speaker cast (arbitration/round targets, D60 axis). Distinct from the cast PRODUCER (history-inclusive, includes personas, never drives arbitration). §3.8 keeps the vocabulary from colliding.

### 1.2 The A.8 residue, restated against today's tree

The asymmetry that survives is MACHINERY, not coverage: 2 kinds × 2 facets (name, avatar) = **2 entry-type pairs, 3 loaders, 4 builder fns, 3 wire fields on 2 views, 2 context-map params on every consumer, \~9 server call sites each wiring the trio by hand** (§6.1). Adding the D60 `agent` third kind to THIS shape = a third parallel set of everything — exactly A.8's "design for 2 kinds then rework for the 3rd." The fix A.8 ruled: a per-kind cast producer, built KIND-READY so agent is a one-arm add (`FINAL-Persona…md:167–181`).

### 1.3 The type layer (phase C's target)

The four columns both tables carry, with IDENTICAL wire limits (measured, not assumed):

| Field | `personas` (`db/schema/persona.ts`) | `characters` (`db/schema/character.ts`) | Wire limits |
| - | - | - | - |
| `name` | `:29` NOT NULL | `:88` NOT NULL | min 1 / max 200 — BOTH (`contracts/persona:11–12` vs `contracts/character:15–16`) |
| `description` | `:33` NOT NULL | `:89` NULLABLE | max 100\_000 — BOTH (`persona:13` `DESCRIPTION_MAX_LENGTH` vs `character:17` `TEXT_MAX`) |
| `starred` | `:35` default false | `:51` default false | boolean |
| `avatarAssetId` | `:37–39` SET NULL | `:125–127` SET NULL | branded `AssetId`, nullable |

Today that shape is re-spelled independently in: both DB schemas, `createPersonaSchema` (`contracts/persona:55–64`), `characterCardSchema`/`createCharacterSchema`/`updateCharacterSchema` (`contracts/character:102–201`), `PersonaDetail` (`domain/persona/contract/views.ts:10–16`), `CharacterDetail`/`CharacterSummary` (`domain/character/contract/views.ts:12–48`), and projected by `create-from-character.ts:27–36` (the lossy bridge: name/description/avatar copy + swap + provenance). AGENTS §0.2 — "a type/shape has exactly ONE home" — is the standing law this violates; the divergence that is NOT drift (description nullability, persona-only `title`, everything card-content) is enumerated in §4.3.

---

## 2. The precedent mapping — the message-identity collapse, transposed

The owner named the precedent: `MESSAGE_KINDS` + `MESSAGE_KIND_POLICY` + `messages.kind` (`dde07f52c`, D129). What that collapse did: ONE closed kind tuple + ONE total policy record + total `Record`/`assertNever` dispatches at every consumer — collapsing per-type branching into one shape WITHOUT deleting per-kind distinctions (narrator kept its synthetic character; comment kept its own policy row). The transposition, made explicit:

| Message-identity element | Cast analog (phase D) | Deviation + why |
| - | - | - |
| `MESSAGE_KINDS` tuple (`contracts/chat/participants.ts:73`) | `CAST_KINDS = ["character", "persona"] as const` — `agent` is the D60 one-arm add | none |
| `MessageKind` + `messageKindSchema` | `CastKind` (+ schema only if a wire input ever carries one — none does at launch; the entries are output-only) | schema deferred to a writer, D41 |
| `messages.kind` column | **NO column.** | **Deliberate, load-bearing deviation:** message-purpose needed storage because it was UN-derivable (attribution is SET-NULL-degradable — D129's own argument). Cast-kind is STRUCTURAL: the row's stamp columns (`characterId` vs `personaId`, and later assistant+`authorUserId` for agent) ARE the declaration — they are the id-space, not an inference over degradable state. A stored cast-kind would be a second spelling of the stamps. Phase D therefore touches no table by construction, not by restraint. |
| `MESSAGE_KIND_POLICY: Readonly<Record<…>>` (`participants.ts:102–106`) | `CAST_KIND_POLICY: Readonly<Record<CastKind, CastKindPolicy>>` — §3.2 | policy fields are fewer (2) and each names its live reader; a policy row nobody consumes is decoration (the warning-code-coverage lesson) |
| per-consumer total dispatches (`toShapeCanon`, `applyNamesBehavior`, memory load, client chrome) | the projection builders + the coverage source table + the client chrome dispatch — each a total `Record`/`assertNever` over `CastKind` (§3.3/§3.4) | where message-kind policy is pure DATA verdicts, the cast's per-kind behavior is PROJECTION — so the compile-force is the `WIRE_PART_HANDLERS` flavor of the same §5.5 discipline (`engine/pipeline.ts:913–946` — a total mapped-type record; "a new class fails to build until it registers here") |
| `DEFAULT_MESSAGE_KIND` | none — every cast entry is minted with its kind by its own query arm; there is no "unstated" cast entry | no default needed where no writer omits the field |
| kind never decides canon `role` (owner ruling) | cast-kind never decides macro ROUTING for a row — the row's stamps do; the entry only answers "what is this id called/shown as" | same orthogonality discipline |

Phase C's analog is the OTHER half of the same precedent: the one-home rule (`MESSAGE_KINDS` lives beside its sibling axis in ONE file because reachability demanded no split — `participants.ts:6–10`). The card-face substrate is a home decision, not a dispatch axis — it has NO kind discriminator of its own (§4.1).

---

## 3. Phase D — the kind-polymorphic cast producer

### 3.1 The contract shape (`contracts/src/chat/producers.ts`, reworked in place — one home, same file)

```ts
export const CAST_KINDS = ["character", "persona"] as const; // agent: the D60 one-arm add (§3.7)
export type CastKind = (typeof CAST_KINDS)[number];

/** One character the chat references — name + portrait floor. NO description: a card's description is
 *  not member-consented (§3.6); the member-visible card surface is ParticipantView, and it agrees. */
export interface CastCharacterEntry {
  readonly kind: "character";
  readonly id: CharacterId;
  readonly name: string;
  readonly avatarHash: string | null;
}
/** One persona the chat references — D122's consented presentation surface (name, description) + the
 *  avatar hash the transcript already renders. */
export interface CastPersonaEntry {
  readonly kind: "persona";
  readonly id: PersonaId;
  readonly name: string;
  readonly description: string;
  readonly avatarHash: string | null;
}
export type CastEntry = CastCharacterEntry | CastPersonaEntry;

/** The stable string key — the speakerKey namespace (`c:`/`p:`, `u:` reserved for agent), for the
 *  detail ∪ pages last-write-wins merge. */
export function castKey(e: CastEntry): string;
```

The per-arm payload DIFFERENCE (persona carries `description`, character does not) is not an asymmetry smell — it is the policy difference declared in the type, exactly as `MESSAGE_KIND_POLICY` rows differ per kind. The A.8 smell was duplicated MACHINERY, which this kills; it was never "the kinds must be identical."

### 3.2 The policy record — two fields, each with a named live reader

```ts
export interface CastKindPolicy {
  /** Which macro-subject family this kind's name backs — read by the name-context projection (§3.3):
   *  `char-subject` → characterNamesById ({{char}}); `user-subject` → personaNamesById ({{user}}/{{persona}}). */
  readonly macro: "char-subject" | "user-subject";
  /** Whether a live ParticipantView's avatarHash outranks the cast entry's — read by
   *  resolveRowAttribution (attribution.ts:199–201 today hardcodes this per role branch). */
  readonly avatar: "participant-first" | "cast-only";
}
export const CAST_KIND_POLICY: Readonly<Record<CastKind, CastKindPolicy>> = {
  character: { macro: "char-subject", avatar: "participant-first" },
  persona: { macro: "user-subject", avatar: "cast-only" },
};
```

Rule for future fields (write it into the record's header, the D129 idiom): a policy field joins only WITH its reader — a verdict nobody consumes is decoration.

### 3.3 The projections — the four builders collapse to two, and the names-only law survives BY TYPE

```ts
/** names(+persona description) ONLY — the macro-law projection. Output types are the KIT types
 *  (RowCharacterName/RowPersonaName), which have no avatar field: the macro engine remains structurally
 *  unable to see chrome. Total over CastEntry['kind'] (assertNever tail). */
export function buildCastNameContext(entries: readonly CastEntry[]): {
  characterNamesById: ReadonlyMap<CharacterId, RowCharacterName>;
  personaNamesById: ReadonlyMap<PersonaId, RowPersonaName>;
};
/** chrome projection — the avatar maps resolveRowAttribution takes. Same totality. */
export function buildCastAvatarMaps(entries: readonly CastEntry[]): {
  characterAvatarsById: ReadonlyMap<CharacterId, string | null>;
  personaAvatarsById: ReadonlyMap<PersonaId, string | null>;
};
```

**The recorded law this re-homes rather than repeals.** Three headers state "avatar chrome never rides the macro producer" (`macro-names.ts:6–8`, `producers.ts:50–56`, `roster-avatars.ts:1–5`; source law `Chat-Macro-Resolution` §1, A.8's "merging drags chrome through the macro path"). The law's MECHANISM was always the macro engine's input type — `RowMacroNameContext`'s kit-declared, avatar-free entry types — and that mechanism is untouched: kit does not change, `resolveRowMacros` does not change, and `buildCastNameContext`'s output is those same kit types. What changes is the ENVELOPE (one wire array instead of three) — which was never the guarantee. The build lane truth-repairs those three headers in the same commit (coupled doc sites, §6.1 row 12), stating the new form: ONE cast entry on the wire; TWO projections; the macro path types can never carry chrome.

### 3.4 The one loader (`domain/chat/persistence/cast.ts`, replacing `macro-names.ts` + `roster-avatars.ts`)

```ts
loadChatCastProducer(db, { participants?, messages? }): Promise<readonly CastEntry[]>
```

- **Coverage:** `collectMacroIds`'s algorithm verbatim (participants' seat/active-persona ids ∪ message stamps — history-inclusive), with the per-kind id sources laid out as a `satisfies Record<CastKind, …>`-shaped table so a third kind is a compile error, not a forgotten set. The `@owner-scope-ok` markers are re-derived on the new loader with the same position-named reasons (ids derived from the room's own canon, never caller-supplied — the marker-gate law).
- **Queries:** TWO (characters ⟕ assets, personas ⟕ assets — the avatar hash folds into the name select), down from four across three loaders. Same byte-classes served as today: character name+hash, persona name+description+hash. Nothing new becomes member-readable (§3.6).
- **The two old files delete in the same commit** (no "for now" duplicate map — the banned escape hatch), and `tests/server/domain/chat/persistence/{macro-names,roster-avatars}.int.test.ts` re-point at the cast loader with their assertions intact (§8.2; the deleted-test-path ledger note applies — `check:structure` sees the move).

### 3.5 The wire + the consumer re-point (interfaces that must NOT move)

- `ChatDetail.cast: readonly CastEntry[]` and `MessagesPage.cast` replace the three fields on each (`views.ts:170–181`, `:191–195`); the merge contract becomes "detail ∪ pages, last-write-wins on `castKey`" — the client's existing flatMap mechanism (`message-list-surface.tsx:129–136`), one array now.
- Server call sites re-point 3 loads → 1: `verbs/read.ts:592–600` `:812–815` `:879` · `verbs/start-chat.ts:489–498` · `verbs/invites.ts:231–240` `:295–304` · `verbs/fork.ts:707–716` · `verbs/resolve-canon-window.ts:33` · `engine/engine.ts:1240` `:1552` · `substrate/backfill.ts:73` · `substrate/chat-detail.ts:36–38,54–56,92–94`.
- **Frozen interfaces (the sacred-gate mechanism, §5.2):** `RowMacroNameContext` + `resolveRowMacros` (kit) · `HistoryMacroNames` (`contract/results.ts:190–193`) · `renderHistoryMacros` (`assembly/macros.ts:175`) · `resolveRowAttribution`'s input maps (`attribution.ts:74–114`) · `resolveMessageRenderContext`'s input (`message-render-context.ts:13–26`). Every one keeps its exact signature; the cast feeds them via §3.3's projections at the same sites that build the maps today (engine/read/backfill build `HistoryMacroNames` from `buildCastNameContext(cast)` instead of two builder calls — same two-line shape, e.g. `engine.ts:1241–1244`).

### 3.6 The character-description REFUSAL (trust boundary — recorded, not silent)

The task language ("projecting name/description/avatar") is honored on the persona arm only. The character arm carries NO description, because serving one through a member-gated producer would MINT a member-visible surface for card content that does not exist today: the member card surface is `ParticipantView` (displayName/avatarHash/render-policy/theme — `roster.ts:155–203`, no description); the prompt that contains card text is host-gated on every read (`promptSnapshot` drops for a non-host forker, D133 `Core-Path-Registry.md:458`); `getRosterCardView` is design-only (§0 premise-kill 3). No resolution-layer consumer needs it (`RowCharacterName` is `{name}`; `{{char}}` resolves to names — `row-macros.ts:34–36,117`). D122 consented the PERSONA presentation surface by the owner's word; no ruling consents the card's. If a future surface wants it, it is one additive field behind its own D-entry and gate review — a one-line add to `CastCharacterEntry`, which is exactly what an extensible union is for. **Recommendation: omit; revisit only with a ruling** (§10 fork 4).

### 3.7 Agent-readiness — the one-arm-add proof, enumerated

When the agent wave adds `"agent"` to `CAST_KINDS` (+ `CastAgentEntry { kind:"agent"; id: UserId; name; avatarHash }`), the compiler REDS every site that must decide, and nothing else:

1. `CAST_KIND_POLICY` — missing row (macro subject + avatar precedence become the agent wave's explicit decisions, per `agent-principal-design/02…md:70–71` — "the agent's display name arrives from the doc-04 speaker source").
2. `buildCastNameContext` / `buildCastAvatarMaps` — `assertNever` tails red until the arm declares which maps (or a new `agentNamesById`) it feeds; the KIT question ("does an agent row's `{{char}}` resolve to the agent's name?") surfaces HERE as a typed decision instead of a rework.
3. The loader's per-kind source table (`satisfies Record<CastKind, …>`) — where agent coverage is declared (roster `kind='agent'` seats' `userId` ∪ assistant rows' `authorUserId` — the D60 attribution shape, `02…md:91–92`).
4. `castKey` — the `u:` arm.
5. Client chrome — `resolveRowAttribution`'s agent branch (assistant + `authorUserId` + null `characterId`) is the agent wave's enumerated work, FOUND by the same compile wave (the entry union member flows into its map param types).

That enumeration IS the graduation of A.8's "build KIND-READY so the agent third axis is a one-arm add, not a rework" — five decided-by-compiler sites versus today's "mint a third parallel producer stack." The build lane runs this as its planted positive control (§8.4).

### 3.8 Vocabulary fence

`cast` (the producer/wire field) = the room's HISTORY-INCLUSIVE referenced identities (display/name vocabulary; includes personas; never drives arbitration). `AssembleContext.cast`/`castMembers: SpeakerRef[]` (`context.ts:387–397`) = the PRESENT AI-driven speaker cast (D60 drive axis). `SpeakerRef` is NOT reused for cast entries — personas are cast members but never speakers, and overloading the drive-axis type re-creates the XOR overload the 02-doc §1 unwound (§9.5). The `castKey` prefixes deliberately extend `speakerKey`'s namespace (`participants.ts:41–43`) so the two key spaces can never collide.

---

## 4. Phase C — the card-face substrate (`@orb/contracts/card-face`)

### 4.1 What it is, and is not

A NEW contracts module `packages/contracts/src/card-face/index.ts` owning the four-field shape both library entities share — **shape only**: no table, no kind discriminator, no ownership/copy/resolution semantics. It exports:

```ts
export const CARD_FACE_LIMITS = { nameMin: 1, nameMax: 200, textMax: 100_000 } as const; // §1.3 — already equal
/** The shared field VALIDATORS — composers spread these; per-domain optionality/nullability wraps
 *  per composer (that divergence is write semantics, not drift — §4.3). */
export const cardFaceFields = {
  name: z.string().min(CARD_FACE_LIMITS.nameMin).max(CARD_FACE_LIMITS.nameMax),
  description: z.string().max(CARD_FACE_LIMITS.textMax),
  starred: z.boolean(),
  avatarAssetId: typeIdSchema(ID_PREFIX.asset).nullable(),
} as const;
/** The AUTHORED face (row-plane): description nullability is the composer's (persona: string; character: string|null). */
export interface CardFace<D extends string | null = string | null> { readonly name: string; readonly description: D; readonly starred: boolean; readonly avatarAssetId: AssetId | null }
/** The RESOLVED face (read-plane): avatar joined to its CAS hash — what views and cast entries project. */
export interface ResolvedCardFace<D extends string | null = string | null> { readonly name: string; readonly description: D; readonly starred: boolean; readonly avatarHash: string | null }
```

Composers: `createPersonaSchema` spreads `cardFaceFields` (description bare = required; starred/avatar wrapped optional per its write semantics — `contracts/persona:55–64`); `characterCardSchema` + `createCharacterSchema` spread them (description `.nullable()` — `contracts/character:103–104,163`); `PersonaDetail`/`CharacterSummary` extend `ResolvedCardFace`; `CastPersonaEntry` = `ResolvedCardFace<string>` minus starred + kind/id (structural, asserted by a type test, not forced by extends); the future `AgentCardView` (agent design doc-06 §5) composes the same face instead of minting a third spelling. `create-from-character.ts:27–36` becomes a typed face→face projection (optional hygiene leg).

### 4.2 The single-home enforcement (a home is a mechanism, not a comment)

- **Reference equality, not shape equality:** spreading `cardFaceFields` makes `createPersonaSchema.shape.name` and `characterCardSchema.shape.name` the SAME zod object. A contract test asserts `Object.is` per field pair — the strongest possible "one home" proof, red the instant a composer re-spells a validator (§8.5).
- The `no-inline-types` gate already reds a NEW hand-declared face-shaped export outside the four homes; inside contracts, the reference-equality test is the belt.
- The dynamic-seam rule: `CARD_FACE_LIMITS.textMax` replaces both `DESCRIPTION_MAX_LENGTH` (`persona:13`) and `TEXT_MAX` (`character:17`) at their face uses — one constant, so the limits can never silently diverge. (`TEXT_MAX`'s non-face uses — greetings/systemPrompt/etc — keep the character-local constant; those are card-content, not face.)

### 4.3 What stays UN-shared, deliberately (the divergence inventory — none of it is drift)

| Divergence | Why it stays |
| - | - |
| `description` nullability (persona NOT NULL, character NULLABLE) | Persona description is the `{{persona}}` prompt payload — "" is a value, absence isn't a state (`row-macros.ts:119` floors to ""). Character description is card-spec fidelity (V2/V3 cards may omit it). Write semantics, not drift; the generic `CardFace<D>` states it. |
| `title` (persona-only, `persona.ts:32`) | No character column; adding one is a table change with no consumer. Stays persona-local. |
| ALL card content (`personality`/`scenario`/`greetings`/`exampleMessages`/`systemPrompt`/`postHistoryInstructions`/`depthPrompt`/V3 fields — `character.ts:88–129`) | Character-only BY DESIGN — "a persona is a one-description subset" is the owner's model (parked-options §1.1). A "shared" home with one composer is a false generalization (§9.3). |
| `handle` + the synthetic namespace (`character.ts:45`), `nickname`, snapshots (D28), the regex junction (D121-E), `metadata` (persona) | Identity/history/attachment planes — the walls, not the face. |
| DB columns + `0000_baseline.sql` | **Untouched.** The face is a contracts home; both tables already conform (§1.3). No migration either phase (§7). |

---

## 5. The walls — proving the sacred constraints, not asserting them

### 5.1 Reading B stays dead (the collision chain, receipts)

Personas-in-`characters` (any flavor: flag, kind column, table merge) puts persona rows structurally in reach of every per-`characters`-table machine: the handoff property offer copies cast cards (`D131`, `Core-Path-Registry.md:420–422`, homes incl. `domain/character/contract/handoff-copy.ts`) while **D131(G) rules "PERSONAS ARE NEVER COPIED — the pointer heals instead"** (`:436`); the fork copy allow-lists are built per-table (`D133`, `:456–458`); `{{user}}`-vs-`{{char}}` routing keys on the type boundary (`AssembleContext` carries `pinnedPersona`/`activePersona` as routed persona objects — FINAL-Persona A.1). Under B every wall becomes a `kind`-conditional carve inside shared machinery — i.e. the walls stop being structural, which is precisely what D122/D131 made them. Both phases here keep tables, ownership, resolution role, and copy rules SEPARATE; the substrate is shape, the cast is projection.

### 5.2 The pin layer is untouched — the disjointness receipt + the phase gate

The sacred suite (`tests/server/domain/chat/persona-resolution.suite.int.test.ts`) exercises, per its own import block (l.27–48): `assemblePrompt` · `buildAssembleContext` · `renderHistoryMacros` · `HistoryMacroNames` · `createChatLifecycle` · `setParticipantActivePersona` · seeds. Phase D's changed-symbol set (§6.1) intersects that list ONLY at `HistoryMacroNames`'s construction sites — and §3.5 freezes the TYPE itself. The four persona pointers (`seeds.defaultPersonaId`/`currentPersonaId`, `chat_participants.activePersonaId`, `chats.anchorPersonaId`), the seed chain, `resolvePersonasForRoster`, the anchor/active routing, and `reattributePersona` appear NOWHERE in the coupled-site inventory. **PHASE GATE (both phases): that suite passes with the FILE byte-untouched** — `git diff --stat` empty for its path AND green in the lane's named-suite run — plus the pinned-elsewhere set its header names (`assembly/context.int.test.ts` BOTH-PERSONAS describes, `assembly/macros.test.ts`, `verbs/start-chat.int.test.ts`, `verbs/edit.int.test.ts`) green unmodified.

### 5.3 The I-8 collision surface (adjacent, parked — noted so nobody re-opens it through this design)

Workboard I-8 parks the rpg persona-linkage with its RULED flavor: relations/keyed state PIN to the persona they were formed under; a swap opens parallel context, never a re-point (`docs/retro-workboard.md:1355–1361`, owner verbatim). Phase D neither touches nor decides it — and actively HELPS its future build: the cast producer's history-inclusive coverage is exactly the read that renders "the persona this relation was formed under" after a swap (since-switched personas already covered — `macro-names.ts:10`). The substrate (C) is orthogonal (shape, not keys). The build lane must not "tidy" anything in `rpg/` under this design's name.

---

## 6. Coupled-site inventory

### 6.1 Phase D (\~14 production sites + 8 test/story sites + 3 doc headers)

| # | Site | Change |
| - | - | - |
| 1 | `contracts/src/chat/producers.ts` (whole file) | entry union + policy + projections + `castKey` replace 4 entry types + 4 builders |
| 2 | `contracts/src/chat/index.ts:168–180` | re-export swap |
| 3 | `domain/chat/persistence/macro-names.ts` + `roster-avatars.ts` → `persistence/cast.ts` | ONE loader, coverage table, re-derived `@owner-scope-ok` markers; old files DELETED same commit |
| 4 | `domain/chat/contract/views.ts:170–181,191–195` | `cast` replaces the trio on `ChatDetail` + `MessagesPage` |
| 5 | `domain/chat/substrate/chat-detail.ts:36–38,54–56,92–94` | ditto the assembly of the detail |
| 6 | `verbs/read.ts:592–600` `:812–815` `:879–883` | 3 loads → 1 + projection |
| 7 | `verbs/start-chat.ts:489–498` · `verbs/invites.ts:231–240,295–304` · `verbs/fork.ts:707–716` (the returned-detail build ONLY — the D133 copy allow-lists `forkSlotValues`/`forkVariantValues` are message-plane and untouched) · `verbs/resolve-canon-window.ts:33` | same |
| 8 | `engine/engine.ts:1240–1244` `:1552–1556` (+ the `macroNames` threading `:1378–1415` unchanged in shape) | `HistoryMacroNames` built via `buildCastNameContext` |
| 9 | `substrate/backfill.ts:73–78` | same |
| 10 | `client/features/chat/surfaces/message-list-surface.tsx:129–136,269–272,369–410` | one array + two projections; draft-greeting path builds `CastEntry`s from fetched cards |
| 11 | `client/features/chat/lib/attribution.ts` (map param TYPES unchanged; the participant-first constant cites `CAST_KIND_POLICY`) · `lib/message-render-context.ts` (unchanged signature) · `lib/synth-greeting-row.ts` (adjacent draft path, verify-only) | consumer verify |
| 12 | Header truth-repairs: the 3 producer-law headers (§3.3) + `FINAL-Persona…md` A.8 gains a one-line "landed" rider + `Chat-Macro-Resolution.md` §1 pointer | docs in same commit |
| 13 | Tests re-pointed: `tests/server/domain/chat/persistence/macro-names.int.test.ts` + `roster-avatars.int.test.ts` (→ cast loader, assertions intact) · `tests/client/features/chat/lib/{attribution,message-render-context}.test.ts` · `tests/client/features/chat/_ct-stories.tsx` · `tests/kit/macro/row-macros.test.ts` (should need ZERO edits — kit frozen; a forced edit here is a design-violation tripwire) · `tests/server/domain/chat/macro-identity.suite.int.test.ts` + `verbs/edit.int.test.ts` (producer-consuming, expect no edits) | §8 |
| 14 | NEW: `tests/contracts/chat/cast.contract.test.ts` (policy totality, projections, castKey) | §8 |

### 6.2 Phase C (\~8 production sites + 3 test sites; DB verified-untouched)

| # | Site | Change |
| - | - | - |
| 1 | NEW `contracts/src/card-face/index.ts` (+ `contracts/src/index.ts` barrel) | the substrate |
| 2 | `contracts/src/persona/index.ts:11–13,55–64` | compose `cardFaceFields`; local limit constants retired at face uses |
| 3 | `contracts/src/character/index.ts:15–17,102–149,154–201` | same (face fields only; card-content untouched) |
| 4 | `domain/persona/contract/views.ts:10–16` · `domain/character/contract/views.ts:12–48` | extend `ResolvedCardFace` |
| 5 | `contracts/src/chat/producers.ts` (`CastPersonaEntry`) | structural-conformance type test vs the face |
| 6 | `domain/persona/verbs/create-from-character.ts:27–36` | optional: typed face→face projection |
| 7 | Editors — `client/features/persona/components/persona-editor.tsx` + `lib/persona-editor-model.ts` + `hooks/use-persona-form.ts`; `client/features/character/surfaces/character-editor-surface.tsx` + its components | type-ripple only; ZERO behavior — verified by their existing suites/CTs, no edits expected |
| 8 | `db/schema/persona.ts` + `db/schema/character.ts` + `db/src/migrations/0000_baseline.sql` | **VERIFIED-UNTOUCHED** (columns already conform, §1.3) |
| 9 | Tests: NEW `tests/contracts/card-face/index.contract.test.ts` (reference-equality + accept/reject table §8.5) · existing persona/character contract tests green unmodified | §8 |

---

## 7. Migration + baseline squash

**Neither phase adds, removes, or alters a column.** Phase D is producer/wire/projection; phase C is a contracts home over columns that already agree (§1.3 table). `0000_baseline.sql` is not regenerated; the `db-structure`/`structure:db-baseline` gates see no delta. This is a design POINT, not luck: the cast kind is structural (§2 row 3) and the face is already isomorphic. Consequence: both phases are ordinary commits on the regime-1 tree with no launch-day coupling (contrast `dde07f52c`, which rode the squash for `messages.kind`).

The wire DOES change shape (`macroNames`/`personaAvatars`/`characterAvatars` → `cast` on two views). Pre-launch, single-deploy, server+client in one repo: no compat shim, old fields DELETED in the same commit (the no-half-migration law). The shared-value sweep for those three literals across `tests/**` is mandatory (§8.6).

---

## 8. Test plan

1. **The sacred gate (§5.2):** `pnpm vitest run tests/server/domain/chat/persona-resolution.suite.int.test.ts` green + `git diff --stat` empty on that path; same for the header-named pinned-elsewhere set. Run COLD in the lane's named-suite floor.
2. **Producer equivalence, red-first:** BEFORE the swap, write the equivalence pin against the OLD tree — seed the `macro-names.int.test.ts` fixtures, assert `buildCastNameContext(cast)` equals the old builders' maps and `buildCastAvatarMaps(cast)` the old avatar maps. It is red on the pre-change source (the cast symbols don't exist), goes green with the loader, and the ported coverage assertions (active ∪ stamped · since-switched persona · removed-character portrait floor · empty-input no-query floor · dedup) carry over intact from both existing int suites.
3. **Totality pins:** the contract test walks `CAST_KINDS` against `CAST_KIND_POLICY` keys (the D34-style tuple↔record mirror) and against a `castKey` uniqueness/prefix table; type-level `assertNever` tails make a missing projection arm a tsc error (the existing `exhaustive-dispatch`/`no-inline-union-redecl` gates cover the dispatch idiom — zero new gate code, the D129 posture).
4. **The planted positive control (kind-readiness, §3.7):** on a scratch copy, add `"agent"` to `CAST_KINDS` → record that tsc REDS exactly the five enumerated sites (and the suite stays green when reverted). A fence that cannot fail is not a fence; this is the fence failing on demand. Scratch-only, never committed.
5. **Phase C conformance:** the reference-equality test (`Object.is(createPersonaSchema.shape.name, cardFaceFields.name)` per field/composer — red the instant anyone re-spells); an accept/reject fixture table (boundary name lengths, 100k description, bad avatar id) written against the OLD schemas FIRST and re-run against the composed ones — behavior-identity red-first by construction.
6. **Shared-value law:** repo-wide grep of `macroNames`, `personaAvatars`, `characterAvatars`, `ChatMacroNameProducer`, `buildCharacterNameMap`, `buildPersonaNameMap`, `buildPersonaAvatarMap`, `buildCharacterAvatarMap` across `tests/**` + `**/*.ct.tsx` before READY; every hit is either re-pointed or listed with why not. "No test covers this" claims carry the grep receipt.
7. **Named-suite floor for the build lane (run, not just typecheck):** the suites in §6.1 row 13 + §6.2 row 9, by path; scoped biome/eslint; ALL THREE typecheck programs; `check:structure` (the test-file moves in §6.1 row 3/13 are exactly what only it sees); `npx knip --cache` (two deleted files = last-importer risk); `depcruise` (new `contracts/card-face` module + moved persistence file). Rendered tier: the message-list CT stories re-run; one `pnpm snap` of a multi-kind transcript (character + persona + narrator rows) asserting portraits/names — done ≠ rendered.

---

## 9. Rejected alternatives (each with the why — a design without a rejected alternative was assumed)

1. **Reading B / full-table merge (`entities` + kind column).** Direct collision with owner law, not a trade-off: D131(G) "personas never copied" vs the per-`characters` copy machinery (§5.1); the four-pointer pin layer re-keyed onto character ids; the D133/D134 allow-list ratchets rebuilt with kind-conditionals. Every "win" it offers (one cast producer, one face home) is delivered by D+C without touching identity. OFF THE TABLE per the owner; recorded here so the next reader sees the chain, not just the verdict.
2. **A stored `cast kind` / any per-row column.** The message-identity precedent argued FOR a column because purpose was un-derivable from degradable stamps; cast-kind IS the stamp's id-space — a column would be a second spelling of `characterId`/`personaId`, violating derive-don't-stamp (§2 row 3).
3. **The full-card substrate (persona composes a subset of a shared card-content shape).** The plausible-maximal arm, rejected: card content has ONE composer (character) — a "shared" home with one occupant is a false generalization that re-creates B's framing at the type layer ("a persona is a card minus fields") and couples persona's contract to V2/V3 card-spec churn for zero consumers. The face (4 fields, 2+ composers today, 3 with agent) is the honest overlap. Presented as §10 fork 3 because the task's wording ("+ the card-content fields") admits both readings.
4. **Keep the wire split (3 arrays), only merge the loaders.** Preserves the 2-kinds × 2-facets matrix at exactly the tier the agent arm multiplies (views, client map-building, merge contracts). The wire envelope was never the names-only law's mechanism (§3.3) — keeping it buys nothing but the rework A.8 warned about.
5. **Overload `SpeakerRef`/`speakerKey` as the cast entry.** `SpeakerRef` is the DRIVE axis (AI-driven speakers, arbitration targets — `participants.ts:34–43`); personas are cast members but never speakers. Collapsing membership into drive re-creates the overload the agent design §1 unwound. Shared key NAMESPACE yes (§3.8), shared type no.
6. **Home the substrate/entries in kit.** The D129 home test verbatim (`participants.ts:6–10`): reachability decides, and no kit engine dispatches on cast entries or the face — kit's macro atom consumes its own avatar-free name types and must keep doing so (that IS the names-only law). Kit placement would also strand zod authoring limits below the layer that owns them.
7. **One combined phase.** D and C touch disjoint surfaces (resolution vs authoring contracts) and gate differently (D re-points 14 sites; C is type-compose + conformance). Sequencing D→C keeps each leg's sacred-gate run attributable — and D alone relieves the papercut if the owner parks C.

---

## 10. Owner forks (each with a stated default; the build lane proceeds on the un-forked remainder)

1. **Phase C timing — with or after agent-principal?** **Recommend: after D, independent of agent-principal, BEFORE the agent wave.** The face is kind-independent; shipping it first hands `AgentCardView` a home instead of a third spelling. Waiting for agents couples a pure shape-hygiene leg to the largest parked build for no exchange. (D itself is already ruled next-step — parked-options §1.5 + A.8; the "land WITH agent-principal" clause in A.8 is superseded by the owner's Option-D-now direction that commissioned this design; the build lane's D-entry records that supersession.)
2. **Substrate home — kit or contracts?** **Recommend contracts** (`@orb/contracts/card-face`), by the D129 reachability test (§9.6). Kit only if a kit engine ever consumes the face — none does or should.
3. **Face scope — the 4-field overlap, or the full-card substrate?** **Recommend overlap-only** (§9.3). If the owner intends "card-content fields" literally, that is arm §9.3 and the design degrades to it cleanly — but its second composer never arrives, and I recommend against.
4. **Character-arm description in the cast entry?** **Recommend NO** (§3.6 — a new member-visible surface for card content needs its own ruling; nothing consumes it). One-line additive later if a surface earns it.
5. **The D-entry.** The build lane mints D137+ (next free per the registry header). Draft clause, for his eye: *"D137 — THE CAST IS KIND-POLYMORPHIC AT THE RESOLUTION LAYER; THE CARD FACE HAS ONE HOME. (a) A chat's referenced identities are served by ONE kind-discriminated cast producer (`CAST_KINDS` + `CastEntry` + `CAST_KIND_POLICY`, contracts/chat) over the active ∪ stamped coverage; per-kind projections keep the macro path names-only BY TYPE (kit's avatar-free entry types are the law's mechanism). Cast kind is STRUCTURAL (the stamp columns' id-space) — never a stored column (derive-don't-stamp; contrast D129, where purpose was un-derivable). The `agent` arm (D60) is a one-arm add whose decision sites are compile-forced. (b) The four-field card face (name/description/starred/avatarAssetId) has ONE home, `@orb/contracts/card-face`, composed by persona + character (+ future agent views); description nullability stays per-composer (write semantics, not drift). (c) The walls are untouched and re-affirmed: tables/ownership/copy rules/pin semantics stay separate — personas are never copied (D131(G)), the pin layer is D122's, and no substrate or producer may carry a persona row across a room boundary. Phase gate: `persona-resolution.suite.int.test.ts` byte-untouched and green."*

---

## 11. Build sequencing (for the lane that executes after the ruling)

- **Leg D1:** contracts (`producers.ts` rework + tests §8.3) + persistence (`cast.ts`, old files deleted, int tests re-pointed §8.2's red-first equivalence FIRST).
- **Leg D2:** wire + server call sites (§6.1 rows 4–9) + client (rows 10–11) + header truth-repairs (row 12) + the sacred-gate run + §8.6 sweeps + §8.4 planted control. ONE commit per leg, stacked.
- **Leg C1:** `card-face` module + composers + conformance tests (§8.5) + view extends. ONE commit.
- Each leg's floor: §8.7 verbatim. The whole-tree battery stays the orchestrator's.
- Security posture: no auth/session/crypto surface is touched; the one trust-boundary DECISION (§3.6) is resolved fail-closed in-design. If the owner flips fork 4 to YES, that leg routes through security review (a member-surface widening), per the dispatch rules.

## 12. Declared limits

- I did not read `verbs/turn.ts` / `assembly/shape.ts` in full this session; their producer contact is via `HistoryMacroNames`/`renderHistoryMacros` (frozen, §3.5) and the sacred suite pins the behavior. If the build lane finds a fourth map consumer outside §6.1, the inventory was short — report, don't improvise.
- The CT-story/test edit counts in §6.1 row 13 are LEADS from the ast-grep sweep (files named), not line-verified diffs.
- `_ct-stories.tsx` and the message CT suite were not executed this session (design-only lane); the build lane's floor names them.
- The A.8 rider claim in fork 1 (that owner direction supersedes "land WITH agent-principal") is my reading of this lane's commission; the owner's ruling on this doc confirms or corrects it — that is what §10 is for.
