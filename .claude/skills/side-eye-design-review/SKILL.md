---
name: side-eye-design-review
description: "Review Orbweaver UI/UX, visual design, usability, and accessibility against the repo's design laws and severity scale. Use for any UI critique, design audit, or accessibility review."
---

# side-eye design-review laws (§0-§18)

Adapted from the `impeccable` design language (pbakaus/impeccable, Apache-2.0), Nielsen/NN-g heuristics, and Orbweaver law. Apply this checklist; name the rule a finding breaks. `reference/design-context.md` maps the generated design truth and the product voice. `docs/design/impeccable-adoption.md` records the upstream triage and attribution; the live rule set is `DESIGN_AUDIT_RULES` in `tooling/src/ui-audit/contract/rules.ts` — cite that file, not a count. The side-eye role also preloads `snap-driving`, which owns mechanics, flags, exit codes, and stage/db facts — read it too, not restated here.

## §0 Our laws (check these first)

- **Reading-surface rule.** Blur, glow, and imagery belong on chrome/overlays, never behind long reading text. Art is a margin/edge/corner accent that fades to a clean surface before the prose. Body text on an image or a busy gradient below 4.5:1 contrast is P0/P1, always. Immersive chat modes keep text on a clean bubble.
- **Never distort an image.** Use `object-fit: cover`, never a fixed-both-dimensions stretch. Rendered aspect must match the source aspect within about 3%.
- **Tokens only.** No raw px/hex/arbitrary Tailwind values in features; `@orb/ui` primitives and `<Stack>/<Row>/<Section>/<Container>`; no `className` on raw HTML in a feature. A raw value is a finding.
- **No dead toggles.** A rendered control must have a live consumer end to end. A setting that persists but changes nothing is a defect.
- **Container model.** Surfaces adapt via `@container`, not layout-context props. Test a narrow container, not only a narrow viewport.
- **Done means rendered.** Verify computed styles and the rendered result, never source alone.

## §1 Color

- Body text contrast ≥ 4.5:1 against its effective background; large text (≥18px, or bold ≥14px) ≥ 3:1; placeholder ≥ 4.5:1. Measure the muted-gray-on-tinted-near-white case; do not trust it by eye.
- Measure surface-vs-surface contrast with a strip sample against the true pane background, never a single pixel pair — one point can invert the conclusion.
- Gray text on a colored background reads washed out; use a darker shade of the background's own hue, or a transparent text color, not neutral gray.
- Meaning is never carried by color alone (error/success needs a second signal).
- New work: OKLCH. Avoid a cream/sand/beige near-white body. Pick a color strategy (restrained accent, committed accent, full palette, drenched) before picking colors.

## §2 Typography

- **Body line length 65-75 characters, counted by average glyph advance, not CSS `ch`.** CSS `ch` is the zero-glyph advance; running prose averages narrower, so one CSS `ch` reads as roughly 1.5 of the characters this rule counts. Measure by glyph advance and report both numbers.
  - Chat transcripts take `--reading-measure` (75ch): message content and the streaming ghost row. A transcript row over the wider measure is not a finding — dialogue is short attributed lines, not continuous body copy.
  - Everything else you read takes `--reading-measure-prose` (47ch): teaching copy, glosses, settings-row descriptions, empty/welcome text, any non-transcript paragraph. A prose paragraph on the transcript measure is a finding.
  - A block that also holds controls may keep the wide measure; the paragraph inside it still carries its own prose cap. Headings are not body copy. Tailwind's `max-w-prose` (65ch) satisfies neither measure.
  - The cap rides the paragraph, not the page: a cap inherited from a wrapper computes at the wrapper's type size. Derivation: `reading.measure-prose-ch`'s description in `packages/ui/src/tokens/tokens.json`.
- Pair fonts on a contrast axis, or use one family in multiple weights; two similar sans faces is a tell.
- Display heading ceiling about 6rem; letter-spacing floor −0.04em (tighter reads as letters touching).
- `text-wrap: balance` on h1-h3; `pretty` on long prose. A flat type hierarchy is a defect.

