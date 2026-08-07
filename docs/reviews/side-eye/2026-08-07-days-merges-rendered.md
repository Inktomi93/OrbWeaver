# side-eye — the day's rendered merges (2026-08-07)

> **Provenance note.** The lane's tool-guard refused its heredoc writes into the worktree, so this
> report was returned inline and transcribed to disk by the orchestrator. Content is the lane's;
> the U4 resolution at the foot is the orchestrator's, added after the fact and marked as such.
> Screenshots referenced are under `reports/snaps/` (ephemeral — `reports/` is not durable).

**Tree** `10bff2dd4` · **Mode** FOCUSED (per-target verdicts) · **Stack** dev :5173/:8788.
**Load caveat:** three lanes ran gate/test floors throughout. Timing numbers are untrustworthy and
caveated in place; geometry, contrast and a11y are load-independent. Perf/CLS/INP deliberately skipped.

## VERDICT: SHIP WITH FIXES

| # | Target | Verdict |
|---|---|---|
| ① | PHONE-COMP — the coarse collapse | **Works.** 1×P1, 2×P2, 1 owner ruling, 1×P3 |
| ② | The two `JUDGMENT_DEFERRED` geometry sites | **The gate's stated harm does NOT reproduce at either** |
| ③ | MOBILE legs 1/2/4 | **Clean at real 320 coarse.** 2×P3 taste |
| ④ | DRAFT-POLISH legs 1/2 | **Both legs work.** 1×P1, 1×P2 |

**Not covered:** perf/CLS/INP · a real Tab traversal of the rpg game rail (U1 blocked it) ·
Refinery/Analytics/Databank · light theme · RTL · `--contexts` multi-user views.

---

## ① PHONE-COMP

### Verified working
- **RPG HUD coarse budget** (430×932 real coarse): pane 636 · band 138 (21.7%) · rail 50 ·
  **active tabpanel 334 (52.5%)**. `rpg-band-satellites` and `rpg-hud-echo` both computed
  `display:none`. The 18px-of-464 tabpanel is dead.
- **Chats roster at coarse:** inline star 0×0, kebab 48×48, title lane 226–266 of 413, no clipping.
- **The ★ marker survives at coarse** — `aria-label="Starred"`, visible, 16px. `ROW_REVEAL_SWAP_COARSE_KEEP`
  works, and the kebab correctly grew **no** coarse-only Star twin (mirror-parity ruling honoured).
- **Persona row at coarse:** name **202px of 382 = 53%** (was 0.14), action cell 48px.
- **Edge fade over art:** `mask-image: none` on an art room while `data-fade-top` is still set.
  **Positive control:** removing `data-has-bg-image` restores the gradient; restoring it kills the mask
  again — the probe can see a mask, and the art arm is what turns it off. Pixel-sampled reading surface:
  dialogue **11.79:1** · timestamp **11.18:1** · attribution **17.14:1** · chevron **10.12:1** — all PASS.
- **Topbar vocabulary at coarse:** "Show Corpus overview" ⇄ "Show Corpus list" + "Show details", 48×48,
  one-tap round trip. Ruled reachability intact.

### [P1] The persona row's DEFAULT crown and FAVORITED heart vanish at coarse
`persona-row-markers`' paint Row computes **`display:none`** at coarse; children are
`["Playing as", "Your default"(crown), ""(heart)]`; class string carries `pointer-coarse:hidden`.

**Why it hurts:** `ROW_REVEAL_SWAP`'s own header states its premise — at coarse the reveal cluster is
permanently visible, so the control carrying the same datum is on screen. **PHONE-COMP deleted that
premise for this row**: Favorite and Set-as-default moved into the closed kebab. So the crown is gone
AND its verb is behind a tap. This is the identical bug the same commit fixed on the chats row and
minted `ROW_REVEAL_SWAP_COARSE_KEEP` for — not applied here.

**Proposal:** split the marker Row — keep the "Playing as" kicker's deliberate coarse drop, give the
crown + heart `ROW_REVEAL_SWAP_COARSE_KEEP`. **⚑ Ruling collision flagged:** the header re-ruled the
2026-08-03 "PLAYING AS in words" premise on purpose; this proposal restores only the two glyphs and does
not reverse it. Symptom is "state invisible on a phone"; any mechanism that kills it satisfies.

