---
kind: spec
status: draft
updated: 2026-08-02
---

# CONFIG RAIL — the Configuration workspace (R1 design set)

**Status: R1 + R2 BUILT (2026-08-02).** The Configuration section, the `CollectionContribution` contract, the `collection-registry-completeness` gate and the first three members (tags · regex scripts · world info) are on the tree; the settings panes they replaced are deleted, and **R2 removed `worldInfo` from `SECTION_IDS`** — the rail is back to eight, the World Info section definition / list surface / band are deleted, and a persisted `activeSection:"worldInfo"` heals to `config` (`RETIRED_SECTION_HEAL`, shell-store). R2 also added two things the R1 contract lacked: the roster read `worldInfo.listBooksWithUsage` (the row scent "42 entries · attached ×3" — the `tag.listTagsWithUsage` precedent, since only forward attachment lists existed), and the contract's optional `importFile` field, which lands D121-D's `band=Import` half on the group band as DATA the host draws (Export stays the row kebab). R3 (presets, owner-timed) is unbuilt and remains one door line. What follows is the SURFACE law the build was held to — where a row says something the built tree contradicts, the row carries its own amendment. This file states the decisions the committed mocks ENCODE, so the owner can rule on drawings rather than on prose. The mechanism it rides was designed and receipted in the stickler review [`../reviews/stickler/2026-08-03-collection-contribution.md`](../reviews/stickler/2026-08-03-collection-contribution.md) (the `CollectionContribution` contract §4, the host/door assembly §5, the migration table §6, the gate arms §7, the staging §9). **That review is the contract law; this file is the SURFACE law.** Where they disagree, the review wins on mechanism and this file wins on pixels — and both lose to the D-ledger.

Bound by the rulings the lane was dispatched under: **presets are OUT** · groups are **owner-rendered** (review F-5) · placement is the **door array** (F-3) · the vocabulary is **host-controls** (the host draws chrome, the contribution draws content) · **the existing tag / regex / world-info surfaces are the MEMBERS — their editors are framed, never redesigned**.

## 1. The mocks (the deliverable the owner eyeballs)

| Drawing | What it settles |
| - | - |
| [`mocks/config-rail/workspace.html`](mocks/config-rail/workspace.html) | the tri-pane at rest: the roster (3 owner-rendered groups), the regex member editor MOUNTED in CONTENT, the per-collection CONTEXT arm, plus a seam diagram marking every region HOST or CONTRIBUTION |
| [`mocks/config-rail/empty-states.html`](mocks/config-rail/empty-states.html) | first-run (all three empty) · one empty group among populated siblings · the no-selection welcome in both voices · a member whose collection declares no context arm |
| [`mocks/config-rail/rail-and-glyph.html`](mocks/config-rail/rail-and-glyph.html) | the 9th-section glyph (recommendation + 2 alternates, each at 19px beside its real neighbours) · the rail arithmetic across R1/R2/R3 · the vacated settings categories |
| [`mocks/config-rail/mobile.html`](mocks/config-rail/mobile.html) | the D62-P3 bottom-bar reality: reached through the You sheet, the roster full-bleed, the member takeover, the context arm folding into CONTENT |

Renders (receipts, regenerated on every mock edit): `reports/snaps/config-mock-{workspace,empty-states,rail-and-glyph,mobile}.png`.

The drawings use the real Hearth dark values verbatim from `packages/ui/src/styles/theme.css` and the real shell dimensions from `tokens.json` (`rail` 3.5rem · `chrome-row` 3rem · `panel` / `panel-context` clamps). Following the `preset-redesign` precedent they are **dark-only** — the theme corpus has no light-mode mock and the decisions here are none of them polarity-sensitive.

## 2. The decisions the mocks encode

Each row is either a RECOMMENDATION carried forward from the review (cite in the last column) or an OWNER FORK the drawing deliberately does not close.

