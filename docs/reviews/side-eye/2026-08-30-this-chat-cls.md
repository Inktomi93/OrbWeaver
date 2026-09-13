---
kind: review
status: draft
updated: 2026-08-30
---

# "This chat" tab body — live CLS attribution by section (#819)

**Lane:** cb-cls-attrib · **Instrument:** buffered `layout-shift` replay (`buffered-layout-shift-replay.md`)
reading `sources[].node` per entry, plus a 20ms section-geometry sampler · **Stack:** live `:5173` /
`:8788`, dev build, real server latency · **Principal:** the single dev user
`01m18ywmzjf268dry1jb3nw4zq`, persona **Traveler**, **host** of the room. Every receipt below was taken
as that principal.

## VERDICT — SHIP WITH FIXES

**The whole-drive `0.3263` from the B10 review is not the tab body. It is the context-panel dock, and
on the human path nobody pays it.** The "This chat" tab body's own settle costs a host **0.00000 paid
CLS** at desktop and at mobile on every click path I could construct — but the margin to the browser's
500ms `hadRecentInput` cliff is ~105ms, and **at 4× CPU throttle on mobile it breaks: one shift of
0.30837 lands 795ms after the tap and is fully paid.** The mover is one section — **Injections** — whose
one-line skeleton stands in for ~830px of expanded editor forms.

Per the row's decision rule: no section's own settle exceeds 0.05 → the siblings get a fence, ONE
section (Injections) gets a fix row because it crosses the cliff under load.

---

## 1. Environment + fixture

Confirmed before measuring: `pnpm snap /` → `data-app-ready` true, **0 page errors**, 0 failed requests,
boot CLS 0.0224 (`reports/snaps/cbcls-boot`).

Room: **`chat_01m18ywnnnf268dv5k9vw2hfz2` — "Example — Midnight Run"**, a 2-character group chat
(Niko, Kohaku), 16 messages, non-game. Fixture built through the UI as the host:

| Section | Content | Receipt |
| - | - | - |
| Field overrides | 3 rows, all inheriting | rendered |
| Injections | **2**, both with real content | `chat.listChatInjections` → 2 rows |
| Documents | **1** ("Spire Field Notes", 322B, 1 chunk, embedded) | `databank.listActiveForChat` → 1 row |
| Lorebooks | **2** attached | `worldInfo.listForChat` → 2 rows |
| Macro picks | **EMPTY** (see deviation) | `chat.getUserMacroPicks` → `{macros:[],values:{}}` |
| Group behavior / Appearance / Storytelling / Reactions / Tool use | present (host + group chat) | rendered |
| Rules (automation graft) | **3** rules minted from 2 presets | `automation.listRules` → 3 rows |
| Plugin console / Plugin panels | present / silent-collapsed | rendered |

### Deviation 1 — I did not create a fresh room. Receipt, not preference.

I drove the create journey (Start a new chat → Elias Thorn + Sabine Veyra → "Start (2)"); `__orb.shell()`
returned `chatOpen: true`, but the room **never appeared in `chat.listChats` (limit 50)**. A room created
without a first send is a TEMPORARY chat, and `chat.reapTemporaryChats` fires on every boot (visible in
the boot console of every run). Committing it needs a model turn, which the live-model policy bars. The
seeded example room is owned by the same principal, is host-owned, and renders the identical section set
plus a real transcript — so it is a strictly better fixture, not a weaker one.

### Deviation 2 — Macro picks could not be given content, and that is the production default.

`chat.getUserMacroPicks` → `{macros:[],values:{}}` and `chat.getVariablePicks` → `{variables:[],values:{}}`.
No preset in the db declares a user-macro input or a ChoiceBlock, so the section renders its empty state.
That empty state **is** the #815 "Macro picks collapsing to 0h0" lead, and it is what every room shows
until someone authors a knob-bearing preset. It is measured below.

---

## 2. THE STRUCTURAL FACT THAT DECIDES THIS ROW

**The active context tab is not persisted.**

```
/** Only the layout preference persists — `openModal` is transient (never reopen a modal on reload). */
interface PersistedShellState {
  readonly activeSection: SectionId;
  readonly panelOverrides: PanelOverrides;
}
```

`packages/client/src/state/shell-store.ts:90-93` — `contextTab` is in `ShellState` (`:59`) and in
`DEFAULT_STATE` as `null` (`:105`), but not in the persisted shape. Confirmed live: after opening the tab,
localStorage holds only
`orb:u/<id>/shell = {"state":{"activeSection":"chats","panelOverrides":{"chats":{"context":"docked"}}},"version":2}`.

**Consequence:** there is no cold page load that lands on "This chat". The only way in is a click on the
tab. Every shift the tab body produces therefore lands inside the browser's 500ms `hadRecentInput`
exclusion window — **unless the settle runs long.** That is the whole risk surface, and it is what §5 measures.

