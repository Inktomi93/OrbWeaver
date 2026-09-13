---
kind: review
status: draft
updated: 2026-08-30
---

# #863 — RPG game start & exit, driven cold (plus the #861 foot-of-rail arm)

**Lane:** cb-rpg-startexit · **Scope:** FOCUSED — the ENTER and LEAVE flows only, three ways (mouse
1280×800 both panes docked · keyboard-only · 430 coarse), plus the #861 arm delivered mid-run ·
**Stack:** live `:5173` / `:8788`, dev build, vite pid 3399908 (started 05:26, merge train ran to
07:53 — probed clean before driving: `data-app-ready` set, `page-errors=0`, `console-errors=0`) ·
**Principal:** the single dev user, persona **Traveler**, **host** of every room driven ·
**Receipts:** `reports/snaps/cbrs-*` · `reports/design-audit/root.json` ·
`reports/perf-meter/cbrs-enter-perf.json` · `reports/lighthouse-cbrs-{desktop,mobile}/`

## VERDICT — SHIP WITH FIXES

Nothing here is broken, unreadable, or inaccessible. Contrast passes everywhere I measured (4.79:1 →
15.44:1), Lighthouse a11y scores **100 on both desktop and mobile against the driven game surface**,
the keyboard path through the ⋯ menu and its submenu is genuinely correct (arrow-into-submenu,
Escape-out, `:focus-visible` at every stop), and the enter interaction is fast (32 ms click, 5 ms
input delay, **zero layout shift**).

The owner's "sucks ass" is not a defect in the surfaces — it is that **both transitions are
invisible**. `Turn on RPG` and `Turn off RPG` are one-click, irreversible-feeling, unannounced
mutations that in the DEFAULT pane state (context panel closed — measured) change exactly one thing
on screen: four dice chips appear or disappear above the composer. No toast, no `aria-live`, no
transcript marker, no confirmation, no undo affordance, and the one piece of copy that actually
reassures you ("your sheets, scene, and quests are kept") lives in a native `title=` tooltip that
**never renders on a touch device at all**. The state you get *afterwards* is excellent; the moment
of the decision is empty.

## State I changed (approved in advance) — before / after

| Chat | Before | After (as I left it) |
| - | - | - |
| `Example — Midnight Run` | no rpg pointer at all | freeform game exists, **overlay OFF** (`engaged:false`) — the brief's requested end state |
| `Example — The Ashen Spire` | game engaged | game engaged (toggled off once for the exit arm, **restored**) |
| every other chat | untouched | untouched |

Final-state receipt (`cbrs-final.log`, fresh load, server truth):
`Ashen Spire listGlyph=YES · Midnight Run listGlyph=no` + the Game tab reading
`RPG overlay off — your sheets, scene, and quests are kept.`

## The hop counts (measured, not estimated)

| Path | Mouse | Keyboard | 430 coarse |
| - | - | - | - |
| **Start via ⋯** | 3 clicks: `Chat options` → `Turn on RPG` → `Freeform story` | 7 Tabs from the opened transcript to `Chat options` (`cbrs-kbd.log`, `fv=true` at all 34 stops), then Enter · ↓ · ↓ · → · Enter = **5 keys** | 3 taps, same shape; `Chat options` is a 3-dot glyph in the composer row |
| **Start via the Game tab door** | 3 clicks: `Show detail panel` → `Game` → `Freeform story` — but the panel is **CLOSED by default** (`cbrs-01`), so hop 1 is invisible | `Show details` is in the topbar; the Game cell is inside a `toolbar` (one tab stop + arrows) — reachable, ~14 stops | `Show details` (topbar) → `Game` → button |
| **Exit** | 2 clicks: `Chat options` → `Turn off RPG` | Enter · ↓ · ↓ · Enter = **4 keys** | 2 taps |

Both start doors are 3 hops. Neither is discoverable: one is buried in a generic overflow menu
labelled *"Chat options"* / *"Manage this chat"*, the other is behind a host-only tab in a pane the
app ships closed.

---

## Findings

### \[P1] The enter and the exit announce nothing, anywhere — and in the default pane state they are nearly invisible

**What.** Clicking `Turn on RPG` or `Turn off RPG` produces: no toast, no `aria-live` update, no
transcript marker, no focus move to the new surface. The `polite/status` region still reads the stale
`"Loaded chat."` four seconds after the toggle in both directions.

**Why it hurts.** With the context panel CLOSED — the shipped default for a chat room, measured — the
*only* on-screen change is a row of four dice chips appearing/disappearing above the composer
(`cbrs-10-paneclosed-gameon.png` vs `cbrs-01-mr-before.png`). A sighted user gets a four-button diff
as the entire confirmation that a game mode started. A screen-reader user gets **silence**: nothing is
announced on either transition. Nielsen H1 (visibility of system status) and §5 of the design skill
("cover ALL states … success").

**Fix.** Announce both transitions in the existing `role="status"` live region — *"RPG overlay on —
the Game panel is open"* / *"RPG overlay off — your sheets, scene and quests are kept."* — and, on an
explicit user-initiated `Turn on RPG` / `createGame`, OPEN the context panel to the game. (§4.1 fork,
below.)

**Receipt.** `cbrs-exit.log` / `cbrs-ashenoff.log` live-region evals at t+0 and t+1663 ms:
`["polite/status: \"Loaded chat.\"", "polite/region: \"\"", "polite/log: …", "polite/status: \"\""]`
— the fourth region is present and EMPTY. Screenshots `reports/snaps/cbrs-01-mr-before.png`,
`cbrs-10-paneclosed-gameon.png`, `cbrs-16-ashen-off-t0.png`.

