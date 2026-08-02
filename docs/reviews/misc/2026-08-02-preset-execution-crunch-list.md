# PRESET-1 — mock-vs-rendered execution crunch list (orchestrator pass, 2026-08-02 night)

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

**2. LIST reveal cluster is jank (owner verbatim), and it hides state.**
- The activate affordance renders as a FILLED AMBER LIGHTNING BOLT — reads as a one-shot zap
  action, not the mock's pressed toggle-dot (`list--pane-presets.png` + the toggle-semantics note
  crop). It also has no visible relationship to the Active state it toggles.
- The three glyphs are weight-mismatched: heavy filled bolt vs hairline copy/kebab, no shared
  hit-target chrome, optical sizes differ.
- The Active BADGE VANISHES exactly while you inspect the row — the P4 receipt's own invariant was
  "state rides a title-line Active Badge" with the toggle at rest="never"; the badge must SURVIVE
  hover. (Bolt→FillableIcon fill-axis is already queued in icon-seal adoption — fold, don't fork.)

## P1 — structural execution misses

**3. The 720px column is LEFT-PINNED in the content pane — the "crunchy" root.** Header band spans
full width, the deck clamps at ~720 hard left, everything right of it is dead void (half the pane at
1920 — `mvr-params-content.png`, `mvr-actions-content.png`). Self-inflicts item 8's truncation.
The mock's 720 was its PANE width, not a clamp-inside-a-wider-pane. Needs ONE ruling for all five
views: center the column, or let it breathe to a responsive max-width. Check the app's other
content-pane editors for the house convention before ruling.

**4. Switch grammar split — the rack ON/OFF ambiguity is BACK (or never died live).** Params'
Reasoning switch = amber-ON (correct, the app convention). Every RACK switch renders pale-gray
track + white thumb both states — ON vs OFF differ only by thumb side (`mvr-rack-content.png`;
same gray in Transforms + drill-in headers). The side-eye's "rack ON/OFF indistinguishable" was
marked fixed in the fix-all; rendered truth says otherwise. One switch grammar, amber-ON, everywhere
on this surface. (This smells like the tailwind-merge custom-token override class — verify the fix
actually lands in COMPUTED style, assert computed color in the CT.)

**5. Quality strip execution.** Selected "Deep" = thin amber outline only (mock: the selected
segment is visually FILLED/darker). The mapping gloss wraps into two stacked mini-lines UNDER the
strip and drops the temp value; mock renders one inline line beside the strip
("deep → effort high · temp 1.0 — explicit knobs below override this").

## P2 — row-level execution deltas

**6. List subtitle grammar dropped the KIND.** Mock: "generation · forked from Default …",
"generation · edited 3d ago". Built: bare "edited 2h ago" (`mvr-list-rest.png`). The kind vocab
exists (registry, G7 chips) — thread it into the row subtitle.

**7. Kind-chip inconsistency in Actions.** `format` chip renders FILLED blue while
steer/voice/studio/nudge are outlined (`mvr-actions-content.png`) — nothing semantic justifies the
odd one out. One chip grammar.

**8. Truncation everywhere in Actions.** Descriptions and template previews cut at ~20-30 chars
("[Take the following into speci…") while half the pane is void — falls out of item 3; verify the
previews recover once the column ruling lands.

**9. Number formatting split inside one deck.** Max output "1,500" (locale) vs Max context "200000"
(raw) — same KnobRow family, two grammars (`mvr-params-content.png`). Mock uses raw mono. Pick one.

**10. Template drill "At depth" NumberField clips its own ghost** ("0 — the t…",
`mvr-drill-template.png`) — inline size too narrow for the ghost copy; widen the box or shorten the
ghost. Same drill: section drill's DELIVERY row (Spoken-as ↔ Inject-at-depth) is misaligned —
label baselines and input widths don't form the mock's two-column row (`mvr-drill-section.png`).

**11. Readout pane header is generic "Details".** Mock names what it reads ("ACTIONS · READOUT").
With per-view swapping content, name the view in the pane header (`mvr-readout-*.png`).

**12. Actions readout is ~90% void.** DELIVERY PATH renders; the D8 binding chip + resolved preview
are QUEUED post-P5 (sanctioned) — but until they land, ship the honest placeholder arm naming what
arrives ("resolved preview appears when a chat is bound") instead of dead space
([[empty-states-are-load-bearing]]).

**13. Header title de-emphasized.** "New preset" renders at body weight/size; mock gives the name
title weight. The truth chips (Active + model) are right.

## P3 — polish / taste flags (fix-all law says these get fixed too)

**14. THE BLUE PROBLEM (cross-cutting).** Rack glyph discs (saturated blue circles — the
"glyph-disc noise" RENDERED-WRONG row still reads loud; Post-history amber vs everything-else blue
= accidental two-tone), Actions kind chips, macro token pills ({{input}}/{{person}} bright blue),
Prompt-readout budget bars (blue fills) — a blue/steel family the mocks don't paint (mocks: neutral
dark tiles, quiet chips, ONE blue SETUP kicker + green on-chip). Rule it once: either blue IS the
preset-surface info hue (then mute + apply consistently) or it's drift (re-tint neutral/amber).

