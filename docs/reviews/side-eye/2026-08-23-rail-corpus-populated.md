---
kind: review
status: active
updated: 2026-08-23
---

# side-eye — RAIL sweep 5/10 companion: Corpus, POPULATED arm

**Lane:** rail-corpus-2 · **Surface:** live dev stack `:5173`, CORPUS section · **Mode:** FOCUSED
(4 briefed deliverables) + full-battery instruments · **Companion to:**
`docs/reviews/side-eye/2026-08-23-rail-corpus.md` (the EMPTY/first-run arm).

## Premise: CONFIRMED (the prior sweep's blocker is gone)

The prior sweep opened with a retraction — the db had been dropped 5 minutes before it started. It is
back. One tick, live tRPC through the authenticated session:

```
coverage       : { characters: 327, digests: 2429, segments: 2026 }
character.list : totalCount 327      chat.listChats : totalCount 896
visualArchetypes: 8 families / 242 members   topKeywords: 50   unusedCharacters: 204
modelRouting   : 142 rows / 52 models / 11,321 generations / 7,960,910 tokensOut
duplicateCounts: { characters: 1, chats: 1, identicalCharacterPairs: 3 }
duplicateChats 35 rows · imageDuplicates 82 rows · corpusProjection 327 rows
themeDrift 0 rows · sceneThemes 0 · arcThemes 0
```

**Two corrections to the brief.** (1) It is not "10 passes Succeeded" — `workloads.list` returns
**18 rows: 14 succeeded and 4 `worker_died`** (`distill-characters` ×2, `memory-backfill` ×2, errors
`worker heartbeat went stale — row reaped`). (2) `compute-themes` **succeeded** (`createdAt
1787431820258`) and produced **zero** story themes. Both facts drive findings below.

---

## Verdict: SHIP WITH FIXES

The empty arm's headline P1s mostly **died with population** — and that is the honest result: three of
the prior sweep's loudest findings were artifacts of a 12-character library. What population revealed
instead is worse and more specific: **the Corpus landing page spends 1,727px on a chart with no
information in it and 95px on the economics of an 11,321-generation library**, the status rail
**announces a failure that a later run already fixed**, and the Similarity tab is **56,177px tall with
1,782 un-clickable rows** hiding the three sections that are its point.

Three separate lists on this section **rank by one quantity and display another**, and the app has
started writing prose to apologise for it. That is the structural theme of this pass.

---

## Deliverable 1 — re-derivation of the prior sweep's findings

### #535 — the P1 trio

