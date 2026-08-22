---
kind: review
status: active
updated: 2026-08-22
---

# side-eye — RAIL sweep 3/10: Chats (landing · sidebar list · open room)

**Lane:** rail-chats · **Surface:** live dev stack `:5173`, CHATS section · **Mode:** FULL audit
(unscoped rail-sweep brief) · **Corpus:** the owner's full SillyTavern import — **896 chats**
(`CHATS 896` header, `chat.listChats` `totalCount`), \~300 characters, group rooms, orphan placeholders.

## Verdict: SHIP WITH FIXES

The chat list is the best-engineered list in the app — 896 rows scroll at **CLS 0 / worst blocking
13ms**, the reading measure holds at **63–71ch across every appearance and pane-state arm**, the
composer and message rows are properly grouped and labelled, and the empty-search state is a model of
the genre. Three things must not ship as-is: **quoted dialogue drops to 4.25:1 over room art** in two
standard appearance arms, **the RPG turn's tool-call disclosure is keyboard-unreachable**, and the
**first chat open blocks the main thread for 579ms**.

**Design health: 22/40 — "mid" band.** (Calibration only. The band gates nothing; the finding list
below is the deliverable.)

---

## Design-health score (Nielsen, 0–4)

| # | Heuristic | Score | Key issue |
| - | - | - | - |
| 1 | Visibility of system status | 2 | `CHATS 896` never reflects an active filter; the virtualized scrollbar grows 1440px per fetch and never represents 896; a month-anchored list gives no "you are mid-history" signal |
| 2 | Match system ↔ real world | 2 | "Jump to month" **re-roots** the list rather than jumping within it; `‹ 8 / 8 ›` reads as pagination but means message *variants*; three cast members each show "Talks 50%" (=150%) |
| 3 | User control & freedom | 2 | text search has **no clear affordance** when it returns results (the month filter does); ArrowRight from an in-row action button dumps focus to `<body>` |
| 4 | Consistency & standards | 2 | month filter gets a `×`, sibling text search does not; list = infinite scroll, transcript variants = numbered pager; two tab strips stacked in one context panel; "add a character" has two doors |
| 5 | Error prevention | 3 | smart defaults, nothing observed wrong — **not stress-tested** (read-only discipline: no sends, no deletes) |
| 6 | Recognition over recall | 2 | the variant strip gives a sighted user strictly less than the a11y tree ("Previous variant" vs a bare `8 / 8`); `Map 🔒` unexplained; character-filter names truncate to \~10 chars |
| 7 | Flexibility & efficiency | 3 | ⌘K jump, month jump, character chips, roving arrow-nav in the transcript, per-row Tab cluster — genuinely strong; the skip link reaches CONTENT but never LIST |
| 8 | Aesthetic & minimalist | 2 | \~215px of list-pane chrome above the first of 896 rows; the context panel stacks two nav strips + 5 stat dials + PEOPLE + CAST in 380px |
| 9 | Error recovery | 3 | search-empty state is excellent (icon + the quoted query + "Clear search") |
| 10 | Help & documentation | 1 | no contextual help on this surface; Talks %, the lock glyph and the variant strip are unexplained |

---

## Findings

### P1 — quoted dialogue falls to 4.25:1 over the room's background art

**What.** In a room whose card carries a background (`data-has-bg-image=true`), message prose sits on
a bubble plate of `oklch(0.12 0.006 60 / 0.65)` + `backdrop-filter: blur(8px)` over an art layer. The
effective reading backdrop is therefore a function of the picture. Measured worst per-scanline
contrast between the dialogue glyph and its local backdrop, same room (`Example — The Ashen Spire`,
`morgatha-bg.jpg` — one of the *darker* shipped backgrounds):

| Arm | worst scanline | median | verdict |
| - | - | - | - |
| owner's live state | **5.41:1** | 11.73:1 | PASS, thin margin |
| `--appearance-preset compact` | **4.27:1** | 13.21:1 | **FAIL** (< 4.5) |
| `--appearance-preset reading` | **4.25:1** | 13.11:1 | **FAIL** (< 4.5) |
| `--appearance-preset maximal` | 6.89:1 | — | PASS (this arm adds `blurSurfaces: messages`) |

In the `reading` arm the type is 21.56px — under the 24px WCAG large-text line, so the 4.5:1 floor
applies, not 3:1.