---

## 3. Per-step attribution table (buffered replay, `sources[].node`, per-step deltas — never the accumulator)

Marks were planted between steps; entries are bucketed by mark. `PAID` = `hadRecentInput: false`.

| # | Step | Driven by | Observed | **PAID** | Movers (prev→cur, viewport-clipped) |
| - | - | - | - | - | - |
| 0 | Boot to the room | page load | 0.02210 | **0.02210** | two `[role=region]` blocks on the home landing (`358h392→334h325`, `773h27→683h92`) — pre-existing boot CLS, not this surface |
| 1 | Dock the context panel | real click | 0.34747 | **0.00000** | `div.shell-main` `[363,0,917,800]→[328,0,568,800]` = **0.313612**; transcript row `100h454→100h582` = 0.033576; list "+8 More" = 0.000285 |
| 2 | Open "This chat" | **real click** | 0.14489 | **0.00000** | tab-panel swap 0.065282 (+80ms); section settle 0.006445 (+110ms); Documents+Lorebooks leave the viewport 0.073164 (**+384ms**) |
| 2′ | Open "This chat" | programmatic (`__orb.nav.contextTab`) | 0.14489 | **0.14489** | identical three entries |
| 2″ | Open "This chat", **0 injections** | programmatic | 0.08469 | **0.08469** | swap 0.065282; settle 0.003196 + 0.016209 |
| 3 | Collapse a Field-override row | real click | 0.02252 | **0.00000** | 9 successive frames, `Injections` section 472h→398→375→346→337→331→326→323→319 |
| 4 | Open a rule's fire log | real click | 0.01543 | **0.00000** | 9 collapse frames inside `§Rules` + 0.007918 when the log's rows land |
| 5 | Mint a rule | real click | 0.02196 | **0.00000** | `§Plugin console` `492h300→728h64` (Rules grew +236px under it) |
| 6 | Tab away to Members and back | programmatic ×2 | 0.13056 | **0.13056** | 2 × 0.065282, the same panel swap |
| 7 | **Mobile 430×932** — open "This chat" | real click | 0.46210 | **0.00000** | swap 0.236096 (+277ms); settle 0.017040 (+342ms); Documents off-viewport 0.208966 (**+695ms**) |
| 8 | **Mobile** — tab away and back | programmatic ×2 | 0.47219 | **0.47219** | 2 × 0.236096 |
| 9 | **Mobile @ 4× CPU** — open "This chat" | **real click** | 0.61742 | **0.30837** | swap 0.27918 free (+0ms); settle 0.01519/0.01067/0.00401 free (+57/74/100ms); **`§Documents 515h186→0h0` + `§Lorebooks 725h143→0h0` at +795ms → PAID 0.30837** |

Receipts: `reports/snaps/cbcls-{S1,S2b,click,zeroinj,mobclick}.png` + the eval dumps in each run's log.
Row 9 was taken through chrome-devtools MCP (4× CPU emulation, real trusted click on uid `1_12`) because
`snap` has no throttle flag — see §9.

---

## 4. Section-by-section: skeleton height vs settled height (the actual attribution)

Sampled every 20ms across the tab open; three distinct frames appear, at **~64ms** (all skeletons),
**~108ms** (first resolve wave), **~364ms desktop / ~377ms mobile** (second resolve wave).

### Desktop 1280×800 — context panel 367×679

| Section | skeleton | settled | Δ | verdict |
| - | - | - | - | - |
| Field overrides | 183 | 183 | 0 | clean (no boundary — synchronous) |
| **Injections (2 rows)** | **89** | **920** | **+831** | **THE MOVER** |
| Documents (1 row) | 137 | 189 | +52 | within budget |
| Lorebooks (2 rows) | 137 | 225 | +88 | within budget |
| Macro picks (empty) | 137 | 65 | **−72** | over-reserved (shrinks on settle) |
| Background | 117 | 117 | 0 | clean |
| Group behavior | 233 | 340 | +107 | within budget |
| Appearance | 169 | 169 | 0 | clean — skeleton matches |
| Storytelling | 152 | 152 | 0 | clean |
| Reactions | 292 | 292 | 0 | clean |
| Tool use | 150 | 150 | 0 | clean |
| **Rules (3 rules)** | **185** | **704** | **+519** | large, but below the fold (scores ~0 today) |
| Plugin console | 323 | ~64 | −259 | over-reserved, settles late |
| Plugin panels | 0 | 0 | 0 | silent-contributor collapse working as designed |

### Mobile 430×932 — context panel 411×~707