## §3 Layout

- Vary spacing for rhythm; monotonous uniform spacing is a defect.
- Use a card only when it is genuinely the best affordance for that content; nested cards are always wrong.
- Flexbox for one dimension, Grid for two; responsive grids use `repeat(auto-fit, minmax(min(<x>, 100%), 1fr))`.
- Semantic z-index scale (dropdown, sticky, modal, toast, tooltip). A raw `999`/`9999` is a finding.
- Dropdowns/popovers inside `overflow:hidden/auto` clip; portal, `position:fixed`, or native popover to escape the stacking context.

## §4 Motion

- Intentional, not a uniform section-fade reflex. Ease-out exponential; no bounce/elastic. Do not animate layout properties; do not gate content visibility on a class-triggered transition (it never fires on hidden tabs or headless).
- `@media (prefers-reduced-motion: reduce)` is mandatory for every animation. A global killer in `packages/ui/src/styles/globals.css` covers transitions; a new keyframe animation still needs its own opt-out.
- Never animate an `<img>` on hover.
- **Coordinated motion.** When an element slides or transforms, the layout it displaces must move in sync (same duration/easing) or be instant. `__orb.motion()` does not flag a hybrid (element gliding while the space it vacated snaps at `0s`) — it drops no frame; it is a visual desync. Verify `transition-duration` parity between the moving element and the container/track/sibling it reflows, and watch the content, not the moving element.

## §5 Interaction & states

- Every interactive element: visible focus ring, keyboard operable, an accessible name.
- Provide the exits: cancel/undo/back/escape; Esc closes modals.
- Cover every state — empty (useful guidance, not just "No results"), loading, error (plain language, near the source, preserves work), success. Confirm destructive actions; smart defaults; autosave/draft recovery.

## §6 Bans / AI-slop antipatterns (flag on sight)

`side-tab` accent border · `border-accent-on-rounded` · `overused-font` (Inter/Roboto default) · `single-font` for everything · `flat-type-hierarchy` · `gradient-text` · `ai-color-palette` (generic indigo/violet SaaS) · `cream-palette` · `nested-cards` · `monotonous-spacing` · `bounce-easing` · `dark-glow` · `icon-tile-stack` · `italic-serif-display` · `hero-eyebrow-chip` · `repeated-section-kickers` · numbered section markers · `em-dash-overuse` · `marketing-buzzword` · aphoristic-cadence copy. Many fire deterministically in `pnpm snap <route> --design-audit` (origin-tagged `impeccable`; full triage in `docs/design/impeccable-adoption.md`). Two ratified divergences from upstream: the kicker voice (caps micro label + hairline rule as a section name) is law here (`Section.kicker`); hairline-border with soft-shadow is the sanctioned `--shadow-overlay` elevation recipe, not a tell. Copy-cadence tells (em-dash, buzzwords, aphorisms) apply to UI chrome copy only, never to model or user prose in the transcript.

## §7 Nielsen's 10 heuristics — scoring rubric (0-4)

`0` absent/broken · `2` partial with real gaps · `4` genuinely excellent. Score what the evidence shows; this rubric states no prior about where a surface usually lands.

1. Visibility of system status — loading/save/submit feedback, progress, location, inline validation.
2. Match system to real world — plain language, logical order, recognizable metaphors, no jargon.
3. User control and freedom — undo/redo, cancel, back-to-safety, clear filters, Esc from flows.
4. Consistency and standards — same word/action means the same thing; platform conventions.
5. Error prevention — confirm destructive ops, constrained inputs, smart defaults, autosave.
6. Recognition over recall — visible options, labels on icons, contextual hints, recent items.
7. Flexibility and efficiency — keyboard shortcuts, bulk actions, accelerators.
8. Aesthetic and minimalist — every element earns its pixel; clear hierarchy; no clutter.
9. Error recovery — plain-language errors, specific problem plus actionable fix, near the source.
10. Help and documentation — findable, contextual, task-focused, concise.

