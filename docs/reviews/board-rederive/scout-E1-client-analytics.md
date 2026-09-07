---
kind: review
status: draft
updated: 2026-08-29
---

# Board re-derivation — E1 client/analytics rows (main @ e4d017fd8)

Read-only recon. No code/board mutated.

## #159 — consolidate Analytics + tag management into Corpus (design research)
- Issue body confirms it is unbuilt design research, `needs-owner` label present, state OPEN.
- No `docs/proposed/` corpus-consolidation doc found (`docs/proposed` directory does not exist on
  this tree — `ls docs/proposed` → "No such file or directory"). Searched all `*analytics*`/
  `*corpus*` paths repo-wide: only `reports/**` artifacts (snaps/traces from side-eye passes), no
  design proposal doc.
- Rung: path/name only — no design doc, no consolidation code.
- **Verdict: 🕓 OWNER-GATED — unchanged.** Recommendation: keep.

## #160 — analytics/memory artifact rows dead on click
- Companion to #159, references "design-issue #<design-issue>" (i.e. #159) as the WHERE.
- Did not locate the specific analytics/memory artifact-row component in this pass (would need a
  deeper client-tree search of the analytics/discovery feature dirs); did not have time to run a
  targeted `ast-grep` sweep for `ListRow` instances without `onClick` in those surfaces. Treating
  the premise as **unrefuted** rather than reverified — no evidence found that it was fixed (no
  commit touching analytics artifact click-handling; `git log --all --grep="artifact.*click\|dead.*click"`
  returned nothing relevant).
- Rung: unverified this pass (owed a follow-up sweep, not a clean confirm).
- **Verdict: 🕓 OWNER-GATED, premise likely still valid but not independently re-proven this pass.**
  Recommendation: keep; flag for a scout follow-up with `ast-grep` over the analytics list-row
  components before next close/keep decision.

## #227 — mobile You-sheet buries notifications inbox at the foot
- Read `packages/client/src/features/app-shell/components/you-sheet.tsx` in full (126 lines).
- Render order: account/settings row group (footerEntries, few items) → `overflowChrome.map(...)`
  at line 83-85 (**this is the notifications-inbox widget**, per its own comment at line 55-58:
  "the notifications inbox" lands in `sheetOverflowChrome(entries)`) → THEN the "More" heading +
  `overflowSections` (line 87-112, the ~50-item bulk of section rows) → the dead-band tap-guard.
- So on current main, the notifications inbox renders **before** the "More" bulk section list, not
  after it — the opposite of "buried at the foot of ~50 controls."
- `git log` on the file shows commit `8a8b90b1a fix(shell): the current section always holds a
  mobile bar slot (#484)` and others touching this file since; the ordering looks like it may have
  already been addressed by a later shell-chrome pass, OR the issue's "foot" language refers to
  physical scroll position when footerEntries/other widgets are numerous (not verified further).
- Rung: declared+read, contradicts issue's literal premise as currently worded.
- **Verdict: ⚠️ STALE-PREMISE.** The code today does NOT place notifications after ~50 controls —
  it renders in the second slot, ahead of the bulk "More" list. Recommend: re-verify with a live
  mobile snap before closing (this is a text-only read, not a rendered receipt), but the ordering
  in source contradicts the issue as written. Recommendation: **flag for owner/close** pending a
  quick rendered snap — do not blindly close on source-read alone, but do not leave it queued as
  "same as filed" either.

## #306 — mobile analytics lands on LIST vs CONTENT (opt-out arm)
- `packages/client/src/state/panel-resolve.ts:48-57` still carries the verbatim 2026-08-03 ruling
  header: "THE MOBILE ONE-SHELL RULE... all SEVEN of them (chats · characters · corpus · config ·
  databank · presets · analytics) landed on the welcome with the list ... CONTENT (the
  corpus/analytics dashboards), so the control is never dead in this arm either."
- No per-section opt-out (`SectionDefinition` flag / `useSectionListIsScreen` exception) found for
  analytics — the header still describes all seven landing uniformly, no analytics-specific carve
  out is mentioned or present in the file.
- Rung: declared, read in context — matches the wake condition exactly (owner has not picked an
  arm; code is unchanged since the ruling).
- **Verdict: 🕓 OWNER-GATED — unchanged, wake unmet.** Recommendation: keep.

## #336 — image + video attachment quality control
- Read `packages/server/src/infra/providers/backends/kit/history.ts` in full (39 lines).
  `chatHistoryOpenAiContent` pushes `image_url: { url: part.url }` and
  `video_url: { url: part.url }` bare — no `detail` field, matching the issue's own cited
  `history.ts:39` line exactly.
- No `sharp` resize-for-quality-knob or `ffmpeg` video-downscale code found wired to this path in
  this pass (only located the cited backend history file; did not additionally grep the whole repo
  for a `detail:` param or ffmpeg invocation — the issue itself already surveys sharp/ffmpeg
  capability, so a repo grep would be corroborating, not novel).
- Rung: declared/read — code shape matches issue's own receipts, unchanged.
- **Verdict: 🕓 OWNER-GATED — unchanged, wake unmet (design pending).** Recommendation: keep.

## #418 — accname resolver fork unification
- Two distinct in-page accname computations confirmed still separate:
  - `tooling/src/snap/ops/evidence.ts:28` — `root.ariaSnapshot(ariaOpts)`, Playwright's own
    accessible-name computation (the lens `Spine`/issue calls "snap's map op").
  - `tooling/src/ui-audit/lib/checks-a11y.ts` — a separate raw-attribute/DOM-walk a11y checker
    (the "ui-audit's walker" the issue references).
  - `tests/support/browser/accessible-names.ts` is a THIRD, CT-scoped engine (`ariaTreeFindings` /
    `labelInNameFindings`) with its own header explicitly stating "WHY TWO ENGINES" — reinforcing
    that multiple deliberately-separate accname computations are a known, current pattern in this
    repo, not just the two the issue names.
- No unification code found; no merge into `tooling/src/_shared/` located.
- Rung: declared, files read/located — divergence premise holds.
- **Verdict: 🕓 OWNER-GATED — unchanged, wake unmet (no real defect traced to the divergence yet).**
  Recommendation: keep.

## Not covered
- Did not exhaustively `ast-grep` search for a real dead-click defect in analytics/memory rows for
  #160 — recommend a follow-up scout pass scoped to `packages/client/src/features/{analytics,discovery,corpus}/**`
  before either closing or re-confirming that row.
- Did not take a live rendered snap of the You-sheet for #227 — the source-read is a strong signal
  but not a pixel receipt; flagged rather than declared fully resolved.
- Did not search TSX-only client components exhaustively via `ast-grep -l tsx` for #159/#160 (relied
  on `find`/`grep` for the design-doc and dead-click premise checks) — a structural corroboration
  pass would strengthen #160's verdict specifically.