---

### \[P1] Exit destroys a full populated surface on one unconfirmed click, and the reassurance is in a `title` tooltip that touch never shows

**What.** On `Example — The Ashen Spire` — a real game with a waystone clock, five pool orbs
(HP 17/20 · STA 2/6 · WAR 88/100 · SUP 0/10 · SILVER MARKS 22), a four-actor roster with HP/Stamina
meters and a `Ward-Burned` condition, and six game tabs — one click on `Turn off RPG` replaces the
entire pane with a plain Members list. No confirm dialog, no toast, no undo, no announcement.

The item's only explanation is `title="Turns the RPG overlay off — your sheets, scene, and quests are
kept."` A native `title` requires a ~1 s hover dwell on a pointer device and **does not exist on
touch** — so on the 430 arm the decision is a bare *"Turn off RPG"* with zero context (`cbrs-13`).
It is also not the accessible name (accname = `"Turn off RPG"` from textContent); it is wired as a
description, so SR support is inconsistent.

**Why it hurts.** `Turn off RPG` sits directly under `Character galleries` in an unseparated block of
cosmetic items. A mis-click wipes the whole game surface. Meanwhile `Delete chat` — a strictly less
surprising action for a user who reads the menu — gets a separator, an icon and an AlertDialog
confirm. The proportionality is inverted. Nielsen H3 (user control & freedom) and H5 (error
prevention).

**Fix.** Put the sentence on the ITEM, not in a tooltip — a two-line menu item (label + `Your sheets,
scene and quests are kept`), which also makes it read as *pause*, not *end*. Give the RPG row its own
separator group. Follow the toggle with the announcement from P1 above; that plus the kept-state line
is enough — I do NOT recommend a confirm dialog, because the action genuinely is reversible and a
modal would tax the common case.

**Receipt.** `cbrs-mobmenu.log`
(`"Turn off RPG||title=Turns the RPG overlay off — your sheets, scene, and quests are kept."` — the
ONLY item in the menu carrying a `title`); before/after `reports/snaps/cbrs-15-ashen-on.png` →
`cbrs-16-ashen-off-t0.png`.

---

### \[P1] The first screen after starting a game is not the same screen twice — it depends on which context tab happened to be selected

**What.** Three measured landings for the same conceptual action:

| How you started | What the pane shows at t+0 |
| - | - |
| Game-tab door (`Freeform story`) | the **HOST CONSOLE** — `STAT PROFILE` (empty) / `TRACKERS` (empty, with a 4-line explanatory paragraph) / `RELATIONSHIP HINTS — GLOSS CUSTOM LABELS` (empty). A schema editor. (`cbrs-05-enter-t0.png`) |
| ⋯ menu with the pane open on Members | **Status** — a roster of three cards, each showing `—` and `+ condition`. (`cbrs-09-kbd-enter-t0.png`) |
| ⋯ menu with the pane CLOSED (the default) | **nothing** — the pane stays shut; four dice chips appear. (`cbrs-10-paneclosed-gameon.png`) |

**Why it hurts.** The door landing is the worst of the three: a first-timer who clicks a button
labelled *"Freeform story"* under the promise *"An overlay for your roleplay — tracked state, quests,
and a scene the story keeps current"* lands in an empty three-section configuration form. Nothing on
that screen says the game started, what a game is, or what to do next; the visible instruction is
`name it first (e.g. Grace)`. Nielsen H2/H6, and §13's cold 5-second test fails outright.

**Fix.** Make the start action deterministic: `createGame` / `engaged:true` sets `contextTab` to
`rpg.status` and opens the panel if it is closed. Then give the empty Status roster a one-line
orienting lead — *"The story fills this in as you play. Keep going, or set up trackers in the Game
tab."* — so the empty state teaches instead of just being empty (`empty-states-are-load-bearing`).

**Receipt.** The three screenshots above; watch series `cbrs-05-enter-t{0,1159,2337,3489}.png` are
byte-identical (md5 `6d69aa75…` ×4) — the pane is fully settled at t+0, so this landing IS the whole
experience.

---

### \[P2] The chat list keeps its ⚔ "Game chat" marker for at least 4 s after you turn RPG off — the two homes disagree

**What.** `rpg.updateConfig` invalidates only `trpc.chat.getChat`
(`chat-options-menu.tsx:41`, `invalidates: [chat.getChat.queryFilter]`), but the list's marker is
driven by `chat.isGame`, derived server-side as `isRpgEngaged(row.metadata.rpg)`
(`packages/server/src/domain/chat/verbs/read.ts:301`) and delivered by `chat.listChats`. Nothing
invalidates that.

**Why it hurts.** Right after you turn the overlay off, the room's own pane says *not a game* while
its row in the list two hundred pixels away still says *Game chat*. §13's IA single-homing lens: one
concept, two renderings, and they can hold different values. Same asymmetry on the way in.

**Fix.** Add `trpc.chat.listChats.queryFilter()` to `useSetGameEngaged`'s (and `useStartGame`'s)
`invalidates`.

**Receipt.** `cbrs-stale.log` — glyph census immediately before the toggle and at t+0 / t+2000 ms
after it: `Example — Midnight Run glyph=1` in **all three**, while a fresh load one command later
(`cbrs-fresh.log`) reports `Example — Midnight Run glyph=0`. Server truth had already flipped.

---

### \[P2] One concept, four names