Bands (calibration only, never a gate): 36-40 excellent · 28-35 good · 20-27 mid · 12-19 poor · 0-11 critical. Fix or file every issue the walkthrough identifies regardless of the band; a "mid" surface with unfixed findings is not done. Do not score-chase — no re-review loops hunting points, no inventing findings to justify a number. The finding list is the deliverable; the score is a one-line summary of it.

The score covers only active rendered surfaces. React Activity keeps inactive sections in hidden DOM; those do not enter the visual, geometry, operability, accessibility, or Nielsen count. Inventory retained sections with `pnpm snap <route> --map --include-hidden` for discovery only, then activate each through its real control and score the settled, rendered result. Report every retained section as ACTIVATED+RAN or SKIPPED-with-reason.

## §8 Cognitive-load checklist (working memory ≤ 4)

At every decision point, count competing visible options: 4 or fewer is fine, 5-7 pushes it, 8 or more is overloaded. Check: single focus · chunking (≤4 per group) · visual grouping · clear hierarchy · one-thing-at-a-time · minimal choices · no working-memory bridge across screens · progressive disclosure. Watch for: a wall of options · a memory bridge · hidden navigation · a jargon barrier · a visual-noise floor · an inconsistent pattern · a forced context switch.

## §9 Persona checks (walk the primary action as each — always include Sam)

- **Sam (screen-reader/keyboard-only, low vision):** click-only with no keyboard path · missing or invisible focus · meaning by color alone · unlabeled fields/buttons · custom components that break screen-reader flow · contrast below 4.5:1 · state changes not announced.
- **Riley (stress tester):** silent failures · error states that break layout or leak detail · empty states with no guidance · data lost on refresh/nav · inconsistent behavior · long strings/emoji/RTL.
- **Casey (one-handed mobile):** primary action out of the thumb zone · no state persistence · tap targets under 44x44 · heavy assets with no lazy load.
- **Alex (power user):** no keyboard shortcuts · one-at-a-time where bulk fits · unskippable onboarding · redundant confirmations.
- **Jordan (first-timer):** icon-only nav with no labels · jargon · no visible help · an ambiguous next step.

## §10 Severity

`P0` blocking (cannot complete, unreadable, inaccessible) · `P1` major (fix before release) · `P2` minor (a workaround exists) · `P3` polish. Test: would a user contact support? Yes means at least P1.

## §11 The appearance effect axes (intentional — never flag as slop; verify each)

New user-tunable, token/accent-driven effects. Check they render right and are not mistaken for AI-slop. Toggle an axis via the Appearance settings pane, or by reading the attribute at its real host (root `<html>` for theme/blur/shadow/texture/font-scale variables; `.shell-grid` for `data-elevation`/`data-density`/`data-list-mode`/`data-context-mode`/`data-focus-mode`/`data-reduced-motion`/`data-has-bg-image`) — read them with `snap --eval`, never from memory, and never assume a handle is on the root.

| Axis | What it is | Verify |
| - | - | - |
| `elevation: flat\|ramp\|glow` (`.shell-grid[data-elevation]`) | `glow` layers shadows + an inner top-highlight | all three values switch cleanly, no cascade residue when reverting |
| `surfaceTexture: none\|grain` (root `data-texture`, absent at `none`) | opt-in SVG-noise dusting on chrome/cards only, never message prose | `display:none` under `prefers-contrast: more` |
| `--shadow-glow` | the rationed accent glow; rides a `::before` layer, never the element's own `box-shadow` | read the enclosing selector, not the declaration — a raw `box-shadow: var(--shadow-glow)` on the element clobbers the focus ring; the layered `::before` form composes |
| `--shadow-overlay` | layered float elevation (`packages/ui/src/styles/theme.css`) | no visible white line, no banding |
| Gradient border rings (`[data-cta]::after`, `[data-selected]::after`, `[data-active]::after`) | accent-tinted, radius-safe | composes with the fill, never clobbers `bg-primary`/`shadow-*` |
| Spotlight (`media-grid-cell::before`) | a low-alpha radial that follows the pointer | guarded `@media (pointer: fine)` and `prefers-reduced-motion: reduce` — verify both |
| Ambient aura (`empty-state-decoration::before`) | a radial behind the hero glyph only | must never lower the contrast of any text |

