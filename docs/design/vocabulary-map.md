---
kind: design
status: active
updated: 2026-09-06
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
| The present characters' `{ref, name}` pairs the arbiter picks a speaker from | — | `SpeakerCandidate` (`domain/chat/contract/arbitration.ts`) / `room.speakerCandidates` / `joinedCandidateName` / `candidateCharForHostRow`; the narrator round's own name field is `narratorSpeakerName` (`engine/round.ts`) | landed (#1011). Was `CastName` / `castNames` / `joinedCastName` / `castCharForHostRow`. |
| The `AssembleContext.speaker` arm where ONE generation voices everyone (narrator mode) | — | the string value `"multi-voice"` in `speaker: { kind: "multi-voice"; … }` (`contracts/src/chat/assemble.ts`) + its readers in `assembly/assemble.ts`, `assembly/macros.ts`, `assembly/speaker-card.ts` | landed (#1011). Was `"cast"`. `"narrator"` was unavailable (it already names the sibling `GroupOutput` axis) and `"all"` reads as a filter, so the word names the GENERATION MODE. |
| The founding / seated CHARACTER IDS an import or a backfill writes | — | `characterIds` (`ResolvedCharacterIds` in `domain/import/verbs/import-chat-bundle.ts`; `rosterRows` in `chat/persistence/import-write.ts`; `loadCharacterIdsAndHost` in `chat/substrate/backfill.ts`) — **including the WIRE field** `BulkImportChatInput.characterIds` (`contracts/chat/bulk-import.ts`) and the one mapper deps shape that feeds it, `GroupChatInputDeps.characterIds` (`domain/import/contract/views.ts`) | landed (#1011). Was `ResolvedCast` / `cast`. Matches the drive axis. The wire field was the last `roster`-spelled holdout and landed at **#1773** by codemod (`scripts/codemods/rename-roster-wire-fields.ts`); the `seatedCharacterIds` parameter it feeds is `additionalCharacterIds`, because that call site already binds `characterIds` for the RESULT and the parameter holds only the extras beyond the primary. The function NAME `rosterRows` is NOT this row's — it builds row 44's participant rows and moves under row 44. |
| The seated characters' regex-scope slice | — | `HostTierRegexSources.character` / `ResolvedRegexSources.character` | landed (#903 C2). Was `.cast`. Its junction table already said `character_regex_scripts`. |
| The room composition the carried-appearance rules read | — | `CarriedAppearance` (+ `carriedAppearanceFromParticipants` / `isSingleHumanRoom` / `resolveCarriedBackgroundForAppearance` / `useCarriedAppearance`) | landed (#903 C2). Was `CarriedAppearanceCast` + four `Cast`-stemmed siblings. |
| **The room's participants (humans + characters together)** | — | `participants` (server chat domain: `persistence/participants-read.ts`, `verbs/participants.ts`, `verbs/resolve-rpg-participants.ts`, `substrate/participants-host.ts`, `participants-humans.ts`, `loadParticipants`, `buildInitialParticipantRows`, `createParticipants`, `createResolveRpgParticipants`, `ResolveRpgParticipants`, `RpgParticipantActor`) | **landed for the SERVER CHAT DOMAIN (#1010).** The db table already said `chat_participants`, so the concept was always *participants*; only the code word diverged. Renamed by one codemod (`scripts/codemods/rename-roster-participants.ts`) — zero user-facing strings, zero wire values. RESIDUE, each needing its own row before it may move — ~~`ChatResource.roster` (`contracts/identity`) + `ChatContext.roster` + `toolRoster`~~ and ~~`BulkImportChatInput.roster`~~ are RESOLVED (#1772 / #1773, 2026-09-06): the first three took **row 45**'s word `membership` (as this line always said they should) and the fourth took **row 41**'s `characterIds`; this pass also repaired `ChatToolExecFrame`, which #1010's own local `roster → participants` sweep had overshot onto with row 44's LIST word. STILL OPEN: the `speakerOffRoster`/`"speaker_off_roster"` op code (client-observable) · the `"roster-card-read"` capability id (its fix string lives in `tooling/`) · `contracts/src/chat/roster.ts` + `rosterMemberSpecSchema` · the rpg domain's own family (`RpgRosterActor`/`RpgResolveRoster`/`promoteToRoster`/`rosterNames`, whose compound verbs need a word this map does not yet own — so `resolve-rpg-participants.ts`'s header states the deliberate twin asymmetry) · `domain/persona/verbs/resolve-personas-for-roster.ts` · `entry/compose/rpg.ts` locals + the `roster_char` SQL alias · the client (`features/chat/lib/roster.ts`, `use-roster-*`). |
| The asker's membership role fed to `can()` | — | `ChatMembership` (`contracts/identity`) **and `membership` for every field that holds one**: `ChatResource.membership` (`contracts/identity`), `ChatToolExecFrame.membership` (`chat/contract/context.ts`), `TurnPrep.toolMembership` (`chat/contract/results.ts`), `ToolExecutionContext.membership` (`tool-use/contract/params.ts`), and the `decideChat(action, membership)` parameter (`admin/guard.ts`) | TYPE half landed #903 C2 (was `ChatRoster` — a single-field `{role}`, never a list, which is what made the old name the cheapest correctness win in the wave); FIELD half landed **#1772** by codemod (`scripts/codemods/rename-roster-wire-fields.ts`), which is what stopped every `can()` call site spelling `{ kind: "chat", roster: {…} }`. Two repairs rode with it: `ChatToolExecFrame` had been renamed `roster → participants` by #1010's local pass (row 44's LIST word landed on a row-45 value) and is now `membership`; `ToolExecutionContext.roster` was a third home neither #1010's header nor row 44's residue list had enumerated. |
| **A stored versioned-config blob this build cannot read faithfully** | **couldn't be read** (never "corrupt", never "invalid") | `configUnreadable` (`PresetDetail` / `UserSettingsView`), `VersionedParseFailure` (`contracts/versioned-config`), `stored_config_unreadable` (the wire refusal code, `@orb/server/kit` `stored-config`), the `unreadable` `SAVE_LIFECYCLE_STATES` member | landed (#1716). The user-facing word follows the one already shipped on the preset readout's failure band (`features/preset/lib/resolve-failure.ts`: "This preset couldn't be read"), so the two surfaces that say it say it identically. "Corrupt" is deliberately NOT the word: the commonest cause is a blob written by a NEWER build, which is intact data this one is too old to represent. |
| The repair for the above | **Reset** (to "the default" / "the defaults") | `preset.resetToDefault` · `settings.resetUserConfig` (#1771) | landed (#1716/#1771). Never "restore" (that word is the backup-file door's) and never "fix": the act discards what is stored, and the copy says so. On a newer-version blob it is worded as the explicit last resort, never the first door. |
| A saved, named, reusable set of characters + seat knobs + captured rules | **Roster** · **Saved rosters** | `rosterPreset` — **CONFORMING, never renamed** (four of its five registries already say it: the db table family, the `RosterPresetId` brand, the tRPC router key, the domain/contracts/client directories) | landed (#902 C1) |
| Your whole character library | **Your characters** | `character` | landed |
| Any generic "a list of X" | **list** | `XList` — **`roster` is RESERVED for the saved template and may not be spent as English for "a list"** | landed (#905 C3b, #914) |
| The plugin host's character-seat read | — (plugin authors) | `chat.listCharacters` | landed (#904 C3a) |
| The per-user background execution engine, and the settings pane that runs/monitors it | **Jobs** (pane) · **Runs** (its first section) — **"workload" is never shown to a user** | `workloads` — the system/code noun everywhere: the `workloads` domain + db table family, the tRPC router key, the `workloads` stream channel, the `UserSettings.workloads` namespace, the `ConfigGroupId`, and the `config-anchor-workloads-*` anchors | **landed, CONFORMING — do not rename either half** (owner 2026-08-02). Receipts: `packages/client/src/features/workloads/lib/workloads-group.tsx` (`id: "workloads"`, `label: "Jobs"`, and the side-eye 2026-08-08 P3 ruling-fork note) · `tests/client/features/workloads/lib/workloads-group.ct.tsx`. Recorded here because #978 G10 read the id as insider drift; the split IS this table's own "code spelling (when different)" pattern, it was simply never written down. |
| A config GROUP's id, as a vocabulary member | — | the owner's OWN exported id — `worldInfo` / `rosterPreset` stay camelCase beside kebab siblings | **CONFORMING, deliberate — not a casing defect.** `packages/client/src/state/config-group-ids.ts` states it: a collection group "keeps the id its owner already exports … rides the `data-collection` attributes the CTs address, and keys the per-device disclosure store", so a config-local kebab-ification would fork the id from the kind everywhere else. `rosterPreset` is additionally ruled never-renamed by the row above. Raised as drift by #978 G10 and refused with this receipt. |
| The branded-id type coercion | — | `castId` (`@orb/kit/ids`) | **no action, deliberately.** It is a TYPE cast, not this concept family; 8,056 occurrences, and once the word "cast" leaves chat / roster-preset / rpg it is unambiguous by construction. |
| The DEFAULT seed palette — the base `@theme` ramp every un-themed surface paints from | **Hearth** (a palette name, always Capitalised, always beside another palette name: Light · Mocha · Hearth) | **The carriers are** — theme pipeline: the resolver's base-set `orb.theme.id`, its modifier default and its EMPTY context (`packages/ui/src/tokens/resolver.json:9`, `:27`, `:29` — three distinct roles, not one); the token contract's `ThemeSet["id"]` / `themeMetaSchema` / `EXPECTED_THEME_META.base` / `expectedContexts` and its two resolver diagnostics (`packages/ui/token-contract.ts:126,168,539,595-600`). Db seed: `THEME_HEARTH_ID` / `THEME_HEARTH_NAME` (`packages/server/src/domain/settings/constants.ts:24,28`) and the seeder's `HEARTH_OVERRIDE` + `SEED_THEMES` row (`domain/settings/seed-themes.ts:27,77`). Server read seam: `toThemeView` derives the wire's `isDefault` from `THEME_HEARTH_ID` (`domain/settings/substrate/theme-views.ts:28`) — the one reader of that sentinel outside the seeder, and the reason no client carrier of the WORD is needed. Client: **the mirrored display name is GONE (#1671)** — `features/settings/lib/seed-theme-identity.ts` and its pin are deleted, and the Looks active-card predicate + the fold caption read `theme.isDefault` off the view (`@orb/contracts/theme`'s `themeSchema`) instead of comparing a name, which is the #1667 defect. The word survives in ONE client site: the Looks search keyword (`features/settings/lib/appearance-looks-nav.ts:26`) — a search TERM, never a predicate. **Tooling** (in scope — this map's header binds the whole repo, and #1220's first two censuses were `packages/**`-only): the ui-audit evidence judge's seed-fidelity predicate, which encodes "Hearth is the arm that stamps NOTHING" as executable law (`tooling/src/ui-audit/lib/evidence.ts:383-384` — `expected === "hearth" && render.rootDataTheme === null`); the seed-ink verifier's synthetic base palette (`tooling/src/verify/lib/seed-theme-ink.ts:105` — `{ name: "hearth", scheme: "dark", … }`, the base ramp given a name so it can be judged beside the `[data-theme]` blocks); and `--theme`'s USER-FACING help copy, the one place the word is shown to a human outside the app (`tooling/src/_shared/theme.ts:97,99`). **NOT a carrier: it is NOT a `SeedThemeName`, has NO `[data-theme]` value and NO file under `tokens/themes/`** — `SEED_THEME_VALUE_SETS` is GENERATED from that directory and holds `light` + `mocha` only, and `dataThemeOf` returns `null` for Hearth because the shell paints it by stamping NOTHING (`packages/client/src/lib/resolve-theme-scope-tokens.ts:67-73`). **`null` IS its runtime spelling wherever a theme row or a `[data-theme]` value is optional.** | landed, CONFORMING (#1220). **This cell is a LIST, never a count** — it was twice written as "exactly THREE carriers" and twice refuted by the tree, so adding a carrier means adding a row here, not re-arguing an arity. Re-derive it with **`git grep -in hearth -- 'packages/**' 'tooling/**' 'scripts/**'`** — verbatim, and note BOTH corrections it carries, each one a refutation this cell already ate: **no `-w`** (there is no word boundary inside `HEARTH_OVERRIDE` / `THEME_HEARTH_ID` / `HomeHearthRoom`, which is how drafts 1 and 2 missed carriers) and **`tooling/**` in the pathspec** (a `packages/**`-only census is blind to the ui-audit judge and the `--theme` help, which is how draft 3 did). `tests/**` is deliberately OUT of scope — its fixtures MIRROR the carriers rather than being them, and each carrier cites its own pin. `scripts/**` currently yields only the rpg-extraction probe CAPTURES (`scripts/probes/rpg-extraction/*.json` — recorded model prompts whose fiction says "the hearth dominates the far wall"); it stays in the pathspec so the next re-derivation sees that for itself instead of re-widening. A new palette-sense site outside this list is a defect on sight. |
| Home's dominant LEAD column — the rooms you came back for and the doors out of them | **the hearth** (lowercase; a REGISTER word for home's focal region, never shown as a label — the surface says "Recent chats" / "Resume →") | `hearth` as a `HOME_TILE_REGIONS` member (`state/home-tile-contracts.ts`) + `HomeHearthRoom` / `home-hearth-room.tsx` / `data-home-hearth` | landed, CONFORMING (#1220). |
| Re-entering a room that already exists, as opposed to minting one | **Resume** (the verb, always leading the accessible name: `Resume <room title>` on home's hearth island, `Resume the chat with <character>` where the affordance names a PERSON rather than a room) | `resumeChat` (`state/active-chat-store.ts` — the one intent: make the room active AND land in Chats) · `onResume` / `ShelfFaceResume` (`features/character/components/character-shelf-face.tsx`) · `onResume` (`features/chat/components/home-hearth-room.tsx`) · `CharacterSummary.lastChatId` (the room a resume door opens) | landed (#1662). **Its opposite number is `New` / `Start`, which MINTS a room** — a door that says Resume and creates one, or that says nothing and resumes, is the `duplicate-action-door` finding this row was written for: the Characters landing's Recently-chatted faces and the library rows beside them were both named `<character>` and led to different places. The word is NOT spent on re-entering an EDITOR (a character is *opened*), and not on retrying a failed run (that is *Retry*). |
| A group of controls that NARROW a list, and the disclosure that hosts them where the pixels have to be bought back | **Filters** (always plural, always the bare noun as the group's own name; the individual control keeps its own words — `Show chats up to`, `Filter by character`) | `aria-label="Filters"` / `kicker="Filters"` on the Characters pane's narrowing group (`features/character/components/character-filter-chips.tsx`, the program #102 variant B naming and the group #491's law is about) · the plugin browse rail's disclosure trigger (`features/plugin/components/plugin-browse-nodes.tsx`) · `FILTERS_LABEL` + `phoneFiltersLabel` (`features/chat/lib/chat-list-scope.ts`), the chats pane's phone Filters row | landed, CONFORMING (#1718). **The word was already landed on two surfaces and is REUSED, not minted** — the row exists because a THIRD carrier now has to say what is in force as well as what the group is, and that grammar needed one home. It is `Filters: chats with <character>, up to <month>` — the group head, a colon, then one clause per axis in the panel's own order (character first); nothing in force is the bare noun. **A COLON, never an em-dash** (this codebase reads an em-dash in product copy as a copy tell — `character-library-welcome.tsx`'s week line states it) and never the middle dot the retired faces trigger used, which is a separator between PEERS and wrong where a head governs a tail. The disclosure's own open/closed words are NOT this row's: the Characters pane says `Fewer filters` / `More filters` on a `RailAction`, which is a different affordance. |
| One entry in the world-info library — a store of keyword-triggered lore entries a room can attach (#1777, found missing by the #1762 handoff confirm) | **World book** (a document's noun form; the library group is **World Info** / **World info**) | `worldBook` (`TAG_TARGET_TYPES`, `contracts/src/tag/index.ts:14`); db table family `world_books` | **DIVERGENT — owner fork, not resolved here.** The #1762 handoff confirm rules "world books" the established spelling (`features/chat/components/member-row.tsx:301,317`: "world books" is stated to be "this app's own spelling for the noun everywhere else it is shown"), and the newest surfaces agree — `features/config/lib/config-copy.ts:22` ("World books hold the lore…"), `features/tag/lib/tags-model.ts:78` (`worldBooks: "world book"`), `features/persona/components/persona-world-books-section.tsx`, `features/character/components/character-relations-tab.tsx` ("Linked world books"), `features/notifications/components/handoff-accept-confirm.tsx:47`. **But the tree census REFUTES "everywhere else":** a rendered-string count finds MORE "lorebook"/"Lorebooks" sites (36) than "world book"/"world books" (25), concentrated on the CHAT surface the #1762 confirm itself sits beside — `features/chat/components/chat-books-section.tsx` (the room's "Lorebooks" section body + empty-state copy), `features/chat/components/add-chat-book-dialog.tsx` ("Attach a lorebook to this chat", the picker's own strings), `features/chat/components/settings-context-tab.tsx:196,245,249` (the room's `HeadingWithCount label="Lorebooks"`, `sectionId="lorebooks"`), `features/chat/hooks/use-chat-book-mutations.ts`, `features/plugin/lib/plugin-copy.ts:90-96` (the plugin capability copy), `features/automation/components/rule-preset-knob-field.tsx`, `features/preset/components/prompt-assembly/marker-copy.ts:148-155` (World-info marker subtitles), and `data/restore-card-lorebook.ts`. This row lands with the NEWER word ("World book") because that is the design/tag/config-tier ruling and the direction #1762 committed to, but the "Lorebook" residue is NOT a copy fix owed by this lane — it is an owner-fork: **default if unanswered — treat #1762's ruling as the target spelling and file the "Lorebook" sites as a follow-up copy sweep**, since reversing #1762's own stated premise instead would mean re-opening a commit that landed hours before this row |

**`hearth` names TWO concepts and that is deliberate** (#1220 — it had zero rows here until then, which
is why it needed one). They never collide because each owns a DISJOINT carrier: the palette is only ever
one of the carriers the row LISTS (the resolver, the token contract, the db seed row + seeder, and the client's
one mirrored display name) — never a `[data-theme]` value, because it has none — and the region is only ever
a `HOME_TILE_REGIONS` member, a `HomeHearth*` component, or the `data-home-hearth` attribute. **The tell
that a site has crossed: a theme-pipeline file naming home's column, or a home file spelling a colour
against "Hearth" instead of a token.** `home-hearth-room.tsx`'s own header states that second half in
place ("EVERY COLOUR HERE IS A PER-THEME TOKEN, not a Hearth literal … 'Hearth Room' is the REGISTER,
never a palette"), and the swept tree had zero crossings at #1220. A THIRD sense — config's "welcome
hearth" launcher landing — died with `ConfigWelcome` (#1210, `6b00c37fd`); the surviving mentions are
archaeology naming a retired surface, not a live use, and no new one may be minted.

## Concepts still spelled `cast` that this map has NO word for (found by #903 C2) — **EMPTY as of 2026-09-05**

The map's own instruction is *"if the concept you need is not in the table, that is a finding: say so
rather than minting a word."* This section was that finding — each row a REAL distinct concept the
rename waves had never had a word for, so #903 deliberately left it alone rather than invent one.
**A `cast` in `domain/chat/**` or `contracts/src/chat/**` is otherwise a defect on sight** (D137(F)),
so this list is the complete set of chat-side survivors and must shrink, not grow. It has now shrunk to
NOTHING — the two closures below took the last two rows. The section stays (with its re-derivation
command and its false-stem fence) because it is the thing a future census is checked AGAINST: a new row
here is a finding to route to the owner, never a word to mint locally.

**The handoff-offer rows CLOSED (#1649, owner-ruled arm (a) 2026-09-05):** the persisted wire field and its
three readers were renamed to `copyCharacters` (the seated-characters row above owns the word) WITH a
boot-time data migration over live `pending_handoff_offer` blobs and no read-compat shim
(`entry/boot/migrate-handoff-offer-vocab.ts`), together with `offerCast` → `offerCharacters` (the
observability key) and the chats-list `summaryCast` → `summaryParticipantNames`.

**Re-derive this table before trusting it** — it is a census, not a memory:
`/usr/bin/grep -rn --exclude-dir=node_modules -iE 'cast[A-Z]|\bcast\b' packages/server/src/domain/chat packages/contracts/src/chat packages/client/src/features/chat`,
then fence the false stems below. What that census legitimately still prints, and which is NOT a row here:
`castId` coercions and TYPE-cast prose, dated pre-#903 archaeology (a comment saying a symbol "was spelled
`cast`"), and the rpg register's own `cast` (`rpgCastSlug`, the seeder's `{kind:"cast"}` actor ref — #906).
Everything else IS a row.

**The prose-slot id row CLOSED (#1737, owner-ruled arm (a) 2026-09-05) — the LAST row:** the persisted
`home: "preset"` slot id `chat.group.castMember` became **`chat.group.characterHeading`**
(`contracts/src/chat/prose.ts` · `contracts/src/prose-slot/index.ts` · `contracts/src/preset/index.ts` ·
`contracts/src/prose/prose-baseline.json` · the reader `domain/chat/assembly/assemble.ts`), WITH a boot-time
data migration re-keying every host's stored `promptConfig.prose` override and CARRYING its `baseVersion`
stamp, and no read-compat shim (`domain/preset/persistence/migrate-prose-slot-vocab.ts`, run from
`entry/boot/migrate-prose-slot-vocab.ts`). The word is the seated-characters row above; the `Heading` suffix
is the one the slot's own group siblings already carry, and **`Member` was deliberately NOT used** — this map
gives `Member` to the HUMANS in a room, so a `…Member` suffix on a character-only slot would have swapped one
crossed word for another. The slot's `version` stays 2: the TEXT did not change, only the key it is stored
under. The 2026-08-30 ruling recorded in the slot's own header survives with its INPUT changed — it warned
against a SILENT id edit stranding every host's stamp, and this edit is neither silent nor stamp-stranding.

## The regex register (#1742 — the room's Regex section)

The words the room's **Regex** section speaks. Minted 2026-09-05 with the owner-approved design
(`docs/design/mocks/regex-section/DESIGN.md` §4, "regex approved" on v2), and recorded here BEFORE the
strings exist because that is this file's own instruction — *"when a word changes, it changes HERE
first"*. **The section's server half landed with the mint; its client half is the #1742 build.** A row
whose carrier column says *unbuilt* is a word this map has already DECIDED, not a word still open: the
build writes that string, it does not re-choose it.

The half of the vocabulary that is **REUSED, never re-minted** — each already shipping in the same pane,
which is exactly why it is reused (a room-scoped rack that says `Everywhere` two sections apart and
`Global` here would be two words for one scope):

| Reused word | Its shipped carrier |
| - | - |
| **Everywhere** · **This chat** | the Documents rack's own scope chips in the SAME tab (`features/chat/lib/chat-documents-model.ts` — `SOURCE_LABELS.global` / `.chat`) |
| **Attach a script** | the lorebook grammar it is modelled on: `Attach a lorebook` (`features/chat/components/chat-books-section.tsx:91`, dialog title `add-chat-book-dialog.tsx:86`) |
| **Detach from this chat** | shipped verbatim in both racks (`chat-books-section.tsx:122`, `chat-documents-section.tsx:287`) |
| **Show my display scripts to everyone** | shipped — the D121-E host broadcast switch, MOVED into this section from `Host controls › Appearance` |
| **Open your script library** | shipped — the neighbouring hand-off (`components/regex-script-picker.tsx:225`, `features/character/components/character-facet-inspector.tsx:175`); `Open in library` below is its per-ROW sibling, not a second spelling of it |

| Concept | The user-facing word | Code spelling (when different) | Status |
| - | - | - | - |
| The room's regex disclosure section — one place to see and switch what runs here | **Regex** (section) | `sectionId: "regex"` in the This-chat tab | minted #1742; section **unbuilt** (the server read + the levers landed) |
| The room's MASTER switch — the debugger's A/B lever | **Run regex in this chat** | `ChatMetadata.regexEnabled` · the `{kind:"master"}` arm of `chat.setRegexAllow` | minted #1742; the metadata key + verb **landed**, the switch unbuilt |
| The tier a script runs at, as a provenance kicker | **From the preset · \<name>** / **From \<character>** | `RegexTierKey` — `"preset"` / `character:<id>` (`contracts/src/chat/regex-tiers.ts`) | minted #1742; BUILT #1754 (the preset name rides `RegexTierGroupView.label` from `chat.listEffectiveRegex`; a preset-less room says the bare **From the preset**). The other two tiers reuse **Everywhere** (`"global"`) and **This chat** (`"chat"`) above — the key is the CODE spelling, the chip is the word |
| The per-ROW hand-off to the script's editing home in Config | **Open in library** | — | minted #1742; unbuilt. Distinct from **Open your script library** (the whole-library door) by design: this one names ONE row's destination |
| WHERE A ROW SITS IN THE ROOM'S RUN ORDER, spoken (the visible numeral is decorative — `ListRow`'s `leading` slot is `aria-hidden` by contract) | **Runs \<n> of \<m>** | `runsAt` / `effective.length` (`chat.listEffectiveRegex`), carried as `aria-posinset`/`aria-setsize` + an `sr-only` line in the title lane | minted #1755; **landed**. `<m>` is the ROOM's effective count, never the tier's own row count — a tier draws a SUBSET of the run order. An UNRANKED row (its tier off here; or a member, whose read carries no run order) says nothing at all: a position in a set the row is not in is the same lie the `—` numeral exists to avoid |
| A chat-tier script the CURRENT host does not own (#1739 — attached by a previous host) | **previous host** (a mark, never a button) | — | minted #1742; **landed**. The mark names what the sitting host cannot do: `enabled` is the LIBRARY row's and stays owner-gated, so the row draws no switch. It is NOT a statement about the room — `detachFromChat` gates on the ROOM alone (#1739 removed its script-ownership re-check, the `chat_books` posture), so the row's menu offers **Detach from this chat** and only that. The rationale minted here first — "the new host can neither switch it nor detach it" — was HALF retired by that fix; the mark survives, its INPUT changed |
| One executable find/replace rule in the regex library (#1777, found missing by the #1762 handoff confirm) | **Regex script** (a document's noun form; the library section is **Regex scripts**) | `RegexScriptRow` / `RegexScriptId` (`contracts/src/regex/index.ts`) | landed, CONFORMING — retroactively ruled, not minted here. Predates #1742 (the D121-E library build, `5671aba6b`); this row exists because the section built on top of it had no entry naming the SCRIPT itself, only the section (row above) and its sub-parts. Receipts: the library's own group label `features/regex/lib/regex-group.tsx:22` (`"Regex scripts"`), the collection's aria-labels `features/regex/components/regex-collection-rows.tsx:182,208`, the CRUD toasts `features/regex/hooks/use-regex-library.ts:18,24,30,38`, the handoff confirm's own line `features/notifications/components/handoff-accept-confirm.tsx:52` (`countLine(offer.regexScripts, "regex script", "regex scripts")`), and the member-row hand-off label (row below). Bare **script** is used CONTEXTUALLY once a Regex-scoped heading is already on screen (e.g. `regex-collection-rows.tsx:281` "Deleting a script…") — that is the same house style as `world-info`'s bare "book" (see the world book row), never a second mint |

## The rpg register (D151 · `AGENTS.md` §3)

Game-register words — `party`, `npcs`, `quest`, `encounter`, `journal`-as-game-log — live inside the
rpg domain and its surfaces and may **never** name a non-game concept. Conversely **an rpg surface
naming a CHAT concept takes the chat word** (that is what makes `promoteActor`'s destination
legible): the Status tab's seated characters are **Characters**, not "the roster"; the scene's
on-stage set is **the present characters**.

| Concept | The user-facing word | Code spelling (when different) | Status |
| - | - | - | - |
| Tracker carrier classes | **Party** (in-game) | `party` / `npcs` / `everyone` | conforming, ratified in place |
| A scene-only NPC (no card, slug-keyed, promotable) | in-game | `npc` (`RpgNpcRef` / `npcKey` / `rpgNpcSlug` / `npc:<slug>` / `RPG_NPC_GUIDE_FIELDS`; client `NpcCard` / `SceneNpcs`) | **landed (#906)**, by one codemod (`scripts/codemods/rename-rpg-cast-npc.ts`). It is a JSON *value* rename, so it does NOT trip the dev-db reset and a pre-#906 snapshot breaks three ways — the receipts are `tests/server/domain/rpg/stale-actor-key.suite.int.test.ts`; the owner ruled the remedy a dev-db WIPE, not a migration. RESIDUE, each a DIFFERENT concept and none of it this row: `RpgTrackerView.cast` + `presentCast` + `presentCastRenderer` (the PRESENCE plane — its word is *the present characters*) · the prose slot id `rpg.reminder.castHeader` and the `{{rpgCast}}` macro + the `"cast"` prompt-section id (persisted preset keys; a rename is the #1737 data-migration class) · the `{{expr::rpg.cast[]}}` CEL binding key · `cast-field` archaeology (a deleted concept) · `castId` (row 54) |
| A future cross-game NPC library row (`rpg_npcs`) | — | `libraryNpc` (the reserved actor-ref arm `{kind:"libraryNpc"}` + its `RpgLibraryNpcId` brand) | **landed (#906)**, still unbuilt. `npcRow` was the other candidate; `libraryNpc` won because an actor-ref arm addresses a PERSON from the cross-game library, not a storage row. The reservation itself is D121(F) (`Core-Path-Registry.md`) |
| The per-room preset override a game's turns speak in — the D60 GM-preset binding (#1777, found missing by the #1762 handoff confirm) | **GM voice** | `rpg_games.gmPresetId` / `RpgConfigView.gmPresetId` / `copyGmPreset` (`contracts/src/chat/roster.ts`) | landed, CONFORMING — ruled in place, not minted here (#1032). Receipts: `features/rpg/components/rpg-gm-voice.tsx:19-23` (the knob's own header: `"GM voice" is already the app's live user-facing word for exactly this binding — the preset panel's usage readout says it in shipped copy"`) and `features/preset/components/readout/usage-readout.tsx:43,46,47,92` (the usage readout's "GM voice in N games" rows). **Naming it from CHAT is not a register crossing**: `features/chat/components/member-row.tsx:301` (the host-handoff checkbox: "…regex scripts & GM voice used in this room") and `features/notifications/components/handoff-accept-confirm.tsx:55` both say "GM voice" from outside the rpg domain, which the register-boundary paragraph above explicitly allows — the GM preset IS a game concept (D60's drive-axis binding), so a chat surface naming it takes the game's OWN word rather than inventing a chat-side synonym; the crossing that is banned runs the other direction (an rpg surface naming a chat concept in game vocabulary) |

**False stems — not this vocabulary:** `third-party` / `first-party`, `broadcast` / `forecast` /
`podcast`, and `castId`. Any sweep or gate over these stems must fence them explicitly.

## The connection register (D109's 6-mode canon)

A connection is named by its `(api × source)` pair, never by a marketing word. `deriveRunner`
(`infra/providers/roles/dispatch.ts`) IS the authority — it is exhaustive and fail-closed, so an
unlisted pairing is a typed `ProviderError`, not a mode. These are the words to use in a brief, an
issue or a review when naming which mode a receipt was taken on; the runner/backend column is
infra-internal vocabulary and **never appears inside the server domain tier or in user-facing copy**
(`Tier-3b-Providers.md` — `runner`/`family` stay sealed in infra).

| The spoken name | `api` | `source` | backend (infra-internal) |
| - | - | - | - |
| claude code sub | `agent-sdk` | `max-pro-sub` | `agent-sdk` |
| claude code via openrouter key | `agent-sdk` | `openrouter` | `agent-sdk` |
| chat complete openrouter | `chat-completions` | `openrouter` | `openrouter` |
| vllm chat complete | `chat-completions` | `vllm` | `vllm` |
| custom byo endpoint | `chat-completions` | `custom_openai` | `custom-openai` |
| openrouter responses | `responses` | `openrouter` | `openrouter` |

Standing confusion-killers, all fail-closed in the same switch: `agent-sdk` is the only stateful
backend and the only `max-pro-sub` path; `responses` is OpenRouter-only; `local-light` never serves a
chat turn; `max-pro-sub` never speaks chat-completions; and **local vLLM is chat-completions-ONLY**
(the `agent-sdk × vllm` loopback skin was retired by owner ruling 2026-07-27 and now throws). The
purged `anthropic-messages` api and the first-party `anthropic` source are not members of either
axis — do not resurrect either word.

## Enforcement

**Prose-enforced by owner ruling — there is no gate** (`AGENTS.md` §3 states this for the register
boundary, and it holds for the whole map). The honesty mechanism is therefore the sweep: a crossed
word is a drifted-comment defect, fixed on sight, and a rename PROGRAM's waves must be cut so their
UNION provably covers the surface — with an explicit owner for any file two waves both fence off
(the #914 defect: #902 and #905 each fenced `features/persona/**` off as the other's problem, so
nobody owned the intersection and the most visible generic-`roster` surface in the tree survived).
A gate (`rpg-register-fence`) was priced in the 2026-08-30 review and is not built.
