---
kind: design
status: active
updated: 2026-09-05
---

# Config collections in CONTENT — the #1725 canvas (owner-approved 2026-09-05)

**Owner-ruled 2026-09-05.** Nate, \~16:40Z: "k but tag list under in list is kinda a no go that needs to move
into content when clicking onto tags, same thing for regex and world info is what im trying to say right now
its mixed and looks weird" · "so that means content will need to be redesigned for those interfaces to properly
be consistent" · \~18:05Z, on version 3: "redesign approved it can be built to spec but must match the mockups".

The clickable canvas is the artifact `https://claude.ai/code/artifact/97cd2576-7f95-4cbe-8e8f-e004e83c16d5`
(version 3). These files are its repo source — `build.mjs` writes `canvas.html` (one self-contained page:
eleven boards from ONE renderer, each a preset state of the same shell; Hearth by default, a Light toggle);
`renders/` holds the default-state PNG of every board in both themes at true size (1440×900 desktop,
430×860 phone). Re-build from `build.mjs`; never edit the artifact by hand. This canvas is a plain artifact,
not a Claude Design canvas: no `seed-canvas` tool exists on the tree today (looked for 2026-09-05), so the
loop's instrument is a self-contained page and the loop itself is unchanged
(`design-canvas-mock-loop` / `mockup-first-build-loop`).

Version 3 is the one approved. Versions 1–2 went through two reviewers at the owner's ask (2026-09-05):
`REVIEW-stickler.md` (IA / interaction contract / coupled sites — verdict "redraw CONTENT and CONTEXT; the door
and the drill stand") and `REVIEW-sideeye.md` (UX / visual / a11y, both themes, live "before" receipt —
verdict "build with these changes"). Every P0/P1 in both is either drawn out in v3 or listed under §5 as a
build obligation. Both reports ship beside this file; the build brief cites them by section.

## 1. What the ruling changes, and what it does not

| Changes | Does NOT change |
| - | - |
| A collection's MEMBER rows leave the LIST pane. The band stays as the door. | Settings groups: the same band, section rows, scroll-spy, fold-in-place, arrival default (board 1 is the tree as it works today, drawn from `config-list-group.tsx` `SectionsBand`). |
| The library opens in CONTENT under the topbar, which names the screen (the section's `header`). | The four #925 landing rulings: arrival default · ENTER (now: select → CONTENT library; the LIST disclosure of member rows is retired — the ruling survives, its INPUT changed: the owner ruled WHERE members live) · fold in place · the unbuilt marker. |
| A row drills to the member's editor behind a Back; world info keeps its shipped second step (book → entry). | F5 arm A: an empty library is `emptyText` + one create door in CONTENT (board 7). |
| Create, Import, bulk-select move from the band to the library's control row. D121(D) "Import is the LIST band's affordance" survives with a changed input; recorded here, one home. | The teacher (CONTEXT): same pane, same tab rule (`config-teacher-tabs.tsx` `when`). |

## 2. The boards

| Board | Frame | State | What it decides |
| - | - | - | - |
| 01 arrival | 1440×900 | Settings · Appearance open, spy on Looks, teacher's at-rest roster | Nothing. The tree today; the control every other board is judged against. |
| 02 tags library | 1440×900 | Tags is the location | The door (§3.1), the control row (§3.2), insights, rows (§3.3), the teacher at a library (§3.5). |
| 03 tags member | 1440×900 | a tag drilled in | The drill header (§3.4); Applies for a tag = the `none` empty state. |
| 04 regex bulk | 1440×900 | Regex, Select scripts on | Stage glyphs lead, scent subtitle, checkbox replaces the kebab, selection bar (Enable · Disable · Delete — no Export, §8.6). No handles, no row switch. |
| 05 regex member | 1440×900 | a script open | Applies = "Where it's attached": the attach switch AND the per-scope order live there, one home. |
| 06 world-info book | 1440×900 | a book open | Edit details (dialog) · Backfill · New entry; the entries `SortableList` is the one real drag; Applies = "Where it fires" (Global lives there). |
| 07 rosters empty | 1440×900 | Rosters, none saved | The F5 empty arm, unchanged. Label is the shipped "Rosters". |
| p1–p4 phone | 430×860 | Settings list · library · member · member + details sheet | One screen at a time; Back pops one rung; "Show details" in the top bar opens the teacher as a sheet with a close, above the tab bar. |

## 3. The contract, slot by slot

### 3.1 The door (LIST)

The collection band IS the settings band — `SectionsBand`'s ghost `size="sm"` Button, 32px, the 16px chevron
gutter (left EMPTY, as the tree already reserves it for a band with no rows), the group icon, the
`interactiveKicker` label, badges — with two deltas: no `aria-expanded` (there is nothing to unfold) and a
live census (`useCount`) in the mono `datum` register at the trailing edge. `aria-current` while the
collection is the location, member open or not — spelled `"true"`, not `"location"` (owner-authorised
amendment, 2026-09-05): the settings band beside it says `"true"`, and one pane announcing its two band
kinds with two different tokens is the drift #1714 spent a lane removing. The token is not a visible
property, so "must match the mockups" is not at stake. The band's `+` is gone (one home for create, §3.2). Two band
kinds do NOT exist; the delta from a settings band is the chevron's visibility and `aria-expanded`.

### 3.2 The control row (CONTENT, first row)

`Filter <library>` (the contribution's filter — a FILTER, not the settings index's jump search; always
visible; the 30-member cliff and `COLLECTION_WINDOW_MAX_HEIGHT` existed because three bands shared one LIST
scroll column, and that column is gone) · the library's sort where it has one (tags: `Most used ▾`, Manual
enables handles) · the bulk toggle where declared (regex `Select scripts`) · the create door (primary) · an
overflow kebab holding `importFile` and library-level verbs (tags: Prune unused tags; regex/world info:
Import …). Six controls maximum; Import never sits as a bare button.