| Prior P1 | Verdict | Receipt |
| - | - | - |
| **Primary CTA rendered twice** | **EMPTY-STATE-ONLY — dead** | With the detail panel open at 327 chars: `invitationNodes: 0 · duplicateButtonLabels: [] · runPassButtons: 1 · jobsDoors: 1 · memoryButtons: 0`. The context panel's full `--map` is **12 elements with ZERO buttons** (tablist + 5 tabs + tabpanel + 1 combobox + 4 chart nodes). The Archetypes tab now draws 8 art clusters + 10 writing clusters, so it has content of its own and no longer borrows CONTENT's hero. `reports/snaps/pop-corpus-context.png` |
| **Three totals for one library** | **CHANGED SHAPE — still stands, narrower** | The h1 now agrees with the rail (`"327 characters, 313 cards distilled."` ↔ `Distilled — genre, tone, pitch  313 of 327`). What survives: the rail's own first row reads **`Visual families  8 families · 242 characters`** — 85 characters in no family, never explained anywhere; the Visuals tab reads `Scored 242`; the Map reads `327 cards`; the list-pane header reads `313`. **Four denominators, and 242 is the one the surface never accounts for.** New at population: **"Never played" renders 8 rows over 204** (`unusedCharacters: 204`, `neverPlayedButtons.length: 8`) with no count and no "show all" — see \[P1-3]. |
| **One job, three names, two homes** | **EMPTY-STATE-ONLY — largely dead** | One door (`Run the passes again`), one jobs link, both in READINESS. The dossier's `Go to Refinery` is gone; what remains there is `Card quality — Not scored yet — run the Refinery's library score sweep… / Open the Refinery →`, which is a **different job** (card scoring, a Refinery concern) correctly homed elsewhere. `reports/snaps/pop-corpus-dossier.png` |

### #536 — the P2 cluster

| Prior P2 | Verdict | Receipt |
| - | - | - |
| LIST says "no characters" while CONTENT lists 12 | **EMPTY-STATE-ONLY — dead** | `list "Distilled catalog"` with 313 rows (virtualized, 13 in DOM, `scrollHeight 3968`), header `CORPUS 313`. |
| Gem shelf renders bars in scrambled order | **STANDS — worse** | 20 tiles in a 3-column grid. Row 2 reads left→right Bess 567,106 · Azarael 597,739 · Bengal 629,696 — **bars ascend while rank descends**. Visible without measurement in `reports/snaps/pop-corpus-light.png`. |
| Similarity tab: a pair you can't act on, next to lists that disagree | **STANDS — much worse** | The *copy* was fixed ("Every pair above the threshold, ranked — not the near-duplicate pass's findings"). The *structure* was not: `pairRows: 1782 · clickablePairs: 0 · panelScrollH: 56177 · panelClientH: 1493`. See \[P1-2]. |
| Eight families labelled on four unrelated axes | **CHANGED SHAPE** | Now `Playful · Traditional · Warm · Melancholic · Cheerful · Close-up · Unanalysed portraits · Unclassified` — still mixed axes (mood / era / temperature / framing / a null state), but the CONTEXT tab names all eight consistently. The new defect is that CONTENT **renames one of them**; see \[P2-1]. |
| Every query returns "12 results" (= library size) | **EMPTY-STATE-ONLY — dead** | `dark sorceress` → `status: "20 results in Characters"` over 327. The prior reading was a 12-item artifact. **New in its place:** the 20 scores are non-monotonic (60, 52, **53**, 52, 49, **52**, 49, 44…) — see \[P2-2]. |
| Map tab is a one-colour scatter with "Other 12" | **EMPTY-STATE-ONLY — dead** | `"327 cards, projected by semantic similarity, colored by genre. Click a card to open its dossier."` Legend `Fantasy 100 · Romance 88 · Slice-of-life 82 · Drama 21 · Other 36` (= 327 ✓), 327-row accessible table. The copy also gained the click affordance the prior sweep asked for. |
| "Portrait fit" — no scale, no target, no definition | **STANDS** | `Scored 242 · Mean fit 31% · Median fit 31%`, worst list 13%–19%. Still undefined. Half of it improved: "Worst-matched art" now lists a genuine tail of 12 rather than every character. **New:** the dossier calls the same metric `Card ↔ art match: 25%` — one metric, two names, two homes (§13). |
| Mobile opens Corpus on the pane that says the library is empty | **EMPTY-STATE-ONLY — dead** | 430×932 still lands on LIST, but LIST is now 313 characters. `--map` mobile: search + 5 targets + 4 filters + catalog rows + `Show Corpus overview` / `Show details`. Landing on a browsable catalog is a defensible mobile default. |

### #537 — the P3 / ARIA cluster

| Prior finding | Verdict | Receipt |
| - | - | - |
| Invitation body runs 87 chars/line | **STANDS — worse: 145** | `design-audit / --goto corpus` → `P3 line-length … prose line measures 145 chars` on `[data-testid=corpus-home-surface] > … > p.font-sans[data-slot=text]`. |
| Two identically-named rows, no qualifier | **STANDS — worse** | `--map` yields `Yuki >> nth=0/1`, `Your Shitty Life >> nth=0/1`; the family glosses carry `Freya · Freya`, `Emily · Emily`, `Assistant · Assistant`; the pair list renders `Freya ↔ Frida 81%` twice and `Freya ↔ Miyako 80%` twice. **The app already solves this for chats** — `Ayami — Aug 18, 2025 (3) ↔ Ayami — Aug 19, 2025 (4)` — and not for characters. |
| `Sort` / `Min similarity` / `Max nodes` read "Default" | **STANDS — sharper** | On the same filter row: `Genre "All genres" · Tone "All tones" · Tag "All tags" · Sort "Default"`. Three siblings resolve their value, one doesn't. And the default is `recent` = `desc(characters.createdAt)` (`packages/server/src/domain/discovery/verbs/browse.ts:90`), which on a bulk alphabetical import renders Z→A — indistinguishable from "reverse alphabetical" to a reader with no label. |
| Three stacked sections + ~1,300px dead right column | **CHANGED SHAPE — worse ratio** | Page is now 3,824px; READINESS occupies 581px of the right column and nothing follows. **~3,240px of dead right column.** |
| 29 content renders / three over-budget commits | **STANDS — much worse** | `__orb.renders()` → `region:content 41 (40 updates, maxMs 35)`, `region:list 54`. `motion-audit` worst blocking **15ms → 287ms**. See \[P1-4]. |

**ARIA recommendations 1–7 from the prior sweep: all seven STAND, none fixed.** Live receipts:
`searchExpanded: "true"` on a pristine load · `liveRegions: ["status:\"App loaded.\"",
"status:\"0 suggestions\"", "region:\"\""]` (two competing status regions during search:
`"3 suggestions"` + `"20 results in Characters"`) · search rows still render the score as a sibling
`paragraph: 60%` outside the row button · the readiness rail is `SECTION` → three plain `DIV`s with
**no role, no list, no label/value association** · the eight family rows are still one flat `text:`
node with zero controls · `tabpanelTabindex: "0"` with `tabpanelFocusable: 2` · one skip link,
CONTENT-only.

---

## Deliverable 2 — #544a triage: `P3 nested-card [data-slot=autocomplete-input-group]`

**Verdict: FALSE POSITIVE, and it is a NEW FP class — two compounding mechanisms, neither previously
catalogued.**

**(a) The "outer card" is the LIST PANE.** Replaying the walker's own `isCardLike` up the ancestor
chain, the only card-like ancestor in 10 levels is:

```
ASIDE  class="shell-panel"  aria-label="Corpus list"
  borderTop 0px · borderRight 1px · borderBottom 0px · borderLeft 0px
  borderRadius 0px · boxShadow "none" · background oklab(0.132 0.003 0.00519615 / 0.7)
