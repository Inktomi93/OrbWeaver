---
name: side-eye-design-review
description: "The UX / usability / visual-design / accessibility review laws — the reading-surface rule, contrast/typography/layout/motion rules, the AI-slop antipattern registry, Nielsen's 10 heuristics 0–4 rubric, the cognitive-load checklist (Miller ≤4), the 5 persona walkthroughs (Sam/Riley/Casey/Alex/Jordan), the P0–P3 severity scale, this app's __orb introspection API + probe tooling, the §12 repo map (where CSS/tokens/UI-law docs/features/CTs live; navigation is client state — 2 URL routes only), the §13 mandatory blunt-taste + IA lens (is it ugly · does it flow weird · more than one home for a concept · intuitive cold), and the §14 shell anatomy (TOPBAR + RAIL|LIST|CONTENT|CONTEXT, context follows content, settings is a MODAL, nothing replaces the panes). Preloaded into the side-eye reviewer agent; also usable standalone whenever you critique or audit any UI/UX surface in this repo."
---

# side-eye design-review laws (§0–§14)

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
| `__orb.motion()` | `{ loafs[], cls, worstBlocking, worstShift }` — long-animation-frames (`blockingDuration`, `styleAndLayoutStart>0` = style/layout ran in-frame) + layout instability. **The smoothness receipt — don't eyeball jank** |
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
  **NAVIGATION (the app is state-navigated, 2 URL routes — these replace click-chains):**
  `--goto <target>` (a section id like `presets`, `settings:<category>`, or `modal:<slot>`; refuses
  loudly on an unknown target, exit 1) · `--open-chat <idOrExactTitle>` (refuses loudly on an AMBIGUOUS
  title matching >1 chat — pass the id) · `--open-character <idOrName>` (Characters section + select;
  same ambiguity refusal) · `--context-tab <name>`.
  These run BEFORE the step chain, so `--goto presets --map` maps the presets surface in one call.
  **OBSERVATION OVER TIME:** `--watch <totalMs> [--every <ms>]` — after nav+steps, screenshot + re-run
  every `--eval` each tick (per-tick PNGs + labeled eval results). THE tool for streaming turns /
  transient states — never eyeball a stream one MCP screenshot at a time.
  **MULTI-TAB:** `--pages <N>` opens N pages in ONE shared context; step/capture flags take an
  `@<idx>` suffix (`--fill@0`, `--eval@1`; unsuffixed = page 0) — drive one tab, read the passive one,
  per-page report sections. (Multi-tab is NO LONGER a chrome-devtools reason.)
  **MULTI-USER CONTEXTS:** `--contexts <N>` (2..4) opens N ISOLATED browser contexts (own cookies —
  unlike `--pages`, which shares one context's auth), each logged in as a DIFFERENT dev user, for
  host-vs-member views / presence / visibility-floors in one run. Same `@<idx>` targeting as `--pages`
  (context 0 unsuffixed); shots suffix `-u<idx>`. `--as <handle>` picks which user a single context
  (`--contexts 1`, the default) logs in as. **This ALWAYS targets the multi-user FIXTURE stack**
  (`scripts/dev/multi-user-fixture.sh`), never the shared :5173/:8788 (always single-user, no login
  form) — bring the fixture up yourself first: `bash scripts/dev/multi-user-fixture.sh up` (same
  8788/5173 ports as the shared stack — stop that first if it's running; `down`/`status` manage it).
  A `--contexts N` bigger than the fixture's seeded roster (2 today: owner, member), or the fixture
  down/env-pin-mismatched, REFUSES loudly (`FIXTURE REFUSED …`) with the exact remedy line — never a
  silent fallback to the shared stack. Full flag doc: `scripts/probes/snap.ts` header; detection/
  credential logic: `scripts/probes/_kit/fixture.ts`.
  **VIEWPORT TOGGLES:** `--mobile` (real iPhone 14 Pro Max emulation — 430×932, DPR 3, touch +
  `pointer: coarse`, so hover-reveals go always-visible and the rail becomes the bottom tab bar) ·
  `--desktop` (the 1280×800 default, explicit) · last of `--mobile`/`--desktop`/`--wide`/`--viewport` wins.
- `pnpm perf-meter` (responsiveness + CPU profile) · `pnpm design-audit` (bulk defect scan).

Read `__orb` and any computed value via `snap --eval` / `snap --contrast` — a **Bash** call, no MCP.

**Probe footguns (pay these once, not every review):**
- **Start the stack FIRST** — `pnpm stack start` (server :8788 + vite :5173); snap gates on :5173. A
  "vite not up" / hanging snap = the stack isn't running. `pnpm stack status` to check, `stop` to kill.
- **`snap --eval` AUTO-INVOKES a function literal** — pass a BARE arrow `'()=>{…; return x}'` WITHOUT a
  trailing `()`. Writing `'(()=>{…})()'` double-invokes → `EVAL ERROR: … is not a function`. A plain
  expression (`'document.title'`, `'__orb.motion()'`, `'getComputedStyle(...).x'`) needs no wrapping.
- **`:focus-visible` needs a REAL keyboard Tab** — Chromium does NOT promote scripted `.focus()` to
  `:focus-visible`, so `--eval el.focus()` can't verify a focus ring. Drive a real `Tab`/`Shift+Tab`
  traversal via chrome-devtools MCP `press_key` and read the computed `box-shadow` there. (This is how the
  active-rail "no visible keyboard focus" P0 was found — a static shot looked fine; only real Tab exposed
  the glow overwriting the ring.)
- **`design-audit` tap-target / aria-name findings are frequently FALSE POSITIVES** — Base UI mints
  hidden 1×1 native inputs (`aria-hidden`, `tabindex=-1`) for Select/Slider, and Switch roots carry their
  name via `aria-labelledby` (not textContent). VERIFY each with `--aria` (the real accessible name) /
  `--map` before reporting; never forward the raw count. Only a genuinely VISIBLE, keyboard-reachable
  sub-44px target (or a truly nameless control) is real. (Last full pass: 52 such findings, all false.)
- **chrome-devtools MCP can HANG a browser session** — if it stalls, fall back to `pnpm snap` (its own
  headless browser) and don't leave a stray session; kill it and re-drive via snap.
- **chrome-devtools `take_snapshot` FLATTENS structure** — verified 2026-07-25: a chat room with 12
  `role="article"` message nodes in the DOM showed ZERO articles in its tree (children rendered flat).
  Never report "missing grouping/landmark" from a devtools snapshot alone — `snap --aria` (Playwright's
  ARIA snapshot) is the trustworthy structure receipt; cross-check the DOM via `--eval` when in doubt.

### The appearance EFFECT axes (2026-07 additions — know they EXIST, don't slop-flag them, verify each)

New user-tunable, token/accent-driven effects. Check they render right AND aren't mistaken for AI-slop
(they're intentional + rationed). Toggle an axis via `snap --eval 'document.documentElement.dataset.
texture="grain"'` (etc.) or the Appearance settings pane; then verify:
- **`elevation: flat | ramp | glow`** (root `data-elevation`) — `glow` = layered shadows + inner
  top-highlight on panels/cards. All three values must switch cleanly (no cascade residue when reverting).
- **`surfaceTexture: none | grain`** (root `data-texture`) — opt-in SVG-noise dusting (soft-light ~0.04)
  on chrome/cards ONLY, NEVER message prose (reading-surface rule); must `display:none` under
  `prefers-contrast: high`.
- **`--shadow-glow`** — the rationed Ember accent glow on selected/active (media-grid `data-selected`,
  avatar `ring=accent`, active rail item, focused composer). It lives on a `::before` LAYER, never the
  element's own `box-shadow` (that clobbers the focus ring — WCAG 2.4.7; the P0 above). Not garish.
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

Smoothness is a **receipt**, not a vibe — the eye can't reliably tell 60fps from 45fps, and a headless
review sees no motion at all. When reviewing anything animated (entry/exit transitions, hover motion,
drawer/panel slides, scroll, immersive chat modes), read the numbers instead of guessing:

- **Read `__orb.motion()` and `__orb.animations()`** (via your `evaluate_script` tool over
  chrome-devtools MCP, or `pnpm snap <route> --eval '__orb.motion()' --eval '__orb.animations()'` — a
  Bash call, no MCP). Trigger the motion first (the interaction, or just load a route with entry
  animation), then read. Flag, each a finding:
  - a LoAF with **`styleAndLayoutStart > 0`** in the window — style/layout ran *inside* the frame (a
    forced reflow / a non-compositor animation): the jank signature.
  - **`worstBlocking > 50ms`** — a main-thread block long enough to drop frames / stall input.
  - **`cls > 0.1`** — layout shifting under the user (content jumping as it loads).
  - any animation with **`compositorClean: false`** — it animates a non-`transform`/`opacity`/`filter`
    prop (width/height/top/margin/…), i.e. a per-frame layout pass. Cross-refs §4 ("don't animate
    layout properties"): name the `target` + the offending `properties`.
- **Deep audit — `pnpm motion-audit <route> [--selector <sel>]`** for the ground-truth **Percent
  Dropped Frames** (CDP trace, 4× CPU throttle so the budget is real). It prints a `PASS/FAIL` against
  the budget below plus the LoAF/CLS/compositor-clean detail in one Bash call. Note: the dropped-frame %
  is only fully trustworthy headful (`--vnc`) — headless has no real vsync; LoAF/CLS/blocking are the
  headless-reliable signals.
- **Thresholds** (name the number in the finding): frame budget **16.7ms** · LoAF blocking **≤50ms** ·
  INP **≤200ms** · CLS **≤0.1** · animations must be **compositor-clean**. A breach on a reading/immersive
  surface is ≥ P1 (jank on the primary experience); polish motion elsewhere is P2–P3.

## §12 Repo map — where things live (stop re-discovering this every review)

**Navigation is CLIENT STATE, not URLs.** The router has exactly TWO routes (`/` and `/login` —
`packages/client/src/routes/router.tsx`); entity ids never enter the address bar. Sections, modals,
settings panes, context tabs, and the open chat are all shell state — so "go to X" means driving the
UI (or `snap --goto`/`__orb.nav` if present; check `scripts/probes/snap.ts`'s header). Snapping
`/some-path` does NOT navigate anywhere — it renders the home shell under a misleading PNG name.

| What | Where |
| --- | --- |
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
| CTs (component tests) — repo root, NOT packages/** | `tests/client/**` (e2e: `tests/e2e/**`) |
| Probe tool manuals — **authoritative, read them fresh; this skill does not duplicate flags** | `scripts/probes/snap.ts` header · `scripts/probes/design-audit*.ts` |
| Server truth for any chat surface | `GET :8788/api/_debug/db/chat/:id` · `/api/_debug/db/chats` (LIST) · `/api/_debug/db/characters` (LIST) · `/api/_debug/errors` · `/api/_debug/db/integrity` |

**Seeding + enumeration (stop re-deriving this):** enumerate ids straight from the harness —
`GET /api/_debug/db/chats` (`{id,title,participantCount,messageCount,updatedAt}` per chat) and
`GET /api/_debug/db/characters` (`{id,name,handle,createdAt}`) — no more re-deriving from the query
cache. To SEED a SMALL fixture, **drive the UI, never hand-roll tRPC mutations** — you are the UX
reviewer and the create journey is itself review surface: `--goto chats` lands on the LANDING pane →
click a character quick-pick → the draft room opens → send one message → the draft COMMITS. Group chats:
add members via the cast-bar/roster affordances. For a HEAVY fixture the UI can't produce in reasonable
calls (long transcripts / compaction / virtualization looks), run `tsx scripts/dev/seed-chat.ts
--messages 120 --characters 3 [--title "…"]` — it writes N deterministic numbered rows through the
canon-safe bulk seam (restart the stack or seed a fresh DB so the live connection sees it; see the
script header). Reach a chat by `--open-chat <idOrExactTitle>` (it REFUSES an ambiguous title — pass the
id) and a character by `--open-character <idOrName>`. The DB on the dev stack is DISPOSABLE. If your
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

- **RAIL** (left, ~56px icon column) — WHICH facet. Seven sections is the CEILING (Chats · Characters ·
  Corpus | World Info · Presets · Refinery | Analytics), then Theme/Settings/Identity at the foot.
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
   geometry, adds rail sections past seven, or full-screens over the shell is the EXACT abuse class
   the rollback burned down (main-era rpg/hubs grew the shell 7→10 sections + bespoke modals). Flag
   any new geography on sight — the shell is invariant; sections swap what FILLS the panes.
4. One `primary` action per region at rest · chrome quiet/content loud (accent ≤10% of viewport) ·
   same action = same home + same label everywhere · rail-switch away and back restores the section.

When judging "does this flow weird" (§13), this anatomy is the baseline: finding happens in LIST,
doing in CONTENT, artifact config in CONTEXT — a task that bounces the user across regions or parks
a concept in the wrong region flows weird BY LAW, not just by taste.
