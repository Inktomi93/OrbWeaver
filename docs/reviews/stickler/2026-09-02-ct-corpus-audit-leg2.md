---
kind: review
status: active
updated: 2026-09-02
---

# CT corpus audit — leg 2 (helper-hoisted assert triage + ex-fenced + HI remainder)

Lane `cb-ct-audit`, #1229. Continues
[the leg-1 report](2026-09-02-ct-corpus-audit-leg1.md) (Phase A over all 469 `.ct.tsx` + 24 full-reads).
Leg-2 charge: full-read the un-triaged helper-hoisted-assert population (leg-1 Appendix B minus the ~70
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
| Leg 1 | 24 | ~26,100 | F1 (#1240) · F2 (#1241) · F3 (#1242) |
| Leg 2 so far | 45 | ~19,540 | none yet |
| **Total** | **69 / 469** | ~45,640 | ceiling P3 |

Leg-2 files read and judged (chunk 1): `web-weave.ct.tsx`, `slider.ct.tsx`, `toast.ct.tsx`,
`sandbox-frame.ct.tsx`, `params-deck.ct.tsx`, `chat-room-surface.ct.tsx`,
`preset-library-surface.ct.tsx`, `preset-editor-surface.ct.tsx`. Chunk 2:
`character-editor-surface.ct.tsx`, `character-create-actions.ct.tsx`, `preset-structure-tabs.ct.tsx`,
`section-drill-in.ct.tsx`, `lane-run-control.ct.tsx`, `image-edit-body.ct.tsx`. Chunk 3:
`theme-scope.ct.tsx`, `tabs.ct.tsx`, `menu.ct.tsx`, `code-editor.ct.tsx`,
`accessible-name-quality.suite.ct.tsx`, `context-tabs-panel.ct.tsx`. Chunk 4:
`assembly-preview-panel.ct.tsx`, `corpus-content.ct.tsx`, `databank-detail-surface.ct.tsx`,
`workloads-group.ct.tsx`, `injections-manager.ct.tsx`, `payload-view.ct.tsx`. Chunk 5:
`analytics-overview-surface.ct.tsx`, `image-detail-body.ct.tsx`, `message-media-block.ct.tsx`,
`room-overrides-form.ct.tsx`, `form-identity.suite.ct.tsx`, `web-weave-touch.ct.tsx`. Chunk 6
(ex-fenced batch): `appearance-background-section.ct.tsx`, `config-teacher.ct.tsx`,
`config-search-input.ct.tsx`, `config-save-footer.ct.tsx`, `config-list-collection-group.ct.tsx`,
`config-group-placeholder.ct.tsx`, `config-palette-source.ct.tsx`.

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

Full read. The three Appendix-B sites (lines ~91/95/312): `focalHierarchyRatio` reads resolved font
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
polls. Carries the two-sided control the mapper needs (the INTERNAL_SERVER_ERROR arm proves the field
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

## 3d. Per-file verdicts — chunk 4 (6 files, all CLEAN)

### 3d.1 `tests/client/features/chat/components/assembly-preview-panel.ct.tsx` (569 lines) — CLEAN

Segment-geometry one-shots sit behind the suspense-settled totals-line barrier (`useSuspenseQueries`
means the data is committed when the totals render); `filledFraction` is polled where the arm is
conditional. Two-sided coverage: error + retry (with the refetch count polled), zero-rows arm,
fill-vs-headroom BOTH directions (sliver at 0.4% usage, full-rail on no-window and estimated-window
arms), and the estimated-ceiling pin asserts the fabricated denominator appears NOWHERE.

### 3d.2 `tests/client/features/discovery/components/corpus-content.ct.tsx` (586 lines) — CLEAN

The `portraitAlignment === 0` ONESHOT-OK carries the strongest settled-by-construction argument in the
population (single suspense batch via httpBatchLink; the painted portrait proves the batch response
landed, so the recorder has seen everything the mount will ask). The blob-route stub documents the
fallback-mimics-join hazard and answers real bytes; the null-hash member exercises the initials arm as
a positive control; clock frozen; CD3 focal-count pins in every phase; fences labelled as fences.

### 3d.3 `tests/client/features/databank/surfaces/databank-detail-surface.ct.tsx` (494 lines) — CLEAN

The lazy-source-read pin asserts the wire receipt (`includeText: true` fired only on reveal). The
gap/slack pins measure label TEXT via Range (the box-slack false-clean is documented in-file), derive
the ceiling from the grid's own construction rather than a literal, and poll every geometry claim.
The containing-block pin is honestly labelled a FENCE (green pre-fix; the defect proofs are named as
living in the editor CTs).

### 3d.4 `tests/client/features/workloads/lib/workloads-group.ct.tsx` (461 lines) — CLEAN

The flash-ring test measures padding-against-token and margin-negation via polls, pins the no-reflow
half (outer height unchanged), and the inline axis deliberately untouched with the reason stated.
`STREAM_MUTATION_ROUTES` imported from the bus's own fixture module (anti-drift). The populated
fixture exists specifically to kill the reviewed-an-empty-pane blind spot. CD3 accent-fill pins polled.

### 3d.5 `tests/client/features/chat/components/injections-manager.ct.tsx` (335 lines) — CLEAN

Wire pins ride `expect.poll` on the recorder; the macro roundtrip uses the shared
`assertTokenRoundtrip` (both halves: stored template paints literally, typed token reaches the wire
raw). The reserve matrix's one-shot height pair carries the single-settled-frame ONESHOT-OK argument
(two polls would compare two layout passes) plus a liveness floor before the ratio. The #847 clamp pin
uses `measureClamp`'s line-grid oracle with the wrong-oracle hazard documented. Host/non-host arms
both exercised (disabled-with-reason, never omitted).

### 3d.6 `tests/client/features/refinery/components/payload-view.ct.tsx` (320 lines) — CLEAN

The count-up trio drives the LANE, not the component, with the #47 wrong-story lesson recorded
(the old trio passed against a latch no run-pane render could reach). Frames are collected by
MutationObserver (nothing races the 360ms ramp); the FABRICATION-OK markers cover page-scratch
globals only. Valence pins resolve both intent tokens from the live stylesheet through attached
probes; filtered-array assertions so failures name offenders.

## 3e. Per-file verdicts — chunk 5 (6 files, all CLEAN — the core helper-await population is DRAINED)

With this chunk every reachable file of the leg-2 core population (35 files / 69 sites) is judged
except the 3 pre-fold-flagged config files deliberately parked last (§0). Every helper-hoisted
non-retrying assert in the 32 read files is BARRIERED-BY-CONSTRUCTION; zero racing (F2-shaped) sites
found in leg 2.

### 3e.1 `tests/client/features/stats/surfaces/analytics-overview-surface.ct.tsx` (382 lines) — CLEAN

Ex-fenced; read post-fold (the analytics pin lane's content is on this base). The one raw
`setTimeout(400)` is the ECharts first-resize-swallow settle (#263, the known instrument lesson) with
the mechanism cited and a `risingBar > 0` positive control after it; the shared-scale claim uses the
framebuffer (`readCanvasBandInk`/`solidColumns`) with a deliberately loose floor for axis rounding.
In-flight-disabled arm via a parked-promise route hold; CONFLICT arm proves a refusal is not a broken
surface; the unmeasured-figure arm pins em-dashes AND the teaching line. ONESHOT-OK markers carry
static-CSS arguments.

### 3e.2 `tests/client/features/imagery/components/image-detail-body.ct.tsx` (204 lines) — CLEAN

Same #654 reservation shape as the edit body (pre-decode box behind `toBeVisible`, release + poll on
`naturalWidth`, geometry-equality). #623 toast pins count the outlet (`toHaveCount(1)`) in BOTH
directions — refused write shows only the failure, settled write only the success naming the revert
home. ONESHOT-OK input read barriered by the count poll.

### 3e.3 `tests/client/features/chat/components/message-media-block.ct.tsx` (161 lines) — CLEAN

The #618 chat-binding pin proves the open-time chatId pin BEHAVIOURALLY (the write names the seeded
room, with the minted-id-not-literal hazard documented at the seed). Page-scoped-locator traps (the
component IS the root node) documented twice. Degradation arm (placeholder, never a broken img) and
the video-mime arm both exercised.

### 3e.4 `tests/client/features/chat/components/room-overrides-form.ct.tsx` (146 lines) — CLEAN

The F1 SWITCH pin uses the untouched-field tell (`mainPrompt` never edited — the live seed's
fingerprint). The #847 clamp pin notes the exiting-textarea strict-mode trap and targets the
paragraph. The full-row tap-target probe polls `elementFromPoint`; the coarse-floor pin asserts the
resolved token clears WCAG's 44 FIRST so a fine-pointer run cannot read as a pass.

### 3e.5 `tests/client/forms/form-identity.suite.ct.tsx` (138 lines) — CLEAN

The suite pins Chrome's real predicate (four measured probes documented: CDP GenericIssue not console;
bundled chromium emits none; aria-label does not satisfy; fires outside `<form>`), with a planted
negative control and a passing-arm control. Page-wide scope for portal coverage, offender markup in
the failure message.

### 3e.6 `tests/ui/art/web-weave/web-weave-touch.ct.tsx` (104 lines) — CLEAN

Every ring verdict is judged against `ambientCeiling` (max over repeated spans — the 16k–136k idle
range is documented), with the inert-weave instrument control making the verdict falsifiable, the
reduced-motion arm pinning byte-identical pixels AND no extra frame, and the scroll fence keeping
`touch-action` honest. Emulation-landed control first.

## 3f. Per-file verdicts — chunk 6, the ex-fenced batch (7 files, all CLEAN)

All seven are post-fold on this base (the config batch and app-shell/analytics debt legs landed before
main @ `0d07eeb2a`).

### 3f.1 `tests/client/features/app-shell/components/appearance-background-section.ct.tsx` (405 lines) — CLEAN

The strongest ex-fenced file. Its header records the #1207 re-pin history (four combobox-shaped tests
re-pinned STRICTLY STRONGER on the MediaGrid picker — each new claim one the old shape could not make).
The refusal arm derives its idle window from the form's own `DEFAULT_DEBOUNCE_MS` (never a guessed
sleep) and asserts the absolute no-write claim with the gate's shape-change reasoning documented. The
\#1194 jiggle pin runs a commit tally AND a direct-DOM geometry sampler (the tally's blind spot named),
and the DPR arms plant a positive control on the error recorder in the same invocation. The P1 patch
pin asserts the key-minimal set exactly.