CLS evidence rule: `snap-driving` skill §5. Thresholds: frame budget 16.7ms · LoAF blocking ≤ 50ms · INP ≤ 200ms · non-virtualized CLS ≤ 0.1 · animations compositor-clean. A breach on a reading/immersive surface is at least P1.

## §12 Repo map — where things live

Navigation is client state, not a URL. The browser URL only ever settles at `/` or `/login`; sections, modals, settings panes, and the open chat are shell state (drive the UI, or use `snap --goto`/`__orb.nav`). The file map is `reference/design-context.md`.

**Seeding:** enumerate ids from `GET /api/_debug/db/chats` and `/api/_debug/db/characters`. To seed a small fixture, drive the UI on a staged run (`--isolated`/`--dirty`); the create journey is itself review surface. Reach a chat by `--open-chat <id|exactTitle|latest|current>` (refuses loudly on an ambiguous title) and a character by `--open-character <idOrName>`.

**Stage db:** stage db provenance is `rules/instruments.md`.

## §13 The blunt-taste + IA review (mandatory — the call no instrument makes)

Instruments measure; you judge. For every surface driven, deliver the human verdict in plain words:

- **Does the surface look bad?** Say so plainly, and say why the eye reads it that way: cramped · cluttered · unbalanced · generic/template-y · washed out · too dense · too empty · misaligned rhythm · elements fighting for attention. The evidence is the screenshot plus the specific description; no ratio required. "Fine" is also a verdict; deliver it with the same confidence.
- **Does it flow weird?** Walk the surface as a task: does the eye land where the work starts? Does the next action sit where you would reach for it? Do related things sit together and unrelated things apart?
- **One home per concept.** Flag on sight: the same setting reachable/editable in two places · two surfaces doing the same job with different vocabularies · duplicated affordances for one action in one view · a control far from where its effect is visible · the same information rendered twice with different values possible. More than one home for a concept is a defect, not a convenience.
- **Is it intuitive cold?** From the screenshot alone, could a first-timer name what this surface is for and what to do first? If you had to read source to understand a control's purpose, a user has no chance.

These verdicts are always in scope, focused mode included — the scope discipline bounds which surfaces you drive, never whether you judge the ones you drove. File a finding under BROKEN when it blocks or misleads, UGLY when it is taste — but file it either way.

## §14 The shell anatomy (law: `UI-Architecture-and-Layout.md` §4.1-4.3)

Every surface is reviewed inside a fixed four-region shell:

```
[ TOPBAR (chrome: reopen affordances, search, bell, fullscreen) ]
[ RAIL | LIST | CONTENT | CONTEXT ]
```

- **RAIL** (left icon column) — which facet. The live tuple is `SECTION_IDS = ["home","chats","characters","corpus","config","extensions","databank","presets","refinery","analytics"]` (`packages/client/src/state/section-ids.ts`), then Theme/Settings/Identity at the foot. Counting every listed section is not a finding; a section not in that tuple is. Facets of one world, not separate servers — cross-section jumps route through store actions.
- **LIST** — finding. The section's collection: header band, search, rows. Collapsible, per-section defaults.
- **CONTENT** — doing. The fluid hero: the artifact you are in. Nothing selected means a designed landing/teaching state, never an empty room.
- **CONTEXT** — detail and config of CONTENT's active artifact; changes with the section/artifact. Closable. Never navigation — actions on the artifact only.

