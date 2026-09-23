---
kind: law
status: active
updated: 2026-09-23
---

# THE VOCABULARY MAP — one concept, one word

> **THE SOURCE OF TRUTH FOR WHICH WORD NAMES WHICH CONCEPT.** Everything else — D151, the
> `Constitution.md` §3 register paragraph, a lane brief, a review — cites this file. Nothing copies its
> rows: a table with two homes drifts the moment a word changes.
>
> **Derivation, not taste.** The word for a concept follows the tier that owns the concept
> (`AGENTS.md` "Package direction"). The full derivation and the priced options are recorded in the
> vocab-unification stickler review. This file is the living result: when a word changes, it changes
> here first.

## How to use this

**Before you write a user-facing string, an id, a testid, or a comment that names one of these
concepts: look it up here.** Do not decide locally, and do not copy the word off a neighbouring file —
a neighbouring file can still carry an old word. If the concept you need is not in the table, that is a
finding: say so rather than minting a word.

## The map

| Concept | The user-facing word | Code spelling (when different) | Status |
| - | - | - | - |
| A library character | **Character** | `character` | landed |
| A library persona | **Persona** | `persona` | landed |
| The humans in a room | **People** (section) · **Host** / **Member** | `member` / `host` (`chat_participants.kind='human'`) | landed |
| **The characters seated in a room** | **Characters** (section) | `character` (`chat_participants.kind='character'`) | landed. The code half — the `MembersRow` discriminant `kind: "character"`, `chat-character-bar.tsx`, the `chatCharacterBar` testid, `CharacterAvatars`/`CharacterSeat`/`characterMenuItems`/`CharacterInlineCluster`, the `MembersPanel` `characters`/`charactersAction` seam, the `character-chip`/`members-characters` slots and the e2e locators. |
| Every identity a chat references (characters ∪ personas, incl. departed) — the name/avatar directory | — | `ChatIdentity` / `identityKey` / `ChatDetail.identities` / `MessagesPage.identities`; producer `loadChatIdentityProducer` (`domain/chat/persistence/identity.ts`); axis `CHAT_IDENTITY_KINDS` / `ChatIdentityKind` / `CHAT_IDENTITY_KIND_POLICY`; projections `buildIdentityNameContext` / `buildIdentityAvatarMaps` | landed |
| Present, seated characters the arbiter may drive (the D60 drive axis) | — | `AssembleContext.characters` / `speakerRefs` / `characterIds` / `unmutedCharacters` (`domain/chat/assembly/context.ts`) | landed |
| The present characters' names as a macro/label feed (`{{group}}`, the speaker-label plain alphabet) | — | `characterNames` / `unmutedCharacterNames` (`@orb/kit/macro` `MacroContext` + `RowMacroNameContext`, `@orb/kit/speaker-label`) | landed |
| The present characters' `{ref, name}` pairs the arbiter picks a speaker from | — | `SpeakerCandidate` (`domain/chat/contract/arbitration.ts`) / `room.speakerCandidates` / `joinedCandidateName` / `candidateCharForHostRow`; the narrator round's own name field is `narratorSpeakerName` (`engine/round.ts`) | landed |
| The `AssembleContext.speaker` variant where one generation voices everyone (narrator mode) | — | the string value `"multi-voice"` in `speaker: { kind: "multi-voice"; … }` (`contracts/src/chat/assemble.ts`) + its readers in `assembly/assemble.ts`, `assembly/macros.ts`, `assembly/speaker-card.ts` | landed. `"narrator"` is unavailable (it already names the sibling `GroupOutput` axis) and `"all"` reads as a filter, so the word names the generation mode. |
| The founding / seated character ids an import or a backfill writes | — | `characterIds` (`ResolvedCharacterIds` in `domain/import/verbs/import-chat-bundle.ts`; `rosterRows` in `chat/persistence/import-write.ts`; `loadCharacterIdsAndHost` in `chat/substrate/backfill.ts`) — including the wire field `BulkImportChatInput.characterIds` (`contracts/chat/bulk-import.ts`) and the mapper deps shape that feeds it, `GroupChatInputDeps.characterIds` (`domain/import/contract/views.ts`) | landed. Matches the drive axis above. The function `seatedCharacterIds` takes a parameter named `additionalCharacterIds`: that call site already binds `characterIds` for the result, so the parameter holds only the extras beyond the primary. The function name `rosterRows` is not this row's word — it builds the participants rows (below) and belongs there. |
| The seated characters' regex-scope slice | — | `HostTierRegexSources.character` / `ResolvedRegexSources.character` | landed. Its junction table already said `character_regex_scripts`. |
| The room composition the carried-appearance rules read | — | `CarriedAppearance` (+ `carriedAppearanceFromParticipants` / `isSingleHumanRoom` / `resolveCarriedBackgroundForAppearance` / `useCarriedAppearance`) | landed |
| **The room's participants (humans + characters together)** | — | `participants` (server chat domain: `persistence/participants-read.ts`, `verbs/participants.ts`, `verbs/resolve-rpg-participants.ts`, `substrate/participants-host.ts`, `participants-humans.ts`, `loadParticipants`, `buildInitialParticipantRows`, `createParticipants`, `createResolveRpgParticipants`, `ResolveRpgParticipants`, `RpgParticipantActor`) | landed for the server chat domain. The db table already says `chat_participants`. Still open, each needing its own word ruling: the `speakerOffRoster`/`"speaker_off_roster"` op code (client-observable); the `"roster-card-read"` capability id (its fix string lives in `tooling/`); `contracts/src/chat/roster.ts` + `rosterMemberSpecSchema`; the client (`features/chat/lib/roster.ts`, `use-roster-*`); and the `roster_char` SQL alias (`entry/compose/assets-character.ts:200`). |
| The asker's membership role fed to `can()` | — | `ChatMembership` (`contracts/identity`) and `membership` for every field that holds one: `ChatResource.membership` (`contracts/identity`), `ChatToolExecFrame.membership` (`chat/contract/context.ts`), `TurnPrep.toolMembership` (`chat/contract/results.ts`), `ToolExecutionContext.membership` (`tool-use/contract/params.ts`), and the `decideChat(action, membership)` parameter (`admin/guard.ts`) | landed |
| **A stored versioned-config blob this build cannot read faithfully** | **couldn't be read** (never "corrupt", never "invalid") | `configUnreadable` (`PresetDetail` / `UserSettingsView`), `VersionedParseFailure` (`contracts/versioned-config`), `stored_config_unreadable` (the wire refusal code, `@orb/server/kit` `stored-config`), the `unreadable` `SAVE_LIFECYCLE_STATES` member | landed. The user-facing word follows the one already shipped on the preset readout's failure band (`features/preset/lib/resolve-failure.ts`: "This preset couldn't be read"), so the two surfaces that say it say it identically. "Corrupt" is deliberately not the word: the commonest cause is a blob written by a newer build, which is intact data this one is too old to represent. |
| The repair for the above | **Reset** (to "the default" / "the defaults") | `preset.resetToDefault` · `settings.resetUserConfig` | landed. Never "restore" (that word is the backup-file door's) and never "fix": the act discards what is stored, and the copy says so. On a newer-version blob it is worded as the explicit last resort, never the first door. |
| A saved, named, reusable set of characters + seat knobs + captured rules | **Roster** · **Saved rosters** | `rosterPreset` — conforming, never renamed: the db table family, the `RosterPresetId` brand, the tRPC router key, and the domain/contracts/client directories already say it | landed |
| Your whole character library | **Your characters** | `character` | landed |
| Any generic "a list of X" | **list** | `XList` — `roster` is reserved for the saved template and may not be spent as English for "a list" | landed |
| The plugin host's character-seat read | — (plugin authors) | `chat.listCharacters` | landed |
| The per-user background execution engine, and the settings pane that runs/monitors it | **Jobs** (pane) · **Runs** (its first section) — "workload" is never shown to a user | `workloads` — the system/code noun everywhere: the `workloads` domain + db table family, the tRPC router key, the `workloads` stream channel, the `UserSettings.workloads` namespace, the `ConfigGroupId`, and the `config-anchor-workloads-*` anchors | landed, conforming — do not rename either half. Evidence: `packages/client/src/features/workloads/lib/workloads-group.tsx` (`id: "workloads"`, `label: "Jobs"`). The split between the code noun and the shown label is this table's own "code spelling (when different)" pattern. |
| A config group's id, as a vocabulary member | — | the owner's own exported id — `worldInfo` / `rosterPreset` stay camelCase beside kebab siblings | conforming, deliberate — not a casing defect. `packages/client/src/state/config-group-ids.ts` states it: a collection group keeps the id its owner already exports, since it rides the `data-collection` attributes the CTs address and keys the per-device disclosure store; a config-local kebab-ification would fork the id from the kind everywhere else. `rosterPreset` is additionally ruled never-renamed by the row above. |
| The branded-id type coercion | — | `castId` (`@orb/kit/ids`) | no action, deliberately. It is a type cast, not this concept family, and unambiguous by construction once "cast" leaves chat / roster-preset / rpg. |
| The DEFAULT seed palette — the base `@theme` ramp every un-themed surface paints from | **Hearth** (a palette name, always Capitalised, always beside another palette name: Light · Mocha · Hearth) | Carriers: theme pipeline — the resolver's base-set `orb.theme.id`, its modifier default and its empty context (`packages/ui/src/tokens/resolver.json:9,27,29` — three distinct roles); the token contract's `ThemeSet["id"]` / `themeMetaSchema` / `EXPECTED_THEME_META.base` / `expectedContexts` and its two resolver diagnostics (`packages/ui/token-contract.ts:126,168,539,595-600`). Db seed: `THEME_HEARTH_ID` / `THEME_HEARTH_NAME` (`packages/server/src/domain/settings/constants.ts:24,28`) and the seeder's `HEARTH_OVERRIDE` + `SEED_THEMES` row (`domain/settings/seed-themes.ts:27,77`). Server read seam: `toThemeView` derives the wire's `isDefault` from `THEME_HEARTH_ID` (`domain/settings/substrate/theme-views.ts:28`) — the one reader of that sentinel outside the seeder. Client: the mirrored display name is gone; the Looks active-card predicate and the fold caption read `theme.isDefault` off the view (`@orb/contracts/theme`'s `themeSchema`) instead of comparing a name. The word survives in one client site: the Looks search keyword (`features/settings/lib/appearance-looks-nav.ts:26`) — a search term, never a predicate. Tooling: the ui-audit evidence judge's seed-fidelity predicate, which encodes "Hearth stamps nothing" as executable law (`tooling/src/ui-audit/lib/evidence.ts:383-384` — `expected === "hearth" && render.rootDataTheme === null`); the seed-ink verifier's synthetic base palette (`tooling/src/verify/lib/seed-theme-ink.ts:105` — `{ name: "hearth", scheme: "dark", … }`); and `--theme`'s user-facing help copy, the one place the word is shown to a human outside the app (`tooling/src/_shared/theme.ts:97,99`). Not a carrier: it is not a `SeedThemeName`, has no `[data-theme]` value and no file under `tokens/themes/` — `SEED_THEME_VALUE_SETS` is generated from that directory and holds `light` + `mocha` only, and `dataThemeOf` returns `null` for Hearth because the shell paints it by stamping nothing (`packages/client/src/lib/resolve-theme-scope-tokens.ts:67-73`). `null` is its runtime spelling wherever a theme row or a `[data-theme]` value is optional. | landed, conforming. This cell is a list, never a count: adding a carrier means adding a row here, not re-arguing an arity. Re-derive it with `git grep -in hearth -- 'packages/**' 'tooling/**' 'scripts/**'` — without `-w` (there is no word boundary inside `HEARTH_OVERRIDE` / `THEME_HEARTH_ID` / `HomeHearthRoom`) and with `tooling/**` in the pathspec (a `packages/**`-only census is blind to the ui-audit judge and the `--theme` help). `tests/**` is deliberately out of scope — its fixtures mirror the carriers rather than being them, and each carrier cites its own pin. `scripts/**` currently yields only the rpg-extraction probe captures (`scripts/probes/rpg-extraction/*.json` — recorded model prompts whose fiction says "the hearth dominates the far wall"); it stays in the pathspec so the next re-derivation sees that for itself. A new palette-sense site outside this list is a defect on sight. |
| Home's dominant LEAD column — the rooms you came back for and the doors out of them | **the hearth** (lowercase; a register word for home's focal region, never shown as a label — the surface says "Recent chats" / "Resume →") | `hearth` as a `HOME_TILE_REGIONS` member (`state/home-tile-contracts.ts`) + `HomeHearthRoom` / `home-hearth-room.tsx` / `data-home-hearth` | landed, conforming |
| Re-entering a room that already exists, as opposed to minting one | **Resume** (the verb, always leading the accessible name: `Resume <room title>` on home's hearth island, `Resume the chat with <character>` where the affordance names a PERSON rather than a room) | `resumeChat` (`state/active-chat-store.ts` — the one intent: make the room active AND land in Chats) · `onResume` / `ShelfFaceResume` (`features/character/components/character-shelf-face.tsx`) · `onResume` (`features/chat/components/home-hearth-room.tsx`) · `CharacterSummary.lastChatId` (the room a resume door opens) | landed. Its opposite is `New` / `Start`, which mints a room — a door that says Resume and creates one, or that says nothing and resumes, names two different destinations with one word. The word is not spent on re-entering an EDITOR (a character is *opened*), and not on retrying a failed run (that is *Retry*). |
| A group of controls that NARROW a list, and the disclosure that hosts them where the pixels have to be bought back | **Filters** (always plural, always the bare noun as the group's own name; the individual control keeps its own words — `Show chats up to`, `Filter by character`) | `aria-label="Filters"` / `kicker="Filters"` on the Characters pane's narrowing group (`features/character/components/character-filter-chips.tsx`) · the plugin browse rail's disclosure trigger (`features/plugin/components/plugin-browse-nodes.tsx`) · `FILTERS_LABEL` + `phoneFiltersLabel` (`features/chat/lib/chat-list-scope.ts`), the chats pane's phone Filters row | landed, conforming. The word is reused across surfaces, never re-minted. When something is in force, say it as `Filters: chats with <character>, up to <month>` — the group head, a colon, then one clause per axis in the panel's own order (character first); nothing in force is the bare noun. Use a colon, never an em-dash (this codebase reads an em-dash in product copy as a copy tell — `character-library-welcome.tsx`'s week line states it) and never a middle dot, which is a separator between PEERS and wrong where a head governs a tail. The disclosure's own open/closed words are NOT this row's: the Characters pane says `Fewer filters` / `More filters` on a `RailAction`, which is a different affordance. |
| One entry in the world-info library — a store of keyword-triggered lore entries a room can attach | **World book** (a document's noun form; the library group is **World Info** / **World info**) | `worldBook` (`TAG_TARGET_TYPES`, `contracts/src/tag/index.ts:14`); db table family `world_books` | landed. Code spellings stay untouched: `lorebookId`, `reserveKey="chat.context.lorebooks"`, `sectionId="lorebooks"`, `restore-card-lorebook`, `BulkImportLorebook*`, `use-persona-lorebooks.ts`. |

`hearth` names TWO concepts, deliberately. They never collide because each owns a DISJOINT carrier: the
palette is only ever one of the carriers the row above lists (the resolver, the token contract, the db
seed row + seeder, and the client's one mirrored display name) — never a `[data-theme]` value, because
it has none — and the region is only ever a `HOME_TILE_REGIONS` member, a `HomeHearth*` component, or
the `data-home-hearth` attribute. The tell that a site has crossed: a theme-pipeline file naming home's
column, or a home file spelling a colour against "Hearth" instead of a token. `home-hearth-room.tsx`'s
own header states that second half in place ("EVERY COLOUR HERE IS A PER-THEME TOKEN, not a Hearth
literal … 'Hearth Room' is the REGISTER, never a palette"). No third sense may be minted.
`ConfigWelcome` has no "welcome hearth" launcher landing; any surviving mention of that phrase names a
dead surface, not a live third sense.

## Concepts still spelled `cast` with no word in this map

This section holds concepts the rename waves have not yet named. This map's own rule: if the concept
you need is not in the table, that is a finding — say so, do not mint a word locally. A `cast` in `domain/chat/**` or
`contracts/src/chat/**` is a defect on sight (D137(F)), so this section is the complete set of chat-side
survivors and must shrink, never grow.

Empty.

Settled outside this table, so the census does not flag them: the handoff wire field
`copyCharacters`, `offerCharacters`, `summaryParticipantNames`, and the prose slot id
`chat.group.characterHeading` all say `character`, never `cast` or `roster`. `Member` names only the
humans in a room (the row above); a character-only slot never takes a `…Member` suffix, because that
would swap one crossed word for another. A rename of a persisted preset key ships a boot-time data
migration with no read-compat shim (`entry/boot/migrate-handoff-offer-vocab.ts`,
`domain/preset/persistence/migrate-prose-slot-vocab.ts`, `entry/boot/migrate-prose-slot-vocab.ts`);
`rpg.reminder.castHeader`, `{{rpgCast}}`, and the `"cast"` section id follow the same rule when renamed.

Re-derive it before trusting it — it is a census, not a memory:
`/usr/bin/grep -rn --exclude-dir=node_modules -iE 'cast[A-Z]|\bcast\b' packages/server/src/domain/chat packages/contracts/src/chat packages/client/src/features/chat`.
Exclude the false stems (below) from what it prints. Also not a row: `castId` coercions and
type-cast prose, an archaeology comment quoting an old symbol name, and the rpg register's own `cast`
(`rpgCastSlug`, the seeder's `{kind:"cast"}` actor ref). Everything else the census prints is a row.

## The regex register

A row whose carrier column says *unbuilt* is a word this map has already decided, not a word still
open: the build writes that string, it does not re-choose it.

Words the room's Regex section speaks. The half below is REUSED, never re-minted — each already
shipping in the same pane, which is why it is reused (a room-scoped rack that says `Everywhere` two
sections apart and `Global` here would be two words for one scope):

| Reused word | Its shipped carrier |
| - | - |
| **Everywhere** · **This chat** | the Documents rack's own scope chips in the SAME tab (`features/chat/lib/chat-documents-model.ts` — `SOURCE_LABELS.global` / `.chat`) |
| **Attach a script** | the world book grammar it is modelled on: `Attach a world book` (`features/chat/components/chat-books-section.tsx:91`, dialog title `add-chat-book-dialog.tsx:86`) |
| **Detach from this chat** | shipped verbatim in both racks (`chat-books-section.tsx:122`, `chat-documents-section.tsx:287`) |
| **Show my display scripts to everyone** | shipped — the D121-E host broadcast switch, moved into this section from `Host controls › Appearance` |
| **Open your script library** | shipped — the neighbouring hand-off (`components/regex-script-picker.tsx:225`, `features/character/components/character-facet-inspector.tsx:175`); `Open in library` below is its per-ROW sibling, not a second spelling of it |

| Concept | The user-facing word | Code spelling (when different) | Status |
| - | - | - | - |
| The room's regex disclosure section — one place to see and switch what runs here | **Regex** (section) | `sectionId: "regex"` in the This-chat tab | minted; section unbuilt (the server read + the levers landed) |
| The room's MASTER switch — the debugger's A/B lever | **Run regex in this chat** | `ChatMetadata.regexEnabled` · the `{kind:"master"}` variant of `chat.setRegexAllow` | the metadata key + verb landed, the switch unbuilt |
| The tier a script runs at, as a provenance kicker | **From the preset · \<name>** / **From \<character>** | `RegexTierKey` — `"preset"` / `character:<id>` (`contracts/src/chat/regex-tiers.ts`) | built (the preset name rides `RegexTierGroupView.label` from `chat.listEffectiveRegex`; a preset-less room says the bare **From the preset**). The other two tiers reuse **Everywhere** (`"global"`) and **This chat** (`"chat"`) above — the key is the CODE spelling, the chip is the word |
| The per-ROW hand-off to the script's editing home in Config | **Open in library** | — | unbuilt. Distinct from **Open your script library** (the whole-library door) by design: this one names ONE row's destination |
| WHERE A ROW SITS IN THE ROOM'S RUN ORDER, spoken (the visible numeral is decorative — `ListRow`'s `leading` slot is `aria-hidden` by contract) | **Runs \<n> of \<m>** | `runsAt` / `effective.length` (`chat.listEffectiveRegex`), carried as `aria-posinset`/`aria-setsize` + an `sr-only` line in the title lane | landed. `<m>` is the ROOM's effective count, never the tier's own row count — a tier draws a SUBSET of the run order. An UNRANKED row (its tier off here; or a member, whose read carries no run order) says nothing at all: a position in a set the row is not in is the same lie the `—` numeral exists to avoid |
| A chat-tier script the CURRENT host does not own (attached by a previous host) | **previous host** (a mark, never a button) | — | landed. The mark names what the sitting host cannot do: `enabled` is the LIBRARY row's and stays owner-gated, so the row draws no switch. It is NOT a statement about the room — `detachFromChat` gates on the ROOM alone, so the row's menu offers **Detach from this chat** and only that. |
| One executable find/replace rule in the regex library | **Regex script** (a document's noun form; the library section is **Regex scripts**) | `RegexScriptRow` / `RegexScriptId` (`contracts/src/regex/index.ts`) | landed, conforming. Evidence: the library's own group label `features/regex/lib/regex-group.tsx:22` (`"Regex scripts"`), the collection's aria-labels `features/regex/components/regex-collection-rows.tsx:182,208`, the CRUD toasts `features/regex/hooks/use-regex-library.ts:18,24,30,38`, the handoff confirm's own line `features/notifications/components/handoff-accept-confirm.tsx:52` (`countLine(offer.regexScripts, "regex script", "regex scripts")`), and the member-row hand-off label (row below). Bare **script** is used CONTEXTUALLY once a Regex-scoped heading is already on screen (e.g. `regex-collection-rows.tsx:281` "Deleting a script…") — the same house style as world-info's bare "book" (see the world book row), never a second mint |

## The rpg register (D151 · `Constitution.md` §3)

Game-register words — `party`, `npcs`, `quest`, `encounter`, `journal`-as-game-log — live inside the
rpg domain and its surfaces and may **never** name a non-game concept. Conversely **an rpg surface
naming a CHAT concept takes the chat word** (that is what makes `promoteActor`'s destination
legible): the Status tab's seated characters are **Characters**, not "the roster"; the scene's
on-stage set is **the present characters**.

| Concept | The user-facing word | Code spelling (when different) | Status |
| - | - | - | - |
| Tracker carrier classes | **Party** (in-game) | `party` / `npcs` / `everyone` | conforming, ratified in place |
| A scene-only NPC (no card, slug-keyed, promotable) | in-game | `npc` (`RpgNpcRef` / `npcKey` / `rpgNpcSlug` / `npc:<slug>` / `RPG_NPC_GUIDE_FIELDS`; client `NpcCard` / `SceneNpcs`) | landed. It is a JSON *value* rename, so it does NOT trip the dev-db reset; a stale snapshot written before this rename breaks three ways — evidence: `tests/server/domain/rpg/stale-actor-key.suite.int.test.ts`. The owner's remedy for a stale snapshot is a dev-db wipe, not a migration. RESIDUE, each a DIFFERENT concept and none of it this row: `RpgTrackerView.cast` + `presentCast` + `presentCastRenderer` (the PRESENCE plane — its word is *the present characters*) · the prose slot id `rpg.reminder.castHeader` and the `{{rpgCast}}` macro + the `"cast"` prompt-section id (persisted preset keys — a rename ships the boot-time migration in the cast section above) · the `{{expr::rpg.cast[]}}` CEL binding key · `castId` (row above) |
| A future cross-game NPC library row (`rpg_npcs`) | — | `libraryNpc` (the reserved actor-ref variant `{kind:"libraryNpc"}` + its `RpgLibraryNpcId` brand) | landed, still unbuilt. An actor-ref variant addresses a PERSON from the cross-game library, not a storage row. The reservation itself is D121(F) |
| The per-room preset override a game's turns speak in — the D60 GM-preset binding | **GM voice** | `rpg_games.gmPresetId` / `RpgConfigView.gmPresetId` / `copyGmPreset` (`contracts/src/chat/roster.ts`) | landed, CONFORMING — ruled in place. Evidence: `features/rpg/components/rpg-gm-voice.tsx:19-23` (the knob's own header: "GM voice" is already the app's live user-facing word for exactly this binding — the preset panel's usage readout says it in shipped copy) and `features/preset/components/readout/usage-readout.tsx:43,46,47,92` (the usage readout's "GM voice in N games" rows). Naming it from CHAT is not a register crossing: `features/chat/components/member-row.tsx:301` (the host-handoff checkbox: "…regex scripts & GM voice used in this room") and `features/notifications/components/handoff-accept-confirm.tsx:55` both say "GM voice" from outside the rpg domain, which the register-boundary paragraph above explicitly allows — the GM preset IS a game concept (D60's drive-axis binding), so a chat surface naming it takes the game's OWN word rather than inventing a chat-side synonym; the crossing that is banned runs the other direction (an rpg surface naming a chat concept in game vocabulary). |
| rpg's `roster` family — the room's participants / seated characters, named from the rpg domain (a CHAT concept, so the register boundary above gives it the chat word) | — (none new; the in-game copy already says "the room's characters") | `RpgParticipantActor` (chat's structural twin — `domain/chat/contract/context.ts:465`) · `resolveParticipants` / `RpgResolveParticipants` / `resolveRpgParticipants` / `participantActors` / `participantKeys` / `participantIndexFor` — an `ActorRefIndex` map (name→ref) takes `participantIndexFor`, never the list word `participants`; `RosterRefIndex` / `buildRosterRefIndex` are `ActorRefIndex` / `buildActorRefIndex` (chat's provider op is `createResolveRpgParticipants`) · `participantNames` (the array includes the user; use `characterNames` only where the array excludes the user) · `promoteToCharacter` / `RpgPromoteToCharacter*` / `buildPromoteToCharacter` (the destination is the room's CHARACTERS — `domain/rpg/verbs/promote-actor.ts:3-4`) · `participantOwnsPlayerName` (`entry/compose/rpg.ts`) · persona's `resolvePersonasForParticipants` / `ResolvePersonasForParticipants` / `PersonaListView` (`domain/persona/verbs/resolve-personas-for-participants.ts`) | landed across the rpg domain, persona and compose. Not this row: rpg `cast` → `npc` (its own row above); `speakerOffRoster` / `"roster-card-read"` / `contracts/src/chat/roster.ts` / the client `roster` family / the `roster_char` SQL alias (the participants row's residue, above — its own row). |

**False stems — not this vocabulary:** `third-party` / `first-party`, `broadcast` / `forecast` /
`podcast`, and `castId`. Any sweep or gate over these stems must exclude them explicitly.

## The connection register

| Code word | Product word |
| - | - |
| `binding` | **Model roles** |
| `wire` | SEALED — package-internal only |
| `dialect` | SEALED — package-internal only |
| `task` | SEALED — use the six model-role labels |
| `kind` | SEALED — use the model-role task phrasing |
| `declared` | **What this server accepts** |
| `features` | **Endpoint quirks** |
| `extras` | **Extra request fields** |
| `transport` | **Request & response shaping** |

**The `source` axis is not used; D109's six-mode canon goes with it.** A connection is named by its
`(provider × api)` pair, never by a marketing word. The provider is a REGISTRY ROW, not a union
member — built-in rows live in `packages/contracts/src/inference/builtin-providers.ts`, and a plugin or
admin may add one. Authority is DATA: a connection's `api` must be one its provider row lists
(`resolveApi`, `packages/inference/src/resolve/coherence.ts`); an unlisted pairing is a typed
`ProviderError`, not a mode. Use these words in a brief, an issue or a review when naming which
connection a test result came from. The WIRE column is package-internal vocabulary and **never appears
inside the server domain tier or in user-facing copy** (`Tier-3b-Providers.md` — the wire/family words
stay sealed inside `@orb/inference`).

| The spoken name | provider id | `api` | wire (package-internal) |
| - | - | - | - |
| claude code sub | `claude-sub` | `agent-sdk` | `agent-sdk` |
| anthropic direct | `anthropic` | `anthropic-messages` | `anthropic-messages` |
| chat complete openrouter | `openrouter` | `chat-completions` | `openai-compat` |
| openai direct | `openai` | `chat-completions` | `openai-compat` |
| vllm endpoint | `vllm` | `chat-completions` | `openai-compat` |
| lm studio endpoint | `lm-studio` | `chat-completions` | `openai-compat` |
| ollama endpoint | `ollama` | `chat-completions` | `openai-compat` |
| custom byo endpoint | `custom-openai` | `chat-completions` | `openai-compat` |
| built-in on this device | `local-light` | — (no chat api) | `local-light` |

Standing rules: `agent-sdk` is the only stateful wire and the only subscription path — it is the
subscription's wire and nothing else's. Never use "claude code via openrouter key"; that phrase names
nothing. `responses` is not a valid `api`: the runner that served it is gone and never replaced, so a
picker option offering it produces only a typed refusal at send. Never bring the word back without a
transport behind it; `local-light` never serves a chat turn. `anthropic-messages` is a live `api` and
`anthropic` a live provider: it is the first-party API-key wire over `@ai-sdk/anthropic`, and it is NOT
the subscription's subprocess, which is a different wire. `max-pro-sub` and `custom_openai` are not
provider ids; use the ids in the table above instead.

## Enforcement

**Prose-enforced by owner ruling — there is no gate** (`Constitution.md` §3 states this for the register
boundary, and it holds for the whole map). The mechanism is the sweep: a crossed word is a
drifted-comment defect, fixed on sight. A rename program's waves must be cut so their union provably
covers the surface, with an explicit owner for any file two waves both exclude — an unowned
intersection is how a generic-`roster` surface survives a rename.

No gate checks this map today.