### 3f.2 `tests/client/features/config/components/config-teacher.ct.tsx` (370 lines) — CLEAN

Supersedes the retired `config-context-body.ct.tsx` with the retirement stated (surface-flip retires
the CT premise; the say-it-once law re-pinned on the new anatomy). The #926 roster-is-the-viewport pins
barrier on states that exist in both worlds before absence sweeps (the vacuous-pass hazard named); the
display-word pin (#1099 F15) reads both the roster and the drill; both default-vs-modified About arms
planted with the Reset wire receipt.

### 3f.3 `tests/client/features/config/components/config-search-input.ct.tsx` (234 lines) — CLEAN

The one-changed-setting fixture pins leaf-grain `@modified` (the section-grain false-positive class,
\#1099 F16) with the same-file same-derivation reasoning for why the band/shelf pins live here. Moved/
absorbed-leaf jump receipts; `when`-parity negative for admin rows.

### 3f.4 `tests/client/features/config/components/config-save-footer.ct.tsx` (202 lines) — CLEAN

`bumpScanDepth` scoping supersedes a workaround with the drift mechanism recorded (the disabled-stepper
hang). Error/BLOCKED/SAVED arms all driven through the production composition; the geometry and
type-step receipts RETRY with the still-settling reason stated; locate-don't-retry (D41) pinned in both
directions.

### 3f.5 `tests/client/features/config/components/config-list-collection-group.ct.tsx` (113 lines) — CLEAN

An extracted module's own coverage decision, with the deliberate non-restatement of sibling coverage
documented (coverage theatre named). Reserved-gutter pins measure deltas between real siblings via
polls; visibility-hidden-not-display-none pinned directly.

### 3f.6 `tests/client/features/config/components/config-group-placeholder.ct.tsx` (101 lines) — CLEAN

Scaffolded intent EARNS a live subject rather than being deleted (the unwired-≠-worthless doctrine,
applied); words-never-colour-alone with the colour delta as the second channel; the one-marker census
proves the classification.

### 3f.7 `tests/client/features/config/lib/config-palette-source.ct.tsx` (57 lines) — CLEAN

Asserts at the store action via the nav probe with the rendered-echo-would-assert-the-harness reasoning
stated; `when`-parity rides into the palette.

## 3g. Per-file verdicts — chunk 7, HI-band remainder part 1 (6 files, all CLEAN)

Chunk 7 (HI-band remainder, score order): `appearance-looks-section.ct.tsx` (353),
`refinery-content-surface.ct.tsx` (741), `color-field.ct.tsx` (247), `number-field.ct.tsx` (330),
`plugin-surface-renderer.ct.tsx` (658), `use-slash-commands.ct.tsx` (250). All six full-read, all
CLEAN — one-line receipts (usage-window stop cut the long form; the judgment was completed for each):

- **appearance-looks-section**: every one-shot count carries a settled-barrier ONESHOT-OK argument
  (the still-open-confirm impossibility at `:268` is the model); the #1100 CLS pin holds a parked
  second read with a measured-reservation attribute and a two-genuine-reads control; #920 plants are
  contract-driven with a positive control on the slot-set equality.
- **refinery-content-surface**: pane-cannot-paint-until-resolved barriers for every wire one-shot;
  INPUT-AWARE responders with the unfalsifiability reasoning in the header; typed recording list to
  avoid double-casts; held-pending skeleton arm; server-gate honesty (tier-collapse refusal stated).
- **color-field**: real-keyboard `:focus-visible` probe with the modality-heuristic control; inked
  box-shadow-layer counting with the transparent-slot trap named; clamp both directions;
  unset-is-not-invalid and seed-not-black arms with commits-nothing riders.
- **number-field**: read-only force-click proves the HANDLER, not the aria hint; description
  composition asserted exactly; the one-name-owner group regression guard; inline-size arm resolves
  pointer-conditional tokens live.
- **plugin-surface-renderer**: stateful state reads make every barrier a post-invoke repaint;
  owner-scope image gate with an owned-arm positive control; region-scoped glyph absence (page-wide
  false-negative reasoning); fences vs defect proofs labelled.
- **use-slash-commands**: all zero-post ONESHOT-OKs ride the same-submit single-arm exclusivity with
  the fired/refused testid as the barrier; caret-sacred arrow test reads selection before/after;
  zero-registrant baseline both directions.

## 4. Verified clean so far (leg-2 methods)

- Full-read of all 45 files above, whole files, no sampling.
- Fresh merged-tree Phase A scan (469/469 files, scannedFileCount cross-checked against `git ls-files`).
- Helper-hoisted site classification against the scan's site list; every site in the 39 files accounted
  for above.

## 5. Remaining leg-2 queue (state at this commit)

**LEG 2 STOPPED HERE (usage-window stop, coordinator order 2026-09-02).** What remains for a leg 3,
exactly:

- HI-band remainder part 2 (13 files, score order): character-library-surface (1952, 11.5),
  notification-bell (407, 10.4), composer (1427, 10.3), composer-guided-cluster (514, 9.5),
  chat-list-surface (1556, 9.4), virtual-list (432, 9.1), textarea (113, 9.1), tool-card (199, 8.9),
  credential-key-row (98, 8.7), design-audit-walker (1028, 8.3), home-surface (1731, 8.2),
  refinery-list-surface (327, 8.1), input (256, 11.7).
- Pre-fold-flagged (parked by design, dead-text risk — `config-welcome.ct.tsx` is DELETED and
  `config-content-surface.ct.tsx` extracted 908→394 in the fold-ready collections batch):
  config-welcome (755), config-content-surface (908), config-list-surface (1240). Audit these ONLY
  after the collections batch folds, on the post-fold text.
- Then the MID band (74 files) / LO band (334) as future legs if the campaign continues.
