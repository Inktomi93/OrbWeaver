# Orbweaver design context (the DESIGN.md-equivalent, distilled from law)

> Impeccable's flow reads a hand-authored `DESIGN.md` (palette, type ramp, spacing, radii,
> atmosphere) before every design action. Orbweaver deliberately has NO DESIGN.md — the same
> truth already exists as GENERATED + RATIFIED law, and a prose mirror would rot against it.
> This file is the MAP to that truth (read the cited source when a value is load-bearing), plus
> the few atmosphere facts that live nowhere else. Sources outrank this distillation on any
> conflict.

## Where the design system actually lives (read these, never a prose mirror)

| concern | authoritative source |
| - | - |
| every token (color / text / spacing / radius / motion / shadow) | `packages/ui/src/tokens/tokens.json` → GENERATED `theme.css` + `tokens/index.ts` (`TOKENS` map: `{ cssVar, value }`) — regen `pnpm --filter @orb/ui tokens:build` |
| density assignment law (which step goes where; tiers; the chrome diet CD1–CD3) | `docs/architecture/core/UI-Density-Law.md` (owner-ruled) |
| theme pipeline (Hearth/Mocha/Light value-sets, ThemeScope clamp, derived chrome) | `docs/architecture/core/UI-Theming-and-Content.md` §12 (D71, D44) |
| motion (3 duration tokens + 1 easing; the ten principles; the inventory) | `docs/architecture/core/motion-and-animation-guide.md` |
| primitives + naming law | `docs/architecture/core/UI-Primitives-and-Reuse.md` §13 (esp. §13.7/§13.8/§13.10) |
| shell geography + interaction physics | `docs/architecture/core/UI-Architecture-and-Layout.md` §4 (skill §14 is the digest) |

## The facts a design pass needs in-head (with receipts)

- **Register:** a single owner-themed DARK app (default palette Hearth; Mocha/Light are token
  value-sets, not modes). Almost every surface is Operate register — scanability and native
  expectations outrank expression; brand lives in precise details.
- **Faces:** `Geist` (sans) + `Geist Mono` (`tokens.json` `font`). No other face is legal; a
  rendered third face is the `off-theme-font` detector finding.
- **Type ramp (px @16 root):** display 24 · headline 20 · title 16 · body 15 · label/code 13 ·
  micro 10.5 (`text.*` tokens). Voices, not knobs: `kicker` / `label` / `datum` / `gloss` /
  `monogram` + prose `title`/`body` (density spec §2.3, owner-ruled). **The kicker voice (caps
  micro + hairline rule) is RATIFIED here — impeccable's kicker ban does not apply.**
- **Leading:** display 1.25 · headline 1.3 · title 1.35 · body 1.55 · label 1.25 (`leading.*`).
  1.25 is the ratified floor — below it is the `tight-leading` finding.
- **Spacing steps:** tight 4 · field 6 · row 8 · block 12 · section 24 · gutter 32 (px). The
  TIER, not taste, picks the step (density spec §3.1 table).
- **Radius steps:** inset 4 · control 6 · base 8 · card 10 · full (pill). `rounded-card` is
  ELEVATED-only (modal/popover/drawer/toast/composer/grid-cell) — owner ruling D6.
- **Chrome diet:** CD1 border+radius+bg only on interactive islands / elevated surfaces; CD2 one
  box deep max; CD3 one focal element per surface at rest (accent ≤10% of viewport).
- **Motion:** `--motion-fast` 130ms · `--motion-base` 220ms · `--motion-layout` 360ms ·
  `--ease-out-expo`, transitions over keyframes, compositor-only props, reduced-motion = REMOVE.
  Never bounce/elastic on programmatic motion (the `bounce-easing` finding is law-backed).
- **Sanctioned effect axes (intentional — never slop-flag, DO verify):** `elevation:
  flat|ramp|glow`, `surfaceTexture: none|grain`, the rationed `--shadow-glow` accent glow
  (rides `::before`, never the element's own box-shadow), `--shadow-overlay` 4-layer float,
  gradient border rings (`[data-cta]::after`, `[data-selected]::after`), the media-grid pointer
  spotlight (`[data-slot=media-grid-cell]::before`), the empty-state aura
  (`[data-slot=empty-state-decoration]::before`), `.orb-weave-glow` (brand loader). The
  radial/glow detector rules exempt exactly these carriers — a glow anywhere ELSE is a finding.
- **Reading surface rule:** art/blur/gradients never behind long reading text; body ≥ 4.5:1
  (skill §0 — the #1 defect class this whole apparatus exists for).
- **Trust tiers for user content:** untrusted card HTML/CSS is contained by browser physics
  (sandboxed iframe, CSP), never string-munging (`UI-Theming-and-Content.md` §12).

## Product context (PRODUCT.md-equivalent) — OWNER-RATIFIED 2026-08-16

Provenance: drafted from the prior product context (the previous codebase's `PRODUCT.md` — not a path in this repo — the same product's
earlier impeccable init) + `docs/Mission.md`, neo-era deltas corrected (Base UI not shadcn; the
theme set is Hearth/Mocha/Light + imported owner themes under D71, not Hearth/Catppuccin/Loom).
Owner approved all five verbatim ("yes to all"). Reviews may cite these as owner product-voice.

1. **Audience.** The owner-operator: self-hosts for themselves plus a few invited users, lives in
   it for hours-long sessions, desktop-first, fluent in SillyTavern's vocabulary (drawers,
   lorebooks, swipes, presets). Information density is a feature. Explicitly NOT for: drive-by
   casual users needing onboarding hand-holding; not a hosted mass-market SaaS.
2. **Voice.** Copy should sound: **warm, direct, craftsmanlike**. Copy must never sound:
   **corporate, cutesy, hype** — no emoji-laden copy, no wizard hand-holding, no marketing speak.
3. **Anti-references (hard nevers).** The default-shadcn/Vercel-clone sameness (the unthemed
   template look, whatever the component library underneath); AI-slop gradient/glass SaaS;
   chunky low-density enterprise SaaS with whitespace-as-luxury; legacy-ST styling — density yes,
   2014 rough edges no.
4. **References (craft compliments).** SillyTavern for density-as-respect; Obsidian for
   owner-tooled depth; a well-crafted game journal UI (Baldur's Gate 3 class) for the immersive
   rpg surfaces.
5. **The one feeling (first 30 seconds).** "Someone built this room for themselves and lives in
   it" — warm, dense, everything within reach. The default theme is named Hearth for a reason.
