---
name: side-eye-design-review
description: "Review Orbweaver UI/UX, visual design, usability, and accessibility using the reading-surface law, contrast/typography/layout/motion rules, AI-slop registry, Nielsen rubric, cognitive-load checks, persona walkthroughs, P0-P3 severity, live probe tooling, blunt-taste and information-architecture lenses, shell anatomy, and the governed design-verb vocabulary. Use for any UI critique, design audit, accessibility review, rendered-surface judgment, or side-eye reviewer task in this repository."
---

# side-eye design-review laws (§0–§15)

Distilled from the `impeccable` design language (pbakaus/impeccable, Apache-2.0), Nielsen/NN-g
heuristics, and the Orbweaver constitution. A checklist you APPLY. When a finding breaks one of
these, name the rule. Companion reference files in this skill dir: `reference/design-context.md`
(the DESIGN.md-equivalent map to our generated/ratified design truth + the OWNER-RATIFIED product
voice — audience/voice/anti-references/references/the-one-feeling, citable in reviews since
2026-08-16) and `reference/impeccable-adoption.md` (the upstream detector triage that produced the
adapted set + attribution; the LIVE ruleset is `DESIGN_AUDIT_RULES` in
`tooling/src/ui-audit/contract/rules.ts`, and that registry is the denominator, never a number
remembered here).

## §0 Our laws (repo-specific — check these first; where we actually fail)