### [P2] `pointer-coarse:auto-cols-max` took three of six game-rail tabs below the touch floor
430 coarse: Status **43** · Inventory 60 · Scene **41** · Quests 46 · Journal 47 · Map **34**, all 49
tall. `TabsTab` carries **no** hit-area pseudo. **Baseline:** forcing `grid-auto-columns: 1fr` back on
the live rail gives all six **67px**. Floor is 44 (D62 P1 / §4b axis 3).

**⚑ And it re-creates a recorded owner ruling's defect.** `rpg-hud.tsx`'s own header: *"cells as equal
columns so the rail reads as a solid frame rather than bitsy buttons bunched left (the 2026-07-28 owner
ruling, carried over)"*. At 430 the six cells end at x=302, leaving **127px of empty rail**.

**Proposal:** keep the single scrollable row (the vertical win is real and CT-pinned) but floor the cell
— `auto-cols-max` + `min-w-touch-target`, or `auto-cols-fr` + `min-w-touch-target` scrolling only when
the sum exceeds the rail.

### [P2] The coarse game rail is an `overflow:auto` box with zero headroom — focus ring clipped
`overflowX: auto`, **`overflowY: auto`** (CSS forces the cross axis), `clientHeight 49` = cell height,
no padding. `FOCUS_RING` = `ring-2 ring-offset-2` = 4px painted **outside** the box.
**Honesty caveat:** geometric receipt only — a real Tab traversal could not be completed (U1).
Re-verify with a Tab walk before/after any fix. **Proposal:** padding/`scroll-py` equal to 4px, or
`FOCUS_RING_INSET` for cells inside a scroll container.

### [OWNER RULING] The vitals-orb drop is defensible; its stated justification is broader than what is true
Satellites carry **four** figures: HP 31/38 · Mana 28/40 · Focus 20/20 · **214 gold**. The in-source
justification says *"every one of them is a tracker row in Status"*.
- HP/Mana/Focus **are** tracker rows on the Status roster card. ✓
- **The wallet is not.** It renders in the **Inventory** tab header (1 tap) and the character takeover
  (2 taps). Never in Status. *(Lane's own retraction: it first recorded the wallet as 2 taps and nowhere
  else; Inventory carries it at one tap.)*
- The orb set is derived server-side (`rpg/chat-ops/tracker-view.ts:130`) from the pinned meter trackers
  of the first actor with state, then pinned GAME trackers. **A pinned game-level tracker is not an actor
  tracker row at all**, and an orb from a `kind:"cast"` actor homes on Scene (`rpg-status-tab.tsx` filters
  `kind !== "cast"` out of the roster by design). The claim is true for the seeded d20 shape, not in general.
- At coarse, on Scene/Quests/Journal/Map there are now no vitals and no wallet anywhere on screen.

**Owner's call, two shapes:** (a) keep the drop, correct the header to name where each figure actually
goes; (b) keep the drop but spend one **text** line at coarse (`HP 31/38 · MP 28/40 · 214g`, ~18px)
instead of the 100px orb row.

### [P3] `pointer-coarse:` utility literals now live in two rpg FEATURE files
`rpg-hud.tsx` (`RAIL_WRAP_CLASS`) and `rpg-takeover-header.tsx`. §4b axis 3 says pointer media is
token/shell layer, never features. Precedent already exists (`features/chat/components/member-row.tsx`,
`features/chat/lib/message-actions-reveal.ts`) and **no gate covers it** —
`no-media-queries-in-features`' `MEDIA_QUERY_RE` matches viewport width variants only.
**Owner ruling wanted:** does axis 3 bind utility variants, or only token sizing?

---

## ② The two `JUDGMENT_DEFERRED` geometry sites — rendered evidence for the ruling

**Headline: the gate's stated harm — "aiming at one control commits its neighbour" — does NOT reproduce
at either site.** Measured with `elementFromPoint` under real touch. What *does* reproduce is a
**touch-floor shortfall**. The gate's premise came from the ambient-strip weather picker, whose controls
were `size="inline"` — a full-width pseudo on an ~18px-tall text button. These two sites use `glyph-*`
boxes of 30–32px, so the pseudo's overflow lands in the inter-cell **gap** and never reaches a sibling.