| # | Decision as drawn | Status |
| - | - | - |
| C-1 | **Group order = door-array order: Tags · Regex scripts · World Info.** Smallest/most-atomic first, the migration order (R1 then R2) reading top-down. Presets ABSENT. | REC (review F-3, §6 order) |
| C-2 | **Create lives at the GROUP header** — a per-group ghost `+` whose accessible name is the contribution's own `create.label`. The LIST band carries NO aggregate primary. | REC — closes review F-8's "mock-pass question" |
| C-3 | **Selection is kinded** — `{kind, memberId} \| null` through a kinded overload on `createDrillSelectionStore`; the host pre-binds `kind` per group, so a contribution's `list` view sees `selectedId: string \| null` already scoped to itself. | REC (review F-7) |
| C-4 | **Rows are OWNER-rendered inside a HOST frame.** The host draws icon + kicker + count + create; nothing inside the row list. | RULED (F-5) |
| C-5 | **Placement is the door array, no `anchor` field.** Moving a collection between the rail and the roster is one array line. | RULED (F-3) |
| C-6 | **Host-controls vocabulary.** HOST owns: the section frame, the LIST band, every group band, the welcome, the context-empty frame, the selection. CONTRIBUTION owns: rows, the member editor, the context body, its own queries and mutations. | RULED |
| C-7 | **The member editor is MOUNTED in CONTENT, never a dialog.** Regex's editor is the worked example: the same fields as `RegexEditorDialog` (name · find pattern via the code editor · replace · placement chips · enabled · run-on-edit), the autosave status moving to the band. No field is added, removed or reworded. | REC (D66 A2 "real per-object editors, no popups") |
| C-8 | **Empty is first-class at three levels:** a zero-member group keeps its band and shows a dashed one-liner with its create verb; no-selection CONTENT is a designed welcome with a launcher card per collection (never null); a collection with no `context` gets ITS OWN empty copy, not a host-generic one. | REC |
| C-9 | **The rail glyph is `Package`** (sealed, unused elsewhere), alternates `LayoutGrid` and `Archive`. `Settings` is ruled out on purpose — the gear is the settings-modal trigger and the whole point of the migration is to stop conflating the two. | FORK (owner picks; all three are already in the seal) |
| C-10 | **Mobile curation is `"sheet"`** — reached through You, matching every other authoring section, leaving the four-tab bar untouched. | FORK F-13 (below) |
| C-12 | **Groups start COLLAPSED, and the expanded set is remembered per device.** The band (icon · kicker · count · create `+`) is the map; one click opens a group. Past ~30 members an expanded group gets the host's FILTER input (count-driven chrome, applied by the owner's rows through `CollectionListView.filter`) and the owner windows its rows through the sealed `VirtualList`. | **RULED (owner, 2026-08-02) — SUPERSEDES the mocks' always-expanded drawing.** The real library is ~400 tags: an always-expanded group buries every sibling collection below its scroll, and the roster stops being the map of what EXISTS. REJECTED alternative, recorded so it is not re-proposed: a MODE PICKER that swaps the list wholesale to one collection at a time — that is tabs reborn, and it costs the roster's whole teaching job |
| C-11 | **Vacated homes:** `SETTINGS_CATEGORY_IDS` loses `tags` and `regex` at R1; the settings "Library" group disappears with them; nothing tombstones. | REC — needs the redirect work in §4 |

## 3. The build's coupled-site walk (lockdown §6a, the SECTION_IDS playbook)

The build phase walks the ten-step playbook **added 2026-08-03** at `client-architecture-lockdown.md` §6a, in order, ONCE per stage. What each step means for this surface:

1. **`state/shell-store.ts`'s `SECTION_IDS` tuple** — R1 appends `config`; R2 removes `worldInfo`; R3 (if ever) removes `presets`. **Tuple order is rail order**, so the insertion point IS the C-1-adjacent visual decision: `config` goes at the head of the `authoring` run (drawn that way in `rail-and-glyph.html`).
2. **The persisted-state sanitizers in the same file** — `isSectionId` must fall back cleanly for a user whose storage still says `"worldInfo"` at R2 (they land on `config`, not on a blank shell), and `config` needs its `panelDefaults` (`{list:"docked", context:"collapsed"}` — the world-info posture, drawn).
3. **The definition + factory + front-door export** — `features/config/lib/config-section.tsx` exporting `makeConfigSection(collections)`, plus the `main.tsx` door row. G1 keys on LOCATION; `feature-owns-definition`'s `DEFINITION_RE` gains `|collection` in the SAME commit as the first `*-collection.tsx` (review §7.4) or tags/regex go RED the moment their `-pane.tsx` defs delete.
4. **Per-section selection store** — `state/config-selection-store.ts`, a G27 mint, kinded per C-3.
5. **`agent-nav/` vocabulary validation** — `__orb.nav` must accept `config` at R1 and REJECT `worldInfo` at R2, or the tooling lens lies about the app.
6. **`tests/support/ct/ct-data-providers.tsx`** — the real section registry AND the `fakeSection` fold; tsc reds the Record, the mirror's INTENT is a per-edit judgment call.
7. **Mobile fate** — `rail.mobile` is explicit, no default: `"sheet"` as drawn (C-10 / F-13).
8. **Chrome derivation** — `assembleChrome` reads `sections.list()`. VERIFY only. A hand-added rail or You-sheet entry is a G2 parallel map forming.
9. **Placeholder copy** — `config` needs a DISTINCT (title, description); the drawn welcome copy is the source, and the same sentence is the home-tile gloss if a config tile ever lands.
10. **The rail prose** — `UI-Architecture-and-Layout.md` §4.1's section list, plus this spec and the review.

