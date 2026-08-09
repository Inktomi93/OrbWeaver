# Login + loading screen — the web-weave design + brand pack (MOCK PHASE)

Status: **MOCK PHASE — nothing built.** The animated mock is `reports/mocks/login-loading-mock.html`;
the brand pack (scope-add, owner 2026-08-09) is `reports/mocks/brand-orbweaver.html` +
`reports/mocks/brand/orb-mark-{a,b,c}.svg` / `orb-favicon-{a,b,c}.svg` (all self-contained, open
directly; `/reports/` is gitignored ephemera — on a GO taste ruling, freeze the winners into
`docs/design/mocks/login-loading/` per the mocks README convention). This doc is the durable design:
the web-weave technique, the SillyTavern-loader analysis, the mode matrix mapped to the shipped
surface, the primitive plan, the token wiring, the brand rationale (§8), and the build lane's
coupled-site inventory.

Owner brief (2026-08-09): "an animated spider web being woven … don't halfass it, we can go HARD";
ST's spinning loader is "iconic, we need that too"; OIDC must be first-class; **one login surface, never
a page per mode**; theme-token-driven throughout.

Rulings already applied (orchestrator relay, 2026-08-09):
- **No username advertisement / account picker** — the local/multiuser arm is a plain
  username + password form. (`discreetLogin` remains a *prefill* behavior — `defaultHandle` withheld —
  not a distinct visual variant.)
- **Pre-auth surfaces have no user theme** (no session ⇒ no prefs). Login/loading render the
  deployment's DEFAULT theme + OS `prefers-color-scheme`. Token-driven still matters: a deployment
  brands its login via its default theme, and the web recolors with it. The mock's theme switcher is
  mock chrome demonstrating that adaptation — it is NOT a login-page affordance.

## 0. Premise verification (recon receipts)

- The functional mode-aware surface **including A8/A9/B4** lives on lane branch
  `wt/agent-a7fe799fe9099f918` (`ab94d2d82` "feat(auth): unify mode-aware login entry"):
  `login-surface.tsx` (per-mode dispatcher + `LoginRedirecting`), `login-first-run-form.tsx` (B4),
  `sso-redirect.ts` (A9 `shouldAutoRedirectToSso`, `?form` suppressor), `auth-meta.ts`
  (`oidcProviderName`, origin-scoped `localFirstRun`). Main's copy (as of `1f62fadb5`) predates A8/A9/B4.
  **This design + mock target the LANE shape** — the visual layer applies after that lane merges.
- Wire shape consumed (lane `auth-meta.ts:56-69` / client `data/auth-config.ts`): `mode`
  (`single-user | local | forward-header | oidc`, `contracts/src/identity/index.ts:28`), `requiresLogin`,
  `oidcProviderName`, `localFirstRun`, `discreetLogin`, `defaultHandle`, `multiHumanCapable`, …
- The shell anchor (`features/auth/anchors/login-shell-anchor.tsx`) is a full-viewport centered
  `max-w-sm` elevated Card OUTSIDE the app shell — the visual layer decorates this exact box.
- SillyTavern loader (vendored tree `~/inktomi-stack/SillyTavern/`): spinner is
  `fa-solid fa-gear fa-spin fa-3x` (`public/scripts/action-loader.js:492-493`) centered on `#preloader`
  — a fullscreen veil in `--SmartThemeBlurTintColor` with `backdrop-filter: blur(30px)`
  (`public/css/loader.css:1-17`); exit = the whole loader gets `filter: blur(15px); opacity: 0`
  and is removed on transitionend (`action-loader.js` `hideOverlay`). Login page (`public/login.html`)
  is a popup-styled card; its "Select an Account" user list is the capability we ruled OUT.

## 1. The loading centerpiece — an orb web, woven the way a spider weaves it

### 1.1 Choreography (the authenticity IS the delight)

Real orb-weaver construction order, kept faithfully — each phase is a distinct visual beat with its own
caption (micro text, muted):

