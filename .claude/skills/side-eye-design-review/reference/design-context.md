# Orbweaver design context

Orbweaver has no hand-authored `DESIGN.md`. The same truth already exists as generated and ratified
law. This file maps to that truth — read the cited source when a value matters — plus the atmosphere
facts that live nowhere else. Sources outrank this file on any conflict.

## Where the design system lives (read these, never a prose mirror)

| Concern | Source |
| - | - |
| Every token (color, text, spacing, radius, motion, shadow) | `packages/ui/src/tokens/tokens.json` → generated `theme.css` and `tokens/index.ts` |
| Density assignment law (which step goes where; tiers; the chrome diet) | `docs/architecture/core/UI-Density-Law.md` |
| Theme pipeline (Hearth/Mocha/Light value-sets, clamp, derived chrome) | `docs/architecture/core/UI-Theming-and-Content.md` §12 |
| Motion (duration tokens, easing, the inventory) | `docs/architecture/core/motion-and-animation-guide.md` |
| Primitives and naming law | `docs/architecture/core/UI-Primitives-and-Reuse.md` §13 |
| Shell geography and interaction physics | `docs/architecture/core/UI-Architecture-and-Layout.md` §4 (SKILL.md §14 is the digest) |
| Global CSS (incl. the reduced-motion killer) | `packages/ui/src/styles/globals.css` |
| `@orb/ui` primitives (the only elements features may use) | `packages/ui/src/primitives/` |
| Shell vocabulary — section/modal/settings ids, panel modes | `packages/client/src/state/shell-store.ts` |
| Section registry | `packages/client/src/state/section-registry.ts` |
| Feature layout (per domain) | `packages/client/src/features/<domain>/` |
| Test ids | `packages/client/src/lib/test-ids.ts` |
| In-page introspection manual (`__orb`) | `packages/client/src/lib/agent-tools.README.md` |
| Client architecture law | `docs/architecture/core/client-architecture-lockdown.md` |
| The decision ledger — cite the decision a finding breaks | `docs/architecture/core/Core-Laws-and-Precedents.md` → `Core-Path-Registry.md` |
| Component tests | `tests/client/**` (e2e: `tests/e2e/**`) |
| Server truth for a chat surface | `GET :8788/api/_debug/db/chat/:id`, `/api/_debug/db/chats`, `/api/_debug/db/characters`, `/api/_debug/errors`, `/api/_debug/db/integrity` |

## The facts a design pass needs in-head (with sources)

- **Register:** a single owner-themed dark app (default palette Hearth; Mocha/Light are token
  value-sets, not modes). Almost every surface is operate register — scanability and native
  expectations outrank expression; brand lives in precise details.
- **Faces:** `Geist` (sans) and `Geist Mono` (`tokens.json` `font`). No other face is legal; a rendered
  third face is the `off-theme-font` finding.
- **Type ramp (px at 16 root):** display 24 · headline 20 · title 16 · body 15 · label/code 13 · micro
  10.5 (`text.*` tokens). Voices, not knobs: kicker / label / datum / gloss / monogram, plus prose
  title/body. The kicker voice (caps micro plus a hairline rule) is ratified here — the upstream
  impeccable kicker ban does not apply.
- **Leading:** display 1.25 · headline 1.3 · title 1.35 · body 1.55 · label 1.25 (`leading.*`). 1.25 is
  the ratified floor; below it is the `tight-leading` finding.
- **Spacing steps:** tight 4 · field 6 · row 8 · block 12 · section 24 · gutter 32 (px). The tier, not
  taste, picks the step.
- **Radius steps:** inset 4 · control 6 · base 8 · card 10 · full (pill). `rounded-card` is
  elevated-only (modal, popover, drawer, toast, composer, grid cell).
- **Chrome diet:** border and radius and background only on interactive islands or elevated surfaces;
  one box deep max; one focal element per surface at rest (accent under about 10% of viewport).
- **Motion:** `--motion-fast` 130ms · `--motion-base` 220ms · `--motion-layout` 360ms ·
  `--ease-out-expo`, transitions over keyframes, compositor-only properties, reduced-motion means
  remove. Never bounce/elastic on programmatic motion.
- **Sanctioned effect axes (intentional — never slop-flag, do verify):** `elevation: flat|ramp|glow`,
  `surfaceTexture: none|grain`, the rationed `--shadow-glow` accent glow (rides `::before`, never the
  element's own `box-shadow`), `--shadow-overlay` (a layered float recipe, `theme.css`), gradient border rings
  (`[data-cta]::after`, `[data-selected]::after`), the media-grid pointer spotlight, the empty-state
  aura, `.orb-weave-glow` (the brand loader). The radial/glow detector rules exempt exactly these
  carriers — a glow anywhere else is a finding.
- **Reading surface rule:** art, blur and gradients never sit behind long reading text; body contrast
  is at least 4.5:1 (SKILL.md §0).
- **Trust tiers for user content:** untrusted card HTML/CSS is contained by browser physics (a
  sandboxed iframe, CSP), never by string-munging (`UI-Theming-and-Content.md` §12).

## Product context — owner-ratified

Owner-approved product voice; reviews may cite these as the product voice.

1. **Audience.** The owner-operator: self-hosts for themselves plus a few invited users, lives in it
   for hours-long sessions, desktop-first, fluent in SillyTavern's vocabulary (drawers, lorebooks,
   swipes, presets). Information density is a feature. Not for drive-by casual users needing
   onboarding hand-holding; not a hosted mass-market SaaS.
2. **Voice.** Copy sounds warm, direct, craftsmanlike. Copy never sounds corporate, cutesy, or hype —
   no emoji-laden copy, no wizard hand-holding, no marketing speak.
3. **Anti-references (hard nevers).** The default-shadcn/Vercel-clone sameness; AI-slop gradient/glass
   SaaS; chunky low-density enterprise SaaS with whitespace-as-luxury; legacy-ST styling — density yes,
   rough edges no.
4. **References (craft compliments).** SillyTavern for density-as-respect; Obsidian for owner-tooled
   depth; a well-crafted game journal UI for the immersive rpg surfaces.
5. **The one feeling (first 30 seconds).** Someone built this room for themselves and lives in it —
   warm, dense, everything within reach. The default theme is named Hearth for a reason.
