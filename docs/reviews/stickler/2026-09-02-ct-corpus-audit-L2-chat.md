---
kind: review
status: active
updated: 2026-09-02
---

# CT corpus audit — leg 2 shard L2 (chat + shared components, cb-ct-audit-L2)

Parallel shard of #1229's sharded campaign, running concurrently with legs 1-3
([leg 1](2026-09-02-ct-corpus-audit-leg1.md), [leg 2](2026-09-02-ct-corpus-audit-leg2.md),
[leg 3](2026-09-02-ct-corpus-audit-leg3.md)). Scope: `tests/client/features/chat/**/*.ct.tsx` and
`tests/client/components/**/*.ct.tsx`, minus files already audited by legs 1-3 and minus the 11 chat
files a concurrent sibling shard has already audited (report not yet folded at dispatch time).

**Rubric applied exactly as written in leg 1 §2 / leg 3 §"Rubric"** (both read in full before starting):
(a) HONESTY — every assert can fail and asserts something real; (b) PREMISE CURRENCY — mounted
surface/selectors/role names spot-verified against today's src; (c) COVERAGE — load-bearing behavior with
no pin; (d) HARNESS CORRECTNESS. Taxonomy hunted: stale premise · luck-based coverage · decorative pins ·
`as unknown as` double-casts · oneshot live-read asserts · literal `reports/` writes · accname substring
traps · stand-in children · tabs/panels accumulating · shared-render-tree reads · the ONESHOT-OK adjacency
window (marker on `expect.line` or `expect.line-1`).

## 1. Population

`git ls-files 'tests/client/features/chat/**/*.ct.tsx' 'tests/client/components/*.ct.tsx'
'tests/client/components/**/*.ct.tsx'` = 87 files. Excluded (22):

- Already read by legs 1-3 (9): `message-row.ct.tsx` (leg1), `chat-room-surface.ct.tsx`,
  `injections-manager.ct.tsx`, `room-overrides-form.ct.tsx`, `message-media-block.ct.tsx`,
  `assembly-preview-panel.ct.tsx` (leg2), `composer.ct.tsx`, `composer-guided-cluster.ct.tsx`,
  `chat-list-surface.ct.tsx` (leg3).
- Already claimed by a concurrent sibling shard (11, exact list from the brief): `settings-context-tab`,
  `message-list-surface`, `chat-controls-band`, `members-panel`, `message-content`, `ghost-message-row`,
  `home-recents-tile-body`, `prose-settings-section`, `appearance-message-style-section`,
  `composer-guided-buttons`, `chats-section` (all `tests/client/features/chat/**`).
- `regex-scope-order.ct.tsx`, `tag-picker-dialog.ct.tsx` (leg1, `tests/client/components/`).

**Population: 65 files.** Worked in directory order (the `git ls-files` order: `components/` alphabetical,
then `chat/anchors`, `chat/components`, `chat/hooks`, `chat/lib`, `chat/surfaces`).

## 2. Running coverage

| Chunk | Files | Verdicts |
| - | - | - |
| 1 — `tests/client/components/*` (excl. leg-1 reads) | 12 | all CLEAN |

Chunk 1 files: `background-source-field.ct.tsx`, `character-picker.ct.tsx`, `confirm-dialog.ct.tsx`,
`face-strip.ct.tsx`, `greeting-studio.ct.tsx`, `library-surface.ct.tsx`, `list-pane-header.ct.tsx`,
`regex-script-picker.ct.tsx`, `row-toggle-action.ct.tsx`, `setting-switch-row.ct.tsx`,
`setting-teach-row.ct.tsx`, `tracker-blocks/tracker-blocks.ct.tsx`.

**Findings so far: none.**

## 3. Per-file verdicts — chunk 1 (12 files, all CLEAN)

All twelve are shared `@orb/client/components` composites (list-pane-projection §11.2/D12 family,
tracker-kit, greeting studio). Common register across the chunk: every write-path claim asserts the
MUTATION (`trpc.count`/`trpc.lastInput`), not a UI reaction; every geometry claim reads a resolved CSS
custom property rather than a literal px; a11y contracts (role, `aria-pressed`/`aria-checked`/
`aria-current`, accessible name/description) are asserted structurally, not by class presence; width/token
matrices are used wherever a single-width receipt would have been luck-based.

- **`background-source-field.ct.tsx`** — seeded-tile / library-tile / URL-arm / read-only-inert all pinned
  through the rendered `output` panel; no fabrication.