- **Reading-surface rule (the #1 defect this exists for).** Blur, glow, and imagery belong on
  chrome/overlays, **NEVER behind long reading text.** Art is a *margin/edge/corner accent that fades
  to a clean surface BEFORE the prose*. If any body text sits on an image or a busy gradient at a
  contrast below 4.5:1 → **P0/P1, always** (the "text bled unreadable over the picture" failure).
  Immersive chat modes (Echo/Whisper/Ripple) must keep text on a clean bubble.
- **Never distort an image.** `object-fit: cover` (crop), never `background-size: 100% <h>` or any
  fixed-both-dimensions sizing that stretches. A 2:3 portrait forced into a wide band is a squish. We
  own `sharp` — the right-shaped crop is a variant, not a CSS stretch. Rendered aspect must match the
  source aspect (within ~3%).
- **Tokens only.** No raw px/hex/arbitrary Tailwind values in features (biome hook enforces it);
  `@orb/ui` primitives + `<Stack>/<Row>/<Section>/<Container>`; no `className` on raw HTML in a
  feature. A raw value is a finding.
- **No dead toggles.** A rendered control MUST have a live consumer end-to-end. A setting that
  persists but changes nothing is a defect.
- **Container model / responsive.** Surfaces adapt via `@container`, not layout-context props. Test a
  narrow container, not just a narrow viewport.
- **Done ≠ rendered.** Verify computed styles + the rendered result, never source alone — a gate can
  be green while the pixels are wrong.

## §1 Color

- **Contrast is non-negotiable.** Body ≥ 4.5:1 vs its *effective* background; large text (≥18px, or
  bold ≥14px) ≥ 3:1; placeholder ≥ 4.5:1. The single most common AI failure: muted gray body on a
  tinted near-white — measure it, don't trust it.
- Gray text on a colored background looks washed out — use a darker shade of the background's own hue
  or a transparency of the text color, not neutral gray.
- Meaning is never carried by color alone (red=error/green=success needs a second signal).
- New work: OKLCH; avoid the cream/sand/beige near-white body (the 2026 AI default); tinted neutrals
  add only 0.005–0.015 chroma toward the brand hue; pick a color strategy (Restrained ≤10% accent /
  Committed 30–60% / Full palette / Drenched) before picking colors.

## §2 Typography

- **Body line length 65–75 characters — counted by AVERAGE GLYPH ADVANCE, and the app has TWO
  measures for it (#1145, owner ruling 2026-09-02).** CSS `ch` is the zero-glyph advance (0.6625em in
  Geist) while a character of running prose averages 0.42–0.46em, so one CSS `ch` is ≈1.5 of the
  characters this rule counts — measure by glyph advance, never by `ch`, and report both.
  · CHAT TRANSCRIPTS take `--reading-measure` (75ch): the message content column and the streaming
  ghost row. Dialogue is short attributed lines, not continuous body copy, and the wider measure is
  deliberate there — a transcript row over 75 law-characters is NOT a finding.
  · EVERYTHING ELSE YOU READ takes `--reading-measure-prose` (47ch = 67–73 law-characters): teaching
  copy, glosses, settings-row descriptions, empty-state and welcome explanations, dossier pitches,
  every non-transcript paragraph. A prose paragraph on the transcript measure IS a finding.
  · A cap on a BLOCK that also holds controls (a settings track grid, a plugin detail stage, a card of
  steps) legitimately keeps the wide measure — the paragraph inside it carries its own prose cap.
  Headings are not body copy and are out of the band. `max-w-prose` is Tailwind's own 65 `ch`
  (≈98 law-characters), i.e. a third spelling that satisfies neither measure.
  · The cap rides the PARAGRAPH, never the page: an unregistered custom property is a token stream, so
  its `ch` resolves at the USING element and a cap inherited from a wrapper is computed at the
  wrapper's type size. The derivation lives in `reading.measure-prose-ch`'s `$description` in
  `packages/ui/src/tokens/tokens.json`; the pin is `#1145` in
  `tests/client/features/home/surfaces/home-surface.ct.tsx`.
- Pair fonts on a contrast axis (serif+sans, geometric+humanist) or one family in multiple weights;
  two similar sans is a tell.
- Display heading ceiling ≤ ~6rem; letter-spacing floor ≥ −0.04em (tighter = letters touch).
- `text-wrap: balance` on h1–h3; `pretty` on long prose. A flat type hierarchy is a slop tell.

## §3 Layout

- Vary spacing for rhythm; monotonous uniform spacing is a slop tell.
- **Cards are the lazy answer** — use only when genuinely the best affordance; **nested cards are
  always wrong.**
- Flexbox for 1D, Grid for 2D; responsive grids: `repeat(auto-fit, minmax(min(<x>, 100%), 1fr))`.
- Semantic z-index scale (dropdown→sticky→modal→toast→tooltip). Raw `999`/`9999` is a finding.
- Dropdowns/popovers inside `overflow:hidden/auto` get clipped — portal / `position:fixed` / native
  popover to escape the stacking context.

## §4 Motion

- Intentional, not a uniform section-fade reflex. Ease-out exponential (quart/quint/expo); no bounce/
  elastic. Don't animate layout properties; don't gate content visibility on a class-triggered
  transition (never fires on hidden tabs / headless → section ships blank).
- **`@media (prefers-reduced-motion: reduce)` is mandatory** for every animation. (This app has a
  GLOBAL killer in `packages/ui/src/styles/globals.css` — `*{transition-duration:.01ms!important}` under
  reduce — so any new transition is auto-covered; a NEW keyframe animation still needs its own opt-out.)
- Never animate an `<img>` on hover (pure AI tell).
- **Coordinated motion — the DESYNC trap (a `__orb.motion()` blind spot).** When an element slides/
  transforms, the layout it DISPLACES must move in sync (same duration/easing) or be instant — a HYBRID
  (an element gliding over `--motion-base` while the track/space it vacated snaps in `0s`) makes content
  POP while the element glides = jank. `__orb.motion()` will NOT flag this — it drops no frame, it's a
  visual desync — so verify `transition-duration` PARITY between the moving element and the container/
  track/sibling it reflows, and watch the CONTENT, not the moving element. (Fixed 2026-07-12: the shell
  panel collapse — `.shell-grid grid-template-columns` now transitions in sync with the panel
  `transform`, both `--motion-base`; before, the grid track snapped `0s` and content popped on → Corpus.)

## §5 Interaction & states

- Every interactive element: visible focus ring, keyboard operable, an accessible name.
- Provide the exits: cancel/undo/back/escape; Esc closes modals.
- Cover ALL states: **empty** (useful guidance, not just "No results"), **loading**, **error**
  (plain-language, near the source, preserves work), **success**. Confirm destructive actions; smart
  defaults; autosave/draft recovery.

## §6 Absolute bans / AI-slop antipatterns (flag on sight)

`side-tab` accent border · `border-accent-on-rounded` · `overused-font` (Inter/Roboto default) ·
`single-font` for everything · `flat-type-hierarchy` · `gradient-text` · `ai-color-palette` (generic
indigo/violet SaaS) · `cream-palette` · `nested-cards` · `monotonous-spacing` · `bounce-easing` ·
`dark-glow` · `icon-tile-stack` · `italic-serif-display` · `hero-eyebrow-chip` ·
`repeated-section-kickers` · `numbered-section-markers` (01/02/03) · `em-dash-overuse` ·
`marketing-buzzword` · `aphoristic-cadence` copy. Match-and-refuse: if you see one, it's a finding.
Many of these now also fire DETERMINISTICALLY in `pnpm snap <route> --design-audit` (origin-tagged `impeccable`;
the full adopt/adapt/reject triage incl. the rules that deliberately do NOT run here is
`reference/impeccable-adoption.md`). Two named divergences from upstream impeccable: the KICKER
voice (caps micro label + hairline rule as a section name) is RATIFIED law here (density-pass spec
§2.3, `Section.kicker`) — impeccable's kicker ban does not apply; and hairline-border+soft-shadow
is the SANCTIONED `--shadow-overlay` elevation recipe, not a tell. Copy-cadence tells (em-dash,
buzzwords, aphorisms) apply to UI CHROME COPY only — never to model/user prose in the transcript.

## §7 Nielsen's 10 heuristics — scoring rubric (0–4; honest)

`0` absent/broken · `2` partial with real gaps · `4` genuinely excellent. Score what the receipts show; this
rubric deliberately states no prior about where surfaces usually land (owner ruling 2026-09-04: the old
line that named a typical band anchored every review into it, so the total measured the prompt).

1. **Visibility of system status** — loading/save/submit feedback, progress, location, inline validation.
2. **Match system ↔ real world** — plain language, logical order, recognizable metaphors, no jargon.
3. **User control & freedom** — undo/redo, cancel, back-to-safety, clear filters, Esc from flows.
4. **Consistency & standards** — same word/action = same thing; platform conventions; visual consistency.
5. **Error prevention** — confirm destructive ops, constrained inputs, smart defaults, autosave.
6. **Recognition over recall** — visible options, labels on icons, contextual hints, recent items.
7. **Flexibility & efficiency** — keyboard shortcuts, bulk actions, accelerators.
8. **Aesthetic & minimalist** — every element earns its pixel; clear hierarchy; no clutter.
9. **Error recovery** — plain-language errors, specific problem + actionable fix, near the source.
10. **Help & documentation** — findable, contextual, task-focused, concise.

Bands (CALIBRATION VOCABULARY ONLY): 36–40 excellent · 28–35 good · 20–27 mid · 12–19 poor ·
0–11 critical. **The band NEVER gates action (owner ruling 2026-08-22): a score is calibration, not
acceptance — every issue the walkthrough IDENTIFIES gets fixed or filed with a receipt regardless of
the band, and a "mid" surface with unfixed identified issues is not done.** The inverse also holds:
do not score-chase — no re-review loops hunting points, no inventing findings to justify a number.
The FINDING LIST is the deliverable; the score is a one-line summary of it.

The score covers only active rendered surfaces. React Activity retains inactive sections in hidden DOM;
those identities do not enter visual, geometry, operability, accessibility, theme, or Nielsen denominators.
Inventory retained sections separately with `pnpm snap <route> --map --include-hidden`, use that output only
to discover coverage arms, then activate each section through its real control and score the settled,
rendered result. A full review reports every retained section as ACTIVATED+RAN or SKIPPED-with-reason.

## §8 Cognitive-load checklist (Miller/Cowan: working memory ≤ 4)

At every decision point count competing visible options: ≤4 ok · 5–7 push it · 8+ overloaded. Run the
8: single focus · chunking (≤4/group) · visual grouping · clear hierarchy · one-thing-at-a-time ·
minimal choices · no working-memory bridge across screens · progressive disclosure. Watch: wall of
options · memory bridge · hidden navigation · jargon barrier · visual-noise floor · inconsistent
pattern · context switch.

## §9 Persona red flags (walk the primary action as each — ALWAYS include Sam)

- **Sam (screen-reader / keyboard-only, low vision):** click-only with no keyboard path · missing/
  invisible focus · meaning by color alone · unlabeled fields/buttons · custom components that break
  SR flow · contrast < 4.5:1 · state changes not announced. → the ARIA-navigability section.
- **Riley (stress tester):** silent failures · error states that break layout/leak detail · empty
  states with no guidance · data lost on refresh/nav · inconsistent behavior · long strings/emoji/RTL.
- **Casey (one-handed mobile):** primary action out of the thumb zone · no state persistence · tiny/
  too-close tap targets (<44×44) · heavy assets, no lazy load.
- **Alex (power user):** no keyboard shortcuts · one-at-a-time where bulk fits · unskippable
  onboarding · redundant confirmations.
- **Jordan (first-timer):** icon-only nav (no labels) · jargon · no visible help · ambiguous next step.

## §10 Severity

`P0` blocking (cannot complete / unreadable / inaccessible) · `P1` major (fix before release) · `P2`
minor (workaround exists) · `P3` polish. Test: "would a user contact support?" → yes means ≥ P1.

## §11 Instruments — this app's introspection surface (get receipts cheaply)

Dev-gated; the app prints a pointer to `packages/client/src/lib/agent-tools.README.md` on load. Read
state in ONE eval — never scrape the DOM.

**`window.__orb`** (via `pnpm snap <route> --eval '<js>'`, which waits on `data-app-ready` itself):

| Call | Returns / use |
| - | - |
| `__orb.snap()` | one-call overview `{ ready, shell, bus, queries, perf, renders }` — start here |
| `__orb.renders()` | render heatmap `{ id, count, mounts, updates, totalMs, avgMs, maxMs }[]`, hottest-first — **churn is a real UX defect**, flag hot surfaces |
| `__orb.motion()` | `{ loafs[], cls, observedCls, virtualizedCls, nonVirtualizedCls, worstBlocking, worstShift, shifts[] }` — long-animation-frames (`blockingDuration`, `styleAndLayoutStart>0` = style/layout ran in-frame) + layout instability. **The smoothness receipt — don't eyeball jank.** Judge `nonVirtualizedCls`, not `cls` (see §11 motion) |
| `__orb.animations()` | active animations `{ target, properties, compositorClean }[]` — `compositorClean:false` (animating anything but transform/opacity/filter) = per-frame-layout **jank risk** |
| `__orb.perf()` | `orb:*` User-Timing measures `{ name, ms }[]` |
| `__orb.queries()` | TanStack Query cache `{ key, status, fetch, stale, updatedAt }[]` — loading / stale / errored |
| `__orb.bus()` | chat-bus `{ live, events }` — live subs + recent canon events |
| `__orb.shell()` | shell state: active section, panel modes, `chatOpen` |
| `__orb.ready` / `.isReady()` | promise / bool: hydrated + initial reads settled |
| `__orb.nav.*` | ACTIONS (dev-only): `section(id)` · `openModal(slot)` · `openSettings(category)` · `contextTab(name)` · `openChat(idOrTitle)` · `openCharacter(idOrName)` · `closeModal()` — call the REAL store actions; return `{ok}` or `{ok:false, reason}` (loud refusal, incl. an AMBIGUOUS title/name matching >1). snap's `--goto`/`--open-chat`/`--open-character`/`--context-tab` ride these |

Plus raw `getComputedStyle(el)` for the contrast / size / aspect-ratio math behind every visual receipt.

**`data-app-ready`** on `<html>` — the readiness gate (fires once the query cache first idles; SSE is
not a query, so it fires with the stream open). Wait on it, never network-idle.

**Console channels** (dev): `[bus]` (canon event → invalidated keys + storm alarm), `[trpc]` (query/
mutation round-trips), `[perf]` (>12ms commits attributed to a surface + >50ms long tasks) — every snap
run prints them (`console-errors` / `page-errors`); `--strict-console` reds on them.

**Probes** (Bash, own headless browser, output under `reports/` — gitignored; one call, no context
dump). **There is no browser MCP — these ARE the browser** (the chrome-devtools MCP was retired
2026-09-02, #1255; census: `docs/design/1195-devtools-mcp-retirement.md`). **How to read what they
print is the `snap-driving` skill §0** (redirect to a log and `Read` it whole; the END CARD is the verdict —
`RESULT` axes, `FINDING` rows with `evidence=` and an exact `next=` reader command, `EVIDENCE <run.json>`;
exit 2 is a REFUSAL, never a clean row); **every accepted flag, one line each, is
`.claude/skills/snap-driving/reference/flags.md`** — read it before your first probe rather than guessing a
flag. A run you already took replays browser-free: `pnpm snap --report <run.json> --problems`.

- `pnpm snap <route>` — capture + introspection flags: **`--map [sel]`** (selector map — every element
  → its stable selector; discover targets, never grep source) · **`--contrast <sel>`** (WCAG ratio,
  oklch-safe, `PASS/FAIL`) · **`--eval '<js>'`** (any in-page value, incl. `__orb.renders()`/
  `__orb.snap()` and `getComputedStyle`) · `--aria`/`--text` (a11y tree) · `--click/--force-click/--fill/ --wait-for` (interaction chain) · `--shot-of` · `--diff`/`--baseline` · `--dark`/`--reduced-motion` ·
  `--deadcss`.
  `--map --include-hidden` is a retained-section inventory, not a wider scoring mode. It may discover
  Activity/inert DOM, but no hidden row is a contrast, geometry, a11y, or Nielsen receipt. Activate the
  section, wait for its rendered settled state, then rerun the ordinary rendered-only instruments.
  **LIGHTHOUSE (#1198):** `--lighthouse <desktop|mobile>` runs accessibility + best-practices + seo
  against the SETTLED page of that very run — same browser, same tab, same device — prints the category
  scores and EVERY failed audit with node count + first three selectors, and writes `report.json` +
  `report.html` into the run slot. This is where the axe rules our own detectors do not carry come from
  (`label-content-name-mismatch`, `target-size`, composed-widget contrast). Default mode is `snapshot`
  (audits the page as your drive queue left it — correct, since every surface here is client state);
  `--lighthouse-mode navigation` RELOADS and loses the drive. Failed audits RED the run (exit 1); a
  not-ready page, a Lighthouse throw or a truncated report REFUSE with exit 2 — **a refusal is not a
  clean row.** `--lighthouse mobile` fills the same device slot as `--mobile`, so it does not combine
  with a later `--desktop`/`--viewport`/`--wide`, nor with `--cascade`.
  **REQUESTS (#1199):** `--requests [url-substring]` = the ORDERED log of every request the run's pages
  issued (method, url, status, type, declared size, timing); `--request-body <url-substring>` = one
  response body (cut at `truncatedAt=16384`). This answers "which reads did this surface issue", which
  `__orb.queries()` only half-answers — a re-read of the same route is the answer, so the log is
  ordered, not URL-keyed. An undeclared `content-length` prints `size=unknown` and an unfinished request
  `ms=unfinished` — never a fake 0.
  **NAVIGATION (the app is state-navigated, 2 URL routes — these replace click-chains):**
  `--goto <target>` (a section id like `presets`, `config:<group>`, or `modal:<slot>`; refuses
  loudly on an unknown target, exit 1) · `--open-chat <id|exactTitle|latest|current>` (refuses loudly
  on an AMBIGUOUS title matching >1 chat — pass the id; `latest` = the chat list's top row; `current` =
  the room the app is showing RIGHT NOW via the dev bridge, no list query — the right sentinel for "the
  room I just created/drove in this same browser session", and it refuses on the landing surface) ·
  `--open-character <idOrName>` (Characters section + select; same ambiguity refusal) ·
  `--context-tab <name>`.
  Nav flags and steps execute in ONE queue in true argv order (27f30e501) — a mid-chain
  `--context-tab` runs exactly where it is written, so `--goto presets --map` maps the presets
  surface in one call and `--open-chat current --context-tab rpg.game --text` reads the tab of the
  room you just opened.
  **OBSERVATION OVER TIME:** `--watch <totalMs> [--every <ms>]` — after nav+steps, screenshot + re-run
  every `--eval` each tick (per-tick PNGs + labeled eval results). THE tool for streaming turns /
  transient states — never eyeball a stream one screenshot at a time.
  **MULTI-TAB:** `--pages <N>` opens N pages in ONE shared context; step/capture flags take an
  `@<idx>` suffix (`--fill@0`, `--eval@1`; unsuffixed = page 0) — drive one tab, read the passive one,
  per-page report sections.
  **MULTI-USER CONTEXTS:** `--contexts <N>` (2..4) opens N ISOLATED browser contexts (own cookies —
  unlike `--pages`, which shares one context's auth), each logged in as a DIFFERENT dev user, for
  host-vs-member views / presence / visibility-floors in one run. Same `@<idx>` targeting as `--pages`
  (context 0 unsuffixed); shots suffix `-u<idx>`. `--as <handle>` picks which user a single context
  (`--contexts 1`, the default) logs in as. **This ALWAYS targets the multi-user FIXTURE stack**
  (`tooling/src/stack/multi-user-fixture.sh`), never the shared :5173/:8788 (always single-user, no
  login form) — bring the fixture up yourself first: `pnpm fixture up` (a SIDECAR on its own offset
  pair, server :8790 / vite :5175, so it coexists with the shared stack; `down`/`status` manage it).
  A `--contexts N` bigger than the fixture's seeded roster (2 today: owner, member), or the fixture
  down/env-pin-mismatched, REFUSES loudly (`FIXTURE REFUSED …`) with the exact remedy line — never a
  silent fallback to the shared stack. Full flag doc: `pnpm snap --help` (source: `tooling/src/snap/contract/help.ts`); detection/
  credential logic: `tooling/src/snap/ops/fixture.ts`.
  **VIEWPORT TOGGLES:** `--mobile` (real iPhone 14 Pro Max emulation — 430×932, DPR 3, touch +
  `pointer: coarse`, so hover-reveals go always-visible and the rail becomes the bottom tab bar) ·
  `--desktop` (the 1280×800 default, explicit) · last of `--mobile`/`--desktop`/`--wide`/`--viewport` wins.
- `pnpm snap --perf` (responsiveness) / `pnpm snap --cpu-profile` (CPU profile) · `pnpm snap <route> --design-audit` (the deterministic defect
  scanner — every registered rule in `DESIGN_AUDIT_RULES` (`tooling/src/ui-audit/contract/rules.ts`),
  grouped by the tuple's `family` axis (a11y · color · decor · media · ornament · quality · structure ·
  typography), each carrying one of two ORIGIN tags: the house rules (`origin: "orbweaver"`) plus the
  impeccable-adapted set (`origin: "impeccable"` — gradient-decoration tells, type-ramp legibility
  floors, text overflow, clipped positioned children, script errors, taste tells like
  icon-tile-stack/gray-on-color). **Cite the registry, never a remembered count**; adoption triage:
  `reference/impeccable-adoption.md` in this skill dir).
- **Every rule also has a DECIDED POPULATION RUNG, and a clean row is not the same claim as a clean
  verdict.** `pnpm snap <route> --design-audit` prints a `POPULATION <rule> candidates=… judged=… affected=…
  withheld(…) excluded(…)` line per rule, and the run's `population-verdict=` is `complete` only when
  nothing was withheld. `withheld` = the rule applied and the instrument could not judge it → the run
  is **NO VERDICT** and its findings are partial; `excluded` = measured facts proved the rule
  inapplicable (a sanctioned glow carrier, a role this lens does not govern, an `object-fit: cover`
  crop) → complete evidence. Which rule sits at which rung, and WHY, is one table in
  `tooling/src/ui-audit/lib/collect.ts`'s header (owner ruling 2026-09-01: a table, not a gate) with
  the mechanics in `lib/population-strategies.ts`; a rule with no population row is a rung-1
  page-singleton or a walker-proven carrier, which that table names individually. **Never read a
  `findings=0` as clean without reading `population-verdict=`.**
- **What the 2026-09-01 wave added, so you do not re-file it by hand.** Machine-checked now:
  **state paint** under force (`hover-contrast`, and the glow census reading `::before`/`::after`
  layers while the subject is held in its forced state); the **device-pixel grid / crispness laws**
  (`off-grid-text` Law 4, `promoted-layer-offset` Law 3, `off-grid-transform` Law 2 — see
  `docs/design/integer-line-boxes.md`); **density-tier parity** (`tier-drift` — the resolved pixel vs
  what `packages/ui/src/styles/tiers.css` sanctions for the surface's declared tier, a divergence no
  source-side scan can see); the **accessible-name source set** (`aria-name` reads the browser's own
  `el.labels` association, so a control named only by `<label for>` is no longer a false P1); and the
  **placement-collision arms** (`truncated-to-nothing`, `obscured-target`, `headline-overhang`,
  `inline-padding-leak`). Per-SEED ink contrast is NOT a design-audit rule and never was: the
  `seed-theme-ink-contrast` gate proves every text token clears AA-normal in every shipped seed
  palette statically, with no browser — so a driven audit only ever sees the seed it rendered.
- **The three unmeasured axes (2026-09-01, `ops/walker/RULE-AUTHORING.md` §"#19").** One rendered
  verdict is a function of three independent axes and a pass on one is not a pass on the others:
  the **panel** axis (`--panels`, `tooling/src/_shared/panel-presets.json` — which surface was
  visited), the **variant** axis (`tests/ui/variant-arm-matrix.*` — which `tv()` arm rendered), and
  the **mechanism** axis (does the rule's SELECTOR match how this codebase expresses the thing —
  the mechanism-match table in `RULE-AUTHORING.md`, which is the doc to read before trusting or
  authoring any detector rule).
- **The DRIVE axis (#1059): a bare run measures the REST state, and some cohorts only exist once you
  drive the surface.** Characters' library toolbar carries two toggles that are both OFF at rest, so
  `selection-idiom` has no selected twin there and the run is honestly NO VERDICT; the driven run
  `pnpm snap characters --design-audit --click '[aria-label="Select multiple"]'` gives that cohort its twin and
  the rule reaches a verdict. Both runs are real — the bare one is what a visitor lands on — so the
  report DECLARES which regime it measured (`drive=` on the SHELL STATE line, `SURFACE-AXIS drive`,
  `drive-state=`/`drive-axis=` on the RESULT line). Never compare a driven population to a rest one.

Read `__orb` and any computed value via `snap --eval` / `snap --contrast` — a **Bash** call.

**Probe footguns (pay these once, not every review):**

- **Start the stack FIRST** — `pnpm stack start` (server :8788 + vite :5173); snap gates on :5173. A
  "vite not up" / hanging snap = the stack isn't running. `pnpm stack status` to check, `stop` to kill.
- **`snap --eval` AUTO-INVOKES a function literal** — pass a BARE arrow `'()=>{…; return x}'` WITHOUT a
  trailing `()`. Writing `'(()=>{…})()'` double-invokes → `EVAL ERROR: … is not a function`. A plain
  expression (`'document.title'`, `'__orb.motion()'`, `'getComputedStyle(...).x'`) needs no wrapping.
- **The KEYBOARD WALK is a `snap` call** (corrected 2026-08-16; the text before that claimed Tab was
  dead). Two true facts:
  - Chromium does NOT promote a scripted `.focus()` to `:focus-visible`, so `--eval el.focus()` still
    cannot verify a focus ring. That part was always right.
  - `--key` has TWO forms, and only one walks. **`--key Tab`** (bare, no `=`) presses the page keyboard
    WITHOUT changing focus — N of them walk N stops, inside a Base UI focus trap included.
    `--key 'selector=Key'` FOCUSES the selector first and then presses, so five of THAT form re-anchor
    five times and never move: that is the whole reason "Tab never advances focus" was believed.
  - `--eval` is in the same argv-ordered queue as the keys, so ONE call reads focus at every stop:
    ```
    pnpm snap / --no-shot --goto config:appearance \
      --eval "$FOCUS" --key Tab --eval "$FOCUS" --key Tab --eval "$FOCUS" --key Escape
    #  FOCUS='(()=>{const a=document.activeElement;return a.tagName+" | "+(a.getAttribute("aria-label")||a.textContent.trim().slice(0,40))+" | fv="+a.matches(":focus-visible")})()'
    ```
    Measured settings order: Close → Search settings → the 16 category buttons → the pane's controls,
    `:focus-visible` true at every stop. **End a dialog walk on `--key Escape`, never Enter** — focus
    starts on Close and Enter dismisses (and in an editor, Enter SAVES).
- **`design-audit` tap-target / aria-name findings are frequently FALSE POSITIVES** — three measured
  classes, all now handled by the walker but worth knowing when you read an older report:
  1. Base UI mints hidden 1×1 native inputs (`aria-hidden`, `tabindex=-1`) for Select/Slider, and Switch
     roots carry their name via `aria-labelledby` (not textContent).
  2. **The box is not the hit area.** `@orb/ui` Button's `size="inline"` / `size="glyph-*"` variants carry
     a pointer-conditional touch-target `::after` (`packages/ui/src/primitives/button/variants.ts:16-20,
     :76-82`), so a 25×15 border box can own a 45×45 hit area. Probe with `elementFromPoint` at the
     centre AND at edge offsets — does the control still own the point? — never `getBoundingClientRect`.
     Box math minted 10 of 13 "sub-target" findings in one audit.
  3. **Off-viewport hosts are phantoms.** One census measured a detail panel sitting off-canvas at x=431
     on a 430px viewport. Check the host is on screen before you measure anything inside it.
     VERIFY each with `--aria` (the real accessible name) / `--map` before reporting; never forward the raw
     count. (An early full pass: 52 such findings, all false.)
- **`nested-card` was the noisiest rule on the tree** — 26/26 false positives on home as recently as
  2026-08-16, all of them border+radius+bg INTERACTIVE controls inside a card, which chrome-diet CD1
  explicitly sanctions ("border+radius+bg only on interactive islands / elevated surfaces"). The walker
  now excludes interactive islands and pill geometry (home: 26 → 0). If you are reading a report from
  before that fix, treat every `nested-card` row as unproven until you have located it — and note the
  selectors in those reports are frequently UNLOCATABLE (fifteen findings once shared the identical
  `button.group:nth-of-type(1)`; the walker emits ancestor PATHS now).
- **A tab strip's semantics depend on WHICH tablist you are in.** An admin-rail tab correctly reads
  unselected while the CONTENT tablist carries the selection. Follow `aria-controls` / `aria-labelledby`
  back-references to identify the tablist before declaring tab semantics broken.
- **`snap --aria` is the ONLY trustworthy structure receipt, and any pre-2026-09-02 grouping/landmark
  finding taken off a devtools a11y snapshot is unproven.** The retired MCP's `take_snapshot` FLATTENED
  structure — verified 2026-07-25, a chat room with 12 `role="article"` message nodes in the DOM showed
  ZERO articles in its tree. `--aria` is Playwright's ARIA snapshot and does not; cross-check the DOM
  via `--eval` when in doubt, and re-take any inherited "missing landmark" row before forwarding it.
- **CLOSED 2026-09-01 — hover-state contrast IS checked now (`hover-contrast`, P1).** This bullet used
  to read "KNOWN GAP, we carry no hover-state contrast check"; that is false on the current tree. The
  gap was real and it was missed by the upstream adoption triage BY CONSTRUCTION rather than by
  oversight — impeccable's `checkHoverContrast` reuses the existing `low-contrast` finding id, so it
  carried no separate registry row and a rule-by-rule id diff could never surface it (the durable
  lesson: **when re-syncing against upstream, diff the exported MECHANISMS, not just the id registry**).
  What shipped: a dedicated CDP forced-state pass (`ops/hover.ts` + `ops/hover-walker.ts`) that forces
  each subject, re-reads the paint, and RELEASES the state, with `lib/checks-hover.ts` judging the
  forced pair only when it differs from rest — so a control already failing at rest stays `contrast`'s
  row and is not double-reported. It carries its own denominator (`hoverContrastPopulations`), so an
  absent pass (coarse pointer, a break) publishes NO row rather than a clean-looking zero, and a
  subject whose `:hover` could not be forced is WITHHELD out loud. **The mechanism lesson generalises:**
  Base UI drives its own interaction state through `data-*` attributes, not CSS pseudo-classes, so the
  state-paint census recognises BOTH spellings through one shared predicate
  (`ops/walker/state-paint.ts`) — a `:hover`-substring scan is blind to most of this app's state paint,
  and an escaped Tailwind class name (`.dark\:hover\:bg-*`) contains the substring `:hover` without
  being a pseudo. Row 3/4/5/7 of `RULE-AUTHORING.md`'s mechanism-match table are the receipts.
- **The general lesson behind two corrections of 2026-09-01 (the `--shadow-glow` rationale in §11's
  effect-axes list BELOW, and the glow/radial parser note in `side-eye.md`, not in this file): a
  documented reason why an instrument skips something is a CLAIM, and a claim decays.** Both were written down once
  as settled fact and neither was re-measured for weeks/months while findings were filed (or not filed)
  on the strength of them. When a skip is load-bearing for a finding you are about to NOT file, re-measure
  the skip before trusting it; a live probe costs one Bash call, a stale rationale costs a defect nobody
  ever checked for.

### The appearance EFFECT axes (2026-07 additions — know they EXIST, don't slop-flag them, verify each)

**WHERE THE HANDLES ACTUALLY LIVE (re-derived against the live DOM 2026-08-16 — this list named three
root attributes and two of them were wrong; a reviewer who greps the root for them concludes the axes
are unbuilt):**

| Handle | Where | Present when |
| - | - | - |
| `data-theme` | `<html>` — e.g. `data-theme="hearth"` | always |
| `data-blur-panels` · `data-blur-composer` · `data-blur-modals` | `<html>`, valueless | per enabled blur surface |
| `data-shadow` · `data-justify-body-text` · `data-theme-colorization` | `<html>`, valueless | when the setting is on |
| `data-texture` | `<html>` | ONLY when `surfaceTexture !== "none"` — it is REMOVED at the default, so its absence is the default, not a missing feature (`use-appearance-root-effects.ts:74-78`) |
| `data-app-ready` | `<html>` | after the initial reads settle |
| `--font-scale` · `--blur-strength` · `--reading-line-height` · `--reading-letter-spacing` · `--reading-paragraph-spacing` · `--reading-name-scale` · `--reading-body-scale` | `<html>` inline `style` | always |
| **`data-elevation`** · `data-density` · `data-list-mode` · `data-context-mode` · `data-focus-mode` · `data-reduced-motion` · `data-has-bg-image` | **`.shell-grid`, NOT the root** (`app-shell.tsx:247-255`) | always (`data-has-bg-image` only with a background image; it has one production writer) |

Read them with `snap --eval '[...document.documentElement.attributes].map(a=>a.name+"="+a.value)'` and
`snap --eval '[...document.querySelector(".shell-grid").attributes].map(a=>a.name+"="+a.value)'` — never
from memory, and never assume a handle is on the root.

`data-has-bg-image` selector spelling is semantic, not style noise: a bare selector reaches descendants of
the grid writer, `.shell-grid[data-has-bg-image]` asserts the writer itself, and the existing sibling
combinator reaches the themed portal root. Do not normalize those three reach classes. The avatar hairline is
deliberately grid-only; portalled dialogs own their polarity-aware popup backing and owe a rendered
dialog-avatar-over-art acceptance pin.

New user-tunable, token/accent-driven effects. Check they render right AND aren't mistaken for AI-slop
(they're intentional + rationed). Toggle an axis via the Appearance settings pane, or by writing the
attribute at its REAL host; then verify:

- **`elevation: flat | ramp | glow`** (`.shell-grid[data-elevation]`) — `glow` = layered shadows + inner
  top-highlight on panels/cards. All three values must switch cleanly (no cascade residue when reverting).
- **`surfaceTexture: none | grain`** (root `data-texture`, absent at `none`) — opt-in SVG-noise dusting (soft-light ~0.04)
  on chrome/cards ONLY, NEVER message prose (reading-surface rule); must `display:none` under
  `prefers-contrast: more`.
- **`--shadow-glow`** — the rationed Ember accent glow on selected/active (media-grid `data-selected`,
  avatar `ring=accent`, active rail item, focused composer). It lives on a `::before` LAYER, the house
  convention, chosen because it lets the glow animate opacity independently of any ring/shadow the
  element also carries. **This entry used to claim the `::before` layer exists because a raw
  `box-shadow: var(--shadow-glow)` on the element "clobbers the focus ring, WCAG 2.4.7." That was a
  disproven rationale, corrected 2026-09-01.** Measured live: Tailwind v4 composes `ring-*` and a
  utility-form glow through separate custom properties in one `box-shadow` value, ring layers first, so
  the ring paints on top and nothing is clobbered; confirmed on one element carrying
  `shadow-glow ring-2 ring-ring ring-offset-2 ring-offset-background` verbatim (computed `box-shadow`
  with both present includes the ring pair, then the glow pair, in that order). The clobber is real for
  exactly one shape: a raw `box-shadow: var(--shadow-glow)` written directly on the ELEMENT in CSS, which
  overwrites the whole property rather than composing. **There is currently NO such site in the tree**, and
  a first pass claimed there was one because it read a grep hit's line number without reading the enclosing
  selector: `shell.css:405` sits inside `.shell-rail-button[data-active]::before` (the rule opens at :398)
  and is therefore already the sanctioned layered form; the file even carries the reasoning at :397. All
  four `--shadow-glow` sites are correct today: three utility-form (`media-grid`, `avatar`,
  `composer-drop-target`) which compose, and this one `::before`. Before filing a ring-clobber finding,
  read the ENCLOSING SELECTOR, not the declaration; a property/value grep cannot tell the two shapes apart,
  and both of the wrong calls made against this rule so far came from exactly that shortcut.
  **Detector coverage, so you know what a clean pass does and does not cover:** `glow-shadow` reads the
  ELEMENT's own computed `box-shadow` only (`census-decor.ts:253`), so a `::before` glow is invisible to
  it — the sanctioned layered form cannot false-positive there, and an UNSANCTIONED copy of that same
  pattern cannot be caught there either. The radial census does sweep `["", "::before", "::after"]`
  (`census-decor.ts:281`), so the two families are asymmetric; judge a layered glow by eye.
- **`--shadow-overlay`** — 4-layer float elevation (edge hairline + inset top-highlight + contact +
  ambient). No visible white line, no banding.
- **Gradient border rings** — `[data-cta]::after` / `[data-selected]::after` / `[data-active]::after`,
  accent-tinted, radius-safe, must COMPOSE with the fill (not clobber `bg-primary`/`shadow-*`).
- **Spotlight** — `media-grid-cell::before` radial that follows the pointer at LOW alpha (~0.18, never a
  wash over the thumbnail); GUARDED `@media (pointer: fine)` + `prefers-reduced-motion: reduce → display:
  none`. Verify both guards (emulate coarse pointer + reduced-motion → gone).
- **Ambient aura** — `empty-state-decoration::before` radial behind the hero glyph ONLY; must never lower
  the contrast of any TEXT (geometry: the falloff stops before the title).

### Motion & animation verification (when the surface animates/transitions/scrolls)

Before the first checkpoint, await `window.__orb.motionFlaggersSettled()` and then reset checkpoint evidence.
That barrier covers the initial stylesheet drain and has permanent late-defined-silent / never-defined-reported
controls. If the review injects a stylesheet after settlement, it owes a new per-drain marker/barrier; do not
reuse the initial promise as proof that later CSSOM work has drained.

Smoothness is a **receipt**, not a vibe — the eye can't reliably tell 60fps from 45fps, and a headless
review sees no motion at all. When reviewing anything animated (entry/exit transitions, hover motion,
drawer/panel slides, scroll, immersive chat modes), read the numbers instead of guessing:

> **CLS / motion receipts are taken WITHOUT `--probe`. Full stop.** `--probe` injects
> `*{animation:none!important;transition:none!important}` from DOMContentLoaded (`snap.ts` PROBE_CSS_SCRIPT)
> — which kills the FLIP animations whose whole job is to make a track change CLS-free
> (`shell.css @keyframes shell-list-push-in`, stamped by `use-list-track-flip.ts`). Under `--probe` the
> harness MANUFACTURES layout-shift findings; a 0.2295 theme-scope shift was filed off exactly this on
> 2026-08-16. snap now prints `PROBE-NEUTERED-MOTION` and stamps `motion-evidence=PROBE-NEUTERED-MOTION` on the
> RESULT line for every `--probe` run — if you see it, the motion numbers in that run are void.

- **Read `__orb.motion()` and `__orb.animations()`** (`pnpm snap <route> --eval '__orb.motion()' --eval '__orb.animations()'` — one Bash call). Trigger the motion first (the interaction, or just load a route with entry
  animation), then read. Flag, each a finding:
  - a LoAF with **`styleAndLayoutStart > 0`** in the window — style/layout ran *inside* the frame (a
    forced reflow / a non-compositor animation): the jank signature.
  - **`worstBlocking > 50ms`** — a main-thread block long enough to drop frames / stall input.
  - **`nonVirtualizedCls > 0.1`** — layout shifting under the user (content jumping as it loads).
    **Read the NON-virtualized total, never the raw `cls`** (issue #109, 2026-08-16): the instrument
    classifies virtual-row reconciliation (`shifts[].virtualized`) and `cls` still includes it, so a long
    thread scores ~0.26 of pure message-list settling that NO app fix can move. `virtualizedCls` is the
    share being excluded and `cls` is still printed — cite all three, gate on the third.
  - any animation with **`compositorClean: false`** — it animates a non-`transform`/`opacity`/`filter`
    prop (width/height/top/margin/…), i.e. a per-frame layout pass. Cross-refs §4 ("don't animate
    layout properties"): name the `target` + the offending `properties`.
- **Deep audit — `pnpm snap <route> --motion [sel]`** for the ground-truth **Percent
  Dropped Frames** (CDP trace, 4× CPU throttle so the budget is real). It prints a `PASS/FAIL` against
  the budget below plus the LoAF/CLS/compositor-clean detail in one Bash call. Its CLS line prints all
  three numbers labeled — `raw … · virtualized … · non-virtualized …` — and the RESULT line carries
  `cls-raw` / `cls-virtualized` / `cls-non-virtualized`; **only the last one is in the verdict**. Note:
  the dropped-frame % is only fully trustworthy headful (`--vnc`) — headless has no real vsync;
  LoAF/CLS/blocking are the headless-reliable signals.

### The PROD-BUILD CLS arm — and the declared limit on Lighthouse's mobile CLS (#836)

**Lighthouse mobile CLS on `/` is NOT reproducible by our probes, and the dev build is not the reason.**
Measured 2026-08-30 against a real prod bundle served off-band: Lighthouse mobile reported **0.122** while
the same page's own buffered layout-shift buffer reports **0.0293** at 4× CPU and **0.0305** under
`--mobile --network slow-4g --cpu-throttle 4`, both with ONE dominant 0.0293 shift and the rest under
0.001. So a Lighthouse mobile CLS in the 0.1 band with our own arms clean is a **declared limit** — cite
both numbers and do not file a fix row off the Lighthouse figure alone.

The recipe, when a prod-build receipt is actually needed (~25s build + a server boot):

1. `pnpm --filter @orb/client build` in YOUR worktree (~25s; writes `packages/client/dist`).
2. Boot the REAL prod entry off-band — never `vite preview` (`vite.config.ts` has no `preview.proxy`, so
   the SPA would have no `/api` at all) and never on `:8788` (that is main's dev stack):
   `PORT=8790 BIND_HOST=127.0.0.1 NODE_ENV=production ORB_ENV_NO_FILE=1 OWNER_HANDLES=… CREDENTIALS_KEY=…
   DATABASE_URL=file:<a COPY of data/orbweaver.db> ASSETS_DIR=… ENGINES_POSTURE=adopt-only
   CLIENT_DIST_DIR=<wt>/packages/client/dist node packages/server/src/entry/index.ts`.
   **`BIND_HOST` is not optional**: production binds EVERY interface by default
   (`foundation/env/bind.ts`), and this box is shared. `CREDENTIALS_KEY` is a DB-BOUND key — without it
   `/healthz` stays 503 on `credentials_key_mismatch` (the same key set `snap --isolated` inherits).
3. `pnpm snap / --base http://127.0.0.1:8790 --mobile --network slow-4g --cpu-throttle 4 --no-shot --eval …`
   — `127.0.0.1`, not `localhost` (the server binds v4; only vite is the v6 case).

Three instrument facts the eval must respect on a prod build:

- **`window.__orb` does not exist in a production bundle** — `installAgentDebugHandle` early-returns under
  `!IS_DEV`, so `__orb.motion()` (and its virtualized-share classification) is unavailable. `data-app-ready`
  IS set in prod (`installAppReadySignal` is not gated).

- **`performance.getEntriesByType("layout-shift")` returns `[]` in chromium** and logs *"Deprecated API for
  given entry type"* — a silent zero that reads exactly like a clean surface. The only reader is a
  `PerformanceObserver` with `buffered: true`; give it a settle window that spans the whole boot, because
  under `slow-4g` the app's OWN readiness ceiling hands over `data-app-ready="degraded"` well before the
  page is done.

- **The dev build cannot take the network arm at all**: at `slow-4g`, `/` on `:5173` issues **447** requests
  and `page.goto` blows past 90s. Prod issues 12. Throttle CPU alone against `:5173`.

- **Thresholds** (name the number in the finding): frame budget **16.7ms** · LoAF blocking **≤50ms** ·
  INP **≤200ms** · **non-virtualized** CLS **≤0.1** · animations must be **compositor-clean**. A breach on
  a reading/immersive surface is ≥ P1 (jank on the primary experience); polish motion elsewhere is P2–P3.

## §12 Repo map — where things live (stop re-discovering this every review)

**Navigation is CLIENT STATE, not URLs.** The router has exactly TWO routes (`/` and `/login` —
`packages/client/src/routes/router.tsx`); entity ids never enter the address bar. Sections, modals,
settings panes, context tabs, and the open chat are all shell state — so "go to X" means driving the
UI (or `snap --goto`/`__orb.nav` if present; check `pnpm snap --help` (generated from `tooling/src/snap/contract/help.ts`)). Snapping
`/some-path` does NOT navigate anywhere — it renders the home shell under a misleading PNG name.

| What | Where |
| - | - |
| Global CSS (incl. the reduced-motion killer) | `packages/ui/src/styles/globals.css` |
| Theme CSS + tokens — **GENERATED, never hand-read as intent** (D71: seed value-sets in json) | `packages/ui/src/styles/theme.css` · `packages/ui/src/tokens/index.ts` |
| `@orb/ui` primitives (the ONLY elements features may use; D44 media primitives) | `packages/ui/src/primitives/` (+ `layout/`, `content/`, `markdown/`, `stream/`) |
| Shell vocabulary — `SECTION_IDS` · `MODAL_SLOT_IDS` · `SETTINGS_CATEGORY_IDS` · panel modes | `packages/client/src/state/shell-store.ts` |
| Section registry (rail entry · panel defaults · context model per section) | `packages/client/src/state/section-registry.ts` |
| Feature layout (per domain: `components/` `surfaces/` `hooks/` `lib/`) | `packages/client/src/features/<domain>/` — chat lives at `features/chat/` |
| Test ids | `packages/client/src/lib/test-ids.ts` |
| In-page introspection manual (`__orb`) | `packages/client/src/lib/agent-tools.README.md` |
| **UI LAW** — region map + interaction physics (§4.2), the ten UX rules (§4.3) | `docs/architecture/core/UI-Architecture-and-Layout.md` |
| Client architecture law (lockdown — component/registry discipline) | `docs/architecture/core/client-architecture-lockdown.md` |
| The constitution + doc index | `docs/architecture/core/AGENTS.md` |
| D-ledger (cite the D-number a finding breaks) | `docs/architecture/core/Core-Laws-and-Precedents.md` → `Core-Path-Registry.md` |
| CTs (component tests) — repo root, NOT packages/\*\* | `tests/client/**` (e2e: `tests/e2e/**`) |
| Probe tool manuals — **authoritative, read them fresh; this skill does not duplicate flags** | `pnpm snap --help` (source: `tooling/src/snap/contract/help.ts`) · the `--design-audit` group of `pnpm snap --help` |
| Server truth for any chat surface | `GET :8788/api/_debug/db/chat/:id` · `/api/_debug/db/chats` (LIST) · `/api/_debug/db/characters` (LIST) · `/api/_debug/errors` · `/api/_debug/db/integrity` |

**Seeding + enumeration (stop re-deriving this):** enumerate ids straight from the harness —
`GET /api/_debug/db/chats` (`{id,title,participantCount,messageCount,updatedAt}` per chat) and
`GET /api/_debug/db/characters` (`{id,name,handle,createdAt}`) — no more re-deriving from the query
cache. To SEED a SMALL fixture, **drive the UI, never hand-roll tRPC mutations** — you are the UX
reviewer and the create journey is itself review surface: `--goto chats` lands on the LANDING pane →
click a character quick-pick → the draft room opens → send one message → the draft COMMITS. Group chats:
add members via the Members-section affordances (the character bar + the add doors; the shipped
strings still read "Cast"/"Saved casts" until #902 lands the #901 Fork-1/2 rename to
Characters/Saved rosters — review against the RULED word, report the shipped one). For a HEAVY fixture the UI can't produce in reasonable
calls (long transcripts / compaction / virtualization looks), run `tsx scripts/dev/seed-chat.ts --messages 120 --characters 3 [--title "…"]` — it writes N deterministic numbered rows through the
canon-safe bulk seam (restart the stack or seed a fresh DB so the live connection sees it; see the
script header). Reach a chat by `--open-chat <id|exactTitle|latest|current>` (it REFUSES an ambiguous
title — pass the id; `current` = the room this browser session is showing now) and a character by
`--open-character <idOrName>`. The DB on the dev stack is DISPOSABLE. If your
brief handed you fixture ids, trust them before spending calls rediscovering.

**Two-stacks trap:** the dev stack (:5173/:8788) and the `--isolated` snap stage (:5273/:8888) have
SEPARATE DATABASES — fixture ids from one do not exist in the other, and "the seeded chat is gone"
usually means you're on the other stack. Check which base you're driving before concluding data loss.

**The bottom-right ❗N ⚠M chip is vite-plugin-checker's overlay badge** — tsc/ESLint diagnostics for
the dev build (owner-corrected 2026-07-25; NOT TanStack devtools — that shell is bottom-LEFT,
hover-hidden). Three hard-won facts:

- **Read the counts from `.cache/stack/client.log`** (the checker prints full diagnostics there). Do
  NOT probe the badge with `--eval` DOM queries — it renders in a SHADOW ROOT; `querySelectorAll`
  returns nothing and lies "no badge".
- **The long-running checker worker GOES STALE after cross-package type changes** (a new contracts
  field read as `any` produced 5 phantom strict-boolean-expressions errors, 2026-07-25). On a
  quiesced tree where `pnpm check` is green but the badge is nonzero: restart the stack FIRST; if the
  count survives the restart it is real.
- Mid-multi-lane flight it counts sibling churn — attribute like any whole-tree signal. Separate
  instruments for separate questions: `/api/_debug/errors` = server truth · `__orb.queries()` =
  query-cache truth · this badge = compile/lint truth (fresh-worker only).

## §13 The blunt-taste + IA lens (mandatory — the call no instrument makes)

Instruments measure; YOU judge. For every surface driven, deliver the human verdict in plain words:

- **Does it look like shit?** Say so, plainly, and say WHY the eye reads it that way: cramped ·
  cluttered · unbalanced (one side heavy) · generic/template-y · washed out · too dense · too empty ·
  misaligned rhythm · elements fighting for attention. The receipt is the screenshot + the specific
  description — no ratio required. "Fine" is also a verdict; deliver it with the same confidence.
- **Does it flow weird?** Walk the surface as a task, not a checklist: does the eye land where the
  work starts? Does the action you'd want next sit where you'd reach for it? Do related things sit
  together and unrelated things apart? Does anything appear/move/reflow in a way that breaks the
  reading order?
- **One home per concept — the IA single-homing rule (the UX twin of the codebase's single-homing
  law).** Flag on sight: the same setting or concept reachable/editable in TWO places · two surfaces
  doing the same job with different vocabularies · duplicated affordances for one action in one view ·
  a control far from where its effect is visible · the same information rendered twice with different
  values possible. More than one home for a concept is a defect, not a convenience.
- **Is it intuitive COLD?** The 5-second test: from the screenshot alone, could a first-timer name
  what this surface is for and what to do first? If YOU had to read source to understand a control's
  purpose, a user has no chance — that's a finding, not a research note.

These verdicts are ALWAYS in scope, focused mode included — the scope discipline bounds WHICH
surfaces you drive, never whether you judge the ones you drove. File them BROKEN when they block or
mislead, UGLY when they're taste — but file them.

## §14 The shell anatomy — Discord's bones, our nouns (LAW: `UI-Architecture-and-Layout.md` §4.1–4.3)

You are reviewing surfaces INSIDE a fixed four-region shell. Judge every surface against this
geography; a surface inventing its own geography is a finding, not a style choice.

```
[ TOPBAR (chrome: reopen affordances · ⌘K · bell · fullscreen — the topbar.trail registry) ]
[ RAIL | LIST | CONTENT | CONTEXT ]
```

- **RAIL** (left, ~56px icon column) — WHICH facet. **TEN sections is the current sanctioned count**
  (a running tally, not a fixed ceiling — each addition carries its provenance) and ten is the live
  count — the rail is FULL, not under-filled. Law: `UI-Architecture-and-Layout.md:190` — *"TEN sections
  (D121 amended D62 P6's seven — Presets stays in the rail, Connections lives in Settings per D66;
  `config` … was added at the config rail's R1 and `worldInfo` LEFT at R2 … `databank` … was added by
  DATABANK S1 under owner ruling D-0/Arm A; `extensions` … was added at plugin-ui-plane U5 (#679, §4.5b))"*.
  The live tuple is the truth:
  `SECTION_IDS = ["home","chats","characters","corpus","config","extensions","databank","presets","refinery","analytics"]`
  (`packages/client/src/state/section-ids.ts:18`, re-exported by `shell-store.ts`), then
  Theme/Settings/Identity at the foot. **This entry said "seven is the CEILING" until 2026-08-16 and
  "NINE" until 2026-08-30, and each time nearly minted a false structural P1 against a rail that is
  exactly at its sanctioned size.** Counting ten icons is not a finding; an ELEVENTH section, or a
  section not in that tuple, is — and the first check is the tuple + its provenance comment, not this
  entry's number.
  Facets of ONE world, not separate servers — cross-section jumps route through store actions.
- **LIST** — FINDING. The section's collection: header band → search → rows. Collapsible side panel,
  per-section defaults.
- **CONTENT** — DOING. The fluid hero: the artifact you're in (chat room, editor, dashboard). Nothing
  selected ⇒ a designed landing/teaching state, never an empty room.
- **CONTEXT** — detail + config OF CONTENT's active artifact, and it CHANGES WITH the section/artifact
  (chat ⇒ the Members/Overrides/Group/Preview/Injections tabs; character ⇒ activity+actions; preset ⇒
  usage/bindings). Closable. **Never navigation** — actions ON the artifact only.

**The physics to enforce (violations are findings, cite §4.2):**

1. LIST selection drives CONTENT; CONTEXT follows CONTENT.
2. **Modals are for interrupts and pickers ONLY** (new-chat picker, add-member, theme, settings,
   account, ⌘K). **Settings IS a modal** — not a section, not a pane. Section content NEVER lives in
   a modal; it's a CONTEXT tab or a CONTENT state.
3. **Nothing replaces the three main panes.** A feature that mints its own frame, hijacks the pane
   geometry, adds rail sections past the sanctioned tuple (`section-ids.ts`), or full-screens over the shell is the EXACT abuse class
   the rollback burned down (main-era rpg/hubs grew the shell 7→10 sections + bespoke modals). Flag
   any new geography on sight — the shell is invariant; sections swap what FILLS the panes.
4. One `primary` action per region at rest · chrome quiet/content loud (accent ≤10% of viewport) ·
   same action = same home + same label everywhere · rail-switch away and back restores the section.

When judging "does this flow weird" (§13), this anatomy is the baseline: finding happens in LIST,
doing in CONTENT, artifact config in CONTEXT — a task that bounces the user across regions or parks
a concept in the wrong region flows weird BY LAW, not just by taste.

## §15 The design-verb vocabulary (adapted from impeccable's 23 commands — Apache-2.0, pbakaus/impeccable; triage + attribution: `reference/impeccable-adoption.md`)

A shared vocabulary so a review can PRESCRIBE in one word and a fix lane knows exactly what that
means HERE. Each verb is bound to OUR law and OUR instruments — a verb is never a license to invent
values (tokens only, tiers resolve spacing/radius, the theme pipeline owns color). When a report
uses one of these verbs, it names the target surfaces and the receipt that will prove the verb
landed. Design-system facts these verbs bind to: `reference/design-context.md`.

| Verb | Means here | Bound by | Receipt that proves it |
| - | - | - | - |
| **critique** | the Track A method — Nielsen §7, cognitive load §8, personas §9, taste §13 | this whole skill | the review itself + screenshots |
| **audit** | the deterministic scan + measured a11y/perf pass | P0–P3 (§10) | `snap --design-audit` JSON + `snap --contrast/--aria/--motion` |
| **polish** | kill micro-defects: alignment, off-step spacing, inconsistent states | density tier map (island pad/radius are TIER-resolved, never picked) | before/after `--shot-of` + computed padding/radius equal to resolved tokens |
| **quieter** | reduce intensity: strip unsanctioned glow/gradient/motion, demote competing focal elements to ONE (CD3), accent back under ≤10% of viewport | CD1–CD3 + UX rule 4 (chrome quiet/content loud) | design-audit glow/radial/stripe rules clean + before/after shots |
| **bolder** | spend the ONE focal slot deliberately (CD3 still holds) — a stronger voice step, the sanctioned accent carriers — never new raw values or a louder palette | tokens-only + CD3 + owner theme (D71) | shots + the focal element named; design-audit still clean |
| **distill** | remove elements/duplication; read-only groupings lose their boxes (CD1) | §13 IA single-homing; empty states are LOAD-BEARING — never distill them away | element-count delta + shots; the §13 two-homes list emptied |
| **layout** | fix rhythm/grouping/hierarchy within the tier map's steps | density §3.1 table + §14 shell anatomy | computed gaps equal to resolved spacing tokens |
| **typeset** | voice discipline: right voice per role (kicker/label/datum/gloss), no off-ramp sizes/faces | the 7-step ramp + 5 voices (density §2.3) | design-audit `off-theme-font`/`text-below-ramp`/`flat-type-hierarchy` clean |
| **colorize** | apply EXISTING intent/accent tokens where meaning is carried by nothing; a NEW hue is an owner theme decision, not a fix-lane move | D71 owner theme pipeline; tokens only | `--contrast` PASS lines + shots |
| **animate** | purposeful motion on the 3 tokens + 1 easing; exits paired with entrances; reduced-motion = REMOVE | motion guide (§2 taxonomy, §3 principles) | `__orb.motion()`/`__orb.animations()` compositor-clean + `snap --motion` PASS |
| **optimize** | kill churn/jank: hot renders, long tasks, dropped frames | perf budgets (§11 thresholds) | `__orb.renders()` deltas + `snap --perf`/`snap --motion` numbers |
| **adapt** | responsive correctness at REAL mounts: container model, coarse-pointer floors, narrowest-real-host | §0 container rule + the narrowest-mount law | `--mobile`/`--matrix` runs + design-audit at both pointers |
| **harden** | survive Riley: long strings/emoji/RTL, empty/error/loading states, refresh mid-flow | §5 states law + §9 Riley | seeded stress fixtures + shots of every state |
| **clarify** | UX copy in UI CHROME: controls name their action, errors name problem + recovery | §13.10 N4 naming law; NEVER model/user prose, NEVER the owner's prose default texts | before/after copy table |
| **onboard** | design the landing/teaching + empty states that guide to first value | §14 CONTENT law ("nothing selected ⇒ designed landing state") | shots of first-run + empty states |
| **shape** | plan before code: a mock under `docs/design/mocks/` driven through the same instruments | the mockup-first loop | `snap --file <mock>` + the mock-vs-rendered delta table |
| **document** | re-derive `reference/design-context.md` from the law sources it maps | that file's "sources outrank this" rule | the updated file, receipts per changed fact |
| **extract** | promote a repeated shape to a token/primitive via the governed process | UIP §13.7/§13.8; the 3+-and-changing-together bar | the primitive/token delta + its CT |
| **delight** | rationed personality through the SANCTIONED effect axes (grain/elevation/glow carriers) + motion §3 — never decorative pulse/marquee/confetti | the effect-axes list (§11) + CD3 | shots + the axes' guards verified (reduced-motion/contrast) |
| **overdrive** | out of register for this Operate-mode shell — OWNER-DIRECTED only; treat an overdrive urge as a fork to escalate, not a move to make | register discipline | n/a — escalation, not execution |
| **init / product-voice** | the PRODUCT.md-class context (audience, voice, anti-references) is OWNER INPUT and currently UNSET — see the questionnaire door in `reference/design-context.md`; never invent it | owner-sacred | the owner's answers landing in that file |
| **live** | iterate visually without fighting the dev stack: `snap --dirty`/`--isolated` + the mock loop (impeccable's HMR variant machinery was NOT adopted) | §11 instruments | per-iteration shots |
| **craft** | deprecated upstream alias for ordinary new work — don't use; say what you mean with the verbs above | — | — |

Prescription grammar: `<verb>: <targets> — <receipt>`. Example: "quieter: the presets header band
and both list-pane selection bars — receipt: design-audit glow/radial clean + before/after shots at
the 358px mount." A verb without targets is a vibe; a verb without a receipt is a wish.

> **Toolbar rails are not tablists (#112, 2026-08-16; re-paid 2026-08-30 as #845's dead premise).** The RPG HUD deals two
> rails off ONE Tabs root with one shared selection, so its cells are `button`s in named `toolbar`s carrying
> **`aria-current`**, with one tab stop + arrow keys inside (`rpg-context-section.ct.tsx:2286`); a `tablist` there would
> announce with zero selected tabs. Before filing 'no current-view announcement / no arrow nav' on ANY strip, read
> `aria-current` AND drive the arrow arm — `aria-selected` being null on a button is correct, not a finding.