```

A full-height shell REGION whose only card-like inputs are its 1px **pane divider** and a translucent
scrim. The rule's own comment states its target is "a decorative CARD PANEL nested inside another card
panel" (`tooling/src/ui-audit/ops/walker/census-decor.ts:27-31`). A shell pane is neither.

**(b) The "inner card" is an input wrapper the exclusion cannot reach.** The element is
`bg-input border border-border rounded-control` containing `input[aria-label="Search your corpus"]`
(`acHasInput: true`). `isInteractiveIsland` tests only `el.matches(SEL)` and `el.closest(SEL)` —
**self and ancestors**. A wrapper *around* a control is structurally unreachable by `closest()`. The
code comment at `census-decor.ts:41-42` claims otherwise — *"A wrapper whose whole job is to host one
control (the label+control field shell) rides along"* — that is an intent the implementation cannot
deliver.

**Fix (two lines, both needed):** exclude shell regions from the card set (radius 0 + a border on
exactly one side + a landmark tag ⇒ a region divider, not a card edge), and add
`el.querySelector(INTERACTIVE_ISLAND_SELECTOR)` to the island test so a single-control wrapper is
covered as its comment already promises.

**Receipt:** `reports/design-audit/root.json` · the ancestor-chain replay eval above.

---

## Deliverable 3 — #544b: the #538 walker delta on the populated surface

**The #538 fix HOLDS, live-disproven the hard way.** `pnpm design-audit / --goto corpus` on 327
characters with **32 `[data-slot=avatar-stack-item]` seats mounted across 8 family plates** (plus ~40
more in the gem shelf and never-played lists):

```
RESULT design-audit findings=10 p0=0 p1=0 p2=0 p3=10 pointer=fine census=804 nav=OK
```

**Zero avatar-class nested-card findings.** In the empty arm the same rule produced 11 of them off a
far smaller avatar population. The exclusion is correct and it scales.

**The full finding list (all 10, triaged):**

| # | Rule | Selector | Verdict |
| - | - | - | - |
| 1 | `nested-card` | `[data-slot=autocomplete-input-group]` | **FALSE** — deliverable 2 above |
| 2–9 | `nested-card` | `div.rounded-base[data-slot=card-root] > … > div.border-border[data-slot=card-root]:nth-of-type(1..8)` | **FALSE — a THIRD, whole-app FP class** (below) |
| 10 | `line-length` | `[data-testid=corpus-home-surface] > … > p.font-sans[data-slot=text]` | **REAL** — 145 chars/line, filed \[P3-1] |

**Findings 2–9 are the `@orb/ui` `Card nested` arm, and the rule fires on a CLASS NAME against
computed styles that prove the opposite.** The eight family plates measure:

```
plateBorders  { t: 0px, r: 0px, b: 0px, l: 0px }      plateShadow  "none"
plateCls      "border-border text-card-foreground p-block rounded-inset border-0 bg-surface-raised"
```

Zero border on all four sides, no shadow — so by the rule's stated predicate `(hasShadow||hasBorder)`
it is **not card-like**. It fires anyway because `isCardLike` ORs in
`CARD_CLASS_RE.test(el.className)` with `CARD_CLASS_RE = /\bcard\b/i`
(`ops/walker/core.ts:11`, `census-decor.ts:19`), and `\bcard\b` matches inside
**`text-card-foreground`** — the card *text-colour* utility, which the `nested` arm still emits
beside `border-0`. `cardWordMatch: true`.

The `nested` arm's contract is literally *"drop the border entirely, step the radius one below the
host's, and let the FILL alone carry the distinction"*
(`packages/client/src/features/discovery/components/corpus-family-map.tsx:102-105`). **Every use of
that sanctioned arm anywhere in the app is a guaranteed nested-card finding.** This is not a corpus
defect; it is a whole-tree lying instrument, at the same priority as any other under
fix-tools-as-we-find-them-lying.

**Fix:** `hasBorder` must be computed-only. If a class-name fallback is genuinely wanted for
un-computable cases, it must be a *card-root* signal (`[data-slot=card-root]`, `\bcard-\b` prefixes on
layout utilities), never `\bcard\b` over the whole class string — and it must not outrank a measured
`border-width: 0` on all four sides.

**Net:** 12 findings (11 avatar-false) → 10 findings (10 false). The avatar class is gone; the class-name
class underneath it was always there. **No real nested card fires on this route.**

**Mobile arm:** `--goto corpus --mobile` → `findings=1 pointer=coarse census=257`, one
`flat-type-hierarchy` P3 (10.5/13/15/16px, ratio 1.5:1). **No tap-target findings at the coarse
floor** — same as the empty arm.

---

## Deliverable 4 — findings on the populated-only surfaces

### \[P1-1] "Model economics" spends 95px on a library with 11,321 generations and 8M tokens, because it charts the one field its data doesn't carry

**What.** The entire section, verbatim from the DOM:

```
"Model economicsCost by routeItemValuefantasy → claude-sonnet-5$0.08"
```

One bar. Behind it:

```
discovery.modelRouting : 142 rows · 52 distinct models · 11,321 generations · 7,960,910 tokensOut
                         rows with costUsd > 0 : 1   ($0.080644)
```

141 of 142 routes carry `costUsd: null` (`tokensOutProvenance: "estimated"` — local and
OpenRouter-estimated rows have no cost). `generations` and `tokensOut` are populated on **all 142**
and are rendered nowhere. Section height: **95px**, canvas 869×48.

**Why it hurts a user.** The section is named for the library's economics and reports eight cents.
A reader concludes their 896-chat library cost $0.08 — or that the feature is broken. Worse, the one
bar is drawn at **full width in accent orange**, so the visual weight says "large" about the smallest
number on the page. Nielsen #1 and #2.

**Fix.** `clarify: the Model economics section — receipt: a chart whose measure is populated for >90%
of routes, and a stated denominator.` Chart `generations` or `tokensOut` (both complete), keep cost as
a secondary series labelled with its coverage ("cost known for 1 of 142 routes"). If cost is the only
metric worth the section, the section's empty state is "cost is not recorded for local routes" — not a
one-bar chart.

**Receipt.** `econText` eval (above) · `modelRouting` census (above) ·
`reports/snaps/pop-corpus-keywords-crop.png` (bottom strip).

---

### \[P1-2] The Similarity tab is 56,177px tall and buries its three real sections behind 1,782 un-clickable rows

**What.** Measured inside the 384px CONTEXT panel:

```
pairRows       : 1782      clickablePairs : 0
panelScrollH   : 56177     panelClientH   : 1493      (37.6 screens)
buttons on the whole tab : ["Min similarity", "Max nodes"]

heading offsets from panel top:
  Nearest pairs         0
  Duplicate characters  52151
  Duplicate art         52270
  Duplicate chats       54882