### 3.3 Rows

Every row is `LibraryRow → ListRow`, unchanged primitive: leading (tag swatch · regex stage glyphs · a book
has none) · title · subtitle that says what the tree knows (tags: "on 12 things" / "labelling nothing";
regex: the scent — find pattern + stamp; books: `bookScent`; rosters: members · rules) · `markers`
(`global` on a book, `always` on an entry) · the kebab as a SIBLING action (never nested inside the row's
door). No drag handle unless the sort is Manual (tags) or the list is a book's entries (the one real
order); none on regex — script order is per scope and lives in CONTEXT (`regex-context-body.tsx`, the
2026-08-19 fork stays closed). Rows are 44px at a fine pointer and 48px coarse by token construction.

### 3.4 Drilling in

A row swaps CONTENT to the member's editor. The drill header is `← Back to <library>` + the member's name +
the member's own verbs (regex: Test against a sample · world info: Edit details · Backfill · New entry ·
rosters: Start chat · tags: none). **No lifecycle chrome in a drilled header** (D121(D), #271): Delete stays
on the row's kebab; the fork "the kebab is off-screen while drilled" is answered by Back, as world info's entry
level already does. Editors carry no attach switch (regex) and no Global switch (world info): those controls
have one home, the details pane. The world-info book name is edited through its dialog (Edit details).

### 3.5 The teacher (CONTEXT)

`config-teacher.tsx` unchanged. At a library: About only — the collection's description paragraph (the
insights are CONTENT's, drawn once, never mirrored into the roster). At an open member: About + Applies, and
Applies IS the collection's own context arm — regex "Where it's attached" (the attach switch, the per-scope
order, the cards and rosters), world info "Where it fires" (Global, attachments, always-on count), tags the
`none` EmptyState ("a tag is worn, not attached"), rosters none. Learn appears only when a contribution
supplies `more`; none does. The head band names the subject over its place; the kicker reads `Settings · <tab>`. On a phone the topbar's `Show details` opens the same pane as a sheet with a close, docked above the
tab bar.

## 4. Vocabulary (all words on the boards are shipped or in `docs/design/vocabulary-map.md`)

Rosters (not "Saved rosters") · Start chat · Filter tags (filter, never search) · Show details · Always (an
entry's constant arm) · Labelling nothing / In use (tags' insights, `use-tag-collection.ts`) · Members (never
"cast"). Build lanes change NO shipped label without a vocabulary-map row.

## 5. What the build must honour beyond the drawing (from the two reviews)

1. `isPushingGroup` (`state/config-group-registry.ts`) has THREE readers; `config-content-surface.tsx` routes a
   pushing group to `GroupBody`, which returns `null` for a collection — split the predicate, do not flip it
   (stickler F15). `makeSelectionSeam`'s `clear()` (`config-section.tsx`) gains the entry rung so shell-Back
   from a world-info entry pops the entry, not the book (F9).
2. Keep the #1203 P0 keying law: any per-collection CONTENT host is keyed by group id.
3. `config-copy.ts` "Pick one from the list to open its editor." becomes false — replace, do not delete; the
   tag `none` context copy "Its usage … is on the left" becomes false (F14).
4. `COLLECTION_WINDOW_MAX_HEIGHT` and the 30-member filter gate are deleted with their premise, not retuned;
   virtualisation above 30 stays (the pane is the scroller).
5. A11y: no interactive nested in an interactive (the row door and the kebab are siblings); bulk checkboxes
   named; the crumb separator and the OFF stage glyph meet non-text contrast (side-eye measured 3.68/2.84:1 and
   1.13:1 in v2 — v3 draws the separator in `muted-fg` and the OFF glyph as an outlined square; the build
   proves both with the framebuffer); phone targets ≥ 44px (v2 measured 46/95 under; v3 sets every top-bar and
   row action to 44).
6. Rows at pane width carry more air than at 307px — the width matrix (both ends + the crossover, both
   pointers) is owed before the row anatomy is called converged (side-eye P1-4).
7. Every state the tree produces that the boards do not draw (stickler F16): a lit door beside a
   reader-opened settings group that stays expanded; settling / failed census; a filter miss; an
   unbuilt-placeholder collection — the build renders each and cites the board it extends.
8. The 17 existing CT files the stickler lists in §4 change with their subject; the mobile back-stack gets
   its own pin; the "zero member rows under a collection band in the LIST" pin is red-first.

## 6. Convergence

The build lane captures `pnpm snap` receipts of the same eleven states at the same frames and compares them
to `renders/*.hearth.png` / `*.light.png` until they match in anatomy, spacing and copy ("does it look like the
mockup? no → fix"). The lane's own snap receipts are its proof; the side-eye certification runs in the deferred
verify batch (owner ruling 2026-09-05 15:30Z).