**And the settings twin, done in the same commit as step 1** (the playbook's closing sentence): `SETTINGS_CATEGORY_IDS` minus `tags`/`regex`, the two pane defs deleted, the door assembly shrunk, and `settings-pane-registry.test.ts`'s partition mirror updated. `assertSettingsKeyPartition` throws at the door if the partition and the tuple disagree — that throw is the proof the twin was walked.

## 4. Deep links, settings search, and what a stale URL does

The migrated collections have three live entry points that must not 404 (the one piece of §3 the playbook does not spell for you):

- **`openSettingsTo("tags" | "regex")`** — a typed shell action today. After R1 the ids are gone from `SettingsCategoryId`, so tsc kills every literal call site; each becomes a section navigation (`setActiveSection("config")`) plus a selection intent. **REC: no compatibility shim.** The union is closed and the compiler enumerates the callers — a runtime redirect would be an untyped second vocabulary for a migration tsc can complete.
- **`settingsAnchorId("tags", …)` / `settingsAnchorId("regex", …)` anchors** — consumed by the settings nav + search. They delete with their panes.
- **Settings SEARCH** — `settingsSectionNavs` derives from the same grouping the panes register into, so the two entries vanish from search automatically once the panes are gone (verify, don't edit — the D120 derivation). **The gap this leaves is real and worth a decision:** a user who types "regex" into settings search after R1 gets NOTHING, because the workspace has no search index. **REC: at R1, settings search keeps a single stub row per retired category whose action navigates to the config section** — the cheapest honest answer to "it used to be here". FLAGGED as the one place a tombstone earns its keep, against C-11's general no-tombstone rule.
- **⌘K** stays the global door; a `config` section is reachable there the moment it registers (derivation, step 8).

## 5. Open forks (the owner's list)

The review's F-1…F-10 stand as written. The mock pass adds three, and closes one:

- **CLOSED — F-8 (create affordance grammar):** per-group header `+`, drawn. The band-level "New ▾" fold is rejected with its reason in `workspace.html`.
- **F-11 · Tags have no member editor today.** Every tag control currently lives INSIDE the settings row (rename · two colour pickers · folder Select · hide switch · merge · delete, all immediate-commit). A mounted member editor SPLITS that anatomy into a compact row (swatch + name + usage) and a CONTENT editor — a real change to the tag surface, not just a frame. Arms: **(a)** split as drawn (`empty-states.html` frame 3); **(b)** keep the fat row and give tags a `detail` that is a usage breakdown + destructive verbs only. ▸ **(a)**, because a 330px roster row cannot carry two colour pickers and a Select without becoming the thing the migration was meant to fix — but this is the one place the lane's "do not redesign the members" constraint genuinely bites, so it is the owner's call, not mine.
- **F-12 · Who owns the launcher-card blurb.** The welcome cards need one sentence per collection that the group band does not supply. Arms: a `blurb` field on the contract (additive, contributor-owned, the placeholder-copy-distinctness posture) vs. the host holding three strings (fails the moment a fourth collection registers). ▸ the contract field.
- **F-13 · The mobile curation.** Drawn `"sheet"`. If Configuration becomes where a phone user goes MOST (it is the only place tags and regex exist at all once the panes retire), it could claim a bar tab and push Corpus into the sheet. That is a bar re-curation, not a config decision. ▸ ship `"sheet"`, rule the bar separately.
- **F-9 (presets' idle readout)** is untouched and stays R3-timed — presets are absent from this design by ruling.

## 6. What this spec deliberately does NOT do

No contract is minted, no host feature exists, no gate is written, no tuple is edited. Per the review's dead-wire discipline the code lands only after the owner rules F-1 (the rail itself) — and R0 (the `section-factory-contribution-bundle` gate + the `makeChatsSection` 4→1 bundle refactor) is fork-INDEPENDENT and dispatchable regardless of what happens to these drawings.
