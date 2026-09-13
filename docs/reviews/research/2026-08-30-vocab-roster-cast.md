---
kind: review
status: draft
updated: 2026-08-30
---

# Deep vocabulary pass — roster / cast / crew / party (lane cb-vocab-deep)

Verification of the quick census's nine claims, plus what full reads of the definition and copy sites
surfaced that the quick pass missed. Every claim below carries a `path:line` receipt taken in this
session. **Read the declared limits (§6) before quoting the coverage.**

Headline: the quick census was directionally right about the *existence* of the collision but wrong
about its *shape* in four of nine claims. It reported a clean two-tier word swap; the tree has a
**three-word, five-tier** muddle whose two sharpest meanings collide **inside one screen region**, and
"roster" **is** user-facing (the census said it never is).

## 0. Instrument and hit-set derivation

The brief's regex `\b(roster|cast|crew|party)\b` is **under-inclusive** — `\b…\b` does not match
`castKey`, `CastEntry`, `casts`, `rosters`, `rosterPreset`. Corrected sweep (substring, case-insensitive):

| set | files | note |
| - | - | - |
| brief regex, `packages/**/*.{ts,tsx}` | 646 | `\b`-anchored |
| substring `roster\|cast\|crew\|part(y\|ies)` | **737** | the real hit set; **168 720 LOC** |
| matching LINES in that set | **4 782** | |
| lines whose only match is a FALSE STEM | **91** (1.9%) | `broadcast` 43 · `third-party` 19 · `casting` 11 · `forecast` 8 · `upCast` 6 · `podcast` 1 · plus `screw`/`sarcastic` which `-i crew`/`-i cast` also catch |

So false stems are noise, not the story: ~98% of hits are real. Per-stem file counts:
roster 432 · cast 455 (441 after stem-exclusion) · party 122 (113) · crew 19.

Positive controls used for every negative claim below: `ast-grep run -p '<Ident>' -l ts packages --inspect summary` at `scannedFileCount=2459, skippedFileCount=0`, paired with a literal `rg`.

## 1. Per-claim verdicts

### Claim 1 — roster = room membership, internally consistent, never user-facing → **REFUTED (both halves)**

**(a) Not internally consistent.** `packages/contracts/src/chat/roster.ts` — the roster contract itself —
defines the room's composition under the name **cast**, and its own prose swaps the two words
mid-sentence:

- `packages/contracts/src/chat/roster.ts:319` `export interface CarriedAppearanceCast`
- `:322` — its own field doc: *"Human seats **on the roster**."*
- `:330` `carriedCastFromParticipants` · `:350` `soleCarriedCharacter(cast: CarriedAppearanceCast)` ·
  `:358` `isSingleHumanCast` · `:392` `resolveCarriedBackgroundForCast`
- `:475` `copyCast: z.boolean()` — *"Copy the OLD HOST's seated **cast**…"*, in the host-handoff wire.
- `:71` and `:96` name an unbuilt *"founding casts"* concept in the same file.

So the file whose name and header say "roster" exports five `Cast`-named symbols for the same set.

**(b) `roster` IS user-facing.** Three live accessible names:

- `packages/client/src/features/rpg/components/rpg-scene-cast.tsx:259`
  ``aria-label={`Promote ${actor.name} to the roster`}``
- `packages/client/src/features/rpg/components/rpg-character-detail.tsx:348`
  `aria-label="Back to the roster"` (also `:286`)
- pinned by `tests/client/features/rpg/lib/rpg-context-section.ct.tsx:781,1512,1562`

These name the **same set** — the room's seated characters — that the Members tab labels **Cast**
(`members-panel.tsx:310`). One screen calls it a roster, the adjacent one calls it a cast.

### Claim 2 — `resolvePersonasForRoster` exists; **no `RosterPersonaView` type anywhere** → **CORRECTED**

The op is real (`packages/server/src/domain/persona/verbs/resolve-personas-for-roster.ts:13`,
type at `contract/ops.ts:32`, composed at `entry/compose/search-discovery.ts:254` and consumed at
`entry/compose/chat.ts:1355`). But the type **does exist** under the reversed word order:

- `packages/server/src/domain/persona/contract/views.ts:27` `export interface PersonaRosterView`
- exported at `domain/persona/index.ts:11`, consumed at `contract/ops.ts:24,35` and
  `persistence/queries.ts:13,51`

Receipt: `ast-grep -p 'PersonaRosterView' -l ts packages` → 3 declaration/import sites at
`scannedFileCount=2459`; `ast-grep -p 'RosterPersonaView'` → 0 at the same count. **The census's zero
was true of the string it typed and false of the claim it drew.** This is the `code-recon` "no matches
is not absence" failure with a word-order twist.

### Claim 3 — `CastEntry`/`castKey`/`CAST_KINDS` (D137), fenced from the assembly cast by COMMENT only → **CONFIRMED**