| Section | skeleton | settled | Δ |
| - | - | - | - |
| Field overrides | 183 | 183 | 0 |
| **Injections (2 rows)** | **105** | **967** | **+862** |
| Documents | 169 | 188 | +19 |
| Lorebooks | 169 | 250 | +81 |
| Macro picks | 169 | 65 | **−104** |
| Group behavior | 297 | 378 | +81 |
| Background / Appearance / Storytelling / Reactions / Tool use / Plugin console | = | = | 0 |
| **Rules** | **233** | **1296** | **+1063** |

The Injections rows themselves measure **362px and 385px** (`§Injections 2 = y320h920` containing
`y413h362` + `y799h385`). The fallback is `SkeletonRows count={1} shape="line"` —
`settings-context-tab.tsx:147`, where its neighbours use `count={2}` (`:159`, `:173`, `:184`) and Group
behavior uses a named `GROUP_SECTION_SKELETON_ROWS = 4`. One line stands in for two ~370px forms.

### The control that proves Injections is the dial

Same programmatic tab open, same room, injections deleted then restored:

| Arm | section-settle CLS | tab-panel swap |
| - | - | - |
| 0 injections | **0.01940** | 0.065282 |
| 2 injections | **0.07961** | 0.065282 |

**4.1×**, with the swap term byte-identical in both — so the swap is a fixed cost independent of section
content, and the settle term is Injections. That is the positive control in both directions.

---

## 5. Findings

### \[P1] Injections' skeleton under-reserves by ~830px, and the resulting shift crosses the `hadRecentInput` cliff under CPU load

**What.** `settings-context-tab.tsx:145-152` wraps `InjectionsManager` in a `QueryBoundary` whose fallback
is `<SkeletonRows count={1} shape="line" />` (~89px desktop, ~105px mobile). The real content is N fully
expanded per-row autosave forms — `injections-manager.tsx` is "a plain mapped list of per-row autosave
forms" with **no collapsed state at all** — measured at 362px and 385px per row. Two injections resolve
into 920px where 89px was reserved. The resolve arrives in a **second wave ~260ms after** the rest of the
tab has already painted its real content, so Documents and Lorebooks — which have *already settled* — are
shoved bodily out of the viewport.

**Why it hurts a user.** At rest this is invisible because the click covers it. Under any load it is not:
at 4× CPU on a 430px phone the wave lands **795ms** after the tap and the host pays **0.30837 CLS in a
single shift** — 3× the 0.1 bar, and the visible effect is that the two sections you were reading
(Documents, Lorebooks) vanish upward half a second after you tapped. On an unthrottled desktop the same
wave lands at +384ms, **116ms** from the cliff. That margin is not a design; it is luck.

**Fix.** Reserve the real height. The count is *already in hand and already free*: `InjectionsHeading`
(`settings-context-tab.tsx:92-97`) runs a NON-suspending `useQuery` on the same
`listChatInjections` cache purely to paint the count chip. Feed it to the fallback
(`count={data?.length ?? 1}`) **and** give `SkeletonRows` a row shape that matches a form, not a line —
or, better and cheaper, **collapse an injection row by default** to the same 40px "summary + state chip"
affordance that Field overrides directly above it already uses. That single change removes the CLS AND the
taste finding in §6.

`layout: the Injections section of the "This chat" tab — receipt: skeleton height within 10% of settled
height at 0/1/2/5 injections, desktop and --mobile, and a 4× CPU arm showing no PAID entry after the click.`

**Receipt.** Section sampler: `§Injections 89→920` (desktop), `105→967` (mobile). Paid entry at 4× CPU:
`{dt:+795ms, v:0.30837, paid:true, src:["section §Documents 1 515h186>0h0","section §Lorebooks 2 725h143>0h0"]}`.
Control: 0.01940 vs 0.07961 section-settle with 0 vs 2 injections.

---

### \[P2] The "This chat" tab is a ~4,000px unbounded scroll whose SECOND section eats the entire viewport

**What.** Fourteen sections, no bounding, no grouping beyond the single "Host controls" band. With two
injections the settled tab is 2,600px on desktop and ~4,000px on mobile. `reports/snaps/cbcls-click.png`:
at desktop, everything visible below the Field-overrides trio is *one injection's editor* — Injection /
Remove / Position / Role / Depth / help text / Content, six stacked full-width fields for one row.
Documents, Lorebooks, Macro picks and all eight host-control sections are below the fold.
`reports/snaps/cbcls-mobclick.png`: at mobile the viewport ends **mid-way through the first injection's
Depth field.**

**Why it hurts a user.** §8 cognitive load: at the top of the pane a host has 14 competing section
destinations, and the pane gives no map of them — no anchor list, no collapse-all, and the second one
consumes the screen. The affordance that *does* solve this is sitting immediately above it: Field
overrides collapses each of its three concerns into a 40px row with an "inheriting" state chip. Injections
is the same shape of thing (three of them are literally the same `position/role/depth` triple) and gets
none of it. That is one concept with two presentation laws in adjacent sections of one pane.