| Phase | What happens on screen | ~time |
| - | - | - |
| **Bridge** | a single strand drifts across the upper span, wavy (floating on wind), then snaps taut when it catches; the spider crosses to its midpoint | 0–0.9s |
| **Y / frame** | the spider drops a vertical from the bridge midpoint — the Y-junction becomes the HUB; frame strands close the perimeter polygon | 0.9–1.9s |
| **Radii** | ~16 spokes laid ONE AT A TIME, hub → frame, the spider at the leading tip extruding each; laying order alternates sides of the hub (real spiders balance tension) | 1.9–4.3s |
| **Auxiliary spiral** | a wide-pitch scaffold spiral, hub outward, thin and faint | 4.3–5.3s |
| **Capture spiral** | the tight spiral laid from the RIM INWARD; the scaffold fades ahead of it (the spider consumes it — real behavior); stops short of the hub (the free zone) | 5.3–7.4s |
| **Settle** | the spider returns to the hub and rests head-down (orbweaver posture); dew condenses on the capture spiral and twinkles; a slow accent-light glint sweeps the web; the whole web sways almost imperceptibly | 7.4s → hold |

The loader is **indeterminate**: it holds in the settled/breathing state, never rebuilds in a loop
(a rebuild loop reads frantic). The build is time-scalable — if boot finishes mid-weave the timeline
accelerates to settle (minimum satisfying beat ~1.2s), then exits.

**Exit beat (the ST-iconic moment, §2):** one fast glint flash around the spiral, then the whole veil
dissolves ST-style — `filter: blur(15px)` + opacity → 0 over ~500ms — revealing the app (or the login
card, which mounts under the same settled web).

### 1.2 Technique: Canvas 2D. Alternatives weighed

**Chosen: Canvas 2D**, DPR-scaled, one full-viewport canvas, geometry precomputed as strand polylines +
birth times, single rAF loop.

- *Rejected — SVG + stroke-dashoffset:* draw-on tricks handle straight strands, but the capture spiral
  is thousands of dash-managed segments, the spider needs articulated legs following a path tangent,
  sag-tension interpolation mutates geometry per frame, and dew/glint are per-point painters. SVG DOM
  churn at that density janks; canvas draws it flat-out.
- *Rejected — CSS-only:* cannot express "a strand ends at the spider that is laying it."
- *Rejected — WebGL:* power unneeded (≤ ~4k segments), costs shader opacity/token-color plumbing and
  readability; Canvas 2D keeps the geometry module pure and testable like `waystone-geometry.ts`.
- *Rejected — pre-rendered video/Lottie:* not token-recolorable, not seed-varied, dead on resize.

Rendering details (the go-hard list):
- **Strands sag.** Every strand is a quadratic curve with a gravity-perpendicular control offset ∝
  length; a freshly laid strand sags loose and TENSIONS to its final catenary over ~300ms (two point
  sets, lerp). Under sway, sag breathes.
- **The spider lays the silk.** The strand's drawn extent ENDS at the spider — no dash trickery. The
  spider is procedural: abdomen + cephalothorax + 8 two-segment legs, phase-offset stepping gait while
  moving, oriented to the path tangent; banded legs (two-tone segments, golden-orb-weaver reference);
  at rest: head-down at the hub, slow breathing scale, occasional leg settle.
- **Light.** Strand alpha falls off with distance from the hub (bucketed, cheap); the capture spiral
  carries a faint accent glow (`shadowBlur` at low alpha); after settle a **glint sweep** — a slow
  rotating angular window where segments overdraw brighter accent — makes the web "catch the light"
  once per ~8s.
- **Dew.** On settle, droplets condense at deterministic points on the capture spiral and twinkle on
  individual phases (the waystone star-twinkle idiom).
- **Determinism.** All jitter (radius angles, dew points, leg phase) comes from the waystone-style
  sin-hash (`jitter(a, b)` — `waystone-geometry.ts:259`), seeded — no `Math.random` in a component,
  identical web per seed, CT-assertable geometry.
- **Performance.** Segments batched into a few `beginPath` buckets per style; settled web can be
  blitted from an offscreen cache with only sway/dew/glint painted live; ≤ ~4k segments total.

### 1.3 Token → palette wiring

Canvas can't consume `var()` directly. The primitive resolves its palette AT MOUNT and on theme change
by probing computed style — the same one-source rule as the waystone (every color a token or a
`color-mix()` over tokens, zero raw literals):

| Palette entry | Token derivation |
| - | - |
| silk (base strand) | `color-mix(in oklab, var(--color-foreground) 62%, transparent)` |
| silk-bright (glint / fresh strand) | `color-mix(in oklab, var(--color-primary) 55%, var(--color-foreground))` |
| glow (spiral shadow / halo) | `var(--color-primary)` |
| dew | `color-mix(in oklab, var(--color-sky-star) 70%, var(--color-primary))` |
| spider body | `color-mix(in oklab, var(--color-foreground) 55%, var(--color-primary))` |
| spider bands | `var(--color-primary)` |
| veil | `var(--color-background)` (loading) / `var(--color-scrim)` (over app) |