The same thing is called: **`Turn on RPG` / `Turn off RPG`** (⋯ menu) · **`Turn on RPG`** kicker but
**`Freeform story` / `D20 adventure`** buttons (empty door) · **`RPG overlay off`** kicker and
**`Turn the overlay on`** button (off door) · **`Game`** (context tab) / **`GAME STATE`** (rail
kicker) / **`Game chat`** (list marker) / **`HOST CONSOLE`** (the body). Three vocabularies —
*RPG*, *the overlay*, *game* — for one feature, in one pane, at one time.

**Why it hurts.** Nielsen H4 and UX rule N4 (same action = same label everywhere). A user who turns
"RPG" on then goes looking for it finds a tab called "Game", and the copy that explains what they did
calls it "the overlay".

**Fix.** `clarify:` the ⋯ item, both doors and the tab — pick ONE noun. Given the tab is `Game`, the
list marker is `Game chat` and #862 is about to make this a per-room ruleset, the noun should be
**game**: `Turn on game mode` / `Turn off game mode`, door button `Turn game mode back on`, kicker
`Game mode off`.

**Receipt.** `cbrs-menuattrs.log`, `cbrs-door.log`, `cbrs-door-off.log`,
`reports/snaps/cbrs-04-game-door.png`, `cbrs-14-door-off.png`.

---

### \[P2] The enter/exit toggle blocks the main thread ~380 ms at 4× CPU

`motion-audit` on the exit: `verdict=FAIL worst-blocking-budgeted=379ms loaf-style-in-frame=3` —
a 429 ms LoAF via `setTimeout` in `modern-Cyfp2l7S.js` with 54 ms of forced style/layout, plus a
137 ms React commit. Everything else is clean: `cls-non-virtualized=0`, `dropped-frames=0%`,
`dirty-animations=0`. Unthrottled the same work is ~98 ms (`perf-meter` step 3: `98ms` long task,
`40ms` blocking, `83ms` worst rAF gap, `shift 0`). On a modest laptop that is a visible hitch with
**no pending state on the menu item** — the menu closes instantly and nothing indicates work in
flight. (The Game-tab door DOES guard with `createAdmission` + `disabled={createGame.isPending}`;
the ⋯ path has neither — `chat-options-menu.tsx:98-107`.)

**Fix.** `optimize:` the takeover mount/unmount — and give the ⋯ item the same pending treatment the
door already has.

**Receipt.** `cbrs-motion.log`, `reports/perf-meter/cbrs-enter-perf.json`.

---

### \[P3] The ⋯ trigger's tooltip and its accessible name disagree

Visible tooltip: **"Manage this chat"**. Accessible name: **"Chat options"** (from `aria-label`; the
tooltip is wired as `aria-describedby`). A voice-control user saying *"click Manage this chat"* does
not reach the only start door in the room. Pre-existing chat chrome, stumbled on — filed, not chased.
**Receipt.** `cbrs-tip.log`: `{al:"Chat options", desc:"_r_4n_", tips:["Manage this chat"]}`.

---

### \[P3] `Select messages…` is the only ⋯ item with no glyph

Every other item in the menu carries an icon; `Select messages…` leaves a hole in the glyph column
directly under `Turn on RPG`, which is where the eye lands after the RPG row. Cosmetic, one line.
**Receipt.** `reports/snaps/cbrs-02-menu.png`.

---

## The §4.1 fork — "no ceremony" is right, and it is being applied to the wrong event

`docs/architecture/Context-Panel-Program.md` §4.1 rules: *"Enter: open/select a game chat, or the
moment `createGame` commits on the current chat. The pane content swaps like any chat switch — no
ceremony, no takeover animation. (A game is content, not an event.)"*

**My drive says the ruling is correct and its INPUT changed.** §4.1 is describing **applicability** —
what the pane resolves to when you ARRIVE at a room that already carries a game. That is content, it
deserves no ceremony, and it works: opening `Ashen Spire` shows the game with no animation, no jank,
zero CLS, and it reads as intentional, not as the panel breaking (`cbrs-15-ashen-on.png`). Keep that.

But the ruling's sentence also names `createGame`, and a user-initiated `Turn on RPG` is **not**
arrival — it is a mutation the user just performed and is owed feedback for. Applying "no ceremony"
to it is what produces the measured result: with the pane closed, the primary confirmation that a
game started is four dice chips.

**Recommendation (the fork, with a stated default).** Preserve the mechanism — no takeover animation,
ever, in either case. Change the condition: a **user-initiated start/stop** (the ⋯ item or the door
button, not a chat switch, not a remote update) additionally (a) fires one `role="status"`
announcement and (b) reveals its own result — opens the context panel and selects `rpg.status`.
Neither is a "ceremony"; both are H1 feedback. If the owner would rather the panel not auto-open,
default to the announcement alone plus a persistent in-room marker (see below) — but the current
zero-feedback state should not survive either way. **I did not reverse the ruling; the collision is
stated here for the fix lane.**

## "Is the game's existence still visible with the overlay off?" — measured answer: no

Once `engaged:false`, `isGame` is false server-side, so the list marker goes, the game tabs go, the
dice chips go, the HUD claim drops. The ONLY surviving evidence is the `Game` meta tab's door —
host-only, inside a pane that ships closed, three hops deep — which then reads, correctly and
warmly, *"The RPG overlay is off — your sheets, scene, and quests are kept."* That excellent sentence
is unreachable at the moment it matters and unreachable to a member entirely.

**Fix:** keep a quiet paused marker in the list row (the ⚔ glyph at reduced emphasis, labelled
`Game chat — paused`) so a host can see which rooms have a game sleeping in them.