Physics to enforce (a violation is a finding, cite §4.2):

1. LIST selection drives CONTENT; CONTEXT follows CONTENT.
2. Modals are for interrupts and pickers only. Settings is a modal — not a section, not a pane. Section content never lives in a modal.
3. Nothing replaces the three main panes. A feature that mints its own frame, hijacks the pane geometry, adds a rail section past the sanctioned tuple, or full-screens over the shell is a defect — flag any new geography on sight.
4. One primary action per region at rest; chrome quiet, content loud (accent no more than about 10% of viewport); the same action keeps the same home and label everywhere; switching rails away and back restores the section.

When judging flow (§13), this anatomy is the baseline: finding happens in LIST, doing in CONTENT, artifact config in CONTEXT — a task that bounces the user across regions, or parks a concept in the wrong region, flows weird by law, not just by taste.

## §15 The design-verb vocabulary

One word prescribes a fix with a law-bound meaning: `reference/design-verbs.md` — the full table, prescription grammar, and the mock-comparison method.

## §16 The review method (two independent tracks — do not collapse them)

Form your subjective read first, on its own. Then run the objective instruments. Then synthesize. Pay special attention to anything the instruments caught that your eyes forgave. That reconciliation is where the real defects surface.

**Track A — design-director review.** Judge the live surface against §0-§15 above, from your own eyes: the AI-slop/craft verdict (§6), Nielsen's 10 heuristics scored 0-4 (§7), the cognitive-load check (§8), 2-3 persona walkthroughs always including Sam (§9), and the reading-surface/house-law check (§0). Write Track A down before you look at the detector output.

**Track B — objective instruments.** Mechanics, flags, and exit codes are the `snap-driving` skill's job; read it before probing. Drive `pnpm snap` and its cases to collect: the selector map, ARIA tree, and WCAG contrast; `--design-audit` (desktop and `--mobile`); a motion/perf pass on the primary action; Lighthouse desktop and mobile; the `__orb` suite (`.motion()`, `.perf()`, `.renders()`); a console triage table (every warning or error is virtualizer-excluded, known and cited, or an open finding — "it's dev mode" is banned unless argued as truly unavoidable); the PNGs, actually looked at; a keyboard walk (`--key Tab` chain plus `--expect-focus`); the appearance cases (at minimum `defaults` and `maximal` from `tooling/src/_shared/appearance-presets.json`, plus `compact`/`reading` on density-sensitive surfaces, plus a light-theme case on light-sensitive findings); the pane-state cases on any surface with collapsible panes (both open, list collapsed, context hidden, both hidden, desktop and mobile); the retained-section inventory (`--map --include-hidden` for discovery, then an ordinary rendered pass on each activated section).

**Scope discipline.** A focused review works the brief's ranked targets depth-first, in rank order. The laws apply to those named targets; they are not a checklist to complete. A full audit — an unscoped "review this surface" brief — runs the whole method, Nielsen table included. Breadth never substitutes for the named targets' depth. The instrument coverage table is mandatory on a full audit, and a focused review prints it too: one row per instrument, RAN (evidence path) or SKIPPED (stated reason). A skipped row with no reason makes the review incomplete.

**Reading `--design-audit` output.** The RESULT line carries `population-verdict=complete|NO-VERDICT`. Read it before the findings. NO-VERDICT means a rule applied and the instrument could not judge it — the run is not clean, it could not see. Reading zero findings under a NO-VERDICT population as a clean pass is a common misread of this instrument. `excluded` means measured facts proved a rule inapplicable — complete evidence, never a gap. `withheld` means absence of measurement. Its tap-target and aria-name findings are frequently false positives: Base UI's hidden 1x1 inputs, `aria-labelledby` switch names, box-vs-hit-area mismatches on `size="inline"`/`size="glyph-*"` buttons, off-viewport hosts. Verify each with `--aria`/`--map` before reporting; never forward the raw count.

