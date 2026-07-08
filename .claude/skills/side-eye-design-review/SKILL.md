---
name: side-eye-design-review
description: "The UX / usability / visual-design / accessibility review laws — the reading-surface rule, contrast/typography/layout/motion rules, the AI-slop antipattern registry, Nielsen's 10 heuristics 0–4 rubric, the cognitive-load checklist (Miller ≤4), the 5 persona walkthroughs (Sam/Riley/Casey/Alex/Jordan), the P0–P3 severity scale, and this app's __orb introspection API + probe tooling. Preloaded into the side-eye reviewer agent; also usable standalone whenever you critique or audit any UI/UX surface in this repo."
---

# side-eye design-review laws (§0–§11)

Distilled from the `impeccable` design language (pbakaus/impeccable), Nielsen/NN-g heuristics, and the
Orbweaver constitution. A checklist you APPLY. When a finding breaks one of these, name the rule.

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

- Body line length 65–75ch (`max-w-prose`).
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
- **`@media (prefers-reduced-motion: reduce)` is mandatory** for every animation.
- Never animate an `<img>` on hover (pure AI tell).

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

## §7 Nielsen's 10 heuristics — scoring rubric (0–4; honest, most surfaces land 20–32/40)

`0` absent/broken · `2` partial with real gaps · `4` genuinely excellent.
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

Bands: 36–40 excellent · 28–35 good · 20–27 acceptable · 12–19 poor · 0–11 critical.

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

**`window.__orb`** (via chrome-devtools MCP `evaluate_script`, after `data-app-ready`):

| Call | Returns / use |
| --- | --- |
| `__orb.snap()` | one-call overview `{ ready, shell, bus, queries, perf, renders }` — start here |
| `__orb.renders()` | render heatmap `{ id, count, mounts, updates, totalMs, avgMs, maxMs }[]`, hottest-first — **churn is a real UX defect**, flag hot surfaces |
| `__orb.perf()` | `orb:*` User-Timing measures `{ name, ms }[]` |
| `__orb.queries()` | TanStack Query cache `{ key, status, fetch, stale, updatedAt }[]` — loading / stale / errored |
| `__orb.bus()` | chat-bus `{ live, events }` — live subs + recent canon events |
| `__orb.shell()` | shell state: active section, panel modes, `chatOpen` |
| `__orb.ready` / `.isReady()` | promise / bool: hydrated + initial reads settled |

Plus raw `getComputedStyle(el)` for the contrast / size / aspect-ratio math behind every visual receipt.

**`data-app-ready`** on `<html>` — the readiness gate (fires once the query cache first idles; SSE is
not a query, so it fires with the stream open). Wait on it, never network-idle.

**Console channels** (dev): `[bus]` (canon event → invalidated keys + storm alarm), `[trpc]` (query/
mutation round-trips), `[perf]` (>12ms commits attributed to a surface + >50ms long tasks) — via the
probes' capture or chrome-devtools `list_console_messages`.

**Probes** (Bash, own headless browser, output under `reports/` — gitignored; the cheap path — one
call, no MCP, no context dump; **prefer these over the chrome-devtools MCP for everything but a live
keyboard walk**):
- `pnpm snap <route>` — capture + introspection flags: **`--map [sel]`** (selector map — every element
  → its stable selector; discover targets, never grep source) · **`--contrast <sel>`** (WCAG ratio,
  oklch-safe, `PASS/FAIL`) · **`--eval '<js>'`** (any in-page value, incl. `__orb.renders()`/
  `__orb.snap()` and `getComputedStyle`) · `--aria`/`--text` (a11y tree) · `--click/--press/--fill/
  --wait-for` (interaction chain) · `--shot-of` · `--diff`/`--baseline` · `--dark`/`--reduced-motion` ·
  `--deadcss`.
- `pnpm perf-meter` (responsiveness + CPU profile) · `pnpm design-audit` (bulk defect scan).

Read `__orb` and any computed value via `snap --eval` / `snap --contrast` — a **Bash** call, no MCP.