## What #862 does NOT fix

\#862 removes the freeform/d20 choice from start time and makes ruleset a Game-tab setting. Observed,
not re-filed. Four things it leaves untouched:

1. **The dice chips are profile-BLIND.** `dice-ask-source.tsx:48` publishes
   `["d20","d6","2d6","d100"]` gated only on `isRpgEngaged` — no profile read anywhere in the file.
   So picking **Freeform story** produces four d20-family chips above the composer immediately
   (`cbrs-05-enter-t0.png`), contradicting the door's own copy, and on mobile they occupy two rows
   and ~110 px of the composer's vertical budget (`cbrs-11-mobile-gameon.png`). Once #862 makes
   ruleset a setting, this row must follow the setting or the setting has no visible consequence — a
   dead-toggle risk.
2. **Nothing about the announcement, the landing tab, the tooltip-only kept-state copy, or the stale
   list marker** — every P1/P2 above is orthogonal to the profile choice.
3. **The naming split.** #862 collapses two buttons into one; it does not decide whether the noun is
   *RPG*, *overlay* or *game*, and the collapse is the cheapest moment to fix it.
4. **The submenu's own a11y is already correct** and will be lost, not fixed —
   `aria-haspopup="menu"`, `aria-expanded`, ArrowRight-to-open, Escape-to-close, focus restored to
   the trigger, `:focus-visible` at every stop (`cbrs-kbd-sub.log`). Worth saying so the fix lane
   knows it is deleting working code, not broken code.

---

## #861 — the "CHAT" kicker at the foot of the admin rail (mid-run arm)

**The stated mechanism is refuted, and the owner still saw something real.** Measured at four
viewports on `Example — The Ashen Spire`: the kicker always renders ABOVE its cells
(`kickerY 737 < toolbarY 754` at 1280×800; `657 < 674` at 1280×720; `652 < 670` at 1024×768;
`621 < 638` at 430). Contrast is fine and it is not "so muted it reads as empty" — the receded rail's
captions measure **8.50:1**, actually *brighter* than the owning rail's **4.97:1** (those sit on the
accent fill).

**What a person actually sees.** At the foot of the game pane the last thing above the window edge is
a caps micro-label **"CHAT"** with a hairline running out to the pane's right edge — typographically
identical to every real section heading in that same pane (`GAME STATE · STATUS`, `ROSTER — 4`,
`PEOPLE`, `CAST`, `HOST CONSOLE`, `STAT PROFILE`, `TRACKERS`), each of which introduces a *body*.
Under it sits a row of five icon cells with **no background fill** (`RAIL_OWNERSHIP_CLASSES.receded`
is the empty string; the owning rail gets `bg-sidebar-accent/40`) and **no `aria-current` on any
cell** — because the selection lives in the other rail — whose bottom edge is *exactly* the viewport
bottom (`toolbarBottom 800` at `vh 800`; `720` at `720`; `768` at `768`). No fill, no selected cell,
no padding, no floor: the strip just ends where the window does. Meanwhile the twin rail 500 px above
wears both the accent band AND a live breadcrumb (`GAME STATE · STATUS`), so the eye reads the top one
as a live control group and the bottom one as a bare heading over inert icons. At 1024×768 the same
rail wraps **3 + 2** (`Members / This chat / Preview` then `Game / Activity`), leaving a ragged
half-row with a large void to the right of "Activity" — a header over a broken grid, flush to the
window edge (`cbrs-861-foot-1024-crop.png`). On the phone the strip sits **directly on top of the
app's own bottom tab bar**: two near-identical rows of labelled icons separated by one hairline, with
the roster body above cut mid-sentence and no scroll affordance
(`cbrs-861-foot-mobile-crop.png`). So the defect is not the kicker's position — it is that a
SECTION-HEADING voice is being used for a bottom-pinned NAVIGATION rail that, while receded, carries
no fill and no current-item, sitting on the window's last pixel. Flip the selection into it
(`cbrs-861-foot-chatowns-crop.png`: kicker becomes `CHAT · MEMBERS`, the cells gain the accent band,
`Members` gains an orange edge-bar) and the complaint evaporates — which is the confirming
experiment.

**Fix (`layout:` + `typeset:`).** (a) Give the receded rail a resting fill or hairline container so
the cell row reads as a control group rather than as loose icons; (b) let the receded rail keep its
breadcrumb (`CHAT · MEMBERS`) so it never shows a group name with nothing selected; (c) put a floor
under it — bottom padding / a container edge so the strip is not the window's last pixel; (d) at the
wrap threshold, centre or full-width the second row instead of leaving a 3+2 ragged block.

---

## Retractions

1. **RETRACTED — the 10 `design-audit` `tap-target` P1/P2 findings on `rpg-status-tab` are false
   positives.** I very nearly forwarded six P1s (fine pointer) and four (coarse). Every flagged
   `[data-slot=tracker-value-rest]` control carries a pointer-conditional `::after` touch target —
   **28×28 px at `pointer: fine`, 44×44 px at `pointer: coarse`** — and it self-reports:
   `document.elementFromPoint` at the centre and at ±10 px (fine) / ±16 px (coarse) returns the
   BUTTON itself, not a wrapper. The auditor read the 15/18 px border box.
   **Receipt:** `cbrs-tap2.log`, `cbrs-tap3.log`.
   *Residual real observation, P3:* the pseudo is asymmetric —
   `inset: 6.5625px -32.3281px -37.4375px 11.6719px` — so the target is offset ~14 px DOWN from the
   glyph it belongs to, and the `—` cell's expanded target and `+ condition`'s overlap: at
   `cy+16` the point resolves to `+ condition`, not to `—`. A thumb aiming below the `—` glyph hits
   the neighbour. Outside start/exit scope; filed as stumbled-on.