`packages/contracts/src/chat/producers.ts:22` `CAST_KINDS = ["character","persona"]` · `:51` `CastEntry`
· `:70` `CAST_KIND_POLICY` · `:78` `castKey`. Loader at
`packages/server/src/domain/chat/persistence/cast.ts:86` `loadChatCastProducer`.
The fence is prose only, at `persistence/cast.ts:18-20`:

> *"NOT the pin layer: `resolvePersonasForRoster` (D122)… And NOT `AssembleContext.cast`/`castMembers`
> (the D60 DRIVE axis — present AI-driven speakers): personas are cast members here but never speakers."*

Confirmed: no type, brand, or gate separates the two `cast` axes. Coupled sites: `CastEntry` 73 occ / 24
files, `buildCastNameContext` 48/16, `loadChatCastProducer` 35/11 (packages+tests).

### Claim 4 — `AssembleContext.cast` / `castMembers: SpeakerRef[]` is the drive axis → **CONFIRMED, and it is FOUR fields not two**

`packages/server/src/domain/chat/assembly/context.ts` — `cast: AssembleCharacter[]` (`:412,419`),
`castMembers: SpeakerRef[]` (`:413,423`), `castCharacterIds` (`:308,422`), `castNotMuted` (`:315,428`).
Explicitly **excludes personas**, which the D137 `cast` **includes** — the two axes are near-antonyms on
the persona plane and share a bare word.

### Claim 5 — "server says `roster-preset` everywhere, client + all user copy says `cast`; a clean tier-boundary swap with no bridging note" → **REFUTED**

There is no clean boundary. The server tier speaks **three** words, and two of them appear in the same
files, sometimes in adjacent lines:

| site | word |
| - | - |
| `packages/server/src/domain/roster-preset/index.ts:1` | *"Saved **parties**"* |
| `packages/server/src/domain/roster-preset/contract/service.ts:2` | *"Saved **parties**"* |
| `…/contract/service.ts:112,119,122,125,126` | *"Mint a saved **party**" / "Delete an owned **party**" / "The caller's **parties**" / "One owned **party**" / "apply the **party**"* |
| `…/contract/service.ts:71` | `export interface **CastRuleWrite**` |
| `packages/server/src/transport/trpc/routers/roster-preset.ts:1` | *"the saved-**party** surface"*; `:20` *"a **party** is small enough"* |
| `packages/contracts/src/roster-preset/index.ts:2` | *"A roster preset is an owner's NAMED **CAST**"* |
| `…/roster-preset/index.ts:39` | zod: `"a **party** lists each character once"` |
| `…/roster-preset/index.ts:59` | zod: `"a **cast** lists each rule preset once"` — **20 lines later** |
| `…/roster-preset/index.ts:12,73,113,116,133` | *"carries **cast** only" / "a **cast** without rules" / "the **cast** carries no rules" / "a **cast** row"* |
| `…/roster-preset/index.ts:22,123` | *"a **party**'s size" / "a **party** caps at"* |
| `packages/db/src/schema/roster-preset.ts:1,8,21,27(+2)` | *"saved **parties**" / "every **party**" / "one seat per character per **party**"* |
| `packages/db/src/schema/roster-preset.ts:2,54,30,58` | *"a named **cast**" / "carries **cast** only" / "the **cast**'s captured rules" / "per **cast**"* |

`contracts/src/roster-preset/index.ts` and `db/schema/roster-preset.ts` each carry **both** words.
There is also a **third registry spelling**: the client config-group id literal is `"cast"`
(`packages/client/src/features/roster-preset/lib/cast-collection.tsx:15` `CAST_COLLECTION_ID = "cast"`,
registered at `packages/client/src/state/config-group-ids.ts:34`), the modal slot id is `"savedCasts"`
(`state/modal-slot-ids.ts:54`), and the tRPC router is `rosterPreset`
(`transport/trpc/routers/roster-preset.ts:12`). So one artifact answers to **four** names across four
registries.

*(Honest limit: the two zod `refine` messages do NOT reach a user — every roster-preset mutation
carries a fixed `errorToast` string, `hooks/use-roster-preset-mutations.ts:16,22,28,34`. They are an
agent-facing inconsistency only.)*

### Claim 6 — the Members panel's "Cast" section is a FIFTH bare-`cast` meaning → **CONFIRMED and ESCALATED**

