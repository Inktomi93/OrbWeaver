---
kind: review
status: active
updated: 2026-09-02
---

# CT corpus audit — leg 2 (helper-hoisted assert triage + ex-fenced + HI remainder)

Lane `cb-ct-audit`, #1229. Continues
[the leg-1 report](2026-09-02-ct-corpus-audit-leg1.md) (Phase A over all 469 `.ct.tsx` + 24 full-reads).
Leg-2 charge: full-read the un-triaged helper-hoisted-assert population (leg-1 Appendix B minus the \~70
sites already verified inside the leg-1 shard), judging every helper-hoisted non-retrying assert as
barriered-by-construction vs racing (leg-1 F2 is the model defect), plus the full
honesty/premise/coverage/harness rubric per file; fold in the 11 formerly-fenced files and the HI-band
remainder as budget allows.

**This report is committed INCREMENTALLY** (coordinator hedge, 2026-09-02): each chunk of full-reads
lands as its own commit so an interruption costs one chunk, not the leg. The coverage tally in §1 is
current as of the newest commit.

## 0. Base read + population

- Worktree: `.claude/worktrees/agent-ad97119ee5dd2503b`, branch = leg-1 branch merged with **main @
  `0d07eeb2a`** (merge commit `1f193edbe`, hooks off; catalog regenerated green — 786 documents, 0
  pending; `git status --short` clean at merge time).
