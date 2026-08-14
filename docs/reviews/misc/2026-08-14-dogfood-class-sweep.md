---
kind: review
status: active
updated: 2026-08-14
---

# Dogfood class sweep — 2026-08-14

Read-only verification lane. Five defect CLASSES minted by the 2026-08-13/14 dogfood fixes, swept
repo-wide for SIBLINGS. Nothing was changed; every row below is a finding with a `path:line` receipt
produced in this session.

**Fences honoured:** `packages/client/src/features/character/**` (sibling lane in flight),
`packages/server/src/infra/providers/vllm/**` (sibling lane), Codex audit files.
**Prior art read first** and deliberately NOT re-reported:
`docs/design/staleness-and-session-freshness.md` §2.1 (D1 tagFilter), §2.4 (D4 character ceiling),
§4.2, §5.4–5.9; `docs/design/rpg-rewind-stuck-state.md` §2–§8.

**Method note.** Absence claims carry two methods (literal `rg`/`grep` + `ast-grep scan` with a
`scannedFileCount` receipt and a validated positive control). One instrument failure is recorded
below (§Instrument notes) rather than hidden.

---

## Class 1 — WHOLE-RECORD REPLACE vs KEY-WISE WRITER

**Exemplar (fixed):** `packages/server/src/domain/rpg/verbs/patch-sheet.ts:52-83` (`mergeAttributes`,
key-wise merge-clear fold) + `:105-112` (`mergeSheet` now folds `attributes` instead of
`{ ...patch.attributes }`). Client twin: `packages/client/src/features/rpg/components/rpg-character-detail.tsx:334`
writes ONE key per blurred cell (`patch: { attributes: { [key]: next } }`).

| Site | What it does | Breaking precondition present? | Severity |
| - | - | - | - |
| `packages/server/src/domain/refinery/verbs/update-session.ts:53` | `set.stageConfig = refineryStageConfigSchema.parse(patch.stageConfig)` — whole-record replace of the per-stage config record | **PARTIAL.** The only client writer spreads its CACHED view first: `packages/client/src/features/refinery/components/refinery-context-tabs.tsx:137` — `stageConfig: { ...view.stageConfig, score: {…} }`. Not a single-key write, so no omission-clobber; it IS a stale-image write (any stage config changed between the read and the save is reverted). No second writer of `stageConfig` found (`start-session.ts:31` is creation only). | LOW |
| `packages/server/src/domain/refinery/verbs/update-session.ts:50` | `set.selection = refinerySelectionSchema.parse(patch.selection)` — whole-record replace | **YES (second writer exists).** The SERVER also writes `selection`: `packages/server/src/domain/refinery/verbs/apply-fields.ts:67` remaps it (`remapSelection(session.selection, removedGreetingIndexes)`) when greetings are removed. A scope dialog open across an `applyFields` (`refinery-content-surface.tsx:241`, `refinery-context-tabs.tsx:127` both send a whole `selection` built from the loaded view) saves the PRE-remap image and undoes the remap. | LOW-MED |
| `packages/server/src/domain/chat/verbs/chat-lifecycle.ts:241` | `setVariables` — `.set({ variableValues: values })`, whole `Record<string,string>` replace | **NO.** Sole writer of the column (checked `variable-ops.ts`, `runtime-variables.ts`, `engine/*`, `turn.ts`: `{{setvar}}` writes land on `runtimeVariables`, not `variableValues`). Client sends a full image. Latent only across two tabs (LWW — the D2 class prior art already names). | LATENT |
| `packages/server/src/domain/chat/verbs/chat-lifecycle.ts:255` | `setUserMacroValues` — `.set({ userMacroValues: parsed })`, whole nested macro→input bag replace | **NO.** Client folds key-wise before sending (`packages/client/src/features/chat/components/macro-picks-section.tsx:74-81` `withPick`, sent at `:306`); no other writer of `chats.user_macro_values` outside import. Same two-tab LWW residual. | LATENT |

**Verified CLEAN, with the reason (so a later sweep does not re-open them):**

- `packages/server/src/domain/settings/verbs/update-user-settings-section.ts:30-40` — `deepMergePlain`
  per section INSIDE `ctx.serializeUserWrite(ownerId, …)`. This is the correct shape for the class and
  the one the others should be measured against.