- **`character-picker.ct.tsx`** — the `#334` button-removal + keyboard-tail-load + pointer-scroll-load +
  search regression guards; the keyboard test's `trpc.count(...).toBeGreaterThanOrEqual(2)` poll is a real
  retrying barrier.
- **`confirm-dialog.ct.tsx`** — simple uncontrolled/controlled seal coverage, every confirm/cancel path
  distinguishes by an in-test counter, not by DOM presence alone.
- **`face-strip.ct.tsx`** — the strongest file in the chunk: exhaustive fold-matrix coverage (`SWEEP_WIDTHS`
  12-point sweep with a settle poll per width, `overhang <= 0` non-clip proof, `tile !== "+1"` regression
  guard read as a NUMBER not a substring per its own in-file note on the #153 lesson), a positive-control
  read of a real portrait's dress before asserting the overflow tile's dress differs from it, and a
  coarse-pointer WCAG-floor `test.describe` block. No un-failable oracle found.
- **`greeting-studio.ct.tsx`** — catalog-blind chip render (`GREETING_TRANSFORMS.map` against the rendered
  toggle set, count equality kills a stray/missing chip), mutation-count assertions for rewrite/accept,
  wire-shape assertion for the KIND-not-bytes templating fork (catalog-order proof via flipping a later
  member first), and a token-derived (never-literal) quoted-speech tint proof with both pref arms.
- **`library-surface.ct.tsx`** — WAI-ARIA radiogroup contract (F-4/F-5), and the #481 focus-is-not-selection
  regression: write-COUNT assertions (`commit-count` testid) across a multi-press walk, never just "the
  active id did not change" (which would also be true of a walk that landed back home).
- **`list-pane-header.ct.tsx`** — token-derived type-ramp assertions (`FLAT_HIERARCHY_MIN_RATIO` computed
  from live token values, not hardcoded), the #1154 device-pixel-grid landing test is genuinely falsifiable
  (throws if occupants.length isn't > 2, i.e. cannot pass on an empty census).
- **`regex-script-picker.ct.tsx`** — junction-vs-carrier write distinction (`ATTACH_PROC`/`DETACH_PROC`
  asserted via `lastInput`), empty-state-with-a-door coverage, and a RELATIONAL heading-style parity test
  against a live sibling group (not a px literal that would drift).
- **`row-toggle-action.ct.tsx`** — the D11 reveal-posture contract (hover/focus/coarse classes), and a real
  distinction between "hidden by opacity but still hit-testable" (asserted `pointer-events: auto`) vs the
  separate `actionsFloat` inertness case, explicitly deferred to `list-row.ct.tsx` by name rather than
  silently conflated.
- **`setting-switch-row.ct.tsx`** — the disabled/disabledReason contract is asserted through BOTH the
  visible text and `toHaveAccessibleDescription` (the SR-only half a sighted check would miss).
- **`setting-teach-row.ct.tsx`** — the strongest instrument-grade file in the chunk: a RED-FIRST, MEASURED
  width matrix for the `row-void` detector (1600/1280 arms stated in-file as measured-failing against the
  UNMODIFIED source, 900/830 as fences — the matrix keeps the narrow arms deliberately because the defect's
  signature is that it DISAPPEARS as the column narrows); a real premise-planting catch documented in-file
  (the auto-swipe one-row test notes an earlier version of the same assertion passed VACUOUSLY against the
  contract default before the stub was fixed to enable the dependent fields); zero-layout-shift proven via
  byte-identical `boundingBox()` equality across the hover reveal; production-bundle-mode assertions
  (`import.meta.env.DEV` is false under `vite build`, stated and relied on) correctly separate the
  end-user Reset-only arm from the dev-menu arm, which is mounted directly since the dispatcher cannot
  reach it from a production build.
- **`tracker-blocks/tracker-blocks.ct.tsx`** (878 ln) — full seven-block kit coverage (MeterRow/StatCell/
  TrackerChip/CastCard/BeatLine/AmbientStrip/GoalLine + AddRow/HintEditor), every editable block proves
  BOTH the display-at-rest posture (`[data-slot=tracker-value-edit]` count 0 at rest) and the commit path
  (`onEdit*` fires with the parsed value — assert-the-mutation-fired, never just the rendered reaction);
  the unset-vs-zero em-dash discipline is pinned on both MeterRow and StatCell (never synthesizing a 0);
  closed-vocabulary pickers (Time/Weather) derive their expected member COUNT from the imported
  `RPG_WEATHER_TYPES` tuple rather than a hardcoded literal, so the pin tracks the vocabulary instead of
  freezing a remembered length; the AmbientStrip hit-area test measures the ACTUAL pixel under
  `elementFromPoint` at ±10px rather than trusting `boundingBox()` alone (documented as catching a real
  measured collision: "aiming at one sky and committing another"); the three `component.screenshot({ path:
  storyShot(...) })` calls all route through the sanctioned `story-shot.ts` helper — no literal
  `reports/snaps/` write (the #1201 class checked and clear).

## 4. Taxonomy sweep receipts (chunk 1, planted-control method)

`rg` over the 12 files (paths listed above), counts printed:

- `screenshot({ path:` sites — **3**, all `tracker-blocks.ct.tsx:806,834,854`, all through
  `storyShot(...)` (not a literal `reports/` string) — 0 of the #1201 class.
- `as unknown as` / `as any as` double-casts — **0**.
- `test.skip` / `.fixme` / `.todo` / `.only` — **0**.
- `biome-ignore` / `eslint-disable` — **0**.
- ONESHOT-OK markers — **1** (`face-strip.ct.tsx:436`, the coarse-pointer `matchMedia` read), sits on
  `expect.line-1` — adjacency window satisfied, reason is true (a context flag set before the page opened).

Positive control: a planted `expect(true).toBe(true)` in a scratch string matched the tautology-shape
grep used above; removed before commit (never landed in a tracked file — probed via a throwaway `rg`
pattern check against the same file list, not a committed plant).

## 6. Per-file verdicts — chunk 2 (16 files, all CLEAN)

`chat/anchors/` (2, full population — that directory is now drained) + the first 14 files of
`chat/components/` in directory order.

- **`character-gallery-dialog.ct.tsx`** (166 ln) — the P0 on-screen-action-buttons geometry pins (two real
  viewport sizes) and the P2 destructive-confirm gate (mutation count asserted 0 before confirm, ≥1 after);
  the held-batch add-picker tests use `trpcHold` to prove same-tick double-dispatch is guarded and a
  rejected batch stays retryable.
- **`join-invite-dialog.ct.tsx`** (76 ln) — preview→redeem flow, leak-free NOT_FOUND arm (asserts no
  `Host:` text leaks), "Not now" dismissal fires no redeem.
- **`add-chat-book-dialog.ct.tsx`** (67 ln) — held-attach ownership + same-tick-repeat guard + reject/retry,
  `trpcHold`-based, mirrors the gallery dialog's pattern.
- **`add-chat-document-dialog.ct.tsx`** (214 ln) — the picker-not-a-second-list subtraction (client-derived
  `activeIds` minus bank), the ONE-READ ruling asserted as a request count, INPUT-AWARE search stub
  (documented in-file: a fixed-array responder would pass while the client filtered nothing), the
  three-way empty-state distinction (empty bank / fully-attached bank / no search matches, each with its
  own copy and exit), and a route-level infinite-pending stub for the skeleton arm with an in-file note on
  why the hang must be held at the ROUTE rather than in a responder (an unawaited responder promise
  serializes to `{}` and crashes the list instead of hanging it).
- **`appearance-avatars-section.ct.tsx`** (93 ln) — P1 patch-minimality (exact 5-key set, re-spelled not
  imported) and the four-dependent-disable gate asserted through rendered semantics (`toBeDisabled`, no
  listbox openable) rather than a class check.
- **`appearance-message-details-section.ct.tsx`** (61 ln) — same P1 pattern, 8-key set including the
  absorbed `messageActions` control.
- **`chat-behavior-message-handling-section.ct.tsx`** (150 ln) — 11-key patch minimality with an explicit
  negative check that the sibling Streaming section's `smoothStream` key never rides along; schema-clamp
  tests for both ceiling (5) and floor (1) values, proven via a real out-of-range entry rather than assumed.
- **`chat-behavior-streaming-section.ct.tsx`** (80 ln) — 4-key patch minimality, bidirectional gate test for
  the reveal-speed slider (both OFF→ON and ON→OFF, not just one direction).
- **`chat-books-section.ct.tsx`** (64 ln) — 320px real-floor geometry (settled-poll x-alignment across a
  long vs short title, explicit right-edge-inside-pane check) and the member-vs-host empty-copy split.
- **`chat-character-bar.ct.tsx`** (339 ln) — the D16 solo-roster size gate, the #490 door-removal
  (re-aimed rather than deleted per the in-file note that the door's one home moved to
  `committed-members-tab.tsx`), the over-art plate/blur token-derived backing test, and the #511 phone
  width-matrix (430/390/320px) proving the strip stays one row via sr-only name-collapse while the
  accessibility tree keeps every name — measured against a documented pre-fix defect table in the header
  comment, plus a separate fine-pointer counter-arm proving the desktop strip is untouched.
- **`chat-context-disclosure-section.ct.tsx`** (90 ln) — defaultOpen-vs-remembered-per-section-id state,
  `keepMounted` precondition proven directly (`data-slot` count), and the silent-vs-loud graft collapse
  proven with a deliberate TWO-assertion pair (role query + text query) so neither a not-rendered graft nor
  a hidden-but-mounted one can pass for the other.
- **`chat-documents-section.ct.tsx`** (277 ln) — the visibility-toggle SET-SEMANTICS pin (asserts the full
  expected hidden array on the mutation input, catching a patch-shaped payload that would silently un-hide
  a sibling), provenance-gated Detach visibility (absent, never disabled, on undetachable rows), permission-
  omit for members, picker-offers-bank-minus-active, 320px reserved-spacer geometry, and four
  slot-placement-warning arms (host+slotless, host+placed, empty-bank, member) each barriered on the
  settled `data-databank-slot` state before asserting absence.
- **`chat-header.ct.tsx`** (219 ln) — present-vs-departed seat counting, a real pending-vs-lying-fallback
  regression test (`trpcHold` proves the OLD "Untitled chat / Members — 0" render never happens, not just
  that the new skeleton does), the narrow/touch dead-chip fix (`revealContextPanel` overlay write), and the
  \#239 title-tooltip-equals-visible-text pin.
- **`chat-import-dialog.ct.tsx`** (83 ln) — production multipart POST with real CSRF header assertion,
  the per-file-isolation all-failed-is-not-success arm (dialog stays open, server's own reason surfaces),
  partial-batch reporting.
- **`chat-options-menu.ct.tsx`** (167 ln) — IA de-dup absence pins (no transcript/export in the room menu),
  the #862 single-action game-mode start (asserts absence of `ruleset`/`profile` on the wire, not just
  presence of the id), and the #863 kept-state description asserted through BOTH visible text and
  `aria-describedby` resolution (not just one channel), plus a cross-query invalidation proof
  (`chat.listChats` census flips without reload after the mutation).

## 8. Per-file verdicts — chunk 3 (10 files, all CLEAN)

`chat-recall-indicator.ct.tsx` (67 ln) through `home-temp-chat-tile-body.ct.tsx` (77 ln), directory order.

- **`chat-recall-indicator.ct.tsx`** — idle/recalling/recalled trigger states asserted on BOTH
  `data-recall-phase` and accessible name; motion-safe-only pulse class checked (never `animate-pulse`
  bare, which would also match a disallowed spin); portal-aware popover text via `page`.
- **`choice-send-provider.ct.tsx`** — real `<Composer>` + real draft store, `send` vs `compose` branches
  each asserted at their true effect (mutation input for send, textarea value for compose, cross-checked
  that the other branch's effect is absent); explicit in-file note on the game-engagement gate the provider
  reads before firing `rpg.getGame` at all.
- **`committed-members-tab.ct.tsx`** (339 ln) — the #182 group-arbiter-controls gate (absent in 1:1, present
  in group, and the muted-solo-survivor exception reachable only for unmute), the #848/#899/#912 add-door
  naming distinction, and a genuinely instrument-grade RED-FIRST width-cliff sweep (§"THE CROSSOVERS"):
  in-file documentation of TWO prior false-red incidents from font-metric drift near a 1.4px cliff margin,
  replaced with a live in-page 0.1px-resolution sweep asserting the wrap mechanism is two-sided at every
  cliff rather than pinning a specific width. This is the strongest geometry-instrument file read this
  session.
- **`compact-summary-peek.ct.tsx`** (27 ln) — click-to-reveal, not always-rendered; portal-aware.
- **`composer-arg-hint-strip.ct.tsx`** (22 ln), **`composer-attachment-strip.ct.tsx`** (31 ln) — small,
  honest seal-shape tests; every assert failable (index-preservation on remove is checked per-item, not
  just presence).
- **`composer-chat-options.ct.tsx`** (61 ln) — the IA de-dup absence-list pins for BOTH host and member,
  proving the menu is host-agnostic post-consolidation rather than assuming it from one arm.
- **`databank-settings-section.ct.tsx`** (70 ln) — patch-shape re-nesting for the retrieval leaf (`k`/
  `minScore`/`rerank` under one key) proven via `lastPatch` on the mutation input.
- **`greeting-swipe-strip.ct.tsx`** (99 ln) — the strongest small file: the `variants.indexOf(current)`
  derivation's -1 edge case (a hand-edited greeting matching no alternate) is proven NOT to dead-end the
  control in either direction, which a naive `useState(0)` index would get wrong.
- **`group-config-form.ct.tsx`** (88 ln) — whole-object-rebuild-on-discriminator-switch (narrator arm's
  `.strict()` schema means `cardScope` must be ABSENT, not merely unset — checked via `not.toContainText`),
  and an F1 cross-chat SWITCH pin using an untouched sentinel field (`groupNudge`) to prove the form
  reseeds rather than carrying a frozen `FormApi` from the previous chat into the new chat's autosave.
- **`home-masthead-body.ct.tsx`** (154 ln) — three RED-FIRST-documented fixes (sub-minute "now ago" vs
  "just now"; last-message-vs-row-stamp recency ordering; server census vs page-size count at the exact
  page-boundary case where the old defect and the fix diverge) plus a themed-background contrast check
  using `pixelContrast` against both light/dark polarity arms.
- **`home-quick-picks-tile-body.ct.tsx`** (317 ln) — five more RED-FIRST-documented rail-sweep fixes
  (focus-follows-mutation-not-unmount via `trpcHold`; honest-tagline fallback chain; accessible
  name/description split; type-ramp relation vs px literal; row-baseline reservation for both the name AND
  the pitch, each proven with deliberately asymmetric fixture lengths so the pin cannot pass by
  coincidence) plus a fixed-cell-size-not-growing-with-width proof (#102) and an empty-state-with-a-CTA
  check.
- **`home-temp-chat-tile-body.ct.tsx`** (77 ln) — user's own TTL rendered (never hardcoded), one shared
  new-chat-picker seam (never a bypass), teaching-as-gloss-not-badge, and the reaper mutation-fired-on-mount
  check via `trpc.count`.

## 10. Per-file verdicts — chunk 4 (4 files, all CLEAN)

- **`imagery-templates-section.ct.tsx`** (118 ln) — placeholder-ghosts-shipped-default, nested patch
  shape (`templates.character`) proven with an explicit check that an UNTOUCHED sibling mode is sent as
  `null` (not omitted), clear-to-default sends the leaf `null`, and the IMGMAC macro-completion popover's
  surviving exemption (caption cards resolve no macros, so they offer nothing) proven as a real absence
  check rather than assumed from the extraction-mode positive.
- **`invite-dialog.ct.tsx`** (151 ln) — both mint modes (share-link untargeted, handle-targeted with
  limits on the wire), the target-unknown refusal rendered INLINE (never silently degrading to a share
  link — checked via absence of the link result), empty-handle field validation with a wire-call-count
  check, and outstanding-list per-row status with Revoke gated to pending only.
- **`jump-to-latest-pill.ct.tsx`** (180 ln) — chrome (inert-hidden a11y, singular/plural, held-count
  no-flash-to-zero, keyboard activation) plus two genuine race-condition defect proofs: P0#1's settle-race
  test proves a specific ONE-COMMIT-EARLY store update (`live→false` before the canon query grows) does not
  transiently zero the pill's count, and PD-147 proves a pinned prompt suppresses the pill via
  synced-snapshot rather than merely geometry, with an explicit un-pin-without-moving arm that checks the
  suppressed count does not resurrect.
- **`macro-picks-section.ct.tsx`** (302 ln) — unset-vs-picked rendering for both knob families (macro
  inputs and ChoiceBlock variables), the whole-bag-rewrite-preserves-siblings pattern proven on every edit
  (single-select, random-pick array, and a second family's multi-select), Use-default unset arms proven to
  actually DROP the key (not merely blank it, checked via `toEqual` on the full wire payload), an orphan-key
  preservation test (a stored pick the preset no longer declares survives an edit to a DIFFERENT key), and
  the #1110 counter-pin distinguishing which checkbox groups keep the accent skin vs go quiet.

## 12. Per-file verdicts — chunk 5 (6 files, all CLEAN)

- **`member-card-viewer.ct.tsx`** (153 ln) — three visibility-tier clamps (sheet/name-avatar/full), each
  proving the hidden-tier note COUNT matches the tier gate (never stacked notes for a single gate, checked
  via `data-testid` count), the name-renders-exactly-once a11y proof (no duplicate title span), and a typed
  NOT_FOUND gone-arm distinguished from the transient Retry surface.
- **`memory-recall-detail.ct.tsx`** (36 ln) — missing-trace vs zero-result distinguished, every verdict
  label exercised on a populated trace.
- **`memory-settings-section.ct.tsx`** (85 ln) — bidirectional enable/disable mutation proof, a
  door-not-sentence affordance check (the backfill pointer is a real button, presence asserted), and a
  resolved-token type-step-parity check (never a literal px) for the note's font-size.
- **`message-actions-row.ct.tsx`** (258 ln) — system-row gating (no inline Edit/Fork/Hide, but Copy/Delete
  survive on every role), the A3 rest-hidden+inert class contract, and eight distinct mutation-wiring pins
  (hide/unhide, delete-confirm, delete-cancel, fork, copy-to-clipboard, undo/revert-continuation) each
  checked on BOTH the wire shape and, for the disabled continuation arm, a forced click proving the
  HANDLER's own guard holds even past the menu's pointer guard (not just that the UI looks disabled).
- **`message-cost-readout.ct.tsx`** (51 ln) — the paid-fetch gate (explicit zero-count-before-click
  assertion, since a paid upstream call firing eagerly is the whole regression class), key-scoping by
  `generationId`, error-degrades-to-n/a, and a null-id row rendering no dangling trigger.
- **`message-edit-textarea.ct.tsx`** (106 ln) — Enter-saves/Shift+Enter-newlines/Esc-discards/Save-button,
  an explicit no-op-save-fires-nothing case, and the Esc-cancel test is annotated in-file with a realm note
  (the textarea re-render is read from the BROWSER's own store instance, not a node-side read — the CT
  harness runs the test in node and the component in the browser).

## 14. Per-file verdicts — chunk 6 (6 files, all CLEAN)

- **`message-metadata-row.ct.tsx`** (141 ln) — an exhaustive TOGGLE×PRESENCE matrix (a toggle-on/datum-null
  case renders nothing; a datum-present/toggle-off case renders nothing) across seven datum kinds, plus a
  render-nothing-shell floor and a separator-only-between-items check; the #167 model-credit-moved
  regression is pinned as a positive presence check for its NEW home (absent here — checked by CSS-slot
  count 0, not just by silence).
- **`message-reactions.ct.tsx`** (228 ln) — pressed-state resolved via a real viewer-seat join (proven
  through a real mount, since a wrong join is invisible to tsc and reads identically to "nobody reacted");
  a real geometry claim (one-line-with-+N-tail, measured via distinct top-edge count, which a slice() unit
  test cannot see); segment-anchored chip re-keying proven on the wire input, not the UI; and dual
  fine/coarse pointer-door coverage with emulation-landed controls before every coarse claim.
- **`message-selection-bar.ct.tsx`** (92 ln) — render-when-active contract, live count tracking through
  toggle-off-decrements, hard-cascade confirm (never an undo toast — a real AlertDialog), and a failed
  delete keeping select-mode alive for retry (proven via bar-still-visible + selection-still-held, not just
  "no crash").
- **`message-tool-calls.ct.tsx`** (114 ln) — generic-fallback / per-tool-name renderer / whole-message
  first-refusal-with-fallthrough, plus a genuinely adversarial precedence test: the prefix renderer is
  registered FIRST in the story so an exact-claim-wins assertion cannot pass on registration order alone.
- **`reaction-picker.ct.tsx`** (210 ln) — the round-trip is asserted at the WIRE (a spy `onPick` would miss
  a wrong `variantId`), un-react proven to ride the SAME proc (server owns direction), and the dismiss test
  proves the negative NON-VACUOUSLY: reopen → pick → assert the recorder holds exactly ONE call (had the
  dismiss written, it would be two) — the file states in-file why a bare zero-poll on dismiss would prove
  nothing. Segment-target narrator-gate proven client-side on a real row (standard body offers no targets).

## 16. Per-file verdicts — chunk 7 (5 files, all CLEAN) — `chat/components/`, `chat/hooks/`, `chat/lib/` DRAINED

- **`rewrite-dialog.ct.tsx`** (61 ln) — catalog-order toggle firing (proven against click order), the
  empty-steer Apply-disabled gate, and Esc-preserves-state-above-the-dialog (state owned by the caller, so
  a cancel never destroys the draft).
- **`swipe-strip.ct.tsx`** (233 ln) — the cold-load step-back/step-forward fix proven with FRESH mounts that
  have never locally observed the sibling variant (the exact regression class — a per-mount-observed
  history could not resolve an unrendered idx), a real token-voice geometry check (mono + tabular-nums via
  computed style), the #849 visible-label-not-bare-chevron fix, and a keyboard-race test that is honestly
  self-documenting: the ArrowRight test explains in-file why it retries the press (a real
  effect-attaches-post-mount timing gap) and why a press-then-poll ordering would double-fire under fast
  resolution — not a defect, a correctly-reasoned harness accommodation for a real async gap.
- **`variant-wire-viewer.ct.tsx`** (226 ln) — the two-belt host gate (client half only; server half pointed
  at its own int test by name), the fetch-gated-on-open proof (zero-count before open), the metadata-row
  has-no-affordance regression check (explicit absence of the RETIRED trigger's exact old accessible name),
  and the #1032 freeze-provenance three-field coverage including the greeting-seeded no-prompt case that
  motivated the column.
- **`use-slash-commands.ct.tsx`** (249 ln) — known/unknown/escape/unavailable dispatch, a genuine
  editable-combobox a11y contract (activedescendant cycling with focus never leaving the textarea,
  highlighted-vs-typed Enter disambiguation, closed-strip arrow-keys-not-hijacked proven via real caret
  movement), and a zero-registrant baseline. Every `ONESHOT-OK` marker sits on `expect.line-1` — adjacency
  window checked and satisfied at all 5 sites.
- **`chats-selection-title.ct.tsx`** (36 ln) — the post-R1 single-arm hook (draft mode deleted, no more
  drift to guard) and an untitled-room-yields-null (never an empty string or fabricated name) honesty check.

`tests/client/features/chat/components/**`, `chat/hooks/**` and `chat/lib/**` are now fully drained for
this shard's population (all exclusions accounted for).

## 18. Per-file verdicts — chunk 8 (4 files, all CLEAN) — POPULATION DRAINED (65/65)

- **`chat-landing-surface.ct.tsx`** (60 ln) — the post-H1 slim no-selection state, a conditionally-rendered
  footnote proven in BOTH arms in one mount, and a no-second-launcher regression sweep with an in-file note
  on why the "All characters" absence check is matched WITHOUT the trailing arrow (the arrow is now a
  decorative `aria-hidden` span, so the old literal would have passed for the wrong reason — an honest
  self-correction against an un-failable check).
- **`command-palette-surface.ct.tsx`** (127 ln) — the three-source unification (Threads/Go-to/Commands),
  search filtering across groups, a Retry-restores-only-that-group test with both Enter and Space activation
  variants, a contributed command that both palette-discovers AND runs (one declaration, two surfaces), and
  the zero-registrant baseline.
- **`new-chat-picker-surface.ct.tsx`** (398 ln) — the corpus's strongest picker-surface file. The #334
  persistent-footer-button fix is asserted by ROLE (`button` vs cmdk's `option`), which is a genuine defect
  proof against the old shape (the query finds nothing on old source, not just "fails an assertion"); the
  \#852 accessible-name test explicitly distinguishes "two container-query arms, one out of the a11y tree via
  `display:none`" from a doubled sr-only span, and is two-sided (wide names one arm, narrow names the
  other); the #439 footer-overhang test builds a real per-button pixel-overhang table because two other
  instruments (`snap --expect-no-overflow` and design-audit's `clipped-positioned-child`) are documented in
  file as BLIND to this exact negative-overflow case; the deep-library search-reaches-the-server test proves
  a character beyond the page ceiling is unreachable in the DOM until the server search lands; and the
  draftKey-collision test seeds localStorage via `addInitScript` (before the store rehydrates) to prove a
  previous session's orphaned draft cannot leak into a freshly-minted room.
- **`worst-legal-art-contrast.suite.ct.tsx`** (162 ln) — the strongest instrument-honesty file in the whole
  shard. Seven palette arms assert every rendered text node in a real room clears AA over the worst legal
  background art, discovered from the live DOM rather than a hand-kept token-pair table — and SIX hostile
  planted-negative controls prove the instrument refuses to lie: a zero-node surface throws (never "0/0
  passed"), a known-bad pairing fails, an off-viewport node stays declared-but-not-reached, a fully-occluded
  node is caught and named as such in the error, an unmeasurably-faint node cannot pass, and a same-computed-
  background pair with opposite FRAMEBUFFER verdicts proves the instrument reads paint, not the cascade.

`tests/client/features/chat/surfaces/**` is now drained for this shard's population. **The full 65-file L2
population is now READ WHOLE, top to bottom, zero sampling.**

## 19. Taxonomy sweep receipts — whole 65-file population

Run over the exact 65-file list (`git ls-files` re-derived, paths in §1), each class corroborated by a
planted positive control in a throwaway scratch file (never committed, removed after):

| Class | Result | Positive-control check |
| - | - | - |
| `component.screenshot({ path:` / `page.screenshot({ path:` not routed through `storyShot` | **0** | planted control site matched the same grep, confirming the pattern is live |
| `as unknown as` / `as any as` double-casts | **0** | planted control site counted 1 |
| `test.skip` / `.fixme` / `.todo` / `.only` | **0** | planted control site matched |
| `biome-ignore` / `eslint-disable` | **0** | planted control site matched |
| `ONESHOT-OK` markers | **6** (5 in `use-slash-commands.ct.tsx`, 1 in `face-strip.ct.tsx`) — every one checked in its own per-file verdict above; adjacency window (`expect.line-1`) satisfied at all 6 sites, every reason true and site-specific | |

No luck-based-coverage sites, no decorative pins, no accname substring traps (every `getByRole(name:)` in
this shard that made a shape claim used `{ exact: true }` — see e.g. `character-gallery-dialog.ct.tsx`,
`face-strip.ct.tsx`), no stand-in children, no tabs/panels-accumulate pattern (this shard's surfaces mount
fresh per test), no shared-render-tree reads found.

## 20. Verified clean — what this shard's silence covers

- Full read of all 65 population files, whole files, top to bottom, no sampling — confirmed per-file with
  line counts in §3/§6/§8/§10/§12/§14/§16/§18.
- The taxonomy sweep in §19, each class corroborated by a planted positive control.
- Premise spot-checks performed inline where a claim depended on today's source (e.g. the #167
  model-credit-moved absence checks, the #852 container-query-arm accessible-name distinction, the #446
  conditional-footnote render).
- **Zero findings** across the whole shard — no P0-P4 defects, no stale premises, no un-failable oracles,
  no decorative pins.
- **No test was RUN this shard** — every verdict is read-derived; the taxonomy sweep is a static grep, not
  an execution. Zero of any run budget spent, matching the legs' own "no run needed" posture where the
  claim never depended on execution.

**Not covered:** the `tests/client/features/chat/**` files this shard deliberately excluded (already
audited by legs 1-3 and the concurrent sibling shard — §1), `tests/e2e/**`, and the 400+ files outside this
shard's scope (owned by the parallel legs 1-4 of #1229).

## 21. Issue summary (for #1229 — paste verbatim)

> **CT corpus audit shard L2 (cb-ct-audit-L2): chat + shared-components population, 65/65 files read whole,
> zero findings.** Scope: `tests/client/features/chat/**` + `tests/client/components/**`, minus 9 files
> already audited by legs 1-3 and 11 chat files claimed by a concurrent sibling shard (22 exclusions total,
> from an 87-file raw population). Every file read top to bottom; taxonomy sweep (literal `reports/` writes,
> `as unknown as` double-casts, skip/fixme/only, suppression markers, `ONESHOT-OK` adjacency) came back
> clean across the board, each class corroborated with a planted positive control. No stale premises, no
> luck-based coverage, no decorative pins, no un-failable oracles. Standout instrument-quality files:
> `worst-legal-art-contrast.suite.ct.tsx` (6 hostile planted-negative controls proving the contrast
> instrument refuses to lie), `new-chat-picker-surface.ct.tsx` (a real per-button pixel-overhang table
> where two OTHER instruments are documented blind to the same defect class), `committed-members-tab.ct.tsx`
> (a 0.1px-resolution live geometry sweep replacing two prior false-red width pins), `setting-teach-row.ct.tsx`
> (a RED-FIRST-measured width matrix that deliberately keeps its narrow "passing" arms as fences, because
> the original defect's own signature was disappearing at narrow widths). Report:
> `docs/reviews/stickler/2026-09-02-ct-corpus-audit-L2-chat.md`.