Light theme needs no special-casing: mixing from `--color-foreground` flips the silk dark-on-light
automatically (verified in the mock across Ember dark / Ember light / Mocha).

### 1.4 Reduced motion (guide §3.9 — REMOVE, not shorten)

`prefers-reduced-motion` (+ the shell-stamped `[data-reduced-motion="true"]`): no weave animation —
render the **finished settled web as a static image** (dew present, fixed alpha; spider resting at hub;
no sway/glint/twinkle; no rAF loop at all). The veil exit becomes an instant swap. The mini spinner
(§2) renders its static glyph. A tasteful static woven web is the owner-specified opt-out.

## 2. The ST-loader analysis — what we take

ST's loader is iconic because it is: (1) ONE emblem, instantly recognizable, centered and unadorned;
(2) a fullscreen theme-tinted veil with heavy backdrop blur — the app is *present but veiled*, not
replaced by a white page; (3) a satisfying exit — the whole veil blurs and dissolves rather than
popping; (4) the same beat everywhere (boot and long actions), so it becomes a brand reflex.

We take all four **qualities** and none of the parts (no gear, no font-awesome, no popup machinery):
- Our emblem is the weaving web — already the brand mark (`favicon.svg` is an orb web in
  `--color-primary`); the loader is the favicon come alive.
- Our veil is `--color-background` at boot (nothing behind it yet) and a `--color-scrim` +
  `--blur-strength` veil for in-app blocking waits.
- Our exit is the glint-flash + blur-dissolve (§1.1).
- Our small-format beat is **WebSpinner** (§4.2): the orb-web glyph with a silk pulse traveling its
  spiral + a slow rotation — the "spinning loader" quality at 16–48px, for buttons/inline waits.
  One emblem, every size: favicon = static glyph, spinner = glyph + pulse, boot = the full weave.

## 3. The unified login — one surface, the web behind it

The settled web IS the login backdrop: boot weaves the web → the veil never fully leaves on an
unauthenticated boot — it dims (silk × ~0.55) and the login card fades in near the hub. The card
(the shipped `LoginShellAnchor` box: centered `max-w-sm` elevated Card) floats slightly below the hub,
so the free zone + resting spider peek above the card. Wordmark (mini sigil + "orbweaver") sits above;
in-card content is EXACTLY the shipped/lane `LoginBody` arms — this design adds no auth logic.

| `AuthConfig` state | Card content (copy = lane surface) | Web behavior |
| - | - | - |
| config pending | skeleton rows (shipped `LoginLoading`) | weaving |
| fetch failed | "Can't reach the server" + Retry | settled, dim |
| `single-user` | "Single-user mode" + Back to the app | settled + dew |
| `local` | "Sign in" — handle (prefilled from `defaultHandle`; blank when `discreetLogin`) + password | settled + dew |
| `local` + `localFirstRun` (B4) | "Set up your server" — owner password + confirm | **web is deliberately HALF-WOVEN** (radii done, no capture spiral — "your server isn't fully spun"); the capture spiral completes on successful setup, then dissolve |
| `oidc` | "Sign in" + "You'll be redirected to {oidcProviderName}" + **Continue with {provider}** (hero button, `--shadow-cta-glow` on hover) | settled + dew |
| `oidc` + `?authError` (A7) | error alert (destructive, `role="alert"`) above Continue | settled (calm — the web never "reacts angrily") |
| `oidc` auto-redirect (A9) | "Signing in… Redirecting you to {provider}." + WebSpinner | **strand-out beat**: the spider runs a new silk line from the hub off the screen edge and rides it out — "handing you off along the silk" |
| `forward-header` | proxy explainer (shipped copy) | settled, dimmest |

OIDC is first-class by design: the hero Continue button is the largest control on any arm, carries the
provider name (A8), and the redirect gets its own signature animation (strand-out) instead of a dead
spinner — the one moment self-hosters demo to friends.

Multiuser is the local plain form (ruling above). If a signup route ever ships, its affordance is a
config-gated link slot in the SAME card (below the form) — never a second page.

## 4. Primitive plan (owner OK'd new primitives)

All three live in the sealed `@orb/ui` package (`kit ← ui ← client`), art-tier beside the waystone
precedent: pure geometry module + thin component, tokens-only color, deterministic seed.