2. **RETRACTED — my own first read of `cbrs-06-menu-off-t0.png`,** where I saw the ⚔ glyph still on
   the Midnight Run row and briefly read it as "a disengaged game still advertises itself". The
   server derivation is engagement-aware (`read.ts:301`); the glyph was STALE cache. That misread
   became finding P2 above, correctly framed.
3. **NOT A FINDING (checked before filing, per `#112`):** the game rails expose `role="toolbar"` +
   `aria-current`, not `tablist`/`aria-selected`. `aria-selected` being null on those cells is the
   ruled design, and arrow navigation works (`cbrs-kbd-sub.log` idiom). I did not file it.
4. **NOT A FINDING:** the `❗1 ⚠0` chip overlapping the `Activity` cell in several screenshots is
   vite-plugin-checker's dev overlay, and design-audit's single `NO VERDICT` row is a text node
   "painted over by vite-plugin-checker-error-overlay". Dev tool, not product.

## What is genuinely working (do not touch)

1. **The ⋯ submenu's keyboard model.** `aria-haspopup="menu"` + `aria-expanded`, ArrowRight opens the
   submenu and lands on `Freeform story`, ArrowDown moves, Escape closes the submenu back to its
   trigger, a second Escape closes the menu and restores focus to `Chat options`, `:focus-visible`
   true at every one of those stops. That is a textbook Base UI menu. (`cbrs-kbd-sub.log`)
2. **The arrival experience of a populated game.** `Ashen Spire` opens to a waystone clock, five pool
   orbs, a four-actor roster with meters and a condition chip, at 4.79–8.50:1 contrast, with zero
   CLS and zero non-compositor-clean animations. It looks genuinely good and it holds at
   `defaults` / `maximal` / `compact` / `reading` and at 430 — all four appearance arms distinct
   (four different md5s) and all four `no-overflow PASS`. (`cbrs-15`, `cbrs-17-ap-*`)
3. **The off-door's copy.** *"The RPG overlay is off — your sheets, scene, and quests are kept. Turn
   it on to pick up where you left off."* is exactly right. It is just in the wrong place — move it
   to the moment of the decision.

## Taste & flow verdict (blunt)

**The game surface does not look like shit — the game's front door does.** A populated room is one of
the better-looking things in this app: the waystone, the orb satellites, the roster meters, the
Ward-Burned chip all read as one designed object. Then you look at how you GET there and it is a
3-dot menu item wedged between "Character galleries" and "Select messages…", wearing a submenu
chevron, in a menu whose tooltip calls itself "Manage this chat".

**The flow is weird in one specific way: the action and its effect are in different rooms.** You act
in the composer (bottom-left of CONTENT) and the entire result happens in CONTEXT (right edge) — a
pane that is *closed by default*. That is the §13 "control far from where its effect shows" smell in
its purest form, and it is why the owner's complaint reads as "nothing happens".

**Cold, a first-timer cannot name what they just did.** The 5-second test on `cbrs-05-enter-t0.png`:
you clicked a button called "Freeform story" and you are now looking at a form headed `HOST CONSOLE —
HOST ONLY` asking you to `name it first (e.g. Grace)`, with four paragraphs of prose about what a
tracker is. Nothing on that screen says a game started. Cognitive load at that moment: STAT PROFILE +
TRACKERS + RELATIONSHIP HINTS + 6 game-rail cells + 5 chat-rail cells = **well past the ≤4
working-memory bar**, on step one.

**Two homes, one concept:** the on/off toggle lives in the ⋯ menu AND on the Game-tab door, and the
two spell the same action differently ("Turn on RPG" vs "Turn the overlay on" vs "Freeform story").
Two doors is defensible; two vocabularies is not.

## The single biggest opportunity

**Make the start action reveal its own result.** One change — a user-initiated `Turn on RPG` opens the
context panel to `rpg.status` and fires one live-region announcement — converts an invisible mutation
into a visible one, fixes the non-deterministic landing, gives SR users the transition they currently
never hear, and does it without a single frame of animation, so §4.1's "no ceremony" survives intact.

---

## Instrument coverage