**15. Rack token counts cramped** — ~30/~4/~— tiny and tight against the toggles; mock gives a
dedicated right-aligned mono column with air.

**16. Missing rack cue badges.** Guided instruction lacks "steered turns"; Post-history lacks
lock + custom (mock draws them; registry carries fires-on + position-lock — the metadata exists).

**17. Built-in lock placement.** Mock: lock inline LEFT of "Default" (a property of the name).
Built: far right edge (reads as an action slot).

## OWNER LIST (2026-08-02 night) — merged; ★ = owner RULING that overrides mock/receipt

**Confirms items above:** switches off-palette (item 4) · sliders WHITE, off-palette too — extend
item 4 to one control-color grammar (switch + slider + toggle) · Quality strip "looks like hot
fetid ass **and is on the wrong side**" (item 5, escalated + placement) · drill DELIVERY
misalignment both drills (items 10/21) · Actions tab "not as clean as the mockup" (items 3/7/8).

**O-1 ★ LIST ACTIVE = FILLED DOT, not the text badge.** "We literally set up lucide so we could
use fills" — the P4 receipted badge arm is OVERRULED: active state renders as a filled lucide dot
(FillableIcon), persistent on the row; the hover cluster reveals BESIDE it. Folds into P0 item 2's
fix (and the icon-seal client-adoption queue).
**O-2 "for anthropic/…" chip is MISLEADING** — it shows the CURRENT resolved connection model, but
reads as "this preset is for xyz". Reword/re-home the provenance (readout owns resolution truth).
**O-3 Import button (list header) has no tooltip** — icon-only, aria-label exists but sighted users
get nothing on hover.
**O-4 ★ Compaction mode value too long** ("Default — Managed — summarize into…") — shorten the
option label; long explanation moves to hover/info.
**O-5 "MEMORY MARKER" IS A VOCAB LIE — VERIFIED.** Compaction writes `chats.compactSummary` +
`compactedAtSeq`, its own chained summary marker spliced into the top history slot
(`domain/chat/verbs/compaction.ts:1-9`); it NEVER feeds the Memory plane (rack "Memory" =
remembered past events, a different system). The copy at `params-limits.tsx:198,221,246` says
"memory marker / durable portable memory" — rename to summary/compaction marker, all three sites.
Verbatim-tail's MECHANIC is correct (newest N stay literal); only the noun lies.
**O-6 Summary instructions textarea shows no default** — the RP-tuned default must GHOST in the
box (the GhostValue law's textarea arm, missed).
**O-7 ★ Rack row explainer prose → hover.** The inline "your core system instruction" descriptions
are owner-ruled lame; move to hover/title on the name. (Overrides the mock's inline-desc drawing.)
**O-8 Inject at depth is STUCK at "in flow"** — dead input, can't set a depth. Functional defect,
P1.
**O-9 ★ ZONE VOCAB + CONDITIONAL FIELDS.** Zone options change: POST → "In Chat"; the model is
Relative (ordered among prompts) vs In-Chat @ depth. Depth + Order render ONLY when zone = In Chat.
(Spec §5 zone table needs the amendment; supportsArrangement stays schema-derived.)
**O-10 ★ "Spoken as" → "Role"** (section drill) and **"Delivered as" → "Role"** (template drill).
One vocab.
**O-11 ★ TRIGGERS = dropdown multi-checkbox**, not the segmented strip. (Overrides the mock's
segmented drawing.)
**O-12 Drill-in missing OVERRIDES block at the bottom** — verify against spec §5/§7 what the
overrides section carries and build it.
**O-13 "Delivers via Guided instruction" button DOES NOTHING** — dead affordance on the Actions
header. Either it becomes the real door (select the Guided-instruction row in Prompt — the readout
note already promises "clicking the name selects that row") or it dies.
**O-14 Template drill At-depth ghost invisible** — confirms item 10 (clipped ghost); owner saw
stray "next" text in the field.
**O-15 noted, no action:** Guided instruction toggleable in the rack — owner grumble, stands
("I guess it's fine").
**O-16 ★ EXPORT DOUBLE-HOME OVERRULED.** Export in the list-row kebab AND the content-header kebab
is dumb (owner). The fix-all SANCTIONED that echo (§16 rows 7+27 "header-Export echo") — overruled:
ONE home, the list-row kebab (matches the characters/chats ruling: lifecycle lives list-side).
Remove Export from the editor-header kebab; §16 rows 7+27 revert.

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
