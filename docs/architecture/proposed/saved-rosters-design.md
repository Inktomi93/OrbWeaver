# Saved Rosters — named party presets over the built roster (B6)

> **Status: COMMITTED (D61, 2026-07-01).** The Marinara-Residue B6 row is CLOSED. The ledger D61
> entry is the decision record and wins on any conflict; this doc is the authoritative build
> design. Evidence floor (one line): marinara's `character_groups` table
> (`db/schema/characters.ts:92-101` — id/name/description/avatarPath + a **JSON array of
> character ids**, no FK, no owner, no per-member config) + its CRUD in
> `characters.storage.ts:649-691`. Orbweaver's roster system (chat.md Part III) is categorically
> bigger than marinara's group model — the residue doc §4 records that B6 is the ONLY group
> borrow. This is deliberately a SMALL feature: a named, reusable cast you can drop into a new
> chat. It adds no arbitration, no membership semantics, no chat state.

---

## 0. What this IS (and isn't)

A **roster preset** is an owner's saved answer to "which characters, with which knobs, do I keep
assembling into rooms?" — a library artifact like a generation preset, consumed at chat-start
(and additively on existing chats). It is **not** a group, not a membership record, not a second
roster: the chat's `chat_participants` roster (D16) remains the ONE runtime home; a preset is a
stamp/template that DRIVES the existing verbs and is never read at turn time.

**Non-goals (recorded):** human members in presets (humans join via the invite chokepoint —
Part III §2 — never via a template); per-member personas (personas are per-HUMAN; characters
don't carry them — the only persona a preset touches is the chat-level `anchorPersonaId`);
preset-level room overrides (the four-field allowlist is host room state, not cast identity —
wanting them saved is a flip criterion, below); marinara's `persona_groups` sibling (nothing
consumes it there; no want here).

## 1. Derive-vs-stamp (the D23 call, per the rule gallery-design just recorded)

`roster_presets` is a **true producer** — the row IS the user's authored artifact (a name + a
curated list) with **no owned anchor**: its character references are a LIST via a junction, so
there is no single required FK through which the owner derives (the D23 test — "can you reach
the row's owner by following ONE FK to an owned entity?" — answers NO). Per the general rule
recorded in `gallery-design.md` §10 flag 1 (*"only true producers — rows that ARE the user's
authored artifact with no owned anchor (characters, personas, presets, documents, themes) —
stamp `ownerId` + `fetchOwned`"*): **`roster_presets` stamps `ownerId`**;
**`roster_preset_members` DERIVES** through its required `presetId` FK (no `ownerId` column —
stamping it would mint the guardable-mismatch state D23 exists to kill).

## 2. Schema (`@orb/db/schema/roster-preset.ts`; rides `0000_baseline` if still open — the
gallery §1.3 born-compliant gate, verbatim; else a normal additive migration)

```ts
export const rosterPresets = sqliteTable(
  "roster_presets",
  {
    id: text("id").$type<RosterPresetId>().primaryKey(), // ID_PREFIX.rosterPreset = "roster_preset"
    ownerId: text("owner_id").$type<UserId>().notNull()
      .references(() => users.id, { onDelete: "cascade" }), // §1: true producer — stamped
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    /** Chat-open {{user}} POV to apply at start (StartChatParams.anchorPersonaId). Nullable;
     *  a deleted persona degrades the preset, never blocks it. */
    anchorPersonaId: text("anchor_persona_id").$type<PersonaId>()
      .references(() => personas.id, { onDelete: "set null" }),
    /** OPTIONAL room-behavior payload: a GroupConfigInput blob (parsed by zod at write AND at
     *  apply — the stored blob is lenient input, chat's setGroupConfig owns defaulting). NULL =
     *  the preset carries cast only; chat's DEFAULT_GROUP_CONFIG applies. */
    groupConfig: text("group_config", { mode: "json" }).$type<GroupConfigInput>(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [uniqueIndex("roster_presets_owner_name_unique").on(t.ownerId, t.name)],
);

export const rosterPresetMembers = sqliteTable(
  "roster_preset_members",
  {
    presetId: text("preset_id").$type<RosterPresetId>().notNull()
      .references(() => rosterPresets.id, { onDelete: "cascade" }),
    characterId: text("character_id").$type<CharacterId>().notNull()
      .references(() => characters.id, { onDelete: "cascade" }), // real FK — never marinara's JSON array
    position: integer("position").notNull(), // founding-cast order (greet order, HUD order)
    /** Per-member knobs, applied via the EXISTING participant-control verbs at apply time.
     *  NULL talkativeness = leave chat's default (TALKATIVENESS_DEFAULT). */
    talkativeness: real("talkativeness"),
    disabled: integer("disabled", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.presetId, t.characterId] }),
    index("roster_preset_members_character_idx").on(t.characterId),
  ],
);
```

**WHY a junction, not marinara's JSON id-array:** boundaries are physics — a deleted character
CASCADEs out of every preset (marinara's arrays silently rot into dangling ids); the FK is typed;
per-member config has a home. **WHY `unique(ownerId, name)`:** a preset is picked by name in the
new-chat flow — duplicate names are a UX trap, and rename-on-conflict is cheap.
**WHY `groupConfig` is a nullable blob, not columns:** it is exactly chat's `GroupConfigInput`
(`@orb/contracts/chat`) — re-columning a sibling domain's fully-zod-defaulted config would be a
second home for that shape; the blob is parsed by `groupConfigSchema` at every read/write seam
(the zod-at-the-seam pattern), and chat's own `setGroupConfig` re-parses at apply, so a stale
blob after a GroupConfig evolution degrades loudly at apply, never silently at assemble.
*Rejected:* FK'ing a preset to a "template chat" (deriving the cast from a real chat's roster) —
couples library data to membership-scoped chat lifecycle (archiving/deleting the chat would
orphan the preset) and violates the library-vs-room line this feature exists to respect.

**Deletion semantics (the test surface):** character deleted → member row gone, preset survives
smaller; persona deleted → `anchorPersonaId` NULL; owner deleted → everything CASCADEs; preset
deleted → members CASCADE, **chats already started from it are untouched** (a preset is a stamp,
not a live link — no back-reference column on `chats`, deliberately).

## 3. Home + verbs

**Home — DECIDED: a small `domain/roster-preset` leaf.** *Rejected:* `domain/chat` — the store
is owner-scoped LIBRARY data (`OwnedTable`/`fetchOwned` class) while chat is explicitly
membership-scoped with no `ownerId` anywhere (D18; chat.md Part III §1 names the two categories
as disjoint), and chat.md's standing goal is a SLIM chat domain (crew/rpg both stayed out for
the same reason). *Rejected:* `domain/preset` — the partitioning rule scopes preset to
"generation config only (params/sections)"; overloading it with an unrelated preset-kind breaks
one-home naming. *Rejected:* `domain/character` — a cast list is not character identity;
marinara only put `character_groups` in its characters schema because it has no domain
boundaries at all. The leaf is tiny (like `notifications`, `tag`) and that is fine — 8-slot
template, standard layout (`contract/`, `verbs/` one-per-file, `persistence/` the only db
writer; no subsystems).

