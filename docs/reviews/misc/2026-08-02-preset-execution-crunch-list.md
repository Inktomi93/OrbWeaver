# PRESET-1 — mock-vs-rendered execution crunch list (orchestrator pass, 2026-08-02 night)

> **WAVE STATUS (08-02 ~23:30): P0 ITEMS 1+2 VERIFIED FIXED LIVE** — post-merge real-pointer
> probe (CDP, owner's Chrome): 14 dispatches across the New-preset name edge → over:3/out:2/
> mut:0 (pre-fix: 1,727 pairs @ ~85/s). Lanes A-F ALL MERGED @ `7689b5aa`+ — nearly every item
> below is landed or refuted; the AUTHORITATIVE per-item state is the lane reports + the
> workboard wave block. Remaining: full strike-pass of this doc, side-eye RE-VERIFY
> (desktop+mobile; incl. F's CD2 box-in-box + chip-radius flags), close-out D-entry,
> graduation verifier → docs/history. Owner's morning mouse = final confirmation.

> **CLOSED (2026-08-03, lane POLISH): 36/36 ACCOUNTED — ZERO OPEN ROWS.** The strike pass's last two
> holdouts landed together in `8af6626e`: item 14's `{{macro}}` token pill goes `tone="soft"` (the
> mock's `.tok` tint + hue-text, palette untouched per the owner ruling) with a computed-style CT,
> and O-2's provenance chip is reworded in place to the readout's `resolved for <model>` grammar off
> ONE shared `resolvedForLabel` (home KEPT — §16 sanctioned echo). This doc is GRADUATION-READY: no
> row needs re-verifying before it moves to `docs/history`.
>
> **STRIKE-PASS SUMMARY (2026-08-02, lane STRIKE):** 34 struck w/ receipts — items 1,2,3,4,6,7,8,
> 9,10,11,12,13,15,16(chip-cue half),17,18,19,20(pre-struck, confirmed),21,22-arm2 (19 items) +
> O-1,O-3,O-4,O-5,O-6,O-7,O-9,O-10,O-11,O-12,O-13,O-14,O-16,O-17,O-18,O-19 (16 rulings, incl. the
> P0-root-cause paragraph closed under item 1/2's fix). The 2 then-open rows — O-2 (provenance chip
> never reworded/rehomed) and item 14 (kind chips + rack glyph discs + budget-bar hue fixed/
> sanctioned, but `{{macro}}` token pills in `macro-text.tsx:59` still rendering full-saturation
> `intent="info"`, contradicting the lane-C commit message's "quiet mono" claim) — are CLOSED above.
> 4 superseded/refuted — item 5
> (superseded by O-18), item 16's Post-history-badges half (refuted: neither flag is set on any
> live preset), O-8 (refuted: depth input round-trips fine, live probe + CT), O-15 (owner ruled
> no action needed), item 22-arm1 (refuted: the "navy pane" was the orchestrator's own DevTools
> chrome, not app paint). Zero un-annotated rows remain.

Rendered on the live dev stack (main @ `7c312220`, wide 1920, preset "New preset" on
anthropic/claude-sonnet-5) via `pnpm snap --goto presets`. Receipts: rendered `reports/snaps/mvr-*.png`,
mock crops `reports/snaps/preset-mocks/` (INDEX.md maps crop → surface; sanctioned deviations listed
there — none of them are re-flagged below). Owner verbatim: "it looks kinda crunchy." He's right.
This is the you-fucked-up-on-execution list; the fix lanes brief FROM this.

## P0 — the owner's live defects, mechanism now pinned

**1. LIST hover render loop — CONFIRMED conditional-mount swap.** Owner console (real mouse, 21:02):
`pointerover/out` alternate between `<span class="block…">` (row name) and `<button class="group…">`
(row body) with every leave-target reported **(detached)**, ~200ms handler cost per flip. Hover
REMOUNTS row content (Active badge ⇄ action cluster, title-line width changes), the real pointer
re-fires on the freshly-mounted node, which re-renders again → oscillation, worst at the name's edge.
`mvr-list-hover.png` shows the swap: at rest the row carries the amber **Active** badge
(`mvr-list-rest.png`); on hover the badge is GONE and ⚡/copy/kebab mount in its zone.
**Headless synthetic hover cannot reproduce** (`--hover` + `--watch` + `__orb.renders()`: region
counts flat — Playwright doesn't re-fire pointerover when DOM swaps under a stationary pointer).
That is why every CT is green while the live surface loops. Fix + regression proof:
- Both badge and cluster PERMANENTLY MOUNTED; reveal = opacity/visibility only. Zero conditional
  mount, zero width change on the title line (reserve `max(badge, cluster)` width).
- Verify with a REAL pointer (chrome-devtools MCP / CDP mouse-move series), not a CT.

~~1.~~ ✅ `5978fddf` The `display:none` swap (`ROW_REVEAL_SWAP`) is gone from the row; the badge
becomes a permanently-mounted filled dot (O-1) in a reserved trailing slot, cluster stays in-flow —
geometry is byte-identical rest vs hover, so the CSS hit-test oscillator has nothing to reflow
against. Real-pointer verification is the doc's own P0-ROOT-CAUSE section's REGRESSION PROOF, not
re-run here per doctrine (no browser tooling in this pass).

**2. LIST reveal cluster is jank (owner verbatim), and it hides state.**
- The activate affordance renders as a FILLED AMBER LIGHTNING BOLT — reads as a one-shot zap
  action, not the mock's pressed toggle-dot (`list--pane-presets.png` + the toggle-semantics note
  crop). It also has no visible relationship to the Active state it toggles.
- The three glyphs are weight-mismatched: heavy filled bolt vs hairline copy/kebab, no shared
  hit-target chrome, optical sizes differ.
- The Active BADGE VANISHES exactly while you inspect the row — the P4 receipt's own invariant was
  "state rides a title-line Active Badge" with the toggle at rest="never"; the badge must SURVIVE
  hover. (Bolt→FillableIcon fill-axis is already queued in icon-seal adoption — fold, don't fork.)

~~2.~~ ✅ `5978fddf` (superseded by O-1) The text Active badge is retired; state is a persistent
lucide `FillableIcon` dot (`Circle`, `fill="solid"` when active), painted at rest, hollow-and-
reveals-with-the-row when not — the ⚡ one-shot bolt is gone. Survives hover by construction (it's
the permanently-mounted element, not a conditional swap).

## P1 — structural execution misses

**3. The 720px column is LEFT-PINNED in the content pane — the "crunchy" root.** Header band spans
full width, the deck clamps at ~720 hard left, everything right of it is dead void (half the pane at
1920 — `mvr-params-content.png`, `mvr-actions-content.png`). Self-inflicts item 8's truncation.
The mock's 720 was its PANE width, not a clamp-inside-a-wider-pane. Needs ONE ruling for all five
views: center the column, or let it breathe to a responsive max-width. Check the app's other
content-pane editors for the house convention before ruling. MEASURED LIVE (owner: "everything
just… stops at a certain point" / "prompt stuff and etc just squishes itself in"): ALL FIVE
tabpanels carry the SAME `max-width:720px` child, leftGap 0, rightGap 238-248 at a 958-968 pane
(probe table: Params/Prompt/Actions/Data/Transforms identical) — one shared wrapper, one fix.
In focus mode at full width the void is ~800px. OWNER NUANCE: "looks okay when both panels are
out, but when you close them it looks awful" — the ruling must hold across pane widths ~960 →
full-bleed (a centered/responsive column degrades gracefully; a left-pinned fixed clamp cannot).

~~3.~~ ✅ `45cf001d` One shared wrapper across all five tabpanels, centered (`character-editor-
surface.tsx` convention) and breathing to `--width-content-col-wide` (56rem) once the pane clears
@5xl — exactly the panels-collapsed/focus-mode regime the owner called out. Also closes item 8's
truncation (the void that starved it is gone).

**O-19 ★ PRESETS OPENS WITH LIST + CONTEXT DOCKED.** The section currently opens without the
list/context panes; the section-registry default for Presets becomes list=docked +
context=docked (the surface is unusable without the list, and the readout IS the product).

~~O-19.~~ ✅ `56881c9f` `presetsSection.panelDefaults` set to list=docked + context=docked; landed
in the same commit as item 20's focus-mode fix.

**4. Switch grammar split — the rack ON/OFF ambiguity is BACK (or never died live).** Params'
Reasoning switch = amber-ON (correct, the app convention). Every RACK switch renders pale-gray
track + white thumb both states — ON vs OFF differ only by thumb side (`mvr-rack-content.png`;
same gray in Transforms + drill-in headers). The side-eye's "rack ON/OFF indistinguishable" was
marked fixed in the fix-all; rendered truth says otherwise. One switch grammar, amber-ON, everywhere
on this surface. (This smells like the tailwind-merge custom-token override class — verify the fix
actually lands in COMPUTED style, assert computed color in the CT.)

~~4.~~ ✅ `45cf001d` Rack + drill enable switches drop `tone="quiet"`, KnobRow's explicit slider
drops `tone="neutral"` — both adopt amber-ON, pinned by computed color in both states (per the
tailwind-merge-custom-token lesson this row itself named).

**5. Quality strip execution.** Selected "Deep" = thin amber outline only (mock: the selected
segment is visually FILLED/darker). The mapping gloss wraps into two stacked mini-lines UNDER the
strip and drops the temp value; mock renders one inline line beside the strip
("deep → effort high · temp 1.0 — explicit knobs below override this").

~~5.~~ SUPERSEDED by O-18. `45cf001d` The segmented strip (and its selected-fill question) dies
entirely — Quality becomes a dropdown; the surviving gloss half (temp value inline, one line) is
fixed in the same commit.

## P2 — row-level execution deltas

**6. List subtitle grammar dropped the KIND.** Mock: "generation · forked from Default …",
"generation · edited 3d ago". Built: bare "edited 2h ago" (`mvr-list-rest.png`). The kind vocab
exists (registry, G7 chips) — thread it into the row subtitle.

~~6.~~ ✅ `5978fddf` "The kind leads every row subtitle again" — thread-through confirmed in the
commit message and diff.

**7. Kind-chip inconsistency in Actions.** `format` chip renders FILLED blue while
steer/voice/studio/nudge are outlined (`mvr-actions-content.png`) — nothing semantic justifies the
odd one out. One chip grammar.

~~7.~~ ✅ `c4844496` "One kind-chip grammar (outlined neutral, killing the odd filled-blue
`format`)".

**8. Truncation everywhere in Actions.** Descriptions and template previews cut at ~20-30 chars
("[Take the following into speci…") while half the pane is void — falls out of item 3; verify the
previews recover once the column ruling lands.

~~8.~~ ✅ `45cf001d` (item 3 fix) + `ed90cd59` (F-7, pre-dating this doc) — the void that starved
the previews is gone (item 3) and the mono preview cell that clipped to a fixed ~30 chars was
deleted outright (`actions-view.tsx:160-166`, "the row's width now goes to the scent" — template
text's homes are the drill-in + readout only).

**9. Number formatting split inside one deck.** Max output "1,500" (locale) vs Max context "200000"
(raw) — same KnobRow family, two grammars (`mvr-params-content.png`). Mock uses raw mono. Pick one.

~~9.~~ ✅ `45cf001d` "ONE number grammar — raw, ungrouped digits across the deck".

**10. Template drill "At depth" NumberField clips its own ghost** ("0 — the t…",
`mvr-drill-template.png`) — inline size too narrow for the ghost copy; widen the box or shorten the
ghost. Same drill: section drill's DELIVERY row (Spoken-as ↔ Inject-at-depth) is misaligned —
label baselines and input widths don't form the mock's two-column row (`mvr-drill-section.png`).

~~10.~~ ✅ `c4844496` (ghost half, tied to O-14: "depth ghost shortens to `0 · tail`") +
`303638ee` ("the DELIVERY row is ONE row — the hint trigger stops costing 16px, and a deliberate
pair stops collapsing").

**11. Readout pane header is generic "Details".** Mock names what it reads ("ACTIONS · READOUT").
With per-view swapping content, name the view in the pane header (`mvr-readout-*.png`).

~~11.~~ ✅ `c4844496` "The CONTEXT band names its projection ('Prompt · readout'), via a new
optional `header` slot on the `single` context arm".

**12. Actions readout is ~90% void.** DELIVERY PATH renders; the D8 binding chip + resolved preview
are QUEUED post-P5 (sanctioned) — but until they land, ship the honest placeholder arm naming what
arrives ("resolved preview appears when a chat is bound") instead of dead space
([[empty-states-are-load-bearing]]).

~~12.~~ ✅ `c4844496` honest Resolved-preview placeholder arm shipped; D8 itself (the real binding
+ chip) landed separately (`6b11ea7a`, `607d7e94`), so the void is gone either way.

**13. Header title de-emphasized.** "New preset" renders at body weight/size; mock gives the name
title weight. The truth chips (Active + model) are right.

~~13.~~ ✅ `45cf001d` "the editor header's preset name gets title weight/size" — confirmed live in
`preset-editor-surface.tsx:318` (`<Heading level={2}>` replacing the old `voice="label"` `<p>`).

## P3 — polish / taste flags (fix-all law says these get fixed too)

**14. THE BLUE PROBLEM (cross-cutting).** Rack glyph discs (saturated blue circles — the
"glyph-disc noise" RENDERED-WRONG row still reads loud; Post-history amber vs everything-else blue
= accidental two-tone), Actions kind chips, macro token pills ({{input}}/{{person}} bright blue),
Prompt-readout budget bars (blue fills) — a blue/steel family the mocks don't paint (mocks: neutral
dark tiles, quiet chips, ONE blue SETUP kicker + green on-chip). Rule it once: either blue IS the
preset-surface info hue (then mute + apply consistently) or it's drift (re-tint neutral/amber).

~~14.~~ ✅ CLOSED. Kind chips fixed (item 7, `c4844496`); rack glyph discs muted to a 15%
tint (`ed90cd59` F-17, `section-row.tsx:183` — "15% tint + hue text IS the mock's `.glyph`
treatment"); budget-bar/SETUP-kicker blue is the doc's own sanctioned deviation ("ONE blue SETUP
kicker" — `prompt-readout.tsx:80`, zone-hued track by design). The macro-token pill closed last, in
`8af6626e` (lane POLISH): `macro-text.tsx` chips now carry `tone="soft"` — the mock's own `.tok`
treatment (a ~15% info tint + the info hue as TEXT, `context-readouts.html:73`), the same grammar the
glyph discs wear, so the surface speaks ONE muted-info dialect. The palette is untouched per the
owner ruling (`--color-info` stays blue; the fix is the pill's rendering). `@orb/ui` Badge's in-flow
arm also stopped drawing a border box in any tone — a border on an `inline` box is real horizontal
advance and would have re-opened the F-6 punctuation gap; `size="inline"` has exactly one consumer.
Proof is COMPUTED, not authored: `tests/client/features/preset/components/macro-text.ct.tsx` (4
tests) pins the receded fill, the resolved `--color-info` text, zero border width, and the inherited
mono face; red-first against the pre-fix tree failed with `background-color: oklch(0.7 0.1 232)` and
`color: oklch(0.2 0.03 232)` — the solid token pair, exactly as this row described it.
**SUPERSEDES the lane-C claim:** `c4844496`'s "macro token pills go quiet mono" was prose-only (zero
diff hunks in `macro-text.tsx`, confirmed twice + archaeology); `8af6626e` is the real diff.

**15. Rack token counts cramped** — ~30/~4/~— tiny and tight against the toggles; mock gives a
dedicated right-aligned mono column with air.

~~15.~~ ✅ `c4844496` "the ~token estimate takes a fixed-width right-aligned tabular-mono column".

**16. Missing rack cue badges.** Guided instruction lacks "steered turns"; Post-history lacks
lock + custom (mock draws them; registry carries fires-on + position-lock — the metadata exists).

~~16.~~ ✅ PARTIAL/refuted-remainder `c4844496` — "the registry gains ONE fixed-by-product firing
cue (`guided_instruction` → 'steered turns')" (fixed); the Post-history lock+custom half is
REFUTED WITH RECEIPTS in the same commit: "Post-history lock/custom pills are only-when-set by the
mock's own note, and the live preset has neither flag set" — nothing to render, not a defect.

**17. Built-in lock placement.** Mock: lock inline LEFT of "Default" (a property of the name).
Built: far right edge (reads as an action slot) — and see item 19: it collides with the reveal.

~~17.~~ ✅ `5978fddf` "the built-in's lock moves to the leading slot, inline-LEFT of the name... it
no longer stacks under the revealed cluster at the row's end".

**18. Cluster wrapper paints its OWN box on hover** (owner-spotted live, CDP-held-hover zoom
receipt): the [⚡ · dup · kebab] cluster sits in a distinct darker rounded panel ON TOP of the
row's hover tint — box-in-box double highlight. Kill the wrapper background (glyphs ride the row
tint) or make it seamless with it.

~~18.~~ ✅ `5978fddf` cluster now sits IN FLOW in the reserved `LibraryRow.actionsReserved` strip;
"that also kills item 18 (the float's own `bg-accent` panel — the box-in-box double highlight)".

**19. Non-active/built-in trailing-slot COLLISION** (owner-spotted live, zoom receipt): on
Default's hover the lock rest-marker STAYS and the ⚡ bolt renders overlapping/below it —
vertical stack, off-center, half-clipped. The trailing slot has no single reserved geometry for
rest-marker vs reveal. Same family as the P0 swap: one reserved trailing slot layout, marker and
cluster co-exist in it (marker inline-left of the cluster, or marker yields via opacity in a
FIXED box) — never stack, never `hidden`.

~~19.~~ ✅ `5978fddf` (same commit as item 17) — lock moved to the leading slot, disjoint from the
trailing cluster; no stack, no collision.

**O-1 nuance (owner, after seeing it live):** "don't hate the active thing now that I understand
it" — the ⚡ activate-toggle CONCEPT survives; the dot-for-state ruling and the bolt's
weight/centering fixes stand as written.

~~O-1 (incl. nuance).~~ ✅ `5978fddf` filled `FillableIcon` dot (persistent, in the reserved
trailing/leading slots per items 17-19), ⚡ bolt retired as the state marker; the activate-toggle
CONCEPT (a `Zap`-icon Activate affordance for the not-active arm) survives per the nuance, visible
in `preset-editor-surface.tsx:331-334`.

**~~20~~ LANDED (`56881c9f` FF-merged, main check-certified post-merge).** Root cause was DEEPER
than diagnosed: NO focus flag existed — "focus" was DERIVED from "both panels collapsed" (which
narrow auto-collapse also produces) while being IMPLEMENTED by writing collapsed into
panelOverrides. Fix: `focusMode` = one transient flag, a regime input to resolvePanelMode,
ZERO writes (the untouched overrides map IS the restore state). Approved solo calls: reveal-write
leaves focus / hide-write doesn't (protects chat-selection + drill-close flows); no-snapshot
derivation (less state than the brief's literal snapshot). O-19 landed same commit (Presets opens
list+context docked; stored overrides still win). Red-first CTs; ShellLayout.immersive DELETED.
DEFERRED SMALL: `__orb.shell()` should expose `focusMode` (the owner's own receipts came from that
handle). LESSON (memory-worthy): a presentation mode must never be re-derived from the state it
produces. Original finding:
**20-orig. FOCUS-MODE STATE DESYNC — reproduced live with __orb.shell() receipts (owner report:
"at certain window sizes focus mode doesn't bring the side panels at all"). NOT width-gated —
a state bug.** Repro at constant viewport: enter focus → exit (panels RETURN but the button
STILL reads "Exit focus mode" — flag stuck ON) → click "Exit focus mode" → panels COLLAPSE
(exit *enters* the focus look) → click again → NO-OP: panels stay collapsed, label stays "Exit
focus mode". Terminal state: `shell().panels` both `collapsed` + label "Exit focus mode" + pane
DOM boxes still report width (CSS-hidden). Three sources of truth disagree: the focus flag, the
button label, and the panel dock-modes. Narrow-arm auto-collapse writes panel modes behind the
flag's back, and exit-focus restores only what it thinks it collapsed. FIX: focus = ONE derived
presentation state — exit restores the saved pre-focus modes, label derives from the same flag,
auto-collapse never writes into the saved state. NOTE: shell-tier bug (not preset-specific) —
likely reproducible on every section; sibling of the HUD-H1 ≤1024 dead-toggle class.

**22. NARROW-BAND OVERLAY PANELS ARE UNDRESSED (owner screenshot receipt, ~960px CSS,
Pictures/Screenshot from 2026-08-02 00-17-35.png — SHELL-TIER, both panes, every section):** in
the 48-64rem band the list/context panes flip to overlay mode but render with docked-pane
clothing — NO backdrop scrim, NO elevation shadow, an orphan amber top edge, and the content
behind stays full-width-laid-out so controls clip mid-element at the panel boundary (Quality
segmented + selects cut in the receipt). Reads as broken, not as a sheet. Owner verbatim:
"panels become not full height and act kinda strange." FIX SHAPE: overlay mode gets real sheet
affordances (scrim + shadow + full-bleed height from topbar) OR the band's content re-lays-out
(true docked shrink); either way the two modes must be visually unambiguous. Same band as the
focus-mode desync family. → the side-eye round leads with this after the two P0s.
ADDENDUM: owner's live repro viewport = **418×634** (mobile band). Orchestrator could NOT hold
that width (WM floor ~514); at 514×635 and 616×635 the mobile arm measures CORRECT (fixed panes
48→579, tab bar 579→635, scrollH=vh). So the defect is pinned to <~500px width OR a
zoom/visual-viewport interaction (fixed+vh drift under zoom≠100% — owner asked to check).
**~~REPRODUCED~~ CORRECTED (Lane H debunk, receipts accepted): the "navy pane" in
reports/snaps/item22-418x634-navy-pane-repro.png was the ORCHESTRATOR'S OWN DevTools chrome
inside the emulation screenshot** — the icon rail's glyphs don't exist in our icon seal, and
H's real device-emulation sweep (418×634, all 8 sections × both panes) measured every panel
correct with the app sidebar token painting. LESSON: a devtools-emulation screenshot includes
the devtools window; identify foreign chrome before calling it app paint. THE OWNER'S 418×634
SIGHTING REMAINS OPEN-UNREPRODUCED (his morning re-look or side-eye owns it); ARM 2 (the
48-64rem undressed overlay, owner screenshot) STANDS and Lane H is fixing it on the real
mechanism (.shell-scrim exists, gated on layout.scrimVisible — H verifying why it doesn't
paint in-band). NEW out-of-lane find (H): worldInfo's CONTEXT pane body is genuinely EMPTY at
every width, no empty-state arm — [[empty-states-are-load-bearing]] class, world-info feature;
boarded as a small. Original (retracted) claim: Geometry LIES CLEAN (panes fixed
48→578, scrollH=vh) while PAINT is broken: the context pane renders as an EMPTY NAVY column
(wrong/unthemed background token — not the app's warm dark), its tab strip rotated into a
vertical icon rail down the LEFT edge with a close-X at bottom, body blank, the bottom tab bar
buried beneath it, the content explainer banded above. Suspects: a panel background token that
only resolves under the docked/overlay arms (theme-null-origin class?), the tab strip's
orientation styles keyed to a container that collapses at this width, and the takeover arm
mounting without its body. NOT zoom, NOT height math. Repro recipe: devtools emulate 418x634x1
→ nav presets (no selection; persisted panel-open state). Owner screenshot (960-band, clipped
controls under an undressed overlay) is the OTHER band's arm of the same item.

~~22-arm2 (48-64rem undressed overlay).~~ ✅ `c2bb5b94` "narrow-band overlay panels wear real
sheet clothing" — `--shadow-overlay` on overlay mode (the house drawer/dialog/toast recipe:
scrim+shadow), floating context pane's docked-adjacency ember edge, content column goes `inert`
behind the scrim (keyboard trap fixed too). Red-first CTs cited (box-shadow "none"/inert null on
HEAD~).
~~22-arm1 (owner's 418×634 sighting).~~ REFUTED WITH RECEIPTS `c2bb5b94` — "that receipt is a
browser window with devtools docked below an emulated viewport — the vertical icon rail is
devtools' own collapsed toolbar. A 418×634 dpr1 device-emulated sweep of all 8 sections × both
panes paints and measures clean." Not a code defect.

**21. Params typography census — the "font colors and weights all over the place" receipt
(visible-only probe, Params deck): 7 distinct color·size·weight tuples on one deck.** Worst two:
(a) "Between 1 and 64,000" BOUNDS-HELPER text renders 15px bright-white 400 — LOUDER than the
13px/500 labels it annotates (hierarchy inversion; helpers must be quieter than their labels);
(b) TWO near-identical whites — `oklch(0.955 0.004 75)` everywhere vs `oklch(0.96 0.004 75)` on
the selected "Deep" — token drift, not a choice. Full zoo: kickers 10.5/600 muted · gloss
10.5/400 muted · labels 13/500 bright · select values 13/400 bright · bounds 15/400 bright ·
quality options 15/500 muted · selected 15/500 off-white. Rule the scale (kicker/label/value/
helper tokens), collapse the two whites, and the bounds text drops to helper voice.

~~21.~~ ✅ `45cf001d` scale collapsed to four tuples (kicker/label/value/gloss), the two whites
now both reference `--color-foreground`; the "bounds helper 15px bright-white" row is retracted as
a probe artifact (the node is `sr-only`, invisible on screen — no restyle needed).

## OWNER LIST (2026-08-02 night) — merged; ★ = owner RULING that overrides mock/receipt

**Confirms items above:** switches off-palette (item 4) · sliders WHITE, off-palette too — extend
item 4 to one control-color grammar (switch + slider + toggle) · Quality strip "looks like hot
fetid ass **and is on the wrong side**" (item 5, escalated + placement) · drill DELIVERY
misalignment both drills (items 10/21) · Actions tab "not as clean as the mockup" (items 3/7/8).

**O-1 ★ LIST ACTIVE = FILLED DOT, not the text badge.** "We literally set up lucide so we could
use fills" — the P4 receipted badge arm is OVERRULED: active state renders as a filled lucide dot
(FillableIcon), persistent on the row; the hover cluster reveals BESIDE it. Folds into P0 item 2's
fix (and the icon-seal client-adoption queue).

~~O-1 (list echo).~~ ✅ `5978fddf` — same fix as the P0 item-2 strike above; the FillableIcon dot
is the one implementation for both.

**O-2 "for anthropic/…" chip is MISLEADING** — it shows the CURRENT resolved connection model, but
reads as "this preset is for xyz". Reword/re-home the provenance (readout owns resolution truth).

~~O-2.~~ ✅ `8af6626e` (lane POLISH) — REWORD, home KEPT (orchestrator ruling, arm b). The chip now
reads `resolved for {model}`, the CONTEXT readout's own grammar for the same fact
(`readout-parts.tsx`, `EffectiveProfile`), which kills the "this preset is FOR anthropic/…"
misreading: the preset is for nothing, it resolves against whatever chat model you currently have.
It KEEPS its header home — this is the §16 sanctioned-echo class (the readout owns resolution truth;
the header carries a justified echo because the CONTEXT panel is away on narrow and closable
everywhere, and deleting the chip would silently revert a landed G7 affordance). The two spellings
that let the drift in are now ONE: `resolvedForLabel` in `lib/effective-knobs.ts`, beside the rung
vocabulary the same read's other glosses already share, called by both surfaces. Proof is the
rendered text, red-first: the G7 provenance CT in `preset-editor-surface.ct.tsx` was flipped to the
new grammar and failed against the pre-fix tree before the source moved.

**O-3 Import button (list header) has no tooltip** — icon-only, aria-label exists but sighted users
get nothing on hover.

~~O-3.~~ ✅ `5978fddf` "the header Import icon button gets a `title` tooltip (same string as its
aria-label)".

**O-4 ★ Compaction mode value too long** ("Default — Managed — summarize into…") — shorten the
option label; long explanation moves to hover/info.

~~O-4.~~ ✅ `d294c7c5` option labels are now bare mode names ("Managed"/"Auto"); the "what it does"
copy moved to the row's hover hint.

**O-5 "MEMORY MARKER" IS A VOCAB LIE — VERIFIED.** Compaction writes `chats.compactSummary` +
`compactedAtSeq`, its own chained summary marker spliced into the top history slot
(`domain/chat/verbs/compaction.ts:1-9`); it NEVER feeds the Memory plane (rack "Memory" =
remembered past events, a different system). The copy at `params-limits.tsx:198,221,246` says
"memory marker / durable portable memory" — rename to summary/compaction marker, all three sites.
Verbatim-tail's MECHANIC is correct (newest N stay literal); only the noun lies.

~~O-5.~~ ✅ `d294c7c5` "all four preset-side copy sites now use the domain's own noun" (compaction-
mode hint, verbatim-tail hint, auto-mode honesty gloss, mode label).

**O-6 Summary instructions textarea shows no default** — the RP-tuned default must GHOST in the
box (the GhostValue law's textarea arm, missed).

~~O-6.~~ ✅ `ed90cd59` (F-11, landed before lane B/C dispatch) "the RP-tuned compaction default
ghosts".

**O-7 ★ Rack row explainer prose → hover.** The inline "your core system instruction" descriptions
are owner-ruled lame; move to hover/title on the name. (Overrides the mock's inline-desc drawing.)

~~O-7.~~ ✅ `c4844496` "The rack row's explainer prose moves to the name's hover (`fullTitle`)".

**O-8 Inject at depth is STUCK at "in flow"** — dead input, can't set a depth. Functional defect,
P1.

~~O-8.~~ REFUTED WITH RECEIPTS `c4844496` — "does not reproduce: typing round-trips to the form
(CT) and persists across a reload (live probe on main); what the owner met was the clipped ghost +
a depth field offered on a Relative section, both of which O-9 removes."

**O-9 ★ ZONE VOCAB + CONDITIONAL FIELDS.** Zone options change: POST → "In Chat"; the model is
Relative (ordered among prompts) vs In-Chat @ depth. Depth + Order render ONLY when zone = In Chat.
(Spec §5 zone table needs the amendment; supportsArrangement stays schema-derived.)

~~O-9.~~ ✅ `c4844496` "Depth + Order therefore render ONLY on the In-Chat arm... moving back to
Relative CLEARS the splice".

**O-10 ★ "Spoken as" → "Role"** (section drill) and **"Delivered as" → "Role"** (template drill).
One vocab.

~~O-10.~~ ✅ `c4844496` "'Spoken as'/'Delivered as' → 'Role', both drill-ins + the readout datum".

**O-11 ★ TRIGGERS = dropdown multi-checkbox**, not the segmented strip. (Overrides the mock's
segmented drawing.)

~~O-11.~~ ✅ `c4844496` "Triggers becomes a multi-check dropdown (the `multiple` Select's own check
idiom)".

**O-12 Drill-in missing OVERRIDES block at the bottom** — verify against spec §5/§7 what the
overrides section carries and build it.

~~O-12.~~ ✅ `c4844496` root cause was a dead gate (`"forbidCharacterOverride" in section` matched
no real preset); "the gate is now the schema ARM that declares them".

**O-13 "Delivers via Guided instruction" button DOES NOTHING** — dead affordance on the Actions
header. Either it becomes the real door (select the Guided-instruction row in Prompt — the readout
note already promises "clicking the name selects that row") or it dies.

~~O-13.~~ ✅ `c4844496` "`openSectionInPrompt` (preset-nav) does both halves — view + selection —
through the same two store actions".

**O-14 Template drill At-depth ghost invisible** — confirms item 10 (clipped ghost); owner saw
stray "next" text in the field.

~~O-14.~~ ✅ `c4844496` (same fix as item 10) "the depth ghost shortens to `0 · tail`".

**O-15 noted, no action:** Guided instruction toggleable in the rack — owner grumble, stands
("I guess it's fine").

~~O-15.~~ CLOSED AS-INTENTIONAL — no code change; owner ruling stands as written, nothing to fix.

**O-16 ★ EXPORT DOUBLE-HOME OVERRULED.** Export in the list-row kebab AND the content-header kebab
is dumb (owner). The fix-all SANCTIONED that echo (§16 rows 7+27 "header-Export echo") — overruled:
ONE home, the list-row kebab (matches the characters/chats ruling: lifecycle lives list-side).
Remove Export from the editor-header kebab; §16 rows 7+27 revert.

~~O-16.~~ ✅ `c4844496` — confirmed live: `preset-editor-surface.tsx:46` "`Download` is GONE with
the header Export door (O-16★ — one home, the list-row kebab)".

**O-17 ★ Prompt-view tail clusters → TRANSFORMS.** Delivery (Speaker names · Continue delimiter)
and Collapsing (Adjacent-role merging · "This model enforces at least Strict — stricter always
wins" · Squash system notes) move out of Prompt into Transforms (owner: they're wire-shaping, not
prompt content). Spec §5 concept-sort text amends with it. (Recorded counterpoint, not argued:
the spec homed Delivery under Prompt as "how sections speak"; owner sort wins.)

~~O-17.~~ ✅ `c4844496` "DELIVERY + COLLAPSING MOVE TO TRANSFORMS... They lead that view, above the
prompt-side regex lanes"; follow-through cleanup in `824071ab` (dropped now-unused capability prop
from the Prompt view's call site) and `713fcbcc` (dead export removed).

**O-18 ★ QUALITY = A DROPDOWN, with an OFF arm.** The Fast/Balanced/Deep segmented strip dies;
Quality becomes a select whose options include "don't use quality" (no mapping feeds the knobs —
fully manual). Supersedes the strip half of item 5 (the gloss/placement half still applies to
wherever the mapping line renders); the readout's QUALITY MAPPING group grows the off arm
("quality off — knobs are what you set"). Check the G8 tri-state lift: "off" must be a REAL stored
arm, not a fourth enum value that materializes defaults.

~~O-18.~~ ✅ `45cf001d` — segmented strip dies, dropdown with Fast/Balanced/Deep + "Don't use
quality"; OFF stores as absence of `params.quality` (no fourth enum member), contract test pins
the three-membered enum + the absence.

## P0 ROOT CAUSE — source-pinned + LIVE-MEASURED (real-mouse probe, owner + orchestrator, 08-02)
`components/row-reveal.ts:24` — `ROW_REVEAL_SWAP = "group-hover/row:hidden …"` is a
**display:none swap**, and the loop is **pure CSS layout/hit-test oscillation — NOT a React
remount**. Live receipts (owner wiggled the name edge, in-page probe counted): **~1,727
pointerover/out pairs (~85 boundary crossings/sec, frame-rate)** alternating SPAN.block(1569) ⇄
DIV.flex(1718) ⇄ BUTTON.group(158), with **ZERO childList mutations** in the pane for the whole
storm. Mechanism: hover → badge `display:none` → title line reflows → span/flex boundary slides
across the stationary pointer → hover recomputes → badge returns → boundary slides back, at
refresh rate. The perf tracer's "(detached)" was log-time misattribution; "slow pointer" handlers
are the symptom of 170 events/sec, not the cause. ROW_REVEAL (cluster half) is opacity-only and
innocent. O-1 (persistent filled dot, reserved box) removes the swap entirely — one fix closes
both P0 items. Sweep OTHER ROW_REVEAL_SWAP consumers (starred rows' title-line ★): a marker swap
must reserve its box (visibility/opacity in a fixed slot), never `hidden`.
REGRESSION PROOF (the probe, rerunnable): arm capture-phase pointerover/out counters + a
childList MutationObserver on `[aria-label="Presets list"]`, real-mouse wiggle the name edge ~10s
→ crossings must be single-digit; CTs cannot see this class (synthetic pointers don't re-hit-test
on layout shift).

~~P0 root cause.~~ ✅ `5978fddf` — the swap is gone from the row (see item-1 strike); the
"sweep other consumers" directive is fulfilled in the same commit: "ROW_REVEAL_SWAP survives for
its one remaining consumer (the chats row's ★) migrated to the reserved-box pattern:
`invisible` on the hover axis... `hidden` kept only on `pointer-coarse`". Real-mouse regression
proof itself is NOT re-run in this pass (doctrine bars browser tooling here); the doc's own
wave-status block records the post-merge CDP re-probe (14 dispatches, over:3/out:2/mut:0) as the
live confirmation.

## Verified GOOD against the mocks (don't touch)

Rack row grammar (name=select, chevron=drill, grip, CHAT HISTORY splice band with SETUP/POST
kickers) · carrier drill honesty (read-only body + Manage-in-World-info door + {{entry}} wrapper,
no inject/trigger — `628a3666` holds) · section drill BODY/DELIVERY/PLACEMENT/TRIGGERS anatomy ·
Actions census groups + Delivers-via note · readout CONTENT structure all five views (budget bars
with struck-off rows + carrier ~— note, PIVOT row, assembled-preview door, no-selection arm as
first-class ACTIVE PRESET readout, honest Data/Transforms empties, capability gloss) · ARIA grammar
throughout (rack rows expose Reorder/name/enabled/Edit per row; kebab menus; alertdialog confirm).

## Process notes

- **Synthetic-hover blindness**: any regression proof for item 1 MUST drive a real pointer;
  Playwright `--hover` + DOM swap = no re-fired pointerover, CT stays green through the loop.
- **Automation incident**: during this pass an automated run minted "New preset 2" (the + New door
  fired in a run whose steps never targeted it — exact click unidentified, two runs had 30s
  screenshot timeouts mid-sequence). Deleted with receipts (kebab → Delete → alertdialog → list
  back to 2). Caution when scripting this surface until item 1's remount storm is fixed — a
  mid-remount click can land on the wrong control.
- Sampling KnobRow deck (sliders) unverifiable on sonnet-5 (capability exposes no sampling knobs —
  the absence arm itself renders correctly, capability note in readout matches mock verbatim).
  Re-verify the slider deck on a vLLM/OR connection before closing the program.