| # | Instrument | Status |
| - | - | - |
| 1 | `snap --map` | **RAN** — `cbrs-mr-map.log` (64 elements, 0 DOM fallbacks), `cbrs-mob.log` (35, 0) |
| 1 | `snap --aria` | **RAN** — `cbrs-menu.log` (the ⋯ menu tree), `cbrs-door.log`, `cbrs-door-off.log`, `cbrs-takeover-aria.log` |
| 1 | `snap --contrast` | **RAN** — 6 measurements, all PASS: 4.79 / 7.75 / 10.84 / 8.50 / 15.44 / 4.97 :1 (`cbrs-contrast1.log`, `cbrs-door-off.log`, `cbrs-861-foot.log`) |
| 1 | `snap --expect-no-overflow` | **RAN** — PASS at 430 and at all four appearance presets (`cbrs-mob.log`, `cbrs-ap-*.log`) |
| 1 | `snap --watch` series | **RAN** — enter (4 ticks, byte-identical), exit ×2, re-enable |
| 1 | `snap --json` manifests | **SKIPPED** — no run exceeded the 200-message console cap; terminal view was complete |
| 1 | `snap --matrix` | **SKIPPED** — replaced by explicit `--desktop` / `1280x720` / `1024x768` / `--mobile` + 4 appearance arms, which is a wider sweep for this surface |
| 2 | `design-audit <route>` | **RAN** ×2 — takeover (`7 findings`, 6 retracted) and off-door (`1 finding`) |
| 2 | `design-audit --mobile` | **RAN** — `8 findings`, `pointer=coarse`, 7 retracted |
| 3 | `motion-audit` | **RAN** — `verdict=FAIL worst-blocking-budgeted=379ms`, `cls-non-virtualized=0`, `dropped-frames=0%`, `dirty-animations=0` (`cbrs-motion.log`) |
| 4 | `perf-meter --click <primary action>` | **RAN** — `reports/perf-meter/cbrs-enter-perf.json`; enter step: 32 ms click / 5 ms delay / 98 ms long task / 83 ms rAF gap / **shift 0** |
| 5 | Lighthouse desktop | **RAN** — `reports/lighthouse-cbrs-desktop/` — a11y **100**, best-practices 100, agentic 100 (snapshot mode over the DRIVEN game surface, not the landing page) |
| 5 | Lighthouse mobile | **RAN** — `reports/lighthouse-cbrs-mobile/` — a11y **100**, best-practices 100, agentic 100 |
| 6 | `__orb.motion()` / `.renders()` / `.perf()` | **PARTIAL** — `motion()` ran around the enter (`blocking 36ms`, `observedCls 0.0571`, one LoAF with `styleAndLayoutStart>0`). `renders()` **SKIPPED**: render churn is not implicated by a two-click flow and `motion-audit`/`perf-meter` already carry the commit costs |
| 7 | Console triage table | **RAN** — below |
| 8 | The PNGs, actually looked at | **RAN** — 13 read: `cbrs-01,02,03,04,05-t0,06-t0,09-t0,10,11,12,13,14,15,17-ap-compact,17-ap-maximal` + 4 `cbrs-861-*` crops |
| 9 | Keyboard walk (`--key Tab` chain) | **RAN** — 34-stop walk (`cbrs-kbd.log`, `fv=true` at every real stop) + the menu/submenu arrow walk (`cbrs-kbd-sub.log`) + keyboard-driven enable (`cbrs-kbd-enter.log`) |
| 10 | Appearance presets | **RAN** — `defaults` · `maximal` · `compact` · `reading` (four distinct md5s, all `no-overflow PASS`). `diagnostics` **SKIPPED** — no metadata chrome under judgment in this flow |
| 10 | Theme arms (`--theme`) | **N/A, with receipt** — the surfaces under review live entirely inside a CARRIED-theme room: `<html>` carries **no `data-theme`** in `Ashen Spire` (`cbrs-attrs.log`), the D44 §12 takeover. A theme arm there is byte-identical by design; the owner arm is `data-elevation=flat`, `data-density=comfortable`, no `data-texture`, no `data-shadow` |
| 11 | Pane-state arms | **RAN** — context **closed** (the shipped default, and the arm that produced P1) · context **docked** · **list collapsed** (`cbrs-18-listcollapsed.png`) · plus width states 1280×800 / 1280×720 / 1024×768 / 430 for the #861 rail |

### Console triage

| Message | Disposition |
| - | - |
| `[frame] long frame 136ms · blocking 86ms @ main.tsx` | boot window, `--checkpoint`-excludable; the flow's own blocking is measured separately (P2) |
| `[drop] rendered frame mid-animation · svg[aria-label=Orbweaver] / [data-slot=weave-veil]` | the boot splash animation, before `data-app-ready`; not in either flow |
| `[perf] slow commit region:content 18ms (mount) / 26ms (update)` | chat-open cost, pre-existing (perf-meter step 0: 178 ms long task); not the game toggle |
| `[cls] shift 0.0221 unexpected · route /` | landing-surface settle at boot, `virtualized 0.0000`, well under the 0.1 budget; the game toggle itself measures `shift 0` |
| `[reflow] forced synchronous style/layout 11ms · main.tsx` | boot |
| errors | **zero** — `console-errors=0` and `page-errors=0` on every one of the 24 runs |

---

## Issue summaries (paste verbatim into the linked issues)

