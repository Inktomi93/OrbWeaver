# side-eye — REFINERY graduation review (2026-08-09, pre-polish)

**VERDICT: DO NOT SHIP (as-is).** Architecture underneath is genuinely good (schema-driven renderer
with total dispatch, faithful arm-B grammar, clean keyboard flow); the SURFACE is unfinished: two
flex-squeeze collapses making primary inputs unusable, a 1.14:1 contrast fail on the stepper, two
mislabeled doors, a no-way-back dead end, twelve nameless checkboxes on the scope dialog, and ZERO
animations/skeletons/shimmer against the owner's polish mandate. Feeds the #39 polish build lane —
every finding gets fixed.

Screenshots: `reports/snaps/live-*.png` (18) + `reports/snaps/mock*-*.png` (the 5 ratified mocks).
Environment notes: 3 retractions recorded in the lane transcript (phantom vite-cache white screen —
stack restarted to clear; truncated box-shadow misread; mid-animation capture). design-audit clean =
floor not verdict (needs-session states invisible to it). Engines adopt-only ⇒ NO model-backed run
exercised — accept review/apply/assay verified in source only; e2e phase owes the live drive.

## P1 (fix before ship)
1. **Stepper text unreadable**: 1.14:1 / 2.30:1 on the active `bg-primary` cell — `Text` voices
   hardcode fg colors inside filled Button (stage-stepper.tsx:39-64). Fix: text-current inheritance
   AND drop the solid-primary cell for the mock's tinted-cell + ring + filled circular badge.
2. **Guidance textarea collapses to 26px wide** in 3-pane desktop (run-controls-card.tsx:104-129 —
   one Row gives fit line + verbs min-content, Field gets 0). Fix: two-row run bar.
3. **Same collapse in schema editor, worse** (schema-editor-dialog.tsx:340-345 — Select ~580px of
   670): "Refine the draft" at 26px drives dialog scrollHeight 1989 vs 734. Split rows, cap Select.
4. **Session rows have no identity** ("Untitled session / iteration 0 / NO VERDICT" ×4) —
   refinery-list-surface.tsx:82 renders neither character nor updatedAt though the summary schema
   carries both. Fix: avatar + name identity, verdict chip, iteration·runs·relative-time,
   TODAY/EARLIER groups.
5. **Search can't find by character** (filters session.name only, always null). Include resolved
   character name in the predicate.
6. **No door back to "start a session"** once one is selected (desktop AND mobile — phone roster has
   no + at all; mock draws one in the topbar). Fix: + in RefineryListHeader.
7. **"Guidance → Edit" opens the SCOPE dialog** (refinery-context-tabs.tsx:93 wrong wire).
8. **"Stage modes → Change" opens the schema editor**; stage modes editable NOWHERE. Build the
   control or make the row a readout.
9. **12 nameless 18px checkboxes** in the scope dialog — wrap rows in real `<label>` (fixes name +
   hit target).
10. **No loading affordance on any model call + running status lies** ("not run yet" while running;
    zero Skeleton imports in the whole feature). See polish list.
11. **Inverted hierarchy**: active stepper tab is the only primary; Run score is secondary (and
    primary in CONTEXT — same verb, two weights). One primary per region: the CTA.
12. **Scope chip row clips silently** (creatorNotes paints outside the pane). Wrap or +N overflow.
13. **Hero gauge is 13px mono and the empty arm collapses the anatomy** (payload-view.tsx:131,135)
    against the file's own "never collapses" header. Display-size numeral; keep the Meter shape.
14. **Schema dialog's character picker renders permanently open, 281px off-screen.** Collapsed
    trigger state / disclosure.
15. **Half the schema editor unreachable**: only mount hardcodes stage="score", editing={null} —
    analyze authoring + edit-existing + the whole editing branch dead in the shipped app.
16. **FORK C diff toggle missing** (ruled: chars/words/lines + side-by-side/inline, defaulting by
    length; build: hardcoded 200-char constant).
17. **Teaching-state character door ≠ FORK J's as-drawn ruling** (no quick-pick cards with metadata,
    no Browse-all door; combobox opens off-viewport).

## P2
Two simultaneous "Pick a character" homes w/ contradictory copy · prompt-fit two homes, CONTEXT drops
the ⚠ (context-tabs reads inputEstimate only) · Settings nav highlights wrong item post-anchor-jump ·
schema dialog no visible exit (Esc works, undiscoverable) · Name is a right-aligned textarea beside
Save · arm picker unlabeled visibly · cyan `tone="info"` chips as scope roster (status tone on nouns,
hue 232 vs ember app) · CONTEXT tabs are filled pills vs mock's quiet underline (two competing
primaries) · zero-count chips in loud tones ("0 discarded" in red) · undecided warning + refusal +
failure + success all render as identical muted gloss · 10.5px chips carrying 40-char sentences ·
motion-audit 623ms worst blockingDuration on section entry (7 LoAFs w/ style-layout; dev-build
caveat; profile it).

## P3
62% CONTENT void at 1080p with session open · 01/02/03 markers (mock-sanctioned — house-taste
question) · Setup tab monotonous spacing · settings paragraphs 120ch · ember-on-ember active-step
focus ring (low salience) · BulletsBlock reads "•" to screen readers (use real ul/li) ·
**Refinery unreachable from the mobile bottom tab bar (crowning feature has no phone entry) — OWNER
question** · ~490px settings void post-jump.

## POLISH OPPORTUNITIES (priority order; every keyframe gets prefers-reduced-motion opt-out)
1. Stage-run shimmer: previous payload at ~60% + slow shimmer sweep; indeterminate hairline on the
   running step cell.
2. Plan-shaped skeleton on first run (derive from buildRenderPlan — hero block, verdict bar, N assay
   rows; the anatomy is known before data).
3. Runs-ledger stagger-fade (opacity + 8px translateY, 40ms apart, ease-out-expo); new settled run
   slides in with one-shot accent flash.
4. Assay accordion height+opacity transition (co-motion parity with any track reflow).
5. Hero-gauge count-up 0→score ~500ms + meter sweep — the money shot.
6. Stepper crossfade (120ms out/180ms in) + active-cell treatment slides between cells.
7. Keep/Discard press: animate block collapse to header+chip; count ticks with scale pulse.
8. Schema-dialog generate/refine shimmer over JSON pane + preview, crossfade the result in.
9. Scope-dialog fit-line ticker (the missing `prompt ≈ N/M tok` footer ticks, not jumps).
10. List-row selection accent glides between rows.
11. Empty-state ambience: aura + the FLASK glyph (teaching state has none; CONTEXT uses mismatched
    sparkles).
12. All compositor-only; new keyframes carry their own reduced-motion opt-out.

## The single biggest opportunity (the synthesis)
**Give the workspace a subject and a verb.** Portrait + character name at display size in the
header; stepper demoted to tinted-cell + ring; Run score promoted to the pane's only primary; the
660px void filled by the plan-shaped skeleton that becomes the assay. One change fixes hierarchy,
type scale, accent budget, void, and loading state simultaneously.

## Don't touch (verified good)
render-plan.ts + PayloadView architecture (fix widgets, not the plan) · CONTENT keyboard flow ·
the arm-B accept grammar (tri-state, fails closed, ADDED renders after alone) · teaching-state +
structured-output-row copy.

## Not exercised (e2e phase owes)
All model-backed runs (engines adopt-only): live assay/verdict rendering, accept review with real
data, apply outcome + drop reasons, run-error arm, NL generate/refine/needs-raw, strippedKeys warn,
manual-rewrite dialog. Real-pointer hover oscillation.
