---
kind: review
status: active
updated: 2026-09-05
---

# side-eye — the Regex panel mock (`canvas.html`), design review before build

Lane **cb-regex-sideeye** · 2026-09-05 · subject: `scratchpad/st-regex/canvas.html` (uncommitted),
judged against `DESIGN-regex-panel.md`, `STUDY.md`, `PROPOSAL-{ia,ux,sys}.md`, and the shipped
neighbours in `packages/client/src/features/chat/components/`.

Load at start was **38.74** (above the brief's 30). I rendered **every** board anyway — each frame is
an element screenshot off one page, which is cheap — but I ran the measurement passes serially rather
than in parallel. Nothing was dropped for load.

---

## VERDICT — **BUILD WITH THESE CHANGES**

The IA is right and I would not relitigate it: a `Regex` disclosure in the This-chat tab, sibling of
Injections and Lorebooks, is the correct home, it is the ruled home (#616), and the hand-off to Config
for authoring is the correct seam. The two-scope switch grammar is genuinely better than
SillyTavern's and it is the design's real contribution. The accessible names are the best thing on
the board — `"Strip OOC — everywhere"` vs `"From the preset · Noir — in this chat"` puts the scope a
367px column has no pixels for into the name, for free, and it is exactly right.

But the drawing does not survive its own measurements. Four things are structurally wrong and one of
them falsifies the design's central claim:

1. **It does not fit.** The Regex section alone is **856px** inside a **762px** pane. The bisect
   ladder the whole design is built on — master, then every tier, then the row — is never co-visible.
   The UX proposal's "all four tier switches visible after ONE tap" is false as drawn, before the
   real (larger) switch primitive is substituted in.
2. **The `Everywhere` tier has no switch** (`canvas.html:168`, `switchable: false`). The tier holding
   2 of 6 scripts has no local lever, so the one thing a debugger most wants to try — "is it my global
   regex?" — can only be answered by flipping rows off in every chat you own.
3. **The off-tier row is unreadable** in both themes — name **2.66:1** Hearth / **2.01:1** Light,
   pattern and stamp **1.86 / 1.67**. The design's stated reason for keeping off rows on screen ("so
   you can still read what you turned off") is falsified by its own drawing.
4. **The dedup rule is drawn backwards**, which hides the exact trap the design says must be pinned.

None of these is an IA problem. All are fixable inside the shape. Redraw the body; keep the plan.

---

## The blunt taste verdict (§13)

**It does not look like shit. It looks like the app.** The kicker register, the hairlines, the count
chips, the row anatomy and the two themes all read as native to the This-chat pane — a builder could
take this drawing and land something that does not stick out. The panel is chrome-clean; there is no
slop tell in it (no gradient text, no icon-tile stack, no nested cards, no accent border, no bounce).
That is a real compliment and it is why the verdict is not "redraw".

**What flows weird:** the eye lands on a paragraph, not on the work. Reading top to bottom you get a
3-line intro, a switch, a kicker, a gloss, then finally a row — and then a gloss again, and again, and
again. Six gloss lines cost **108px** and the intro **52px**: **160px of prose against 265px of
rows**. The prose leads and says the least; the rows are what you came for and they are what recedes.
"From Alice" followed by "Came with Alice's card." is the same fact twice, 18px apart, in a pane that
is already 94px over budget.

**What reads cramped:** the scent line. 52px of stage squares plus \~77px of `· edited 5d ago` eat
**55% of the 236px scent column before the pattern gets a character** — and the pattern is the one
authored field that tells two rows apart. This is not a new mistake; it is the mistake
`regex-placement-labels.ts` already records having made and fixed ("the stage phrase alone wanted
396-572px of a 133px column, so the pattern and the edit stamp were past the ellipsis at EVERY pane
width"). The mock re-spent the width, on a fixed-slot strip and a stamp the UX proposal explicitly
told it to drop.

**The one-home check (§13 IA lens):** clean on the big axis — the row switch is `enabled`, the config
library row stays quiet, and the 2026-08-19 fork stays closed. Two smaller doublings: `global` in the
gloss vs `Everywhere` in the kicker, one tier apart; and `ON SCREEN` wearing the identical kicker
chrome as the four run-order tiers when it is a completely different concept.

**Cold-read test:** a first-timer opening this can tell what it is for within five seconds — the
intro line does real work and "Run regex in this chat" is unambiguous. That is a pass, and it is
better than SillyTavern's panel, which explains nothing.

---

## The nine answers

### 1. The debugging loop as drawn — **it loses the loop to scroll depth**

Measured on board 1 at 1440×900, `.cview` (`geo.mjs`):

| | value |
| - | - |
| pane scrollHeight / clientHeight | **1102 / 762** — 31% below the fold |
| the Regex section's own height | **856px** — 12% taller than the pane that holds it |
| `Only here` tier switch | y=1028, fold at y=1007 — **21px past it** |
| `Add to this chat` · `ON SCREEN` · `Macro picks` · `Host controls` | all below the fold |
| phone (430×860) | **1254 / 630 — 50% below the fold**; 2 of 4 tier switches visible |

So the honest per-step cost is not the proposal's table. Flipping a tier and then a row inside it
often costs a **scroll** between them, and scrolling to the `Only here` switch takes the master and
the `Everywhere` rows off screen. **You can never see the whole ladder.** With six scripts. The
proposal's decisive argument for non-collapsible tier groups — "all four tier switches visible after
ONE tap, rather than four doors behind a door" — is not delivered by this drawing at either viewport.

`shots/hearth-f0.png` (top) and `shots/hearth-f0-scrolled.png` (bottom) are two disjoint halves of one
instrument.

**Closed-by-default is right and I would not change it.** The count chip does the index job, and it
is honest: driving a row off took it 6 → 5 live (`drive.mjs`).

**The toast is in the wrong place.** `canvas.html:121` pins it `position:absolute; left:50%;
bottom:84px` **of the whole shell**, so it lands at x=521–919 over the transcript's last message,
\~500–800px from the switch that raised it (`shots/hearth-f1.png`, `shots/driven-rowoff.png`). Feedback
belongs near its source, and covering the transcript you are reading to judge the flip is the one
thing this panel was placed beside the transcript to avoid.

> **Fix — `layout:` the section body — receipt: `cview.scrollHeight ≤ clientHeight` with 6 scripts at
> 1440×900, and the master + every tier switch co-visible.** Concretely: (a) drop the four
> per-character/preset gloss lines (−72px), (b) drop the edit stamp (§3), (c) make the master + tier
> switch strip **sticky** to the top of the section body so the ladder never scrolls away, or (d)
> compress the four tier switches into one row of labelled toggles above the list. Anchor the toast
> inside the CONTEXT pane, bottom-aligned to the section.

### 2. The two-scope switch grammar — **it reads, but only in the accessible tree; the eye has to infer it**

What lands:

- The accessible names are excellent and carry the scope verbatim: `"Strip OOC — everywhere"`,
  `"From the preset · Noir — in this chat"`, `"Run regex in this chat"` (`probe2.mjs`). Sam gets the
  grammar for free at every switch. This is the design's best decision.
- The intro says both halves in one sentence and it is legible (17.67:1, 12px).
- The Undo toast fires only on the reaching flip and names the consequence in the user's terms
  ("Turned off everywhere — every chat that uses Strip OOC"). Driven, works.
- There **is** a real spatial encoding: chat-scope switches (master, tiers) sit at x=1431; global-scope
  row switches sit at x=1395. Consistent across every row.

What does not land: **nothing tells the eye about that 36px.** The two switches are pixel-identical —
same 28×16 track, same colour, same knob. A sighted user who has not read the intro sees twelve
identical switches in two columns and no reason to think they mean different things. The intro is
three lines of 12px prose at the top of a section that scrolls 340px; by the time you are flipping the
`From Bo` row, the sentence that explained it is off screen.

The toast is the real teacher, and it only teaches after the fact. That is acceptable — undo makes
being wrong free, and it is the right call over a confirm — but the panel should not depend on it.

> **Fix — the minimum change, `typeset:` the two switch families — receipt: a screenshot where a
> reader who has not read the intro can name each switch's scope.** Give the row switch a persistent
> scope word in its own row. The cheapest slot is the scent's tail, which frees up the moment the
> edit stamp goes (§3): the row already carries `· off` when disabled — carry `· everywhere` when
> enabled, or a single leading `∞` marker in the reserved marker slot. Second-cheapest: label the
> tier switch column once, at the top, `here` — a 4-character micro label above x=1431. Do **not**
> put the scope in a per-row chip; the 2026-08-22 P2-2 finding already removed that shape.

### 3. Density and hierarchy at 384px — **the numeral earns its column; the stage strip and the stamp do not**

Measured (`geo.mjs`, board 1, 382px pane / 358px content):

| element | measured |
| - | - |
| row height | 44–45px × 6 = **265px** |
| stage strip | **52px, fixed, every row** (6 slots always drawn, `canvas.html:106-107`) |
| name column | 236px, no overflow at these names |
| scent column | 236px — **one row overflows: scrollWidth 271 vs 236** ("Trim trailing hedges") |
| gloss lines | 6 × 18px = **108px** |
| intro | 52px |
| `+1` chip | 9.5px type — below the ramp's 10.5px micro step |

- **The rank numeral earns its column** — it is what makes the kicker's "in run order" claim checkable
  instead of asking the reader to count, and it is 18px. Keep it. (But see §4 — it stops being run
  order the moment anything is off.)
- **The stage strip does not earn 52px.** The mock draws six 7×7 squares always, filled = active. That
  is a bitfield, and a bitfield needs a key. **Nothing on this panel says which square is the eye** —
  which makes the mock's own "Display vs prompt" note ("The stage glyphs on each row already say
  which") false as drawn. The shipped `REGEX_PLACEMENT_GLYPHS` are self-describing (Send / BookOpen /
  History / BrainCircuit / Sparkles / Eye), carry their label as the icon's accessible name, and are
  drawn **present-stages-only** (`regexPlacementStages` filters). At \~16px each the median row here
  (2 stages) spends **32px against the mock's 52** and is readable without a legend. The brief said
  judge the information, not the square: the information is worse than what ships.
- **The edit stamp must go**, exactly as `PROPOSAL-ux.md` §4 prescribed (`regexPanelScent` = glyphs +
  the whole pattern, nothing else) and exactly as the mock did not. It costs \~77px, it is the reason
  the one truncation exists, and its stated purpose — telling four rows called "New script" apart in
  the *library* — is not this panel's question. Dropping it takes the pattern's budget from 107px to
  184px (**+72%**) and retires the truncation.
- **Four of the six gloss lines say nothing the kicker did not.** "From Alice" → "Came with Alice's
  card." Keep the gloss on `Everywhere` and `Only here` (genuinely non-obvious scope); drop it on
  preset and character tiers. −72px.
- **The `+1` chip reads fine** at 22px wide, 6.85:1, and is correctly placed beside the name rather
  than in `markers`. Only nit: 9.5px is an off-ramp size.
- **Nothing is cramped on the Hearth or Light boards at desktop** apart from the one scent overflow.
  On the phone there is more slack and no truncation at all.

**What recedes that should lead:** the rows. **What leads that should recede:** the per-tier glosses.

> **Fix — `distill:` the row scent and the tier glosses — receipt: zero `scrollWidth > clientWidth`
> on any `.sc` at 358px with the four longest names in the owner's library, and `.prov` present on
> exactly two tiers.**

### 4. State legibility — **not enough, and it is the most serious finding on the board**

**A tier turned off.** Measured `c2.mjs` / `c3.mjs`, board 2, both themes, with a planted control
(a deliberate `#4a4a4a` element read **2.27:1** — the instrument can see):

| element | Hearth | Light | needs |
| - | - | - | - |
| rank numeral (op 0.55) | **3.25:1 FAIL** | **2.49:1 FAIL** | 4.5 |
| script name (op 0.33) | **2.66:1 FAIL** | **2.01:1 FAIL** | 4.5 |
| pattern + stamp (op 0.33) | **1.86:1 FAIL** | **1.67:1 FAIL** | 4.5 |
| the row's disabled switch | op **0.28** | op **0.28** | — |

The cause is **compounding**: the tier's `.off` dim multiplies the row's own identity dim
(0.55 × 0.6 = 0.33) and the switch's `aria-disabled` dim on top (0.55 × 0.5 = 0.275). The proposal
prescribed the shipped `opacity-60` idiom on the identity cluster *only*; the mock applied a second,
outer dim to the whole tier and never checked the product. `shots/light-f1.png` is the receipt your
eye needs: the row is a ghost.

This is not a cosmetic miss. The design's stated reason for keeping an off tier's rows on screen is
"so you can still read what you turned off." At 1.67:1 you cannot. Note also that **axe would not
catch this** — axe ignores ancestor opacity — so a Lighthouse-green build could ship it.

**A row turned off.** Driven (`drive.mjs`, `shots/driven-rowoff.png`): the row dims, the switch goes
grey-left, the stamp is replaced by `· off`, the section chip drops 6→5 and the tier chip 2→1. The
mechanics are right. But **`· off` measures 3.68:1 (op 0.6, Hearth) — a FAIL, and it is the only
textual off signal** the design has, since strikethrough was correctly refused. The one word that
carries the state is the least readable thing in the row.

**The disabled switch announces the wrong thing.** In board 2 the row switch is
`aria-disabled="true"` **and `aria-checked="true"`** (`probe2.mjs`). A screen-reader user hears
"Trim trailing hedges — everywhere, switch, **on**" for a script that is not running. Nothing in the
row says *why* it cannot be operated. Same class one level up: the tier switches are disabled when
the master is off (`canvas.html:203`) with no explanation.

**Does board 2 tell the story without the caption? No — and worse, board 2 does not draw the state
its caption claims.** The caption says "`Em-dash killer` turned off EVERYWHERE (toast with Undo)".
The DOM says that row is `aria-checked="true"`, `class="switch on"`, `opacity: 1`. **The toast claims
a flip the row does not show**, and consequently **no board in the set draws an off row** — I had to
drive it myself to see one. The single most important state in a panel about turning things off is
undrawn.

> **Fix — `polish:` the inert states — receipt: every text node in an off tier and an off row ≥4.5:1
> in Hearth, Light and Mocha, measured with ancestor opacity composited.** Stop compounding: one dim,
> on the identity cluster, at the value that measures. Give the disabled switch a reason in the row
> (`· off — the preset's scripts are off here`) rather than a dim, and `aria-checked` must not say
> "on" for a script that is not running. Redraw board 2 with the row actually off.

### 5. Member view — **it reads fine, not broken; two fixes**

`shots/hearth-f2.png`. The one-line gloss in a bordered card ("The host's regex applies to this room.
Only the host can change it.") lands *before* you notice anything is missing, and one real `Only here`
row proves the section is not empty. `scrollHeight === clientHeight` — no scroll. It follows the
`chat-books-section.tsx` precedent exactly: the member's row renders **no trailing cluster at all**
rather than a disabled one, which is the right call and the one the sibling documents rack exists to
enforce.

Two problems:

- **The count chip reads `REGEX 1` while six scripts run.** The Documents precedent (chip counts what
  this viewer received) works there because the member's payload *is* the visible set; here it is a
  genuinely partial view, so `1` is a number a member will read as the total. Omit the chip in the
  member arm, or fold the shape into the gloss.
- **The mock renders `HOST CONTROLS` for the member.** `settings-context-tab.tsx:276` is
  `{isHost ? <HostControls …/> : null}` — a member's tab **ends after Macro picks**. `SECTIONS_AFTER`
  in the mock is unconditional (`canvas.html:172`). RENDERED-WRONG; it misleads about the pane's
  member shape.

### 6. Phone — **no overlap, nothing clipped, but the fold is worse and the picker sheet is half empty**

`shots/hearth-f3.png`, `shots/hearth-f3-scrolled.png`, `shots/hearth-f4.png`, `shots/light-f3.png`.

- **Nothing is overlapped or clipped.** The context tab strip and the app rail stack cleanly; the
  wider content box means no scent truncates at 430px.
- **50% below the fold** (1254 / 630) — worse than desktop, and the two bottom bars plus the back bar
  and the room band spend \~230px of the 860px screen on chrome before the section starts.
- **Tap targets, as drawn**: 14 of 28 under 44px on p1, 16 of 31 on p2. Every switch is 34×20; the
  grip is 16×24; `Add to this chat` is 139×**32**; the picker's `Cancel` / `Attach 1` are **32** tall.
  The kebabs and the `Back` / `Close` buttons *are* 44×44 — so the mock modelled the coarse floor for
  some controls and not for others. **See the mock-artifact note below**: the shipped `Switch` is
  64×44 at a coarse pointer, so the build will not ship 34×20 — but it also means the mock's phone
  row geometry is 30px-per-switch optimistic in width and shorter in height than the real thing.
- **The picker sheet has a real close (44×44) and a scrim.** But it is **658px tall with content
  ending at \~370px — \~290px of dead sheet below the `Attach` button**, sitting exactly in the thumb
  zone. It reads as "the rest failed to load." Size the sheet to its content, or bottom-anchor it.
- **The picker offers rows it should not.** "Curly quotes — already attached everywhere" is
  selectable; attaching it to this chat is a no-op the dedup rule will swallow (it would still run at
  its earliest tier). Disable those rows with the reason, or omit them.

### 7. A11y as drawn

| Claim | As drawn | Verdict |
| - | - | - |
| every switch is `role=switch` with a scoped name | **yes, all 12** — `role="switch"`, `aria-checked`, and a name carrying the scope (`probe2.mjs`) | **the best thing on the board** |
| the section trigger | a `<button class="trig">` with a computed name from its visible label + count chip | matches `chat-context-disclosure-section.tsx`; correct |
| headings | **`f.querySelectorAll("h1..h6,[role=heading]")` returns `[]` — zero headings in the whole frame** | UNDRAWN. The design says each tier group is a `Section kicker` → a real `<h3>`; nothing in the mock is. The build owes the pin, and the flat outline (tier `<h3>`s under the section's own `<h3>`) is the pane's existing shape, correctly not invented around. |
| toast as `role=status` with an Undo button | `<div class="toast" role="status">…<button class="undo">Undo</button></div>` | role is right. **But an interactive control inside a live region** is announced as part of the message and vanishes on dismiss — the Undo needs to survive long enough to be reached by keyboard, and the announcement should not read the button label as prose. |
| drag grip on touch | `<span class="grip" aria-label="Drag to reorder">`, **16×24, no role, no tabindex, not focusable** | UNDRAWN and wrong twice over: `aria-label` on a generic span is not reliably exposed, and the shipped `SortableList` names the grip with its row (`Reorder Trim ellipsis`), not a bare verb. |
| focus order down the column | trigger → master → (row switch → kebab)×N with tier switches interleaved, in DOM order | **correct**, and it falls out of the `ListRow` `actions`-as-sibling contract for free |
| — | **six kebabs, five with the byte-identical name `"More: Open in library"`** | **P1.** None names its row. This is the #443 defect `regex-collection-rows.tsx:14-17` already fixed with `rowQualifiers` ("`Add script` mints every row 'New script', so the bare form gave one list two identically-named controls"). It also announces the *menu contents* rather than the *subject*. |
| — | picker checkboxes are `<span class="cb">` 18×18, **no role, no tabindex**; the sheet has **no `role="dialog"`, no `aria-modal`** | UNDRAWN — the build must use the shipped `RegexScriptPicker` |

**Meaning by colour alone:** passes in principle — the switch carries knob position as a second
channel. But see the mock-artifact note: the mock's off track is 1.27:1 (Hearth) / 1.01:1 (Light)
against the panel, so the position channel has no visible reference frame.

### 8. Consistency with the neighbours — **it belongs, with one seam**

Against `injections-manager.tsx`, `chat-books-section.tsx`, `room-overrides-tab.tsx`,
`settings-context-tab.tsx`:

- **Kicker voice, count chip, trigger-is-the-kicker, closed-by-default, `size="inline"` chip**: all
  match. The `HeadingWithCount` idiom is used correctly (no `0` chip; the member arm should follow).
- **Type scale**: interactiveKicker 12px/600, kicker 10.5px/600, name 13px/500, scent 11px/400 — the
  pane's own register. One off-ramp: the `+1` chip at 9.5px.
- **Row density**: 44–45px rows against the neighbours' collapse-row grammar. Consistent.
- **How a body ends**: Injections ends with an `Add injection` affordance; Lorebooks with `isHost ? <attach> : null`. Regex ends with `Add to this chat` — matches. But then it keeps going into
  `ON SCREEN`, which is where the seam is.
- **The seam — `ON SCREEN` wears the same clothes as a tier.** Five identically-treated kickers in a
  run-order list, and a sixth that is a completely different concept (who else sees your display
  scripts). The design knows this ("shows it as its own group rather than pretending it is tiered")
  but the drawing does not differentiate it by one pixel. Recommendation: move the broadcast switch
  **up beside the master**, so the section reads *room-level switches → the run-order list* instead of
  being bookended by a room switch at each end.
- **The permission line.** `settings-context-tab.tsx`'s D-1 comment states the Host-controls band "is
  also exactly the permission line: everything above it any member may set, everything inside it is
  host-only." Regex lands above that line and carries the host-only broadcast switch. The
  Documents/Lorebooks precedent covers *row-level* omission; a whole host-only setting above the line
  is new. Absorbing `Appearance` also moves that switch from `defaultOpen` inside an opened Host
  band to **buried inside a closed-by-default section** — a host looking for it will not find it
  where they left it. Worth an explicit note in the build, or leave the broadcast where it is.

### 9. What the mock cannot show — the build must prove each

| | Why the drawing cannot answer it |
| - | - |
| **The real switch's width and height** | **The single biggest fidelity gap.** The mock draws 28×16 (desktop) / 34×20 (phone). The shipped `Switch` is **48×32 fine / 64×44 coarse** (`packages/ui/src/primitives/switch/variants.ts`, #1109). Every width and height budget this mock appears to prove is optimistic by \~20px/switch at fine and \~30px at coarse. The 236px name column becomes \~205–212px; the phone rows all grow to ≥44px tall and the 50% fold gets worse. **Re-measure the whole body with the real primitive before trusting any number in §3.** |
| Long names | The six sample names are 9–19 chars and none overflows. Prove with the longest name in the owner's library at 358px **and** at the 272px pane floor. |
| 40 scripts in a tier | `COLLECTION_LARGE_GROUP` behaviour (filter box + Move up/down instead of grips) is undrawn. At 44px/row, 40 scripts is 1,760px in one tier. |
| A preset / character with none | The `· 0` header-only arm is drawn only as a side effect of board 2 and it renders **`· 0` above a visible row**, which is not the empty arm at all. |
| The tab's total height | Injections/Documents/Lorebooks/Macro picks are drawn as inert stubs. The measured real pane was 2,836px over 14 sections; Regex adds **856px** as drawn, making it the second-largest section in the pane after the host band. The design's "the section count stays at 14" framing does not price that. |
| The toast on a phone | No phone board raises one. At 430px, `"Turned off everywhere — every chat that uses Trim trailing hedges"` plus an `Undo` button will wrap; and on a phone the panel is full-screen, so a shell-anchored toast has no transcript to sit beside. |
| Headings, focus rings, keyboard drag, dialog semantics | All undrawn (§7). |
| Live repaint of the display leg | The design's best property — flip a `Rendered transcript` script and the transcript repaints 3 inches left — is static in every board. |

---

## Findings, ranked

### P1

| # | Board | What | Receipt | Recommendation |
| - | - | - | - | - |
| 1 | 1, p1 | **The bisect ladder does not fit.** Section 856px in a 762px pane; 31% below fold desktop, 50% phone; `Only here` tier switch 21px past the fold. Falsifies "all four tier switches visible after ONE tap". | `geo.mjs`: `bodyScroll 1102 / bodyClient 762`, `regexSectionH 856`; acts `tier Only here y=1028`, fold y=1007. `shots/hearth-f0.png` + `hearth-f0-scrolled.png` | `layout:` sticky master+tier strip, or one compressed tier-toggle row; plus the −124px from findings 12/13 |
| 2 | 1 | **`Everywhere` has no tier switch.** The tier holding 2 of 6 scripts cannot be silenced locally; the only lever is a row switch that reaches every chat. | `canvas.html:168` `switchable: false`; `probe2.mjs` — 4 `tier` switches, none for Everywhere | Give it one. If the fork with `PROPOSAL-ia` (read-only provenance group) is deliberate, it needs stating — DESIGN §3 says four tier switches and `PROPOSAL-ux` §3 builds the halving ladder on it |
| 3 | 2 | **Off-tier rows are unreadable.** name 2.66 / 2.01, pattern+stamp 1.86 / 1.67, rank 3.25 / 2.49 (Hearth / Light). Cause: compounding opacity 0.55 × 0.6 = 0.33. Axe cannot see this. | `c2.mjs hearth 1`, `c3.mjs light noflip 1`; control planted at 2.27:1 (`ctl.mjs`). `shots/light-f1.png` | One dim, on the identity cluster only, at a value that measures ≥4.5:1 in all three seeds |
| 4 | driven | **The off-row's `· off` is the least readable thing in the row** at 3.68:1 — and it is the only textual off signal. | `c3.mjs hearth flip 0`; `shots/driven-rowoff.png` | Full-weight the state word; dim the descriptive scent, never the state |
| 5 | 2 | **The board does not draw the state its caption claims.** `Em-dash killer` is `aria-checked=true`, `class="switch on"`, `opacity 1` while the toast says it was turned off everywhere. **No board draws an off row.** | `probe2.mjs` frame 1; `shots/hearth-f1.png` | Redraw board 2 with the row actually off |
| 6 | 1 | **Dedup drawn backwards.** `bo-shout` sits under `From Bo` with `+1 Everywhere`; its earliest tier IS Everywhere (order global→preset→characters→chat, `regex-tier.ts:7-14`), so it must sit under `EVERYWHERE` at rank 3 with `+1 From Bo`. As drawn it also hides the trap the design says must be pinned — turn a tier off and a script keeps running because it is also global. | `canvas.html:164` `tier:"bo", also:"Everywhere"` vs `DESIGN-regex-panel.md` §3 "at its earliest tier" | Redraw; and pin the trap case explicitly on a board |
| 7 | all | **Six kebabs, five byte-identical names** `"More: Open in library"` — none names its row. The #443 defect, already fixed once. | `probe2.mjs` focusables | `rowActionSubject` / `rowQualifiers`, e.g. "More actions for Trim trailing hedges" |

### P2

| # | Board | What | Receipt | Recommendation |
| - | - | - | - | - |
| 8 | driven, 2 | **Rank numerals stop being run order.** Chip says 5, ranks run 1..6, rank 1 is dead. Two numbers, two denominators, no label — on a panel whose entire claim is "the effective regex in run order". | `drive.mjs`: chips `5`, `EVERYWHERE · 1`, row 1 `· off` at rank 1 | Renumber the running set 1..N live; off rows get no numeral (a dash) |
| 9 | 2 | `FROM THE PRESET · NOIR · 0` printed above a visible row. The `· 0` chip and the empty arm are the same spelling for two different states. | `c2.mjs hearth 1` | An off tier's chip should say `off`, not `0` |
| 10 | 1, p1 | **`ON SCREEN` wears identical kicker chrome to the four run-order tiers** and sits in the run — it reads as a fifth tier. | `shots/hearth-f0-scrolled.png`, `hearth-f3-scrolled.png` | Move the broadcast switch beside the master at the top |
| 11 | all | **The 6-slot stage strip costs 52px/row, has no legend and no accessible name.** Falsifies the mock's own "Display vs prompt" note. | `canvas.html:106-107`; `geo.mjs stagesW 52`; `probe2.mjs` — no labels | Use the shipped `REGEX_PLACEMENT_GLYPHS`, present-stages-only, with `<Icon label>` |
| 12 | 1 | **The edit stamp was retained against the UX proposal's own prescription** and causes the one measured truncation. | `geo.mjs scOverflow {sw:271, cw:236}`; `PROPOSAL-ux.md` §4 `regexPanelScent` | Drop it: the pattern's budget goes 107px → 184px |
| 13 | 1 | **160px of prose against 265px of rows.** Four of six glosses restate their kicker. | `geo.mjs provTotal 108, introH 52, rrowH 6×44` | Keep the gloss on `Everywhere` and `Only here` only (−72px) |
| 14 | 1 | `global` (gloss) and `Everywhere` (kicker) name one tier, 18px apart. | `canvas.html:168` "Your global scripts — every chat." | One word |
| 15 | 3 | **The member board renders `HOST CONTROLS`**, which a member never sees. | `settings-context-tab.tsx:276` `isHost ? … : null`; `canvas.html:172` unconditional | Redraw |
| 16 | 3 | Member chip reads `REGEX 1` where six run. | `shots/hearth-f2.png` | Omit the chip in the member arm |
| 17 | 1 | Regex sits above the Host-controls **permission line** while carrying the host-only broadcast; and `Show my display scripts to everyone` moves from `defaultOpen` in an open band to buried in a closed section. | `settings-context-tab.tsx` D-1 comment + `:322-330` | State it in the build, or leave the broadcast in Host controls |
| 18 | 2 | **Disabled with no reason, and announcing the wrong state.** Row switches disable when the tier is off; tier switches disable when the master is off; nothing says why, and `aria-disabled=true` sits beside `aria-checked=true`. | `canvas.html:203,208`; `probe2.mjs` frame 1 | Give the reason in the row; do not announce "on" for a script that is not running |
| 19 | 2, driven | **The toast lands over the transcript**, 500–800px from its switch. | `canvas.html:121`; toast rect x=541 w=423 over the last message | Anchor it in the CONTEXT pane |
| 20 | p2 | **Picker sheet: \~290px of dead space** below `Attach`, in the thumb zone; and rows already attached everywhere are selectable no-ops. | `drive.mjs` sheetRect h=658, content ends \~370; `shots/hearth-f4.png` | Size to content; disable-with-reason the no-op rows |

### P3

| # | What | Receipt |
| - | - | - |
| 21 | `+1` chip at 9.5px — off the 7-step ramp (micro is 10.5px). | `c2.mjs` |
| 22 | **`DESIGN-regex-panel.md` §4 claims `Everywhere` is in `vocabulary-map.md`. It is not** — no row matches. The map's header says an absent concept "is a finding: say so rather than minting a word." The whole set (`Run regex in this chat`, `Everywhere`, `Only here`, `Open in library`, `Came with …`) needs map rows minted with the build. | `grep -i everywhere docs/design/vocabulary-map.md` → no match |
| 23 | **`STUDY.md` §5 and `DESIGN` §3 state opposite tier semantics** — STUDY says the tier master is a per-carrier allow (`presets.regexAllowed`, `chats.regexAllowed`, schema additions); DESIGN says it is per-chat (`ChatMetadata.regexTiers`). `PROPOSAL-sys` Q2(c) refutes STUDY's version on the tree. STUDY §5 needs a superseded marker or a builder will implement the global one. | `STUDY.md` §5 vs `DESIGN-regex-panel.md` §3 vs `PROPOSAL-sys.md` Q2 |

### Mock artifacts — not design findings, but they void the drawing's budgets

These are properties of the hand-drawn mock, not of the proposed design. I am **not** filing them
against the design; I am filing them against anyone who reads a number off this drawing.

- **The switch is drawn at \~58% of the shipped primitive's fine-pointer width and \~53% of its coarse
  width** (28×16 / 34×20 vs 48×32 / 64×44). Voids every row-width and section-height number.
- **The mock's off-switch track measures 1.27:1 (Hearth) / 1.01:1 (Light) against the panel** —
  effectively invisible, so the knob-position channel has no reference frame. The shipped primitive
  is explicitly bounded from both sides against WCAG 1.4.11's 3:1 (`switch/variants.ts`, #1090), so
  the build will not ship this — but it means **every state judgment made by eye off these boards was
  made against an unreliable signal**, mine included.
- No headings, no dialog role, non-focusable grip and checkboxes (§7).

---

## Per-decision table — the mock's own "What this mock decides" notes

| # | The note | Verdict | Why, in what a user feels |
| - | - | - | - |
| 1 | **The steer** — a collapsible thing like Injections/Overrides, editing stays in Config | **Agree** | It is the shape the reader's muscle memory already has; nothing new to learn, and the transcript stays on screen. Unqualified yes. |
| 2 | **Where** — a Regex disclosure in This-chat; not a tab, not a drawer, not Config | **Agree** | Ruled by #616 and correct on the merits. A drawer covers the evidence; Config costs four acts per bisect step. |
| 3 | **Two switches, two scopes** — tier means here, row means everywhere | **Agree with a change** | The grammar is right and better than ST's. But as drawn the two switches are pixel-identical and the only differentiator a sighted user gets is 36px of x and a sentence that scrolls away. Give the row switch a persistent scope word (§2). |
| 4 | **Run order is the visual order** — numbered through, deduped at the earliest tier with `+1`, four tier groups as plain sections so all four levers show after one tap | **Disagree as drawn** | Three failures: the dedup is drawn at the *last* tier not the earliest (P1-6); the numbering stops being run order the moment anything is off (P2-8); and the "all four levers after one tap" claim is false — the fourth is past the fold (P1-1). The *intent* is right; the drawing does not deliver any of the three. |
| 5 | **What the room may change** — master, tiers, row on/off, own tier attach/detach/order; nothing else | **Agree** | The refusals are all correct and well-argued: no Move-to-tier, no cross-tier drag, no reordering another tier. A room gesture that silently edits every other chat on a preset is exactly what a user would never expect. `Open in library` is the right escape. |
| 6 | **Display vs prompt** — the stage glyphs already say which; the intro says it so there is no hidden reload step; the broadcast moves here | **Disagree in two halves** | The *no-hidden-reload* half is the design's best insight and is right — ST's "reload the chat" toast is it admitting its loop has a sixth step, and we genuinely do not need one. But "the stage glyphs already say which" is **false as drawn**: six anonymous squares with no legend say nothing (P2-11). And moving the broadcast here buries a switch that is currently open-by-default, and puts a host-only control above the pane's permission line (P2-17). Alternative: keep the intro sentence, use the shipped icons, and put the broadcast beside the master rather than at the foot. |
| 7 | **Members** — Only here read-only plus one line | **Agree with two fixes** | It reads as a deliberate limit, not as broken — the gloss lands before you notice the absence, and following the Lorebooks omit-don't-disable precedent is right. Fix the `REGEX 1` chip and the phantom Host-controls section. |
| 8 | **Not adopted** — ST's default-off consent gates, named enable-sets, a per-chat mute, strikethrough | **Agree, all four** | Each refusal is argued from our model rather than from taste, and each is right. Default-off would ship every imported card's scripts silently dead (the F3 class this repo keeps filing). "Regex Presets" collides head-on with the Preset *tier two rows above it* — that one is a genuinely good catch. A per-chat mute puts two kinds of "off" on one row at 367px. Strikethrough is invisible to AT. **But**: refusing strikethrough raises the bar on the two remaining off channels, and P1-3/P1-4 show both currently fail. |
| 9 | **Cost** — one read, two per-chat flags, mounting a built picker and order editor; #1733 first | **Agree** | `PROPOSAL-sys` backs every line with a receipt, including that the chat-arm picker is built with zero production call sites. Landing the #1733 room-fan first is right — a member rack that never repaints is a worse bug than no rack. |

---

## What is genuinely working — do not touch these

1. **The accessible names.** `"Strip OOC — everywhere"` / `"From the preset · Noir — in this chat"` /
   `"Run regex in this chat"`. The scope the 367px column has no pixels for is free in the name, it
   satisfies WCAG 2.5.3 by containing the visible name verbatim, and it is the cheapest correct
   solution to the design's hardest problem. Keep this exactly.
2. **The count chip is honest and live.** 6 → 5 on a row flip, 2 → 1 on the tier, driven and measured.
   A closed section that tells you "5 things are running here" without opening is the whole reason
   closed-by-default is affordable.
3. **The intro line does real teaching work in three lines** and retires ST's hidden reload step.
   `"Display rules change what you see now. Prompt rules apply from the next reply."` is the single
   most valuable sentence on the panel and it is legible (17.67:1).
4. **The refusal set (note 8).** Every "not adopted" is argued from our model rather than from taste.

## The single biggest opportunity

**Make the ladder fit, and the panel becomes the instrument it claims to be.** Everything else on
this board is a fix; this is the one that changes what the surface *is*. Right now a debugger can see
either the levers or the row they are judging, never both, at either viewport, with six scripts. The
budget is already there without inventing anything: −72px of redundant tier gloss, −77px of edit
stamp per row, −20px/row of stage strip, and a sticky master+tier strip. That is \~250px against a
94px overrun — enough to fit the whole ladder *and* absorb the real switch primitive's extra height.
Do that and "flip a tier, flip a row, look left" is one uninterrupted gesture, which is precisely the
thing SillyTavern's one screen buys and ours currently would not.

---

## Coverage

**Drove:**

| Arm | Boards | Receipt |
| - | - | - |
| Render, Hearth | 01, 02, 03, p1, p2 | `shots/hearth-f{0,1,2,3,4}.png` |
| Render, Light | 01, 02, p1 | `shots/light-f{0,1,3}.png` |
| Scrolled-to-bottom (`.cview`) | 01 desktop, p1 phone | `shots/hearth-f0-scrolled.png`, `hearth-f3-scrolled.png` |
| Driven state change (`data-act=row`) | 01 | `drive.mjs`, `shots/driven-rowoff.png` |
| Text contrast, ancestor-opacity composited, canvas-resolved oklch | 01, 02 × Hearth, Light; + driven | `c2.mjs`, `c3.mjs` |
| **Planted positive control** | 01 | `ctl.mjs` — 2.27:1 FAIL detected; the probe can see |
| Non-text (switch) contrast | 01 × both themes | `sw2.mjs` (CSS-var resolve) — **`sw.mjs`'s track-vs-panel column returned a uniform 1:1 and was DISCARDED as a broken instrument**, see retractions |
| Tap targets | p1, p2 | `tap.mjs` |
| Geometry / truncation / height budget | 01 | `geo.mjs`, `measure.mjs` |
| ARIA: roles, names, checked/disabled, headings, focus order | 01, 02 | `probe2.mjs` |
| Mock source (CSS + data + render fns) | all | `canvas.html:83-132, 155-208` |
| Neighbour law | — | `settings-context-tab.tsx`, `chat-context-disclosure-section.tsx`, `injections-manager.tsx`, `room-overrides-tab.tsx`, `host-display-scripts-control.tsx`, `regex-collection-rows.tsx`, `regex-placement-labels.ts`, `switch/variants.ts`, `vocabulary-map.md` |

**Did not drive, with reasons:**

- **`pnpm snap --file canvas.html --design-audit`** — SKIPPED deliberately. Every rule would fire
  against the mock's hand-drawn `<button class="switch"><i></i></button>`, `<span class="cb">` and
  `<span class="grip">` rather than against `@orb/ui` primitives, producing findings about the drawing
  tool. The brief prescribed direct Playwright and I used it. **This is a judgment call, not a law** —
  if the mock graduates to a committed `docs/design/mocks/` file the audit should run against it.
- **Motion / CLS / perf** — the mock has no motion; the section's open/close transition is undrawn.
  The real section's disclosure open is a height change on a 856px body and **owes a CLS receipt at
  4× CPU on a 430px phone**, which is exactly the measurement that produced the 0.30837 single-shift
  finding on this same pane (#821). Named as a build obligation.
- **Mocha theme** — the mock ships only Hearth and Light (`#theme` is a two-state toggle). The build
  owes all three seeds for finding P1-3.
- **The 272px pane floor** (`clamp(17rem, 30vw, 30rem)`) — the mock draws only 382px. Truncation at
  the floor is unmeasured.
- **Real-pointer hover** — no hover-reveal in this design, so not applicable.

## Retractions

- **I discarded my own first contrast pass.** `contrast.mjs` parsed `getComputedStyle().color` with a
  numeric regex; Chromium serialises this mock's colours as `oklch(...)`, so it read the oklch
  components as RGB and returned a uniform `bg=rgb(0,0,60)` with ratios of 1.01–1.04:1 across the
  whole panel. **Every number in that pass was fiction.** Replaced by `c2.mjs`, which resolves each
  colour through the browser's own canvas (`fillStyle` on black and on white, solving for alpha),
  composites ancestor opacity, and was validated with a planted 2.27:1 control before I trusted a
  single "pass".
- **I discarded `sw.mjs`'s track-vs-panel column.** It read `getComputedStyle(switchRoot)
  .backgroundColor`, but the mock paints the track on a child `<i>` (`canvas.html:84`), so the root is
  transparent and every row returned a meaningless 1:1. The honest numbers in the mock-artifact note
  come from `sw2.mjs`, which reads the `<i>` and its `::after` directly.
- **I did not file the off-switch contrast as a design finding**, though my eye and my first read both
  wanted to. `packages/ui/src/primitives/switch/variants.ts` shows the shipped primitive's OFF state
  is explicitly bounded against WCAG 1.4.11's 3:1 floor (#1090) — so this is the mock's drawing, not
  the design's proposal. It is in the mock-artifact list instead.

---

## Paragraph for the orchestrator

side-eye reviewed the Regex panel mock (`scratchpad/st-regex/canvas.html`, uncommitted) against
`DESIGN-regex-panel.md`, `STUDY.md` and the three proposals, driving all five boards in both themes
plus a driven row-flip, with pixel-resolved contrast (planted control at 2.27:1) and measured
geometry. **Verdict: BUILD WITH THESE CHANGES — the IA is right and should not be relitigated; the
body must be redrawn.** Seven P1s: (1) the section is **856px inside a 762px pane** so the bisect
ladder is never co-visible at either viewport, falsifying the design's "all four tier switches
visible after one tap"; (2) the **`Everywhere` tier has no switch** (`canvas.html:168`), so the
likeliest culprit tier has no local lever — an unstated fork between DESIGN §3 and PROPOSAL-ia; (3)
**off-tier rows are unreadable** — name 2.66:1 Hearth / 2.01:1 Light, pattern 1.86 / 1.67, from
compounding 0.55×0.6 opacity, falsifying the design's own reason for keeping them visible, and
invisible to axe; (4) the off-row's `· off` — the only textual off signal, strikethrough having been
correctly refused — measures **3.68:1**; (5) **board 2 does not draw the state its caption claims**
(the toast says a row was turned off; the row renders `aria-checked=true`, `opacity 1`), so **no board
draws an off row**; (6) the **dedup rule is drawn at the last tier instead of the earliest**
(`regex-tier.ts:7-14`), which also hides the "tier off but it still runs" trap the design says must be
pinned; (7) **six kebabs share five byte-identical accessible names**, the #443 defect
`regex-collection-rows.tsx` already fixed. Thirteen P2s cover rank-numerals-that-stop-being-run-order,
`ON SCREEN` wearing tier chrome, the legend-less 6-slot stage strip (use the shipped
`REGEX_PLACEMENT_GLYPHS` present-only), the retained edit stamp that the UX proposal told it to drop
and that causes the one measured truncation, 160px of prose against 265px of rows, a phantom
`HOST CONTROLS` section on the member board, the permission-line question raised by absorbing
`Appearance`, and a toast anchored over the transcript. **Read the mock-artifact note before quoting
any width from this drawing**: the mock draws switches at 28×16/34×20 against the shipped primitive's
48×32/64×44, so every budget it appears to prove is optimistic. Two doc fixes for the build brief:
`DESIGN` §4 claims `Everywhere` is in `vocabulary-map.md` and it is not (the map's own rule says that
is a finding, not a licence to mint), and `STUDY.md` §5 states the *opposite* tier semantics from
`DESIGN` §3 and needs a superseded marker or a builder will implement the global flag. Genuinely
excellent and to be preserved verbatim: the scope-carrying accessible names, the live-and-honest count
chip, the intro line that retires SillyTavern's hidden reload step, and the whole refusal set. The
single biggest opportunity is fitting the ladder — \~250px is already recoverable from redundant
glosses, the edit stamp and the stage strip against a 94px overrun, which is enough to fit the whole
ladder *and* absorb the real switch primitive.