- `packages/server/src/domain/rpg/snapshot-edit.ts` + `substrate/merge.ts:214-249` — every snapshot
  plane is \[merge-clear] key-wise (`trackerValues` explicitly a RECORD merged per key, `merge.ts:91-94`);
  the single-key client writes (`rpg-scene-tab.tsx:172`, `rpg-inventory-tab.tsx:201`) ride op-shaped
  or merge-clear doors.
- `packages/server/src/domain/rpg/verbs/game/update-config.ts:86,90,103` — `statProfile`/`trackers`/
  `userMacros` are whole-blob by DESIGN and the clients submit the whole editor state
  (`rpg-stat-profile-editor.tsx:9,129`, `rpg-game-tab.tsx:182`). No per-key writer exists.
- `packages/server/src/domain/settings/verbs/update-theme.ts:21-43`, `persona/verbs/update.ts:23`,
  `world-info/verbs/entries/update.ts:24-40`, `credentials/verbs/add.ts:28-52` — whole-object
  replaces fed by a whole FORM. No single-key writer.

**Structural receipt.** `ast-grep run -p '$K: $P.$F !== undefined ? { ...$P.$F } : $C' -l ts
packages/server/src --inspect summary` → `scannedFileCount=1314`, 0 matches; literal
`grep -rnE "^\s+[a-zA-Z]+: \{ \.\.\.(patch|params|input)\."` over `packages/server/src` → 0. The
exemplar's exact spelling exists nowhere else; the four rows above were found by walking the JSON
record columns in `packages/db/src/schema/*.ts` (68 `mode: "json"` columns enumerated) to their
update verbs, not by pattern.

---

## Class 2 — FLOOR SYNTHESIS FOR ABSENT DATA

**Exemplar (fixed):** `packages/client/src/components/tracker-blocks/tracker-blocks.tsx` `StatCell`
(`value: number | null`, em-dash arm, `??` not `||` so a real `0` still prints) +
`packages/client/src/features/rpg/components/rpg-attribute-grid.tsx:44`
(`actor.sheet.attributes[def.key] ?? null`, was `?? profile.range.min`).

| Site | What it does | Breaking precondition present? | Severity |
| - | - | - | - |
| `packages/client/src/features/rpg/components/rpg-takeover-header.tsx:95` and `:105` | `clock.minute ?? 0` — prints `21:00` and hands the Waystone `minute: 0` when the minute is NULL | **LATENT.** `hour` and `minute` are INDEPENDENTLY nullable (`packages/contracts/src/rpg/ambient.ts:37-38`) and the sibling arm right above it refuses to synthesize (`:104` returns `null` for a null HOUR rather than substituting midnight — the same reasoning, one field over). No producer reaches `hour≠null ∧ minute=null` today: `tools/apply.ts:359` writes `minute: 0` whenever it writes an hour, and `rpg-scene-tab.tsx:63` nulls both. It IS representable through `editSnapshot`'s arbitrary patch door. Cosmetic when it fires (a fabricated `:00`). | LOW / latent |
| `packages/client/src/features/chat/components/invite-dialog.tsx:224` | `${invite.remainingUses ?? 0} of ${invite.maxUses} uses left` | **NO — dead branch.** The producer correlates the two: `packages/server/src/domain/chat/verbs/invites.ts:319` `remainingUses: row.maxUses === null ? null : Math.max(0, …)`, so inside the `maxUses !== null` branch `remainingUses` is never null. Noise, not a defect. | NONE |

**Verified CLEAN, with the reason:**

- `packages/client/src/components/tracker-blocks/meter-row.tsx:180-210` — `meterDatum` prints the
  em-dash for a null reading and `MeterTrack` explicitly draws an EMPTY track over a nominal `max ?? 1`
  *and drops `dangerBelow`* so no invented number reaches the user. This is the class's model answer.
- `rpg-actor-trackers.tsx:80` and `rpg-scene-cast.tsx:115` — both carry an explicit comment recording
  the `?? 0` removal (side-eye 2026-08-01). Already fixed.
