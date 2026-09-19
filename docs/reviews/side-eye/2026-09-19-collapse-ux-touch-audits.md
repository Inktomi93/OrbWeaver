---
kind: review
status: active
updated: 2026-09-19
---

# List-collapse felt transition (#1316) · tooltip-on-touch · modal scroll-lock on touch — live drive

Lane `side-eye-M`, 2026-09-19. Three focused audits driven against the live dev stack
(`:5173`/`:8788`) with `pnpm snap`. Read-only; no fixes.

**Environment note (stated, not a blocker).** `/healthz` named `a43e9305fece` at drive start. Three
merge trains landed under the drive — the `RUN` lines walk `a43e9305fece → d48647d1165c →
01330325f8d6`. `git diff --stat a43e9305f d48647d1165c` and the follow-on are TOOLING-ONLY
(`tooling/src/snap/**`, `tests/tooling/**`, one `domain/embeddings` caption file, one ledger). No
client, `@orb/ui` or shell file moved, so every receipt below describes the same rendered code. No
isolated stage was used (the live stack answered every question); no engines were touched.

**Appearance arms.** The owner's live row is `data-reduced-motion=false`, `data-texture=grain`,
`data-elevation=ramp`, `--font-scale: 1.25`. Every load-bearing motion measurement below was taken
TWICE — once on that row and once under `--appearance-preset defaults` (font-scale 1, rem 16) — and
the two arms disagree in a way that is itself a finding (A1-2).

## Verdict