**Why it hurts a user.** This is the app's primary reading surface and the exact §0 failure the
reading-surface rule exists to prevent. It is not a hypothetical: two of the five committed appearance
profiles reproduce it on a background that is not even a bright one.

**The mechanism has no floor, and the code says it should.**
`packages/client/src/features/app-shell/components/theme-background-layer.tsx:3` declares the scrim
"**mandatory** … **non-negotiable for text legibility**", but
`packages/contracts/src/settings/appearance.ts:34` sets `BACKGROUND_DIM_MIN = 0` and `:170` accepts it
— a legal user value turns the mandatory guard entirely off (verified: `--appearance
'{"backgroundDim":0}'` renders the scrim at `opacity: 0`).

**Modelled risk across the shipped library** (`packages/client/public/backgrounds/`, 14 images,
luminance measured at p95, composited through the 65% plate + 0.45 scrim): **6 of 14** put dialogue
below 4.5:1 in their brightest regions — worst `misty-highlands.jpg` (art Y p95 = 0.839). Stated as a
model, not a render; the two measured arms above are the rendered receipt.

**Fix.** `harden` + `quieter`: the reading surface, not the picture. Either (a) raise the message
plate to an opacity that keeps 4.5:1 against Y=1.0 art (≈0.85 alpha at the current plate colour), or
(b) floor `BACKGROUND_DIM_MIN` above 0 and add a per-image dim derived from measured luminance, or
(c) drop the art behind the transcript entirely and keep it as the chrome/edge accent the law
prescribes. Receipt for the fix: re-run the three arms above and show every worst-scanline ≥ 4.5:1,
plus `misty-highlands` as a rendered arm.

**Receipts.** `reports/snaps/room-group.png` · `room-compact.png` · `room-reading.png` ·
`room-maximal.png` · `reports/px-rail-chats.mjs` (per-scanline decode) ·
`reports/bg-lum-rail-chats.mjs` (library model) · `design-audit` returned
`NO VERDICT 17 text node(s) over an unresolvable backdrop` on this surface — a correct refusal, and
this section is the hand-verification it asked for.

---

### P1 — the turn tool-call disclosure is keyboard-unreachable

**What.** `button[data-slot=collapsible-trigger]` ("Game actions on this turn — 4") carries an
explicit `tabindex="-1"` while `disabled=false`. It appears in neither walk:

- backward from the composer: `Send message → Message tools → Speak as a character → Continue the
  reply → Generate reply → Try another reply → Draft your line → Chat options → message-list-row →
  Add a character → Show detail panel` — never the trigger.
- inside a focused row: `message-list-row → Edit message → Fork chat here → More message actions →`
  out to the composer — never the trigger.
- row-level arrows move between rows only.

Our wrapper does not set it (`packages/ui/src/primitives/collapsible/*.tsx:32` passes `...rest` with
no `tabIndex`), so it is a Base UI emission nothing compensates for.

**Why it hurts a user.** A keyboard-only or screen-reader user cannot open the RPG turn's tool-call
detail — the record of what the turn actually did. §5: every interactive element must be keyboard
operable.

**Fix.** `harden`: give the trigger `tabIndex={0}` at
`packages/client/src/features/rpg/components/turn-tool-calls-disclosure.tsx:75`, or enrol it in the
row's roving scheme the way `members-panel.tsx:254` does. Receipt: a Tab walk from a focused
`message-list-row` that lands on it with `fv=true`.

---

### P1 — the first chat open blocks the main thread for 579ms

**What.** `motion-audit / --goto chats --selector '[aria-label="Hikari — Jun 15, 2026 (2)"]'`:

```
LoAF    7 in ring · worst blocking 579ms (budget 50ms) · 6 of 7 with style/layout in-frame
frames  48/112 dropped (42.86%)   CLS  raw 0 · non-virtualized 0
```

`--full-motion` arm: 2 LoAFs, worst blocking 115ms, 23.08% dropped.

`perf-meter --cycles 3` shows it is **cold-only**: cycle 1 click = 248ms duration / 8ms input delay /
596ms of long tasks / 233ms worst rAF gap; cycles 2 and 3 = 16ms and 0 long tasks. The section switch
itself is the same shape (603ms of long tasks, 404ms worst, 400ms rAF gap, first time only).

`__orb.renders()` names the churn: opening one chat produces `chat:transcript` **1 mount + 9 updates**
(343ms cumulative, worst commit 117ms) and `region:content` 14 updates (374ms, worst 117ms).