```ts
RosterPresetService = {
  create(params: { name; description?; anchorPersonaId?; groupConfig?;
                   members: { characterId; talkativeness?; disabled? }[] } & ActorParams): Promise<RosterPresetView>
  update(params: { presetId; /* same fields, full-replace member list */ } & ActorParams): Promise<RosterPresetView>
  remove(params: { presetId } & ActorParams): Promise<void>
  list(params: ActorParams): Promise<RosterPresetSummary[]>          // owner-scoped, name-sorted
  get(params: { presetId } & ActorParams): Promise<RosterPresetView> // members in position order
  /** Additively applies the preset to an EXISTING chat the actor HOSTS — drives the existing
   *  roster verbs via injected ops; never a second add path (§4). */
  applyToChat(params: { presetId; chatId } & ActorParams): Promise<ApplyRosterPresetResult>
}
```

Wire shapes in `@orb/contracts/roster-preset` (zod; `RosterPresetView` = row + ordered members;
`ApplyRosterPresetResult` = `{ added: CharacterId[]; alreadyPresent: CharacterId[];
configApplied: boolean }`). `create`/`update` validate every `characterId` via `fetchOwned`
(a member row must never reference another user's character — the gallery `addToGallery`
posture), parse `groupConfig` through `groupConfigSchema` (store the INPUT, reject garbage at
write), clamp members 1..MAX (lean: 25 — matches nothing structural, just a sanity rail;
constant, not magic), and stamp `position` from array order.

## 4. `applyToChat` + the new-chat flow (never a second add path)

**The two consumption modes:**

1. **New chat (the primary UX):** the client's new-chat flow reads the preset (`get`) and calls
   the EXISTING `chat.startChat({ characterIds: members-in-position-order, anchorPersonaId })` —
   startChat is the founding-cast owner (greeting/opening semantics, the lazy roster creation;
   `StartChatParams` already takes exactly these fields) — then calls
   `applyToChat({ presetId, chatId })` for the per-member knobs + `groupConfig`. Two calls is
   CORRECT here, not torn-state risk: call 1 alone yields a fully valid chat (the polish call
   failing loses only talkativeness tweaks, retryable idempotently) — unlike gallery's
   `importGif` one-call rule, where the two-call split left a torn invariant (stored-but-not-
   curated). *Rejected:* a `startFromPreset` verb on EITHER domain — on chat it teaches chat
   about presets (chat stays preset-blind, the crew-blind precedent); on roster-preset it means
   injecting `startChat` + re-exposing its whole result surface through a wrapper (a shell verb).
   *Rejected:* stuffing per-member knobs into `StartChatParams` — widening chat's contract for
   one consumer's convenience.
2. **Existing chat:** `applyToChat` alone — additive merge.