- **AUDIT 1 (#1316 felt transition) — SHIP WITH FIXES.** The thing #1316 and #1646 were built to fix
  is fixed and holds under measurement: the topbar trail does not move at all, the transcript rows do
  not jump, keyboard focus survives, and the collapse costs no CLS. Two counter classes were missed
  and both are measurable: the **composer lurches 154 px sideways on the first painted frame of every
  dock/undock** (and shears against the transcript by the same amount), and on a **phone the list
  panel enters from double its own width** because the mobile `animation: none` cancel is
  out-specified. A third, smaller one: the centred counter's magnitude is exact only at the shipped
  default font scale.
- **AUDIT 2 (tooltip-on-touch) — DO NOT SHIP as-is.** The premise is confirmed at the mechanism and
  it is worse than "some icon is unlabelled": `HintTrigger` — the anatomy behind `<Field hint>` and
  `<Section hint>`, **92 call sites, exactly 1 of which passes a touch fallback** — renders a 55×55
  button on a phone that does literally nothing, and whose `aria-describedby` resolves to nothing at
  rest. 15 of them on one settings pane. The composer's guided cluster puts its disabled reasons and
  its "who replies next" cue in the same dead channel.
- **AUDIT 3 (modal scroll-lock on touch) — SHIP.** I attacked this and it held. Base UI's scroll lock
  is structurally a no-op here (the document does not scroll; `html`/`body` are `overflow: clip`),
  but every dialog/drawer/menu class covers the viewport with a pointer-intercepting presentation
  layer, every popup fits the viewport with a working inner `overflow-y: auto`, and the background
  scroller's position is never disturbed so nothing needs restoring. One P3 nuisance on the
  non-modal popovers.

---

## AUDIT 1 — the list-panel collapse/expand, felt

### Method

The receipt for every claim here is a **per-`requestAnimationFrame` `getBoundingClientRect()` census**
installed by a queued `--eval` before a real `--click` on the toggle, dumped by a later `--eval`
(change-rows only). This is the same instrument #1316's own fix note used. It exists because the
metric instruments cannot see this class:

- `snap --motion` **REFUSED** on this surface (exit 2, `motion=REFUSED`, `frames-raw=0/0`,
  `frames-population-raw=uncomputable`, "the frame population: absent") — headless has no vsync.
  **NO VERDICT on dropped frames.** Run `reports/runs/snap/main-2135069-2026-09-19T14-20-37-206Z`.
- `__orb.motion()` before vs after the toggle is **identical** except one new entry:
  `value=0.00008 hadRecentInput:true sources:["[data-testid=composer-guided-swipe] moved 206px,0px"]`.
  A real click sets `hadRecentInput`, so that 206 px horizontal jump is **excluded from CLS by
  construction**. `dirty-animations=0`. Run `main-2136980-2026-09-19T14-21-09-632Z`.

So the lane's "0 % dropped, CLS 0 at 4× CPU" is **true and I am not disputing it** — and the
transition is still visibly wrong. That gap is the point of this audit.

### What holds (measured, do not touch)

| Element | Docked rest | First painted frame | Verdict |
| - | - | - | - |
| `.shell-topbar-trail` | x=1001 | x=1001, and every frame after | **#1316's counter is exact.** Zero motion. |
| `.shell-main` | x=363 | x=363 (held), then glides to 56 | The FLIP's `from` corner is correct — no jump. |
| `[data-slot=message-row]` | x=437 | x=438 (+1 px), then glides to 284 | **#1646's counter is exact at `defaults`.** |
| focus after activation | — | `BUTTON [Show list panel] fv=true`, not inert | Keyboard-clean, see below. |

Run `main-2127399-2026-09-19T14-18-53-194Z` (`--appearance-preset defaults`).

**Keyboard (Sam).** `--key '[aria-label="Hide list panel"]=Enter'` collapses the panel; focus stays on
the same button, which re-labels `Hide list panel` → `Show list panel` and flips `aria-expanded`
`true` → `false`, with `:focus-visible` **true** and no `[inert]` ancestor. Tab continues
`Show list panel → Members — 2 → Memory — idle → ⌘K jump`. No orphaned focus, no focus-to-body.
Run `main-2147941-2026-09-19T14-23-40-645Z`.

**Content reflow.** Per-slot box census, both modes, same run
(`main-2145390-2026-09-19T14-23-13-763Z`, owner appearance):

```
collapsed  main x=70  w=1210 | message-row x=213 w=923 | composer x=213 w=923 | bubble x=261 w=780
docked     main x=410 w=870  | message-row x=420 w=850 | composer x=420 w=850 | bubble x=468 w=780
```

The reading track and the composer share the same box in both modes. **Retraction:** my first read of
the collapsed screenshot said the composer and the transcript were misaligned by ~48 px. The census
says the *outer tracks are identical*; what my eye read was the assistant `message-bubble` sitting
inside its row with a 48 px lead gutter and a 95 px trailing gutter (the reserved user-side column).
That is a chat idiom, not a defect. Filed as a taste note only.

### \[P1] The composer lurches 154 px sideways on the first painted frame of every dock/undock

**What.** `[data-slot=composer]` carries `CHAT_TRACK` (`orb-chat-track w-full
max-w-(--width-shell-content)`, `chat-track.ts:32`) — the same centred-by-auto-margins box that
\#1646's counter exists for — but the counter selector names only `[data-slot="message-row"]`
(`shell.css:449-454`, and the settle twin at `:502-507`). Nothing cancels the composer's placement
delta, so it rides `.shell-main`'s full-track translate.

**Receipt** — per-rAF x, `--appearance-preset defaults`, collapse direction, run
`main-2127399-2026-09-19T14-18-53-194Z`:

```
  0ms  main=363  row=437  composer=437   <- rest, aligned
136ms  main=363  row=438  composer=591   <- first painted frame: composer is +154px RIGHT of where the user last saw it
158ms  main=240  row=376  composer=468
171ms  main=163  row=338  composer=391
188ms  main=119  row=315  composer=347
321ms  main=56   row=284  composer=284   <- rest, aligned again
```

Docking direction, same class, opposite sign (run `main-2157266-2026-09-19T14-25-18-902Z`):
`composer 284 → 130 (−154px) → 437`.
Owner appearance (font-scale 1.25, track 340), run `main-2122117-2026-09-19T14-17-57-818Z`:
`composer 420 → 553 (+133px) → 213`.

**Why it hurts a user.** This is the exact defect shape #1316 named for the topbar trail: *"riding
the full-track counter-translate therefore did not cancel motion, it MANUFACTURED it."* The composer
is the one thing on a chat screen the user is about to put their hands on. It leaves its resting
position toward the right edge on frame 1, then sweeps back across 154 px while the transcript
directly above it stays still — so the reading column and the composer visibly **shear apart by
154 px** and reconverge over ~190 ms. Every toggle. Both directions.

**Fix.** `animate: the composer and the remaining CHAT_TRACK carriers` — add the `CHAT_TRACK` family
to the `#1646` centred counter (and its settle twin) rather than only `[data-slot="message-row"]`.
The carriers, all of which take the identical `orb-chat-track` marker and therefore the identical
Δ/2 delta: `[data-slot=composer]`, `[data-slot=composer-slash-strip]`,
`[data-slot=composer-attachments]`, `[data-slot=composer-drop-target]`,
`[data-slot=chat-above-composer]`, `OptionStrip aria-label="Command arguments"`. The honest selector
is the marker class itself (`.orb-chat-track`), which is what makes this one rule instead of six —
and `[data-slot=message-row]` already carries it, so the existing row rule folds in.
**Receipt that proves the fix:** the same per-rAF census showing `composer` within ±2 px of its rest
x on the first painted frame, on both directions, in both appearance arms.

### \[P1] On a phone the list panel enters from DOUBLE its own width — the mobile FLIP cancel is out-specified

**What.** `shell.css:1234-1237` cancels the FLIP on a phone with
`.shell-grid[data-list-flip] .shell-main, … .shell-topbar-trail, … [data-slot="message-row"], …
.shell-panel[data-panel-side="list"] { animation: none }`, under a comment that states
*"NO FLIP ON A PHONE."* Three of those four win their specificity contest (equal specificity, later
in source). **The fourth loses.** The panel's own FLIP rule is
`.shell-grid[data-list-flip="in"] .shell-panel[data-panel-side="list"][data-panel-mode="docked"]`
(`shell.css:372`) — five attribute/class simple selectors against the cancel's four — so
`shell-list-panel-in` keeps running on mobile, **and it animates `translate` while the panel's own
mobile rule transitions `transform`.** Two different properties, so they compose instead of
overriding.

**Receipt.** Computed style on the mobile panel immediately after docking, run
`main-2153717-2026-09-19T14-24-40-001Z`:

```
animationName = "shell-list-panel-in"   animationDuration = "0.22s"
transitionProperty = "transform"        transitionDuration = "0.22s"
matchMedia("(width < 48rem)") = true    device=coarse:dpr3:430x740
```

Per-rAF x of `.shell-panel[data-panel-side=list]` across a real tap on `Back to Chats`, run
`main-2150880-2026-09-19T14-24-07-915Z` (viewport 430 wide):

```
  7ms  listpanel=-430   <- collapsed rest (one panel-width off-canvas)
256ms  listpanel=-860   <- first painted frame: TWO panel-widths off-canvas
274ms  listpanel=-516
286ms  listpanel=-301
424ms  listpanel=-5
452ms  listpanel=0
```

`.shell-main` held x=0/430 throughout — the other three cancels work.

**Why it hurts a user.** On an expo ease-out, half the travel happens in the first ~25 % of the
duration, and on this phone that first half is entirely **off-screen**: the list appears to do
nothing, then snaps in over the last ~60 ms. The "no flip on a phone" ruling is stated in the CSS and
is not what ships.

**Fix.** `animate: the mobile list-panel cancel` — raise the cancel to at least the FLIP rule's
specificity (match `[data-panel-mode="docked"]` in the cancel too, or cancel `animation` on
`.shell-panel[data-panel-side="list"][data-panel-mode]`), and cancel `translate`/`transform` as one
decision so the two properties cannot compose again. **Receipt:** the same per-rAF census showing the
panel's first painted frame at −430, never −860, and `animationName: none` in the computed style at
coarse.

### \[P2] The centred counter's magnitude is exact only while the docked track is wider than `--width-shell-content` — and the owner's own font scale breaks that condition

**What.** #1646's counter is `calc(var(--list-track-docked) / 2)`, derived from *"a FIXED-width box
centred by auto margins in a parent that resizes by Δ moves by Δ/2"* (`shell.css:419-437`). The box
is not fixed-width — it is `max-w-(--width-shell-content)`. When the docked content column is
NARROWER than that cap the box is width-constrained, its width changes with the track, and its honest
left-edge delta is no longer Δ/2.

**Receipt** — two arms, same code, same viewport 1280×800:

| Arm | `--list-track-docked` | row width docked → collapsed | honest delta | counter applies | residual |
| - | - | - | - | - | - |
| `--appearance-preset defaults` (rem 16) | 307 px | 768 → 768 (fixed) | 153.5 px | 153.5 px | **0** (`437 → 438`) |
| owner row (`--font-scale: 1.25`, rem 20) | 340 px | **850 → 923** (constrained) | 207 px | 170 px | **37 px** (`420 → 383`) |

Runs `main-2127399-…` (defaults) and `main-2122117-…` (owner). `--width-shell-content` resolves
`clamp(46.125rem, 60dvw, 100dvw)` = 922.5 px at rem 20 against an 850 px docked track.

**This contradicts a recorded ruling** and I am naming both sides: #1646's fix note says the delta
"is arithmetic, not a chat-feature fact" and cites `154 = 307/2 exactly`. That measurement is
reproducible and correct **at rem 16**. It is not a property of the mechanism; it is a property of the
regime where the cap is not binding. At the owner's own appearance the transcript jumps 37 px left on
the first painted frame of every collapse.

**Why it hurts a user.** Small next to the composer's 154 px, but it is the transcript — the thing
being read — and it is on by default for this account.

**Fix.** Derive the centred counter from the measured delta rather than from half the track: the box's
own `Δ/2` equals `(trackDelta − widthDelta)/2`, and `widthDelta` is zero exactly when the cap binds on
both sides. Either clamp the counter the same way the box is clamped, or make the chat track's width
regime-independent so the fixed-width premise is true. **Receipt:** the per-rAF census showing the
first painted row x within ±2 px of rest in BOTH appearance arms (today only `defaults` passes).

### Fine / no finding

- **Topbar trail.** Holds. Constant x in all six arms measured.
- **Reduced motion.** `--reduced-motion` correctly takes the `data-list-settle` path: exactly one held
  frame (`main=363 row=438 trail=1001 settle=out`), then one cut to rest. The `#262` settle is doing
  its job for `.shell-main`, the trail and the rows — the composer is the one rider with no counter,
  so on this arm it **flashes 154 px right for one painted frame** instead of gliding. Same fix, same
  P1 (`shell.css:502-507` needs the same carrier list). Run
  `main-2132300-2026-09-19T14-19-54-162Z`.
- **The collapsed rail is usable.** There is no residual list rail by design: the panel goes fully
  off-canvas (`rect=-340,0 340x800`, `position: absolute`, `visible=false`, `inert=true`) and the
  single affordance is the re-labelled topbar toggle at `x=80,y=9 43×43`. It is the first control in
  the topbar and the first Tab stop. Discoverable, and the `inert` on the hidden panel is correct.
- **Mobile has no collapse.** In a room the mobile topbar is `Back to Chats / Show details / Report a
  bug`; the list is a full-screen page, not a track. The right idiom. Run
  `main-2133813-2026-09-19T14-20-18-454Z`.

**Nielsen (this surface only, honest):** 4-Consistency 4 · 1-Visibility 3 (the label+`aria-expanded`
pair announces the state; the motion misreports what moved) · 3-Control 4 · 8-Aesthetic 2 (the
composer shear is the whole of this score).

**Issue summary (paste into the #1316 row).** The #1316/#1646 counter lineage is correct and holds
under a per-rAF census: the topbar trail is pinned at a constant x, `.shell-main` holds its FLIP
`from` corner, transcript rows do not jump at the shipped default appearance, keyboard focus survives
the toggle on the re-labelled control, and the collapse contributes no CLS. Three carriers were
missed. (1) `[data-slot=composer]` and the five other `orb-chat-track` strips take the same centred
Δ/2 delta as `[data-slot=message-row]` but are not in the counter, so the composer lurches 154 px
sideways on the first painted frame of every dock/undock and shears against the transcript by the
same amount for ~190 ms — measured in both directions and in both appearance arms, and invisible to
CLS because a real click sets `hadRecentInput`. (2) `shell.css`'s mobile "NO FLIP ON A PHONE" cancel
is out-specified by the panel's own `[data-panel-mode="docked"]` FLIP rule, so on a 430 px phone the
list panel starts its entrance at −860 px (two panel widths) — the `translate` keyframe composes with
the panel's own `transform` transition — and the first half of the animation plays off-screen.
(3) the centred counter's `--list-track-docked / 2` is exact only while the docked track is wider than
`--width-shell-content`; at the owner's own `--font-scale: 1.25` the row is width-constrained
(850→923) and the counter leaves a 37 px residual jump, which contradicts #1646's "fixed-width box"
premise (true at rem 16, false at rem 20). `snap --motion` REFUSED on this surface (headless, zero
frames) — no dropped-frame verdict was taken.

---

## AUDIT 2 — tooltip-on-touch

### The premise, confirmed at the mechanism (not by a synthetic tap)

Two receipts from the installed `@base-ui/react@1.7.0`:

- `tooltip/trigger/TooltipTrigger.js:147` — the hover interaction is created with **`mouseOnly: true`**,
  so a non-mouse pointer never opens a tooltip.
- `floating-ui-react/hooks/useFocus.js:104` — the focus path returns early unless
  **`matchesFocusVisible(target)`**. A touch tap focuses a `<button>` but does not make it
  `:focus-visible`, so **focus does not rescue touch either**.

**Honest method statement.** I could not produce a true finger-tap receipt: `snap` has no touch-tap
verb (`--click` is a CDP *mouse* dispatch even under `--mobile`), and my in-page
`PointerEvent{pointerType:"touch"}` probe failed its own positive control — the `"mouse"` arm also
produced zero tooltips (run `main-2164829-2026-09-19T14-26-42-647Z`), so that probe measured nothing
in either direction and I am not citing its zero. **NAMED SNAP GAP: there is no way to dispatch a real
touch tap** (`Input.dispatchTouchEvent` / `locator.tap()`), which makes every touch-interaction
question in this codebase answerable only from vendored source. That is worth a tooling row.

What I *did* prove live, with a two-direction control on the same element:

| Arm | Result | Run |
| - | - | - |
| desktop `--hover` on a hint trigger | **1 tooltip**, text `"Affects every reply that stops at the length cap."`, `aria-describedby` resolves = **1** | `main-2177911-2026-09-19T14-29-26-697Z` |
| mobile `--click` (mouse dispatch) on the same control | **0 tooltips**, `activeElement` null, `aria-describedby` resolves = **0** | `main-2175214-2026-09-19T14-28-41-627Z` |

So even a *mouse click* on these controls delivers nothing — hover (or a keyboard `:focus-visible`)
is the only door, and a phone has neither.

### The inventory

Every `Tooltip`-wrapped control in the shell, classified. "Visible label at coarse" is measured from
the live mobile DOM (`innerText` per control, run `main-2179529-2026-09-19T14-29-48-487Z`).

| Control | Home | Name at coarse | Tooltip carries | Verdict |
| - | - | - | - | - |
| Rail tabs ×10 + Settings + You | `rail-button.tsx:57-89` | aria-label **and a visible text label** (`Home`, `Chats`, `Characters`, …) | the same string | **FINE — the exemplar.** The rail solves this correctly. |
| `Playing as Traveler` persona chip | `persona-panel-surface.tsx:168-182` | aria-label only | the same string | FINE |
| `⌘K jump — the command menu` | `command-chip.tsx:25-77` | aria-label only | `Jump to…` (strictly less) | FINE |
| Notifications bell | `notification-bell.tsx:258-281` | aria-label carries the count | `Notifications` (less) | FINE |
| Report a bug | `bug-report-button.tsx:99-112` | aria-label only | the same string | FINE |
| Import a chat transcript | `chat-list-header.tsx:57-65` | aria-label only | the same string | FINE |
| Row actions `⋯` | `row-actions-menu.tsx:139-158` | aria-label only | the same string | FINE |
| Persona row actions / pin / name column | `persona-panel-row.tsx:433-441`, `persona-pin.tsx:37-59`, `persona-row-name-column.tsx:178-186` | aria-label only | the same string | FINE |
| Message tools | `composer-utility-menu.tsx:130-160` | aria-label only | the same string | FINE |
| Stop generating | `composer-send-control.tsx:29-46` | aria-label only | near-identical | FINE |
| Impersonate stop | `composer-guided-buttons.tsx:92-109` | aria-label only | near-identical | FINE |
| **`HintTrigger`** (`<Field hint>` / `<Section hint>`) | `hint-trigger.tsx:43-60` | `More info about X` — names the affordance, never the content | **the entire hint** | **P1 — nothing but the tooltip** |
| **4 guided composer icons** | `composer-guided-buttons.tsx:43-62, 135-159, 193-212, 218+` | aria-label = the bare verb | the **disabled reason**, the **steer cue**, and the **multi-character speaker cue** | **P1 — nothing but the tooltip** |
| **Send message (unavailable)** | `composer-send-control.tsx:51-73` | aria-label is the constant `"Send message"` | the **`unavailableReason`**, also duplicated into a native `title` | **P2 — nothing but the tooltip, twice** |
| **`Own look` chip** | `character-hero-band.tsx:277-309` | visible text `Own look` | `"This card carries its own look — edit it in the Look tab."` | **P2 + a refuted in-code claim** |
| **`Restamp my messages to this persona`** | `persona-this-chat-section.tsx:209-221` | visible text | the entire scope/consequence sentence | **P2** |

### \[P1] `HintTrigger` is a 55×55 no-op on touch, at 92 call sites

**What.** `HintTrigger` is the shared anatomy behind `<Field hint>` (`field.tsx:154`) and
`<Section hint>` (`section.tsx:96`) — the app's whole teaching layer. Its `onClick` escape hatch is
**optional**, and the only consumer that supplies one is `setting-teach-row.tsx:147`
(`annotation.onHintClick`). Census: **92 `hint=` call sites in `packages/client/src`, 2 `onHintClick`
lines, both in that one file.** `Section`'s own call site passes no `onClick` at all, so every
section hint in the app is unreachable on a phone.

**Receipt** — Settings → Chat behaviour at `device=coarse:dpr3:430x740`, run
`main-2172534-2026-09-19T14-28-13-083Z`:

```
[data-slot=hint-trigger] count = 15
names   = More info about Enter to send · More info about Send continues the reply ·
          More info about Empty Enter generates a reply · More info about Auto-continue ·
          More info about Auto-continue rounds · More info about Auto-swipe short replies ·
          More info about Custom stopping strings · More info about Offer choices in new chats · …
boxes   = 55x55, 55x55, 55x55, 55x55     <- correctly promoted to the coarse touch floor
aria-describedby -> resolves = 0, 0, 0   <- the popup is unmounted at rest; the id is dangling
```

**Why it hurts a user.**

- *Casey (one-handed phone):* fifteen 55×55 buttons on one pane that look exactly like every other
  button in the app and do **nothing** when tapped. That is a dead affordance, the UX twin of the
  no-dead-toggles law — a rendered control with no consumer on this device.
- *Sam (screen reader):* `aria-describedby` points at an id that does not exist at rest, so a
  virtual-cursor read announces `"More info about Enter to send, button"` and no information. The
  keyboard path *does* work (focus is `:focus-visible`, the popup mounts, the id resolves — proven by
  the desktop hover control), but only for a user who tabs to every info button.
- *Everyone:* the teaching copy the settings pane was written around is invisible to a third of the
  ways people use the app.

**Fix.** `clarify + onboard: HintTrigger`. Two candidate shapes, both one edit in the primitive:
either make the tooltip's content reachable by PRESS as well as hover (Base UI Tooltip is the wrong
primitive for a touch-reachable disclosure — a Popover, or `HintTrigger` opening its own popover at
coarse, is the right one), or make `onClick` non-optional and give `Field`/`Section` a default that
discloses the hint inline. The component's own docblock already states the intent
(*"on touch, where a tooltip cannot open, the click is the whole affordance"*) — the type just does
not enforce it. **Receipt that proves the fix:** at `--mobile`, a `--click` on a
`[data-slot=hint-trigger]` produces a rendered element containing the hint string, and
`aria-describedby` resolves ≥ 1 at rest.

**The instrument angle, stated because it is the interesting part.** `pnpm snap / --mobile --goto
settings:chat-behavior --design-audit --fail-on P1` on this exact pane returns
**`findings=0 population-verdict=complete`**, with `tap-candidates=104 tap-judged=104
tap-affected=0` at `pointer=coarse touch=yes` (run `main-2214381-2026-09-19T14-36-55-589Z`). The
deterministic scanner is green **because the dead buttons are correctly sized**. No rule in the
59-rule registry can see "this control is operable but inert on this pointer type". That is a
candidate detector row.

### \[P1] The composer's guided cluster puts its reasons and its cues in the dead channel

**What.** `composer-guided-buttons.tsx` names each icon with the bare verb
(`aria-label={name}`) and routes everything that explains it into `<TooltipPopup>`:

- `resolveGuidedTitle` (`:67-71`) → `"{label} — {reason}"` when **disabled**, `"{label} — {steerCue}"`
  when the composer has text.
- `responseTitle` (`:79-87`) → in a **multi-character room**, `"{label} — {RESPONSE_SPEAKER_CUE}"`.
  The file's own comment: *"since #539 retired the standalone speak-as dropdown this control is the
  one door to 'who replies next', so an idle group-room tooltip says so."*

**Receipt.** The mobile composer is seven icon-only controls with **zero visible text** (run
`main-2179529-2026-09-19T14-29-48-487Z`):

```
Chat options | (none)   Draft your line | (none)   Try another reply | (none)
Generate reply | (none)  Continue the reply | (none)  Message tools | (none)  Send message | (none)
```

**Why it hurts a user.** On a phone, a disabled guided icon is a greyed glyph with no reason, a typed
steer has no promise, and **the one door to who replies next in a group room is unexplained**. The
keyboard path is fine (`focusableWhenDisabled` + `:focus-visible` opens the tooltip) — the touch path
is not.

**Fix.** `clarify: the guided cluster at coarse` — the disabled reason and the speaker cue belong in
the accessible NAME (append the reason to `aria-label` when disabled, which fixes touch and screen
reader at once) or in a coarse-only inline line under the cluster. `LABEL_TO_SR_ONLY_AT_COARSE` in
`components/pointer-variants.ts` is the sanctioned home for the coarse arm.
**Receipt:** at `--mobile`, `--aria` on a disabled guided icon shows the reason inside the computed
accessible name.

### \[P2] The unavailable-send reason has two homes and both are mute on touch

`composer-send-control.tsx:60` sets a native `title={props.unavailableReason}` **and** `:72` puts the
same string in the tooltip, while `aria-label` stays the constant `"Send message"`. A `title` is
invisible on touch, dwell-gated on a pointer, and only a *description* to AT — this is exactly the
recorded `title-attribute-is-not-load-bearing-copy` lesson (#863). Two homes for one concept (§13 IA
single-homing) and neither reaches a phone. **Fix:** fold the reason into the accessible name when
`unavailable`, drop the `title`.

### \[P2] `character-hero-band.tsx`'s own comment claims tap reaches the gloss. It does not.

`character-hero-band.tsx:270-272` states: *"Base UI opens the tooltip on FOCUS as well as hover, so
tab and tap both reach the gloss."* **Refuted at the mechanism:** `useFocus.js:104` returns early
unless `matchesFocusVisible(target)`, and a touch tap is not `:focus-visible`. `tab` reaches it;
`tap` does not. The `Own look` chip's whole sentence — *"This card carries its own look — edit it in
the Look tab"*, which is the pointer to where the edit lives — is mute on a phone. Naming this
explicitly because a future reviewer will otherwise read that comment as settled truth.

### \[P2] `Restamp my messages to this persona` explains its blast radius only in a tooltip

`persona-this-chat-section.tsx:209-221`. The button is labelled, so a touch user can press it; what
they cannot read is *"Restamps every one of your own lines in this chat … however far back they go.
What you wrote is untouched; replies keep the names they were written with."* A bulk rewrite of the
user's own message history whose scope and safety are pointer-only. **Fix:** the sentence goes on the
surface (a gloss line under the button), not in a tooltip.

**Nielsen (touch arm):** 6-Recognition-over-recall **1** · 10-Help/documentation **1** ·
2-Match-real-world 3 · 4-Consistency 3 (the rail does it right and nothing else follows) ·
9-Error-recovery 2 (disabled reasons unreachable).

**Issue summary (paste into the #1871 item-2 row).** Base UI 1.7.0 disables tooltips on touch by
construction — `tooltip/trigger/TooltipTrigger.js:147` passes `mouseOnly: true`, and the focus fallback
at `floating-ui-react/hooks/useFocus.js:104` returns early unless the trigger matches
`:focus-visible`, which a tap does not produce. Live two-direction control on the same element:
desktop hover yields one `[role=tooltip]` with its text and a resolving `aria-describedby`; a click
yields zero and a dangling `aria-describedby`. The rail is the exemplar and needs nothing — it carries
a visible text label at coarse. The defects are three. (1) `HintTrigger`, the shared anatomy behind
`<Field hint>` and `<Section hint>`, has an OPTIONAL `onClick` and 92 call sites of which exactly one
supplies it, so on a phone it renders a correctly-sized 55×55 button that does nothing — measured 15
of them on Settings → Chat behaviour, each with `aria-describedby` resolving to 0 elements at rest, so
the teaching layer is unreachable to both touch and a virtual screen-reader cursor. (2) The composer's
four guided icons route the disabled reason, the steer cue and the group-room "who replies next" cue
into the tooltip while `aria-label` stays the bare verb; the mobile composer is seven icon-only
controls with zero visible text. (3) The unavailable-send reason lives in a tooltip AND a native
`title` and in neither the accessible name. Also refuted: `character-hero-band.tsx:270`'s in-code
claim that "tab and tap both reach the gloss". `design-audit --mobile` on the affected pane is
`findings=0 population-verdict=complete` with 104/104 tap targets clean — no registry rule can see an
inert-on-this-pointer affordance, which is a candidate detector row. NAMED SNAP GAP: snap cannot
dispatch a real touch tap (`--click` is a mouse dispatch even under `--mobile`), so touch-interaction
questions are only answerable from vendored source today.

---

## AUDIT 3 — `modal` scroll-lock on touch

### The structural fact that makes this audit mostly moot — and why it still had to be measured

Base UI's `useScrollLock` (`@base-ui/utils@0.3.2/useScrollLock.js`) locks the **document scroller**
(`html` or `body`, whichever establishes the viewport scroll). In this app the document does not
scroll at all: measured `html overflow-y: clip`, `body overflow-y: clip`,
`html.scrollHeight > html.clientHeight = false` in **every** state I drove. So the vendored scroll
lock is structurally a **no-op here** and cannot be the thing that protects the background. Something
else has to, and it does.

### Measured matrix (all at `device=coarse:dpr3:430x740`)

For each overlay class: hit-test at three viewport points (does a touch land on the overlay or on the
page behind?), the background scroller's `scrollTop`, and the popup's own box vs the viewport.

| Class | Driven | Hit-test behind the popup | Background scroller | Popup vs viewport | Run |
| - | - | - | - | - | - |
| Menu (`Chat options`) | `--click` | `div{presentation}<div<div[portal-root]` at top **and** bottom — **intercepted** | `message-list-scroll` unchanged at 5745 | 430 of 740, `overflow-y: auto`, fits | `main-2193815-…14-32-54-302Z` |
| Menu (`Message tools`) | `--click` | intercepted | unchanged 5745 | box 506, content 768 → **inner scroll max=264, `auto`** ✔ | `main-2204040-…14-34-35-131Z` |
| Dialog (`modal:command`, ⌘K) | `--goto` | `div[dialog-viewport]{presentation}` top **and** bottom — intercepted | unchanged | popup 415 of 740; `command-list` 240 box / 9624 content, `auto`, max=9384 ✔ | `main-2196164-…14-33-15-505Z` |
| Dialog (`modal:newChat`) | `--goto` | intercepted | unchanged | popup 660 of 740; `command-list` 480/645 `auto` ✔ | `main-2198692-…14-33-38-307Z` |
| Drawer (`modal:you`) | `--goto` | drawer occupies the viewport; `drawer-content` scroller max=628, `auto` ✔ | unchanged | 740 of 740 | `main-2197551-…14-33-27-925Z` |
| **Popover (non-modal)** | `--click` `Report a bug` | **NOT intercepted** — `y=540/560` hit `[composer-guided-cluster]`, `y=600/620` hit `[textarea-root]` | programmatic `scrollTop -= 500` **succeeds** (5745 → 5245) | 434 of 740, `auto` | `main-2210978-…14-36-05-318Z` |

**Positive control for the scroll probe** (without it the zeros mean nothing):
`--wheel '[data-slot=message-list-scroll]=-900'` with no overlay moved the scroller
**6645 → 5745** (run `main-2193815-…`). My first attempt wheeled `+400` against a scroller already
pinned at its maximum and read a false "it didn't move" — retracted.

**A second honest instrument note.** With a menu open, `--wheel` on the background scroller **fails**
with `locator.hover: Timeout 30000ms exceeded` (run `main-2187093-…14-31-28-098Z`). That failure is
itself the receipt — Playwright cannot hover an element the overlay intercepts — but it is a *mouse*
actionability result, so I did not lean on it; the `elementFromPoint` hit-test above is the claim.

### \[FINE] The page behind does not scroll, and closing restores nothing because nothing was lost

Every dialog/drawer/menu class covers the viewport with a pointer-intercepting presentation layer, so
a touch drag anywhere outside the popup lands on the overlay. The background scroller's `scrollTop`
was byte-identical before-open / while-open / after-close in every run
(`5745 → 5745 → 5745`, run `main-2204040-…`). Nothing is saved and restored because nothing is
disturbed — the healthier design.

### \[FINE] Sheets taller than their box scroll

Every popup I drove fits the 740 px viewport, and each one that exceeds its own box gets a working
inner scroller: `Message tools` 768 of 506 (`max=264`), ⌘K's `command-list` 9624 of 240
(`max=9384`), the drawer's `drawer-content` `max=628`. `touch-action` on the scroller and its whole
ancestor chain is `auto`, and `overscroll-behavior-y: contain` on the settings pane's own scroller
(run `main-2201545-…14-34-05-103Z`) — so nothing blocks a touch drag inside a sheet and nothing
chains out of one.

### \[P3] Non-modal popovers leave the page live under them, and the composer is right below

**What.** **Zero of the 16 `<Popover>` roots in `packages/client/src` pass `modal`, and there is not
one `PopoverBackdrop` in the client** — while `popover.tsx:54` documents that `modal` is what buys
"focus/scroll containment". So a popover is an unfenced float.

**Receipt.** With the bug-report popover open at 430×740 (`y=68…502`), hit-tests at `y=540/560/600/620`
return the live composer cluster and its textarea; a programmatic scroll of the transcript succeeds
and the popover stays open (run `main-2210978-…`).

**Why it hurts a user (bounded).** The bug-report popover is a FORM (radio group + "What happened?"
textarea) sitting directly above the largest touch target on the screen. A thumb reaching for the
composer dismisses it.

**Retraction of my own hypothesis.** I expected this to cost the typed report. It does not: typed
`"the list panel jumps sideways"`, tapped the composer, popover closed and focus moved to `Message`,
reopened — **the draft survived verbatim** (run `main-2213033-…14-36-33-759Z`). So this is a
one-extra-tap nuisance, **P3, not data loss.**

**Fix.** `harden: the form-bearing popovers` — the popovers that carry a FORM (`bug-report-button`,
`add-member-popover`, `model-picker`) take `modal` so an outside tap is absorbed by a backdrop rather
than by whatever control happens to be underneath. The read-only peek popovers
(`chat-recall-indicator`, `compact-summary-peek`) are correct as they are. **Receipt:** the same
hit-test at `y=540..620` returning a `{presentation}` backdrop instead of `[textarea-root]`.

**Nielsen (this axis):** 3-User-control 4 · 5-Error-prevention 3 · 4-Consistency 3 (modal vs
non-modal float is not decided by a stated rule, it is decided by which primitive the author reached
for).

**Issue summary (paste into the #1871 item-3 row).** Touch scroll-lock holds. The vendored Base UI
`useScrollLock` is structurally a no-op in this app — the document never scrolls (`html`/`body` are
`overflow-y: clip`, `scrollHeight === clientHeight` in every driven state) — but the protection comes
from somewhere better: every dialog, drawer and menu class covers the viewport with a
pointer-intercepting presentation layer, verified by `elementFromPoint` at three viewport points per
class, so no touch reaches the page behind; the background scroller's `scrollTop` is byte-identical
before-open, while-open and after-close, so there is no position to save or restore; and every popup
fits the 430×740 viewport with a working inner `overflow-y: auto` where its content exceeds its box
(Message tools 768/506, ⌘K's command list 9624/240, the account drawer 628 of scroll), with
`touch-action: auto` on the whole scroller ancestor chain and `overscroll-behavior-y: contain` where
chaining would matter. One P3: none of the 16 `<Popover>` roots in the client pass `modal` and the
client has no `PopoverBackdrop`, so a non-modal popover leaves the page hit-live under it — with the
bug-report FORM popover at `y=68…502` on a phone, hit-tests at `y=540…620` return the live composer,
so a thumb reaching for the composer dismisses the form. The typed draft survives the dismiss
(verified), so this is a nuisance, not data loss; form-bearing popovers should take `modal`.

---

## Taste & flow verdict (both audits' surfaces)

**The chat room at 1280×800 looks good.** Dark, atmospheric, the art reads as depth rather than
noise, and the transcript sits on its own plate so nothing bleeds. The collapsed state is the better
of the two: the reading column gets room and the topbar reduces to five quiet glyphs. Two things my
eye does not like, both taste, both filed as such:

1. **The collapsed room is unbalanced to the right.** With the list hidden, the transcript plate ends
   at x=1041 and the remaining ~240 px is bare background art with nothing in it, while the composer
   below spans the full 923 px track. The eye reads the composer as wider than the conversation. The
   cause is legitimate (the assistant bubble reserves a trailing gutter for the user's side), but the
   *result* is that the two things stacked on the reading axis do not share an edge.
2. **The `VARIANT 3 / 3` strip floats orphaned** between the transcript and the composer, aligned to
   neither — right-ish, on its own plate, at its own width. It is the one element on the screen that
   belongs to no column.

**The mobile settings pane looks like an instrument panel, not a settings screen.** Fifteen circular
info buttons down one pane, each 55×55, each visually identical to a real control — and none of them
does anything. Cold, a first-timer taps one, gets nothing, and learns that this app's buttons
sometimes lie. That is worse than having no info button at all.

**Flow.** The list collapse flows right on desktop: one control, same place, re-labels, focus stays.
The mobile room flows right too (Back is where Back should be). The thing that flows *weird* is the
hint layer: the affordance says "there is more to know here" on every device and delivers on one.

**IA / one-home check.** Two collisions found. (a) The unavailable-send reason lives in a native
`title` and a tooltip — two homes, both unreachable on touch. (b) Settings has a **modal identity on
desktop and a section identity at coarse** (`--goto settings:appearance` at `--mobile` renders
`config-content`/`config-pane` inside `main` with no `[role=dialog]` — run `main-2201545-…`).
That is probably a deliberate mobile adaptation, but §14 states "Settings IS a modal" without a
coarse arm, so the law and the build disagree on paper. Flagging it as a question for the
orchestrator, not a finding: is the coarse section-identity sanctioned anywhere?

## What is genuinely working (do not touch)

1. **The `#1316` topbar-trail counter.** Constant x in six independent arms, including the
   reduced-motion settle. The mechanism ("the exact inverse, in lockstep, off the same var") is right
   and the measurement agrees with it exactly.
2. **The rail's coarse label strategy.** Every tab carries a real visible text label at
   `pointer: coarse` while staying icon-only at fine. It is the one place in the app where the
   tooltip-on-touch problem was actually solved, and it is the pattern the composer and the hint
   layer should copy.
3. **Overlay pointer containment.** Dialogs, drawers and menus all intercept the viewport, all fit it,
   and all scroll internally when their content exceeds their box. I tried to break this five ways and
   could not.

## The single biggest opportunity

**Make "explained" a property of the control, not of the pointer.** One primitive (`HintTrigger`) and
one cluster (the composer's guided icons) account for nearly every touch-mute string in the shell,
and both already know the text they are withholding. Move that text into the accessible name or into
a press-reachable disclosure and the touch arm, the screen-reader arm, and the keyboard arm all get
the same product at once.

## Instrument coverage

| # | Instrument | Status |
| - | - | - |
| 1 | `snap --map` / `--aria` / `--contrast` | **RAN (map)** `main-2101004-…`, `main-2105697-…`, `main-2108593-…`. **`--contrast` SKIPPED** — no contrast claim is load-bearing in these three audits; the recession/over-art families were covered by side-eye-F on 2026-09-19 against the same surfaces. |
| 2 | `snap --design-audit` + `--mobile` | **RAN (mobile arm)** `main-2214381-…` — `findings=0 population-verdict=complete`, 104/104 tap targets judged. Desktop arm **SKIPPED** (the briefed questions are all coarse-pointer or motion). |
| 3 | `snap --motion` | **REFUSED (exit 2)** `main-2135069-…` — `frames-raw=0/0`, `frames-population-raw=uncomputable`. NO VERDICT on dropped frames. Substituted: per-rAF box census (stronger for this defect class) + `__orb.motion()`. |
| 4 | `snap --perf --click` | **SKIPPED** — the briefed question was the felt geometry, not input latency; the prior lane's perf pass stands. |
| 5 | `snap --lighthouse` | **SKIPPED** — no a11y-audit question in the brief; the two a11y findings here (dangling `aria-describedby`, name-without-reason) are element-level and already measured directly. |
| 6 | `__orb` suite (`.motion()`, `.animations()`) | **RAN** `main-2136980-…` — `dirty-animations=0`, collapse contributes one `hadRecentInput` shift of 0.00008. |
| 7 | Console triage | **RAN** — 0 errors, 0 page errors in every run; warnings 5–22 (`boot-console-warnings=0`). No `INVESTIGATE` row: none recurred across arms, none named a product surface. |
| 8 | PNGs actually looked at | **RAN** — `sem-chat-docked.png` (`main-2141262-…`), `sem-chat-collapsed.png` (`main-2141974-…`), the 48-frame filmstrip (`main-2139342-…`). |
| 9 | Keyboard walk | **RAN** `main-2147941-…` — Enter-activation + 3 bare `--key Tab` stops, `fv=true` at every stop. |
| 10 | Appearance / theme arms | **RAN** — owner row and `--appearance-preset defaults` on every motion measurement (they disagree: finding A1-3); `--reduced-motion` arm `main-2132300-…`. `--theme` arms **SKIPPED** — no light-sensitive finding here, and the chat room is a CARRIED-theme surface where an app-theme shim is suppressed by design (D44). `compact`/`reading`/`maximal` **SKIPPED** — no density- or ornament-dependent finding in scope. |
| 11 | Pane-state arms | **RAN** — docked / collapsed at desktop and the mobile one-shell regime; both directions of the transition. Context pane **SKIPPED** (not in scope; `--list-track-docked` already accounts for the #242 squeeze). |
| 12 | Retained-section inventory (`--map --include-hidden`) | **SKIPPED** — focused review; the design-audit run reports `dom-retained-hidden=582` on the settings pane, which is coverage discovery for a future full audit, not scored here. |
| — | Touch-tap dispatch | **GAP — no instrument.** `snap` has no `locator.tap()` / `Input.dispatchTouchEvent` verb; `--click` is a mouse dispatch even under `--mobile`. Every touch-interaction claim in Audit 2 rests on vendored `@base-ui/react@1.7.0` source plus a mouse/hover control. |