**Why it hurts a user.** The first click on the app's primary object freezes the UI past the 200ms INP
budget and drops \~14 frames. Headless dropped-frame % is advisory; the LoAF blocking figures are not.

**Fix.** `optimize`: find why the transcript commits nine times after mount on a single open — the
style/layout-in-frame signature on 6 of 7 LoAFs points at a forced reflow inside the first commit
chain. Receipt: `motion-audit` worst blocking ≤ 50ms on a cold open, and `chat:transcript` updates in
low single digits.

---

### P2 — text search has no clear affordance once it returns results

**What.** With `Hikari` typed, `--map aside` returns 23 elements and **none is a clear/reset control**;
the input carries no `×`. The only "Clear search" button exists in the *zero-results* empty state. The
sibling "Jump to month" input **does** grow an `×` the moment it holds a value
(`reports/snaps/chats-month-jump.png`).

**Why it hurts.** To leave a 12-result filter over 896 chats you must select-all-delete the field.
Two sibling filters, two different reset contracts, in one 290px column.

**Fix.** `polish` + `clarify`: mirror the month input's `×` onto the search field, always-on when
non-empty.

**Receipt.** `reports/snaps/chats-search-hits.png` · map of `aside` (23 elements, no reset).

---

### P2 — the variant strip reads as pagination to everyone who can see it

**What.** The control renders as `‹ 8 / 8 ›` at the foot of the transcript with no visible label. Its
accessible names are correct — `button "Previous variant"` / `button "Next variant"` — so a
screen-reader user is told what it is and a sighted user is not. **I misread it as transcript
pagination on first pass and only corrected it from the a11y tree** (see Retractions).

**Why it hurts.** §7-6. A user reading "8 / 8" concludes there are seven earlier pages of
conversation. On mobile it floats mid-screen with even less context
(`reports/snaps/room-mobile.png`).

**Fix.** `clarify`: give the strip a visible micro label ("variant 8 of 8" / "swipe 8 / 8") in the
existing micro voice.

---

### P2 — the list count and the scrollbar both lie under filtering and scrolling

**What.** Two separate honesty gaps:

1. `CHATS 896` is unchanged when the list shows "No matches" for `zzzqqqxx`, and unchanged when the
   text filter narrows to 12 Hikari rows.
2. `[data-slot=virtual-list-scroll].scrollHeight` grows **exactly 1440px per fetch**: 1436 → 2876 →
   4316 → … → 15836 across 10 scroll-to-bottom cycles (330 of 896 rows loaded). The thumb therefore
   never represents the list; reaching the oldest chat takes \~30 fetches. `totalCount: 896` is already
   on the wire.

**Fix.** `clarify` the header to `N of 896` while filtered; size the virtualizer's total from
`totalCount` so the thumb is honest from the first paint.

**Receipt.** `scratchpad/09-search-empty.log`, `10-search-hits.log`, `14-deepscroll.log`.

---

### P2 — "Jump to month" re-roots the list with no way back and no state signal

**What.** Setting `2026-06` changes the first row from `Example — The Ashen Spire` to
`Hikari — Jun 15, 2026 (2)` while `scrollTop` stays 0 and `scrollHeight` stays 1436. A wheel-up plus a
forced `scrollTop = -200` leaves both unchanged: **nothing newer than the anchored month is reachable
by scrolling.** The only exit is the `×`. Nothing in the list says "you are anchored at June 2026".

**Why it hurts.** §7-2: the verb says "jump" (move within), the behaviour is "re-root" (replace). A
user who jumps to June and then wants last week's chat has no scroll path back.

**Fix.** `clarify`: rename to "Start at month" / "Show from", and render an active-anchor chip in the
list header alongside the count. Perf is fine — scoped `__orb.motion()` for the jump is one 113ms
frame at **39ms blocking**, CLS 0.0346 fully classified virtualized.

---

### P2 — the mobile room gives the transcript \~35% of the screen

**What.** At 430×932 (`reports/snaps/room-mobile.png`) the cast bar takes three full rows
(y≈50–165, \~115px) to list three names, the composer's icon row wraps to two rows (\~110px), and the
bottom tab bar takes \~60px. The visible transcript is roughly y=230–300 — about 110px.

**Why it hurts.** Casey: the reason you opened the room is the smallest thing on screen.