- `packages/server/src/domain/rpg/tools/apply.ts:148` — `(trackerNumber(current) ?? 0) + d.delta`
  (a delta against an absent reading starts from 0) is RULED in that function's own header
  (`:125-131`, "the spend-from-a-resource-you-never-had arm"). Same for the wallet arm at `:112-122`.
  Not a defect; do not "fix" it.
- `packages/client/src/features/rpg/components/rpg-scene-tab.tsx:133` `?? 1` — the day fallback is the
  first-write default for a game with NO clock at all; the header at `:53-63` is the record of the
  fabricated-`day 1` bug already being fixed (`clearTimePatch` preserves the day).

**Sweep receipt.** Literal `grep -rnE "\?\? *(0|1|-1)\b|\|\| *0\b"` over `packages/client/src`
`--include=*.tsx` → 36 sites, all read. The 34 not listed are `.length`/`Map.get` accumulators,
count badges, sort comparators, or FORM-hydration defaults (a form control needs a value; absence is
carried by the model, e.g. `character-card-form-model.ts:92`), none of which display a datum's
absence as a reading. The `.ts` half was swept with the same expression minus `.length|get(|.size|
seen|count|index` — remaining hits are all `DEFAULT_*` form/settings hydration.

---

## Class 3 — POSITION-BLIND LATEST

**Exemplar (fixed):** `packages/server/src/domain/rpg/persistence/snapshots.ts` `turnRung` (walks the
SELECTED lineage via an inner join on `messages.selectedVariantId`) + `latestSnapshot`'s
`onLiveLineage` guard (`:~300`).

| Site | What it does | Breaking precondition present? | Severity |
| - | - | - | - |
| `packages/server/src/domain/rpg/persistence/turn-tool-calls.ts:45-52` | `listTurnToolCalls` — `where(gameId)` → `orderBy(desc(createdAt), desc(id))` → `limit(50)`. **No selected-lineage filter**, while its direct sibling `packages/server/src/domain/rpg/persistence/journal.ts:36-50` applies exactly one (`or(isNull(variantId), exists(selectedForVariant))`) | **PARTIAL, and the framing matters.** Rows are one-per-VARIANT (`packages/db/src/schema/rpg.ts:319-332`, unique on `variant_id`), so a rerolled slot leaves its abandoned siblings' rows in the table. Including them is DELIBERATE and tested — `tests/server/domain/rpg/persistence/turn-tool-calls.int.test.ts:63` rules "both live in the game's window — the client indexes by variant and the ROW picks its own", and the client does exactly that (`packages/client/src/features/rpg/hooks/use-turn-tool-calls.ts:50`). So this is NOT a wrong-row defect. It IS a **window-budget** defect: the window is a flat 50 (`use-turn-tool-calls.ts:28` `TURN_TOOL_CALLS_WINDOW = 50`, matching the verb's own default), shared with rows nobody can ever look at, so on a reroll-heavy game the disclosure silently goes dark for older SELECTED turns that are still on screen. The journal sibling does not have this problem for exactly the reason it filters. | LOW |

**Verified CLEAN, with the reason:**

- `packages/server/src/domain/rpg/persistence/journal.ts:36-50` — lineage-filtered (the pattern).
- `packages/server/src/domain/discovery/persistence/message-reads.ts:61-64` — orders by `createdAt`
  but joins `messageVariants.id = messages.selectedVariantId`, so abandoned variants are excluded
  by construction.
- `packages/server/src/domain/rpg/persistence/checkpoints.ts:26` — a user-authored bookmark LIST
  (no "current" resolution), and the snapshot FK is RESTRICT.
- `packages/server/src/domain/chat/persistence/queries.ts:399` — child chats by `createdAt` is a
  branch LIST, not a latest-resolver.

**Sweep receipt.** `grep -rnE "orderBy\(desc\((.*createdAt|.*updatedAt)"` over
`packages/server/src` → 41 sites, all read; the ones with a selection/lineage axis available are the
four listed. `.at(-1)` / `[x.length - 1]` sweep over `packages/server/src` + `packages/client/src`
(both `.ts` and `.tsx`) → every hit is over a `seq`-ordered canon array, a cursor tail, or a
non-entity tuple; none picks a "current" row off wall-clock order where a lineage axis exists.

