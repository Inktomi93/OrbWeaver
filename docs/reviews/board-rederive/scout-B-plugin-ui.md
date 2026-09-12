---
kind: review
status: draft
updated: 2026-08-29
---

# Scout B — plugin/UI board re-derivation (main @ e4d017fd8)

## #796 — Plugins pane mobile/a11y polish

`packages/client/src/features/plugin/surfaces/plugins-settings-surface.tsx:1-95` — the rework/reorder
(attention-first `needsAttention` sort, owner rework dated 2026-08-29 in the file's own header comment)
is on main. Latest commit touching the area: `613e96de8 fix(plugin): polish reconsent callout — leading
accent rule, reading measure, grant-row cursor`. Rung: declared+exported+called (rendered surface, live
route). Did NOT independently re-run Lighthouse/hierarchy scoring — took the note's claim at face value
for the base rework; the residual mobile/a11y items in #796 have no further commits after 613e96de8
touching this file, so whatever's left is genuinely open, not evidenced as done.
VERDICT: 🔧 PARTIAL — base rework DONE-ON-MAIN, residual polish items unverified/likely still open.
CLOSE: keep (as the polish-residual row) or narrow scope — don't close outright.

## #797 — design-audit tap-target: viewport-edge phantom P1s + htmlFor-blind

`tooling/src/ui-audit/ops/walker/census-interactive.ts`:

- `ownsPoint` (line 207-215) hard-cuts `x<0 || y<0 || x>=innerWidth || y>=innerHeight` with no edge
  tolerance — a control whose probe ring crosses the viewport boundary loses those probe points and can
  under-measure `effectiveHalfExtent`, producing a false P1. `inVisualViewport`/reveal-sweep (#653,
  commit `4d4dc4a77`) fixed the OFF-screen-entirely case, not the edge-straddling case.
- Grep across all of `tooling/src/ui-audit` (2 files, ast-grep unavailable per env — see note) for
  `htmlFor`/`label[for` returns **zero matches**. `ancestorCreditAllowed` (census-interactive.ts:184-186)
  only credits `pseudoCarriesFloor` or `isVisuallyHidden` — no path resolves a `<label htmlFor>` →
  associated control to credit the label's larger clickable area. `checkAccessibleName`
  (checks-a11y.ts:117-135) also never reads label-for text.
- No commit in `git log --all --grep="797\|viewport-edge\|edge phantom"` touches this. Last edits to
  the two files are `#662/#665` (ancestor-credit scoping) and `#653/#652` (below-fold census) — neither
  is the label-for or edge case.
  VERDICT: ⛔ NOT-STARTED — both sub-bugs (edge phantom, htmlFor-blindness) reproducible in current source.
  CLOSE: keep.

## #799 — plugin visual-vocabulary gaps

`packages/contracts/src/plugin/ui.ts:608-712` — the `pluginSurfaceNodeSchema` discriminated union has
exactly 20 kinds: stack, row, section, text, badge, meter, keyValue, list, image, markdown, textField,
numberField, toggle, select, slider, button, confirmButton, grid, masterDetail, searchBar. None of
`loading`, `measure`, `icon`, `tabs`, `emptystate` exist as a kind (grep + read, 0/20 match). Button
variants (`PLUGIN_BUTTON_VARIANTS`, ui.ts:80) = `["neutral","outline"]` — no `"primary"`.
`packages/ui/src/content/sandbox-frame/use-sandbox-theme.ts:17-22` exposes exactly 2 color tokens
(`--sandbox-bg`, `--sandbox-fg`) + one font-family list — no border/accent/spacing/radius tokens.
VERDICT: ⛔ NOT-STARTED — all named gaps confirmed absent by direct read of the closed union + the hook.
CLOSE: keep.

## #800 — content policy: SFW toggle + botbooru (owner-ruled, in-flight)

`git grep -n "SFW\|sfw\|botbooru"` on main: only unrelated hits in
`packages/server/src/domain/preset/contract/packaged.ts` (the SFW/NSFW **prompt text** for generation
rating, pre-existing, unrelated to a hub filter toggle) and a `discovery/verbs/catalog.ts` comment about
tag case-folding. Zero hub-filter-toggle or botbooru code on main.
Branch `1be90fa94` (12 commits ahead of main) also has zero SFW/botbooru commits in its log — the
work named in the brief is presumably still uncommitted in the live forge worktree, not yet even on the
branch tip. Did not enter `.claude/worktrees/**` per instruction (live lane).
VERDICT: 🌿 DONE-ON-BRANCH-ONLY is too generous — more precisely NOT YET ON THE NAMED BRANCH EITHER;
work is uncommitted/in-progress in the live lane. Owner-ruled, expected in-flight.
CLOSE: owner (merge-pending — do not close, do not act, just track).

## #791 — plugin command typed-arg grammar + autocomplete

Direct closing commit: `c0bad4bbb feat(plugin): typed-arg grammar + autocomplete for plugin commands
(#791)` — contract (`PluginCommandArgSpec`, `coercePluginCommandArgs`, `pluginCommandArgsSchema` in
`@orb/contracts/plugin/ui`), server membrane re-validation, client palette modal
(`plugin-command-args-modal.tsx`) + composer arg-hint strip (`composer-slash-strip.tsx:38` — "usage"
label when a command declares an argument grammar) + `plugin-command-dispatch.ts` (named/positional/quoted
arg parsing, autocomplete offers). Followed by `202f37f5d fix(test): carry #791 args:[] projection into
seed listCommands fixture` and `e5f70f407` (green-drive). Rung: declared+exported+imported+called+tested.
VERDICT: ✅ DONE-ON-MAIN (c0bad4bbb + follow-ups).
CLOSE: close.

## #792 — URL-install client surface

`packages/client/src/features/plugin/components/plugin-install-card.tsx:96-164` — `UrlInstallArm`
component, rendered directly beside the `FileDropzone` (line 251 dropzone, line 283
`<UrlInstallArm .../>`, separated by a `<Separator />`), wired to `usePreviewPluginFromUrl` →
`onPreviewed` → shared confirm/grant step → `useInstallPluginFromUrl`. This is the full
previewFromUrl → consent → installFromUrl flow named in the row, live in the actual install card.
Rung: declared+exported+imported+called (rendered, wired to real mutations).
VERDICT: ✅ DONE-ON-MAIN.
CLOSE: close.

## Coverage note

ast-grep availability was not explicitly re-probed this session (prior scans in this repo have it
working); searches here relied on `git log`/`grep`/`Read` plus targeted `git log --grep`. All negative
claims (#797, #799, #800) rest on full reads of the specific small files in play (each well under 400
lines) plus repo-wide literal grep — not a bulk ast-grep sweep. Did not explore
`.claude/worktrees/**` (live lane, out of scope per instructions).