**Fix.** `distill: the Injections section rows — collapse to the Field-overrides row idiom (summary line +
state chip, expand on demand). receipt: settled tab height under 1,600px desktop with 2 injections, and
both --mobile and desktop shots showing Documents/Lorebooks above the fold.` Secondarily consider a
section index for the pane, but the collapse alone likely retires the need.

**Receipt.** `reports/snaps/cbcls-click.png`, `reports/snaps/cbcls-mobclick.png`; settled section heights, §4.

---

### \[P2] Field-overrides collapsible triggers are 40px tall on a coarse pointer, with no touch-target expansion

**What.** The three triggers ("Main prompt, inheriting" / "Post-history, inheriting" / "Scenario,
inheriting") measure **411×40** under `--mobile` (`pointer: coarse`). I verified this is not the known
box-vs-hit-area false positive: `getComputedStyle(el,'::after').inset` is `auto` (no
pointer-conditional expander), and `elementFromPoint` 3px above and 3px below the box does **not**
resolve to the trigger. The effective hit area really is 40px — 4px under the 44px floor.

**Why it hurts a user (Casey).** These are the tab's first three controls and the ones a host reaches for
most; 40px is inside the miss band for a thumb on a moving train.

**Fix.** `polish: the three Field-overrides collapsible triggers — grow to the 44px coarse-pointer floor
via the @orb/ui pointer-conditional touch-target recipe (packages/ui/src/primitives/button/variants.ts:16-20,76-82),
not by growing the visual box. receipt: pnpm design-audit / --mobile --open-chat <id> --context-tab 'This chat'
with zero tap-target rows.`

**Receipt.** `pnpm design-audit / --mobile --open-chat … --context-tab 'This chat'` → 3 × P2 `tap-target`
`411×40px` on `[data-slot=collapsible-trigger]`, cards 2/3/4; hit-probe eval above.

---

### \[P3] Macro picks' skeleton over-reserves by 72–104px — the section SHRINKS on settle

**What.** `SkeletonRows count={2}` (137px desktop / 169px mobile) resolves to a 65px empty state, so the
section collapses and everything below jumps *up*. This is the #815 "Macro picks collapsing to 0h0" lead,
**confirmed live** — and priced: it contributes ~0.003 of the 0.0194 zero-injection settle.

**Why it hurts a user.** Content moving upward reads as a glitch rather than as loading. Minor because the
distance is small and it is inside the exclusion window.

**Fix.** `count={1}` for a section whose common case is empty, or reserve nothing and render the empty
state immediately (the picks declaration read is cheap and already cached).

**Receipt.** Sampler: `Macro picks 137→65` (desktop, `cbcls-sections`), `169→65` (mobile, `cbcls-mobsec`);
`chat.getUserMacroPicks` → `{macros:[],values:{}}`.

---

### \[P3] Rules under-reserves by 519px (desktop) / 1063px (mobile) — currently free only because it is below the fold

**What.** `§Rules 185→704` desktop, `233→1296` mobile with 3 rules. It scores ~0 CLS today purely because
it sits at y≈2200 (desktop) / y≈2900 (mobile), outside the viewport, so the impact fraction is zero.

**Why it matters.** This is a geometry accident, not a fix. Retire the P2 above (collapse the injection
rows) and Rules moves up ~800px — straight into the viewport, where its +519px becomes payable. **Do not
land the Injections fix without also bounding Rules.** #815 already fenced the rules surface's own editing
CLS at 0.02 and recorded the fire-log skeleton mismatch (0.00613, 64–76% of an editing session) as an
owner-deferred redesign; this is the same term, seen from the tab's side.

**Receipt.** Sampler, §4; #815 closing comment (`1afc782d5`).

---

### \[P3] `[data-slot=collapsible-panel]` animates `height` — not compositor-clean, 9 layout-shift entries per collapse

**What.** `__orb.animations()` sampled through a Field-override collapse:
`[data-slot=collapsible-panel] props=height clean=false` (its sibling `[data-slot=collapsible-trigger]
props=rotate clean=true`). Each collapse emits nine discrete `layout-shift` entries as the height steps
down (472→398→375→346→337→331→326→323→319).

**Why it matters.** §4 "don't animate layout properties" — every frame is a layout pass, and the whole
subtree below re-lays-out nine times. It is free CLS-wise (click-adjacent) and this is the standard Base UI
Collapsible recipe, so this is a note against the `@orb/ui` primitive rather than against this surface —
but it means every collapsible on this 14-section pane pays a per-frame layout pass, and the pane has many.

**Receipt.** `snap --eval '__orb.animations()'` sampled at 30ms through the click, `reports/snaps/…cbcls-anim` log.

---

## 6. Retractions (mine and inherited)

1. **RETRACTED — "the sibling sections (Lorebooks/Documents/Macro picks) are the movers" (the #815 lead
   carried into #819).** They are the **victims**. Their own growth is +52/+88/−72px desktop and
   +19/+81/−104px mobile, worth ~0.019 combined. What removes them from the viewport is the Injections
   section's +831/+862px landing on top of them 260ms later. The CT that produced the lead measured them
   in *error states* with Injections stubbed out, which is exactly why they looked like the movers.
2. **DIAGNOSED — the B10 review's `__orb.motion().cls = 0.3263` is the context-panel dock, not the tab.**
   `div.shell-main` narrowing `[363,0,917,800]→[328,0,568,800]` scores **0.313612** in one entry, plus
   0.033576 for the transcript row reflowing into the narrower column and 0.000285 for the list's avatar
   row = **0.34747**. On the human path (a click on "Show detail panel") all of it is
   `hadRecentInput: true` and free; driven programmatically it is fully paid — and a whole-drive
   accumulator that navigated via `__orb.nav` / `snap --context-tab` / `--goto` banks it. The number was
   real; the attribution was the driver.
3. **RETRACTED — my own mid-run reading that the injection Content textareas have no accessible name.**
   I had probed `aria-label` only. They carry `aria-labelledby` → "Content"
   (`aria-label-attribute-is-not-the-accname` is exactly this trap). The tab's naming is clean.
4. **RETRACTED — my own mid-run reading that the tab panel is "bottom-anchored during the swap"**, from
   the shift's `previousRect [905,457,367,335]`. An rAF-rate sample refutes it: the panel is top-anchored
   at y=113 in every frame and simply grows 335→679px at the swap. The 0.065282 score is real; my
   mechanism was wrong.
5. **RETRACTED — my own mid-run note that motion-audit has no navigation flags.** It has `--goto`,
   `--open-chat`, `--context-tab`, `--open-character` (`tooling/src/motion-audit/ops/parse.ts:31-41`), and
   so does perf-meter (`tooling/src/cpu-profile/ops/parse.ts:161-162`).
6. **RETRACTED — design-audit's P1 `text-overflow` on the topbar chat title.** It is a false positive:
   the node computes `overflow:hidden; text-overflow:ellipsis; white-space:nowrap` with
   `scrollWidth 201 / clientWidth 116`, i.e. it *is* truncated with the standard affordance. The rule
   fires on `scrollWidth > clientWidth` without checking `text-overflow`. Filed as an instrument row in §9.

---

## 7. Taste & flow verdict (blunt, screenshot-backed)

**Does it look like shit?** The chrome does not — the kicker voice, the hairline rules, the
count chips, the field cards are all clean and consistent, and this pane genuinely reads as one
instrument rather than five merged tabs. **The proportions are the problem.** Look at
`reports/snaps/cbcls-click.png`: three tidy 40px override rows, then a wall. One injection occupies more
vertical space than the eleven sections above and below it combined can show. The pane does not look
designed at that point; it looks like a form dumped into a drawer.

**Does it flow weird?** Yes, in one specific way that is worth naming. The two adjacent sections at the
top of the pane express the *same* idea — "a per-chat override with a current state" — in two opposite
presentation laws. Field overrides: collapsed row + "inheriting" chip, expand on demand, three concerns in
120px. Injections: everything open, always, six stacked fields per row, ~370px each. A host reading top to
bottom learns the compact idiom in the first section and then immediately has it broken by the second. If
Injections wore the Field-overrides clothes, this pane would be roughly a third of its height and the
§5-P1 CLS finding would not exist.

**Cold-read (5-second test)?** Reasonable. "FIELD OVERRIDES / Empty fields inherit from the character or
preset. Saved automatically." is a genuinely good opening line — it names the mental model and the save
semantics in one sentence, and every section below it carries a comparable gloss. A first-timer would know
what the pane is for. What they would *not* know is that eleven more sections exist, because nothing at the
top says so and the second section hides them all. **A section index or a collapse-all is the missing
affordance**, though fixing the Injections proportion may retire the need for it.

**One home per concept (§13 IA lens)?** Clean, and notably so for a pane that merged five former tabs.
Every knob has exactly one home; the permission line (member-readable above, host-only inside "Host
controls") is legible from the layout alone; the foreign grafts (Rules, Plugin console) land last and in
the pane's own voice. I went looking for duplicated doors and found none in this tab. design-audit's one
`duplicate-action-door` P3 is in the transcript ("more message actions"), not here.

**Empty states.** Macro picks' empty state is honest and the silent-contributor collapse (Plugin panels
rendering nothing rather than an empty heading) works exactly as its header claims — no orphan kicker.
That is good work and should not be touched.

---

## 8. What's genuinely working (do not touch)

1. **Seven of the fourteen sections have a skeleton that matches their content exactly** — Background,
   Appearance, Storytelling, Reactions, Tool use, Field overrides, Plugin console all measure a 0px
   settle delta at both viewports. The shape-matched-skeleton discipline is real here; it has two
   defectors, not fourteen.
2. **Keyboard navigability is clean.** A live `--key Tab` walk from the tab trigger:
   `This chat` → tabpanel (`tabindex=0`) → `Main prompt, inheriting` → `Post-history, inheriting` →
   `Scenario, inheriting` → `Remove injection` → `In chat history (at depth)` → `System`, with
   `:focus-visible = true` at **every** stop after the programmatic first. Accessible names are present
   and correct throughout (`Depth`, `Content`, `Tool rounds per turn`, every switch labelled); the only
   unnamed inputs are Base UI's hidden 1×1 select/switch proxies, the known false-positive class.
3. **The silent-contributor collapse and the permission-OMIT layout.** Zero-surface plugin contributors
   render no heading and no gap; a member's tab simply ends after Macro picks. Both are load-bearing
   behaviours that a naive "just render the section" fix would break.

---

## 9. Instrument findings (the "fix tools as we find them lying" law)

| # | Instrument | Finding |
| - | - | - |
| I1 | `design-audit` | The `text-overflow` rule (impeccable origin) fires on `scrollWidth > clientWidth` **without checking `text-overflow: ellipsis`** — it minted a P1 against the topbar chat title, which is correctly truncated with an ellipsis (`scrollW 201 / clientW 116 / text-overflow: ellipsis / white-space: nowrap`). P2 per the standing rule: this is a P1-class false positive on a rule that will fire on every truncating label in the app. The honest rule is "truncated with no ellipsis AND no full-value affordance". |
| I2 | `motion-audit` | Correctly REFUSED (`verdict=INSTRUMENT-ERROR`, exit 2, "the frame population is ABSENT … 0 PipelineReporter frames"). Working as designed — but note for future briefs: its measured window opens **after** `reach`, so it structurally cannot see the settle CLS of the surface it just navigated to (`cls-raw=0` on a surface I measured at 0.145). Not a bug; a documented limitation worth restating in briefs that reach for it. |
| I3 | `snap` | **No CPU or network throttle flag.** The decisive measurement in this review — does the settle cross the 500ms `hadRecentInput` cliff under load — was unreachable from `snap` and cost 14 chrome-devtools MCP calls (well over the ~8 budget). A `--cpu-throttle <n>` / `--network <profile>` pair on `snap` would have made it one Bash call. Also of note: at 4× CPU **plus** Slow 4G the dev build never reaches `data-app-ready` within 60s (250 resources, unbundled ESM) — a dev-build fact, not a product finding. |
| I4 | `snap --fill` | `--fill` splits on the first `=` at bracket depth 0, so a `role=` engine selector can never be a fill target (`ARG ERROR --fill selector "role" can never match`). Workaround that works and is worth recording: Playwright's `:nth-match(textarea, 2)=value` — parentheses do not count as bracket depth. |

---

## 10. Instrument coverage table

| # | Instrument | Status |
| - | - | - |
| 1 | `snap --map` / `--aria` / `--eval` / `--key` walk | **RAN** — `reports/snaps/cbcls-*` (23 runs); keyboard walk §8.2 |
| 1b | `snap --contrast` | **SKIPPED** — the brief is a CLS-attribution measurement; no colour/contrast claim is made or relied on anywhere in this report |
| 1c | `snap --matrix` | **SKIPPED** — superseded by the explicit desktop + `--mobile` + 4×-CPU arms, which the matrix does not offer |
| 2 | `pnpm design-audit <route>` **and** `--mobile` | **RAN** — desktop: 1×P1 (retracted, §9-I1), 1×P2, 1×P3. Mobile: 3×P2 tap-target (verified real, §5), 1×P2 undersized-ui-text, 2×P3. `reports/design-audit/root.json` |
| 3 | `pnpm motion-audit <route> --open-chat --context-tab` | **RAN → refused** (`INSTRUMENT-ERROR`, exit 2) — not a verdict; see §9-I2. The static-surface CLS it would have reported is superseded by the buffered replay |
| 4 | `pnpm perf-meter --open-chat` | **RAN, partial** — the room-open step: 4 long tasks (total 484ms, worst 157ms), 91ms blocking in `commitRootWhenReady`, worst rAF gap 133ms. The tab-click step failed (`[aria-label="This chat"]` not visible — perf-meter's `--click` runs before the panel is docked; use `--context-tab` there next time) |
| 5 | Lighthouse (desktop + mobile) | **SKIPPED** — FOCUSED review, and axe/SEO/best-practices scores bear on none of the three named targets (attribution table, per-section verdicts, mobile arm). The a11y question this surface raises was answered directly by the live keyboard walk + accessible-name census |
| 6 | `__orb` suite (`.motion()`, `.animations()`, `.snap()`, `.renders()`) | **RAN** — `.motion()` cited throughout; `.animations()` produced the §5-P3 compositor finding |
| 7 | Console triage | **RAN** — see below |
| 8 | The PNGs, actually looked at | **RAN** — §7, `cbcls-tab2/click/mobclick/armA.png` |
| 9 | Keyboard walk incl. focus-visible at each stop | **RAN** — §8.2 |
| 10 | Appearance-preset arms (`defaults`/`maximal`/`compact`/`reading`/`diagnostics`) | **SKIPPED** — every finding here is a *height-delta* between a skeleton and its settled content. Density/typography arms scale both terms together and cannot flip the sign; the arm that actually moves this metric is viewport width and CPU, both of which were run. Stated as a deliberate scope call, not an omission |
| 10b | Theme arms (`--theme`) | **SKIPPED** — same reason; no finding here is colour- or polarity-dependent |
| 11 | Pane-state arms | **RAN, partially** — the context panel is the surface under review, so both `collapsed → docked` and `docked` steady state are measured (row 1 and rows 2–9 of §3), at desktop and mobile. The list-pane collapsed arm was **not** run: it changes CONTENT width, not the context panel's 367px, and §4's numbers are all inside the context panel |
| 12 | 4× CPU throttle arm (mobile) | **RAN** via chrome-devtools MCP — §3 row 9. This is the arm that decides the row |

### Console triage

| Message | Disposition |
| - | - |
| `[frame] long frame 145-152ms · blocking 95-102ms @ main.tsx` | **KNOWN-RULED** — dev boot compile; present on every run including the bare boot, absent from any tab interaction |
| `[perf] slow commit region:content 17-28ms (mount/update)` | **KNOWN-RULED** — room mount; boot-window only |
| `[drop] 60/101/84ms rendered frame mid-animation · [data-slot=weave-veil] / svg[aria-label=Orbweaver]` | **KNOWN-RULED** — the landing-screen weave animation during boot, not this surface |
| `[cls] shift 0.0221 unexpected · route /` | **ACCOUNTED** — the boot shift, §3 row 0. Pre-existing, off-target |
| vite-plugin-checker badge `❗8 ⚠0` | **NOT A PRODUCT FINDING** — the dev tsc/ESLint overlay. Two build lanes were live in their own worktrees during this drive; per house rule, attribute like any whole-tree signal. Zero `console.error` and zero page errors on every run of this review |
| Everything else | tRPC/bus round-trip logs, informational |

Zero `console-errors` and zero `page-errors` across all 23 snap runs. Not one run reported
`nav-actions-failed` or a degraded readiness on the unthrottled stack.

---

## 11. Issue-summary paragraphs for the board

**#819 (this row) — DIAGNOSED; the accumulator was the panel dock, and one section gets a fix row.**
Live buffered `layout-shift` replay of the "This chat" tab with real content in every section
(2 injections, 1 document, 2 lorebooks, 3 automation rules, Macro picks at its production-default empty
state), driven as the host Traveler on `:5173`. **The B10 review's 0.3263 is the CONTEXT-PANEL DOCK, not
the tab body**: `div.shell-main` narrowing `917→568px` scores 0.313612 in one entry (+0.0336 transcript
reflow, +0.0003 list row = 0.34747), and it is `hadRecentInput: true` — free — on the human click path,
paid only when a driver navigates programmatically. **The `contextTab` is not persisted**
(`shell-store.ts:90-93`), so no cold load lands on this tab and every settle shift is click-adjacent:
measured **0.00000 PAID** at desktop (0.14489 observed) and at mobile (0.46210 observed). **But the margin
is ~105ms and it breaks under load**: at 4× CPU on 430×932 the third settle wave lands **+795ms** after a
real tap and the host pays **0.30837 in one shift** (`§Documents 515h186>0h0` + `§Lorebooks 725h143>0h0`).
The single mover is **Injections**: `SkeletonRows count={1} shape="line"` (89px desktop / 105px mobile)
standing in for two ~370px expanded autosave forms — `89→920` desktop, `105→967` mobile. Positive control
in both directions: the same programmatic open with **0 injections** costs 0.01940 section-settle vs
**0.07961** with 2 — **4.1×** — with the 0.065282 tab-swap term byte-identical in both arms. **The #815
sibling-section lead is retracted**: Lorebooks (+88/+81px), Documents (+52/+19px) and Macro picks
(−72/−104px, its collapse confirmed live) total ~0.019 and are the *victims* pushed off-viewport, not the
movers; the CT rendered them in error states with Injections stubbed, which is why they looked causal.

**New row (P1) — bound the Injections section's reserved height.** Feed the count that
`InjectionsHeading`'s non-suspending query *already has in cache* into the fallback and give the skeleton a
form shape, or — better and cheaper — collapse an injection row by default to the same 40px
"summary + state chip" idiom the Field overrides section directly above it already uses. Receipt to demand:
skeleton within 10% of settled height at 0/1/2/5 injections at desktop and `--mobile`, plus a 4× CPU arm
showing no PAID entry after the click.

**New row (P2) — the pane's proportion and the two-idiom split.** With two injections the settled tab is
2,600px desktop / ~4,000px mobile, and at mobile the viewport ends mid-way through the *first* injection's
Depth field. Adjacent sections express one idea in two opposite laws: Field overrides = three concerns in
120px of collapsed rows; Injections = six stacked full-width fields per row, always open. Collapsing the
injection rows fixes the taste finding and the P1 CLS finding with one change.

**New row (P2) — coarse-pointer tap targets.** The three Field-overrides collapsible triggers are
**411×40** under `--mobile` with **no** `::after` touch-target expansion (`inset: auto`) and no ownership
of ±3px outside the box under `elementFromPoint` — verified real, not the known box-vs-hit-area false
positive. 4px under the 44px floor, on the tab's first three controls.

**New row (P3) — do not land the Injections fix alone.** `§Rules` under-reserves by **519px desktop /
1063px mobile** and scores ~0 today *only* because it sits below the fold. Collapsing the injection rows
moves it up ~800px into the viewport, where that becomes payable. Bound Rules in the same change. (Same
term #815 already fenced at 0.02 from the editing side, with the fire-log skeleton mismatch deferred to the
owner.)

**New row (P3) — Macro picks over-reserves.** `count={2}` (137/169px) resolving to a 65px empty state
makes the section *shrink*; content below jumps upward. `count={1}`, or render the empty state immediately.

**New row (P3) — `@orb/ui` Collapsible animates `height`.** `[data-slot=collapsible-panel]
props=height clean=false`; nine layout-shift entries per collapse, a full layout pass each frame. Free
CLS-wise (click-adjacent) and it is the stock Base UI recipe — but this 14-section pane is dense in
collapsibles, so it is worth a look at the primitive rather than at this surface.

**New row (P2, instrument) — design-audit's `text-overflow` rule is blind to `text-overflow: ellipsis`.**
It minted a P1 against the topbar chat title, which truncates correctly
(`scrollW 201 / clientW 116 / text-overflow: ellipsis`). The rule fires on `scrollWidth > clientWidth`
alone, so it will fire on every truncating label in the app. Per the standing "fix tools as we find them
lying" law this is P2 regardless of the surface finding's own priority.

**New row (P3, instrument) — `snap` needs `--cpu-throttle` / `--network`.** The measurement that decided
this row (does the settle cross the 500ms `hadRecentInput` cliff under load) was unreachable from `snap`
and cost 14 chrome-devtools MCP calls against a ~8 budget. Also record: `--fill` cannot take a `role=`
engine selector (depth-0 `=` split); `:nth-match(textarea, 2)=value` is the working spelling.

---

## 12. Proposed memory lesson

**Index line:**
`- [hadRecentInput window is a RACE](cls-recent-input-window-is-a-race.md) — a settle inside 500ms of the click is free at rest and PAID under CPU load; measure the throttled arm`

**Body:**

> A layout shift within 500ms of a real user input carries `hadRecentInput: true` and is excluded from
> CLS. That makes an unthrottled click-path measurement of a "settles after you click it" surface
> structurally optimistic: it reports **0.000 paid** and says nothing about the risk. The number that
> matters is the **latency of the LAST settle wave relative to the click**, and the arm that reveals it is
> CPU throttling.
>
> Measured 2026-08-30 (#819, lane cb-cls-attrib), the "This chat" tab body: real click, unthrottled →
> waves at +80/+110/**+384**ms, **0.00000 paid** (0.14489 observed). Same real click, mobile 430×932 at
> **4× CPU** → the third wave slips to **+795ms**, past the cliff, and the host pays **0.30837 in one
> entry** — 3× the bar. Nothing about the surface changed; only the margin did.
>
> **How to apply:** (1) a "0 paid CLS" verdict on a click-triggered surface is incomplete without the
> per-wave latency AND a throttled arm — report the margin to 500ms, not just the paid total;
> (2) `snap` has no throttle flag today, so this needs chrome-devtools MCP (`emulate cpuThrottlingRate`)
> — and note 4× CPU **plus** Slow 4G never reaches `data-app-ready` on the dev build (250 unbundled ESM
> resources), so throttle CPU alone; (3) a synthetic `el.click()` is untrusted and does NOT set
> `hadRecentInput` — only a real CDP input dispatch (Playwright `--click`, MCP `click`) reproduces the
> exclusion, so a script-driven "click" silently measures the programmatic arm.
> Related: \[\[buffered-layout-shift-replay]], \[\[controlled-popover-close-bypasses-onopenchange]]
> (the saturation half — mount WIDTH is the dial, not row count).