---

## Class 4 — maxPages / WINDOWED QUERY + CLIENT-SIDE LENS

**Fenced exemplar (in flight, excluded):** `packages/client/src/features/character/surfaces/character-library-surface.tsx:57,69-76`.

**Structural receipt.** `ast-grep scan` (rule: `kind: pair` with `key` matching `^maxPages$`) over
`packages/client/src` → `scannedFileCount=429` (ts) + `503` (tsx), **exactly 3 hits total**, listed
below. Positive control for the rule shape: the same rule with `createPersistedStore` returns 7,
matching the 7 known mints.

| Site | What it does | Breaking precondition present? | Severity |
| - | - | - | - |
| `packages/client/src/features/databank/surfaces/databank-library-surface.tsx:65,78-90` | `MAX_PAGES = 5` + `maxPages: MAX_PAGES` (`:84`) + `getPreviousPageParam: () => undefined` (`:83`) over `databank.list`; rows explicitly **not virtualized** (`:63-64`) | **YES — the D4 shape, unfenced.** The lens is client-side on BOTH axes: name search at `:142` (`documents.filter(doc => doc.name.toLowerCase().includes(needle))`) and the phase chip at `:143`. The server contract has no search: `packages/server/src/transport/trpc/routers/databank.ts:55-64` accepts `origin`/`limit`/`cursor` only. So (a) searching only searches the loaded window, and (b) past 5 pages the head page is EVICTED and unrecoverable for the session (`getPreviousPageParam` returns undefined) — documents vanish off the top as you scroll. Page size is `UserSettings.library.pageSize` (`:114`), i.e. the same 150–500-row ceiling the character tab has. | **MED** |
| `packages/client/src/features/chat/hooks/use-chat-list-collection.ts:30,50-51` | `MAX_PAGES = 5` + `getPreviousPageParam: () => undefined` over `chat.listChats` | **HALF.** The lens half is CLEAN and deliberately so — `search` and `characterId` are both query INPUT and resolve server-side (documented `:10-18`; the client `filter-chats.ts` was deleted). What remains is the eviction half: at 50/page × 5 the head page drops and cannot be re-fetched, so a deep scroll in the virtualized list loses the top rows for the session. | LOW |

**Reviewed and NOT reported as defects (with the ruling that covers them):**