### 4.1 `WebWeave` — `packages/ui/src/art/web-weave/`
- **Contract:** `<WebWeave state="weaving" | "settled" | "partial" | "strand-out" seed={n} hub={{x,y}}
  dim={0..1} onSettled={fn} />` + `web-weave-geometry.ts` (pure: anchors/frame/radii/spirals as
  polylines + birth times — the vitest-unit-testable half, mirroring `waystone-geometry.ts`).
- **Consumers:** the boot veil (§4.3), `LoginShellAnchor` (backdrop slot), later any "empty cosmos"
  surface that wants the brand ambient.
- **CT obligation:** geometry unit tests (seeded determinism, spiral stops at free zone, radii count);
  CT mounts asserting (a) canvas present + painted (probe a sampled pixel non-transparent), (b) the
  reduced-motion arm mounts NO rAF loop (assert via exposed test seam `__weaveFrameCountForTest`
  stable across two ticks), (c) palette re-resolves on `[data-theme]` flip (sampled pixel changes).
  Planted positive control: a broken-palette fixture must fail the pixel probe.

### 4.2 `WebSpinner` — `packages/ui/src/primitives/spinner/` (there is no spinner primitive today)
- **Contract:** `<WebSpinner size="sm" | "md" | "lg" label={string} />` — inline SVG orb-web glyph
  (the favicon geometry), spiral silk-pulse via `stroke-dasharray` keyframe + slow rotation
  (`--motion-ambient`-scale), `currentColor`/token strokes, `role="status"` + visually-hidden label.
- **Consumers:** OIDC redirecting arm, any long-action blocking wait; the sanctioned spinner (the
  suspense-fallback law still prefers skeletons — this is for genuine indeterminate WAITS, not data
  panes).
- **CT obligation:** renders at all sizes; reduced-motion renders static (computed `animation-name:
  none` — assert computed, not class); a11y name present.

### 4.3 `WeaveVeil` — `packages/ui/src/art/web-weave/weave-veil.tsx`
- **Contract:** `<WeaveVeil open onExited={fn}>` — the fullscreen veil owning the ST-style exit
  (transition on `filter` + `opacity`, `data-ending-style`-idiom, removed on transitionend), hosting
  `WebWeave`, z-token `--z-modal`+.
- **Consumers:** app boot (pre-`data-app-ready`), the login route's backdrop.
- **CT obligation:** exit transition fires and unmounts (transitionend, not timeout); reduced-motion
  = instant unmount; veil color rides tokens.
- **Boot note:** a pre-React beat (`packages/client/index.html`) may inline a tiny static web sigil +
  CSS pulse so the very first paint isn't blank; React's `WeaveVeil` takes over seamlessly (same
  geometry, same tokens via inline critical CSS). Design-note only — the CLS investigation doc owns
  first-paint law.

## 5. Token consumption (no new tokens)