**`applyToChat` mechanics:** resolve the preset (`fetchOwned`) → for each member not already on
the roster, call the injected **`chat.addCharacterToChat`** op (the ONE character-participant
insert chokepoint, D16 — host-gated inside chat, so authority is chat's `requireHost`, not
re-implemented here) → for each member with knobs, injected `chat.setParticipantTalkativeness` /
`chat.setParticipantDisabled` → if the preset carries `groupConfig`, injected
`chat.setGroupConfig` (parse-at-apply; a preset WITHOUT one never clobbers the chat's config).
**Additive only** — never kicks a participant the preset doesn't list (destructive sync is a
rejected foot-gun; the host prunes by hand). **Idempotent** — re-apply is a no-op plus knob
re-stamps. Skipped/missing members (character deleted since save) are reported in the result,
never an abort. **Order:** members are applied in `position` order (join order is visible in
the roster UI).

**Injection model:** `RosterPresetContext` carries
`{ db, chat: { addCharacterToChat, setParticipantTalkativeness, setParticipantDisabled,
setGroupConfig } }` — op TYPES declared in this domain's `contract/service.ts`, wired at compose
from chat's front door (`domain-no-cross-feature` backstop; roster-preset never imports chat).

## 5. `can()` (owner-scoped ×2)

CRUD/list/get: **owner-only** (`fetchOwned` on the stamped `ownerId` — §1). `applyToChat`:
**preset owner ∧ target-chat HOST** — the first check is this domain's `fetchOwned`; the second
is NOT re-implemented: the injected chat ops are host-gated inside chat (the actor's Principal
rides the ops), so a non-host apply fails at the chokepoint with chat's own error. No
member-ring read of someone else's presets, no sharing in v1 (*flip criterion:* if "share a
party with the room" materializes, it is a new D-entry riding the D22 visibility machinery, not
a default).

## 6. Client sketch (Phase 6 — a picker, not a surface)

- **New-chat flow:** beside the character multi-select, a "Start from party…" picker
  (`list` → name + member-avatar stack + count). Picking one pre-fills the cast selection
  (members in order, missing-character rows flagged) + the anchor persona; the user can still
  edit before `startChat` fires; then the `applyToChat` polish call runs (silent on success,
  toast on partial: "2 knobs skipped — Rin was deleted").
- **Roster panel:** a "Save as party…" action on any chat the user hosts — snapshots the
  CURRENT character roster (+ talkativeness/disabled + the chat's `groupConfig` + anchor) into
  `create` with a name dialog. This is the main authoring path (author-by-example beats a
  from-scratch form); a small library management list (rename/description/delete, member
  reorder via drag) lives under the library area.
- **Existing chat:** "Add party…" in the roster panel → picker → `applyToChat` → result toast
  ("Added 3, 1 already here").

States: empty library (the picker hides), missing members (row badge), non-host apply (the
action is hidden — capability-driven, the D16 precedent).

## 7. Build chunk + tests

**One server chunk (RP1, size M):** schema + brands (`ID_PREFIX.rosterPreset`) + contracts +
the leaf + verbs + compose wiring + tests. **One client chunk (RP2, size S–M, Phase 6):** §6.
No workloads, no events, no indexer involvement (presets carry no embeddable content — a name
and FKs; discovery/search never see them).

**Test plan:**
- FK physics: delete a member character → member row gone, preset + siblings survive; delete
  the persona → anchor NULL; delete the preset → members gone, a chat started from it untouched.
- Ownership: create/update with another user's `characterId` rejected; B never lists/gets/
  applies A's preset; `unique(ownerId, name)` conflict → typed error (same name allowed across
  owners).
- `groupConfig` seam: garbage blob rejected at `create`; a valid narrator-arm blob round-trips
  and `applyToChat` lands it via the real `setGroupConfig` (fully-defaulted stored result —
  chat's own invariant, exercised through the injection).
- Apply semantics: fresh chat → all added in position order + knobs stamped; re-apply → no
  duplicate participants (the `(chatId,userId)`/character chokepoint holds), knobs re-stamped;
  preset-sans-config never touches the chat's existing `groupConfig`; a deleted-member preset
  applies the survivors and reports the skip; non-host actor → chat's authority error surfaces
  (asserted THROUGH the injected op, proving no second authority path exists).
- No-second-path: `domain/roster-preset` contains no `chat_participants` write (structural:
  its `persistence/` touches only its two tables; dep-cruiser backstop).

## 8. Cross-refs

`domains/chat.md` Part III (the roster, `startChat`, the participant chokepoint, GroupConfig) ·
`@orb/contracts/chat` (`groupConfigSchema`/`GroupConfigInput`/`DEFAULT_GROUP_CONFIG`) ·
`Core-Laws-and-Precedents.md` D16/D18/D22/D23 · `gallery-design.md` §10 flag 1 (the
producer-vs-derive rule §1 applies) · `Marinara-Residue-Non-RPG.md` §1 B6 + §4 (the
validation record: B6 is the only group borrow).
