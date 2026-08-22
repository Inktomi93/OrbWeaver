---
kind: review
status: active
updated: 2026-08-22
---

# side-eye (lane se-visual) — coarse Switch shape (#420) + delight-axis carrier evidence (#285)

**Lane:** se-visual. **Mode:** FOCUSED (two named targets, worked depth-first in the briefed order).
**Stack:** live dev stack, `http://localhost:5173` (`:8788` API answered 401 = auth, i.e. up).
**Tree:** `main` @ `70e7c398c`. All receipts are rendered, not source-read.

## Verdict

| Target | Verdict |
| --- | --- |
| **#420 — coarse Switch shape** | **DO NOT SHIP the 48x44 as-is.** At `pointer: coarse` the Switch does not read as a switch; it reads as a crescent-moon / eclipse glyph. **Recommend: widen the coarse track to 4rem (64x44, aspect 1.455)**, keep the root-carried 44px height, keep the fine arm byte-identical. Receipts below. |
| **#285 — delight-axis carrier evidence** | Evidence delivered; **no ruling offered** (none needed from me) — but the receipts **contradict the fork's premise on today's tree** in three separate ways, and the owner should re-read the fork before spending a build on it. No arm is visually broken. |

---

# ITEM 1 — #420: does the coarse Switch still read as a switch?

## Method

`pnpm snap --mobile` (true iPhone 14 Pro Max emulation: `pointer: coarse` = `true`, `pointer: fine` =
`false`, DPR 3, touch) vs `--desktop`. Pointer media verified **in-page**, not assumed:
`matchMedia('(pointer: coarse)').matches === true` on every coarse arm
(`reports/snaps/se-visual-switch-coarse-pane.png` run). Real Switches, in the shipped app
(Settings → Appearance → Message style, and Settings → Chat behavior — 9 switch roots).

## Measured geometry (receipt)

| Arm | root box | aspect | thumb | thumb inset T/B | travel | radius |
| --- | --- | --- | --- | --- | --- | --- |
| fine (`pointer:fine`) | **48x32** | **1.500** | 32x32 | 0 / 0 | 16px | 9999px |
| coarse (`pointer:coarse`) | **48x44** | **1.091** | 32x32 | **6 / 6** | 16px | 9999px |
| coarse, widened sim (`--spacing-switch-track: 4rem`) | **64x44** | **1.455** | 32x32 | 6 / 6 | 32px | 9999px |

Tokens live: `--spacing-switch-track: 3rem` (48), `--spacing-switch-thumb: 2rem` (32),
`--spacing-touch-target: 2.75rem` coarse / `1.75rem` fine (`theme.css:86,94,95,185`).
The coarse height comes from `pointer-coarse:h-touch-target` on the root
(`packages/ui/src/primitives/switch/variants.ts:18`, landed 382e46d83).

## The verdict, in plain words

**It does not read as a switch at coarse. It reads as a moon.**

The defect is not "the aspect number dropped below 1.4" — it is *where the track ends up visible*. At
fine the thumb is exactly the track's height (inset T/B = 0), so the leftover track paints as a
sliver on ONE side and the eye reads "pill + knob, knob is on the right". At coarse the root grows
to 44 while the thumb stays 32, so the track now paints **on all four sides of the thumb** (6px above,
6px below, 16px beside) inside a fully-rounded 22px-radius capsule. A 32px dark disc surrounded by a
ring of ember on a near-circular field is a **crescent/eclipse glyph**, not a toggle.

- Full-pane, three ON switches stacked at coarse: `reports/snaps/se-visual-switch-coarse-rack.png` —
  three orange crescents down the pane. **That image is the finding.** Nobody reads those as switches.
- Magnified 6x, both states, all three arms:
  `reports/snaps/se-visual-switch-shape-comparison.png`.
- Side-by-side shipped-vs-widened at coarse, in the real settings rack:
  `reports/snaps/se-visual-switch-coarse-rack-comparison.png`.

