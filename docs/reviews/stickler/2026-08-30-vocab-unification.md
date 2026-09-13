---
kind: review
status: draft
updated: 2026-08-30
---

# Vocabulary unification proposal — roster / cast / party (lane cb-vocab-design)

> **THIS IS THE FROZEN DERIVATION, NOT THE LIVE MAP.** The word→concept assignment now lives at
> [`../../design/vocabulary-map.md`](../../design/vocabulary-map.md) (`status: active`, minted #914) —
> **read your word off THAT file, never off §1/§3 below.** §3's tables SAMPLE, and three rename waves
> each worked from a different slice of them; the union of the slices did not cover the tree, which is
> the whole defect #914 exists to close. What survives here is the derivation, the pricing and the
> eight owner forks.

The word→concept assignment the owner rules on. Input: the census
`docs/reviews/research/2026-08-30-vocab-roster-cast.md` (five user-facing meanings, twelve code
meanings, the ranked muddle list). This document does what the census deliberately did not: it
**assigns**, top-down from the architecture, and prices the arms.

**Three owner directives are folded in and are binding on everything below:**

1. **The map is derived TOP-DOWN.** The vocabulary follows the package cake and the tier flow; it does
   not ratify incidental bottom-up usage. §1 is that map; §3 classifies every current usage against
   it as conforming or deviant, and that classification IS the migration list.
2. **NO CUTE NAMES.** Plain, functional, boring words that say what the thing is. Existing cute
   residue counts *against* keeping a word, never for it. Receipt for the register:
   `docs/history/design/interaction-substrate-spec.md:23` — *"No anthropomorphized / cutesy feature
   framing, ever. Features are named for what they do."* (owner ruling, folded at commissioning).
3. **RPG's vocabulary is ratified in place, with ONE carve-out.** Party / npcs / everyone, the tracker
   carriers, the in-game register generally: a game surface is supposed to speak game words. The
   carve-out is rpg's **`cast`** (the scene-NPC `RpgCastRef` / `castKey` / `cast:<slug>` axis), which
   the owner returned to scope on seeing it is a fourth meaning of the word one package from the other
   three.

**Headline.** The muddle is not twelve independent naming accidents. It is **two structural errors
repeated**: (a) one word ("cast") was given to four genuinely different concepts because none of them
had been named for what it *is*, and (b) a game-register word leaked outward while a plain word
("roster") leaked inward. Fix those two and ten of the twelve code meanings resolve as a consequence.
The single highest-value finding in this document: **the D137 comment fence exists only because two
different concepts share a stem. Name them for what they are and the fence becomes unnecessary — the
compiler enforces what a comment currently asks agents to remember.**

---

## §1 THE MAP — what lives where, derived top-down

Read down the cake. Each row: the concept, the tier that OWNS it, the one word, who may consume it
downstream, and the word the user sees (if any). A concept with no user-facing surface says `—`.

### §1.1 The room's actors

The owner already closed this vocabulary: **characters, personas, host/members — no new named entity
kinds** (`docs/history/design/interaction-substrate-spec.md:24-25`). Everything here derives from that,
not from me. (Status caveat: that doc is `status: archived`, superseded 2026-08-24 by
`docs/design/interaction-direction-spec.md`, which does NOT restate the clause. The *no-cutesy* half
was re-ratified by the owner today; the *closed-vocabulary* half is *Fork 7*.)

| # | Concept | Owning tier / home | THE WORD | Downstream consumers | User-facing word |
| - | - | - | - | - | - |
| 1 | A library character | `db/schema/character` → `contracts/character` → `domain/character` | `character` | everyone | **Character** |
| 2 | A library persona | `db/schema/persona` → `contracts/persona` → `domain/persona` | `persona` | everyone | **Persona** |
| 3 | The humans in a room | `db chat_participants(kind='human')` → `ParticipantView` | `member` / `host` | chat, transport, client | **People** (section) · **Host**/**Member** |
| 4 | **The characters seated in a room** | `db chat_participants(kind='character')` → `ParticipantView` → `domain/chat` → `features/chat` | **`character`** | chat, assembly, rpg, client | **Characters** (section) |

Row 4 is the load-bearing assignment. It is a *subset of participants*, discriminated by a column that
already says `character`. There is no license under the closed vocabulary for a fifth word, and the
sibling section proves the construction: "People" = the people in this room, so "Characters" = the
characters in this room. Context disambiguates against the library exactly as it already does for
People.

### §1.2 The chat tier's derived reads

| # | Concept | Owning tier / home | THE WORD | Downstream consumers | User-facing word |
| - | - | - | - | - | - |
| 5 | Every identity the chat *references* (characters ∪ personas, incl. departed) — the name/avatar directory | `contracts/chat/producers.ts` + `domain/chat/persistence/cast.ts` (D137) | **`identity`** (`ChatIdentity`, `identityKey`, `ChatDetail.identities`) | client render chrome, assembly macro path | — |
| 6 | Present, seated characters the arbiter may drive (D60 DRIVE axis) | `domain/chat/assembly/context.ts` | **`character`** (= row 4, at assemble time) | assembly, arbiter | — |
| 7 | The room's human count + character appearance overrides | `contracts/chat/roster.ts` `CarriedAppearanceCast` | **`CarriedAppearance`** (drop the stem) | chat read verbs, client | — |
| 8 | The present characters' attached regex scripts (regex TIER) | `domain/chat/contract/regex.ts` | **`character`** (its table IS `character_regex_scripts`) | `substrate/regex-tier.ts` | — |
| 9 | Name arrays for the macro/speaker engines | `kit/macro/row-macros.ts`, `kit/speaker-label` | **`characterNames`** | macro engine, speaker split | — |

**Rows 5 and 6 are the fence.** D137(F) currently keeps them apart with prose
(`Core-Path-Registry.md:479`; restated at `domain/chat/persistence/cast.ts:18-20`). They are not
near-synonyms needing a fence — they are two plainly different things: row 5 answers *"what is id X
called"*, row 6 answers *"who can speak next"*. Rows 6, 8 and 9 are all the SAME concept as row 4 at
different tiers, and correctly share its word; row 5 is the odd one and takes its own. Once row 5 is
`identity` and row 6 is `character`, the fence is structural.

### §1.3 The library artifacts

| # | Concept | Owning tier / home | THE WORD | Downstream consumers | User-facing word |
| - | - | - | - | - | - |
| 10 | A saved, named, reusable set of characters + seat knobs + captured rules | `db roster_preset*` → `contracts/roster-preset` → `domain/roster-preset` → `transport rosterPreset` → `features/roster-preset` | **`rosterPreset`** (code) | client library surface, chat apply | **Roster** / **Saved rosters** |
| 11 | Your whole character library | `domain/character` list verbs → `features/character` | `character` | — | **Your characters** |

Row 10's word is chosen by *counting registries, not taste*. Five registries name this artifact; **four
already say `roster-preset`** — the db table family, the `RosterPresetId` brand + `ID_PREFIX`, the tRPC
router key, and the domain + contracts + client directories. Two deviants say `cast`
(`CAST_COLLECTION_ID = "cast"`, `MODAL_SLOT_IDS "savedCasts"`). Top-down, the cheap and structurally
honest move is to make the two deviants conform, never to rename the four.

**"Party" is dead for this concept, by derivation not by preference.** `party` is a ratified RPG
tracker-carrier class (`contracts/rpg/enums.ts:81`). Using it for a non-game library artifact is
exactly the register violation §2 bans. That kills the word the server tier currently uses in ~12
prose sites — which is a *result of the map*, not an opinion.

### §1.4 The rpg domain (ratified, with the one carve-out)

| # | Concept | Owning tier / home | THE WORD | Downstream consumers | User-facing word |
| - | - | - | - | - | - |
| 12 | Tracker carrier classes | `contracts/rpg/enums.ts` | `party` / `npcs` / `everyone` | rpg only | **Party** (in-game) |
| 13 | **A scene-only NPC (no card, slug-keyed, promotable)** | `contracts/rpg/actor.ts` | **`npc`** *(carve-out — currently `cast`)* | rpg only | in-game |
| 14 | A future cross-game NPC library row (`rpg_npcs`) | reserved, unbuilt | **needs a new word** — `npc` is being claimed by row 13 | — | — |

Row 13's word is forced by rpg's *own already-ratified* vocabulary: the tracker-carrier class for
exactly this set is `npcs`. The domain currently pays for the mismatch with a live translation line —
`domain/rpg/chat-ops/tracker-view.ts:81` `kind: ref.kind === "cast" ? "npcs" : "party"` — which
renaming row 13 **deletes**. Row 14 is the constraint that makes this a fork rather than a decision:
see §5 Fork 3.

### §1.5 Identity / plugin / generic

| # | Concept | Owning tier / home | THE WORD | Downstream consumers | User-facing word |
| - | - | - | - | - | - |
| 15 | The asker's membership role fed to `can()` | `contracts/identity/index.ts` | **`ChatMembership`** (currently `ChatRoster`) | `can()`, admin guard, chat, tool-use | — |
| 16 | The plugin host's character-seat read | `contracts/plugin/host-v1.ts` | **`chat.listCharacters`** (currently `listRoster`) | third-party plugins (versioned) | plugin authors |
| 17 | Any generic "a list of X" | wherever it lives | **`XList`** — never `roster` | — | — |
| 18 | The branded-id type coercion | `kit/src/ids/index.ts` | `castId` — **not the concept; see Fork 4** | everyone | — |

Row 15: `ChatRoster` is `{ readonly role: ParticipantRole }` — one field, verified at
`contracts/identity/index.ts:73-75`. It is a membership verdict input, not a list. A cold agent reading
`resource.roster` expects `ParticipantView[]`.

Row 17: `roster` becomes a *reserved* word for row 10 and may not be spent as generic English for "a
list". Eight symbols currently spend it (§3).

---

## §2 THE REGISTER BOUNDARY (a map row in its own right)

**The rule.** Game-flavored vocabulary — `party`, `npcs`, `quest`, `encounter`, `journal`-as-game-log —
lives inside the rpg domain and its surfaces, and may **never** name a non-game concept. Conversely, an
rpg surface naming a *chat* concept uses the chat word (that is what makes `promoteActor`'s destination
legible).

**Scope (the fence).** `packages/*/src/**/rpg/**`, `packages/client/src/features/rpg/**`,
`packages/client/src/agent-seed/**`, `tests/**/rpg/**`.

**Enforcement tier.** The constitution (§2.3) requires every placement to name its enforcer, and *"a
prose-only boundary is not a placement — it's a wish."* Dep-cruiser cannot hold this (it is about
names, not imports). The right tier is a **structural gate**:

- Gate name: `rpg-register-fence`, home `tooling/src/verify/gates/`.
- Arm: a small closed denylist (`party`, `parties`, `npc`, `npcs`, `quest`, `encounter`) checked
  against **identifier positions and user-copy string literals** outside the fence scanRoot.
- **Mandatory false-stem fence:** `third-party` / `first-party` are pervasive and legitimate — I
  counted ~15 live `first-party` sites in `contracts/plugin` alone plus 19 `third-party` (census §0).
  The gate needs an explicit `\b(third|first)-party\b` exclusion or it is dead on arrival.
- Escape: a line-adjacent marker with a reason (the house marker grammar), per `GATE-AUTHORING.md`.
- Landing bar: the six-case real-tree probe `GATE-AUTHORING.md` mandates, and it lands on a FIXED tree
  (the §3 deviants resolved), never with parked violations.

Priced in §4 as its own lane. If the owner declines the gate, the honest alternative is to state the
boundary in the constitution and accept that it is unenforced — say so explicitly rather than pretend.

---

## §3 CLASSIFICATION — conforming vs deviant (this IS the migration list)

Every count below is either re-derived by me in this session (marked **\[rd]**, method in §6) or cited
from the census (marked **\[c]**). Scope for **\[rd]** counts is `packages` + `tests` unless stated.

### D1 — User-facing copy, the room (map rows 4, 10)

| Site | Current | Deviant because | Target |
| - | - | - | - |
| `members-panel.tsx:309-311` | kicker `Cast` | row 4 word | `Characters` |
| `members-panel.tsx:286` | `aria-label="Members and cast"` | row 4 word | `"Members and characters"` |
| `members-panel.tsx:314` | *"add one to give the room a cast"* | row 4 word | *"…add one."* |
| `committed-members-tab.tsx:141` | button `Add cast…` → `openModal("savedCasts")` | **row 10 word rendered inside a row-4 section** | `Add roster…` |
| `chat-cast-bar.tsx:100` | `aria-label="Cast"` | row 4 word | `"Characters"` |
| `chat-options-menu.tsx:157,166` · `data/use-start-chat.ts:4` | *"New chat with same cast"* | row 4 word | *"New chat with the same characters"* |
| `group-config-form.tsx:109` | *"How the cast replies"* | row 4 word | *"How the characters reply"* |
| `features/chat/lib/roster.ts:71` | `castSectionVisible` | row 4 word | `charactersSectionVisible` |
| `lib/member-rows.ts` | `MemberCastRow`, `toCastRows` | row 4 word | `MemberCharacterRow`, `toCharacterRows` |

**M1, re-verified and REFINED.** The census's sharpest finding holds — `members-panel.tsx:308-313`
renders the kicker `Cast` and, inside the same `<Row>`, the `castAction` slot, which
`committed-members-tab.tsx:139-142` fills with a button reading **`Add cast…`** that opens
`openModal("savedCasts")` → the **"Saved casts"** library (`saved-casts-modal.tsx:18`). Two meanings of
one word, one click apart. **Refinement the census missed:** the *sibling* half of that same Row was
already fixed four hours earlier. `add-member-popover.tsx:22-35` (#848, landed `72e0d01b4`, committed
and clean) records that this trigger was icon-only and sat 4px from "Add cast…", and the house's chosen
remedy was **a visible noun on each door**. That is a live precedent pointing straight at this
proposal: the resolution mechanism the house already picked for this exact Row is *distinct nouns*, and
"Add cast…" under a header saying "Cast" is the half that remedy did not reach.

### D2 — User-facing copy, the saved-roster library (map row 10)

25 rendered strings, all deviant, all in `features/roster-preset` + three callers **\[rd]**:
`cast-picker.tsx:122,187,188,208,291,322,324,331,334,335,340,385` · `cast-collection.tsx:26,29,35` ·
`cast-group.tsx:21,26` · `cast-member-surface.tsx:57,139,142` · `cast-collection-rows.tsx:37` ·
`saved-casts-modal.tsx:18,19` · `use-roster-preset-mutations.ts:16,22,28,34` ·
`use-saved-casts.ts:29,50,104` · `new-chat-picker-surface.tsx:141` · `authed-app.tsx:319` ·
`cast-copy.ts:7`.

Sample of the target: "Saved casts" → **Saved rosters** · "New cast" → **New roster** · "Cast name" →
**Roster name** · "Save current cast" → **Save this room's roster** · "Delete this cast?" → **Delete
this roster?** · "No saved casts yet" → **No saved rosters yet** · "Start from saved cast" → **Start
from a saved roster**.

Note `cast-member-surface.tsx:139,142` renders **"Cast name"** and **"Cast description"** as the
*template's* name/description fields — arguably the second-worst site after M1, and **it has zero test
pins** (`"Cast name"` → 0 pins, `"Cast description"` → 0 pins **\[rd]**).

### D3 — User-facing copy, the character library (map row 11)

5 sites **\[c, spot-checked rd]**: `characters-section.tsx:56` *"Your cast lives here…"* · `:137` *"Open
someone from your cast…"* · `character-library-welcome.tsx:166` *"Loading your cast…"* · `:167`
`label="your cast"` · `:277` `title="Meet the cast"`. Target: *"Your characters live here"*, *"Loading
your characters…"*, *"Meet your characters"*. One test pin (`"Meet the cast"` → 1 **\[rd]**).

### D4 — The two deviant registry ids (map row 10)

| Site | Current | Target | Hazard? |
| - | - | - | - |
| `state/config-group-ids.ts:34` + `lib/cast-collection.tsx:15` `CAST_COLLECTION_ID` | `"cast"` | `"rosterPreset"` | **NO — see below** |
| `state/modal-slot-ids.ts:54` | `"savedCasts"` | `"savedRosters"` | none (in-memory slot id) |

**The brief's named hazard on this id is REFUTED, on the file's own testimony.** The concern was
"per-device disclosure store keys on it". Two receipts:

- `state/config-group-open-store.ts:17-19` (its own header): *"The stored shape is an id LIST, not a
  total Record: a persisted id that no longer registers (a retired group, an older spelling) costs one
  dead array member and is dropped on the next toggle — the sanitizer keeps only live
  `ConfigGroupId`s."* `sanitizeIds` is `v.filter(isConfigGroupId)`. The store also already carries a
  key-rename `migrate` precedent (`openKinds` → `openIds`).
- `state/config-selection-store.ts:10`: *"Not persisted — landing back on the workspace welcome after a
  reload is fine."*

So renaming this id costs **one collapsed group, on one device, once**, and self-heals on the next
toggle. It is a free rename, not a migration. The `data-collection` DOM attribute the CTs address is
the real coupled site (a literal sweep of `tests/` for `data-collection="cast"`), not the storage.

`savedCasts` **\[rd]**: 19 occ / 9 files.

### D5 — The chat contract seam (map rows 5–9) — the fence dissolver

| Symbol | occ / files **\[rd]** | Target |
| - | - | - |
| `CastEntry` | 69 / 24 | `ChatIdentity` |
| `castKey` (contracts/chat) | 157 / 42 *(shared stem with rpg — see note)* | `identityKey` |
| `buildCastNameContext` | 48 / 16 | `buildIdentityNameContext` |
| `buildCastAvatarMaps` | 20 / 8 | `buildIdentityAvatarMaps` |
| `loadChatCastProducer` | 35 / 11 | `loadChatIdentityProducer` |
| `CAST_KINDS` / `CastKind` / `CAST_KIND_POLICY` | 7/3 · 10/4 · 21/5 **\[c]** | `CHAT_IDENTITY_KINDS` / `ChatIdentityKind` / `CHAT_IDENTITY_KIND_POLICY` |
| **wire field** `ChatDetail.cast` / `MessagesPage.cast` | `$X.cast` reads: **32 ts + 8 tsx = 40** (scanned 4318, skipped 0) **\[rd]** | `.identities` |
| `AssembleContext.cast` / `castMembers` / `castCharacterIds` / `castNotMuted` | — / 39·11 / 81·18 / 21·9 **\[rd]** | `characters` / `speakerRefs` / `characterIds` / `unmutedCharacters` |
| `CarriedAppearanceCast` (+4 siblings) | 22 / 8 **\[rd]** | `CarriedAppearance` |
| `HostTierRegexSources.cast` | 1 field + 6 prose **\[c]** | `.character` |
| kit `row-macros.ts:67` `cast?` · `speaker-label` `castNames` | 2 axes **\[c]** | `characterNames` |
| `ChatRoster` | 12 / 5 **\[rd]** | `ChatMembership` |

The **wire field is the only non-type edit in D5** — 40 read sites plus every CT stub that constructs a
`ChatDetail`. Everything else is language-service-renameable.

**Note on `castKey`:** the 157/42 count is the *stem*, which spans both the chat producer
(`producers.ts:78`) and the rpg actor ref (`actor.ts:64`). D5 and D8 must be sequenced or the two
renames collide on the same identifier text. Do D5 first (type-only), then D8.

### D6 — Generic `roster` spent as English "a list" (map row 17)

**\[rd]**, 56 occ total: `RosterRefIndex` 18/5 · `PERSONA_ROSTER_SUBCATEGORY` 7/4 · `SessionRoster` 6/2 ·
`PersonaRoster` 6/3 · `OrbPluginRosterEntry` 5/2 · `CardFrameRosterPort` 4/3 · `AttachmentRoster` 3/1 ·
`RefinerySessionRosterRow` 3/1 · `RoomRoster` 2/1 · `CharacterRoster` 2/1.

Plus one behavioral site, not a rename: `features/persona/lib/personas-nav.ts:32` puts `"roster"` in the
config **search keyword** list for "Your personas" (verified, line read this session). Once `roster`
means the saved template, typing "roster" surfacing *personas* is a wrong answer, not a synonym. **Delete
that keyword** — a one-token edit with a real user-visible consequence.

### D7 — The plugin public boundary (map row 16)

`chat.listRoster` **\[rd]** 46 occ / 16 files, including the shipped author-facing type surface
`packages/server/src/entry/boot/seed-assets/plugins/host-v1.d.ts:83,599`, the grant-map key
`"chat.listRoster"` (`host-v1.ts:660`), and `contracts/plugin/bridge.ts`.

The function's own doc already names the right word twice — `host-v1.ts:47` *"Human seats are excluded
(this is the CHARACTER roster)"*, and the return type is **already** `PluginCharacterView`. Only the
verb is deviant. Target: `chat.listCharacters`, grant key `"chat.listCharacters"`.

### D8 — The rpg `cast` carve-out (map row 13)

**\[rd]** unless marked: `castKey` 157/42 *(stem shared with D5)* · `kind: "cast"` 92/39 **\[c]** ·
`rpgCastSlug` 28/7 · `RPG_CAST_GUIDE_FIELDS` 18/7 · `RpgCastGuideField` 12/4 · `rpgCastRefSchema` 7/3 ·
`RpgCastRef` 6/4 · plus `CAST_SLUG_STRIP`/`CAST_SLUG_TRIM`/`CAST_SLUG_FALLBACK`/`CAST_GUIDE_CARD_LABEL`.

Deletes on landing: `domain/rpg/chat-ops/tracker-view.ts:81` `kind: ref.kind === "cast" ? "npcs" :
"party"` becomes `kind: ref.kind === "npc" ? "npcs" : "party"` — the *translation* between two words for
one set collapses into a direct read.

**THE STORED-DATA HAZARD — worse than the brief framed it, and I have the failure mode.** The rename
changes a value inside a JSON column, so:

1. **It does NOT trigger the pre-launch db reset.** `.claude/rules/db-schema.md` resets the dev db on a
   `packages/db/src/migrations/**` baseline-hash change. A JSON *value* rename touches no DDL, so
   nothing resets and **stale rows persist with no automatic cleanup**. The usual pre-launch "it's
   free, the db drops anyway" reasoning does not apply here.
2. **The failure is a hard throw, not a degrade.** `domain/rpg/persistence/snapshots.ts:73,80-83`:
   `actorState` is re-validated through `z.array(rpgActorEntrySchema)` and a parse failure throws
   `RpgStateCorruptError` — its own doc: *"A schema-invalid persisted blob is a typed
   `RpgStateCorruptError` — surfaced loudly, never defaulted away into a poisoned tracker."* A stored
   `{kind:"cast", castKey:…}` under a schema that only knows `npc` therefore makes **every existing rpg
   game containing a scene NPC unreadable**, immediately, on read.
3. **Three stored planes carry the key, with two different failure modes.**
   - `actorState[].actorRef.kind` — **throws** (above).
   - `presentCharacters` — a flat `z.array(z.string().min(1))` of `actorRefKey` strings
     (`snapshots.ts:71`), so stale `cast:<slug>` entries **parse fine and silently stop matching**: the
     NPC vanishes from the stage with no error.
   - `fieldLocks` — dotted lock paths built off `actorState.<actorRefKey>` (`contracts/rpg/snapshot.ts:131,138,147`), so
     host pins silently detach.

That is a mixed loud/silent failure, which is the worst kind to ship. **Landing D8 requires either a
one-shot snapshot data migration (rewrite all three planes) or a deliberate, announced dev-db wipe, and
it is merge-window-scheduled** exactly like a baseline squash.

**And the target word is blocked.** `npc` is *reserved* for map row 14, and the reservation is
ledger-cited, not just a comment: `Core-Path-Registry.md:311` — *"the cross-game `rpg_npcs` library
remains the reserved graduation door"*; restated at `contracts/rpg/actor.ts:20-22` (*"shipping it now
would mint a dead `RpgNpcId` brand"*) and `:53`. See Fork 3.

### D9 — Conforming already (no action)

- **RPG `party` / `npcs` / `everyone`, the tracker carriers, `update_party`, `TEMPLATE_CLUSTERS "party"`,
  "Party & trackers", "Party purse", "Party update"** — ratified in place by the owner. The census's
  claim-8 "party is USER-FACING" is confirmed and is now *correct behavior*, not a finding.
- **`crew`** — confirmed dead (census claim 9): 31 comment lines + one seeded greeting
  (`character/seeder/cards.ts:565`), no domain, no feature, no bus member. D59 carries the disposition
  note. **No action**, except the P3 below.
- **`castId` as a type cast** — see Fork 4. My recommendation is *no action*, and the reasoning is in
  §6.1 where I correct the census's price for it.

### P3 — one un-failable test (census-found, re-confirmed)

`tests/client/features/workloads/components/workloads-jobs-section.ct.tsx:159` asserts
`getByRole("option", { name: "Crew: director" })).toHaveCount(0)` against a string that exists nowhere in
`packages/`. It cannot fail. It reads as coverage. Delete it or retarget it.

---

## §4 THE OPTIONS

### Option A — MINIMAL: the user-facing collisions and nothing else

**Does:** D1 + D2 + D3 + D4 + the `personas-nav.ts:32` keyword deletion + the stale
`modal-slot-ids.ts:51` comment (§6.3). Plus the three rpg promote/back aria-labels if Fork 8 goes that
way.

**Cost:** ~30 rendered strings + 2 registry literals + ~40 coupled test pins across ~20 files **\[rd]**
(`"Save current cast"` 8 · `"to the roster"` 9 · `"Start from saved cast"` 5 · `"New cast"` 5 ·
`"Saved casts"` 3 · `"Add cast"` 2 · `"New chat with same cast"` 2 · `"No saved casts"` 2 ·
`"Back to the roster"` 2 · `"Members and cast"` 1 · `"Meet the cast"` 1). One lane, one commit.

**Blast radius:** `packages/client` only, plus two registry ids. **Zero** server, contracts, db, wire,
plugin API, stored data.

**Floor:** `pnpm check` is static and runs none of these — the literal sweep across `tests/**` is
mandatory, plus the named CT files (`cast-picker.ct.tsx`, `cast-member-surface.ct.tsx`,
`new-chat-picker-surface.ct.tsx`, `rpg-context-section.ct.tsx`, `actions-view.ct.tsx`) and
`tests/e2e/support/chat-room.ts:292` (`const CAST_BAR = '[aria-label="Cast"]'`).

**What stays muddled:** all twelve code meanings. The D137 comment fence stays load-bearing. A cold
agent's `rg cast` still returns ~8,400 hits. Row 5/row 6 remain a comment apart.

### Option B — FULL unification

**Does:** everything in §3, including `castId`.

**Cost:** Option A + D5 (~250 sites incl. a 40-site wire-field rename and every `ChatDetail` CT stub) +
D6 (56) + D7 (46, incl. the shipped `.d.ts`) + D8 (~460 plus a **stored-data migration and a merge
window**) + the §2 gate + **`castId` at 8,056 occurrences across 1,069 files \[rd]**.

**Blast radius:** every package; the wire; the plugin public API; stored rpg snapshots; 961 test files
for `castId` alone. This freezes the tree — `castId` touches so many test files that it conflicts with
every live lane.

**What stays muddled:** nothing. But the schedule cost is a multi-lane program with a tree freeze, for a
defect class whose *ranked harm is user confusion* — and Option A already retires 100% of that.

### Option C — TARGETED MIDDLE (**recommended**)

Three waves that each land alone and green, ordered so every wave's value is realized even if the next
never ships.

- **C1 = Option A, verbatim.** Retires 100% of the ranked user-facing harm (M1, M2, M3) for a
  client-only diff. Ship first, ship alone.
- **C2 = the chat contract seam (D5).** ~250 sites, one wire field, zero stored data, zero public API.
  **This is the wave with the highest law-value per site: it dissolves the D137 comment fence.** After
  C2, "the D137 cast" is `ChatIdentity` and "the D60 drive axis" is `characters`, and the two can no
  longer be confused because they no longer share a token — the compiler holds what
  `persistence/cast.ts:18-20` currently asks an amnesiac agent to remember. Includes `ChatRoster` →
  `ChatMembership` (12 sites, the cheapest correctness win on the list).
- **C3 = the fenced arms, each its OWN scheduled lane:**
  - **C3a** D7 plugin `listRoster` → `listCharacters`. **Do this now or never** — pre-launch, no
    third-party ecosystem exists, so it is free today and a permanent versioned break the day one does.
  - **C3b** D6 generic-`roster` sweep + the `personas-nav.ts:32` keyword (if not taken in C1).
  - **C3c** D8 rpg `cast` → `npc` — **merge-window-scheduled**, carries the snapshot data migration or
    the announced db wipe, and depends on Fork 3 resolving row 14's name first. Sequence *after* C2
    (shared `castKey` stem).
  - **C3d** the §2 `rpg-register-fence` gate, landing on the fixed tree.
- **DEFERRED, recommend NEVER: `castId`.** See Fork 4.

**Why C over B:** the only thing B adds is `castId` and schedule risk. **Why C over A:** A leaves the
one law-grade defect — a structural fence held by a comment — in place, and that is precisely the class
this repo's whole apparatus exists to eliminate (constitution §1: the rigor is *"the substitute for the
memory and judgment the author lacks"*; §2.3: *"a prose-only boundary is not a placement — it's a
wish"*). C2 converts that wish into physics for ~250 mechanical sites and no stored data.

---

## §5 OWNER FORKS (recommendation first in each)

**Fork 1 — the room's seated characters (map row 4).**
(a) **"Characters"** *(recommended)* — derives from the closed actor vocabulary; the sibling section
"People" proves the construction; dissolves M1 and M2 at once. (b) Keep "Cast" — free, but M1/M3 stay.
(c) "Roster" — collides with Fork 2's answer. **Price:** (a) is inside C1's ~30 strings.

**Fork 2 — the saved-template user word (map row 10).**
(a) **"Roster" / "Saved rosters"** *(recommended)* — four of five registries already say it, so the code
barely moves; freed for exclusive use once Fork 1 takes "characters". (b) "Character set" — equally
boring, but leaves `roster-preset` naming something the user never hears. (c) Keep "Cast" — M1 and M3
survive. **"Party" is not an arm** — the §2 register boundary excludes it. **Price:** (a) = D2's 25
strings + D4's 2 ids; (b) = the same + a 4-registry rename (`RosterPreset` 392/43, `rosterPreset`
288/56, `roster-preset` 92/52, `roster_preset` 93/21, `rosterPresetsChanged` 24/16 **\[rd]**, plus a db
table family and a branded id) — an order of magnitude more, for no extra user clarity.

**Fork 3 — the rpg scene NPC and the reserved arm (map rows 13/14).**
(a) **Scene NPC → `npc`; rename the RESERVED future arm** *(recommended)* — unifies rpg with its own
ratified `npcs` carrier class and deletes `tracker-view.ts:81`'s translation. The reserved arm is
**unbuilt**, so renaming it costs ~5 live prose sites (`contracts/rpg/actor.ts:20,53`,
`docs/design/lite-plus-guided-substrate-spec.md:359,870`, `Core-Path-Registry.md:311`) — history reviews
are immutable and untouched. Suggested boring replacement for row 14: `npcRow` or `libraryNpc`.
(b) Scene NPC → `sceneNpc` (leaves `npc` reserved; unambiguous but verbose, and the key becomes
`scenenpc:<slug>`). (c) Scene NPC → `extra` (film term; understates — these carry names, moods and
relationship arcs). (d) No action. **Price:** (a)/(b)/(c) all carry D8's ~460 sites **and** the
stored-data migration + merge window; (d) is free and leaves a fourth `cast` meaning one package from
the other three.

**Fork 4 — `castId` (map row 18).**
(a) **No action** *(recommended)*. The census priced this as *"the cheapest high-value rename on this
list"* at 347/110. That is wrong by a factor of ~23 — see §6.1. It is **8,056 occurrences across 1,069
files \[rd]**, the largest mechanical edit available in this tree, and 7,716 of those are in `tests/`,
so it conflicts with every live lane. More importantly its *value collapses* once C1–C3 land: after the
domain word "cast" leaves chat, roster-preset and rpg, `castId` becomes the **only** `cast` in the tree
and is therefore unambiguous by construction — the grep-noise problem it causes is solved by the other
renames, for free. (b) Rename to `asId`/`toId` on a quiesced tree as a standalone single-commit
ts-morph pass — mechanical and zero-runtime-risk, but it must own the tree for the duration.
**Recommend deciding this only after C3, not now.**

**Fork 5 — plugin `chat.listRoster` (map row 16).**
(a) **Rename to `chat.listCharacters` now** *(recommended)* — pre-launch, 46 sites / 16 files **\[rd]**,
free today, a permanent versioned break once any third party ships. The return type is already
`PluginCharacterView` and the doc already says "the CHARACTER roster", so only the verb is deviant.
(b) Freeze the name and fix the doc line only (the census's suggestion) — costs nothing now, keeps a
public API whose word contradicts the map forever.

**Fork 6 — the register boundary's enforcement tier (§2).**
(a) **A structural gate `rpg-register-fence`** *(recommended)* — the only tier that actually holds a
naming boundary; ~1 gate-authoring lane including the six-case probe and the mandatory
`first/third-party` false-stem fence. (b) Constitution prose only — free, and by the constitution's own
§2.3 standard, a wish.

**Fork 7 — is the closed actor vocabulary still binding? (needs owner)**
The clause *"The room's actor vocabulary is CLOSED (characters, personas, host/members) — no new named
entity kinds"* lives at `docs/history/design/interaction-substrate-spec.md:24-25`, which is
`status: archived` and **superseded** (2026-08-24) by `docs/design/interaction-direction-spec.md`, which
does **not** restate it (verified: no `cutesy` / `anthropomorph` / `actor vocabulary` hit in the
superseding doc). The *no-cutesy* half was re-ratified by the owner today. **This proposal's §1.1
depends on the closed-vocabulary half.** If it is still binding, §1.1 is enforcement, not preference,
and it should be re-minted as a live D-row so the next agent does not have to find it in an archived
file. If it is not, Fork 1 becomes a genuine open choice. **I recommend re-minting it as law** — it is
the clause that makes the whole map derivable rather than arguable.

**Fork 8 — the rpg surface's chat-concept aria-labels.**
(a) **Follow the chat word** *(recommended)*: `rpg-scene-cast.tsx:259` `"Promote {name} to the roster"` →
`"…to the room's characters"`, `rpg-character-detail.tsx:286,348` `"Back to the roster"` → `"Back to the
characters"`. These name a **chat** concept from an rpg surface, so the register boundary points this
way — and the promote button's whole job is to name its destination legibly. (b) Ratified under the rpg
blanket, unchanged. **Price:** (a) = 3 aria-labels + 11 coupled test pins **\[rd]** (`"to the roster"` 9,
`"Back to the roster"` 2), inside C1.

---

## §6 CORRECTIONS TO THE INPUT CENSUS

The brief said to treat the census's claims as verified and spot-check only what my analysis makes
load-critical. Three load-critical claims moved.

### §6.1 `castId` is mis-scoped by ~23× — and it changes the recommendation

Census §3 row 12 and §5 M5 report `castId` at **347 occ / 110 files** and call it *"the cheapest
high-value rename on this list."* Census §3's own header declares its scope as *"`packages` + `tests`
unless noted"*, and no note is attached.

Re-derived this session, `packages` + `tests`: **8,056 occurrences / 1,069 files.** Split:
`packages` 340/108 · `tests` **7,716/961** · `tooling` 47/13 · `scripts` 27/6. Call-site breakdown by
ast-grep (both languages): `castId<$T>($$$A)` 6,405 ts + 247 tsx; bare `castId($$$A)` 304 ts + 18 tsx;
scanned 4,318 files, skipped 0.

**The census reported the `packages`-only number under a `packages + tests` header.** Because `castId`
is overwhelmingly a *test* idiom, that single scope slip understates the fix by ~23× and inverts its
ranking — from "cheapest on the list" to "largest mechanical edit in the tree". Every other census count
I re-derived was accurate (`castKey` 157/42, `buildCastNameContext` 48/16, `loadChatCastProducer` 35/11
all matched exactly; `CastEntry` 69/24 vs 73/24 is within method noise), so this is a one-symbol slip,
not a systemic one — but it is the symbol whose price decided its rank.

### §6.2 The `"cast"` config-group-id hazard is refuted

Priced as a hazard in my brief ("per-device disclosure store keys on it"). It is a free rename:
`config-group-open-store.ts:17-19` documents the stored shape as a self-sanitizing id LIST that drops
unknown ids, and `config-selection-store.ts:10` states the selection store is not persisted. Receipts in
§3 D4.

### §6.3 The party/cast drift reaches the CLIENT, which the census scoped out

The census located the "party" vs "cast" split in server + contracts + db only. It is also live in the
client: `state/modal-slot-ids.ts:51` documents the `savedCasts` slot as reachable from *"the new-chat
picker's **'Start from party…'**"* — a button that actually reads **"Start from saved cast"**
(`new-chat-picker-surface.tsx:141`, `saved-casts-modal.tsx:4`, `authed-app.tsx:319`). Absence check: the
literal `"Start from party"` appears **nowhere** in `packages` or `tests` except that comment (verified;
6 files carry `"Start from"` copy). Also client-side: `new-chat-picker-surface.tsx:144-145` names its
locals `parties` / `hasParties` off `trpc.rosterPreset.list`, and `:204` says *"a party start"*. This is
D141 comment-rot (a comment stating a word the code does not) and rides along in C1 for free.

### §6.4 M1 has a partial, same-day mitigation the census did not know about

Detailed in §3 D1. #848 (`72e0d01b4`) already fixed the *sibling* door in that Row by giving it a visible
noun ("Add a character"), and recorded the house's remedy for exactly this collision class. This does
not retire M1 — it strengthens the case for C1 by showing the precedent.

---

## §7 VERIFICATION LOG

**What I read END TO END:** `.claude/agent-doctrine.md` · `docs/reviews/research/2026-08-30-vocab-roster-cast.md` ·
`packages/contracts/src/chat/producers.ts` · `packages/contracts/src/roster-preset/index.ts` ·
`packages/contracts/src/rpg/actor.ts` · `packages/contracts/src/rpg/enums.ts` ·
`packages/server/src/domain/chat/persistence/cast.ts` ·
`packages/client/src/features/chat/components/members-panel.tsx` ·
`packages/client/src/features/chat/components/committed-members-tab.tsx` ·
`packages/client/src/state/config-group-ids.ts` · `packages/client/src/state/config-group-open-store.ts` ·
`packages/client/src/features/roster-preset/lib/cast-collection.tsx`.

**Read by targeted region (line ranges named in-text):** `Core-Path-Registry.md` D59 / D60 / D122 / D137 /
the D137(F) fence / :311 (the reserved `rpg_npcs` door) · `docs/history/design/interaction-substrate-spec.md`
(frontmatter + the ruling block) · `docs/design/interaction-direction-spec.md` (frontmatter + a
vocabulary-ruling sweep) · `.claude/rules/db-schema.md` (whole) ·
`packages/server/src/domain/rpg/persistence/snapshots.ts:60-110` ·
`packages/server/src/domain/rpg/chat-ops/tracker-view.ts:70-95` ·
`packages/contracts/src/identity/index.ts:68-90` · `packages/contracts/src/plugin/host-v1.ts:40-55,655-665` ·
`packages/client/src/features/chat/components/add-member-popover.tsx:1-60` ·
`packages/client/src/features/rpg/components/rpg-scene-cast.tsx:1-40,225-270` ·
`packages/client/src/state/modal-slot-ids.ts` (head + the `savedCasts` block) ·
`packages/client/src/state/config-selection-store.ts:1-45` ·
`packages/client/src/features/persona/lib/personas-nav.ts:25-36` ·
`packages/contracts/src/rpg/snapshot.ts` (lock-path region, by hit enumeration).

**Sweeps run this session** (all `packages` + `tests` unless stated; `--count-matches` for occurrences,
`--files-with-matches` for files — never the `-o -c` form, which counts lines):

- Quoted-copy enumeration of every `"…cast…"` string in `packages/client/src` (both `.ts` and `.tsx` globs).
- Per-symbol occurrence/file counts for 40 symbols across D4–D8 (tables above).
- `ast-grep` on **both** languages for `castId($$$A)`, `castId<$T>($$$A)`, `$X.cast`; `--inspect summary`
  printed `scannedFileCount=4318, skippedFileCount=0` on every ts arm — no absence claim here rests on a
  zero scan.
- Test-pin sweep of 15 user-copy literals across `tests/**` (`-F`, fixed-string).
- Absence check: `"Start from party"` — 1 hit, and it is the stale comment (§6.3).
- Scope-split sweeps (`packages` / `tests` / `tooling` / `scripts` / `docs`) to explain the census
  divergence in §6.1.
- Git: `git log` on `add-member-popover.tsx` (#848 → `72e0d01b4`) + `git status --short` on it (clean).

**Memory consulted:** `roster-vs-ever-referenced-producers.md` (why the D137 producer must be
participant-independent — it is why map row 5 is a *separate concept* from row 4/6, not a synonym, and
so why it takes its own word rather than being merged) · `wire-field-name-collides-with-card-field.md`
(a projection field name must be checked against the wire the type already extends — applied when
choosing `ChatDetail.identities`).

**NOT done — declared limits.**

1. **No tests were run and no gates were run.** This is a design analysis, not a diff review; nothing here
   asserts a `pnpm check` or suite result. `pnpm -s check:docs` on this file is the orchestrator's to run
   before commit.
2. **No rendered verification.** Every claim is a source claim. In particular I did not confirm at any
   viewport that the "Cast" kicker and the "Add cast…" button are visually adjacent — the JSX puts them
   in one `<Row>` (`members-panel.tsx:308-313`, verified), which is structural, not pixel evidence.
3. **I did not read in full:** `domain/chat/assembly/context.ts` (~950 lines; the four drive-axis fields
   are census-cited at `:308,315,412-428` and I re-derived only their occurrence counts), the
   `roster-preset` server verb/persistence tree, `cast-picker.tsx` (copy enumerated by sweep, not read
   whole), and `contracts/plugin/host-v1.ts` beyond the two regions named. A concept living only in an
   unread region of those files could be missed.
4. **The D8 stored-data hazard is derived from the parse path, not reproduced.** I read the throw site
   and the three plane schemas; I did **not** plant a stale `kind:"cast"` row and observe
   `RpgStateCorruptError`. The C3c lane owes that red-first receipt before it migrates anything.
5. **Site counts are `packages` + `tests`.** `docs/` carries substantial additional residue (e.g.
   `roster-preset` 165 occ in `docs/` alone) and is not priced in any option — a rename wave owes a docs
   pass the catalog gate will notice.
6. **Fork 7 is unresolved and §1.1 rests on it.** I could not establish from the tree whether the closed
   actor vocabulary survived its doc's supersession; that is a question only the owner can answer.

**Unconfirmed suspicions (low priority, not findings).**

- `features/stats/lib/analytics-section.tsx:38` renders *"cast time, thread connections, drift"* — I could
  not determine from that line alone whether "cast time" is a thirteenth meaning or an unrelated metric
  name. One line, placeholder copy, not worth a lane.
- `agent-nav/index.ts:151` `"Group UX review — 3 cast"` is dev-nav seed text; likely harmless, unverified.

---

## Issue paragraph (paste-ready)

**Vocabulary unification proposal delivered — recommend Option C, staged; 8 owner forks await ruling.**
Lane cb-vocab-design (2026-08-30) turned the roster/cast/party census into a top-down word→concept map
and priced three coherent options. Report:
`docs/reviews/stickler/2026-08-30-vocab-unification.md`. The map derives every word from the tier that
owns the concept: the room's seated characters are **Characters** (map row 4, from the owner's closed
actor vocabulary), the saved template is **Roster** (row 10 — four of its five registries already say
`roster-preset`; only `CAST_COLLECTION_ID="cast"` and the `"savedCasts"` modal id deviate), the D137
producer becomes **`ChatIdentity`** and the D60 drive axis becomes **`characters`** (rows 5/6), and
game-register words are fenced to the rpg domain by a proposed `rpg-register-fence` gate. **"Party" is
excluded for the saved template by derivation, not taste** — it is a ratified RPG tracker-carrier class.
The recommendation is **Option C**: C1 = the client-only user-facing fix (~30 strings + 2 registry ids +
~40 test pins, zero server/db/wire) which retires 100% of the ranked user harm including the M1
"Cast"-header-beside-"Add cast…" collision; C2 = the chat contract seam (~250 sites, one wire field),
whose real value is that **it dissolves the D137 comment fence into compiler-enforced physics** — the
exact "a prose-only boundary is a wish" class the constitution §2.3 exists to kill; C3 = three fenced
lanes (plugin `chat.listRoster`→`listCharacters`, free while pre-launch and a permanent break after;
the generic-`roster` sweep; and rpg `cast`→`npc`, which is **merge-window class**). **Three census
corrections, one material:** `castId` was priced at 347 occ/110 files and called "the cheapest rename on
the list" — it is **8,056 occ / 1,069 files** (the census reported a `packages`-only number under a
`packages+tests` header), which inverts its ranking, so the report recommends **not** renaming it at all
since C1–C3 make it unambiguous for free. The `"cast"` config-group-id "persisted key" hazard is
**refuted** (the disclosure store self-sanitizes, by its own header). The rpg `cast:<slug>` hazard is
**worse than framed**: it is a JSON-value change so it does **not** trigger the pre-launch db reset, and
`snapshots.ts:80-83` **throws `RpgStateCorruptError`** on a stale row, making every existing rpg game
with a scene NPC unreadable — and the obvious target word `npc` is **blocked** by the ledger-reserved
`rpg_npcs` arm (`Core-Path-Registry.md:311`), so Fork 3 must rename the reserved arm first. **Forks
needing a ruling:** (1) "Characters" for the room's seats, (2) "Roster" for the saved template, (3) the
rpg NPC word + the reserved arm, (4) `castId` — recommend no action, (5) plugin API rename now vs never,
(6) gate vs prose for the register boundary, (7) **is the closed actor vocabulary still binding?** — it
lives only in an archived, superseded doc and §1.1 depends on it; recommend re-minting it as a live
D-row, (8) the rpg surface's three chat-concept aria-labels.