```

**Why it hurts a user.** The tab's three named jobs — find duplicate characters, duplicate art,
duplicate chats — begin **52,151px down**. At ~600px per scroll flick that is ~87 flicks past a wall
of text you cannot click. And the data down there is good: `Ayami — Aug 18, 2025 (3) ↔ Ayami —
Aug 19, 2025 (4) · forked · 100%` is exactly the disambiguated, actionable row the rest of this
section needs. It is unreachable.

The `Max nodes` control that would bound this reads **"Default"**, so the user cannot see that the
default admits 1,782 pairs, nor what to change it to.

**Why this is populated-only.** At 12 characters this tab was one pair. The prior sweep filed the
right symptom (a dead `<p>`) at the wrong severity because the volume did not exist yet.

**Fix.** `distill: the Similarity tab — receipt: Duplicate characters within one viewport of the tab
top, and every pair row a control that opens Compare pre-filled.` Cap Nearest pairs at a visible top-N
with an explicit "showing N of 1,782", move the three duplicate sections **above** it (they are the
findings; the pair list is the raw material), and make the pair row a button.

**Receipt.** heading-offset eval (above) · `reports/snaps/pop-tab-similarity.png` ·
`--aria [aria-label="Corpus details"]` (3,619 lines, `+3219 more` truncated).

---

### \[P1-3] The status rail announces a failure that a later successful run already fixed

**What.** READINESS renders, under the primary CTA:

```
LAST RUN
The last pass stopped unexpectedly — run it again.
```

The workload table says the opposite. Newest-first:

```
distill-characters  succeeded    createdAt 1787443344202   ← the most recent run of this pass
memory-backfill     succeeded    createdAt 1787443343772
distill-characters  worker_died  createdAt 1787436170285   ← ~2 hours EARLIER
```

Mechanism, exact: `lastFailure()` selects the newest `failed`/`worker_died` row **with no test for a
later success** (`packages/client/src/features/discovery/hooks/use-understanding-pass.ts:109-112`),
and the rail renders it unconditionally on `pass.failure !== null`
(`components/corpus-readiness-rail.tsx:151-158`). **A crash is announced forever.**

**Why it hurts a user.** Five green checks sit directly above a sentence saying the pass broke, beside
a primary button whose label is *"Run the passes again"*. The surface is actively recruiting the user
to re-run a 327-character distillation that already succeeded. That is a trust defect and a compute
bill.

**Also here, same rail:** `Story themes — not run`, while `compute-themes` **succeeded** at
`1787431820258` and produced zero themes. This module has an explicit three-state doctrine — *"it has
not run · it ran and found nothing · what it found"* (`lib/corpus-analysis-state.ts:155-161`) — and
Keywords and Near-duplicates both use it via an `everRan` input. The story-themes row is the **one row
that doesn't**: `datum: storyThemes === 0 ? "not run" : …` (`:321`), no `everRan` at all. So a
succeeded-but-empty pass is reported as never-run, next to a button inviting you to run it.

**Fix.** `clarify: the readiness rail's run history — receipt: the failure line absent when a later
run of the same kind succeeded, and "none found" on a story-themes row whose pass has an ever-ran
receipt.` Two edits: gate `lastFailure` on `createdAt > newestSuccess.createdAt`; give the
story-themes row the same `everRan` input its four siblings have.

**Receipt.** `workloads.list` (18 rows, above) · `reports/snaps/pop-corpus-landing.png` ·
`use-understanding-pass.ts:109-112` · `corpus-readiness-rail.tsx:151-158` ·
`corpus-analysis-state.ts:155-161, :321`.

---

### \[P1-4] Section entry blocks the main thread for 287ms — 5.7× budget, 19× the empty arm

**What.** `pnpm motion-audit / --goto corpus`:

```
verdict FAIL · worst blocking 287ms (budget 50ms) · 4 LoAFs with style/layout in-frame
CLS raw 0.0004 · non-virtualized 0.0004 · dropped 0/10 · dirty animations 0

LoAF @4894ms  duration 342ms, blocking 287ms
   via TimerHandler:setTimeout        199ms script · 28ms forced style/layout · modern-Cyfp2l7S.js
   step via FrameRequestCallback      122ms script ·  3ms forced style/layout · graphic-KEKgKdWt.js
```

`graphic-KEKgKdWt.js` is ECharts. The empty arm measured **15ms and 1ms**. `__orb.renders()`:
`region:content 41 (40 updates, totalMs 132, maxMs 35)`, `region:list 54`. Console carries three
`[perf] slow commit region:content 13/22/38ms` and one `[reflow] forced synchronous style/layout 16ms`
on every load.

**Why it hurts a user.** 287ms is above the 200ms INP threshold — the section visibly stalls on entry,
and the cause is the 869×1,616px keyword canvas in \[P2-3], which is the least useful thing on the page.

**Fix.** `optimize: corpus section entry — receipt: worst blocking under 50ms on motion-audit at 327
characters, region:content updates under ~15.` Cap the keyword chart's series (see \[P2-3] — it should
not be 50 bars anyway) and defer both canvases below the fold.

**Receipt.** `motion-audit` RESULT line (above) · `__orb.renders()` · `reports/snaps/root.json`.

---

### \[P2-1] The same visual family has two different names 30px apart

**What.** In one frame (`reports/snaps/pop-corpus-context.png`), the seventh family row:

| Where | Rendered name |
| - | - |
| CONTENT, "The shape of your library" | **"Ayami · Bonnie · Seraphina · Effi · Elven Breeding Village · E…"** (truncated), gloss `25 members · grouped by portrait` |
| CONTEXT, Archetypes tab (30px right) | **"Unanalysed portraits"**, `25 members` |

Hard DOM receipt — the plate's label and gloss slots are **inverted** relative to its seven siblings:

```
row 6  { voice: "label", txt: "Close-up" }             { voice: "gloss", txt: "27 members · Charlotte · Niko · …" }
row 7  { voice: "label", txt: "Ayami · Bonnie · Seraphina · Effi · Elven Breeding Village · Emily · Giulia and Erica · …" }
       { voice: "gloss", txt: "25 members · grouped by portrait" }
