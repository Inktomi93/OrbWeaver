---
kind: review
status: draft
updated: 2026-08-30
---

# Context bracket (#860) — post-fix verification drive

**Lane:** cb-bracket-eye2 · **Baseline:** `docs/reviews/side-eye/2026-08-30-context-bracket.md`
(F1–F19, 29/40) · **Subject:** the two fix legs `5d089a546` + `8be413e41` on `main`.

## Environment caveat (read this before any receipt below)

**The drive did NOT run on `:5173`.** At lane start `pnpm stack status` reported the dev stack DOWN
(server pid not bound, healthz unreachable, vite not bound) and `pnpm stack start` timed out at 180s
with `tooling/src/stack/engines.sh start` wedged at "starting gen :8703" (both GPUs ~41/49 GiB;
`engines-start.log` also logged three `recorded leader is absent; refusing survivor cleanup` warns and
a `launch identity became ambiguous during boot` refusal, with `ENGINES_POSTURE` pinned `adopt-only`).
Reported to the orchestrator on the back channel at minute ~6; the orchestrator took the engines wedge
and **approved driving the orphaned stage instead**.

Everything below was measured on the snap stage at **`http://localhost:5273`**, serving
`c6f8af758082` (the cb-bracket-fix lane's own leg-2 commit, orphaned when that lane completed).
**Equivalence receipt:** `git diff c6f8af758082 8be413e41 -- packages/client packages/ui` = **one doc
line** in `agent-tools.README.md`. The rendered client/ui tree is byte-identical to main's tip.

Two consequences to hold in mind: the stage's DB is a fresh dev copy, so the context pane defaults
**collapsed** (every run below clicks the toggle open); and the stage's gen connection names
`Qwen/Qwen3-VL-8B-Instruct` while the running engine serves `Qwen3.8-27B-heretic-…`, which is what
produced the only console errors in this pass (see Retractions).

## Verdict: SHIP WITH FIXES

Ten of the nineteen findings are **CONFIRMED fixed with my own receipts**, several of them
handsomely — the locked cell, the ownership axis, the game band's heading, the 11px floor, the reading
preset, the phone foot strip. Two are **REFUTED**: the overlay name-yield does not reach the phone
(the width F4 named first), and the Game-cell reorder is a **no-op live whose CT passes on a fixture
the product does not have**. One fix introduced a **new clip at the default desktop width**.

**Design health, scoped to the bracket: 31/40** (up from 28/40). The band NEVER gates action; the
finding list below is the deliverable.

## Per-claim ledger

| # | Claim | Verdict | Receipt |
| - | - | - | - |
| **F1** | locked Map caption ≥4.5:1 (was 3.54, claimed 8.08) | **CONFIRMED** | `snap --contrast` → Map caption **8.08:1 PASS**, byte-identical to its `Journal` sibling **8.08:1**. Computed: cell root `opacity: 1`, caption `opacity: 1`, **only the glyph at 0.6**; `aria-disabled="false"`, roving `tabindex=-1`. The dim moved off the ink exactly as claimed. |
| **F1b** | the locked cell is still a live control | **CONFIRMED** | keyboard walk: `End` → `Map — locked` (`fv=true`), `Enter` → `aria-current=true`, region becomes `context-cell-rpg.map`. It opens onto its reason. |
| **F2** | ownership composited: band == owning > receded == pane; owning kicker > receded kicker | **CONFIRMED** | band bg `oklch(0.185 0.006 60)` **==** owning rail bg `oklch(0.185 0.006 60)`; receded rail `rgba(0,0,0,0)` (**no fill — the mock's own drawing**). Kicker spans: owning **16.40:1** > receded **8.32:1**, both ≥4.5. The pre-fix inversion (8.03 vs 8.25) is gone. Inks: owning `foreground/80`, receded `muted-foreground/90`. |
| **F2b** | holds in a shipped theme | **CONFIRMED** | `--theme Light` on Characters (non-carried surface, D44): band h2 **14.89:1**, receded kicker **14.89:1**, `Overview` caption **12.20:1** — all PASS. Actionable-vs-inert ink axis holds in Light (`oklch(0.24…)` fw600 vs `oklch(0.44…)` fw500). |
| **F3** | the game band's `h2` carries the ROOM name, location demoted | **CONFIRMED** | `--aria` on the game bracket: `- heading "Example — The Ashen Spire" [level=2]`, with the scene location as a following text node. A rotor reaches the room's name. Slot `rpg-band-room-name`. |
| **F4** | overlay states print the name ONCE (430/768/1024) | **PARTLY REFUTED — see N1** | 1024×768 and 768×800: **one** visible instance (band `h2`) ✓. **430 coarse AND 430 fine: TWO** — topbar `.shell-topbar-title` at y=13 + band `h2` at y=65. Same on Chats and Characters. |
| **F5** | one Own-look trigger / one chats door at 1280 dock+dock | **CONFIRMED (door half)** | visible-node census at 1280 docked: `"own look"` → **n=1** (band only). `design-audit` `duplicate-action-door ("own look")` → **0** in both arms. The surviving `2x button "chats"` is the rail-vs-pane pair = **#891, pre-existing, not re-filed**. Token datum ×2 = the owner's ruled keep-both. |
| **F6** | band text ≥11px everywhere | **CONFIRMED** | chat band computed: `h2` 16px/600, all three chips **13px** (was 10.5). `design-audit` `undersized-ui-text` → **0** on `chat-context-band`, `character-context-band`, `rpg-header-band` in all six arms. Mobile chip tap-target clean. |
| **F12** | chip grammar: actionable vs inert by INK (~2× claimed) | **CONFIRMED numerically; see taste** | chat band, owner theme: actionable `Memory — idle` **16.40:1** vs inert `Built-in preset` **7.95:1** = **2.06×**, both ≥4.5. Same axis in the character band and in Light. One pill shape for all three; the axis is ink + weight (600/500) + case. |
| **F7** | reading preset: viewport ≥40%, orbs in the tab body | **CONFIRMED** | `--appearance-preset reading`, game room: viewport **303 of 740 = 41%** (≥40). Band **327→179**; chrome 79%→**59%**. Orbs render below the GAME STATE rail, in the tab body. Companion arms: defaults/maximal band 218 vp 52%, compact band 196 vp 57%, no overflow. |
| **F8** | overflow announces itself (fade + `data-overflow-end`) exactly when a rail overflows | **CONFIRMED mechanically** | reading: bottom rail `scrollWidth 395 / clientWidth 363`, `data-overflow-end="true"`, one rendered `[data-slot=context-rail-fade]` 30×71 at the end edge, `linear-gradient(to left, oklch(0.132 0.006 60), transparent)`. 1024×768: `316/290`, fade true. defaults/maximal/compact: overflow false, **fade false** (not a permanent veil). The literal "overflowX:false at 1280 in all arms" clause is **not** met and was explicitly superseded by the mechanism clause — stated, not re-litigated. Affordance strength: see N9. |
| **F9** | ONE foot strip at 430 (sheet over the app bar) | **CONFIRMED** | 430 coarse: sheet toolbar `9,676 413×56`; shell `nav "Primary"` `0,684 430×56` — the nav is **underneath** the sheet and invisible in the capture. `reports/snaps/cbbe2-game-430.png`, `cbbe2-chat-430.png`, `cbbe2-char-430.png` each show exactly one icon-over-caption strip. |
| **F11** | memory chip's visible word == accname | **CONFIRMED** | visible text `Memory — idle` (rendered uppercase), accname `Memory — idle`. Topbar mount stays glyph-only by design. |
| **F13** | grouped digits + the last chat named | **CONFIRMED** | band `1,257 tokens`; save bar `1,257 total · 1,017 permanent`; Activity now reads `Last chat / Aug 2, 2026 / Example — The Ashen Spire`. |
| **F14** | no orphan orb row | **CONFIRMED (orbs)** | game band at 1280 and at 306px: one orb row (HP·STA·WAR·SUP·SILVER MARKS), scrolls. **But the CHIP row still orphan-wraps — N4.** |
| **F15** | Game seated last | **REFUTED — see N3** | live `--aria` + `data-crown`, **both rooms**: `Members(false) · This chat(false) · Preview(TRUE) · Game(TRUE) · Activity(TRUE)`. `seatCrownsLast` partitions `[Members, This chat] + [Preview, Game, Activity]` — a **no-op**. Rendered order is byte-identical to the baseline's complaint. |
| **F16** | one sheet exit at 430 | **CONFIRMED** | 430: one chrome dismiss `Close Chats details` 48×48 at the band's top-right, plus the standard `Dismiss panel` scrim. The topbar's `Hide details` toggle is gone from the sheet state. |
| **F17** | the trail separated | **CONFIRMED visually — but see N2** | `button "Character actions"` is outside `toolbar "Character"` in the ARIA tree, with a `Separator` + `ms-row` inset; at 430 it reads as trail, not a seventh cell. |
| **F18** | the Members chip's three states | **CONFIRMED** | Members current → `SPAN` `3 members` (inert Badge, w=87). Preview current → `BUTTON` (w=132). Source: `chat-context-band.tsx:111-117`. Row height constant at 68 across the swap — **no vertical reflow**, no CLS. |
| **F19** | one accname at every width | **CONFIRMED** | `--map` at 1280 desktop → `button "Show details"`; at 430 coarse → `button "Show details"`. The pre-fix `Show detail panel` literal is gone. |
| **#112** | keyboard model still holds | **CONFIRMED** | one tab stop per rail (Tab from the active `Status` cell exits into the panel body); `ArrowRight` moves focus **without committing** (`aria-current` stayed `Status` across three cells); `End` jumps to the last cell; `Enter` commits (`aria-current` → Map, region → `context-cell-rpg.map`); `:focus-visible = true` at every stop; exactly **one** visible `region` throughout. |

## New findings

### P2

**\[P2] N1 — F4's fix keys on `[data-identity="wide"]`, so the phone still prints the name twice.**
The shell.css yield moved from `docked` to `docked|overlay` (correct) but kept the *other*
discriminator untouched: the selector is
`.shell-grid:is([data-context-mode="docked"],[data-context-mode="overlay"]) .shell-topbar-identity[data-identity="wide"] .shell-topbar-title`.
At 430 the shell mounts a **`narrow`** identity, which the rule cannot reach.
*Receipt:* enumerating `.shell-topbar-title` at 430 coarse, chat room —
`[{txt:"Example — Midnight Run", display:"none", identity:"wide"}, {txt:"Example — Midnight Run",
display:"block", identity:"narrow", y:13}]` — and the band `h2` at y=65. Identical on Characters
(`Sabine Veyra` topbar y=13 + band y=68; there only the `narrow` mount exists at all). Visible in
`reports/snaps/cbbe2-chat-430.png`, `cbbe2-char-430.png`, `cbbe2-game-430.png`.
*Why it hurts:* this is the exact injury F4 filed, at the exact width F4 named first ("at 430 coarse
and at 1024×768"), and it is the width where 52px of a 740px screen spent saying the same thing twice
costs most. The half that landed makes it worse to diagnose, not better: the same product rule now
behaves differently at two widths.
*Fix:* `distill: the topbar identity while the context pane is docked OR overlay, at EVERY identity
variant — receipt: exactly one rendered instance of the room/character name at 430 coarse, 430 fine,
768 and 1024, in chats AND characters.* Drop `\[data-identity="wide"]`from the yield selector, or add
the`narrow\` arm beside it; then pin it with a CT that asserts the count at both identities.

**\[P2] N2 — F17's separator pushed the six-cell Characters rail into overflow at the DEFAULT desktop
width; `Trust` paints as `Tru`.**
The trail fix added `<Separator orientation="vertical" className="ms-row …"/>` plus a second `ms-row`
inset (`02736d7d3`, context-rail.tsx). That is ~19px off the cell track — and the six-cell Characters
rail at 1280 docked needs exactly 19px more than it has.
*Receipt:* 1280 docked, Characters — toolbar `scrollWidth 319 / clientWidth 300`, `over: true`,
`data-overflow-end="true"`, and the `Trust` caption's box (x=1187 w=31 → right edge 1218) extends
**13px past the track's visible edge at 1205**. `cutCaptions: ["Trust"]`. Visible in
`reports/snaps/cbbe2-char-1280.png` as `Tru`. The other three widths are clean: 1024 `223/223`, 768
`684/684`, 430 `332/332`, all `cutCaptions: []`.
*Why it hurts:* the ONE width that clips is the default docked desktop — the state most users live in
— and it clips a nav label mid-word with no ellipsis. The baseline explicitly verified this rail fit
("the six-cell Characters rail fits at 430… zero clipped captions") and never reported a 1280 clip;
this is a cost the fix introduced. It is also the `[[count-gate-standing-in-for-fit]]` shape a third
time: the fold fires at the *narrower* widths and not at the 19px-over one.
*Fix:* `adapt: the six-cell rail's track budget at 1280 docked — receipt: `scrollWidth == clientWidth`and`cutCaptions: \[]\` on the Characters rail at 1280/1024/768/430, in all four preset arms.\* Either
let the fold arm trigger on measured overflow rather than only at narrower widths, or give the trail a
zero-width-collapse arm so it never spends track it cannot afford.
*Note:* I did not run the pre-fix build to prove the regression directly — the stage band was held by
the fix lane's own orphan and the brief ruled a second environment unnecessary. The causal receipt is
the diff plus the exact 19px arithmetic; treat "regression" as strongly-evidenced, not measured.

**\[P2] N3 — F15 is a no-op live, and the CT that pins it passes on a fixture the product does not
have.** `seatCrownsLast(tabs)` returns `[...tabs.filter(t=>!t.crown), ...tabs.filter(t=>t.crown)]`
(`context-bracket.tsx`). Live, **three** meta cells carry `crown: true` — `Preview`
(`chats-section.tsx:98`), `Game` (`rpg-context-section.tsx`), `Activity`
(`activity-context-tab.tsx:28`) — so the partition is `[Members, This chat] + [Preview, Game,
Activity]` and the order does not move.
*Receipt:* live `data-crown` at 1280, both rooms: `Members=false · This chat=false · Preview=true ·
Game=true · Activity=true`; rendered order `Members · This chat · Preview · Game · Activity` — byte
for byte what the baseline recorded pre-fix. The CT fixture `CTX_CROWN_ORDER_TABS`
(`tests/client/features/app-shell/_ct-stories.tsx`) declares crown on **Game only**, stripping it from
Preview and Activity, which is the sole reason the sort does anything and the assertion
`toHaveText(["Members","This chat","Preview","Activity","Game"])` goes green. Its own comment claims
"the story hands the bracket exactly that order" — it does not.
*Why it hurts twice:* the taste defect (the crown glyph wedged mid-rail) is P3 and survives untouched;
the **lying pin is the serious half** — a green CT now certifies an ordering the product has never
rendered, and it will keep certifying it forever. Per the standing fix-tools-as-we-find-them-lying
rule that is P2 regardless of the surface finding's own priority.
*Fix:* two moves, and they are separable. (1) `harden: the F15 CT — receipt: the fixture carries the
LIVE crown set (Preview, Game, Activity all `crown: true`) and the assertion is red on the unmodified
source before the ordering fix lands.* (2) Then the design fork: the mechanism keys on the host-only
FLAG, but the baseline's complaint was about the crown **glyph** (only `Game`carries`icon: Crown`);
`seatCrownsLast\` can never move Game while its two neighbours share the flag. Either seat by a
narrower predicate, or accept the live order and retire F15.
*Fork for the orchestrator:* the baseline's own premise was wrong too — it called Preview and Activity
"two generic meta tabs" when both are host-only crowned. That retraction is mine to publish (below)
and it may make "retire F15" the right answer.

### P3

**\[P3] N4 — the chip row orphan-wraps at 1280 docked: the exact ragged-void shape F14 just fixed for
the orbs.** Chat band, 383px pane: row 1 = `3 members` (x=909 w=87) + `Memory — idle` (x=1002 w=169),
ending at x=1171; row 2 = `Built-in preset` alone at x=909 w=104, with the whole right half of the row
empty. Two rows, 68px. Same at 430 (`reports/snaps/cbbe2-chat-430.png`).
*Fix:* \`layout: the band's chip row — receipt: no single-chip orphan row at 306, 383 and 430 in all
four preset arms (balance the wrap or scroll the row, as the orb row now does).\*

**\[P3] N5 — the band's first two lines stutter the same place name 28px apart.** Game band:
`Example — The Ashen Spire` (h2) then, directly beneath, `The Ashen Spire — the throne hall, a fire
built off the draft-line…`. F3's fix is right and this is its residue — the demoted location line
opens with the words the heading just said.
*Fix:* \`clarify: the game band's when-line — receipt: the location line does not repeat the leading
words of the heading above it.\* (Product copy, not a code shape — likely an owner call.)

**\[P3] N6 — the Cast group offers two adjacent add-doors whose labels do not distinguish them.**
`toolbar "Members and cast"` → `button "Add cast…"` immediately followed by `button "Add a
character"`, side by side in the group header (`reports/snaps/cbbe2-chat-1280.png` x≈1030 and x≈1140).
A cold reader cannot tell which one adds an existing character to this room and which one creates a
new one. §13 one-home: one concept, two doors, touching.
*Fix:* \`clarify: the cast group's two add-doors — receipt: two labels a first-timer can tell apart
without clicking either, or one door with a two-option menu.\*

**\[P3] N7 — the HUD's persistence contract is preset-dependent.** At `defaults`/`maximal`/`compact`
the pool orbs live in the band and therefore persist across every tab. At `reading` (F7's ruled arm)
they moved into the tab body, so switching to a meta tab drops them: measured on `This chat` at
reading, `orbsInDom: 0`. This is the recorded accepted trade — **and my judgment on the question the
brief asked is: it does NOT read as a hole.** The rail folds 3+3 and `FIELD OVERRIDES` starts
immediately underneath; there is no gap, no empty band, nothing looks missing
(`reports/snaps/cbbe2-game-reading-meta.png`). The cost is not visual, it is behavioural: the same
HUD follows you at three presets and does not at the fourth.
*Fix (optional):* \`clarify: the reading-preset trade — receipt: the header note says the orbs are
STATUS-tab-scoped at reading, not merely "relocated".\* Or leave it; it is honestly minor.

**\[P3] N8 — at 430 both the chat and the character panes are mostly empty ground.** Characters: content
ends at y≈400, foot rail at y≈650 — ~250px of black. Chats: cast ends at y≈330, ~300px of black. The
pinned-foot / ground contract is working exactly as specified (and it is one of the genuinely good
things here), but on a phone a full-screen sheet that delivers five data rows reads as an empty screen.
*Fix:* \`onboard: the phone sheet's ground — receipt: at 430 the pane either fills its ground with the
next-most-useful thing for that artifact, or the sheet sizes to its content instead of the viewport.\*

**\[P3] N9 — the overflow fade is correct and weak.** It is a real 30×71 gradient element from the pane
colour to transparent, appearing exactly when the rail overflows. But at the two sites it fires,
the primary read is still a chopped word — `Acti` at reading
(`reports/snaps/cbbe2-game-reading-foot.png`), `Tru` at 1280 Characters. 30px of pane-coloured
gradient is easy to read as "the panel's edge" rather than "there is more".
*Fix:* \`bolder: the overflow affordance — receipt: at reading and at 1280 Characters the hidden cell is
discoverable without hovering (a persistent thin scrollbar, a chevron, or a wider/steeper fade), pinned
by a CT that asserts the affordance's own contrast against the rail fill.\*

## ARIA-navigability

Nothing new is owed inside the bracket. Every check passed:

- Every rail cell has an accessible name; the locked cell's is `Map — locked` (state in the name, not
  in colour). Both rails are named `toolbar`s (`Game state`, `Chat`, `Character`) with `aria-current`
  on the owning rail only — the #112 model, correct per the toolbar-rails-are-not-tablists ruling.
- One tab stop per rail, arrows + `End` inside it, `Enter` to commit, `:focus-visible` true at every
  measured stop, exactly one `region` visible.
- The band exposes an `h2` in **all three** contents now (F3) — a rotor reaches every artifact's name.
- Kickers are `aria-hidden="true"` decorative, correctly, since the toolbar carries the name.
- The one accname split (F19) is closed.

Two out-of-bracket a11y notes, carried forward unchanged from the baseline, **not** re-filed:
Lighthouse `label-content-name-mismatch` fires on 22 nodes — LIST-pane rows, the chat `Run Roll d20`
buttons, and the `tracker-value-rest` nodes in the Status body. Zero of them are bracket chrome.

## Taste & flow verdict — better than 29/40, and I can say where

**Does it look like shit? No, and it looks materially better than it did this morning.** The single
biggest change is the game band. Pre-fix its name was a 13px grey span carrying a scene sentence,
hard-ellipsised; now `Example — The Ashen Spire` sits as a real 16px/600 heading with the Waystone
dial beside it and the location demoted to a small when-line. Put the three bands side by side
(`cbbe2-chat-1280.png`, `cbbe2-game-1280.png`, `cbbe2-char-1280.png`) and they now **sound** the same,
not just measure the same — which is the thing the baseline said was broken.

**The chip grammar reads the same in all three bands, and it works — with a caveat.** Ink is doing
real work (2.06× measured), and the pattern is identical in chat, game and character bands and holds
in Light. But be honest about what the eye actually catches first: it is not the ink, it is the
**UPPERCASE**. `MEMORY — IDLE` and `OWN LOOK` stand out because they are caps; `3 members`,
`Built-in preset`, `1 chat`, `1,257 tokens` recede because they are sentence case. That is a
successful outcome by accident of a different axis — and caps is this house's *kicker* voice (a
section name), so the actionable chip is currently wearing the label voice. It works today. It is one
copy change away from not working.

**Where it flows weird, post-fix.**

1. **The phone still says the name twice** (N1) — and now inconsistently, since the desktop overlay
   widths fixed it. That is the worst kind of half-fix: the behaviour changes with the viewport for no
   reason the user can perceive.
2. **`Tru`** (N2). At the default desktop width, on the section a user browses most, the last nav
   label is cut mid-word. Everything else about the Characters pane got better and this got worse.
3. **The phone panes are empty** (N8). This is the one that would make a first-timer say "why did I
   open this?" — a full-height sheet delivering `Added / Source / Last chat / Applied`.

**Cold-read (5-second test).** All three now pass on their own. Chat: a title, three chips, a labelled
cast list, a rail with words. Game: a striking dial, a named room, five labelled pools, a folded rail
of six labelled cells — dense but every element says what it is. Character: name, handle, three chips,
four labelled data rows, a six-cell rail. The pre-fix failure ("a cold user has no idea whether that
13px grey sentence is the room's name, a scene note, or the last thing that happened") is gone.

**One-home audit (§13).** The baseline found four collisions; two are closed (the two sheet dismisses,
the two accnames), one is closed at desktop and open at phone (the artifact name — N1), one is closed
on its door half and ruled keep-both on its datum half (the Characters identity). **One new collision
found:** the two adjacent add-doors in the Cast group (N6). Net: 4 → 2, plus 1 new.

## What's genuinely working — do not touch

1. **The ownership axis is now measurable and measured.** band == owning fill, receded == pane, owning
   kicker 16.40:1 strictly above receded 8.32:1, and the three-theme framebuffer CT behind it. This
   was the baseline's "single biggest opportunity" and it was actually taken.
2. **The keyboard model, still the best in the app** — and untouched by two legs of chrome surgery.
   One tab stop, arrows without commit, `End`, `Enter` commits, `fv=true` everywhere, one visible
   region. Re-measured from scratch; nothing regressed.
3. **Rail-cell switching got dramatically faster.** `perf-meter`: a cell switch is now **48ms click
   duration / 3ms input delay / 0ms rAF gap / 0 shift** against the baseline's 176–272ms with 133–183ms
   rAF gaps. The pane OPEN is still expensive (533ms worst long task) — that is F10's own row.
4. **design-audit is clean on the bracket in all six arms.** The bracket contributes zero findings;
   every game-room row is rooted at `rpg-status-tab`/`rpg-status-card` (the Status body, pre-existing),
   and Characters' single P2 is a `Scenario` field button in the editor form (`inBracket: false`).

## The single biggest opportunity

**Pin the two things a viewport can change.** Both P2 refutations are the same defect wearing
different clothes: a rule that is right at one width or one fixture and silently wrong at another —
`[data-identity="wide"]` fixing the desktop and missing the phone, `seatCrownsLast` proven by a
fixture with one crown against a product with three. The bracket now has an excellent framebuffer CT
for the *colour* axis; it has nothing equivalent for the *width × identity × crown-set* axis. A single
matrix CT that mounts the bracket at 430/768/1024/1280 with the LIVE tab set and asserts (name
instances == 1, `cutCaptions == []`, rendered order) would have caught N1, N2 and N3 in one run, and
would stop the whole class recurring.

## Retractions

- **The baseline's F15 premise was wrong, and I am retracting it on its behalf.** It called `Game` "the
  crowned host-only door wedged between two **generic** meta tabs". Live, `Preview` and `Activity` are
  *also* `crown: true` host-only cells. Game is wedged between two other crowned cells; only its
  *icon* is a literal crown. This does not rescue the fix (N3 stands — the sort is a no-op and its CT
  is false), but it may make "retire F15" the correct resolution rather than "reorder".
- **I first read the padlock in the reading-preset shot as an orphaned glyph detached from the Map
  cell.** Measuring the cell box showed it sits inside the Map cell's own bounds at its top-right — the
  sanctioned lock ornament, not a stray. Retracted; not filed.
- **The only console errors in this pass are mine.** Three runs reported `console-errors=4` /
  `failed-req=1`: my keyboard walks pressed `Enter` on a transcript control, firing `chat.swipe` into
  the gen engine, which returned `HTTP 404: The model Qwen/Qwen3-VL-8B-Instruct does not exist` — the
  stage's connection names a model the currently-running engine does not serve (part of the engines
  wedge already reported). Probe-induced plus an environment mismatch; **not** a bracket defect. Every
  other run in this pass: `console-errors=0 page-errors=0 failed-req=0 deadcss=0`.
- **I have NOT verified `Escape` closes the phone sheet.** I measured the chrome dismiss and the scrim
  and scored heuristic 3 accordingly rather than crediting an exit I did not press.

## Nielsen (scored, context bracket only)

| # | Heuristic | Was | Now | Key issue |
| - | - | - | - | - |
| 1 | Visibility of system status | 3 | 3 | `aria-current` + kicker breadcrumb + ember bar all agree, and overflow now announces itself; a 533ms pane open still has no progress signal |
| 2 | Match system ↔ real world | 3 | 3 | the game band names the ROOM now (F3) — the old key issue is gone; the title/when-line stutter (N5) and `Close Chats details` naming the section not the artifact remain |
| 3 | User control & freedom | 3 | 3 | one sheet exit + scrim (F16); `Escape` not verified this pass |
| 4 | Consistency & standards | **2** | **3** | one accname (F19 ✓), one name voice (F3 ✓), one chip grammar in all three bands (F12 ✓); but the name yield behaves differently at 430 than at 1024 (N1) and Game is still seated mid-rail (N3) |
| 5 | Error prevention | 3 | 3 | manual activation implemented and verified; no destructive action in the bracket |
| 6 | Recognition over recall | 3 | 3 | the memory chip has its word now (F11 ✓); `Tru` (N2) and the two indistinguishable add-doors (N6) pull it back |
| 7 | Flexibility & efficiency | 3 | 3 | arrows + `End` + one tab stop; still no cell shortcuts |
| 8 | Aesthetic & minimalist | **2** | **3** | the hero echo stood down (F5), reading is 59% chrome not 79% (F7), the orb row is one row (F14); the phone voids (N8) and the chip orphan wrap (N4) remain |
| 9 | Error recovery | 3 | **4** | the locked cell opens onto its reason AND its label is readable at 8.08:1 — both halves right |
| 10 | Help & documentation | 3 | 3 | the empty state is still genuinely good; the preset chip's only explanation is still a `title` (recorded residual) |
| | **Total** | **28/40** | **31/40** | good band — and the two heuristics that moved are exactly the two the fix legs targeted |

## Instrument coverage

| # | Instrument | Status |
| - | - | - |
| 1 | `snap --map` | **RAN** — 1280 desktop + 430 coarse; confirmed F19's single accname |
| 1 | `snap --aria` | **RAN** — bracket trees for all three contents; the F3 heading and the F15 rail order both come from here |
| 1 | `snap --contrast` | **RAN** — 16 measurements across owner + Light themes, **zero FAIL**. One `OCCLUDED … NO VERDICT` refusal (the `Trust` caption behind the vite-checker overlay) — the correct refusal, recorded not ignored. Tall-viewport arm N/A (the bracket is height-bounded) |
| 1 | `snap --eval` / framebuffer-equivalent decode | **RAN** — band/rail/pane background tokens read composited; the ownership order is a computed-colour receipt, not an eyeball |
| 1 | `snap --matrix` | **SKIPPED** — replaced by explicit named arms covering more axes than matrix does (1024×768, 768×800, 430 coarse AND fine, four appearance presets, `--theme Light`, docked/overlay/collapsed) |
| 1 | `snap --json` / `--scenario` | **SKIPPED** — no run hit the 200-message console cap; every check fitted one argv-ordered chain |
| 2 | `design-audit` desktop | **RAN** — chat **1** (P3 page-level only), game **31** (all `rpg-status-tab`/`rpg-status-card`), characters **4**. Per-arm files: `reports/design-audit/cbbe2-{chat,game,char}-desktop.json` |
| 2 | `design-audit --mobile` | **RAN** — chat 1, game 29, characters 4. `reports/design-audit/cbbe2-*-mobile.json`. **Instrument residue from the baseline is fixed**: `--out` now exists, so all six arms have their own file |
| 3 | `motion-audit` | **RAN** — `verdict=FAIL`, worst blocking **93ms** (was 111), CLS raw/virtualized/non-virtualized all **0**, 0/302 frames dropped, 0 dirty animations of 17. F10's class, split to its own row |
| 4 | `perf-meter --click` | **RAN** — `reports/perf-meter/cbbe2-perf.json`. Cell switch **48ms/3ms/0 rAF/0 shift** (was 176–272ms); pane open 533ms worst long task, shift 0.1893 input-adjacent |
| 5 | `lighthouse_audit` desktop + mobile | **RAN** — snapshot mode over the live docked game bracket. A11y **100**, Best-Practices **100**, SEO 83, Agentic 100, both arms. Two failing audits (`label-content-name-mismatch` ×22, `crawlable-anchors`), **zero nodes in the bracket**. `reports/lighthouse-cbbe2-{desktop,mobile}/` |
| 6 | `__orb` suite | **RAN** — `.renders()`: `region:context` 12 renders / 1 mount / avg 3ms / max 17ms (healthy); `region:content` 52 (pre-existing transcript churn, out of scope). `.motion()`/`.animations()` via motion-audit |
| 7 | Console triage table | **RAN** — below |
| 8 | The PNGs, actually looked at | **RAN** — 8 captures read as images: `cbbe2-chat-1280`, `cbbe2-game-1280`, `cbbe2-char-1280`, `cbbe2-game-reading`, `cbbe2-game-reading-meta`, `cbbe2-game-reading-foot` (element shot), `cbbe2-game-430`, `cbbe2-char-430`, `cbbe2-chat-430` |
| 9 | Keyboard walk | **RAN** — full chain with `activeElement` + `:focus-visible` read at every stop; arrows, `End`, `Enter`, tab-out. Skip-link arm **SKIPPED** (shell chrome, outside scope) |
| 10 | Appearance-preset arms | **RAN** — `defaults`, `maximal`, `compact`, `reading`, each with band/rail/viewport geometry + overflow + fade state. `diagnostics` **SKIPPED** — no metadata chrome under judgment |
| 10 | Theme arms | **RAN** — `--theme Light` on Characters (non-carried surface, D44). **Deliberately not run inside the rooms** — they carry their own themes, where a theme arm is byte-identical by design. `--theme none` **SKIPPED** |
| 11 | Pane-state arms | **RAN** — collapsed (the stage's default, which is how every run starts), docked (1280, three contents), overlay (1024×768, 768×800, 430 coarse + fine). List collapsed rides the 1024 arm. Both-hidden **N/A** — no bracket to review |
| — | `pnpm record` | **SKIPPED** — motion-audit + perf-meter answered the jank question numerically (0 dropped frames, 0 CLS, 48ms switch); no transition was in visual doubt |
| — | `snap --diff` / `--baseline` | **SKIPPED** — no committed baseline for this surface |
| — | Pre-fix comparison arm | **SKIPPED with consequence** — the stage band was held by the fix lane's own orphan and the orchestrator ruled a second environment unnecessary. This is why N2's "regression" rests on diff arithmetic rather than a measured before/after |
| — | Prod-build CLS arm | **SKIPPED** — CLS is 0 on every dev arm; #836's declared limit applies to a Lighthouse *navigation* CLS figure and this pass took snapshot-mode Lighthouse only |

### Console triage

| Message | Disposition |
| - | - |
| `[frame] long frame 147ms · blocking 97ms @ main.tsx` on boot | **known** — boot commit, `boot-console-warnings=0` after settle |
| `[drop] 54–117ms rendered frame mid-animation · svg[aria-label=Orbweaver] / [data-slot=weave-veil]` | **known-ruled** — the boot logo animation, pre-existing, not the bracket |
| `[perf] slow commit region:content 12–20ms` (329 across all runs) | **known** — the content column's own churn; `region:context` is 3ms avg. Out of scope, unchanged |
| `[cls] shift … input-adjacent (excluded from CLS)` | **known** — the pane-open track change; the FLIP machinery is doing its job. `cls-non-virtualized = 0` in motion-audit |
| `[cls] shift 0.0221 unexpected … CLS 0.0224` on boot | **known** — landing-surface settle, under budget, not the bracket |
| `[trpc] ✗ mutation chat.swipe … HTTP 404 model does not exist` ×6 + one 500 | **RETRACTED as probe-induced** — my keyboard walk's `Enter`, into a stage/engine model mismatch. See Retractions |
| `DEADCSS` | **GONE** — `deadcss=0` on all 44 runs; the baseline's `my-6` curiosity does not reproduce |
| `console-errors` / `page-errors` / `failed-req` | **0** on 41 of 44 runs; the 3 exceptions are the row above |
| vite-plugin-checker badge `❗5 ⚠0` | **dev tool, not product** — it occluded the foot rail in early captures; removed with an ephemeral in-page `.remove()` in the probe browser only. It also triggered snap's `OCCLUDED … NO VERDICT` contrast refusal, correctly |

## Issue summaries (paste-ready)

**N1 — F4's overlay yield misses the phone (P2).** The #846 topbar yield was widened from
`[data-context-mode="docked"]` to `docked|overlay` but kept its other discriminator,
`.shell-topbar-identity[data-identity="wide"]`. At 430 the shell mounts a `narrow` identity the rule
cannot reach, so the room/character name still renders twice — topbar `.shell-topbar-title`
`display:block` at y=13 and the band `h2` at y=65, measured in both the chat room and Characters, at
430 coarse and 430 fine. The desktop overlay widths (1024×768, 768×800) are genuinely fixed and print
exactly one instance, which makes this worse to diagnose rather than better: the same product rule now
behaves differently at two viewports for no reason a user can perceive, at the width where 52px of a
740px screen spent saying the same thing twice costs most. Drop `[data-identity="wide"]` from the
selector or add the `narrow` arm beside it, and pin the count at both identities in a CT.

**N2 — the trail separator pushed the Characters rail into a clip at the default desktop width (P2).**
F17's fix added a vertical `Separator` plus two `ms-row` insets to the rail's trail zone
(`02736d7d3`, context-rail.tsx), costing the cell track ~19px — and at 1280 docked the six-cell
Characters rail needs exactly 19px more than it now has. Measured: toolbar `scrollWidth 319 /
clientWidth 300`, `data-overflow-end="true"`, and the `Trust` caption's right edge at 1218 against a
track edge at 1205, so it paints as `Tru`. The other three widths are clean (1024 `223/223`, 768
`684/684`, 430 `332/332`, zero cut captions), which means the ONE state that clips is the default
docked desktop — and the baseline had explicitly verified this rail fit with zero clipped captions.
It is also the count-gate-standing-in-for-fit shape a third time: the fold arm fires at the narrower
widths and not at the 19px-over one. Either trigger the fold on measured overflow, or give the trail a
collapse arm so it never spends track it cannot afford.

**N3 — F15 is a no-op live and its CT is a false pin (P2).** `seatCrownsLast` partitions the meta rail
into non-crowned then crowned, but three cells carry `crown: true` in production — `Preview`
(chats-section.tsx:98), `Game` (rpg-context-section.tsx) and `Activity`
(activity-context-tab.tsx:28) — so the partition is `[Members, This chat] + [Preview, Game, Activity]`
and the rendered order is byte-identical to the pre-fix complaint, confirmed live from `data-crown` in
both rooms. The CT that certifies the fix mounts a fixture (`CTX_CROWN_ORDER_TABS`) that declares
crown on Game alone, stripping it from Preview and Activity, which is the only reason the sort does
anything and the assertion goes green; its own comment claims the story hands the bracket the live
order, and it does not. The lying pin is the serious half — it will certify this ordering forever —
and it should be made red on the unmodified source with the live crown set before any ordering change
is attempted. Separately, the baseline's premise for F15 was itself wrong (it called Preview and
Activity "generic meta tabs" when both are host-only crowned; only Game's *icon* is a crown), so
retiring F15 is a legitimate resolution alongside reordering.

**P3 residue (N4–N9), one row.** The band's chip row still orphan-wraps at 1280 and 430 (`Built-in
preset` alone on row two with the right half empty) — the same ragged-void shape F14 just fixed for
the orbs. The game band's heading and its demoted when-line stutter the same place name 28px apart.
The Cast group offers two adjacent add-doors (`Add cast…`, `Add a character`) a cold reader cannot
tell apart. The pool orbs persist across tabs at three appearance presets and not at `reading` — the
recorded trade, and my judgment is that it does not read as a hole, but the inconsistency is real. At
430 both the chat and character panes spend 250–300px on empty ground under five data rows. And the
new overflow fade is mechanically correct but weak: 30px of pane-coloured gradient still leaves `Acti`
and `Tru` reading as chopped words rather than as "there is more here".