**Instrument honesty.** Your eye is not a colorimeter. Every color/polarity claim rests on `--contrast`, computed styles, or a decoded framebuffer pixel, never on how a render "looks." Never slice a `box-shadow` string; Tailwind emits empty default layers before the real one. A rule family reporting zero findings on a live surface is a reason to probe the sampler, not to celebrate. Your own probe fleet shares an origin-scoped SSE budget with the live app: a matrix case plus a `--pages`/`--contexts` run, or two probes overlapping, produces a storm of dropped-stream errors. Budget browsers per case, expect them, and retract them with evidence rather than filing them as findings. Canvas charts are invisible to every DOM instrument; screenshots are the evidence there.

**Synthesis.** Weave Track A and Track B into one verdict. Call out explicitly: where your eyes and the detector agree; what the detector caught that you forgave — that is the most useful line in the report; and any detector false positive, with the reason. Never concatenate the two tracks; reconcile them.

## §17 Rendered-probe traps

- Shoot the narrowest real host, not a wider story width — a control can be clipped only at its real production mount.
- Same-tick reads of smooth-scroll are false negatives — poll to settled before asserting scrollTop/geometry.
- An sr-only element's rest state (a `clip-path inset(50%)` collapse) is not an overflow or tap-target finding; check the focused state before filing.
- A tab strip's semantics depend on which tablist you are in — follow `aria-controls`/`aria-labelledby` back-references before declaring tab semantics broken. A toolbar of buttons carrying `aria-current` is not a tablist; `aria-selected` being null on a button there is correct.
- `--aria` (the browser's own ARIA snapshot) is the trustworthy structure evidence for grouping and landmarks; do not trust a flattened DOM read from another source.
- The hover class is real-pointer-only: a layout/hit-test oscillation under a moving mouse cannot be reproduced by `--hover` or a discrete dispatch. For any hover-reveal surface, assert the structural invariant instead (no display-based swap keyed on group-hover; reveal is opacity/visibility in reserved geometry) and name the live continuous-pointer case as an unmeasured gap if a finding turns on it.

## §18 Output contract

Lead with a one-line verdict: SHIP / DO NOT SHIP / SHIP WITH FIXES. Then:

- **Design-health score** — the Nielsen table, a total out of 40, and the band, covering active rendered surfaces only. Full audits only; a focused review replaces this with per-target verdicts in rank order, naming any target not reached and why.
- **Findings, ranked P0 to P3**, each: what, why it hurts a user, the concrete fix, and the evidence (ratio, screenshot path, measured value, ARIA excerpt) plus the run slot it came from. No finding without evidence; no evidence without its run. Route every finding to a fix, not only the top item — P2/P3 and pre-existing-but-on-surface findings stay in scope.
- **ARIA-navigability recommendations** — for every control with no accessible name, missing landmark, unlabeled icon-button, broken focus order, or color-only meaning: the exact element and the exact fix.
- **Taste and flow verdict (§13, mandatory in both modes)** — screenshot-backed prose, no scores. Its absence makes the report incomplete.
- **What is genuinely working** — two or three specifics, so the builder knows what not to touch.
- **The single biggest opportunity.**
- **The instrument coverage table** (§16) — last, so its absence is conspicuous.

If a surface is clean, say so only after trying to break it and showing that it held. Publish retractions in the same report: when a later reading overturns your own earlier finding, say so, what the wrong call rested on, and the evidence that overturned it. A clean automated scan is a floor, not a verdict — only a driven, screenshotted pass can call a surface good.

**Known instrument gaps to name rather than paper over:** hover-contrast can publish a false `excluded` verdict for group-variant hover paint — verify hover paint by hand on those surfaces. The walker censuses cap some candidate counts on a dense surface — treat a capped family's denominator as a floor, not a total (the RESULT line's `cap` count says which). Gesture-driven motion has no instrument coverage — say a gesture surface is unmeasured, not clean.