```

**This is deliberate** — `isUnlabelled(family) ? memberNames(family) : facetLabel(family.label)`
(`corpus-family-map.tsx:121-123`), minted by a prior side-eye pass with the cited reasoning *"A FAMILY
IS NEVER CALLED 'none'"*. **My finding collides with that ruling and I am stating the fork:** the
ruling holds that an unnameable family should show its members instead of a junk token. Population
refutes its premise — the family **is** nameable, the sibling surface names it `Unanalysed portraits`
(server label, `image-analytics/retrieve.ts:115`), and at 25 members the arm produces a 120-char
truncated name-run sitting in a column of one-word names. The ruling survives; **its input changed.**

**Why it hurts a user.** A reader cannot tell that the two surfaces are showing the same family, and
the CONTENT row reads as a rendering fault. §13 IA single-homing; Nielsen #4.

**Fix.** `clarify: the unlabelled family plate — receipt: the same eight names in CONTENT and on the
Archetypes tab, verified in one frame.` Use `Unanalysed portraits` in both places; the member names
already live in the gloss slot on every other row and can live there here too.

**Receipt.** the label/gloss eval (above) · `reports/snaps/pop-corpus-context.png` ·
`corpus-family-map.tsx:121-123`.

---

### \[P2-2] Three lists on this section rank by one quantity and display another — and the app now writes prose to apologise for it

**What.** Same defect, three independent surfaces:

1. **Search results.** `dark sorceress` → 20 rows, displayed scores `60, 52, **53**, 52, 49, **52**,
   49, 44, …`. Rows 2 and 3 invert; rows 5 and 6 invert.
2. **The gem shelf.** Ranked by `messageCount × how-long-quiet` (`gemRank`), barred by `tokensOut`.
   Row 2 of the grid reads left→right `567,106 · 597,739 · 629,696` — bars ascend, rank descends.
3. **The dossier's "Similar characters."** Scores `66, 60, 62, 67, 62, 69, 63, 70` — and above them,
   in the surface's own words:

   > *"Ranked by distinctive similarity — the percent is plain card similarity, so it won't descend."*

**Why it hurts a user.** Every reader parses a ranked list's leading number as the sort key. Three
lists here break that, and the third one has a sentence of prose defending it. Per §13: when a list
needs prose to explain why it disagrees with itself, the list is wrong, not the prose. On a
12-character library two of these had no visible inversion; at 327 all three do.

**Fix.** `clarify: the three ranked lists — receipt: displayed value monotonic in DOM order on search
results, the gem shelf and the dossier's similar-characters list, at 327 characters.` Either display
the quantity you rank by, or render the rank ordinal so the sequence is visibly the datum.

**Receipt.** search `--aria` (above) · gem-tile order (`reports/snaps/pop-corpus-light.png`) ·
dossier `--aria` (above).

---

### \[P2-3] The Keywords chart is 45% of the page and 30% of its own band in pure accent orange, for 50 near-identical bars

**What.** Section geometry on the corpus landing (`surfaceScrollH 3824`):

| Section | Height |
| - | - |
| Readiness | 581 |
| Invested, but quiet | 845 |
| **Keywords** | **1,727** (canvas 869×**1,616**) |
| Never played | 409 |
| Model economics | 95 (canvas 869×48) |

Framebuffer census of the rendered PNG (`reports/snaps/pop-corpus-full.png`, content column x>320):

```
whole page                     :  9.48% accent
Keywords band (y1660–2400)     : 30.08% accent
worst single 800px viewport    : 28.69% accent   (y=1700)
```

The values run **6 down to 2**. Every bar is 72–100% of its track, so the chart is a solid block of
orange in which no bar is visually distinguishable from its neighbours — you must read the numeral at
the right end. And the 50 "top keywords" of a 896-chat library are `ward-stone, violet fire, throne
hall, tired bell, star-metal, ledger, doomblade, ashen spire, ninth epoch, black glass stairs…` —
n-grams from what reads as **one story**, presented with no caveat.

**Why it hurts a user.** §14 physics 4 caps accent at ≤10% of viewport; this band is **~3×** that, and
the accent is the "look here" ink being spent as a default fill for 51 bars. The chart is also the
single largest thing on the page and the \[P1-4] 287ms block. Meanwhile the section with 11,321
generations behind it gets 95px. **The page's vertical budget is allocated almost exactly inversely to
information value.**

**Fix.** `quieter: the Keywords and Cost-by-route charts — receipt: accent under 10% in every 800px
viewport window, keyword series capped at ~12 with a stated denominator, and a non-accent data fill.`
Cut to a top-12 with "12 of 50", use a neutral/teal data fill (the gem shelf already does), and reserve
accent for the CTA.

**Receipt.** section-geometry eval (above) · sharp framebuffer census (above) ·
`reports/snaps/pop-corpus-keywords-crop.png`.

---

### \[P2-4] "Never played" shows 8 of 204 with no count, no rank and no way to see the rest

**What.** `discovery.unusedCharacters` returns **204 rows**; the section renders **8**
(`neverPlayedButtons.length: 8` — Alarise, Amber, Anastasija, Anisa, Annah, Anya, Aria, Audrey — the
first 8 alphabetically), under a bare heading "Never played", with **zero** controls in the section
and no denominator anywhere.

**Why it hurts a user.** 204 of 327 characters — **62% of the library** — have never been played. That
is the single most actionable fact this section holds, and the surface renders it as eight names. A
reader concludes they have eight unplayed cards. Compare "Invested, but quiet", which at least states
its basis ("Lifetime totals per character — the most played, longest left alone"). This is the same
truth defect class as the prior sweep's three-totals P1.

**Fix.** `clarify: the Never-played section — receipt: a visible count ("8 of 204") and a door to the
full list, plus a stated ordering.`