**#863 · P1 — the transitions announce nothing and, in the default pane state, are nearly invisible.**
Driven cold on `:5173`: with the context panel CLOSED — the shipped default for a chat room — clicking
`Turn on RPG` or `Turn off RPG` changes exactly one thing on screen, the four dice chips above the
composer (`reports/snaps/cbrs-01-mr-before.png` vs `cbrs-10-paneclosed-gameon.png`). There is no toast,
no transcript marker, no focus move, and no `aria-live` update in either direction: four seconds after
the toggle the `polite/status` region still reads the stale `"Loaded chat."` and a second status region
is present and EMPTY (`cbrs-exit.log`, `cbrs-ashenoff.log`). A screen-reader user is told nothing at
all. Fix: announce both transitions in the existing status region ("RPG overlay on — the Game panel is
open" / "RPG overlay off — your sheets, scene and quests are kept"), and on a user-initiated start open
the context panel to `rpg.status`. This collides with `Context-Panel-Program.md` §4.1 ("no ceremony …
a game is content, not an event") — see the fork in the review: the ruling survives for ARRIVAL at a
game room (which measures clean), its input changed for a user-initiated MUTATION, which is an event
and is owed H1 feedback. No animation is proposed either way.

**#863 · P1 — exit wipes a populated game on one unconfirmed click and its reassurance is tooltip-only.**
On `Example — The Ashen Spire` (waystone clock, five pool orbs, four-actor roster with HP/Stamina
meters and a `Ward-Burned` condition, six game tabs) a single click on `Turn off RPG` replaces the whole
pane with a plain Members list — no confirm, no toast, no undo, no announcement
(`cbrs-15-ashen-on.png` → `cbrs-16-ashen-off-t0.png`). The only copy explaining that state is kept is
`title="Turns the RPG overlay off — your sheets, scene, and quests are kept."` — the sole `title` in the
menu (`cbrs-mobmenu.log`) — which needs a hover dwell on a pointer device and **never renders on touch**,
so the 430 arm offers a bare "Turn off RPG" with zero context. The item also sits unseparated between
`Character galleries` and `Select messages…`, while the strictly-less-surprising `Delete chat` gets a
separator, an icon and an AlertDialog. Fix: move the sentence onto the item as a second line (which also
makes it read as pause, not end), give the RPG row its own separator group, and pair it with the
announcement above. A confirm dialog is NOT recommended — the action is genuinely reversible.

**#863 · P1 — the first screen after starting is non-deterministic, and its worst case is a schema form.**
Three measured landings for one conceptual action: starting from the Game-tab door lands on the HOST
CONSOLE — `STAT PROFILE` / `TRACKERS` / `RELATIONSHIP HINTS`, all empty, four paragraphs of prose, the
visible instruction being `name it first (e.g. Grace)` (`cbrs-05-enter-t0.png`); starting from the ⋯
menu with the pane on Members lands on `Status`, a roster of three cards each reading `—` and
`+ condition` (`cbrs-09-kbd-enter-t0.png`); starting from the ⋯ menu with the pane closed lands nowhere
at all. The landing is whatever `contextTab` happened to hold. The watch series is byte-identical across
four ticks (md5 `6d69aa75…` ×4), so that first frame IS the whole experience. A first-timer who clicked
"Freeform story" under the promise "an overlay for your roleplay" cannot tell from that screen that
anything started. Fix: `createGame` / `engaged:true` sets `contextTab` to `rpg.status` and opens the
panel; give the empty roster a one-line orienting lead so the empty state teaches.

**#863 · P2 — the chat list keeps the ⚔ "Game chat" marker after the overlay is turned off.**
`useSetGameEngaged` / `useStartGame` invalidate only `chat.getChat`
(`packages/client/src/features/chat/components/chat-options-menu.tsx:41`), but the list marker is driven
by `chat.isGame`, derived as `isRpgEngaged(row.metadata.rpg)`
(`packages/server/src/domain/chat/verbs/read.ts:301`) and delivered by `chat.listChats`, which nothing
invalidates. Measured: the glyph census reads `Example — Midnight Run glyph=1` immediately before the
toggle and at t+0 and t+2000 ms after it, while a fresh load one command later reads `glyph=0`
(`cbrs-stale.log`, `cbrs-fresh.log`). The room's own pane says "not a game" while its list row says
"Game chat". Fix: add `trpc.chat.listChats.queryFilter()` to both mutations' `invalidates`.

**#863 · P2 — one concept, four names.** `Turn on RPG`/`Turn off RPG` (⋯ menu) · `Turn on RPG` kicker
with `Freeform story`/`D20 adventure` buttons (empty door) · `RPG overlay off` kicker with
`Turn the overlay on` button (off door) · `Game` (tab) / `GAME STATE` (rail) / `Game chat` (list marker)
/ `HOST CONSOLE` (body). Three vocabularies — RPG, the overlay, game — for one feature in one pane.
Breaks UX rule N4 (same action = same label everywhere). Fix: standardise on **game** —
`Turn on game mode` / `Turn off game mode`, door button `Turn game mode back on`, kicker `Game mode
off`. Cheapest to land inside #862, which is already rewriting both doors.

**#863 · P2 — the toggle blocks ~380 ms at 4× CPU with no pending state on the menu item.**
`motion-audit` on the exit returns `verdict=FAIL worst-blocking-budgeted=379ms
loaf-style-in-frame-budgeted=3` (a 429 ms LoAF via `setTimeout` in `modern-Cyfp2l7S.js` with 54 ms of
forced style/layout, plus a 137 ms React commit); everything else is clean — `cls-non-virtualized=0`,
`dropped-frames=0%`, `dirty-animations=0`. Unthrottled the same work is a 98 ms long task with an 83 ms
worst rAF gap and zero layout shift (`reports/perf-meter/cbrs-enter-perf.json`). The Game-tab door
guards the mutation with a `createAdmission` ref and `disabled={createGame.isPending}`
(`rpg-game-door.tsx:39-51`); the ⋯ menu path has neither (`chat-options-menu.tsx:98-107`), so the menu
closes instantly and nothing indicates work in flight. Fix: optimize the takeover mount/unmount and give
the menu item the door's pending treatment.

**#863 · P3 (stumbled-on) — the ⋯ trigger's tooltip and accessible name disagree.** Visible tooltip
"Manage this chat", accessible name "Chat options" (`aria-label`; the tooltip is `aria-describedby`) —
`cbrs-tip.log`. A voice-control user saying "click Manage this chat" cannot reach the only start door in
the room. Also: `Select messages…` is the one ⋯ item with no glyph, leaving a hole in the icon column
directly under the RPG row (`cbrs-02-menu.png`).

**#863 · P3 (stumbled-on, outside scope) — the roster's touch targets are offset from their glyphs.**
`design-audit` flagged 10 sub-floor tap targets on `rpg-status-tab`; **all ten are false positives** —
every `[data-slot=tracker-value-rest]` carries a pointer-conditional `::after` of 28×28 (fine) / 44×44
(coarse) which self-reports under `elementFromPoint` at the centre and at ±10/±16 px
(`cbrs-tap2.log`, `cbrs-tap3.log`). What IS real: the pseudo is asymmetric
(`inset: 6.5625px -32.3281px -37.4375px 11.6719px`), so the target sits ~14 px BELOW the glyph it
belongs to, and at `cy+16` the point resolves to the neighbouring `+ condition` button rather than to
`—`. A thumb aiming just under the `—` hits the wrong control.

**#862 · what it does NOT fix.** #862 removes the freeform/d20 pick from start time and makes ruleset a
Game-tab setting; observed on the live drive, not re-filed. Four gaps remain. (1) **The dice chips are
profile-blind**: `packages/client/src/features/rpg/lib/dice-ask-source.tsx:48` publishes
`["d20","d6","2d6","d100"]` gated ONLY on `isRpgEngaged`, with no profile read anywhere in the file — so
picking "Freeform story" immediately produces four d20-family chips above the composer
(`cbrs-05-enter-t0.png`), contradicting the door's own copy, and on the 430 arm they wrap to two rows
and eat ~110 px of composer budget (`cbrs-11-mobile-gameon.png`). Once ruleset is a setting this row
must follow it, or the setting is a dead toggle. (2) None of the start/exit P1s and P2s above are
touched by the profile change — the announcement, the landing tab, the tooltip-only kept-state copy and
the stale list marker are all orthogonal. (3) The naming split (RPG / overlay / game) is cheapest to fix
in the same edit that collapses the two doors. (4) The submenu being deleted is **working** code, not
broken: `aria-haspopup="menu"` + `aria-expanded`, ArrowRight opens onto `Freeform story`, ArrowDown
moves, Escape closes the submenu to its trigger and a second Escape restores focus to `Chat options`,
`:focus-visible` true at every stop (`cbrs-kbd-sub.log`) — the fix lane should keep that standard in
whatever replaces it.

**#861 · what the owner saw, and why the stated mechanism is refuted.** The kicker renders ABOVE its
cells at every viewport measured — `kickerY 737 < toolbarY 754` (1280×800), `657 < 674` (1280×720),
`652 < 670` (1024×768), `621 < 638` (430) — and it is not too muted: the receded rail's captions measure
**8.50:1**, brighter than the owning rail's 4.97:1. What a person actually sees is a caps micro-label
"CHAT" with a hairline running to the pane edge, typographically identical to every real section heading
in that same pane (`GAME STATE · STATUS`, `ROSTER — 4`, `PEOPLE`, `HOST CONSOLE`, `STAT PROFILE`,
`TRACKERS`) — each of which introduces a body — sitting over five icon cells that, while receded, have
**no background fill** (`RAIL_OWNERSHIP_CLASSES.receded` is the empty string; the owning rail gets
`bg-sidebar-accent/40`) and **no `aria-current` on any cell**, whose bottom edge is *exactly* the
viewport bottom (`toolbarBottom` 800 at vh 800, 720 at 720, 768 at 768). No fill, no selection, no
padding, no floor: a section header over loose icons that end where the window ends, while the twin rail
500 px above wears both the accent band and a live breadcrumb. At 1024×768 the rail wraps 3+2
(`Members / This chat / Preview` then `Game / Activity`), leaving a ragged half-row and a large void to
the right of "Activity" (`cbrs-861-foot-1024-crop.png`). On the phone it sits directly on top of the
app's own bottom tab bar — two near-identical rows of labelled icons separated by one hairline, with the
body above cut mid-sentence (`cbrs-861-foot-mobile-crop.png`). Confirming experiment: move the selection
into that rail and the complaint evaporates — the kicker becomes `CHAT · MEMBERS`, the cells gain the
accent band and `Members` gains an orange edge-bar (`cbrs-861-foot-chatowns-crop.png`). Fix: give the
receded rail a resting container so its cells read as a group; let it keep its breadcrumb so it never
shows a group name with nothing selected; put a floor (padding / container edge) under it so it is not
the window's last pixel; and centre or full-width the wrapped second row.

## Lessons for the shared memory store (orchestrator owns the write)

- **`design-audit` tap-target on `[data-slot=tracker-value-rest]` — pointer-conditional `::after`,
  28px fine / 44px coarse, self-reports.** *Hook:* 10 P1/P2 tap-target findings on `rpg-status-tab`
  were all false; the walker read the 15/18px border box. Verify with `elementFromPoint` at centre
  AND ±10/±16px before forwarding ANY tap-target row on an rpg roster. The real residue is that the
  pseudo is asymmetric (`inset: 6.56px -32.33px -37.44px 11.67px`), so the target is offset below its
  glyph and overlaps its neighbour's.
- **A mutation's invalidation set is a UX surface.** *Hook:* `rpg.updateConfig` invalidating only
  `chat.getChat` leaves the chat-list `isGame` marker stale for the whole session — one concept, two
  renderings, different values. When reviewing any toggle, census EVERY surface that renders the
  toggled fact, not just the one the mutation names.
- **A `title=` attribute is not a place to put load-bearing copy.** *Hook:* the entire "your sheets,
  scene and quests are kept" reassurance lived in a native tooltip — invisible on touch, dwell-gated
  on pointer, and only a description (not the accname) to a screen reader. Treat a `title` on a
  decision-point control as a finding, not as documentation.