**Fix.** `adapt`: collapse the cast bar to an avatar stack + count at coarse pointer (the pattern the
list rows already use), and keep the composer's guided cluster on one row.

---

### P2 — ArrowRight from an in-row action button drops focus to `<body>`

**What.** Focus a `message-list-row`, Tab into the cluster (lands on "Edit message", `fv=true`), press
ArrowRight → `BODY`, `fv=false`. The subsequent `End` keeps it on `BODY`.

**Why it hurts.** A keyboard user who presses an arrow key inside the action cluster loses focus
entirely and restarts at the top of the document. Tab itself is clean (Edit → Fork → More → composer,
`fv=true` and visible at every stop), so this is an arrow-key gap in an otherwise good roving scheme.

**Fix.** `harden`: make ArrowLeft/ArrowRight within the action cluster either move between its
buttons or be a no-op — never a focus escape.

---

### P2 — inline `<code>` in transcripts renders with three dead Tailwind classes

**What.** `snap --deadcss` reports `deadcss=3` on every room run: `px-1.5 (×2) · py-0.5 (×2) ·
text-sm (×2)`. Located in the DOM:

```
<code class="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">Anyone left in this world I hold dear.</code>
computed: fontSize 15px (= body, text-sm never compiled) · padding "0px 4px" (py-0.5 never compiled) · height 18px in a 23.25px line
```

**Why it hurts.** Two defects. The chip renders at body size with zero vertical padding — a tight
`bg-muted` bar hugging the glyphs instead of a chip. And these are raw arbitrary Tailwind values in a
markdown renderer, which the tokens-only house law (§0) forbids regardless of whether they compile.

**Fix.** `extract` / `typeset`: give inline code the token spelling the design system owns and delete
the raw values. Receipt: `deadcss=0` on a room run.

---

### P2 — "add a character" has two simultaneous doors