Colour polarity was verified **by decoded pixel**, not by eye (standing law — my eye is not a
colorimeter): ON = ember track `rgb(247,127,32)` L=0.351 with a near-black thumb `rgb(31,16,7)`
L=0.007; OFF = grey track L=0.040 with a near-white thumb L=0.873. Track separation is excellent
(0.351 vs 0.040, far past the CT's 0.15 pin — F-08 holds). But note the **thumb luminance inverts
between states** (black when on, white when off). At fine the pill silhouette carries the "same knob,
moved" read despite that inversion; at coarse, with the silhouette gone, the two states stop looking
like one control in two positions and start looking like two different glyphs. That is why the coarse
shape loss costs more than the aspect ratio alone suggests.

## Findings

### [P1] The coarse-pointer Switch is not recognisable as a switch
- **What:** 48x44, aspect 1.091, track visible on all four sides of the thumb; renders as a crescent
  moon. Every touch user sees this; every desktop user sees the correct pill.
- **Why it hurts:** recognition-over-recall (Nielsen 6) is destroyed for the *entire* touch surface —
  a settings pane with 9 of these has no visible affordance vocabulary. It also breaks the token's own
  written rationale, which exists verbatim to stop the control "collapsing toward a near-square
  toggle" (`switch/variants.ts:3-4`), and owner defect #3's shape half.
- **Fix (recommended arm):** keep the root-carried 44px coarse height — it is honest, measurable, and
  now CT-pinned as *stronger* than the invisible `::before` union
  (`tests/ui/touch-target-floor.suite.ct.tsx:118-124`) — and **widen the coarse track token**:
  ```css
  /* packages/ui/src/styles/theme.css — beside the existing @media (pointer: fine) block at :183 */
  @media (pointer: coarse) {
    :root { --spacing-switch-track: 4rem; }
  }
  ```
  Why this spelling and not the `:root` = coarse / fine-overrides idiom used by `--spacing-touch-target`:
  a `@media (pointer: coarse)` block leaves the **fine arm and the unknown-pointer arm byte-identical**
  (3rem), which is what #371's fine-pointer receipts require. No class changes at all — `w-switch-track`
  and the thumb's `translate-x-[calc(var(--spacing-switch-track)-var(--spacing-switch-thumb))]` both read
  the var, so travel auto-scales 16px → **32px** and the checked thumb lands flush at the ON end.
  Coupled site to check: `packages/ui/src/tokens/index.ts:95` (the token registry entry stays 3rem — it
  is the base/fine value; confirm the generated-token gate is happy with a media-scoped override, the
  `--spacing-touch-target` precedent says yes).
- **Receipt:** rendered simulation of exactly that value, driven live at coarse —
  `reports/snaps/se-visual-switch-coarse-widened-on.png` / `-off.png` / `-pane2.png`, and the
  in-context rack `reports/snaps/se-visual-switch-coarse-rack-widened.png`. Measured 64x44,
  aspect 1.455; thumb pixel-measured flush to the ON end (dark run x=33..63 of 64 at mid-height).
- **Arms rejected, with numbers:**
  - *Accept-and-pin 48x44*: pins the crescent. The only argument for it is "the floor is met" — the
    floor is met either way (hit-area receipt below), so this arm buys nothing and costs the affordance.
  - *Revert to `::before`-only (visible 48x32 at coarse)*: restores the shape but contradicts the
    just-landed touch-floor CT rationale (visible box > invisible union) and re-opens #419. Rejected.
  - *Grow the thumb at coarse instead (thumb → 44, track 48)*: travel collapses to 4px — the exact
    regression `switch.ct.tsx:60-62` was written to prevent. Rejected on arithmetic.

### [P2] No CT arm pins the coarse shape at all — that is how this landed silently
- **What:** `tests/ui/primitives/switch/switch.ct.tsx:54` pins `w/h > 1.4` but runs in the **default
  (fine)** context; there is no `hasTouch` arm. `touch-target-floor.suite.ct.tsx` runs coarse but only
  asserts `height >= 44` — it is satisfied by a square.
- **Why it hurts:** the two pins together are *satisfiable by the defective shape*. Any future coarse
  geometry change repeats this.
- **Fix:** add a coarse arm asserting the same `w/h > 1.4` relation, in the hasTouch project — the
  relation, not the literal 64, so a later token change can't be green-by-constant.
- **Receipt:** the two files read in full; neither contains a coarse aspect assertion.

### [P3] The checked thumb overhangs the track's right border by 1px, at BOTH pointers
- **What:** travel is `track − thumb` = 16px, but the root has a 1px border on each side, so the
  content box is 46px wide, not 48. Measured `thumbInsetRight = −1` on every checked switch at fine
  **and** coarse (`se-visual-switch-fine-pane` / `-coarse-pane` eval output). Unchecked is correct
  (`thumbInsetLeft = 1`).
- **Why it hurts:** cosmetic asymmetry — the ON state's knob sits 1px proud of its own rim while the
  OFF state's knob sits inside it. Invisible at 1x on most themes; visible at DPR 3 on a light theme.
- **Fix:** subtract the border from the travel calc (token-legal spelling is the fix lane's call — a
  border-width var or an inset-shadow border rather than a raw `2px`). Pre-existing, **not** a
  382e46d83 regression.
- **Receipt:** rect math above, both arms.

## What is genuinely right about the coarse Switch (do not touch)

- **The hit area is honest and complete.** `elementFromPoint` at the coarse box's top edge, bottom
  edge and centre all resolve to the switch (owned = true); one pixel above/below resolves to the
  neighbouring field/section. 48x44 real, no invisible-overflow trickery. That is a genuine
  improvement over the `::before` union and it should survive whatever shape arm is chosen.
- **Keyboard + focus survive the shape change.** A real Tab walk (22 bare `--key Tab` presses inside
  the settings dialog) lands on `switch-root` with `:focus-visible === true` and a 1px
  `rgb(229,151,0)` outline at coarse. Shot: `reports/snaps/se-visual-switch-coarse-focus.png`.
- **State is not colour-alone.** Track luminance separation 0.351 vs 0.040 plus thumb position.

## ARIA / navigability (coarse arm)

Clean. `snap --aria '[role=dialog]'` at coarse returns proper names and state on every control:
`switch "Color quoted speech" [checked]`, `switch "Auto-fix unfinished formatting"`,
`switch "Show avatars in chat" [checked]`, `combobox "Chat display": Bubble`,
`slider "Chat width (%)": "60"`, `search "Settings search"`, `button "Close"`,
`region "Appearance settings"`, headings at level 2/3. **No unlabelled control, no missing landmark,
no colour-only state.** Nothing to fix here.

**Retraction (mine, same session):** my first focus probe read the focused switch's accessible name as
empty (`aria-label || textContent` = `""`) and I nearly filed an unnamed-control finding. That is the
known Base UI pattern — the Switch root is named by `aria-labelledby`, not by text content. The ARIA
tree above is the correct receipt; the eval was the wrong instrument.

---

# ITEM 2 — #285: delight-axis carrier evidence (evidence only, no ruling)

Read first: `gh issue view 285` including both owner comments — the 2026-08-19 ruling (arm **a**, a
Surface-tier carrier) and the later **scope correction** (grain already reaches everything; the ruled
carrier scopes to elevation/glow only).

## Method

`--appearance-preset defaults` vs `--appearance-preset maximal` on each waiting surface, plus
**single-axis isolation** (`--appearance-preset defaults --appearance '{"elevation":"glow",…}'` etc.),
plus a carrier comparator (**home**, the one surface with an on-screen `[data-slot=card-root]` in the
CONTENT region). Deltas are **decoded-pixel** comparisons, never `rgb()` regexes over computed style
(colours are oklch) and never `getComputedStyle` for anything paint-only (grain is a `::after` image;
only the framebuffer sees it). Every host's on-screen-ness was re-checked — off-viewport hosts are
phantoms.

## Per-surface pairs (the deliverable)

| Surface | with delight ON, beside the carrier | defaults / maximal fulls | where the delta lands |
| --- | --- | --- | --- |
| **presets** | `reports/snaps/se-visual-presets-vs-carrier.png` | `se-visual-presets-defaults.png` · `se-visual-presets-maximal.png` | `se-visual-presets-delta-map.png` (10x), `se-visual-presets-glow-only-delta-map.png` (24x), crop `se-visual-presets-carrier-crop.png`, axis strip `se-visual-presets-axis-strip.png` |
| **refinery** | `reports/snaps/se-visual-refinery-vs-carrier.png` | `se-visual-refinery-defaults.png` · `se-visual-refinery-maximal.png` | `se-visual-refinery-delta-map.png`, crop `se-visual-refinery-carrier-crop.png` |
| **databank** | `reports/snaps/se-visual-databank-vs-carrier.png` | `se-visual-databank-defaults.png` · `se-visual-databank-maximal.png` | `se-visual-databank-delta-map.png`, crop `se-visual-databank-carrier-crop.png` |
| *carrier comparator* | **home** | `se-visual-home-defaults.png` · `se-visual-home-axis-glow.png` · `se-visual-home-maximal.png` | crop `se-visual-home-carrier-crop.png` |

### Measured delta (defaults → arm), whole viewport

| Surface | arm | any-diff px | strong-diff px (>12/255) | file size |
| --- | --- | --- | --- | --- |
| presets | maximal (all) | 18.5% | 0.54% | 2.19x |
| presets | **elevation=glow only** | **10.8%** | **0.03%** | — |
| presets | texture=grain only | 8.7% | 0.00% | — |
| presets | colorization only | 0.5% | **0.51%** | — |
| refinery | maximal | 57.4% | 1.10% | 3.46x |
| databank | maximal | 24.4% | 0.43% | 2.82x |
| chats (control) | maximal | 32.0% | 0.46% | 1.95x |
| **home (carrier)** | **elevation=glow only** | 65.8% | **0.01%** | — |
| home (carrier) | maximal | 83.9% | 1.16% | — |

Region-scoped amplitude (max channel delta inside the host):

| Host | glow-only | maximal |
| --- | --- | --- |
| home's `card-root` region (the carrier) | **max 3/255**, mean 0.24, 0.00% of px >8 | max 26/255, 1.70% >8 |
| presets' list `shell-panel` region (the "no carrier" surface) | **max 30/255**, mean 0.18, 0.13% >8 | max 29/255, 0.88% >8 |

## Per-surface visual read

**presets.** With every ornament on, presets looks *almost exactly like presets with nothing on*. The
24x-amplified glow-only delta map (`se-visual-presets-glow-only-delta-map.png`) shows precisely where
the elevation axis lands: a hairline + soft ambient bloom along the LIST panel and along both seams
where the panels meet the content region, plus the active rail item and the avatar. **The content
region's interior is pure black in that map — untouched.** So the axis *does* reach presets, on its
two shell panels, and does *not* reach the middle where the read-only instrument sections live. The
only change a person would actually notice at 1x on this surface is the warm amber hairline that
appears around the search field and under the header band — and the axis isolation says that is
**`enableThemeColorization`, not glow and not grain** (colorization alone: 0.51% strong-diff; glow
alone: 0.03%). Beside home at maximal, presets reads flatter and quieter, but as a *deliberate
instrument surface*, not as a broken one.

**refinery.** The most interesting arm, and the one that most contradicts the fork's framing.
Refinery's CONTENT region renders **four visible `[data-slot=card-root]`** — (325,207,686x425) and
three step cards at y=656 — and their computed `box-shadow` goes from `none` at defaults to the full
four-layer `oklch(1 0 0 / .06) 0 0 0 1px, oklch(1 0 0 / .08) 0 1px 0 inset, oklch(0 0 0 / .4) 0 2px 4px,
oklch(0 0 0 / .5) 0 12px 32px` stack at maximal. Refinery is a *carrier surface today*. Beside home at
maximal (`se-visual-refinery-vs-carrier.png`) the two surfaces read as peers — same warm card rims,
same grain, same ambient lift. Refinery's list and context panels happen to be off-canvas at this
width (list at x=−307, context at x=1280), so 100% of its ornament is content-region ornament.

**databank.** The thinnest arm, and the reason is data, not paint: the surface is EMPTY (no documents),
so the content region is a large void holding one centred empty state, and the list panel holds a
second empty state. The delight axes land on the list panel (on-screen, x=56) exactly as on presets;
the context panel is off-canvas (x=1280) so its share of the carrier paints nothing on screen. Beside
home at maximal, databank looks stark — but that is an **empty-data** read, not a carrier read. Judging
the carrier question from this surface in its empty state would be judging the wrong variable; if the
owner wants databank in the decision, it needs a populated fixture.

## Three receipts the owner should see before spending a build on #285

These are stated as **evidence**, not as a ruling, and each carries its own measurement:

1. **The ruled carrier already exists on the tree, and it already applies to all three surfaces.**
   `packages/client/src/styles/globals.css:451-461` — `.shell-grid[data-elevation="glow"]
   [data-slot="surface-root"] > :first-child { filter: drop-shadow(0 12px 32px
   var(--color-shadow-ambient-far)); }`, with a header comment that is verbatim arm (a) ("Instrument
   surfaces deliberately carry no card box (CD1), but elevation is an appearance axis rather than a
   card privilege"). It landed in `73fda94b3` *fix(shell): render surface glow carrier* (2026-08-20),
   committed and clean on the tree. Driven live at `elevation: glow`, the computed filter on the Surface's first child
   is `drop-shadow(oklch(0 0 0 / 0.5) 0px 12px 32px)` on **presets, refinery and databank**; at
   `defaults` it is `none`. Whether #285 is still open work is a lifecycle question for the
   orchestrator, not mine — but the mechanism is built and live.
2. **The premise "instrument-tier surfaces render neither carrier" is not true today.** Every one of
   the three renders `.shell-panel` hosts that take the four-layer stack at maximal, refinery renders
   four content `card-root`s that take it, and all three take the Surface-tier drop-shadow.
3. **The axis is sub-perceptual *on the carrier too* — which reframes the whole fork.** Turning
   `elevation: glow` on changes home's card region by a **maximum of 3/255** on any channel, because
   that card already carries the identical four-layer `--shadow-overlay` recipe at `elevation: flat`
   (verified by reading the WHOLE computed `box-shadow`, not a slice — Tailwind v4 emits four empty
   layers before the real ones; defaults = 4 empty + the same 4 real, glow = the same 4 real). Meanwhile
   the same axis changes presets' list panel by up to **30/255**. So on the pixels, the instrument-tier
   surface currently receives *more* visible elevation delta than the flagship carrier does. "A user
   who turns on every ornament gets nothing on half the app" is measurably closer to "a user who turns
   on this ornament gets nearly nothing anywhere" — and the arm they *would* notice (the amber rims) is
   `enableThemeColorization`, a different axis that is not part of the fork.

**Is any arm visually broken?** No. No text is unreadable in any arm, no image is distorted, no layout
breaks between defaults and maximal, and grain (`html[data-texture="grain"] .shell-grid::after`,
opacity 0.04, soft-light, `display:none` under `prefers-contrast: more` at
`packages/client/src/styles/globals.css:268-271, 430-449`) is entirely sub-12/255 everywhere I measured.
Two things worth a second look, neither blocking:
- Grain is hosted on `.shell-grid::after` — i.e. the WHOLE shell including the content region and any
  reading text under it, not "chrome/cards only". At 0.04 soft-light it costs nothing measurable, but
  the reading-surface rule's carrier list and this selector disagree on paper; someone should decide
  which is the law. (I did not drive a live transcript for this — out of scope for this brief.)
- **Databank shows two empty states at once** (list panel "No documents yet / Add a document", content
  "Your databank / Pick a document…"), saying nearly the same thing twice with only one CTA. That is a
  §13 IA duplication smell, unrelated to #285. Receipt: `se-visual-databank-vs-carrier.png`, left half.

---

## Taste & flow verdict (both items, plain words)

**The coarse Switch looks like shit.** Not "suboptimal" — a rack of them reads as a column of moon-phase
icons, and the first thing a touch user has to do is learn that the crescent means "on". The desktop
switch is fine and always was. This is the single worst-looking thing I drove tonight and it is on the
surface where a user changes everything else.

**Presets / refinery / databank do not look impoverished.** Driven cold, they read as calm instrument
surfaces — kicker labels with hairline rules, generous whitespace, a clear single job per pane.
Refinery in particular is the best-flowing of the three: the "score → rewrite → analyze" title states
the job, the character picker is where your eye lands, and the three step cards read left-to-right in
the order you'd do them. Databank's void is a data problem, not a design one. If the owner is deciding
#285 on "does the app feel dead with ornaments on", the honest answer from the pixels is that ornaments
on vs off is **not a difference a person perceives on any of these surfaces, including the carrier** —
the perceived warmth in the maximal shots comes from colorization, not from glow or grain.

**Flow note (presets):** at maximal *and* at defaults the presets content region is one large empty
state while the answer to "what is active" sits in the right-hand context panel. Two homes for the same
question — the empty state says "Pick a preset to edit…" while the context panel is already showing the
active preset's full readout. Not in scope, filed as an observation.

---

## Retractions

- **Mine, mid-run:** I first read the warm amber hairline in the presets maximal crop as the *glow*
  carrier. The single-axis isolation killed that: glow-only is 0.03% strong-diff, colorization-only is
  0.51%. The rim is colorization. Any earlier pass that attributed visible warmth on an instrument
  surface to the delight axes was reading the wrong axis.
- **Mine, mid-run:** my first widened-arm geometry eval reported `travel 16px / thumbInsetRight 15`,
  which I nearly reported as "widening does not restore travel". It was a **mid-transition read** — the
  thumb has a 130ms transform transition and the eval fired inside it. The framebuffer settles at
  travel 32px (dark thumb run x=33..63 of 64). Pixels overruled the rect.
- **Inherited premise, #285:** "instrument-tier surfaces measured NO visible delta / render neither
  carrier". Not reproducible on `70e7c398c` — see the three receipts above. The lanes that measured it
  may have been right at the time; the Surface-tier carrier at `globals.css:451-461` and refinery's four
  content card-roots change the answer now.

## Instrument coverage

| # | Instrument | Status |
| --- | --- | --- |
| 1 | `snap --map` / `--aria` / `--contrast` / `--eval` / `--expect-*` | **RAN** — `--aria '[role=dialog]'` (names/state, coarse); ~20 `--eval` geometry/hit/attribution probes; `--map '[role=switch]'` returned 0 and was **replaced** by a DOM census after probing it (Base UI Switch root is a `<span role="switch">` — the map's own selector engine matched nothing; instrument-skepticism receipt, not a product fact). `--contrast` **SKIPPED for the Switch by design** — snap skips control-TRACK roles (switch/slider/progressbar); the on/off separation was measured by decoded pixel luminance instead (0.351 vs 0.040). |
| 2 | `pnpm design-audit --mobile` | **RAN** — `reports/design-audit/root.json`, coarse pointer, census 551: `findings=1 p0=0 p1=0 p2=0 p3=1`. The single P3 (`all-caps-body`, "uppercase on 34 chars") resolves to `Sabine Veyra · Calamity · Morgatha` — the home card's participant micro-caps label behind the modal — i.e. the ratified KICKER/micro-caps voice: **FALSE POSITIVE, not forwarded**. **Zero tap-target findings at coarse confirms the 44px floor.** Note for the record: the detector has **no rule for control aspect ratio**, so it is structurally blind to this item's entire defect — a green design-audit is a floor, not a verdict. |
| 2b | `pnpm design-audit` (desktop arm) | **SKIPPED** — the target is a pointer-conditional defect; the fine arm's geometry is unchanged by this commit and was covered by the CT pin + direct measurement. |
| 3 | `pnpm motion-audit` | **SKIPPED** — neither target is a motion question. The one motion-adjacent risk (the thumb's 130ms transition) was covered by the mid-transition retraction above. |
| 4 | `pnpm perf-meter` | **SKIPPED** — no primary-action latency question in either brief item. |
| 5 | Lighthouse (MCP, desktop + mobile) | **SKIPPED** — FOCUSED review; axe adds nothing to a shape verdict, and the ARIA arm came back clean via `--aria`. Would be required on a FULL audit of these surfaces. |
| 6 | `__orb` suite (`.motion()`, `.perf()`, `.renders()`, `.flags()`) | **PARTIAL** — `__orb.shell()` used for nav-state verification; the rest skipped for the same reason as rows 3-4. |
| 7 | Console triage | **RAN** — every arm: `console-errors=0`, `page-errors=0`. Warnings across runs are three classes, all boot-window: `[frame] long frame 139-154ms · blocking 89-104ms` at `main.tsx`, `[reflow] style/layout ran inside that frame` (same frame), `[drop] 54-136ms rendered frame mid-animation · svg[aria-label=Orbweaver] / [data-slot=weave-veil]`. **INVESTIGATE** (not "it's dev mode"): the boot splash animation drops frames over budget on a cold route load, reproducibly, on every one of ~25 runs. Out of scope for this brief — filing it as a pointer, with the note that `--checkpoint` would scope it out of a future run's verdict. |
| 8 | The PNGs, actually looked at | **RAN** — 12 images read and judged, incl. three purpose-built magnified comparison sheets. |
| 9 | Keyboard walk | **RAN** — 22 bare `--key Tab` presses inside the settings dialog at coarse, `:focus-visible === true` at the switch, 1px `rgb(229,151,0)` outline; walk ended on `select-trigger "Reveal on hover"`. |
| 10 | Appearance-preset arms | **RAN** — `defaults` + `maximal` on 4 surfaces, plus three single-axis isolations (`elevation=glow`, `surfaceTexture=grain`, `enableThemeColorization`) on presets and `elevation=glow` on home. `compact` / `reading` / `diagnostics` **SKIPPED** — neither briefed target is density- or typography-dependent. `--theme` arms **SKIPPED** — no light-sensitive finding in either item (the one polarity-adjacent observation, thumb luminance inversion, is polarity-symmetric by construction: the checked track rides `--color-foreground`). |
| 11 | Pane-state arms | **PARTIAL, and it changed a conclusion** — pane visibility was measured per surface rather than assumed, which is how refinery's off-canvas panels (list x=−307, context x=1280) and databank's off-canvas context panel were caught; treating `.shell-panel` presence in the DOM as on-screen would have mis-stated where the carrier lands. Full four-state matrix (both open / list collapsed / context hidden / both hidden) **NOT** run — out of scope for two targeted questions; a FULL audit of these surfaces owes it. |

## Screenshots (all under `reports/snaps/`, `se-visual-` prefixed)

**#420:** `se-visual-switch-fine-pane.png` · `se-visual-switch-coarse-pane.png` ·
`se-visual-switch-fine-on.png` · `se-visual-switch-fine-off.png` · `se-visual-switch-coarse-on.png` ·
`se-visual-switch-coarse-off.png` · `se-visual-switch-coarse-widened-on.png` ·
`se-visual-switch-coarse-widened-off.png` · `se-visual-switch-coarse-widened-pane2.png` ·
`se-visual-switch-shape-comparison.png` (the 3-arm magnified sheet) ·
`se-visual-switch-coarse-rack.png` · `se-visual-switch-coarse-rack-widened.png` ·
`se-visual-switch-coarse-rack-comparison.png` (**the money shot**) ·
`se-visual-switch-coarse-focus.png`

**#285:** `se-visual-presets-vs-carrier.png` · `se-visual-refinery-vs-carrier.png` ·
`se-visual-databank-vs-carrier.png` · `se-visual-{presets,refinery,databank,chats}-{defaults,maximal}.png` ·
`se-visual-{presets,refinery,databank,chats}-delta-map.png` ·
`se-visual-{presets,refinery,databank,chats}-carrier-crop.png` ·
`se-visual-presets-axis-{glow,grain,colorization}.png` · `se-visual-presets-axis-strip.png` ·
`se-visual-presets-glow-only-delta-map.png` · `se-visual-home-{defaults,axis-glow,maximal}.png` ·
`se-visual-home-carrier-crop.png`
