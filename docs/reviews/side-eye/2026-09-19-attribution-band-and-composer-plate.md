---
kind: review
status: active
updated: 2026-09-19
---

# Sticky attribution band (#1873) + over-art composer/bubble plate (#2389) — live drive

Lane `side-eye-F`, 2026-09-19. Driven against the live dev stack (`:5173`/`:8788`,
`/healthz` commit `d1a6bc17d61171bb1aad8e8b67683934b4c67ac1`) with `pnpm snap`, plus one
`--ref d4e226a2e` isolated-stage control for the pre-#1873 A/B. Focused review of two surfaces;
no Nielsen sweep of the whole shell.

> **Frontmatter deviation.** The brief asked for `status: current`. `current` is not in the catalog's
> status vocabulary (`tooling/src/doc-catalog/lib/vocab.ts:38` — `active archived complete draft
> parked snapshot superseded`), so this file ships `active`.

## Verdict

**SHIP WITH FIXES.**

- **Surface 1 — sticky attribution band (b9efacbe7, #1873): the mechanism is right, the pixels
  regressed.** Zero oscillation at seven scrollport heights including the exact threshold, and
  `nonVirtualizedCls = 0` over a driven scroll — the fix does what it was built for. But the
  top-only cancellation removed the 8px of opaque fill that used to sit below the pinned name, and
  the rendered result is a visible collision: a sheared half-line of prose abuts the name with no
  gap. The `tide` skin, which #1873 did not touch, still renders it correctly in the same build and
  is the control that proves the regression. **One P1, one P2.**
- **Surface 2 — over-art composer + bubble plate (d4e226a2e, #2389): correct, and it holds at the
  worst legal art in both polarities.** Composer placeholder measures 6.48:1 over a dark plate and
  6.72:1 over planted pure-white art in the light arm; the deliberately-unchanged dark arm holds
  4.68:1 at the same white-art bound. Byte-identical dark arm confirmed. **No defect in the change
  itself.** Two reach caveats and one pre-existing P0 found next door.
- **Stumbled on, with receipts, outside both commits: a P0 (typed composer text at 1.13:1 in a
  card-themed room under the Light app theme) and a P1 (the mobile chat reading port is 185px of a
  740px viewport).**

## Environment and appearance state the receipts were taken under

Read live, not assumed (`snap --eval` on `<html>` / `.shell-grid`, run
`main-3889866-2026-09-19T06-31-21-337Z`):

```
root : data-blur-panels data-blur-composer data-blur-modals data-shadow
       data-theme-colorization data-texture=grain data-reduced-motion=false
       --font-scale 1.25  --blur-strength 16px  (NO data-theme => Hearth)
grid : data-elevation=ramp data-list-mode=docked data-context-mode=collapsed data-has-bg-image=true
```

Two facts that decide half of this review:

1. **`data-blur-messages` is OFF in the owner's row AND in the shipped defaults**
   (`tooling/src/_shared/appearance-presets.json` → `defaults.blurSurfaces = ["panels","composer",
   "modals"]`). The three new bubble plate rules are gated on `html[data-blur-messages]`, so they are
   **latent in both the default and the owner state** — bubbles there are fully opaque
   (`oklch(0.255 0.006 60)` / `oklch(0.21 0.015 278)`, no `backdrop-filter`) and composite nothing.
   The bubble arms below were driven under `--appearance-preset maximal`.
2. **`enableThemeColorization` is `true` in the owner's row and `false` in the schema default**
   (`packages/contracts/src/settings/appearance.ts:231`), and **neither the `defaults` nor the
   `maximal` preset pins it** — so a `--appearance-preset maximal` arm silently inherits the owner's
   value on the one axis that decides whether the bubble plate rule can fire at all. Flagged in
   Instrument notes.

Rooms driven (both on the live dev db, plate luminance computed from the served blob):

| Room | id | plate | mean L | carried theme? |
| - | - | - | - | - |
| Example — The Ashen Spire (dark scene, 3 characters, RPG) | `chat_01m1ttfbg4e48r18yz6q8jm82v` | morgatha-bg | 46.0 | no |
| Calamity (solo, card `backgroundOverride`) | `chat_01m1wm9btxexrs1y8bjkf7df33` | calamity-bg | 131.0 (p90 203) | **yes** |
| Example — Midnight Run | `chat_01m1ttfbfje48r18nr1hpk21xr` | niko-bg | 69.7 | no |
| Example — Second Opinion | `chat_01m1ttfbe7e48r17gs9106gt5z` | assistant-bg | 47.2 | no |

---

## SURFACE 1 — the sticky attribution band

### Measured geometry (post-fix vs pre-fix control)

`snap --eval` on `[data-sticky]`, transcript scrolled to `scrollTop 20166` in the Ashen Spire room.

| | band h | padding-top | padding-bottom | margin-top | margin-bottom | opaque fill below the name's line box |
| - | - | - | - | - | - | - |
| **post-#1873** (d1a6bc17d, live) | 28px | 8px | **0px** | −8px | 20px | ~5px |
| **pre-#1873** (`--ref d4e226a2e`, stage) | 36px | 8px | **8px** | −8px | −8px | ~13px |
| **`tide` skin, post-#1873** (untouched constant) | 36px | 8px | **8px** | 0 | 0 | ~13px |

Receipts: `reports/runs/snap/main-3928223-2026-09-19T06-39-13-108Z/run.json` (post),
`reports/runs/snap/main-3933240-2026-09-19T06-40-25-276Z/run.json` (pre, `--ref d4e226a2e`),
`reports/runs/snap/main-3979776-2026-09-19T06-44-49-954Z/run.json` (tide).

### Findings

**\[P1] The pinned band's bottom edge shears the passing prose flush against the name.**
With `padding-bottom: 0`, the band's opaque fill stops ~5px under the name's glyph box, and the
prose scrolling underneath is clipped exactly there. At `scrollTop 20166` the name "Sabine Veyra"
sits directly on top of the severed top half of the line "old throne room." with no separating
fill; at `scrollTop 19966` the pinned "Calamity, Doomblade of the Ninth Epoch" and the line
"years. It can spare you one evening more to get the first note right." touch, reading as one
run-on two-colour block instead of chrome-over-content.
*Why it hurts a user:* the pinned name is the transcript's only "who is speaking" anchor during a
long turn; when it visually merges with a sheared line it stops reading as chrome and reads as a
rendering glitch — the first thing a new user will screenshot.
*Fix (design verb — `polish: the inside sticky attribution band — receipt: a crop at the same
scrollTop showing ≥8px of band fill below the name, plus the unchanged 28px border box`):* restore
the breathing **in paint, not in layout**, so `exceedsViewport`'s input is untouched and #1873's
invariant survives — e.g. `box-shadow: 0 var(--spacing-row) 0 0 var(--color-reading-band)` (or an
`::after` extension) on `STICKY_ATTRIBUTION_CHROME_INSIDE`. This is the "satisfy the new symptom,
preserve the old mechanism" fork: the commit's own header
(`message-row-backing.ts`, "the opaque fill starts one `--spacing-row` above the name instead of
surrounding it") already names the trade; it is visible, so it needs paying for.
*Receipts:* crop `…/main-3928223-…/snaps/sef-band-20166-crop.png`,
crop `…/main-3929318-2026-09-19T06-39-25-476Z/snaps/sef-band-19966-crop.png`, pre-fix control
`…/main-3933240-…/snaps/sef-pre1873-crop.png`.

**\[P2] `tide` and the seven inside skins no longer render the same band.**
Measured across all eight skins at one scroll position: bubble/flat/document/echo/whisper/hush/ripple
all report `h=28 pt=8 pb=0 mt=-8 mb=20`; `tide` reports `h=36 pt=8 pb=8 mt=0 mb=0` and a neutral
`oklch(0.12 0.006 60)` fill instead of the speaker-tinted `oklch(0.112 …)`. Side by side, tide's band
is a clean pill with the name in its own space and the inside skins' band is the collision above.
`message-row-backing.ts`'s own comment still claims "the two spellings differ in which padding they
cancel and in chip rounding — the layout-neutrality invariant is identical"; they now also differ in
vertical padding, i.e. in appearance.
*Why it hurts a user:* switching chat style silently changes how the pinned attribution is drawn, in
a way nobody chose. *Fix:* whatever lands for P1 should bring the two spellings back to the same
rendered band, and the constant's comment should be re-derived.
*Receipts:* the eight-skin table above; zooms `tide` vs `hush` from
`…/main-3979776-…/snaps/sef-skin-tide-crop.png` and
`…/main-3976467-2026-09-19T06-44-28-812Z/snaps/sef-skin-hush-crop.png`.

### What #1873 got right (verified, do not touch)

- **No oscillation, anywhere I could put the threshold.** A 150-frame rAF sampler recording
  `(scrollTop, sticky count, every row height)` reported **1 distinct state and 0 transitions** at
  scrollport heights 180, 257, 497, 797, **1010, 1015, 1019** — the last three straddling the two
  long rows' measured heights (1012 and 1017), i.e. exactly the regime #1873 was minted for, and one
  arm sitting on the short row's height (180) exactly. Runs `…/jit-*` and `…/jb-*`.
- **Zero layout shift under a driven scroll.** `snap --motion '[data-slot=message-list-scroll]'`
  after a 12-step wheel burst: `cls 0 · virtualizedCls 0 · nonVirtualizedCls 0`, dropped frames 0/3
  (`reports/runs/snap/main-4021265-2026-09-19T06-54-55-610Z/motion/root-motion.json`).
- **Band legibility is not the problem.** The fill is fully opaque (framebuffer inside the band is
  constant at `(3,5,7)` regardless of what scrolls under it) and the name measures **18.24:1 PASS**
  (pixel-sample) in all three palette arms — Hearth, `--theme Light`, and `--theme Light` with
  colorization off.
- **ARIA is sound.** `log "Conversation messages" → list → listitem → article "<speaker>"` with the
  speaker as the article's accessible name; the pinned band adds no duplicate announcement
  (`…/main-4013730-2026-09-19T06-52-48-942Z/evidence/aria.json`).

### Mobile (coarse pointer, `device=coarse:dpr3:430x740`)

The band renders identically (`h=28 pt=8 pb=0`), so the P1 applies there too — and worse, because
the mobile scrollport is short enough that almost every row is pinned. See the stumbled-on P1 below.

### Nielsen score line — sticky attribution band as driven

Status 3 · Match 4 · Control 3 · Consistency **2** (tide vs inside) · Prevention 3 · Recognition 4 ·
Efficiency 3 · Aesthetic **2** (the collision) · Recovery 3 · Help 3 = **30/40, good**. The score is
calibration only; both findings above are owed regardless.

---

## SURFACE 2 — the composer and the three bubbles over a plate

### Composer — framebuffer-composited contrast (AA floor 4.5)

Method: `snap --eval` for the box + the computed ink (`color`, `::placeholder`), PIL mode-sample of
the textarea's own painted band from the run's PNG (dev-HUD column excluded), ink composited over
that sampled surface. Numbers are 1 image px per CSS px (`scale=css/1280x800`).

| Arm | room / plate | composer surface (framebuffer) | placeholder | typed |
| - | - | - | - | - |
| Hearth (dark arm, plateless by design) | Ashen Spire, dark plate | `(14,12,12)` | **8.45:1** | 17.11:1 |
| Hearth | Midnight Run | `(12,12,14)` | **8.46:1** | 17.14:1 |
| Hearth | Second Opinion | `(25,16,11)` median | **8.12:1** | 16.44:1 |
| `--theme Light` (the new plate arm) | Ashen Spire, dark plate | `(236,234,230)` | **6.48:1** | 13.71:1 |
| Hearth + **planted white art** (worst legal) | Ashen Spire | `(63,61,60)` | **4.68:1** | 9.47:1 |
| `--theme Light` + **planted white art** | Ashen Spire | `(240,238,234)` | **6.72:1** | 14.22:1 |

The planted arms inject `<style>[data-slot=theme-background-layer]{background-image:none!important;
background-color:#fff!important}` before the capture — the worst-legal-art control the commit's own
CT reasons about. Runs `main-3889866-…`, `main-3993859-…`, `main-3994642-…`, `main-3891315-…`,
`main-3999288-2026-09-19T06-49-01-486Z` (white/Hearth), `main-3999958-2026-09-19T06-49-13-069Z` (white/Light).

**Verdict: the composer half of #2389 is correct and bounded.** The light arm's composite is
`0.921 × plate + 0.079 × art`, so across the entire legal art range the surface only moves from
`(236,234,230)` to `(240,238,234)` and the placeholder stays in the 6.5–6.7:1 band. The commit's own
red-first number (3.30 → 6.40) reproduces at 6.48 here.

**Retraction, published.** Mid-run I hypothesised that the deliberately-unchanged **dark** arm would
fail AA over bright art, and computed ≈3.5:1 analytically from `0.7 × tint + 0.3 × art`. The planted
white-art arm refutes it: the measured surface is `(63,61,60)`, not the predicted ~82, so the
placeholder holds **4.68:1** — the app already dims the wallpaper enough that the dark arm clears AA
at the bound. The analytic estimate was wrong because it ignored that dimming. No finding.

### Bubbles

| Arm (all `--appearance-preset maximal` or explicit `blurSurfaces` incl. `messages`) | bubble bg | which `light-dark()` branch | prose ratio |
| - | - | - | - |
| Hearth, colorization on (owner) | `oklab(0.21 … / 0.88)` | dark (correct) | 15.74:1 |
| `--theme Light`, colorization on (owner) | `oklab(0.21 … / 0.88)` | dark | 11.69:1 over planted white art |
| `--theme Light`, `enableThemeColorization:false` — **user** bubble | `oklab(0.931 … / 0.99052)` | **light + plate (the new rule fires)** | dark ink, pass |
| `--theme Light`, `enableThemeColorization:false` — **assistant** bubbles | `oklab(0.21 … / 0.88)` | dark | 12.36:1 / 11.69:1 over planted white art |

**\[fine, with a reach caveat] The bubble rules are correct where they fire; they mostly do not fire.**
Two gates stack: the `html[data-blur-messages]` gate (off in the owner row and in the shipped
default) and `light-dark()` resolving at the element, whose `color-scheme` comes from the nearest
`ThemeScope`. Every character message row sits inside a per-speaker `ThemeScope`
(`packages/ui/src/content/theme-scope/theme-scope.tsx:59-63` emits `colorScheme`), and those scopes
stay **dark** even with `enableThemeColorization:false` — so under the Light app theme only the
**user** bubble takes the new light+plate branch; assistant and system keep the plateless dark
branch. That is legible (11.69–12.36:1 measured over planted white art, because the dark mix is
0.88 opaque), and it is arguably D44-consistent, but the commit message's "the three bubbles take
D144's polarity floor" overstates the delivered reach. **No fix owed; the claim should be narrowed
where it is recorded.** I did not reach a `system` bubble in either room — that role is UNVERIFIED.

**\[fine] The dark arm is byte-identical.** Every dark-arm computed `background-color` I sampled
(`oklab(0.132 … / 0.7)` composer, `/0.88` bubbles) matches the plateless pre-plate spelling, and the
Hearth numbers are unchanged across rooms.

### Taste verdict (Surface 2, plain words)

The dark arm over a dark plate looks **good** — the composer reads as a solid slab of chrome, the
art survives at the edges, the transcript is calm. The **Light theme over these rooms looks
incoherent**, and that is not this commit's doing: because message rows keep their dark speaker
scopes, the Light palette produces a light shell (rail, list, topbar, composer, RPG chips) wrapped
around one large dark slab of transcript. It does not read as "light mode"; it reads as a light app
that failed to repaint the middle. Screenshot:
`…/main-3891315-2026-09-19T06-31-32-441Z/snaps/sef-d-light-def.png`. Worth an owner ruling on whether
Light is supposed to look like that, because right now Light is not a shippable palette for a chat
room and #2389 makes the composer *more* obviously light against an unchanged dark transcript.

### Nielsen score line — composer/bubble plate as driven

Status 3 · Match 3 · Control 3 · Consistency **2** (light shell / dark transcript) · Prevention 4 ·
Recognition 3 · Efficiency 3 · Aesthetic 3 · Recovery 3 · Help 3 = **30/40, good**.

---

## Stumbled on en route (outside both commits — receipts, then back to the targets)

**\[P0] Typed composer text is invisible in a card-themed room under the Light app theme — 1.13:1.**
In the Calamity room (`chat_01m1wm9btxexrs1y8bjkf7df33`, card-carried dark theme) with `--theme
Light`: the composer keeps the room scope's dark surface (framebuffer `(22,17,19)`) while the
textarea's `color` is **inherited from `body`**, which carries the *root* (light) `--color-foreground`
\= `oklch(0.24 0.01 60)`. Composited ink `(34.9,30.2,26.6)` on `(22,17,19)` = **1.13:1**. The
placeholder is fine (10.70:1) because it is set explicitly via `placeholder:text-muted-foreground`,
so the box looks correct until you type.
*Mechanism:* `ThemeScope` emits `--*` custom properties and `colorScheme` but never `color`
(`theme-scope.tsx:59-63`), and the ancestor walk shows `color` changing exactly once, at `body`.
*Bound:* I swept every visible text element under `main` in that room for the same leak — **0 other
elements**. The composer textarea is the only casualty, because a textarea's value is not a child
text node. *Fix:* the scope must restate `color` (or the composer must name its ink from the scope's
own `--color-foreground`) — not a new token.
*Receipts:* element shot `…/main-3909179-2026-09-19T06-35-30-839Z/snaps/sef-b-light-typed.png`
(dark-on-dark, the sentence is barely readable), ancestry walk `…/ancestry.log`,
run `…/main-3896008-2026-09-19T06-32-18-733Z/run.json`, leak sweep `…/leaks.log` (count 0).
*Not caused by #2389:* the new rule cannot fire there at all — `light-dark()` resolves DARK at the
composer inside the room scope, so the composer keeps the pre-commit plateless value.

**\[P1] The mobile chat reading port is 185px of a 740px viewport in an RPG room (378px in a plain
room).** Measured at `device=coarse:dpr3:430x740`: `[data-slot=message-list-scroll]` height **185px**
in the Ashen Spire room, against composer 212px + RPG controls band 267px + tab bar 70px. Four lines
of transcript, hard-clipped mid-glyph at the bottom with no fade. A plain room gives 378px (51%),
so the composer's 212px is the common tax and the RPG band is the compounding one.
*Receipt:* `…/main-3985865-2026-09-19T06-45-57-299Z/snaps/sef-sticky-mobile.png` and
`…/mob-chat_*.log`.

**\[P2] Scrolling a long transcript books a 122ms blocking LoAF attributed to `row-roving.ts`.**
`snap --motion` after a wheel burst: `worstBlocking 122ms` with one LoAF doing style/layout work,
and the console names `onFocusIn @ row-roving.ts 165ms` / `commitRootWhenReady 185ms`. CLS is 0, so
this is responsiveness, not shift. Bounded window (3 frames) — evidence, not a verdict.
*Receipt:* `reports/runs/snap/main-4021265-…/motion/root-motion.json`.

**\[P2, not forwarded as a product defect] `design-audit` desktop is NO VERDICT on this surface.**
`population-verdict=NO-VERDICT`, exit 2, withheld: `border-contrast(paint-layer-over-base=2)`,
`reveal-coverage(restHiddenReveal=32)`, `hover-contrast(unresolvedHoverBackdrop=31)`,
`selection-idiom(unmatchedUnselected=1)`. Its three printed findings —
`text-over-art P1` on a chat **list row** (backdrop is a background-image, contrast indeterminate —
a hand-verify work order, not my surface), `promoted-layer-offset P2` + `off-grid-text P2` both on
`[data-slot=swipe-strip]` — are therefore partial. The `--mobile` arm is `complete` with the same
two swipe-strip P2s plus `flat-type-hierarchy P3`.

## Instrument notes for the orchestrator

1. **`--appearance-preset maximal` does not pin `enableThemeColorization`.** It is the axis that
   decides whether the bubble plate rule can fire, and both `defaults` and `maximal` leave it
   inheriting the owner's row (`true`), which is the opposite of the schema default (`false`). A
   "maximal" arm therefore measures the owner's colorization, not a defined point. Worth a new
   profile or an added key in `tooling/src/_shared/appearance-presets.json`.
2. **`snap --contrast` on an empty textarea over art is not usable as a placeholder receipt.** It
   reported `NO VERDICT (fill-only, undecodable)` under Hearth and a `FILL 2.62:1 FAIL … 255,85,85
   on 236,234,230` under Light — and `255,85,85` is the **vite-plugin-checker error badge**
   overlapping the composer's bottom-right, i.e. the dev HUD, not the product. **Retracted, not
   filed.** The same HUD poisoned a mode-sample (`mr-secondop` surface read as `(255,85,85)`) until
   I excluded the right-hand 170px. Any composer contrast arm must dodge that column.
3. **Memory `mobile-verify-needs-coarse-pointer.md` has a stale addendum.** It says
   `--mobile --viewport WxH` silently drops `pointer: coarse` + DPR3 "until #1668 lands". #1668 has
   landed: every `--mobile` arm here reported `device=coarse:dpr3:430x740` and the page answered
   `matchMedia("(pointer:coarse)") === true`. The addendum should be marked closed.

## Instrument coverage

| Instrument | Status |
| - | - |
| `snap --map` / `--aria` | RAN — `main-3876608-…` (composer map), `main-4013730-…` (transcript ARIA) |
| `snap --contrast` / `--contrast-pixel` | RAN — band 18.24:1 ×3 arms; bubble 15.80/12.60:1; composer arm REFUSED (see Instrument note 2) |
| Framebuffer-composited contrast (PIL, mode/median sample) | RAN — 12 arms, tables above |
| Planted worst-legal-art control (white `theme-background-layer`) | RAN — `main-3999288-…`, `main-3999958-…`, `main-4005360-…`, `main-4004659-…` |
| `snap --design-audit` desktop | RAN — `main-4010950-…`, **NO VERDICT** (exit 2) |
| `snap --design-audit --mobile` | RAN — `main-4011651-…`, complete, 3 findings |
| `snap --motion` | RAN — `main-4021265-…` (CLS 0, LoAF 122ms) |
| `snap --perf` / `--cpu-profile` | SKIPPED — responsiveness was not a briefed question; the motion arm already bounded the one LoAF |
| `snap --lighthouse` | SKIPPED — the two briefed questions are composited contrast and pinned-band geometry, neither of which axe can see over a wallpaper; the dev-overlay trap makes it expensive to triage |
| `snap --filmstrip` | SKIPPED — the jitter question was answered by a 150-frame rAF geometry sampler, which is a stronger receipt than a contact sheet |
| Frame-stability sampler (150 rAF frames × 7 scrollport heights) | RAN — 0 transitions everywhere |
| Appearance arms | RAN — owner row, `--appearance-preset maximal`, explicit `blurSurfaces`+`enableThemeColorization:false`; `compact`/`reading`/`diagnostics` SKIPPED (no density/typography question in the brief) |
| Theme arms | RAN — Hearth (no `data-theme`) and `--theme Light`; **Mocha SKIPPED** — the light/dark polarity fork is what both commits turn on |
| Skin arms | RAN — all 8 (`bubble flat document echo whisper hush ripple tide`) |
| Pane-state arms | SKIPPED — list docked / context collapsed only; neither finding is width-dependent (band is content-column-relative, composer spans the content track) |
| Mobile coarse arms | RAN — `device=coarse:dpr3:430x740`, band + port measurements |
| Two-sha control (`--ref d4e226a2e`) | RAN — `main-3933240-…`, the pre-#1873 band |
| Console triage | RAN — 0 errors / 0 page errors in every run; all warnings are the app's own `[perf]`/`[frame]`/`[reflow]`/`[drop]` dev channel during room boot, plus one `[drop] 88ms · aside[aria-label=Chats list]` under the motion arm |
| Retained-section inventory (`--map --include-hidden`) | SKIPPED — no Activity-retained sections on a chat room's reading surface |

## Issue summary (for the board row)

Side-eye `side-eye-F` drove the sticky attribution band (#1873, b9efacbe7) and the over-art
composer/bubble plate (#2389, d4e226a2e) live on d1a6bc17d. **#2389 verifies clean**: the composer's
light plate arm measures 6.48:1 over a dark plate and 6.72:1 over planted worst-legal white art, the
deliberately-unchanged dark arm holds 4.68:1 at the same bound, and the dark arm is byte-identical —
with the caveat that the three bubble rules are gated on `data-blur-messages`, which is OFF in both
the owner row and the shipped default, and that per-speaker `ThemeScope`s keep assistant/system
bubbles on the dark branch even under the Light theme, so only the user bubble ever takes the new
plate. **#1873 verifies clean on mechanism and regresses on pixels**: 150-frame rAF sampling at seven
scrollport heights (including 1010/1015/1019 straddling the 1012/1017 row heights) shows 0 verdict
transitions and `nonVirtualizedCls = 0`, but the top-only cancellation dropped the band's 8px bottom
padding, so the pinned name now abuts a sheared half-line of prose with ~5px of fill — P1, with the
untouched `tide` skin (still `pb: 8px`, 36px tall) as the in-build control, and a P2 that the inside
and outside spellings now render differently. Recommended fix is paint-only
(`box-shadow`/`::after` fill extension) so `exceedsViewport`'s input stays untouched. Two defects
found next door and filed with receipts: **P0** typed composer text at 1.13:1 in a card-themed room
under the Light app theme (`ThemeScope` emits `--*` and `color-scheme` but never `color`; the
textarea inherits `body`'s root ink — bounded to exactly one element), and **P1** the mobile chat
reading port at 185px of a 740px viewport in an RPG room. Full report:
`docs/reviews/side-eye/2026-09-19-attribution-band-and-composer-plate.md`.
