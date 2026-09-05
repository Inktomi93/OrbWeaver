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
| The founding / seated CHARACTER IDS an import or a backfill writes | — | `characterIds` (`ResolvedCharacterIds` in `domain/import/verbs/import-chat-bundle.ts`; `rosterRows` in `chat/persistence/import-write.ts`; `loadCharacterIdsAndHost` in `chat/substrate/backfill.ts`) | landed (#1011). Was `ResolvedCast` / `cast`. Matches the drive axis. |
| The seated characters' regex-scope slice | — | `HostTierRegexSources.character` / `ResolvedRegexSources.character` | landed (#903 C2). Was `.cast`. Its junction table already said `character_regex_scripts`. |
| The room composition the carried-appearance rules read | — | `CarriedAppearance` (+ `carriedAppearanceFromParticipants` / `isSingleHumanRoom` / `resolveCarriedBackgroundForAppearance` / `useCarriedAppearance`) | landed (#903 C2). Was `CarriedAppearanceCast` + four `Cast`-stemmed siblings. |
| **The room's participants (humans + characters together)** | — | `roster` (server chat domain: `persistence/roster.ts`, `verbs/roster.ts`, `substrate/roster-host.ts`, `roster-humans.ts`, `loadRoster`, `buildInitialRosterRows`) | **DIVERGENT, UNSCHEDULED.** The db table already says `chat_participants`, so the concept is *participants*; the code word is not. \~2000 sites, zero user-facing strings. Recorded in **#914**; needs an owner ruling to schedule. |
| The asker's membership role fed to `can()` | — | `ChatMembership` (`contracts/identity`) | landed (#903 C2). Was `ChatRoster` — a single-field `{role}`, never a list, which is what made the old name the cheapest correctness win in the wave. |
| A saved, named, reusable set of characters + seat knobs + captured rules | **Roster** · **Saved rosters** | `rosterPreset` — **CONFORMING, never renamed** (four of its five registries already say it: the db table family, the `RosterPresetId` brand, the tRPC router key, the domain/contracts/client directories) | landed (#902 C1) |
| Your whole character library | **Your characters** | `character` | landed |
| Any generic "a list of X" | **list** | `XList` — **`roster` is RESERVED for the saved template and may not be spent as English for "a list"** | landed (#905 C3b, #914) |
| The plugin host's character-seat read | — (plugin authors) | `chat.listCharacters` | landed (#904 C3a) |
| The per-user background execution engine, and the settings pane that runs/monitors it | **Jobs** (pane) · **Runs** (its first section) — **"workload" is never shown to a user** | `workloads` — the system/code noun everywhere: the `workloads` domain + db table family, the tRPC router key, the `workloads` stream channel, the `UserSettings.workloads` namespace, the `ConfigGroupId`, and the `config-anchor-workloads-*` anchors | **landed, CONFORMING — do not rename either half** (owner 2026-08-02). Receipts: `packages/client/src/features/workloads/lib/workloads-group.tsx` (`id: "workloads"`, `label: "Jobs"`, and the side-eye 2026-08-08 P3 ruling-fork note) · `tests/client/features/workloads/lib/workloads-group.ct.tsx`. Recorded here because #978 G10 read the id as insider drift; the split IS this table's own "code spelling (when different)" pattern, it was simply never written down. |
| A config GROUP's id, as a vocabulary member | — | the owner's OWN exported id — `worldInfo` / `rosterPreset` stay camelCase beside kebab siblings | **CONFORMING, deliberate — not a casing defect.** `packages/client/src/state/config-group-ids.ts` states it: a collection group "keeps the id its owner already exports … rides the `data-collection` attributes the CTs address, and keys the per-device disclosure store", so a config-local kebab-ification would fork the id from the kind everywhere else. `rosterPreset` is additionally ruled never-renamed by the row above. Raised as drift by #978 G10 and refused with this receipt. |
| The branded-id type coercion | — | `castId` (`@orb/kit/ids`) | **no action, deliberately.** It is a TYPE cast, not this concept family; 8,056 occurrences, and once the word "cast" leaves chat / roster-preset / rpg it is unambiguous by construction. |
| The DEFAULT seed palette — the base `@theme` ramp every un-themed surface paints from | **Hearth** (a palette name, always Capitalised, always beside another palette name: Light · Mocha · Hearth) | **The carriers are** — theme pipeline: the resolver's base-set `orb.theme.id`, its modifier default and its EMPTY context (`packages/ui/src/tokens/resolver.json:9`, `:27`, `:29` — three distinct roles, not one); the token contract's `ThemeSet["id"]` / `themeMetaSchema` / `EXPECTED_THEME_META.base` / `expectedContexts` and its two resolver diagnostics (`packages/ui/token-contract.ts:126,168,539,595-600`). Db seed: `THEME_HEARTH_ID` / `THEME_HEARTH_NAME` (`packages/server/src/domain/settings/constants.ts:24,28`) and the seeder's `HEARTH_OVERRIDE` + `SEED_THEMES` row (`domain/settings/seed-themes.ts:27,77`). Server read seam: `toThemeView` derives the wire's `isDefault` from `THEME_HEARTH_ID` (`domain/settings/substrate/theme-views.ts:28`) — the one reader of that sentinel outside the seeder, and the reason no client carrier of the WORD is needed. Client: **the mirrored display name is GONE (#1671)** — `features/settings/lib/seed-theme-identity.ts` and its pin are deleted, and the Looks active-card predicate + the fold caption read `theme.isDefault` off the view (`@orb/contracts/theme`'s `themeSchema`) instead of comparing a name, which is the #1667 defect. The word survives in ONE client site: the Looks search keyword (`features/settings/lib/appearance-looks-nav.ts:26`) — a search TERM, never a predicate. **Tooling** (in scope — this map's header binds the whole repo, and #1220's first two censuses were `packages/**`-only): the ui-audit evidence judge's seed-fidelity predicate, which encodes "Hearth is the arm that stamps NOTHING" as executable law (`tooling/src/ui-audit/lib/evidence.ts:383-384` — `expected === "hearth" && render.rootDataTheme === null`); the seed-ink verifier's synthetic base palette (`tooling/src/verify/lib/seed-theme-ink.ts:105` — `{ name: "hearth", scheme: "dark", … }`, the base ramp given a name so it can be judged beside the `[data-theme]` blocks); and `--theme`'s USER-FACING help copy, the one place the word is shown to a human outside the app (`tooling/src/_shared/theme.ts:97,99`). **NOT a carrier: it is NOT a `SeedThemeName`, has NO `[data-theme]` value and NO file under `tokens/themes/`** — `SEED_THEME_VALUE_SETS` is GENERATED from that directory and holds `light` + `mocha` only, and `dataThemeOf` returns `null` for Hearth because the shell paints it by stamping NOTHING (`packages/client/src/lib/resolve-theme-scope-tokens.ts:67-73`). **`null` IS its runtime spelling wherever a theme row or a `[data-theme]` value is optional.** | landed, CONFORMING (#1220). **This cell is a LIST, never a count** — it was twice written as "exactly THREE carriers" and twice refuted by the tree, so adding a carrier means adding a row here, not re-arguing an arity. Re-derive it with **`git grep -in hearth -- 'packages/**' 'tooling/**' 'scripts/**'`** — verbatim, and note BOTH corrections it carries, each one a refutation this cell already ate: **no `-w`** (there is no word boundary inside `HEARTH_OVERRIDE` / `THEME_HEARTH_ID` / `HomeHearthRoom`, which is how drafts 1 and 2 missed carriers) and **`tooling/**` in the pathspec** (a `packages/**`-only census is blind to the ui-audit judge and the `--theme` help, which is how draft 3 did). `tests/**` is deliberately OUT of scope — its fixtures MIRROR the carriers rather than being them, and each carrier cites its own pin. `scripts/**` currently yields only the rpg-extraction probe CAPTURES (`scripts/probes/rpg-extraction/*.json` — recorded model prompts whose fiction says "the hearth dominates the far wall"); it stays in the pathspec so the next re-derivation sees that for itself instead of re-widening. A new palette-sense site outside this list is a defect on sight. |
| Home's dominant LEAD column — the rooms you came back for and the doors out of them | **the hearth** (lowercase; a REGISTER word for home's focal region, never shown as a label — the surface says "Recent chats" / "Resume →") | `hearth` as a `HOME_TILE_REGIONS` member (`state/home-tile-contracts.ts`) + `HomeHearthRoom` / `home-hearth-room.tsx` / `data-home-hearth` | landed, CONFORMING (#1220). |

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

## Concepts still spelled `cast` that this map has NO word for (found by #903 C2)

The map's own instruction is *"if the concept you need is not in the table, that is a finding: say so
rather than minting a word."* These are that finding — each is a REAL distinct concept the rename
waves have never had a word for, so #903 deliberately left every one of them alone rather than invent
one. **A `cast` in `domain/chat/**` or `contracts/src/chat/**` is otherwise a defect on sight** (D137(F)),
so this list is the complete set of chat-side survivors and must shrink, not grow. **The four rows below are HELD, not sanctioned** (#1680): they are one persisted wire field and its readers, awaiting the owner's arm on **#1649** — migrate the field, or ratify it as a survivor. The table stated ZERO rows while all four were live, which read as "chat is clean"; it is not, and these rows close when #1649 is ruled.

| Still-`cast` concept | Where | Disposition |
| - | - | - |
| The host-handoff offer's "copy the old host's seated characters" flag — the WIRE FIELD | `copyCast: z.boolean()` + `NO_HANDOFF_OFFER` (`packages/contracts/src/chat/roster.ts:476,488`) | **HELD by #1649, not sanctioned.** A PERSISTED wire field: it is a key inside the `pendingHandoffOffer` JSON column on live rows, and `Core-Path-Registry.md:418` records the shape verbatim as `HandoffOffer {copyCast, copyGmPreset}`. Renaming it is a data migration + a ledger edit, so the owner picks the arm (migrate vs. ratify as a survivor). The #903 wave renamed the other four `Cast` symbols in this same file and left this one — deliberately, but without a recorded ruling, which is the gap #1649 closes. |
| The same flag, READ at the copy seam | `offer.copyCast` (`packages/server/src/domain/chat/substrate/handoff-copy.ts:119`) | **HELD by #1649** — a reader of the wire field above; it renames when, and only when, the field does. |
| The same flag, RE-SPELLED as an observability metadata key | `offerCast` (`packages/server/src/domain/chat/verbs/roster.ts:975`) | **HELD by #1649.** Note it is a THIRD spelling of the concept (`copyCast` → `offerCast`), so the #1649 ruling covers two renames, not one. |
| The same flag, on the client: the confirm-step checkbox and the doc of its default | `copyCast` / `setCopyCast` (`packages/client/src/features/chat/components/member-row.tsx:285-314`) and the `{copyCast:false, copyGmPreset:false}` default doc (`packages/client/src/features/chat/lib/member-rows.ts:75`) | **HELD by #1649** — client state named after the wire field; it follows the field. The checkbox's own visible copy already says "characters", so nothing user-facing is waiting on this. |

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