- Fresh Phase A scan on the merged tree (`cb-ctaudit-scan2.ndjson`, 469 files scanned = 469 tracked via
  `git ls-files` cross-check). Delta vs the leg-1 base: fabrication double-casts 38→35 (fenced-lane fixes
  landed), oneshot markers 307→308, helper-hoisted awaits 149 sites/49 files → **147 sites/48 files**,
  literal `reports/` writes still 1 (= leg-1 F1, `rules-section.ct.tsx:1088`, **still live on this base**
  — fix queued on `cb-conform-pins` per the board, #1240).
- Leg-2 core population (helper-await files minus the leg-1 shard): **35 files / 69 sites / 18,286
  lines**, plus 7 additional ex-fenced files, plus the HI-band remainder.
- **Pre-fold caveat:** the collections batch (fold-ready worktree `agent-a0f39b92c4b84361e`, commits
  `61cd73e1f` + `2cb665e6d`) is NOT on this base. It deletes `config-welcome.ct.tsx` outright and
  extracts `config-content-surface` (908 → 394 lines). Auditing those files at this base is auditing
  dead text; they are deprioritized to the final chunk and flagged as pre-fold where read.

## 1. Running coverage

| Leg | Full-read files | Lines | Findings |
| - | - | - | - |
| Leg 1 | 24 | \~26,100 | F1 (#1240) · F2 (#1241) · F3 (#1242) |
| Leg 2 so far | 20 | \~11,670 | none yet |
| **Total** | **44 / 469** | \~37,770 | ceiling P3 |

Leg-2 files read and judged (chunk 1): `web-weave.ct.tsx`, `slider.ct.tsx`, `toast.ct.tsx`,
`sandbox-frame.ct.tsx`, `params-deck.ct.tsx`, `chat-room-surface.ct.tsx`,
`preset-library-surface.ct.tsx`, `preset-editor-surface.ct.tsx`. Chunk 2:
`character-editor-surface.ct.tsx`, `character-create-actions.ct.tsx`, `preset-structure-tabs.ct.tsx`,
`section-drill-in.ct.tsx`, `lane-run-control.ct.tsx`, `image-edit-body.ct.tsx`. Chunk 3:
`theme-scope.ct.tsx`, `tabs.ct.tsx`, `menu.ct.tsx`, `code-editor.ct.tsx`,
`accessible-name-quality.suite.ct.tsx`, `context-tabs-panel.ct.tsx`.

## 2. Findings

None confirmed in leg-2 chunk 1. (Leg-1 findings F1–F3 remain the campaign's only confirmed defects;
F1's literal `reports/snaps/` write is still live at `tests/client/features/automation/components/rules-section.ct.tsx:1088`
on this base.)

## 3. Per-file verdicts — chunk 1 (8 files, all CLEAN)

Rubric per file: (a) every helper-hoisted non-retrying assert classified barriered-by-construction vs
racing; (b) honesty (premise still true of the tree, no decorative pins, no fabrication reaching the
assert); (c) coverage (the branch the test names is the branch it exercises); (d) harness discipline
(settled barriers, portal-aware locators, no shared-render-tree reads).

### 3.1 `tests/ui/art/web-weave/web-weave.ct.tsx` (429 lines) — CLEAN

The instrument controls both directions of every timing window it reads. The helper-hoisted sites are
premise guards (asserting the fixture produced motion at all before judging its shape) and post-window
absence reads taken after the animation window the test itself owns has closed. No site reads a live
value that a later frame could change out from under the assert.

### 3.2 `tests/ui/primitives/slider/slider.ct.tsx` (397 lines) — CLEAN

The flagged helper reads (`backgroundAlpha` and friends) are computed-style reads of STATIC post-barrier
state — the style is a function of props/variant, not of an in-flight transition, and each read follows
a `toBeVisible`/attribute barrier on the same element. Non-retrying by shape, settled by construction.

### 3.3 `tests/ui/primitives/toast/toast.ct.tsx` (465 lines) — CLEAN

Settle discipline is `getAnimations()`-based (await all animations finished) before any one-shot read.
The one unpolled outline read is justified in-file with a mechanism pin: the property under test is
excluded from `transition-property`, so there is no window in which it could still be moving — the file
pins that exclusion too, making the justification self-enforcing.

### 3.4 `tests/ui/content/sandbox-frame/sandbox-frame.ct.tsx` (626 lines) — CLEAN

CSP/sandbox measurement suite. Every negative (blocked script, refused navigation) carries a planted
positive control and asserts on Chromium's own refusal line, and the helper-hoisted reads sit behind
happens-after `settleNavigation` barriers. The strongest file of the chunk for
negative-evidence hygiene.

### 3.5 `tests/client/features/preset/components/params-deck.ct.tsx` (989 lines) — CLEAN

`savePoll()` is a hoisted FUNCTION returning a fresh `expect.poll` per call (not a shared const — the
lesson leg 1 recorded from the F2 shape does not bite here). The `partColor` reads are static
token-resolution reads post-barrier. Wire-payload pins go through `expect.poll` on the recorder.

### 3.6 `tests/client/features/chat/surfaces/chat-room-surface.ct.tsx` (953 lines) — CLEAN

The busDriven anti-storm pin brackets its zero-read in a disabled→enabled settle pair: the count is read
only after the surface has re-rendered through the enabled arm, which is a browser-side happens-after
for the request the pin says must NOT have fired. Model shape for a justified zero-read.

### 3.7 `tests/client/features/preset/surfaces/preset-library-surface.ct.tsx` (1,050 lines) — CLEAN

Full read. The three Appendix-B sites (lines \~91/95/312): `focalHierarchyRatio` reads resolved font
sizes (static, cascade-determined) and the rest-vs-hover `boxes()` geometry comparison follows hover +
`toBeVisible` barriers with the hover-identity assert inside the helper. Clock is frozen via
`page.clock.setFixedTime(FROZEN_NOW)` for the relative-time subtitle pins. The three `ONESHOT-OK`
zero-reads (`:371`, `:1017`, `:1033`) all ride the same-click single-arm-handler argument: the recorded
sibling request from the SAME click proves the batch already landed, so the zero is settled, not racing.
Keyboard-walk pin (#481 P1-1) deliberately asserts the WHOLE write log after one commit rather than a
mid-walk zero — the settle-safe form, called out as such in-file. Menu-absence pins assert with the menu
OPEN (`Duplicate` visible first). No stale premises found against the merged tree.

### 3.8 `tests/client/features/preset/surfaces/preset-editor-surface.ct.tsx` (1,946 lines) — CLEAN

Full read; the file is the corpus's densest negative-assertion surface and every zero-read is windowed:

- Lines 460 / 731 / 958: `trpc.count(...)` one-shots, each behind an explicit browser-side real-timer
  wait (700/500/900ms) that IS the negative window (debounce + round-trip priced in), each carrying an
  `ONESHOT-OK` mechanism note. Barriered-by-construction.
- Line 410 (SWITCH pin) and 543–546 (FORK-ONCE): one-shot log filters after a 300/900ms wait that
  follows an `expect.poll` proving the positive arm landed first. Sound.
- Line 796: `updatesAgainst(trpc, FORK_ONE).length === 0` microseconds after the mint poll — justified
  by the single-confirm-handler arm-exclusivity argument (the poll at 790 records the OTHER arm of the
  same click; one handler picks one arm), and the test then barriers on the `selected=FORK_TWO` render.
  Not the F2 shape.
- The `holdCapability` PENDING pins own their in-flight window via `page.route` delay — the negative
  (`CHAT_MODEL_CLAIM_RE` count 0) runs inside a held-open, deterministic state, not against a flash.
- The #1140 strip-fade matrix: barrier is the RENDERED fade state (`data-fade-*` attributes polled),
  never `scrollLeft`; the cell re-reads the state after decoding and THROWS on mid-sample movement;
  polarity is proven from the framebuffer; `bandedCells > 0` kills a vacuous sweep; and the
  dimmest-in-band < dimmest-clear fence stops a paint-no-fade "fix" from passing. Instrument-grade.
- Fabrication surface: fixtures are typed (`PresetDetailFixture`), input casts are narrowing reads of
  recorder payloads (`input as { id?: string }`), not double-casts reaching an assert.

## 3b. Per-file verdicts — chunk 2 (6 files, all CLEAN)

### 3b.1 `tests/client/features/character/surfaces/character-editor-surface.ct.tsx` (1,086 lines) — CLEAN

Full read. The subtlest site in the file is the §6.2 tag-detach pin (`:365`–`:391`): a one-shot
`expect(cardUpdated).toBe(false)` after a fast poll on the junction write — superficially the F2 shape.
Judged BARRIERED, by two independent mechanisms: (a) the preceding
`expect(getByText("Saved")).toBeVisible()` barrier rides the post-#81 status seam, which flips to
"Saving…" the INSTANT any card-form field dirties (the transcript pin at `:270` proves that), so under a
tags-re-enter-the-form regression "Saved" only re-appears after the write lands and the flag is true;
(b) a direct-mutate regression from the same click rides the same batch tick as the recorded
`bulkRemoveCardTag` (the same-click ordering argument). Elsewhere: the F2 portrait-geometry pin re-polls
the trigger box on every assert; the P2-5 row-fill fences poll `readFillAtAssertion()`; the #1132
paint-pair reads are variant-stamped computed styles behind attach barriers; DRAFT-TRUST arms
discriminate on the `img` element allowlist with the untrusted arm's text-still-renders control; the
transcript pattern is the same closed-window form the preset editor wears. No stale premise found.

### 3b.2 `tests/client/features/character/components/character-create-actions.ct.tsx` (183 lines) — CLEAN

`attemptCreate` settles on the Create button re-enabling (`isPending` drop) — the resting-dialog
barrier every subsequent read sits behind. `hitExtent` one-shots follow visibility + coarse-pointer
polls. Carries the two-sided control the mapper needs (the INTERNAL\_SERVER\_ERROR arm proves the field
line does NOT render for unfixable faults). Copy spelled literally with the red-first receipt reasoning
documented in-file.

### 3b.3 `tests/client/features/preset/components/preset-structure-tabs.ct.tsx` (62 lines) — CLEAN

`overflows()` one-shots are static layout reads behind visible + `toContainText` barriers; both ends of
the width range asserted; the moved teaching copy pinned on the hint.

### 3b.4 `tests/client/features/preset/components/prompt-assembly/section-drill-in.ct.tsx` (517 lines) — CLEAN

The item-10 baseline/geometry one-shots (`boxOf`/`labelBox`/`controlBoxOf`) read static post-drill
layout (boundingBox auto-waits visibility; no async content in the drill-in); the O-14 ghost-fit claims
are `expect.poll`. The fork-eject pin (§5.2) exercises the real keyed-remount seam and asserts the
editor is STILL open post-retarget. The zone-arm column-stability test deliberately reads
before/after. `trackColor()` one-shots follow `toBeChecked` barriers and resolve the token via a live
swatch, not a literal. Structural-omission pins (marker menu, pivot, carrier) assert with the
menu/drill OPEN.

### 3b.5 `tests/client/features/refinery/components/lane-run-control.ct.tsx` (180 lines) — CLEAN

`hairlineGeometry`/`hairlineAfterContent` throw loudly on a missing host (never a silent zero), carry
the segment-exists positive control before the containment negatives, and read animation-invariant used
values (the travel animates position, not the 33% width). Geometry one-shots ride boundingBox
auto-wait; the type-step comparison resolves `--text-micro` live rather than a hardcoded px.

### 3b.6 `tests/client/features/imagery/components/image-edit-body.ct.tsx` (216 lines) — CLEAN

The #654 reservation pins are the strongest shape: pre-decode box read behind `toBeVisible`, then
`release()` + poll on `naturalWidth`, then geometry-equality with the reserved box (a would-reflow tree
reds because the forced layout read reflects the decoded intrinsic size). The `ONESHOT-OK` at `:168`
is barriered by the preceding count poll. #702 negatives (`toBeHidden` on the wrong-toast and the
absent hand-off) run behind the retrying `toContainText` settle on the partial-success toast.

## 3c. Per-file verdicts — chunk 3 (6 files, all CLEAN)

### 3c.1 `tests/ui/content/theme-scope/theme-scope.ct.tsx` (654 lines) — CLEAN

The contrast kernels (`renderedContrast`, `paintedRingVsBase`, `arcPartVsCard`, `tokenPairContrast`)
are instrument-grade: each documents the alpha-compositing correction (a translucent token measured
over transparent black would fake a ratio — the kernel paints card-then-part), throws loudly on a
missing property (never a clean zero), and the #685/#692 rows carry the fill-outshouts-track invariant
fence in both directions. The one-shot evaluates read STATIC token-resolution state settled at mount.
Hostile-value clamp asserted on the inline style (not computed, which would hide the drop behind the
:root default — the distinction is stated in-file). Both polarities exercised throughout.

### 3c.2 `tests/ui/primitives/tabs/tabs.ct.tsx` (358 lines) — CLEAN

The #1069 FLIP-glide pin: settle-poll to identity landing (never mid-flight), the launch-property
tally as its own positive control ("silence would pass every assertion below on a bar that just
teleports"), asymmetric labels so the scale half is exercised. Stacked-layout geometry one-shots read
static post-mount boxes; gap/height fences resolve tokens via live probes, never hardcoded px. The
`:visible` panel selector is used only at rest (the file's own comment bans it mid-swap).

### 3c.3 `tests/ui/primitives/menu/menu.ct.tsx` (453 lines) — CLEAN

Keyboard flows gate on `toBeFocused` before pressing (the Wave-1 Select race, cited in-file, both in
the top-level and submenu tests). The label-column pin refreshes its array THROUGH the poll before the
one-shot asserts. The long-menu clamp pin: poll-until-non-null box, scroll-to-bottom + `toBeInViewport`
retry, scroll-cue `background-attachment` fence behind a clamp-precondition poll. Highlight-indicator
reads are class-driven static computed styles behind `data-highlighted` barriers, with the ring colour
resolved from a live probe.

### 3c.4 `tests/ui/code-editor/code-editor.ct.tsx` (295 lines) — CLEAN

The CM6 completion test's `waitForTimeout` is the one sanctioned sleep in the leg-2 population so far,
and it is the model of a justified one: the flake was instrumented (measured cohort split on the 100ms
poll grid vs CM6's 75ms `interactionDelay`), the sleep-free alternative was tried and its failure
mechanism documented (validFor refilters synchronously), and the biome-ignore carries the inverted
premise with receipts (4/20 red without, 0/40 with). Real-clipboard paste is proven in BOTH directions
(blocked + the positive-control accept). Focus ring driven by a real Tab with a `:focus-visible` count
poll as the barrier.

### 3c.5 `tests/client/a11y/accessible-name-quality.suite.ct.tsx` (206 lines) — CLEAN

All four predicates carry planted positive controls (the parser-went-silent hazard is named and
fenced), the duplicate predicate's scope-awareness has its own negative control, and every surface
barriers on a settled named control before the page-wide sweep (the vacuous-pass hazard stated
in-file). The one fixed-id suppression is load-bearing and justified.

### 3c.6 `tests/client/features/app-shell/components/context-tabs-panel.ct.tsx` (418 lines) — CLEAN

`bottomOf` one-shots follow visibility barriers; the settled-panel selector is
`:visible:not([inert])` with the cross-fade flake history cited (#875/#878 legs); the coarse-pointer
block proves the emulation landed before trusting anything; the RV-7 lock pin asserts the dim moved
OFF the cell root (the #874 correction) and defers the pixel half to `context-bracket.ct.tsx` by name.
Red-first and fence tests are labelled as which they are.

## 4. Verified clean so far (leg-2 methods)

- Full-read of all 20 files above, whole files, no sampling.
- Fresh merged-tree Phase A scan (469/469 files, scannedFileCount cross-checked against `git ls-files`).
- Helper-hoisted site classification against the scan's site list; every site in the 20 files accounted
  for above.

## 5. Remaining leg-2 queue (state at this commit)

Core helper-await files still to read (\~15): workloads-group (461), assembly-preview-panel (569),
corpus-content (586), databank-detail-surface (494), analytics-overview-surface (382, ex-fenced),
injections-manager (335), payload-view (320), image-detail-body (204), message-media-block (161),
room-overrides-form (146), form-identity.suite (138), web-weave-touch (104).
Ex-fenced batch:
appearance-background-section (405), config-teacher (370), config-search-input (234), config-save-footer
(202), config-list-collection-group (113), config-group-placeholder (101), config-palette-source (57).
Pre-fold-flagged (last, dead-text risk): config-welcome (755), config-content-surface (908),
config-list-surface (1240). Then the HI-band remainder if budget allows.
