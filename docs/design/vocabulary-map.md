---
kind: design
status: active
updated: 2026-09-01
---

# THE VOCABULARY MAP — one concept, one word

> **THE SOURCE OF TRUTH FOR WHICH WORD NAMES WHICH CONCEPT.** Everything else — D151, the
> `AGENTS.md` §3 register paragraph, a lane brief, a review — CITES this file. Nothing copies its
> rows: a table with two homes drifts the moment a word changes, and that drift is exactly what
> produced #914 (three rename waves each worked from a slice of a dated REVIEW doc, and the union of
> the slices did not cover the tree).
>
> **Derivation, not taste.** The word for a concept follows the tier that OWNS the concept
> (`docs/architecture/core/AGENTS.md` §0.2, the package cake). The full derivation, the priced
> options and the eight owner forks are the frozen record at
> `docs/reviews/stickler/2026-08-30-vocab-unification.md`; this file is the LIVING result. When a
> word changes, it changes HERE first.

## How to use this

**Before you write a user-facing string, an id, a testid, or a comment that names one of these
concepts: look it up here.** Do not decide locally, and do not copy the word off a neighbouring file
— a neighbour can be pre-#901 residue. If the concept you need is not in the table, that is a
finding: say so rather than minting a word.

## The map

| Concept | The user-facing word | Code spelling (when different) | Status |
| - | - | - | - |
| A library character | **Character** | `character` | landed |
| A library persona | **Persona** | `persona` | landed |
| The humans in a room | **People** (section) · **Host** / **Member** | `member` / `host` (`chat_participants.kind='human'`) | landed |
| **The characters seated in a room** | **Characters** (section) | `character` (`chat_participants.kind='character'`) | landed (#902 C1 copy, #914 sweep, **#922 code**). The code half — the `MembersRow` discriminant `kind: "character"`, `chat-character-bar.tsx`, the `chatCharacterBar` testid, `CharacterAvatars`/`CharacterSeat`/`characterMenuItems`/`CharacterInlineCluster`, the `MembersPanel` `characters`/`charactersAction` seam, the `character-chip`/`members-characters` slots and the e2e locators — landed with #922. |
| Every identity a chat references (characters ∪ personas, incl. departed) — the name/avatar directory | — | `ChatIdentity` / `identityKey` / `ChatDetail.identities` / `MessagesPage.identities`; producer `loadChatIdentityProducer` (`domain/chat/persistence/identity.ts`); axis `CHAT_IDENTITY_KINDS` / `ChatIdentityKind` / `CHAT_IDENTITY_KIND_POLICY`; projections `buildIdentityNameContext` / `buildIdentityAvatarMaps` | landed (#903 C2). Was `CastEntry` / `castKey` / `ChatDetail.cast` / `loadChatCastProducer` / `CAST_*`. |
| Present, seated characters the arbiter may drive (the D60 drive axis) | — | `AssembleContext.characters` / `speakerRefs` / `characterIds` / `unmutedCharacters` (`domain/chat/assembly/context.ts`) | landed (#903 C2). Was `cast` / `castMembers` / `castCharacterIds` / `castNotMuted`. |
| The present characters' NAMES as a macro/label feed (`{{group}}`, the speaker-label plain alphabet) | — | `characterNames` / `unmutedCharacterNames` (`@orb/kit/macro` `MacroContext` + `RowMacroNameContext`, `@orb/kit/speaker-label`) | landed (#903 C2). Was `cast` / `castNotMuted` / `castNames`. |
| The seated characters' regex-scope slice | — | `HostTierRegexSources.character` / `ResolvedRegexSources.character` | landed (#903 C2). Was `.cast`. Its junction table already said `character_regex_scripts`. |
| The room composition the carried-appearance rules read | — | `CarriedAppearance` (+ `carriedAppearanceFromParticipants` / `isSingleHumanRoom` / `resolveCarriedBackgroundForAppearance` / `useCarriedAppearance`) | landed (#903 C2). Was `CarriedAppearanceCast` + four `Cast`-stemmed siblings. |
| **The room's participants (humans + characters together)** | — | `roster` (server chat domain: `persistence/roster.ts`, `verbs/roster.ts`, `substrate/roster-host.ts`, `roster-humans.ts`, `loadRoster`, `buildInitialRosterRows`) | **DIVERGENT, UNSCHEDULED.** The db table already says `chat_participants`, so the concept is *participants*; the code word is not. \~2000 sites, zero user-facing strings. Recorded in **#914**; needs an owner ruling to schedule. |
| The asker's membership role fed to `can()` | — | `ChatMembership` (`contracts/identity`) | landed (#903 C2). Was `ChatRoster` — a single-field `{role}`, never a list, which is what made the old name the cheapest correctness win in the wave. |
| A saved, named, reusable set of characters + seat knobs + captured rules | **Roster** · **Saved rosters** | `rosterPreset` — **CONFORMING, never renamed** (four of its five registries already say it: the db table family, the `RosterPresetId` brand, the tRPC router key, the domain/contracts/client directories) | landed (#902 C1) |
| Your whole character library | **Your characters** | `character` | landed |
| Any generic "a list of X" | **list** | `XList` — **`roster` is RESERVED for the saved template and may not be spent as English for "a list"** | landed (#905 C3b, #914) |
| The plugin host's character-seat read | — (plugin authors) | `chat.listCharacters` | landed (#904 C3a) |
| The branded-id type coercion | — | `castId` (`@orb/kit/ids`) | **no action, deliberately.** It is a TYPE cast, not this concept family; 8,056 occurrences, and once the word "cast" leaves chat / roster-preset / rpg it is unambiguous by construction. |

## Concepts still spelled `cast` that this map has NO word for (found by #903 C2)

The map's own instruction is *"if the concept you need is not in the table, that is a finding: say so
rather than minting a word."* These are that finding — each is a REAL distinct concept the rename
waves have never had a word for, so #903 deliberately left every one of them alone rather than invent
one. **A `cast` in `domain/chat/**` or `contracts/src/chat/**` is otherwise a defect on sight** (D137(F)),
so this list is the complete set of sanctioned survivors inside chat and must shrink, not grow.

| Still-`cast` concept | Where | Disposition |
| - | - | - |
| The present characters' `{ref, name}` pairs the arbiter picks a speaker from | `CastName` (`domain/chat/contract/arbitration.ts:27`), `room.castNames`, `joinedCastName`, `castCharForHostRow` (`verbs/turn.ts`, `engine/round.ts`, `engine/smart-arbitrate.ts`, `engine/select-speakers.ts`) | **NEEDS A WORD.** It is neither the identity directory (no personas, no departed) nor the drive axis (it is name+ref, not `AssembleCharacter`). \~30 sites. |
| The narrator arm of `AssembleContext.speaker` — "this one generation voices everyone" | the string VALUE `"cast"` in `speaker: { kind: "cast"; … }` (`contracts/src/chat/assemble.ts:535`) and its \~8 `=== "cast"` readers in `assembly/assemble.ts`, `assembly/macros.ts`, `assembly/speaker-card.ts` | **NEEDS A WORD.** A literal, not a symbol, so no rename wave has ever seen it. `"narrator"` already names the sibling `GroupOutput` axis, so a straight swap would collide — that is the decision this needs. |
| The founding / seated CHARACTER IDS an import or a backfill writes | `ResolvedCast` + `cast: ResolvedCast` (`domain/import/verbs/import-chat-bundle.ts`), `cast: readonly CharacterId[]` (`chat/persistence/import-write.ts:190`, `chat/substrate/backfill.ts:77`) | **NEEDS A WORD** (or is simply `characterIds`, matching the drive axis — but that is a ruling, not a lane's call). |

## The rpg register (D151 · `AGENTS.md` §3)

Game-register words — `party`, `npcs`, `quest`, `encounter`, `journal`-as-game-log — live inside the
rpg domain and its surfaces and may **never** name a non-game concept. Conversely **an rpg surface
naming a CHAT concept takes the chat word** (that is what makes `promoteActor`'s destination
legible): the Status tab's seated characters are **Characters**, not "the roster"; the scene's
on-stage set is **the present characters**.

| Concept | The user-facing word | Code spelling (when different) | Status |
| - | - | - | - |
| Tracker carrier classes | **Party** (in-game) | `party` / `npcs` / `everyone` | conforming, ratified in place |
| A scene-only NPC (no card, slug-keyed, promotable) | in-game | `npc` | **NOT RENAMED** — still `cast` (`RpgCastRef` / `castKey` / `cast:<slug>`); owned by **#906**, merge-window class (it is a JSON *value* rename, so it does not trip the dev-db reset, and `snapshots.ts` THROWS `RpgStateCorruptError` on a stale row) |
| A future cross-game NPC library row (`rpg_npcs`) | — | needs a new word once `npc` is claimed | reserved, unbuilt (`Core-Path-Registry.md:311`) |

**False stems — not this vocabulary:** `third-party` / `first-party`, `broadcast` / `forecast` /
`podcast`, and `castId`. Any sweep or gate over these stems must fence them explicitly.

## Enforcement

**Prose-enforced by owner ruling — there is no gate** (`AGENTS.md` §3 states this for the register
boundary, and it holds for the whole map). The honesty mechanism is therefore the sweep: a crossed
word is a drifted-comment defect, fixed on sight, and a rename PROGRAM's waves must be cut so their
UNION provably covers the surface — with an explicit owner for any file two waves both fence off
(the #914 defect: #902 and #905 each fenced `features/persona/**` off as the other's problem, so
nobody owned the intersection and the most visible generic-`roster` surface in the tree survived).
A gate (`rpg-register-fence`) was priced in the 2026-08-30 review and is not built.
