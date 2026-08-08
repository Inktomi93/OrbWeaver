---
kind: review
status: final
updated: 2026-08-03
---

# Tag experience audit — ST parity dig + neo carry-forward check + the "sort by most-used" idea

Owner's ask verbatim: sort tags by most-used (cheap?), plus a deep dig on SillyTavern's and neo's tag UI/UX
to make sure we're getting "the full tag experience." Read-only recon; no code changed.

## Method + coverage receipts

Three sources, three methods, per the code-recon skill's evidence ladder (declared → exported → imported →
called; no-matches ≠ absence; both `ts`+`tsx` always, both non-zero or the search didn't happen).

- **SillyTavern** (`/home/inktomi/inktomi-stack/SillyTavern/`, `public/` is the client): read
  `public/scripts/tags.js` (2824 lines, in full) and `public/scripts/filters.js` (tag-filter predicate, in
  full) directly — small enough that excerpting buys nothing per the skill's own threshold. Cross-referenced
  every JS-found control against its **template HTML** (`public/scripts/templates/tagManagement.html`,
  `deleteTag.html`, `charTagImport.html`) and `public/index.html` (`rm_tag_*`, `bogus_folder_*`,
  `character_search_bar`), then against the **locale string table** (`public/locales/de-de.json`, since
  `en.json` is keyed by the English source string itself and has no separate "tag" keys to grep) as a
  high-recall index of every user-facing tag string. This caught "Tags to Embed" (a card-export field, not
  in tags.js's own vocabulary) that a JS-only sweep would have missed — the correction was right.
- **neo** (`legacy-main` branch): materialized to disk via `git archive legacy-main | tar -x -C
  <scratchpad>/neo` (never `git checkout`/`worktree`/`cp` into the working tree). All 11 client tag files and
  the `tag-pending-review.md` design doc read in full (small: 724 lines across the client files combined).
  Server domain files diffed by inspection against main's (see below).
- **Ours (main)**: read every file in `packages/client/src/features/tag/` and the tag-touching parts of
  `packages/client/src/features/character/` in full, plus the server verbs/router/queries. `ast-grep`
  receipts for presence/absence claims (`--inspect summary` counts below); grep used only to corroborate,
  never to decide, per the directive.

**ast-grep receipts** (both languages, both non-zero unless stated — the discipline for a negative claim):
- `packages/client/src` (main): `-l ts` scanned=382, `-l tsx` scanned=464. `folderType` bare-identifier
  pattern returned 0/0 on **both** counts and looked like absence — it wasn't: bare identifiers don't match
  property-access nodes in ast-grep. Re-run as `$X.folderType` found the one real site
  (`tag-member-surface.tsx:155`). **Correcting my own false negative**, not just reporting the directive.
- `-p 'excludedTag'` over neo's client: `-l ts` scanned=354, `-l tsx` scanned=466, 0/0 matches, corroborated
  by `grep -rn "exclude"` (2 hits, both unrelated doc comments) → exclusion-filter concept is genuinely absent
  in neo, not a search miss.
- `-p '$X.folderType'` over main: `-l ts` scanned=382 (0 matches — expected, it's a `.tsx`-only usage),
  `-l tsx` scanned=464 (1 match) → `folderType` is written by the editor and read nowhere else (no
  open/closed grouping behavior on either lineage; confirms the brief's framing that it's cosmetic).
- `-p 'useBulkAddCardTag'` over main: `-l ts` scanned=382 (1, the hook def), `-l tsx` scanned=464 (4, two
  call sites: `character-tags-row.tsx`, `character-bulk-bar.tsx`) → bulk-tag-apply-across-selection is real
  on main, not just server-side.

**Not covered:** ST's non-English locale files beyond `de-de.json` (used as one string-table sample, not
exhaustively cross-checked against all ~15 languages); ST's `power_user` settings schema in full (only the
tag-relevant keys); neo's server-side `tests/` (read the verbs/queries themselves, not their test suites,
for behavior — the verb code is more authoritative for "what does it do" than a test name); main's mobile/
touch-target behavior for any of this (desktop-only pass).

---

## Gap register

Legend — **VERDICT**: WANT (build it) / SKIP (deliberately not copying, reason given) / ALREADY-HAVE (verify
receipt) / NEEDS-OWNER (taste call, not engineering). Size: S (hours) / M (session) / L (multi-session).

### Management (create/rename/recolor/delete/merge/prune)