Colors: `--color-background/foreground/card/primary/scrim/border/destructive/muted-foreground/
sky-star`. Motion: `--motion-fast/base/shimmer/breathe/ambient` + `--ease-out-expo` (weave phase
timing is DATA in the geometry module, like the waystone's lattice — not new duration tokens; guide
§4.3 forbids a 4th token and the build sequence isn't a CSS transition). Chrome: `--radius-card`,
`--shadow-overlay`, `--shadow-cta-glow`, `--blur-strength`, `--width-dialog-sm`-adjacent card width via
the existing `max-w-sm` anchor. The mock inlines the generated `theme.css` values verbatim (provenance
comments in the file) — the real build imports the tokens, never copies.

## 6. Build-lane coupled sites (enumerate before building — expect ~6+)

1. `packages/ui/src/art/web-weave/` (new dir: geometry + component + veil) + `packages/ui/package.json`
   export map entries + the ui barrel conventions.
2. `packages/ui/src/primitives/spinner/` + export map.
3. `packages/ui/src/styles/globals.css` — spinner keyframes (`orb-spin-*` names per house convention)
   + reduced-motion floors already cover them (verify, don't assume).
4. `features/auth/anchors/login-shell-anchor.tsx` — backdrop slot (client feature edit, after the
   auth-entry lane's merge; rebase over `wt/agent-a7fe799fe9099f918`'s surface shape).
5. Boot mount (`packages/client/src/main.tsx` / app root) for the veil + `data-app-ready` handoff.
6. Tests: `tests/ui/art/web-weave/*.test.ts` (geometry units) + `tests/ui/art/web-weave/*.ct.tsx` +
   `tests/ui/primitives/spinner/*.ct.tsx` + the login-surface CT sweep (mount stubs gain no new
   required fields, but the anchor's DOM changes — grep `loginPage`/`loginShellAnchor` asserts across
   `tests/**` before landing).
7. Structure gates: test-layout mirror rows for every new file; depcruise (ui imports kit only);
   `check:structure` after any test-path creation.

## 7. Open taste knobs for the owner ruling (the mock demonstrates defaults)

- **Spider prominence** — the mock ships it ON and visible (the brief says go hard); knob: hide the
  spider, keep the weave (some users are arachnophobic — a real deployment-level "reduce spiders"
  setting is a plausible future accessibility courtesy; the reduced-motion static web already omits
  motion but keeps the resting spider).
- **Phase captions** ("anchoring silk… spinning radii… laying the spiral…") — shipped in the mock,
  trivially removable.
- **Build duration** (7.4s full weave, time-scalable down to ~1.2s) — the mock's replay shows full;
  production accelerates to actual boot time.
- **First-run half-woven web** — conceptual flourish; drop to "settled" if it reads as broken.

## 8. Brand pack — the mark, the wordmark, the favicon (scope-add, owner 2026-08-09)

Assets: `reports/mocks/brand-orbweaver.html` (preview: each direction at mark/mono × light/dark,
lockups, and REAL 16px tab strips light + dark, with the current shipped favicon for comparison) +
`reports/mocks/brand/orb-mark-{a,b,c}.svg` (currentColor — theme-adaptive) and
`orb-favicon-{a,b,c}.svg` (ember `#ec9145` hardcoded, matching the shipped favicon's constraint: a tab
icon cannot inherit a page color).

**The system rule that makes tab + loader + login ONE brand: one emblem, every scale.**
favicon (static glyph) → `WebSpinner` (glyph + traveling silk pulse) → boot loader (the full weave,
whose settled final frame IS the glyph) → login backdrop (the settled web). The mark is not "used on"
the loading screen — the loading screen is the mark, animated.

Three directions for the owner's taste ruling:
- **A — Open Orb** (evolution, default recommendation): eight spokes + one OPEN spiral + hub + a
  single dew drop. The open spiral end and the dew drop are the deliberate asymmetries that make it a
  WEB instead of a snowflake/asterisk; it is literally the weave's settled frame condensed. Closest to
  the current favicon (which, side-by-side, reads as a ship's helm — its octagonal double-ring is the
  tell; the round open spiral fixes exactly that).
- **B — The Weaver** (boldest): the animal — an orbweaver hanging head-down on its dragline, front
  legs reaching up the line (the same resting posture the loader's spider settles into at the hub).
  Strongest silhouette at 16px, unmistakable in a tab strip, but it puts a spider in every tab — the
  arachnophobia-adjacent option, deliberately offered rather than assumed.
- **C — o-web Monogram** (letterform): the lowercase "o" IS the web — rim as the bowl, spokes + faint
  spiral inside, a vertical silk descender below with a tiny spider at its end ("the weaver just
  dropped"). Ties mark and wordmark into one system. (First draft's diagonal descender read as a
  MAGNIFYING GLASS at 16px — a fatal search-icon association; the vertical drop + spider dot killed it.)

**Favicon discipline:** every direction ships a 16px-optimized CUT (fewer elements, fatter strokes —
A: 6 spokes/1.7 turns at 1.9–2.1 stroke vs the display 8/2.6 at 1.3–1.5), never the display mark
scaled down. Proven in the preview's real-size tab strips on dark AND light tab chrome. Raster
fallbacks (32/48/180 PNG + ICO) are a build-lane mechanical step from the favicon SVG.

**Wordmark:** "orbweaver", all-lowercase, Geist (the app face) semibold, tight tracking (-0.01em),
first letter in ember — quiet, technical, lets the mark carry the identity. The preview renders it
with live Geist/fallback; the production asset outlines the type to paths (no font dependency in an
SVG asset). Lockups: horizontal (mark 40px + name) and stacked (mark 56px above name).

**Install plan (post-ruling, build lane):** replace `packages/client/public/favicon.svg`; the sigil
component in `@orb/ui` (the same geometry module `WebSpinner` uses) renders the mark in-app (wordmark
row on login, About); raster favicon set + `manifest` icons; sweep: the `favicon.svg` header comment,
`index.html` icon link (unchanged path), any test asserting the old favicon bytes.