### Site A — `rpg-pack-rows.tsx:39` · `ItemIconPicker`
Box **32×32** · gap **6** · `::after` **44×44** · 5×5 · pitch 38 both axes · overlap **6px, entirely
inside the gap**. **Hit sample: all 21 cells at centre + top + bottom + right edge → 21/21 hit
themselves.** Gap sample at y=331 returns "scroll" — mechanism real, but only in dead space.
**Effective hit box: 37×37**, asymmetric (22 up/left, 15 down/right — the later sibling owns the gap).

| option | grid box | cols × rows | effective hit |
|---|---|---|---|
| **as shipped** (`gap-field` 6px, `glyph-lg` 32px) | 200×**184** | 5×5 | **37×37** |
| **B** `pointer-coarse:gap-block` (12px) | 200×**252** (+68) | 4×6 | **43×43** |
| **A** `size="icon"` (48 coarse / 34 fine) | 200×**372** (+188) | 3×7 | **47×48** |

B is token-clean (`--spacing-block` is exactly the 12px that makes pitch = 44) and leaves desktop
untouched. A also grows the fine box 32→34. Left alone: a mis-tap picks the wrong glyph — one tap to
undo, non-destructive.

### Site B — `rpg-actor-trackers.tsx:251` · `ConditionChips`
Five live conditions at 430 coarse: chip **30 tall** (112–125 wide) · gap 6 → wrapped-row pitch **36** ·
✕ box **16×16** · `::after` **44×44**. **Effective ✕ hit box: 43×35** (43×43 on the last row) — vertical
floor missed by **9px**. Cross-chip sample lands in the 6px gap, not over the neighbour. The chip's own
label is safe. **But the ✕'s pseudo reaches ~24px left into the chip's own body** — visible ✕ is 16px,
the live destructive zone is 43px wide.

| option | chip height | wrapped pitch | note |
|---|---|---|---|
| **as shipped** | 30 | 36 | ✕ hit 43×35 |
| `size="icon"` ✕ (48 coarse) | ≥48 | 54 | floor cleared; chip run becomes a 48px control bar |
| row-gap `section` (24px) | 30 | 54 | floor cleared; ~18px per wrapped row |
| `pointer-coarse:min-h-touch-target` on the Badge | 44 | 50 | floor cleared **and the 44px pseudo fits inside its own chip** |

> **Caveat stated by the lane:** this table is *arithmetic from measured inputs*. The live injection run
> was lost to a mid-eval HMR reload from a concurrent lane and was not re-run.

**Lane's read (not a ruling):** B is the more serious — destructive verb, floor missed on every wrapped
row — and the fourth option is the only one that fixes the *cause* (a 44px hit area hanging off a 30px
chip) rather than padding around it.

**⚑ Both `JUDGMENT_DEFERRED` rows should be REWRITTEN before they are deleted** — their `why` text
asserts the collision mechanism, and that assertion is now measured false at both sites.

---

## ③ MOBILE legs 1 / 2 / 4 — at **real 320×568 coarse**

> `snap --mobile` is 430-only; `--viewport 320x568` yields a FINE pointer and would have measured a
> layout no phone renders. Used chrome-devtools `mobile,touch`.

- **Topbar budget — the old P1 is dead.** topbar 320×48 · lead x=12 w=240 · trail x=204 w=104 ·
  "Back to Chats" 48×48 and **`elementFromPoint` at its centre returns itself** · total 312 ≤ 320.
- **The one-shell leak is closed.** With `data-list-mode="docked"`, `.shell-content` computes
  `display:none` (was 149,341px² painting under the roster).
- **The one-shell rule holds.** Nothing selected ⇒ list docked, context collapsed, chatOpen false.

**[P3] The avatar gutter still costs ~13% of a 320px reading column** when the avatar is scrolled out —
the bubble starts ~42 CSS px in with bare background photo in the gutter. Leg 4 stepped the avatar down
but the gutter TRACK is still reserved. Two sub-notes: (a) `size-6` is a raw Tailwind step where
`size-avatar-sm` is the token, set on a sealed `@orb/ui` primitive from a **parent's** child-combinator
variant — invisible to `ui-size-via-variant` (it reads `className` on the @orb/ui element, and `Row` is
an `UNSIZED_BOX` exemption) and to `no-arbitrary-tw-values` (no brackets). **A new blind spot for that
gate.** (b) it works only because a variant sorts after the base — the "resolved by stylesheet order"
shape the Button variants header warns about.

