---
kind: design
status: active
updated: 2026-08-30
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
| **The characters seated in a room** | **Characters** (section) | `character` (`chat_participants.kind='character'`) | landed (#902 C1, #914) |
| Every identity a chat references (characters ∪ personas, incl. departed) — the name/avatar directory | — | `ChatIdentity` / `identityKey` / `ChatDetail.identities` | **NOT RENAMED** — still `CastEntry` / `castKey` / `ChatDetail.cast`; owned by **#903 (C2)** |
| Present, seated characters the arbiter may drive (the D60 drive axis) | — | `characters` (`domain/chat/assembly/context.ts`) | **NOT RENAMED** — still `cast` / `castMembers` / `castCharacterIds`; owned by **#903 (C2)** |
| **The room's participants (humans + characters together)** | — | `roster` (server chat domain: `persistence/roster.ts`, `verbs/roster.ts`, `substrate/roster-host.ts`, `roster-humans.ts`, `loadRoster`, `buildInitialRosterRows`) | **DIVERGENT, UNSCHEDULED.** The db table already says `chat_participants`, so the concept is *participants*; the code word is not. \~2000 sites, zero user-facing strings. Recorded in **#914**; needs an owner ruling to schedule. |
| The asker's membership role fed to `can()` | — | `ChatMembership` | **NOT RENAMED** — still `ChatRoster` (`contracts/identity`); owned by **#903 (C2)** |
| A saved, named, reusable set of characters + seat knobs + captured rules | **Roster** · **Saved rosters** | `rosterPreset` — **CONFORMING, never renamed** (four of its five registries already say it: the db table family, the `RosterPresetId` brand, the tRPC router key, the domain/contracts/client directories) | landed (#902 C1) |
| Your whole character library | **Your characters** | `character` | landed |
| Any generic "a list of X" | **list** | `XList` — **`roster` is RESERVED for the saved template and may not be spent as English for "a list"** | landed (#905 C3b, #914) |
| The plugin host's character-seat read | — (plugin authors) | `chat.listCharacters` | landed (#904 C3a) |
| The branded-id type coercion | — | `castId` (`@orb/kit/ids`) | **no action, deliberately.** It is a TYPE cast, not this concept family; 8,056 occurrences, and once the word "cast" leaves chat / roster-preset / rpg it is unambiguous by construction. |

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