**Receipt.** `unusedCharacters: 204` · `neverPlayedButtons` eval (above) ·
`reports/snaps/pop-corpus-keywords-crop.png`.

---

### \[P2-5] The Archetypes tab lists 18 clusters covering 569 memberships and not one of them is clickable

**What.** The tab renders 8 art clusters + 10 writing clusters (`dark fantasy 84`, `wholesome romance
63`, `melancholic romance · tsundere 57`, `comedic slice-of-life 54`, …, summing to 327), each with a
facet line and a 12-name member list. The tab's complete `--map` is **12 elements** and its only
controls are the `Clusters` combobox and the two chart canvases. **Zero cluster rows are interactive.**

**Why it hurts a user.** §14: CONTEXT is detail + config **of** the active artifact. A panel that names
84 characters as "dark fantasy" and gives you no way to see them is a read-only wall in the one region
whose job is acting on things. The Map tab, one click away, already does this correctly ("Click a card
to open its dossier").

**Fix.** `clarify: the Archetypes cluster rows — receipt: a cluster row that filters the LIST pane to
its members, or opens them.` The list pane already has a Genre/Tone/Tag filter model; a cluster row is
a pre-built filter.

**Receipt.** `--map [aria-label="Corpus details"]` (12 elements) ·
`--aria` Archetypes tab · `reports/snaps/pop-corpus-context.png`.

---

### \[P3-1] Prose measures 145 chars/line

`design-audit` P3 on `[data-testid=corpus-home-surface] > … > p.font-sans[data-slot=text]`. §2 caps at
65–75ch; the detector's ceiling is 80. Up from 87 in the empty arm because the family gloss now carries
a longer member run. `typeset: the corpus home prose — receipt: computed measure ≤75ch at 1280 with the
list pane docked and hidden.`

### \[P3-2] ~3,240px of dead right column

READINESS occupies y≈148–729 of a **3,824px** page; the right column is empty for the remaining ~3,240px
while CONTENT stacks five sections at three different widths. The empty arm filed this at ~1,300px; the
page tripled and the rail did not. `layout: the corpus home column model — receipt: one shared content
measure across the five stacked sections at 1280/docked, 1280/hidden and 1600, plus a right column that
either continues or dissolves.` The Map preview or the per-pass timestamps are the obvious tenants.

---

## Taste & flow verdict (blunt)

**Does it look like shit?** The top half does not — it is the best-composed surface in the app, and
population improved it: the family island with eight avatar strips is genuinely handsome, the gem grid
reads well at 3 columns, the light arm holds (`bodyBg oklch(0.98 0.004 75)`, h1 15.56:1 — computed,
not eyeballed).

**The bottom half looks like shit, and specifically it looks unfinished.** Scroll past "Invested, but
quiet" and you fall into a 1,616px column of 50 identical orange bars labelled with fragments of one
story — "gary", "nosebleed", "no rail", "step 180", "who-still-believes-in-it" — and then, after a
truncated list of 8 names out of 204, a section called "Model economics" that is one bar reading
$0.08. Nothing about that stretch reads as designed; it reads as three charts that were pointed at
whatever fields existed and shipped. The accent census says the same thing numerically: **28.69%
accent in the worst viewport** on a surface whose law caps it at 10%.

**Does it flow weird?** Yes, in one dominant way that population created: **the page's size is
inversely proportional to its value.** The most useful facts on this surface — 204 unplayed characters,
11,321 generations across 52 models, 85 characters in no visual family — get 8 rows, one bar, and no
mention. The least useful — a flat 6-to-2 keyword frequency table — gets 45% of the page. A reader
scrolling this page learns less the further down they go.

The second flow break is the readiness rail arguing with itself: five green checks, then "Story themes
— not run" for a pass that ran, then a red-adjacent "The last pass stopped unexpectedly" for a pass
that then succeeded, then a primary button saying "Run the passes again". Four consecutive lines, three
of them false, one of them a call to action based on the false ones.

**Is it intuitive cold?** The top is. A first-timer reads "327 characters, 313 cards distilled",
sees eight labelled families with faces, and gets it immediately. They will **not** understand: why one
family is called "Ayami · Bonnie · Seraphina · Effi · …"; what 31% "fit" means; why the search's third
result scores higher than its second; why the app says a pass stopped when everything is checked green;
why "Model economics" is eight cents.

**More than one home for a concept** (§13), the populated list:

- **one family, two names** — "Ayami · Bonnie · …" in CONTENT, "Unanalysed portraits" in CONTEXT (P2-1)
- **one metric, two names** — "Portrait fit" on the Visuals tab, "Card ↔ art match" in the dossier
- **one library, four denominators** — 327 (h1, Map) / 313 (h1, list header, rail) / 242 (families row,
  Visuals "Scored") / 204 (unused, rendered as 8)
- **near-duplicates in three places that count differently** — the rail says `2 found · 3 identical`,
  `duplicateCharacters` returns 1 row, `duplicateChats` 35, `imageDuplicates` 82
- **row disambiguation solved for chats, unsolved for characters** — `Ayami — Aug 18, 2025 (3)` vs a
  bare second `Yuki`

---

## What's genuinely working — do not touch

1. **The Map tab at population.** 327 points, five real genre categories, a keyed legend, a full
   327-row `<table>` fallback, and copy that names the affordance ("Click a card to open its dossier").
   The prior sweep's biggest chart complaint fixed itself the moment there was data, which is the
   correct outcome — the degraded case was the problem, not the design.
2. **The dossier.** Pitch, facets, card quality with a correctly-homed Refinery door, portrait
   alignment *with a definition*, tags, clickable similar-characters AND similar-art lists, and an Ask
   box. This is what the Archetypes tab (P2-5) should be modelled on.
3. **Search suggestions.** `dark sorceress` → `dark darksteel sorceress` / `dark sorceress sorceries` /
   `dark darkness sorceress`. Real query expansion, correctly exposed as a `listbox`.
4. **Duplicate chats rows.** `Ayami — Aug 18, 2025 (3) ↔ Ayami — Aug 19, 2025 (4) · forked · 100%` —
   the house rowQualifier rule, done right. Copy this to every character list.
5. **Keyboard + contrast held under 27× the data.** `fv=true` at every measured stop; h1 17.14:1
   (Hearth) / 15.56:1 (Light); family gloss 8.08:1 at 11px; label 16.40:1; `ASSERT no-overflow main:
   PASS overflow=0x0` at 1280×2400. Zero console errors, zero page errors, zero failed requests across
   all 19 runs.

---

## The single biggest opportunity

**Re-budget the landing page against what the data actually says.** The instruments make the
prescription unusually concrete: cut the keyword canvas from 1,616px to ~200px (P2-3), and spend the
1,400px you recover on the three facts the surface currently hides — 204 unplayed characters (P2-4),
52 models / 11,321 generations (P1-1), and the 85 characters in no visual family (the unexplained 242).
That single re-allocation retires P1-1, P1-4 (the 287ms block is that canvas), P2-3 and P2-4, fixes the
accent census, and turns the bottom half of the page from the weakest surface in the app into the part
that earns the section's own pitch.

---

## Retractions — findings I formed and killed

1. **"The list pane's default sort is reverse-alphabetical."** The catalog opens Yvri, Yuuna, Yumi,
   Yukie, Yuki, Yuki, Yui — unmistakably Z→A — under a combobox reading "Default". The server says
   otherwise: `sort = filter.sort ?? "recent"` → `[desc(characters.createdAt), asc(characterSummaries
   .characterId)]` (`packages/server/src/domain/discovery/verbs/browse.ts:75, :90-91`). It is
   **newest-first**, and it *looks* alphabetical-descending only because the ST import inserted 327
   characters in alphabetical order. **Killed as an ordering defect.** It survives, sharper, as the
   "Default" label finding: on an imported library the two hypotheses are visually identical, so the
   unlabelled control costs the user the ability to interpret their own list.

2. **"A keyboard user must Tab 313 times to leave the list pane."** The walk lands on the search input
   and then runs Yvri, Yuuna, Yumi… which looked like an unbounded trap. `catalogTabbables: 13` of 313
   — the list is virtualized (`listScrollH 3968`, one child wrapper) and a `Skip to content` button
   exists and works. **Killed, no defect.**

3. **"The '0 story themes' figure is rendered at hero weight beside a 'not run' row."** I read the
   figure pair off the screenshot. Computed: only the `8` matches at 24px; the `0` resolves smaller and
   de-emphasised. **Killed** — my eye, not a measurement. (The *semantic* half survives inside P1-3:
   the row says "not run" for a pass that ran.)

4. **`design-audit`'s 10 nested-card findings.** All 10 are false, in two mechanically-proven classes
   (deliverable 2 and 3). I did not forward a single one as a product finding, and I am routing both
   as tooling findings instead.

5. **Inherited from the brief: "all 10 analysis passes Succeeded."** `workloads.list` returns 18 rows:
   14 succeeded, **4 `worker_died`** (distill ×2, memory-backfill ×2). The brief's count is low and its
   status is incomplete. Corrected, and P1-3 rests on exactly that gap.

6. **Not a retraction but a caveat the next reviewer should not re-derive:** `sceneThemes: 0`,
   `arcThemes: 0`, `themeDrift: 0 rows` — the brief asked for "themes with real clusters" and **there
   are none on this database**, even though `compute-themes` succeeded. A source comment
   (`corpus-analysis-state.ts:269`) records a prior pass seeing "327 characters, distilled into 24
   story themes" on the audited library, so the theme data existed at some point and does not now.
   **That is a data-state question for the orchestrator, not a UI finding**, and I have filed no
   finding on an empty theme surface. The WRITING archetypes (a different pass) are fully populated —
   10 clusters covering all 327.

---

## Instrument coverage

| # | Instrument | Status |
| - | - | - |
| 1 | `snap --map` | **RAN** — landing (108 el, 20 DOM fallbacks), context panel (12 el, 0 fallbacks), mobile (28 el) |
| 1 | `snap --aria` | **RAN** — `main` ×3 states (landing, dossier, search), `[aria-label="Corpus list"]`, `[aria-label="Corpus details"]` ×5 tabs |
| 1 | `snap --contrast` | **RAN** — h1 17.14:1 (Hearth) / 15.56:1 (Light); family gloss 8.08:1 @11px; family label 16.40:1. `contrast-fails=0` on every judged run |
| 1 | `snap --eval` / `__orb` | **RAN** — 14 evals: tRPC census, family label/gloss DOM, walker-predicate replay, section geometry, similarity offsets, live regions, renders |
| 1 | `snap --json` manifest | **RAN** — `reports/snaps/root.json` (lossless console, `--checkpoint` scoped) |
| 1 | `snap --scenario` | **RAN** — 4 checkpoints (Visuals / Map / Similarity / Compare), one browser lifetime |
| 1 | `snap --expect-no-overflow` | **RAN** — desktop 1280×2400 `main`: PASS overflow=0x0 escapes=0. Mobile: `FAIL no rendered match` — **not a defect**, there is no `<main>` on the 430px default (LIST) pane; the CONTENT pane is one tap away |
| 1 | `snap --matrix` | **SKIPPED** — covered by 6 explicit arms (defaults/maximal/compact/reading/Light/mobile) at lower SSE-budget risk |
| 2 | `design-audit` desktop | **RAN** — `findings=10 p3=10 census=804 nav=OK`. 10/10 triaged FALSE except `line-length`; both FP mechanisms proven (deliverables 2+3) |
| 2 | `design-audit --mobile` | **RAN** — `findings=1 pointer=coarse census=257`, one flat-type-hierarchy P3. **No tap-target findings** |
| 3 | `motion-audit` | **RAN** — verdict FAIL, worst blocking **287ms**, 4 style/layout LoAFs, CLS non-virtualized 0.0004, 0 dropped, 0 dirty animations. Filed \[P1-4] |
| 4 | `perf-meter --click <primary>` | **SKIPPED, stated** — the surface's one primary action is "Run the passes again", which enqueues a real 327-character distillation on the owner's restored library. Read-only discipline. Interaction cost receipted instead via `motion-audit` + `__orb.renders()` + the scoped console |
| 5 | Lighthouse desktop + mobile | **SKIPPED, stated** — no finding here rests on an axe rule ours does not carry; contrast was measured directly on 4 elements across 2 themes, and the dev-server checker-overlay trap makes a Lighthouse a11y run net-negative on this route |
| 6 | `__orb.renders()` | **RAN** — `region:content 41/1/40 totalMs 132 maxMs 35`; `region:list 54/1/53` |
| 6 | `__orb.motion()` / `.animations()` | **RAN** via motion-audit — 0 active, 0 non-compositor-clean |
| 7 | Console triage table | **RAN** — see below. **0 errors · 0 page errors · 0 failed requests on all 19 runs** |
| 8 | The PNGs, actually read | **RAN** — 6 read in full: `pop-corpus-landing` (1280×2400), `pop-corpus-context`, `pop-corpus-light`, `pop-tab-similarity`, `pop-corpus-keywords-crop`, plus a sharp framebuffer census of `pop-corpus-full` (1280×4000) |
| 8 | Framebuffer pixel census | **RAN** — accent coverage via `sharp` raw buffer (canvas is invisible to DOM instruments; oklch defeats rgb-regex, so this is the only honest read) |
| 9 | Keyboard walk | **RAN** — 15 bare `--key Tab` stops with `document.activeElement` at each; `fv=true` at 15/15. Skip link present |
| 10 | Appearance arms | **RAN** — `defaults`, `maximal`, `compact`, `reading` (`pop-corpus-{maximal,compact,reading}.png`). `--full-motion`: **SKIPPED** (no entrance animation of its own; motion-audit read the live route un-probed) |
| 10 | Theme arms | **RAN** — owner default (`data-theme` absent) + `--theme Light` (`data-theme="light"`, `bodyBg oklch(0.98 0.004 75)`, h1 15.56:1 — computed polarity receipt, not eyeballed). `--theme none`: **SKIPPED** (owner default is already the null-attribute state on this restored db) |
| 11 | Pane-state arms | **RAN** — list docked + context collapsed (default) · list docked + context open · mobile list-only. **Desktop list-hidden and both-hidden: SKIPPED** — the empty arm covered both and found the same column model; no populated-only finding depends on them |
| — | Server truth `/api/_debug/*` | **SUBSTITUTED** — 401 to an uncookied curl; used in-page `fetch("/api/trpc/…?batch=1")` from the authenticated session (same principal as the render, a strictly better receipt) |

### Console triage

| Message | Count | Disposition |
| - | - | - |
| `[frame] long frame 110–145ms · blocking 37–95ms @ main.tsx` | 1/run | **BOOT, not corpus** — briefed as known; present on every route |
| `[drop] 54–103ms mid-animation · [data-slot=weave-veil] · svg[aria-label=Orbweaver]` | 3/run | **BOOT SPLASH** — briefed as known, global |
| `[cls] shift 0.0281–0.0286 unexpected · [role=region] / [data-slot=separator]` | 1/run | **BOOT bucket** — the HOME landing settling before the corpus switch. 0.0286 ≪ 0.1; `motion-audit` reads non-virtualized CLS **0.0004** on a direct corpus load |
| `[cls] 0.4522 / 0.0680 / 0.1090 input-adjacent (excluded from CLS)` | 3, panel/tab arms | **CORRECTLY EXCLUDED** — these are the detail-panel open and tab switches, i.e. user-initiated. Verdict CLS stays 0.0290/0.0000 |
| `[perf] slow commit region:content 13/22/23/36/38ms · region:list 14ms · region:context 16/19/21/124ms` | 8–10/run | **INVESTIGATE → filed \[P1-4].** Corpus's own. `region:context 124ms` lands on the similarity-graph render |
| `[frame] long frame 127–184ms · blocking 41–93ms @ modern-Cyfp2l7S.js` + `[reflow] forced sync style/layout 14–18ms` | 2/run | **INVESTIGATE → filed \[P1-4].** ECharts (`graphic-KEKgKdWt.js`) rendering the 1,616px keyword canvas |
| errors / page errors / failed requests | **0 / 0 / 0** | — across all 19 runs |

---

## Tooling findings routed (fix-tools-as-we-find-them-lying)

1. **`nested-card`: `CARD_CLASS_RE = /\bcard\b/i` over the whole class string overrides computed
   border-width.** `text-card-foreground` + `border-0` (the sanctioned `@orb/ui Card nested` arm)
   yields 8 guaranteed false positives on this route and is a whole-app class. Fix: computed-only
   `hasBorder`. Permanent pin: a committed fixture in `tests/tooling/ui-audit/` with a
   `border-0 text-card-foreground` node inside a bordered card, asserting **no** finding.
2. **`nested-card`: shell regions counted as cards.** `<aside class="shell-panel">` (border on ONE
   side, radius 0, no shadow) is the outer "card" for finding #1. Fix: exclude landmark/shell regions.
3. **`nested-card`: `isInteractiveIsland` cannot see a wrapper AROUND a control** — `matches()`+
   `closest()` are self+ancestors only, while the code comment claims the case is covered. Fix: add a
   `querySelector` arm; pin with an input-group fixture.

All three should carry a clean-surface re-run distinguishing fixed-FPs from newly-visible real
findings, per the zero-hygiene contract.