| Capability | ST | neo | Ours | Verdict | Size | Why |
|---|---|---|---|---|---|---|
| Rename, 2 color pickers (bg+text), tri-state clear-to-default | ✅ `tags.js:2004-2200`, `appendViewTagToList` | ✅ `tag-settings-row.tsx:98-114` | ✅ `tag-member-surface.tsx:126-140`, `ColorField` null=theme-default | ALREADY-HAVE | — | Byte-identical capability carried neo→main, editor moved from row to CONTENT (F-11), not lost. |
| Folder-type (NONE/OPEN/CLOSED) as tag metadata | ✅ `TAG_FOLDER_TYPES`, cycles via click, `tags.js:2082-2115` | ✅ same 3-value enum, `tags-settings-model.ts` | ✅ `TAG_FOLDER_TYPES` contract enum, editable Select | ALREADY-HAVE | — | Field exists on all three; **ST is the only one that reads it for anything** (drilldown nav) — see Organization section. |
| Hide tag chip on card | ✅ `is_hidden_on_character_card`, eye-toggle | ✅ `isHiddenOnCard`, Switch | ✅ `isHiddenOnCard`, Switch, still filters/groups by it | ALREADY-HAVE | — | — |
| Delete with merge-into-another-tag option | ✅ `onTagDeleteClick`, one popup, `deleteTag.html` select | ✅ separate "Merge into…" Dialog + separate Delete | ✅ same split as neo | ALREADY-HAVE | — | ST combines delete+merge in one dialog; ours splits into two explicit actions. Functionally equal, no gap. |
| Prune unused (zero-usage tags) | ✅ `onTagsPruneClick`, confirm w/ counts | ✅ `Prune unused` button, no confirm dialog (bare mutate) | ✅ `PruneUnusedControl` w/ `ConfirmDialog` naming the count | ALREADY-HAVE | — | Main is **stricter than neo** here (side-eye 2026-08-03 P2 fixed a bare ghost-button mass-delete) — a real improvement over the carried-forward line, not a regression. |
| Standalone tag-only JSON backup/restore | ✅ `tagManagement.html` Backup/Restore buttons, `onTagsBackupClick`/`onTagRestoreFileSelect` | ❌ not found (`tag/verbs/export.ts` exists but `createTagLibraryExport` has zero consumers I could find in neo's compose layer at the depth I read) | 🟡 server verbs exist (`domain/tag/verbs/export.ts`, `import.ts`) but wired ONLY into the whole-profile portability bundle (`entry/compose/portability.ts:125-144`) — **not exposed as a standalone tag-only button anywhere**, not even in the tag router (`transport/trpc/routers/tag.ts` has no `exportLibrary`/`importLibrary` procedure) | SKIP | — | Bundle-level backup already covers the disaster-recovery case (tags.json rides every full export). A second, tag-only button is a convenience ST needed because it has no other bundle mechanism — we do. Not worth a dedicated UI door for a ~400-tag library that's already backed up wholesale. Flag if the owner disagrees — this is a taste call, not a hard no. |
| Autocomplete / live-suggest on the tag-name input (attach or create) | ✅ jQuery `.autocomplete` bound in `createTagInput`, `findTag()` fuzzy-includes existing names as you type | ❌ `TagPickerDialog` is a bare `Input`, no suggestion list (`components/tag-picker-dialog.tsx:65`) | ❌ same bare `Input`, verified identical file on main (`packages/client/src/components/tag-picker-dialog.tsx:65`) | **WANT** | S–M | At ~400 tags, typing "fan" with no suggestions is exactly how "fantasy" and "Fantasy" and "fantsy" all end up as separate tags. Server dedupes exact-fold on create, but a typo silently mints a new tag instead of attaching the existing one. This is the single highest-value gap in the whole register — cheap (an existing-tags list is already in cache via `listTagsWithUsage`; wants a filtered dropdown under the existing Input, no new endpoint) and it's the thing that keeps a library from decaying. |
| Bulk tag ops beyond "add across selection" (remove-mutual, reset-all, import-existing-for-selection) | ✅ `BulkEditOverlay.js:170-330`, four distinct actions | ❌ not found in neo's `character-bulk-bar.tsx`-equivalent (bulk add only) | ❌ `character-bulk-bar.tsx` has Tag/Archive/Delete only — bulk add, no bulk remove | SKIP | — | Niche power-user surface even in ST. "Add across selection" (which we have) covers the 90% case; "remove mutual"/"reset all" are cleanup ops better served by per-tag Prune + per-character editing at our scale. Not worth the extra bar real estate now. |

### Filtering / search

| Capability | ST | neo | Ours | Verdict | Size | Why |
|---|---|---|---|---|---|---|
| Multi-tag filter, AND semantics | ✅ `filters.js:225` `TAG_LOGIC_AND = true` (hardcoded, not user-togglable) | ✅ `character-list-view.ts:39` `.every(...)` — **file is byte-identical to main's copy** | ✅ same file, same line, verified identical | ALREADY-HAVE | — | Direct carry-forward, no drift. |
| Tag **exclusion** (NOT-this-tag), via a three-state toggle (select→exclude→clear) | ✅ `toggleTagThreeState`, `FILTER_STATES.EXCLUDED`, `filters.js:238-249` | ❌ absent — confirmed via ast-grep `-p 'excludedTag'` over neo client, `-l ts` scanned=354/`-l tsx` scanned=466, 0/0, corroborated by grep (2 unrelated hits) | ❌ absent — `character-filter-chips.tsx` is a plain two-state `Toggle` (pressed/unpressed), `CharacterFilterChips` component has no exclude affordance | **WANT** | M | This is a real, load-bearing gap that neither lineage ever had. At 400 tags, "show me everything tagged `npc` that ISN'T `retired`" is a common query shape a pure-AND multi-select can't express without pre-filtering by hand. The chip UI already has the click surface (`Toggle`) — the shape to add is a long-press/right-click/second-click cycling to a third "excluded" visual state, plus threading an `excludedTagIds: TagId[]` through `LibraryFilters`/`filterByChips`. Genuine net-new engineering, not a port. |
| Fuzzy/typo-tolerant tag search (management list + character-list filter chip search) | ✅ `fuzzySearchTags`, `findTag()` (`includesIgnoreCaseAndAccents`) | 🟡 not found — neo's `TagsSettingsList` has **no search box at all** (verified: `tags-settings-surface.tsx` read in full, no `Input`/filter state) | ✅ substring `.includes()` filter in `TagCollectionRows` (`tag-collection-rows.tsx:44`), **added post-neo** — better than neo, not fuzzy like ST | SKIP | — | Substring search is adequate at library scale for a management list you're scrolling anyway; true fuzzy (typo-tolerant) search is a bigger lift (a scoring library, like ST's `fuzzySearchTags`) for a feature that mostly matters on the attach/create input — see the autocomplete WANT above, which is where fuzzy actually pays off. Don't build a second fuzzy engine for the list search; if the autocomplete WANT ships, reuse whatever matcher it picks here too, cheaply. |
| Saved / named filter presets | ❌ not found in ST either (filter state persists per-context via `accountStorage`, but there's no "save this filter combo as X") | ❌ not found | ❌ not found | SKIP | — | Nobody has it. Not a gap, just confirming the ceiling — don't invent parity with a feature ST itself lacks. |
| Text search integrates with tag filter (AND-composed, same result set) | ✅ `FilterHelper` chains `SEARCH` + `TAG` filter types | ✅ (character list search + `filterByChips`) | ✅ (character list search + `filterByChips`, same shape) | ALREADY-HAVE | — | — |
| Show/hide the whole tag-filter chip row (a collapse toggle) | ✅ `onTagListHintClick`, per-context persisted (`show_tag_filters*`) | not checked at this depth | not checked at this depth (chips always render if `availableTags.length > 0`) | NEEDS-OWNER | — | Minor chrome-density call, not a capability gap — flagging as unverified rather than guessing. |

### Appearance / ordering

| Capability | ST | neo | Ours | Verdict | Size | Why |
|---|---|---|---|---|---|---|
| Manual drag-reorder | ✅ jQuery `.sortable()`, unlimited size | ✅ `SortableList`, unlimited (no library-size branch existed in neo) | ✅ `SortableList` for `≤30` tags (`COLLECTION_LARGE_GROUP`), read-only `VirtualList` above that | ALREADY-HAVE | — | Already established fact (per brief): capped at 30, real library is ~400 — so the manual-order UI is effectively **unreachable** for the owner's actual data today. This isn't a new finding, but it bears directly on the sort-mode ask below: manual mode is dead weight at 400 tags regardless of what we build next. |
| Named **sort MODE** as a first-class setting (Manual / Alphabetical / Most-Used), user-switchable, persisted | ✅ `tag_sort_mode` enum (`tags.js:254-258`), a `<select>` in `tagManagement.html:26-30`, `power_user.tag_sort_mode` persisted, comparator in `compareTagsForSort` (`tags.js:1783-1809`) | ❌ not found — neo's `TagsSettingsList` always uses `SortableList` (manual DnD order); no mode concept, no alphabetical/by-count comparator | ❌ absent — `tag-collection-rows.tsx` renders `SortableList` unconditionally below the 30-tag cutoff; there is no alphabetical or most-used sort mode anywhere, and `sortOrder` (the only persisted order) has exactly the 3 readers the brief already established, none of them a mode switch | **WANT** (this is the owner's floated idea) | S | See the dedicated section below — this is genuinely cheap, and at 400 tags it's the single most useful ordering improvement available. |
| Tag color as a real per-tag value (not a fixed palette) | ✅ `toolcool-color-picker`, arbitrary rgba | ✅ `ColorField`, arbitrary | ✅ `ColorField`, arbitrary, same tri-state null=theme-default idiom ST calls "link to theme color" | ALREADY-HAVE | — | — |
| "Link to theme default" reset affordance on the color picker | ✅ explicit 🔗 icon beside each swatch (`tags.js:2030-2044`) | ✅ empty-string-clears-to-null, no separate icon (implicit via clearing the field) | ✅ same implicit-clear idiom as neo | ALREADY-HAVE | — | Different affordance (icon vs. clear-the-field) for the same capability; not a gap, arguably ours is simpler chrome for the same result. |

### Import / export / provenance

| Capability | ST | neo | Ours | Verdict | Size | Why |
|---|---|---|---|---|---|---|
| Tags arriving with an imported character card, staged for review (not auto-applied) | 🟡 ST's version is IMPORT-TIME ONLY: a modal (`charTagImport.html`) with Existing/New/Folder buckets, Ask/All/Existing/None+remember setting, `ANTI_TROLL_MAX_TAGS=50` cap, `IMPORT_EXLCUDED_TAGS=['ROOT','TAVERN']`. No persistent queue — decide once at import time. | ✅ **more sophisticated**: a persistent `pending`/`accepted` provenance model (`tags.source` × `character_tags.status`), by-name chokepoint `attachCardTagByName`, doc'd in `tag-pending-review.md` as the then-unbuilt "Accept/Reject" client half | ✅ **fully built and shipped**, both server (`list-pending-suggestions.ts`, `attach.ts` status flip, `prune.ts` counts pending as live usage) and client (`character-tag-suggestions.tsx`, ghost-badge chips, Accept/Reject, "Suggest tags" on-demand distill) | ALREADY-HAVE | — | This is the one place our lineage **exceeds** ST, not just matches it: a durable review queue instead of a one-shot import dialog, PLUS an LLM auto-distill producer (`domain/discovery/verbs/distill.ts`) that ST has no equivalent of at all (ST only ever imports tags a card's author already wrote — it never generates new ones). Worth stating explicitly since the register is mostly "we caught up" — this row is "we're ahead." |
| Per-import Ask/All/Existing/None **setting**, remembered | ✅ `tag_import_setting` enum + "remember my choice" checkbox in the import popup | not verified at this depth (out of scope: this is import-workflow policy, not tag UI) | 🟡 our seeder (`character/seeder/cards.ts`) auto-stages `source:'card'` pending suggestions unconditionally — there is no user-facing "always accept card tags without review" fast-path | NEEDS-OWNER | S | This is a taste call: ST optimizes for "I trust most imports, ask me rarely"; ours optimizes for "everything sits in the queue, you triage." Given we already built the queue (see row above), collapsing to ST's ask-once modal would be a step backward for our model, not forward. Flagging, not recommending. |
| Author-embeddable "tags to embed" text field, independent of the local tag library | ✅ `public/index.html:6584-6589`, a free-text `tags_textarea` on the character creation form, separate from the app's own tag assignments | not checked | ❌ our export always mirrors the character's own **accepted** local tags 1:1 (`domain/export/verbs/export-character.ts:77-83`) — no separate "what to embed" authoring field | SKIP | — | ST's dual-list (your local organizing tags vs. what you choose to publish) is a real feature but it's also a well-known source of confusion in that app — "why doesn't my card show the tag I see in my library?" WYSIWYG (what's accepted is what exports) is the better default for a from-scratch build; don't reintroduce the split just for parity. |
| Anti-troll import cap (max tags auto-imported per card) | ✅ `ANTI_TROLL_MAX_TAGS = 50` | not verified | 🟡 not found — no cap located on the seeder/distill staging path in the files read | NEEDS-OWNER | S | Minor hardening question (a malicious/broken card embedding 500 tag strings), not a UX feature. Flagging for the security lens rather than recommending here — out of this audit's UX scope. |

### Organization / hierarchy

| Capability | ST | neo | Ours | Verdict | Size | Why |
|---|---|---|---|---|---|---|
| Tags-as-folders: a tag flagged OPEN/CLOSED actually changes the list — CLOSED hides its members until the folder is "entered" via drilldown navigation, a back button, breadcrumb | ✅ full mechanism: `isBogusFolder`, `chooseBogusFolder` (drilldown), `getOpenBogusFolders`, `filterTagSubEntities`, dedicated `bogus_folder_template`/`bogus_folder_back_template` markup, a global "Tags as Folders" settings toggle (locale-confirmed: `"Tags as Folders"`/`"Show tagged character folders..."`) | 🟡 the **enum and the field exist** (`folderType`) but I found no drilldown/navigation consumer in the character-list files read at this depth | ❌ confirmed via ast-grep `$X.folderType`: the field is written by the tag editor and read by **nothing else** — `groupByTag` (the categorized list) sorts by name only and doesn't branch on `folderType` at all; there is no "closed = hidden until entered" behavior, no drilldown, no back-navigation | **WANT** (but see caveat) | L | This is the biggest single capability gap in the register by mechanism size — ST's version is a real navigation model (open/closed/drilldown/breadcrumb), not just a grouping label. **Caveat before building it**: we already have `groupByTag`'s "each tag is a section header, characters can appear under multiple" categorized-list model, which is a *different and arguably better* fit for a library that groups by attribute rather than files-in-folders — CLOSED-folder semantics (hide until entered) fight the "scan everything at once" model the current categorized list already gives you. Recommend: **build OPEN as a real behavior (a section can be collapsed/expanded, cheap, additive to `groupByTag`)** and treat CLOSED/drilldown as a NEEDS-OWNER call — it changes the browsing model, not just adds an option. |
| Flat tags only — no multi-level parent/child tag hierarchy | ✅ confirmed absent — `grep -n "parent_tag\|parentTag\|nested" tags.js` = 0 hits, and the folder mechanism is single-level (a folder tag has no parent-folder-tag relationship) | ✅ same flat model (`TAG_FOLDER_TYPES` is a 3-value enum, not a tree) | ✅ same flat model | ALREADY-HAVE | — | Confirming a ceiling, not a gap: nobody in this lineage has true nested tag hierarchy. Not recommending it — a 400-tag flat namespace with folder-grouping is already the right complexity level; a tree adds a whole new navigation/CRUD surface (drag between levels, cycle prevention, depth limits) for a want nobody has stated. |
| A tag's category is derived (client-side groupBy), not a stored/authored hierarchy | 🟡 ST's folders ARE the hierarchy (author-set, stored on the tag) | ✅ `groupByTag`, pure client fold, `character-list-view.ts:54-79` | ✅ same, byte-identical file | ALREADY-HAVE | — | Different mechanism from ST (derived vs. authored) but functionally covers the "browse by category" need; not a gap. |

---

## The sort-by-most-used idea, evaluated directly

**Is it cheap? Yes, genuinely.** `listOwnedTagsWithUsage` (`packages/server/src/domain/tag/persistence/
queries.ts:288-313`) already computes each tag's `usage.total` via 5 parallel `countByTag` queries and hands
back a fully-populated `TagWithUsage[]` — the number the owner wants to sort by is **already in every
payload the client renders today**. No new query, no new field, no server change required to compute it.

**Where should the sort live?** Client-side comparator, same shape ST uses (`compareTagsForSort`,
`tags.js:1783-1809`, which sorts a `Map<id, count>` already in hand — it never round-trips to the server for
sort order). At ~400 rows a `.slice().sort()` on already-fetched data is sub-millisecond; a server
`ORDER BY` would require restructuring `listOwnedTagsWithUsage`'s 5-query fan-out into one combined query for
no measurable win. **Don't move it server-side** — that's solving a problem the data size doesn't have.

**Should it be a mode (owner's "most-used and etc.") or a fixed change?** A mode, mirroring ST's three
options exactly (Manual / Alphabetical / Most-Used) — not because ST has it, but because the three modes
solve three different real needs a 400-tag library actually has: Manual for the handful of tags you want
pinned to the top (which is now capped at ≤30 anyway per `COLLECTION_LARGE_GROUP` — see below), Alphabetical
for "I know the name, let me scan," Most-Used for "what am I actually using" (the owner's own framing).
Making it a fixed change (always-most-used) would break the alphabetical-scan case, which is the one that
matters when you're hunting for a near-duplicate before creating a new tag — directly relevant to the
autocomplete WANT above.

**What does the ~400-tag reality argue for?** It argues for shipping Alphabetical and Most-Used as the two
real modes and being honest that Manual is vestigial at this scale (it's already capped to the ≤30 arm and
unreachable above it — established fact, not new). Recommend: default the tag library to **Most-Used**
(closest to "what do I actually reach for"), offer **Alphabetical** as the alternative, and either drop the
Manual/`sortOrder` axis from the picker entirely or leave it as a third option that's silently inert above 30
tags (current behavior) rather than surfacing broken affordance. That's an owner taste call on whether to
formally retire `sortOrder`/manual mode now that a real alternative exists — flagging, not deciding.

**Size: S.** A `Select` in the tag-collection header (same idiom as `TagBehaviorControls`'s folder-type
Select), a `TagSortMode` union type + comparator function in `tags-model.ts` (mirrors
`usageTotalLabel`/`usageBreakdown`'s existing pattern in that file), a bit of client state (view-prefs store,
same home as `favoritesOnly`/`showArchived` on the character list) to persist the choice. No server change,
no schema change, no new endpoint.

---

## Ranked WANT list (value-per-effort, build-first-if-it-were-my-call)

1. **Sort mode (Alphabetical / Most-Used), default Most-Used** — S, zero server cost, data already in hand,
   directly answers the owner's own ask, and improves the #2 item below (alphabetical scan while typing).
2. **Autocomplete/suggest-existing on the tag-attach input** (`TagPickerDialog`) — S–M, highest value-per-
   effort of the register: at 400 tags this is the thing actively preventing duplicate-tag rot, and the data
   (`listTagsWithUsage`) is already cached client-side with zero new fetch.
3. **Tag exclusion (three-state filter)** — M, real gap neither lineage ever closed, but bigger than the
   first two (needs a new filter axis threaded through `LibraryFilters`/`filterByChips`/the chip component,
   not just a client-side sort or a dropdown).

Everything past #3 (folder drilldown/CLOSED semantics) is L-sized and changes the browsing MODEL, not just
adds an affordance — recommend treating it as a separate owner decision, not a queued build.

## Owner taste calls (not engineering decisions) — flagged above, collected here

- Standalone tag-only backup/restore button vs. relying on the whole-profile bundle (SKIP recommended, but
  it's a real ST affordance we lack).
- Ask/All/Existing/None import-time setting vs. our always-queue-everything model (recommend keeping our
  model — it's strictly more capable — but note it as a deliberate divergence, not an oversight).
- Whether to retire `sortOrder`/Manual mode once Alphabetical/Most-Used ship, given the existing ≤30-tag cap
  already makes it near-unreachable at the owner's real library size.
- Folder OPEN (collapsible section, cheap) vs. CLOSED+drilldown (a navigation-model change, not cheap) — build
  OPEN, defer CLOSED as its own decision.

## What ST does that we should NOT copy, and why

- **Dual tag lists** (local organizing tags vs. a separately-authored "tags to embed" export field) — a
  known source-of-confusion pattern in ST itself; our WYSIWYG accepted-tags-are-what-exports model is the
  better default for a fresh build, not a gap to fill.
- **Hardcoded AND-only, non-user-togglable tag-combination logic with a code comment telling future devs how
  to flip it** (`const TAG_LOGIC_AND = true; // switch to false to use OR logic`) — this is a config-via-source-edit
  smell we already don't have (both lineages hardcode AND the same way, but without the "edit this constant"
  invitation). Not proposing OR-mode as a user toggle either; AND is the correct default and per-tag exclusion
  (the WANT above) covers the real "not this one" need without adding a confusing global AND/OR switch.
