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
content-pane editors for the house convention before ruling. MEASURED LIVE (owner: "everything
just… stops at a certain point" / "prompt stuff and etc just squishes itself in"): ALL FIVE
tabpanels carry the SAME `max-width:720px` child, leftGap 0, rightGap 238-248 at a 958-968 pane
(probe table: Params/Prompt/Actions/Data/Transforms identical) — one shared wrapper, one fix.
In focus mode at full width the void is ~800px. OWNER NUANCE: "looks okay when both panels are
out, but when you close them it looks awful" — the ruling must hold across pane widths ~960 →
full-bleed (a centered/responsive column degrades gracefully; a left-pinned fixed clamp cannot).

**O-19 ★ PRESETS OPENS WITH LIST + CONTEXT DOCKED.** The section currently opens without the
list/context panes; the section-registry default for Presets becomes list=docked +
context=docked (the surface is unusable without the list, and the readout IS the product).

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
Built: far right edge (reads as an action slot) — and see item 19: it collides with the reveal.

**18. Cluster wrapper paints its OWN box on hover** (owner-spotted live, CDP-held-hover zoom
receipt): the [⚡ · dup · kebab] cluster sits in a distinct darker rounded panel ON TOP of the
row's hover tint — box-in-box double highlight. Kill the wrapper background (glyphs ride the row
tint) or make it seamless with it.

**19. Non-active/built-in trailing-slot COLLISION** (owner-spotted live, zoom receipt): on
Default's hover the lock rest-marker STAYS and the ⚡ bolt renders overlapping/below it —
vertical stack, off-center, half-clipped. The trailing slot has no single reserved geometry for
rest-marker vs reveal. Same family as the P0 swap: one reserved trailing slot layout, marker and
cluster co-exist in it (marker inline-left of the cluster, or marker yields via opacity in a
FIXED box) — never stack, never `hidden`.

**O-1 nuance (owner, after seeing it live):** "don't hate the active thing now that I understand
it" — the ⚡ activate-toggle CONCEPT survives; the dot-for-state ruling and the bolt's
weight/centering fixes stand as written.

**20. FOCUS-MODE STATE DESYNC — reproduced live with __orb.shell() receipts (owner report:
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

**21. Params typography census — the "font colors and weights all over the place" receipt
(visible-only probe, Params deck): 7 distinct color·size·weight tuples on one deck.** Worst two:
(a) "Between 1 and 64,000" BOUNDS-HELPER text renders 15px bright-white 400 — LOUDER than the
13px/500 labels it annotates (hierarchy inversion; helpers must be quieter than their labels);
(b) TWO near-identical whites — `oklch(0.955 0.004 75)` everywhere vs `oklch(0.96 0.004 75)` on
the selected "Deep" — token drift, not a choice. Full zoo: kickers 10.5/600 muted · gloss
10.5/400 muted · labels 13/500 bright · select values 13/400 bright · bounds 15/400 bright ·
quality options 15/500 muted · selected 15/500 off-white. Rule the scale (kicker/label/value/
helper tokens), collapse the two whites, and the bounds text drops to helper voice.

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
**O-17 ★ Prompt-view tail clusters → TRANSFORMS.** Delivery (Speaker names · Continue delimiter)
and Collapsing (Adjacent-role merging · "This model enforces at least Strict — stricter always
wins" · Squash system notes) move out of Prompt into Transforms (owner: they're wire-shaping, not
prompt content). Spec §5 concept-sort text amends with it. (Recorded counterpoint, not argued:
the spec homed Delivery under Prompt as "how sections speak"; owner sort wins.)

**O-18 ★ QUALITY = A DROPDOWN, with an OFF arm.** The Fast/Balanced/Deep segmented strip dies;
Quality becomes a select whose options include "don't use quality" (no mapping feeds the knobs —
fully manual). Supersedes the strip half of item 5 (the gloss/placement half still applies to
wherever the mapping line renders); the readout's QUALITY MAPPING group grows the off arm
("quality off — knobs are what you set"). Check the G8 tri-state lift: "off" must be a REAL stored
arm, not a fourth enum value that materializes defaults.

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