**[P3] A lone unlabelled chevron floats directly on the background photo.** After leg 4 correctly
removed the dead "1 / 1" pager, the surviving generate-chevron sits on raw art with no backing and no
label. 10.12:1 *at the sampled position*, but it paints on whatever the photo happens to be —
content-dependent, and cold-read it is unidentifiable.

---

## ④ DRAFT-POLISH legs 1 / 2 — the two axes kept distinct

> **RETRACTION, published.** The lane first recorded *"a solo draft carries no background — leg 1
> doesn't work"* from an `--idle` read. `--watch` refutes it: t+0 `hasBg:false` → t+2146ms
> `hasBg:true`, dialogue becomes `oklch(0.72 0.16 252)`. **Leg 1 works**; the read was taken before the
> founding cards landed.

Leg 2 verified: group draft topbar names all three, pre-send cast strip with the add-member door,
roster chip "4". PHONE-COMP's one-`draftChatTitle`-for-both-surfaces finding verified.

### [P1] A composed DRAFT is silently destroyed by opening another chat
Draft "Kohaku" holding composer text → click another roster row → topbar becomes that room and the
roster contains **no Kohaku row**. No confirm, no undo, no trace of the room or the text.

| axis | behaviour |
|---|---|
| **Composer input** (committed room) | **Survives** a section round-trip **and** a room switch |
| **Draft phase** (pre-first-message room) | **Survives** a section round-trip; **destroyed** by opening another chat |

> **RETRACTION, published.** Two earlier probe runs reported "NO COMPOSER ELEMENT" / `chatOpen:false`
> after a section round-trip. Both were probe artifacts — same-tick reads with no settle, and a
> `--watch` that re-ran the *navigation* evals every tick. Composer persistence works.

**Proposal:** keep the draft alive (a roster row for an unsent draft — the shape every other list
already teaches) or confirm before discarding a draft with composed content.

### [P2] Every new draft renders a ~2s placebo identity first
`--watch`, fresh group draft: t+0ms topbar `? | ? | ? | | New chat | | 4`, no theme, `hasBg:false`;
t+2135ms the real names, theme and background. Same shape solo. Unresolved seats render a literal **"?"**
which reads as an error, not as loading — and it makes three separate landed fixes (title, theme,
background) all look broken on first contact.
**Mechanism:** the all-or-nothing gate in `data/use-carried-appearance.ts` over N **cold**
`character.get` reads — the picker used `character.list`, a different query key, one frame earlier.
**Caveat:** the ~2.1s figure was taken under 3-lane load and is not trustworthy; the two-phase render is
structural and is. **Proposal:** seed the `character.get` cache from the picker's list rows, and use a
skeleton rather than "?" for an unresolved seat.

### [P3, taste] The new-chat picker's commit action is a listbox option
"Start chat with 3 characters" sits **inside** the same `role="listbox"` as the character checkboxes,
above them, in the same visual vocabulary. There is no Start button, and the action sits above its inputs.

### Open question (not filed as a finding)
Typing "Hana" returned Hana Mizushima, **Morgatha the Undying Dark**, **Sabine Veyra**, **Elias Thorn**.
Morgatha matches as a subsequence; "Sabine Veyra" contains no `h`. Either the matcher reads
handle/description/tags, or it is looser than intended. The matcher was not read.

---

## Stumbled-on, outside the targets

- **U1 — [HIGH, UNATTRIBUTED] a game chat present in the DB is absent from `chat.listChats` and the
  roster.** At 16:26 `chat.listChats` returned 7 rows and "Seeded game — d20" rendered (measured). By
  16:52 it returns 6 and the game is gone, while `/api/_debug/db/chats` still lists it (13 chats;
  `archived:false, temporary:false, star:false`). A fresh `__orb.seed.game({profile:'d20'})` chat also
  failed to appear. **Three lanes were hitting the shared box and the server's list query was not read —
  NOT attributable. Wants its own investigation lane, on a quiet box.**