`packages/client/src/features/chat/components/members-panel.tsx:309-312` renders the kicker `Cast`
(the room's seated characters) and, **in the same `<Row>`**, `{props.castAction}` — which is
`packages/client/src/features/chat/components/committed-members-tab.tsx:139-142`, a button labelled
**`Add cast…`** that opens `openModal("savedCasts")`, i.e. the **Saved casts** library
(`features/roster-preset/lib/saved-casts-modal.tsx:18` `title: "Saved casts"`).

**Two different meanings of "cast", rendered side by side, one click apart.** This is the single
highest-confusion site found, and the census's "clean tier-boundary swap" framing hides it entirely.
Supporting copy: `members-panel.tsx:286` `aria-label="Members and cast"` · `:314` *"add one to give the
room a cast"* · `chat-cast-bar.tsx:100` `aria-label="Cast"` · gate at
`features/chat/lib/roster.ts:71` `castSectionVisible` (const `CAST_SECTION_FLOOR`, `:49`).

Sharpest single-function receipt of the synonymy: `chat-cast-bar.tsx:131-133` —
`const roster = filterCharacters(...)` immediately followed by `const cast = roster.map(...)`.

### Claim 7 — RPG `cast:${castKey}` is a FOURTH meaning; `cast` ⇒ NPCs, ANTONYM of `party` → **CONFIRMED**

`packages/contracts/src/rpg/actor.ts:62-68` `rpgCastRefSchema` (kind `"cast"`, slug-refined `castKey`) ·
`:91` `` return `cast:${ref.castKey}` `` · `:47` `rpgCastSlug` · `:160` `RPG_CAST_GUIDE_FIELDS`.
The antonym mapping is live at
`packages/server/src/domain/rpg/chat-ops/tracker-view.ts:81`:

```ts
kind: ref.kind === "cast" ? "npcs" : "party",
```

And the contract is explicit that rpg-`cast` **excludes** roster identities
(`contracts/src/rpg/actor.ts:52`, `:130-132`: *"Roster actors (character/user) carry NO identity here"*).
That is a **direct contradiction** of D137, where `cast` **is** the roster identities plus personas.
Coupled sites: `castKey` 157 occ / 42 files, `kind: "cast"` 92/39, `rpgCastSlug` 28/7.

### Claim 8 — `RPG_TRACKER_CARRIER_CLASSES = ["party","npcs","everyone"]` + `TEMPLATE_CLUSTERS` "party" + `update_party` + agent-seed `appliesTo:"party"` → **CONFIRMED, and "party" is USER-FACING**

- `packages/contracts/src/rpg/enums.ts:81-83` — the tuple + schema; its own doc says *"pool defs were
  per-party-member (`party`), cast fields were per-NPC (`npcs`)"*.
- `packages/client/src/features/rpg/components/rpg-game-tab.tsx:58` `["party","npcs","everyone"]`, `:197`.
- `packages/client/src/agent-seed/index.ts:85,98,111` `appliesTo:"party"` · `:123,134` `"npcs"`;
  `packages/server/src/domain/chat/seeder/demo-chats.ts:81`.
- `update_party` tool: `packages/server/src/entry/compose/rpg.ts:1087`,
  `packages/contracts/src/rpg/extraction.ts:494`, `updatePartyArgsSchema`.
- `packages/contracts/src/preset/index.ts:900` `TEMPLATE_CLUSTERS` includes `"party"` (rows at
  `:1441,1450,1459,1549,1567`).

**User-facing "party" the census did not list:**

- `packages/client/src/features/preset/lib/template-rows.ts:87` `party: "Party & trackers"` — a rendered
  band label in the preset Actions tab.
- `packages/contracts/src/preset/index.ts:1632` `label: "Party update"` — a rendered row label (pinned by
  `tests/client/features/preset/components/actions-view.ct.tsx:307`).
- `packages/client/src/features/rpg/components/rpg-inventory-tab.tsx:260` `label="Party purse"`; "party
  total" copy at `:4,65,129,243`.

### Claim 9 — crew purged; comment residue + one flavor string only → **CONFIRMED**

Exhaustive: all 31 `crew` lines under `packages/**/*.{ts,tsx}` are comments, except
`packages/server/src/domain/character/seeder/cards.ts:565` — *"I'd be glad of the crew."* — a seeded
greeting. (`screwdriver`/`screw` at `cards.ts:405,410` are the `-i crew` false stem.) No `domain/crew`,
no `features/crew`, no `crew.*` bus member. Confirmed.

One fossil worth a P3: `tests/client/features/workloads/components/workloads-jobs-section.ct.tsx:159`
asserts `getByRole("option", { name: "Crew: director" })).toHaveCount(0)` — an **un-failable negative**:
the string it guards against exists nowhere in `packages/` (verified, `rg -i crew` over
`packages/contracts/src/workloads`, `packages/client/src/features/workloads`,
`packages/server/src/domain/workloads` → exit 1, zero hits).

## 2. NEW — what the census missed entirely

### N1. `castId` is a TYPE CAST, and it is the most frequent `cast` token in the tree

`packages/kit/src/ids/index.ts:272` `export function castId<T extends string>(raw: string): T` —
**347 occurrences across 110 files**. It has nothing to do with the cast concept. It is imported *into*
`packages/server/src/domain/chat/verbs/roster.ts:37`, so the roster file's most-visible `cast` import is
a type coercion. **Any grep-based census of "cast" over-counts by roughly 2:1 unless it excludes this.**
The census's "cast is a fourth/fifth meaning" framing never mentions it.

### N2. `HostTierRegexSources.cast` — a LIVE regex-tier field, not prose

`packages/server/src/domain/chat/contract/regex.ts:29` `readonly cast: readonly RegexScriptRow[]` —
*"The present cast's sets… the `character_regex_scripts` junction."* Consumed at
`packages/server/src/domain/chat/substrate/regex-tier.ts:23` (`...sources.cast`). The db table is
`character_regex_scripts` (`packages/db/src/schema/regex.ts:99`). So the resolver tier is named `cast`
while its table, its junction, and its user-facing attach surface are named *character*. Tier prose
repeats "global → preset → cast → chat" at `db/schema/regex.ts:21,76`,
`domain/regex/contract/resolve.ts:35`, `client/.../regex-pipeline.ts:12`,
`domain/chat/substrate/assemble-gather.ts:402`, `assembly/context.ts:368`.

### N3. `ChatRoster` is not a roster

`packages/contracts/src/identity/index.ts:73-75`:

```ts
export interface ChatRoster {
  readonly role: ParticipantRole;
}
```

One field. It is **the asking viewer's role**, not a member list, and it is what
`ChatResource.roster` (`:84`) carries into `can()`. Consumers: `domain/admin/guard.ts:28`
`decideChat(action, roster)`, `domain/tool-use/contract/params.ts:51`,
`domain/chat/contract/context.ts:111`, `domain/chat/contract/results.ts:341` (`toolRoster?: ChatRoster`).
A cold agent reading `resource.roster` will expect `ParticipantView[]` and get a role string.

### N4. "cast" = your whole character LIBRARY (a distinct USER-FACING meaning)

- `packages/client/src/features/character/lib/characters-section.tsx:56` — *"**Your cast** lives here —
  browse the list, then open someone to see their card."*
- `…/characters-section.tsx:137` — *"Open someone from **your cast**…"*
- `packages/client/src/features/character/components/character-library-welcome.tsx:277`
  `title="Meet the cast"` · `:166` *"Loading your cast…"* · `:167` `label="your cast"`

This is a **third user-facing "cast"**, disjoint from both the room's seats and the saved template.

### N5. "roster" as a generic English word for "a list", in six unrelated features

Each is live code, not prose:

| symbol | site | means |
| - | - | - |
| `AttachmentRoster` | `client/src/features/regex/components/regex-context-body.tsx:171` | a list of regex attachments |
| `RoomRoster` | `…/regex-context-body.tsx:220` | a list of rooms |
| `CharacterRoster` | `client/src/features/world-info/components/book-attachments.tsx:229` | a list of characters a book attaches to |
| `SessionRoster` / `RefinerySessionRosterRow` | `client/src/data/use-open-refinery.ts:37`; `client/src/features/refinery/hooks/use-refinery-sessions.ts:35`; `server/src/domain/refinery/persistence/queries.ts:73,81,180` | a list of refinery sessions |
| `PersonaRoster` / `PERSONA_ROSTER_SUBCATEGORY` | `client/src/features/persona/components/persona-roster.tsx:28`; `client/src/features/persona/lib/personas-nav.ts:29` | the persona list; `keywords: [… "roster" …]` makes it **search-reachable by the word** |
| `CardFrameRosterPort` | `server/src/entry/http/card-frame.ts:81` | the card-frame's roster port |

Plus `RosterRefIndex`/`buildRosterRefIndex` (`entry/compose/rpg.ts:83,95,818,…`) and
`AssembleContext`'s `rosterOwnsPlayerName` (`entry/compose/rpg.ts:602`).

### N6. The plugin host API exports `chat.listRoster`, and its "roster" excludes humans

`packages/contracts/src/plugin/host-v1.ts:212` `listRoster: (chat: ChatHandle) => …
PluginCharacterView[]`; grant map at `:660` `"chat.listRoster": "chat.read"`; bridge at
`contracts/src/plugin/bridge.ts:50`; server reader `loadPluginRoster` at
`server/src/entry/compose/plugin-chat-reads.ts:92`. Its own doc, `host-v1.ts:47`: *"Human seats are
**excluded** (this is the CHARACTER roster)."* — so a **third-party plugin author's** "roster" is a
different set from chat's `ParticipantView[]` roster, at a public, versioned API boundary. And the
client's dev bridge uses "roster" for a *third* thing again: `client/src/lib/agent-plugin-bridge.ts:16`
`OrbPluginRosterEntry` / `:34` `roster` = the list of **installed plugins**.

### N7. `kit` was never swept and carries two more `cast` axes

- `packages/kit/src/macro/row-macros.ts:67` `readonly cast?: readonly string[]` — *"the full cast names
  (roster order)"*, the `{{char}}` subject for narrator rows, `== {{group}}`; helper `castChar` at `:87`.
- `packages/kit/src/speaker-label/index.ts:64,95,117,169` `castNames: readonly string[]` — the plain-label
  speaker-split alphabet.

So `cast` is a `string[]` in kit, a `CastEntry[]` in contracts/chat, an `AssembleCharacter[]` in
assembly, a `RegexScriptRow[]` in the regex tier, and an NPC-slug discriminator in rpg. Five shapes,
one word.

## 3. The corrected concept table

Ordered by user-facing confusion, worst first. "Sites" = occurrences / files, `packages` + `tests`
unless noted.

| # | word, as the USER sees it | means | where | sites |
| - | - | - | - | - |
| **1** | **Cast** (Members tab kicker) | the characters seated in THIS room | `members-panel.tsx:310`, `chat-cast-bar.tsx:100`, `castSectionVisible` | ~40 |
| **2** | **Add cast… / Saved casts / New cast / Casts** | a saved TEMPLATE of characters + knobs + rules | `committed-members-tab.tsx:141`, `saved-casts-modal.tsx:18-19`, `cast-collection.tsx:29`, `cast-group.tsx:21` | 308 `cast*` idents in `features/roster-preset` alone |
| **3** | **your cast / Meet the cast** | your whole character LIBRARY | `characters-section.tsx:56,137`, `character-library-welcome.tsx:166,167,277` | 5 copy sites |
| **4** | **the roster** (RPG panel) | = #1, different word | `rpg-scene-cast.tsx:259`, `rpg-character-detail.tsx:348,286` | 3 a11y names |
| **5** | **Party** (preset editor, rpg purse) | rpg player-side actors / the tracker carrier class | `template-rows.ts:87`, `preset/index.ts:1632`, `rpg-inventory-tab.tsx:260` | 3 labels + the closed tuple |
| — | *(code-only, user-invisible)* | | | |
| 6 | `cast` = D137 producer | every identity the chat references (characters **∪ personas**, incl. departed) | `contracts/src/chat/producers.ts:51` | 73/24 |
| 7 | `cast` = assemble drive axis | present, seated, unmuted CHARACTERS (no personas) | `assembly/context.ts:412-428` | 4 fields |
| 8 | `cast` = rpg NPC ref | scene-only NPCs, **explicitly NOT roster identities** — antonym of rpg `party` | `contracts/src/rpg/actor.ts:62-91` | 157/42 (`castKey`) |
| 9 | `cast` = `CarriedAppearanceCast` | the room's human COUNT + character appearance overrides | `contracts/src/chat/roster.ts:319` | 5 symbols |
| 10 | `cast` = regex tier | the present characters' attached regex scripts | `contract/regex.ts:29` | 1 field, 6 prose sites |
| 11 | `cast` = `string[]` names | kit macro `{{char}}`/`{{group}}` subject; speaker-label alphabet | `kit/macro/row-macros.ts:67`, `kit/speaker-label:64` | 2 axes |
| 12 | **`castId` = a TYPE CAST** | branded-id coercion — **not the concept at all** | `kit/src/ids/index.ts:272` | **347/110** |
| 13 | `roster` = generic "a list" | regex attachments / rooms / characters / refinery sessions / personas / plugins | see N5 | 6 features |
| 14 | `ChatRoster` = one role | the asking viewer's `ParticipantRole` — not a list | `contracts/src/identity/index.ts:73` | 12 |
| 15 | `roster` = plugin API | the room's CHARACTER seats, humans excluded | `contracts/src/plugin/host-v1.ts:212` | public API |
| 16 | `party` = the saved template | server JSDoc / db comments for concept #2 | `roster-preset/contract/service.ts:112-126`, `db/schema/roster-preset.ts:1,8,21` | ~15 prose |
| 17 | `crew` = dead | comments + one seeded greeting | `character/seeder/cards.ts:565` | 31 lines, 1 live string |

**Five distinct user-facing meanings across three words; twelve distinct code meanings.**

## 4. The muddles, ranked, and where each bites

| rank | muddle | bites | evidence |
| - | - | - | - |
| **M1** | "**Cast**" section header and "**Add cast…**" button in the SAME `<Row>` mean different things | **the user**, directly. A host clicking "Add cast…" under a header that lists this room's characters reasonably expects "add a character", and gets a library of saved templates | `members-panel.tsx:309-312` + `committed-members-tab.tsx:139-142` |
| **M2** | The same set is "**Cast**" in Members and "**the roster**" in the RPG panel | **the user** — two panels of one room, two nouns | `members-panel.tsx:310` vs `rpg-scene-cast.tsx:259` |
| **M3** | "**your cast**" = the library, but "**this room's cast**" = the seats, and "**a cast**" = a template | **the user** — three referents in one app, none disambiguated in copy | `characters-section.tsx:56` · `cast-picker.tsx:334` · `cast-group.tsx:26` |
| **M4** | rpg `cast` **excludes** roster identities; D137 `cast` **includes** them plus personas | **a cold agent** — the words are exact opposites on the same plane, and only a comment fences them | `rpg/actor.ts:52,130` vs `producers.ts:51` + `persistence/cast.ts:18-20` |
| **M5** | `castId` (347 sites) is a type cast, not the concept | **a cold agent** — any `rg cast` sweep is ~2:1 noise; the census that produced this brief did not mention it | `kit/src/ids/index.ts:272` |
| **M6** | One artifact, four registry names: dir `roster-preset` · router `rosterPreset` · group id `"cast"` · modal id `"savedCasts"` | **a cold agent** — no single grep finds the feature | `cast-collection.tsx:15`, `config-group-ids.ts:34`, `modal-slot-ids.ts:54`, `routers/roster-preset.ts:12` |
| **M7** | Server tier says **party** and **cast** for the same artifact, in the same files, 20 lines apart | **a cold agent** writing copy or a test | `contracts/src/roster-preset/index.ts:39` vs `:59`; `db/schema/roster-preset.ts:2` vs `:8` |
| **M8** | `ChatRoster` is a single role field, not a roster | **a cold agent** reading `can()`'s inputs | `contracts/src/identity/index.ts:73` |
| **M9** | `roster` used as generic English "list" in 6 unrelated features, one of them **search-keyworded** | **both** — `personas-nav.ts:32` puts "roster" in the config search index, so typing "roster" surfaces personas, not the chat roster | `personas-nav.ts:29,32` + N5 |
| **M10** | `HostTierRegexSources.cast` names the tier after a concept whose table is `character_regex_scripts` | **a cold agent** | `contract/regex.ts:29` vs `db/schema/regex.ts:99` |
| **M11** | Plugin API `chat.listRoster` excludes humans, unlike chat's roster | **third-party plugin authors** — a versioned public boundary | `contracts/src/plugin/host-v1.ts:47,212` |
| **M12** | `contracts/src/chat/roster.ts` exports 5 `Cast`-named symbols | a cold agent | `contracts/src/chat/roster.ts:319-416,475` |
| P3 | un-failable negative CT for a purged `"Crew: director"` label | nobody, but it reads as coverage | `workloads-jobs-section.ct.tsx:159` |

## 5. What a one-home/one-word fix would touch (counts only — the naming call is the owner's)

No recommendation is made here beyond naming the collisions precisely. Prices, so the owner can rank:

- **M6/M7 — make the saved-template artifact one word.** `RosterPreset` 408 occ / 48 files ·
  `rosterPreset` 309 / 62 · `roster-preset` 215 / 84 · `roster_preset` 134 / 35 (3 tables + 4 indexes,
  and pre-launch DDL squashes into `0000_baseline.sql`) · `rosterPresetsChanged` 30 / 18 (a user-bus
  member — `USER_BUS_FILTERS` is a coupled site) · plus 308 `cast*` identifiers inside
  `features/roster-preset` and the two registry literals `"cast"` / `"savedCasts"`. **Large**: it is a
  branded-id (`RosterPresetId`, `ID_PREFIX.roster_preset`), a router key, a db table family, a bus
  member and two registry string keys, so it is not an LS-only rename.
- **M1/M2/M3 — the copy-only half.** ~14 rendered strings/aria-labels total: `members-panel.tsx:286,310,314`
  · `chat-cast-bar.tsx:100` · `committed-members-tab.tsx:141` · `saved-casts-modal.tsx:18,19` ·
  `cast-collection.tsx:26,29,35` · `cast-group.tsx:21,26` · `cast-picker.tsx` (~12 strings incl.
  `"Save current cast"`, `"New cast name"`, `"Name this cast…"`, `"No saved casts yet"`,
  `"Delete this cast?"`) · `cast-member-surface.tsx:139,142` · `characters-section.tsx:56,137` ·
  `character-library-welcome.tsx:166,167,277` · `new-chat-picker-surface.tsx:215` ·
  `rpg-scene-cast.tsx:259` · `rpg-character-detail.tsx:348`. **Every one has a CT or e2e assertion**
  (~30 selector sites in `tests/client/features/roster-preset/components/cast-picker.ct.tsx`,
  `.../cast-member-surface.ct.tsx:52`, `tests/client/features/chat/surfaces/new-chat-picker-surface.ct.tsx:39,65`,
  `tests/client/features/rpg/lib/rpg-context-section.ct.tsx:781,1512,1562`,
  `tests/e2e/support/chat-room.ts:292` `const CAST_BAR = '[aria-label="Cast"]'`). Copy-only, **but
  `pnpm check` is static and runs none of them** — the literal sweep across `tests/` is mandatory.
- **M4 — disambiguate the two `cast` axes.** rpg side: `castKey` 157 / 42, `kind: "cast"` 92 / 39,
  `rpgCastSlug` 28 / 7, `RPG_CAST_*` 19 / 8; **plus the wire is slug-refined and persisted** in the
  `actorState` snapshot plane keyed by `` `cast:${castKey}` `` (`contracts/src/rpg/actor.ts:91`), so a
  rename on that side is a stored-key migration, not a rename. D137 side: `CastEntry` 73 / 24,
  `CAST_KIND*` 21 / 5, `buildCastNameContext` 48 / 16, `buildCastAvatarMaps` 20 / 8,
  `loadChatCastProducer` 35 / 11 — type-only, cheap.
- **M5 — `castId`.** 347 / 110, mechanical, zero runtime risk, but it is a `@orb/kit/ids` public export
  and the biggest single grep-noise source. Cheapest high-value rename on this list.
- **M8 — `ChatRoster`.** 12 sites, type-only, 5 files. Cheapest fix on the list.
- **M10 — `HostTierRegexSources.cast`.** 1 field + 6 prose sites. Trivial.
- **M11 — plugin `chat.listRoster`.** Do **not** price as a rename: it is a versioned host-v1 verb name
  with a grant-map row (`host-v1.ts:660`) and a guest-vocabulary subset; changing it is an API break.
  The fix here is the doc line, not the name.

## 6. Declared limits — read these before quoting coverage

1. **I did NOT read all 737 live-hit files in full.** The brief asked for it; the set is **168 720 LOC**
   and full reads would have consumed the session. I read **19 files end-to-end** (listed in §7) and used
   full-file hit enumeration (`rg -n` over the whole file, every match line) plus targeted region reads
   for the rest. Every `path:line` receipt above was produced in this session; none is second-hand.
   **A concept present ONLY in the body of a file I neither read whole nor enumerated could be missed.**
   The residual risk is concentrated in the six highest-density files I only enumerated:
   `entry/compose/rpg.ts` (56 hits), `domain/rpg/tools/apply.ts` (47),
   `domain/roster-preset/persistence/queries.ts` (46), `domain/chat/verbs/read.ts` (39),
   `domain/chat/verbs/roster.ts` (35), `domain/chat/assembly/context.ts` (39 across 950 lines).
2. **Scope was `packages/**`** for the concept census, with `tests/**` swept only for user-copy
   selectors (as briefed). `tooling/`, `scripts/`, `docs/` were not censused — `docs/` in particular
   carries heavy `crew` and `party` residue (`Agent-And-Composition-Pain-Points.md:66` is literally
   titled *"The entity zoo — buddy / agents / crew / party / roster"*), which is a separate, larger
   surface and a real cold-agent hazard.
3. **JSX text nodes were swept by regex, not by AST.** `ast-grep`'s bare JSX-attribute patterns return a
   silent zero (a known repo trap), so I used a quoted-string/`>`-anchored `rg` plus a `tests/`
   selector cross-check, which found copy the source sweep alone missed (`"Party update"`,
   `"Back to the roster"`). A JSX text node split across an interpolation could still hide.
4. **No rendered verification.** Nothing here was checked against `pnpm snap` or a live drive; every
   claim is a source claim. In particular I did not confirm that the Members "Cast" header and the
   "Add cast…" button are visually adjacent at every viewport — the JSX puts them in one `<Row>`
   (`members-panel.tsx:308-313`), which is a structural claim, not a pixel one.
5. **No tests were run.** This was a read-only census; `pnpm check` / `pnpm test` were not invoked and
   nothing in this document asserts a gate result.
6. **The zod-message user-reachability finding is narrow.** I checked the four roster-preset mutation
   hooks only. A surface elsewhere that renders a raw tRPC `BAD_REQUEST` message would leak
   `"a party lists each character once"` to a user; I did not enumerate every such surface.

## 7. Audit trail — files read

**Read END TO END (19):**

`packages/contracts/src/chat/roster.ts` · `packages/contracts/src/chat/producers.ts` ·
`packages/contracts/src/rpg/actor.ts` · `packages/contracts/src/roster-preset/index.ts` ·
`packages/server/src/domain/chat/persistence/cast.ts` ·
`packages/server/src/domain/chat/substrate/regex-tier.ts` ·
`packages/server/src/domain/roster-preset/index.ts` ·
`packages/server/src/domain/roster-preset/contract/service.ts` ·
`packages/server/src/transport/trpc/routers/roster-preset.ts` ·
`packages/client/src/features/roster-preset/index.ts` ·
`packages/client/src/features/roster-preset/lib/cast-group.tsx` ·
`packages/client/src/features/roster-preset/lib/saved-casts-modal.tsx` ·
`packages/client/src/features/roster-preset/lib/cast-copy.ts` ·
`packages/client/src/features/roster-preset/lib/cast-collection.tsx` ·
`packages/client/src/features/roster-preset/components/cast-picker.tsx` ·
`packages/client/src/features/roster-preset/components/cast-collection-rows.tsx` ·
`packages/client/src/features/roster-preset/hooks/use-roster-preset-mutations.ts` ·
`packages/client/src/features/chat/lib/roster.ts` ·
`packages/client/src/features/chat/components/chat-cast-bar.tsx`

**Read by FULL hit-enumeration + targeted region reads (34):**

`packages/db/src/schema/roster-preset.ts` (whole, in two reads) · `packages/db/src/schema/regex.ts` ·
`packages/contracts/src/identity/index.ts` · `packages/contracts/src/rpg/enums.ts` ·
`packages/contracts/src/rpg/extraction.ts` · `packages/contracts/src/rpg/extraction-prompt.ts` ·
`packages/contracts/src/rpg/tracker.ts` · `packages/contracts/src/preset/index.ts` ·
`packages/contracts/src/plugin/{manifest,bridge,lifecycle,registrations,frame,host-v1,ui}.ts` ·
`packages/kit/src/macro/row-macros.ts` · `packages/kit/src/speaker-label/index.ts` ·
`packages/kit/src/ids/index.ts` · `packages/server/src/domain/chat/assembly/context.ts` ·
`packages/server/src/domain/chat/contract/regex.ts` ·
`packages/server/src/domain/chat/verbs/roster.ts` (header + export map) ·
`packages/server/src/domain/rpg/chat-ops/tracker-view.ts` ·
`packages/server/src/domain/persona/contract/views.ts` ·
`packages/server/src/domain/persona/contract/ops.ts` ·
`packages/server/src/domain/refinery/persistence/queries.ts` ·
`packages/server/src/entry/compose/rpg.ts` · `packages/server/src/entry/compose/plugin-chat-reads.ts` ·
`packages/server/src/entry/http/card-frame.ts` · `packages/server/src/domain/admin/guard.ts` ·
`packages/client/src/features/chat/components/members-panel.tsx` ·
`packages/client/src/features/chat/components/committed-members-tab.tsx` ·
`packages/client/src/features/chat/surfaces/new-chat-picker-surface.tsx` ·
`packages/client/src/features/character/lib/characters-section.tsx` ·
`packages/client/src/features/character/components/character-library-welcome.tsx` ·
`packages/client/src/features/preset/lib/template-rows.ts` ·
`packages/client/src/features/rpg/components/{rpg-scene-cast,rpg-character-detail,rpg-inventory-tab,rpg-game-tab}.tsx` ·
`packages/client/src/features/persona/{components/persona-roster*.tsx,lib/personas-nav.ts}` ·
`packages/client/src/agent-seed/index.ts` · `packages/client/src/lib/agent-plugin-bridge.ts` ·
`packages/client/src/state/{config-group-ids,modal-slot-ids}.ts` ·
`packages/client/src/data/query-client.ts` · `packages/client/src/features/roster-preset/surfaces/cast-member-surface.tsx`

**`tests/` swept for user-copy selectors only** (2 401 files scanned): receipts cited from
`tests/e2e/support/chat-room.ts`, `tests/e2e/{group-chat,multi-tab-room-sync}.spec.ts`,
`tests/client/features/roster-preset/components/cast-picker.ct.tsx`,
`tests/client/features/roster-preset/surfaces/cast-member-surface.ct.tsx`,
`tests/client/features/rpg/lib/rpg-context-section.ct.tsx`,
`tests/client/features/chat/surfaces/new-chat-picker-surface.ct.tsx`,
`tests/client/features/preset/components/actions-view.ct.tsx`,
`tests/client/features/workloads/components/workloads-jobs-section.ct.tsx`.

---

## Issue paragraph (paste-ready)

**Vocabulary: `roster` / `cast` / `party` name five different things to the USER and twelve in code.**
A deep pass (lane cb-vocab-deep, 2026-08-30) over 737 hit files / 168 720 LOC in `packages/**` corrected
four of nine claims from the earlier quick census. The sharpest defect is user-facing and structural:
the Members tab renders the kicker **"Cast"** (this room's seated characters) and, in the *same* `<Row>`,
a button labelled **"Add cast…"** that opens the **"Saved casts"** template library — two meanings of one
word, one click apart (`packages/client/src/features/chat/components/members-panel.tsx:309-312` +
`committed-members-tab.tsx:139-142`). The same set of characters is called **"the roster"** by the RPG
panel (`rpg-scene-cast.tsx:259` `aria-label="Promote … to the roster"`), refuting the census's "roster is
never user-facing"; and the character *library* is a third user-facing "cast"
(`characters-section.tsx:56` "Your cast lives here"). In code the words are worse: rpg's `cast` means
scene NPCs and is the **antonym** of its `party` (`domain/rpg/chat-ops/tracker-view.ts:81`
`ref.kind === "cast" ? "npcs" : "party"`), while D137's `cast` is roster characters ∪ personas
(`contracts/src/chat/producers.ts:51`) — fenced from each other by a comment only. The saved-template
artifact answers to **four** registry names (dir `roster-preset`, router `rosterPreset`, config-group id
`"cast"`, modal id `"savedCasts"`) and its server tier calls it both **"party"** and **"cast"** in the
same files 20 lines apart (`contracts/src/roster-preset/index.ts:39` vs `:59`). Newly found and missed
entirely by the quick pass: `castId` is a *type cast* helper with **347 occurrences in 110 files**
(`kit/src/ids/index.ts:272`) — the largest source of grep noise on this word; `ChatRoster` is a
single-field `{role}`, not a roster (`contracts/src/identity/index.ts:73`); `HostTierRegexSources.cast`
is a live regex-tier field over the `character_regex_scripts` table; the plugin host API's
`chat.listRoster` **excludes humans**, unlike chat's roster, at a versioned public boundary; and "roster"
is used as generic English for "a list" in six unrelated features, one of which
(`persona/lib/personas-nav.ts:32`) puts the word in the config **search index**. `crew` is confirmed dead
(31 comment lines + one seeded greeting). Full report with per-claim verdicts, the ranked muddle list,
per-fix site counts, and declared limits:
`docs/reviews/research/2026-08-30-vocab-roster-cast.md`. **Renames are the owner's call** — this report
names the collisions and prices them, and recommends none.