- `packages/client/src/features/chat/surfaces/command-palette-surface.tsx:42,157` — `RECENT_THREADS = 20`
  with cmdk filtering client-side over the mounted rows. This is an OWNER-RULED cap (2026-08-09,
  recorded in that file's header `:3-10`): cmdk can only score what it mounts, virtualizing inside a
  `CommandGroup` would make the palette's search silently blind, so the group is honest ("Recent
  threads") and full search lives in the chats pane's server-side search.
- `packages/client/src/features/chat/hooks/use-chat-portrait-map.ts:26-31` — a bounded
  `characterId → portrait` map at `CHARACTER_LIST_MAX_LIMIT`; the degradation past the ceiling and
  the real fix (rows carry their own seats' portraits) are already written into the file at `:22-27`.
- `packages/client/src/components/character-picker.tsx:97` — outside the fenced *directory* but it is
  the SAME defect the fenced lane owns (prior art §2.4 names it; §5.9 W9 specifies the fix). Flagging
  the path only so the character lane does not miss it while fixing `features/character/**`.

**Non-infinite paged sources with a client lens** were swept by literal grep for `limit:` in client
query options (26 sites, all read); apart from the three above, every one is either a count-only probe
(`COUNT_ONLY_PAGE`), a deliberately bounded recents/quick-picks tile, or a lookup map with its
degradation documented.

---

## Class 5 — PERSISTED RAW IDS, NO EXISTENCE VALIDATION

**Owned elsewhere (excluded):** `packages/client/src/state/character-library-store.ts:68-88`
(`tagFilter`, W5 of the staleness design).

**Receipt.** All 7 `createPersistedStore` mints enumerated by `ast-grep scan` (validated rule, 7/7
matching the literal grep) and every one read in full. Result: **the tagFilter is the only live
carrier of a dying server id in durable-local state.**

| Store (`orb:` key) | Ids it carries | Validated on read? | Severity |
| - | - | - | - |
| `state/recent-models-store.ts:47` (`recent-models`) | provider MODEL ids, per source | **YES — and this is the exemplar W5 should copy.** `packages/client/src/features/credentials/lib/model-picker-model.ts:262`: `recentIds.map(id => poolById.get(id)).filter(entry => entry !== undefined)` — an id absent from the live pool is dropped from the Recent group. That is §4.2.2's "effective-filter rule", already built. | CLEAN |
| `state/composer-draft-store.ts:53` (`composer-draft`) | map keyed by `ChatId` / draftKey | No existence check, but harmless by construction: an entry for a dead chat is unreachable (`useComposerDraft(scopeKey)` is asked by the live room only), empty drafts never persist, and the map is MRU-capped at 50 (`:26,:41-44`). Residual is storage residue, not a wrong render. | NEGLIGIBLE |
| `state/shell-store.ts:231` (`shell`) | `SectionId` / `ModalSlotId` / `SettingsCategoryId` — declared vocabulary, not server rows | Yes: `isSectionId` + `RETIRED_SECTION_HEAL` (`:54,:156-163`). | CLEAN |
| `state/tag-library-store.ts:34` (`tag-library`) | none (a sort mode) | Yes (`isSortMode`). | CLEAN |
| `state/config-group-open-store.ts:37` (`config-group-open`) | collection KIND strings (host-opaque, not row ids) | Ruled at `:14-16`: an unknown kind is a kind that no longer registers, costs one dead array member, dropped on next toggle. | CLEAN |
| `state/home-tile-box-store.ts:58` (`home-tile-box`) | `tileId` (declared contribution ids) → reserved heights | n/a — no server row can die behind it. | CLEAN |
| `state/character-library-store.ts:107` (`character-library`) | `TagId[]` (`tagFilter`) | No — **W5's**, not re-reported. Note its other persisted fields (`sortMode`/`viewMode`/`favoritesOnly`/`showArchived`/`spoilerBlur`, `:90-104`) are all vocabulary/booleans and carry no ids. | (owned) |

**Two side findings worth the doc owner's attention:**

1. **No `orb-draft:*` blobs exist today.** `createEntityDraftStore` is exported
   (`packages/client/src/state/index.ts:115`) but has **zero call sites** — `ast-grep scan`
   (`kind: call_expression`, function `^createEntityDraftStore$`), `scannedFileCount=429` ts +
   `503` tsx, 0 hits, with the 7-hit `createPersistedStore` positive control on the identical rule;
   corroborated by literal grep. `staleness-and-session-freshness.md:60-61` counts "entity-draft
   mints (`orb-draft:*`)" as a live durable-local class and §5 W6 plans to namespace them — that
   inventory line looks STALE, and W6's scope is smaller than written.
2. **The server-side twin of this class is policy, not oversight.** `UserSettings` stores
   `selectedThemeId`/`defaultPersonaId`/`currentPersonaId`/`welcomeAssistantCharacterId`/
   `defaultPresetId`/`backgroundAssetId` as plain strings, each with an explicit
   `@orb-gate-ignore no-raw-id` citing "degrades at resolution"
   (`packages/contracts/src/settings/index.ts:530-544,882-883`). Those degrade claims are asserted
   per-field in comments; I did not verify each resolver, so this is named as an unswept surface,
   not as a finding.

---

## Instrument notes (so the next sweep does not repeat them)

- `ast-grep run -p 'maxPages: $A' -l ts|tsx` returns **0 matches on a tree that literally contains
  three `maxPages: MAX_PAGES` lines** — a bare `key: $V` pattern does not match an object `pair`
  node here. The working instrument is `ast-grep scan --inline-rules` with
  `rule: {kind: pair, has: {field: key, regex: "^maxPages$"}}`. Every property-name sweep in this
  report used the rule form and was run against a known-positive control first
  (\[\[instruments-lie-verify-the-verifier]], \[\[ast-grep-property-read-has-three-shapes]]).
- `--inline-rules` is a `scan` flag, not a `run` flag (`ast-grep run` rejects it outright).