- **U2 — dead Tailwind classes on code-block rendering.** `snap --deadcss`: ten `before:*` line-number
  classes (×30 each) + `text-[var(--sdm-c,inherit)]` (×26), none in `packages/**` source —
  Streamdown-emitted, so the scanner never compiles them and code-block line numbers don't render.
  Possibly covered by the known Streamdown root-classes seal; verify before acting.
- **U3 — the persona fixture has two personas both named "Traveler"** with the same title "Your default
  persona". Seed data, not a UI bug — but a bad fixture for any future persona review.
- **U4 — RESOLVED BY THE ORCHESTRATOR, NOT A DEFECT.** The lane reported `avatar-stack-root` accessible
  names reading "3 people" / "2 people" / "2 people" live rather than "N characters", contradicting a
  same-day CT fix. **Settled against the live DOM:** four stacks are present; the three reading
  "N people" all have owner `list-row-leading` / `inTopbar:false` — they are `chat-summary-row.tsx:78`
  roster rows, which pass **no** `aria-label` and correctly take the generic fallback (their items are
  chat *seats*, humans + characters, so "people" is the right noun). The fourth, `inTopbar:true`, reads
  **"2 characters"** — the topbar stack the CT pins. AST sweep confirms exactly three call sites:
  `chat-header.tsx:246` and `:320` pass the label, `chat-summary-row.tsx:78` does not. No action.

## Automated floor (a floor, not a verdict)
`pnpm design-audit /` → 27 findings, 0 P0, 0 P1. All three P2s are TanStack devtools `z-index`
(dev chrome, false positive). The 24 P3 `nested-card` hits are list rows and badges — known FP class.

---

## Taste & flow

**The rpg pane on a phone is much better, and now looks unfinished in one specific place.** The band
reads cleanly, the waystone is the right amount of ornament, the roster meters are genuinely readable.
But the game rail is six small buttons huddled in the left two-thirds of a 430px strip with 127px of
dead rail to their right — it reads like a layout that gave up, and it is the first thing the eye hits
under the band. It is also, word for word, the "bitsy buttons bunched left" that file's own header says
an owner ruled against.

**Three stacked horizontal strips is one too many.** The same screen shows the game rail at y=198, the
CHAT context rail at the bottom, and the app's bottom tab bar under it. The bottom two are near-identical
4-cell icon+caption rows ~50px apart — one switches a pane's tab, the other switches the whole app
section. Labelled, but visually twins. Competing options at that decision point: 6 + 4 + 4.

**The art rooms look genuinely good.** Warm dialogue, muted italic narration, prose on an honest opaque
bubble over a bokeh photo — and the numbers back the eye up. This is the surface the reading-surface rule
exists to protect, and it is being protected.

**The draft phase's first two seconds look broken and everything after looks right.**
`? ? ? / New chat / default chrome` is the worst possible first frame for a room the user just
deliberately composed — then it snaps into a correct, well-composed room.

**The new-chat picker is the least intuitive surface driven.** Cold: a search box, a listbox, and the way
out is an option inside the listbox. Nothing looks like a button.

**One-home (IA):** clean on the collapse work — exactly one telling per pointer class on both rows. Two
soft flags: the wallet reads in the Inventory header AND the character takeover; and "which persona is my
default" has **zero** homes at coarse (the P1).

## What is working — don't touch
1. **The coarse-collapse mechanism.** 14%→53% on the persona name, 226–266/413 on chats titles, one 48px
   control per row, verbs in the kebab, exactly one telling per pointer class. The CTs pin it honestly
   (`hasTouch: true` plus an assertion that the emulation landed *before* any geometry is trusted).
2. **The edge-fade-over-art fix**, pinned by pixel sampling — the only instrument that can see it.
3. **The 320px topbar budget.** Lead 240 / trail 104, back button hit-tests to itself.

## The single biggest opportunity
**Kill the ~2s cold identity on a new draft.** It is the first thing a user meets in the phase the owner
called sloppy, it makes three separate landed fixes look broken simultaneously, its fallback glyph is a
"?" that reads as an error, and it has one cause — with the data already in hand one frame earlier.