**What.** `design-audit` P3 `duplicate-action-door`: `[data-testid=chat-cast-bar] > button …` — "the
same action is offered from 2 structurally distinct places on one plane (2x button 'add a
character')". Visible together in `reports/snaps/room-group.png`: the person-plus glyph in the cast
bar (≈581,103) and the person-plus glyph on the context panel's CAST header (≈1254,424).

**Why it hurts.** §13 IA single-homing. Two homes for one concept is a defect, not a convenience.
Raising this above the detector's P3 because both doors are visible **at the same time** in the
default room layout.

**Fix.** `distill`: keep the door in CONTEXT (where the cast is configured, §14) and drop the cast-bar
twin, or make the cast-bar glyph open the CONTEXT tab rather than duplicating the action.

---

### P2 — `[data-slot=members-cast]` "Talks 50%" is 10.5px interactive text

**What.** `design-audit` P2 ×3: "interactive text is 10.5px — below the 11px functional floor; being
on the type ramp does not exempt it." Compounded by the semantics: three cast members each read
"Talks 50%" (sums to 150%), so the number is unexplained as well as small.

**Fix.** `typeset` to the 11px+ functional floor and `clarify` the unit (weight? probability?).

---

### P3 — the row's visual weight is inverted against its information value at 896-chat density

**What.** Measured row typography: title **13px / 600 / oklch(0.955)**; preview **10.5px / 400 /
oklch(0.74)**; timestamp 10.5px; the "CHATS"/"FILTER BY CHARACTER" kickers also 10.5px/600. The
imported corpus titles all share a leading token — twelve consecutive rows read `Hikari — Jun 15,
2026`, `… (2)`, `… (3)`, `Hikari — Jun 14, 2026` — so the loudest element in each row is the part that
is identical across rows, and the only unique content (the preview snippet) is the quietest thing on
the surface and shares its voice with the chrome kickers.

Contrast is not the problem: subtitle 8.66:1, meta 8.66:1, kicker 15.76:1, search 6.55:1, all PASS.
This is hierarchy, not legibility. `design-audit` names the same thing deterministically as P3
`flat-type-hierarchy` (10.5px, 13px, 15px, 16px — ratio 1.5:1) on every arm.

**Fix.** `typeset`: lift the subtitle out of the 10.5px micro voice it shares with the kickers, or
de-emphasise the redundant title prefix so the discriminating tail carries the weight.

---

### P3 — "Jump to month" is a bare native `<input type="month">`

**What.** `input[type=month][data-slot=input-root]`, `colorScheme: dark`, empty value renders as
`--------- ----` with the browser's own calendar glyph. It is styled with the `Input` primitive's
classes but its interior is UA chrome, and it reads as a broken/empty field beside two house-styled
siblings (`reports/snaps/chats-landing-bare.png`).

Credit where due: it is correctly labelled (`aria-labelledby` → the visible "Jump to month" text) and
`--contrast input[type=month]` = **13.29:1 PASS**.

**Fix.** `polish` — or accept the native picker deliberately and say so in the component header.

---

### P3 — the visible "Jump to month" label outranks the transcript previews

**What.** The label renders at 13px / 500 / `oklch(0.955)` — full foreground brightness, louder than
every chat preview on the surface (10.5px / 400 / `oklch(0.74)`). A secondary utility control's label
is the third-loudest thing in the LIST pane.

**Fix.** `typeset` the label to the field/label voice.

---

### P3 — the skip link reaches CONTENT, never LIST

**What.** Measured Tab order from the top: `Skip to content → Home → Chats → Characters → Corpus →
Configuration → Databank → Presets → Refinery → Analytics → Switch theme → Settings → Playing as
Traveler → Import a chat transcript → …` — 13 stops before the list's first control, and the only skip
target is CONTENT. On the Chats surface the work starts in LIST.

Focus rings are present and `fv=true` at every one of those stops — the ring is not the issue.

**Fix.** `harden`: add a "Skip to list" target, or make the skip link section-aware.

---

### P3 — the landing's `chat.listChats {limit:1}` is a redundant round trip

**What.** Boot fires four `chat.listChats` queries: `{limit:8}`, `{limit:1}`, `{limit:30}`,
`{limit:30, direction:"forward"}`. The `limit:1` call appears to be the #446 list-state check; the
`limit:30` call already returns `totalCount` and answers the same question.

**Fix.** `optimize`: derive the landing's list-state from the list query's `totalCount`.

---

## ARIA-navigability

**What is already right — do not "fix" these:**

- Chat rows: `button[data-slot=list-row-body][aria-label="<title>"]` +
  `aria-describedby="<id>-subtitle <id>-meta"`. Correct, and the axe
  `label-content-name-mismatch` hit on them is the known false positive — **not re-filed** (per brief;
  rail-home retractions).
- Composer: four semantic groups — `group "Chat actions"`, `group "Your message"`,
  `group "Their reply"`, `group "Attach and send"` — every button named
  ("Draft your line", "Try another reply", "Generate reply", "Continue the reply", "Speak as a
  character", "Message tools", "Send message"), all with working hover tooltips wired via
  `aria-describedby` (verified: hovering `composer-guided-response` renders `role=tooltip`
  "Generate reply").
- Transcript: roving `message-list-row`, ArrowUp/Down between rows with `fv=true`, Tab into the
  per-row cluster, all three actions visible and focus-visible.
- `--map` reported **0 DOM fallbacks** on every run — every interactive element has a stable
  accessible identity.
- Lighthouse a11y **100 / 100** desktop and mobile (36 passed, 1 failed = the known FP above).

**Concrete fixes owed:**

| Element | Problem | Exact fix |
| - | - | - |
| `button[data-slot=collapsible-trigger]` (turn tool calls) | `tabindex="-1"` on an enabled button; in no tab or arrow path | `tabIndex={0}` at `turn-tool-calls-disclosure.tsx:75`, or enrol in the row's roving scheme |
| in-row action cluster ("Edit message" etc.) | ArrowRight escapes focus to `<body>`, `fv=false` | trap ArrowLeft/Right inside the cluster or make them no-ops |
| the variant strip | visible text `8 / 8` conveys less than the accessible names | add the visible micro label; keep `aria-label="Previous/Next variant"` |
| the skip link | only target is CONTENT | add a LIST target |
| `[data-slot=members-cast]` "Talks 50%" | 10.5px interactive text | raise to ≥ 11px |

---

## Taste & flow verdict

**The open room looks genuinely good — and that is the trap.** The transcript is the best-looking
surface I have driven in this app: warm colorized dialogue, italic narration, 69ch of well-spaced
prose, a floated plate over character art that reads as *atmosphere* rather than decoration. It is
beautiful. It is also, measurably, where the prose is fighting the picture — in `reports/snaps/room-compact.png`
you can see the stone columns and the violet braziers straight through the paragraph, and that is
exactly the region that measures 4.27:1. My eye forgave this twice before the pixel decode caught it.
That reconciliation is the single most valuable line in this review.

**The list pane is top-heavy and buries the thing it exists to show.** Above the first of 896 rows sit
a header band, a 3-avatar character filter with a "+10 More" tile, a search field, a "Jump to month"
label and a native month input — roughly 215px of furniture, a quarter of the pane, before any chat.
Then the rows themselves are quiet and small. The proportion is backwards: the chrome is loud and
fixed, the content is dim and scrolls. And the three filters (character chips, text search, month
anchor) have no shared home — there is no one place that says what is currently filtering your list,
and only two of the three offer a reset.

**The context panel is doing too much at once.** In one 380px column: a stat ring, five numeric
dials, a six-item GAME STATE strip with no visible selection, a PEOPLE section, a CAST section with
three rows and three overflow menus, and a *second* four-item tab strip at the foot which is the one
that actually carries the selected state. Two nav strips stacked in one panel is a "which strip am I
in" problem, and the working-memory count at rest is well past four. One of the two strips should go
or become progressive disclosure.

**Does a cold first-timer know what to do?** On the landing, yes — "No chat selected / Pick a thread
from your chats, or start a new one" with a New chat button is honest, well-composed, and correctly
reflects a populated list. In the room, no: `‹ 8 / 8 ›` misleads, `Map 🔒` is unexplained, three
identical "Talks 50%" values invite arithmetic that does not work, and the composer's transport-style
glyph trio (↺ ▷ ⏩) is only decodable by hovering each one.

**Two homes for one concept.** "Add a character" is offered twice, simultaneously, in the default room
layout (cast bar + CONTEXT CAST header) — the detector caught it and I confirmed it on the shot.

---

## What is genuinely working — do not touch

1. **The virtualizer at real density.** Ten scroll-to-bottom cycles over 896 chats: **CLS 0** (raw,
   observed, virtualized and non-virtualized all zero), worst LoAF blocking **13ms**, a stable 14-row
   render window, five LoAFs of 51–63ms with `forcedStyleAndLayoutDuration: 0`. This is the part of
   the surface the density was designed for and it holds.
2. **The reading measure across every arm.** 69ch owner default · 68ch maximal · 71ch compact · 63ch
   reading (at `fontScale 1.25` + `chatWidthPct 90`) · 69ch diagnostics · 69ch with the list collapsed
   and the context panel docked. `--expect-no-overflow` PASS on all of them, all four sides judged.
   A measure cap that survives that matrix is not an accident.
3. **The search-empty state.** Icon, "No matches", the query quoted back verbatim, and a working
   "Clear search". §5 done properly.
4. **The composer's a11y grouping** and the transcript's roving-plus-Tab keyboard model.

---

## The single biggest opportunity

**Decide what the room's background art is for, and make the reading surface honour it.** Right now
the art is a full-bleed layer under the prose with a fixed 65% plate and a user-defeatable scrim, and
the result is a reading surface whose contrast is a property of the user's picture rather than a
property of the design. The house law already has the answer — art as a margin/edge/corner accent that
fades to a clean surface before the prose. Applying it would kill the P1, remove the
`design-audit` `NO VERDICT` refusal class from this surface permanently, and lose nothing that makes
the room feel good: the atmosphere lives in the chrome, the header, the cast bar and the gutters,
none of which carry body text.

---

## Retractions

1. **"The month jump blocks the main thread for \~284ms."** Wrong. That number came from an unscoped
   console window that mixed boot noise into the interaction. The scoped receipt
   (`--checkpoint` + `__orb.resetEvidence()` + `__orb.motion()`) is **one 113ms frame at 39ms
   blocking**, under the 50ms budget, with CLS 0.0346 **fully classified virtualized**. The month jump
   is fine.
2. **"The transcript is paginated 8 / 8."** Wrong, and instructive. `--map
   '[data-slot=message-list-scroll]'` shows `button "Previous variant"` / `button "Next variant"` —
   it is the message *variant* swiper (this ST import carries 8 swipes). I retract the pagination
   reading and re-file the same control as a P2 **labelling** defect, because I made exactly the
   mistake a user will make, with the source available.
3. **design-audit P1 `text-overflow` on the room header (116px block spill) does not reproduce.**
   `--expect-no-overflow header` → `PASS overflow=0x0 judged=left+top+right+bottom escapes=0`, and
   per-header `scrollHeight == clientHeight` (47/47), `scrollWidth == clientWidth` (568/568), zero
   out-of-bounds descendants on any side. Treating it as a transient-state false positive; not filed.
4. **design-audit P1 `tap-target` (16px short side) on the tool-calls trigger is REAL but already
   RULED — not re-filed as new.** `packages/client/src/components/pointer-variants.ts:35-42` records a
   prior side-eye ruling (#93, 2026-08-16) that fine-pointer keeps the 16px line and coarse takes
   `min-h-touch-target`, CT-pinned. I verified the coarse arm holds: `design-audit --mobile` on this
   room reports **zero** tap-target findings at `pointer=coarse`. The ruling stands. The *keyboard*
   defect on the same element (P1 above) is a different axis and is new.
5. **"The composer's icon-only buttons are undiscoverable."** Softened. Tooltips work — hovering
   `composer-guided-response` renders `role=tooltip` "Generate reply", wired through
   `aria-describedby`. Downgraded from a P2 to the P3 cold-scan observation in the taste section.
6. **"The owner's account has no theme, which looks like a bug."** Not a bug. `--theme none` renders
   byte-identically (`data-theme` absent on `<html>` in both) — the owner is on the shipped Hearth
   default, which is the no-attribute state by design.
7. **Mid-run 502 storm on `/api/auth/me` and `chat.listChats` was environmental**, not a product
   defect: the `node --watch` server respawned mid-run and recovered within one poll. Not filed. (The
   one product-adjacent observation from it: during the outage the app bounced to `/login` and retried
   `chat.listChats` three times with "Unexpected end of JSON input" surfaced to the console. Out of
   scope for this surface; noted for whoever owns backend-outage UX.)

---

## Instrument coverage

| # | Instrument | Status |
| - | - | - |
| 1 | `snap --map` | **RAN** — list panel (24), search-hits (23), message list (5), composer (12), header (2); `map-dom-fallbacks=0` on every run |
| 1 | `snap --contrast` | **RAN** — subtitle 8.66:1, meta 8.66:1, kicker 15.76:1, search 6.55:1, month input 13.29:1, landing subtitle 8.45:1, Light-arm subtitle 7.01:1 / kicker 12.23:1. All PASS |
| 1 | `snap --expect-*` | **RAN** — `--expect-no-overflow` PASS on html (4 preset arms + mobile + pane-state arm) and on `header` (all four sides judged, 0 escapes) |
| 1 | `snap --matrix` | **SKIPPED** — superseded by explicit arms: 5 appearance profiles + `--mobile` + 2 theme arms + 2 pane states, each with its own receipt |
| 1 | `snap --json` | **SKIPPED** — no run hit the 200-message console cap; terminal view was complete |
| 2 | `design-audit <route>` | **RAN** — landing (1×P3), room+context (P1 ×2, P2 ×3, P3 ×2, `NO VERDICT` ×17) |
| 2 | `design-audit --mobile` | **RAN** — landing (1×P3, `pointer=coarse`), room (1×P3, `pointer=coarse`, zero tap-target findings) |
| 3 | `motion-audit` | **RAN** — bare arm FAIL (7 LoAF, 579ms worst blocking, 42.86% dropped, CLS 0); `--full-motion` arm FAIL (115ms, 23.08%). One earlier invocation returned `INSTRUMENT-ERROR` (bad `--selector` target, nothing composited) and was **discarded, not read as a verdict** |
| 4 | `perf-meter --click` | **RAN** — `--cycles 3`, `breach-steps=3 worst-longtask=404ms worst-click=248ms`; cold-only (cycle 2 = 16ms, cycle 3 = 0 long tasks) |
| 5 | Lighthouse desktop | **RAN** — `reports/lighthouse-rail-chats/` — a11y 100, best-practices 100, SEO 100, agentic 100; 1 failure = the known `label-content-name-mismatch` FP |
| 5 | Lighthouse mobile | **RAN** — `reports/lighthouse-rail-chats-mobile/` — identical scores, identical single FP |
| 6 | `__orb.motion()` / `.renders()` | **RAN** — scoped month jump (39ms blocking, CLS 0.0346 all-virtualized); deep scroll (CLS 0, worst blocking 13ms); render heatmap (`chat:transcript` 1 mount + 9 updates, 343ms) |
| 6 | `__orb.animations()` | **SKIPPED** — `motion-audit` reports `dirty-animations=0` on both arms; no compositor-dirty animation to chase |
| 7 | Console triage | **RAN** — see table below |
| 8 | The PNGs, actually looked at | **RAN** — landing, search-empty, search-hits, month-jump, room (Hikari), room (group + context), mobile, compact, reading; plus a framebuffer decode (`reports/px-rail-chats.mjs`) because the eye is not a colorimeter |
| 9 | Keyboard walk | **RAN** — 16-stop forward walk from page top (`fv=true` at every stop), 11-stop Shift+Tab walk from the composer, per-row Tab walk (4 stops), row arrow-nav walk |
| 10 | Appearance arms | **RAN** — `defaults`-equivalent (owner's live row, probed first, never assumed), `maximal`, `compact`, `reading`, `diagnostics`; plus `--appearance '{"backgroundDim":0}'` as a targeted mechanism probe |
| 10 | Theme arms | **RAN** — `--theme Light` (applied, `data-theme=light`, contrast + overflow PASS) and `--theme none` on the LANDING only. Not taken inside the room: D44 carried-theme takeover, per brief |
| 11 | Pane-state arms | **RAN** — list docked + context collapsed (69ch) · list docked + context docked (group room) · list collapsed + context docked (69ch, no overflow) · mobile (single-pane). Measure and overflow hold at every state |
| — | `record` (transition strip) | **SKIPPED** — the jank question was answered numerically by `motion-audit` + `perf-meter`; no transition needed frame-by-frame adjudication |
| — | `snap --isolated` / `--dirty` | **SKIPPED** — brief hazard: a sibling holds the stage band on `:5273`. Live `:5173` only; the stage was never touched and `--stage-down` was never run |

### Console triage

| Message | Disposition |
| - | - |
| `[frame] long frame … @ main.tsx` | **known-ruled** — the boot eval named in the brief |
| `[drop] 53–101ms mid-animation · svg[aria-label=Orbweaver] · [data-slot=weave-veil]` | **known boot** — the splash mark, present on every cold run; three drops per boot. Worth noting that they fire while `data-reduced-motion=true`, but the surface owner is the boot splash, not Chats — **not filed here** |
| `[perf] slow commit region:list 14–66ms` | **INVESTIGATE** — folded into the P1 cold-open finding (`__orb.renders()` gives the mechanism) |
| `[perf] slow commit region:content 12–70ms` | same, same finding |
| `[cls] shift 0.0066 · CLS 0.0071 (virtualized 0.0000)` | **accepted** — non-virtualized 0.0071, well under the 0.1 budget; consistent across every run |
| `[reflow] forced synchronous style/layout 7–64ms` | **INVESTIGATE** — same P1; matches the 6-of-7 `style/layout in-frame` LoAF signature |
| 502s on `/api/auth/me`, `/api/auth/config`, `chat.listChats` (one run) | **environmental** — server respawn, recovered on the next poll; run discarded and repeated. See Retraction 7 |
| `[space] <canvas> has no reserved box · [data-slot=web-weave-canvas] · route /login` | **out of scope** — login route, seen only in the discarded 502 run; flagged for whoever owns that surface |

**Console verdict on every clean run: 0 errors, 0 page errors.** Warnings ranged 4–30, all classified
above. No `--strict-console` run was needed to reach a verdict.

---

## Artifacts

- Screenshots: `reports/snaps/chats-landing-bare.png`, `chats-search-empty.png`,
  `chats-search-hits.png`, `chats-month-jump.png`, `chats-landing-light.png`,
  `chats-landing-notheme.png`, `room-hikari.png`, `room-group.png`, `room-group-dim0.png`,
  `room-mobile.png`, `room-maximal.png`, `room-compact.png`, `room-reading.png`,
  `room-diagnostics.png`, `room-nolist-ctx.png`, `bubble-over-art.png`
- Lighthouse: `reports/lighthouse-rail-chats/`, `reports/lighthouse-rail-chats-mobile/`
- design-audit JSON: `reports/design-audit/root.json` (overwritten per run — the tables above are the
  durable record)
- perf/motion JSON: `reports/perf-meter/perf-meter.json`
- Analysis scripts written for this review: `reports/px-rail-chats.mjs` (per-scanline framebuffer
  contrast decode), `reports/bg-lum-rail-chats.mjs` (shipped-background luminance model). Both under
  gitignored `reports/`.
