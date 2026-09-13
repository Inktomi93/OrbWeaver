---
kind: review
status: active
updated: 2026-08-18
---

# Corpus consolidation — design proposal (Analytics + tag management into Corpus)

> **Commission:** issue #159 (owner-ordered design research, 2026-08-17 overnight). Owner verbatim:
> *"Analytics and tag management need to be wrapped into Corpus somehow. But it needs to be clean and
> make sense and look good… using our three sections: List | Content | Context — or if it only calls
> for one or the other then call that one. The surfaces need refined and redesigned. Also… analyzed
> schemes and memories etc — clicking on them does literally absolutely nothing."*
> Companions: #160 (dead artifact rows), #154 (archetype "Unknown"/"mixed"), #155 (the understanding
> button navigates instead of running). Lane: `corpus-design`. Research only — no product code changed;
> the one state change (memory enable + four enqueued jobs) was owner-authorized mid-commission and is
> receipted in §1.4.

---

## §1 Inventory — what exists today (receipted)

### 1.1 Analytics (rail section `analytics`, feature `features/stats`, domain `stats`)

Definition: `packages/client/src/features/stats/lib/analytics-section.tsx` — rail group `insight`,
`panelDefaults: { list: "collapsed", context: "collapsed" }`, mobile `sheet`.

| Pane | Surface | Data (verbs) | Interactive? |
| - | - | - | - |
| LIST (collapsed by default) | character leaderboard + 4-axis sort toggle (Replies · Gen time · Swipes · Recent) | `stats.leaderboard` | rows CLICKABLE → drill into CONTENT (`analytics-list-surface.tsx:69-89`) |
| CONTENT (none drilled) | overview dashboard: "Year in review" stat figures (characters/chats/words/replies/swipes/forks/spend/gen-time) · top-character callout · Rhythm (streaks) · Economics figures · Momentum rising/falling bars · "Recompute now" | `stats.freshness` · `wrapped` · `overview` · `momentum`; recompute = `stats.reconcile` (`analytics-overview-surface.tsx:41-152`) | top-character callout row is a DEAD ListRow (`:82-92`, no `clickable`); momentum bars non-interactive (BarList) |
| CONTENT (drilled) | one character's economics: Activity/Economics/Latency figure rows + Back | `stats.character` · `stats.latency({kind:"character"})` (`analytics-character-surface.tsx:40-113`) | figures only; no door to the character itself |
| CONTEXT (3 owner-scoped tabs, ignore the drill) | **Models**: owner latency figures + generations bar-list + per-model breakdown rows (`analytics-models-tab.tsx`) · **Time**: daily histograms + weekday bars + 7×24 heatmap (`analytics-time-tab.tsx`) · **Personas**: usage bars + per-persona rows (`analytics-personas-tab.tsx`) | `stats.byModel` · `latency({kind:"owner"})` · `timeseries` · `temporal` · `activityHeatmap` · `personaUsage` | model rows DEAD (`analytics-models-tab.tsx:53-68`) · persona rows DEAD (`analytics-personas-tab.tsx:41-52`) · charts non-interactive |

Live census (dev stack, 2026-08-17 22:29, `--goto analytics`, whole-DOM sweep of
`[data-slot=list-row-content]` → parent tag): **108 ListRow bodies; 57 `<BUTTON>` (all leaderboard
rows), ~51 `<DIV>` (static): the Hikari top-character callout + every model-breakdown row**
(scratch log `cd-analytics.log`; shots `reports/snaps/cd-analytics-overview.png`,
`cd-analytics-list-context.png`). Live figures: 328 characters · 895 chats · 7M words · 11.7k replies
· 65.1k swipes · 503h generating.

The context header (`analytics-context-header.tsx`) names the drilled character — the ONLY thing the
context panel does with the selection; the three tabs are selection-blind dashboards.

### 1.2 Corpus (rail section `corpus`, feature `features/discovery`, domain `discovery`)

Definition: `packages/client/src/features/discovery/lib/corpus-section.tsx` — rail group `primary`,
`panelDefaults: { list: "docked", context: "collapsed" }`, mobile `sheet` (owner decision H2).

| Pane | Surface | Data | Interactive? |
| - | - | - | - |
| LIST (docked) | search omnibox + target picker (Characters · Scenes · Memories · Images · Text) + typeahead; empty-query rest = the facet BROWSE view (genre/tone/tag/sort selects over the distilled catalog) | `search.suggest` · `search.search` (unified) · `search.fields` (BM25) · `discovery.characterFacets` · `catalog` · `browseCharacters` | character/scene hits + browse rows CLICKABLE → dossier; **Memories (digest) hits DEAD** (`corpus-search-results.tsx:270-281`, "read-only preview"); **Images hits DEAD** (`:283-293`) |
| CONTENT (none selected) | the Cartographer home (#102 leg 3, `corpus-home-surface.tsx`): masthead + hero/support figures (`corpus-analysis-state.ts` phase machine) · the understanding INVITATION (focal while un-analysed; #155's button) · the visual FAMILY MAP (8 plates) · READINESS rail (families/distilled/story-themes/duplicates) · gem tiles · story-theme rows + inline detail card · All-story-themes bars · keyword explorer · catalog facet bars · never-played list · model-economics bars | `discovery.home` · `catalog` · `visualArchetypes` · `forgottenGems` · `unusedCharacters` · `modelRouting` · `themes` · `themeDetail` · `topKeywords` · `cooccurringKeywords` | gems/never-played/theme-member rows clickable → dossier; theme rows → INLINE detail card (nonuniform); **family plates deliberately read-only** (`corpus-family-map.tsx:29-31`); all BarLists non-interactive |
| CONTENT (character selected) | the dossier (`corpus-dossier-surface.tsx`): identity + facets + refinery score + portrait alignment + tags + keywords + similar characters + similar art + the ASK panel | `characterDossier` · `characterKeywords` · `search.similarArt` · `askCard` | neighbour/art rows clickable → dossier; tags render as inert Badges |
| CONTEXT (5 owner-scoped tabs, ignore selection) | **Archetypes** (writing + art clusters, k-knob, member face strips) · **Visuals** (portrait fit + caption-facet explorer) · **Map** (PCA scatter) · **Similarity** (nearest pairs + duplicate chars/art/chats) · **Compare** (2-picker facet diff + deep compare) | `archetypes` · `visualArchetypes` · `portraitAlignment` · `imageFacets` · `charactersByImageFacet` · `corpusProjection` · `similarityGraph` · `duplicateCharacters` · `imageDuplicates` · `duplicateChats` · `compareCharacters(Deep)` | **cluster cards DEAD** (member names printed as a plain-text wall, `corpus-archetypes-tab.tsx:146-183`); **pair rows DEAD** (`corpus-similarity-tab.tsx:177-205` — names not clickable, no diff door); Map points clickable → dossier (`corpus-map-tab.tsx:53`); Visuals worst-art/facet-drill rows clickable → dossier |

Live state at drive time (`reports/snaps/cd-corpus-home.png`, `cd-corpus-archetypes.png`,
2026-08-17 22:28): **un-analysed** — 327 imported characters, 0 distilled, story themes not run,
focal = invitation (probe `data-corpus-focal="invitation"`). The Archetypes context tab live-renders
the #154 defect verbatim: ten clusters ALL labelled "mixed", member walls of "Unknown, Unknown, …"
beside identical "U" fallback avatars — while the CONTENT family map (same underlying
`visualArchetypes` read) shows real names and portraits. Console: `discovery.archetypes` → 10 rows,
`visualArchetypes` → 8 rows, `browseCharacters` → 0 rows, `topKeywords` → 0.

### 1.3 Tag management — where it actually lives

**NOT settings.** Tags migrated out of the settings modal at config-rail R1 (built 2026-08-02,
`docs/design/config-rail-spec.md` §0; ruling D114 as amended by that migration). Today:

- **Management home = the `config` rail section** ("Configuration" workspace): the `tagCollection`
  `CollectionContribution` (`features/tag/lib/tag-collection.tsx`) — roster group "Tags **551**" with
  create/filter, a full member EDITOR mounted in CONTENT (`tag-member-surface.tsx`: rename · two
  colour pickers · folder type · hide-on-card · merge · delete), `context: {kind:"none"}` with its
  own copy ("a tag applies wherever you put it"). Live: `reports/snaps/cd-config-roster.png` — the
  roster reads Tags 551 · Regex scripts 15 · World Info 59, and the welcome hero's chip wall is the
  tag usage top-12 (Female 205 · NSFW 205 · OC 141 · …).
- **Tag ANALYTICS already leak into Corpus**: `catalog.topTags` renders as the browse tag-filter and
  the "Top tags" bar-list on the corpus home (`corpus-browse-view.tsx:60-63`,
  `corpus-home-charts.tsx:210-219`); dossier tags render as inert badges.
- **The one live tag↔discovery bridge**: `discovery.suggestCharacterTags` (AI tag proposals) is
  consumed ONLY by the character feature (`features/character/hooks/use-tag-suggestion-mutations.ts:51`),
  landing as `tag.listPendingSuggestions` rows on the character context — the "proposed = a status"
  seam (Core-0 §6 partitioning row, `Core-0-Architecture-and-Structure.md:212`).

### 1.4 The pipeline-state axis + what this commission ran (owner-authorized)

Every corpus/analytics surface sits on a DERIVED-DATA pipeline, and the #154/#155 doctrine (gate the
surface on pipeline state, honestly) applies to the whole consolidated design. The producer
vocabulary, read live off the Run-a-job picker (Settings → Jobs): Index (embeddings) · Distill
characters · Compute themes · Memory backfill · Group character backfill · Find duplicates ·
Similarity calibration (CSLS) · Assets backfill · Import from SillyTavern · Reconcile stats ·
Databank ingest · Databank reindex · Score the library (Refinery) + maintenance kinds
(Compute co-occurrence · assets GC/integrity · Refresh model catalog).

State changes made under the owner's mid-commission authorization ("it can index a few memories and
run all the analytics and summarizers…"), all through the real Jobs UI:

1. **Memory enabled** — `Remember earlier in long chats` was **OFF** (prior state; the earlier
   Memory-backfill run consequently reported "0 segments · 0 digests"). Flipped ON and left ON
   (owner opt-in), verified `[checked]` (scratch `cd-memory-verify.log`).
2. **Enqueued**: Distill characters (running from 22:33) → Compute themes (chained via the picker's
   real "Run after these complete" dependsOn UI — the exact mechanism #155's fix needs) → Memory
   backfill → Find duplicates. Receipts: scratch logs `cd-run-{distill,themes,backfill,dupes}.log`.
3. Jobs are SERIAL per user (singular lane): distill over 327 cards is model-backed per item and was
   still running at report-draft time; the populated-state captures are in §1.6.
4. **Finding while watching**: `workloads.list` progress payloads are message-only
   (`{"message":"distilling character summaries"}` — no N-of-M), so neither the Jobs pane nor any
   future #155 progress card can show completion fraction without a producer-side progress write.

### 1.5 The dead-end census (#160) — every artifact row and what clicking does

Method: whole-DOM parent-tag sweep of ListRow bodies (a non-clickable `ListRow` renders a static
`<div>` body — `packages/ui/src/primitives/list-row/list-row.tsx:304-306`) + full-file reads of every
render site. The "looks clickable" mechanism is precise: inert rows carry the IDENTICAL row anatomy
(leading/title/subtitle/actions, same box) as clickable siblings often on the same surface, differing
only in cursor/hover — an affordance difference below noticeability at a glance.

| # | Artifact row | Where | Today on click | Receipt |
| - | - | - | - | - |
| 1 | Character rows (leaderboard · browse · gems · never-played · worst-art · facet drill · neighbours · similar-art · map points) | both sections | WORKS → drill/dossier | e.g. `analytics-list-surface.tsx:75`, `corpus-browse-view.tsx:144` |
| 2 | Top-character callout | analytics overview | **NOTHING** | `analytics-overview-surface.tsx:82-92` (no `clickable`); census DIV |
| 3 | Model breakdown rows (~50) | analytics CONTEXT Models | **NOTHING** | `analytics-models-tab.tsx:53-68`; census DIV ×~48 |
| 4 | Persona breakdown rows | analytics CONTEXT Personas | **NOTHING** | `analytics-personas-tab.tsx:41-52` |
| 5 | Writing/art archetype clusters + member-name walls | corpus CONTEXT Archetypes | **NOTHING** (members are a plain-text join) | `corpus-archetypes-tab.tsx:146-183`; shot `cd-corpus-archetypes.png` |
| 6 | Visual family plates | corpus CONTENT family map | **NOTHING** — deliberately read-only, reason recorded ("no family dossier exists") | `corpus-family-map.tsx:29-31` |
| 7 | Story-theme rows | corpus home | works, but NONUNIFORMLY → inline detail card mid-page | `corpus-home-surface.tsx:279-291,294-351` |
| 8 | Nearest/duplicate pairs (chars · art · chats) | corpus CONTEXT Similarity | **NOTHING** (text row; no diff, no dossier door) | `corpus-similarity-tab.tsx:177-205` |
| 9 | Memory (digest) hits | corpus LIST Memories search | **NOTHING** ("read-only preview") | `corpus-search-results.tsx:270-281` |
| 10 | Image (caption) hits | corpus LIST Images search | **NOTHING** | `corpus-search-results.tsx:283-293` |
| 11 | Scene evidence snippets | corpus LIST Scenes search | quote text only (the hit row above them works) | `corpus-search-results.tsx:254-265` |
| 12 | Every bar-list bar (themes · keywords · catalog facets · momentum · by-model · weekday · routing) | both sections | **NOTHING — by construction**: `BarList` exposes no item-click API at all | `packages/ui/src/charts/bar-list/bar-list.tsx:12-23` (contrast `Scatter.onPointClick`, `corpus-map-tab.tsx:53`) |
| 13 | Dossier tag badges | corpus dossier | **NOTHING** | `corpus-dossier-surface.tsx:127-137` |

Owner's "analyzed schemes" reads as the archetype/theme cluster class (rows 5–7); "memories" is row 9.

### 1.6 Populated-state captures (after the jobs landed)

Executed ordering (receipts: scratch logs `cd-run-*.log`, `monitor-jobs` poll log): **Distill
characters** (succeeded — `{scanned: 327, written: 313}`, 14 skipped "no card text to summarize")
→ **Compute themes #1** (chained on distill; succeeded with `{scanned: 0, written: 0}`) → **Memory
backfill** (running at draft time) → **Find duplicates** (queued) → **Compute themes #2**
(re-enqueued per the owner's mid-commission ordering addendum, chained on Memory backfill via the
dependsOn door — the corrected sequence).

**Pipeline-dependency finding (load-bearing for #155 and the invitation copy):** Compute themes is
"k-means over the DIGESTS" (`packages/server/src/domain/discovery/workload-contributions.ts:72,82` —
`scanned` IS `digestsAssigned`), so story themes require MEMORY DIGESTS, which require memory
enabled + backfill (or organic long-chat play). The invitation prose — *"Run Distill characters,
then Compute themes — both read the same portrait and card embeddings the families already use"*
(`corpus-understanding-invitation.tsx:63-65`) — **misstates the themes dependency**, and #155's
planned distill→themes chain reproduces my 0-written run on any digest-less library. The honest
chain is: enable memory → Memory backfill → Compute themes (distill is a sibling, not a
prerequisite). Themes #1 succeeding with 0 written also shows the workload reports "Succeeded" for
a semantically-empty pass — the readiness rail, not the job status, is where the truth surfaces.

**The distilled state, captured live** (`reports/snaps/cd-corpus-home-distilled.png`,
`cd-corpus-archetypes-distilled.png`, `cd-corpus-dossier.png`, 2026-08-17 22:46-22:52):

- Corpus home flipped to the analysed phase exactly as designed: focal moved invitation → familyMap
  (probe `data-corpus-focal="familyMap"`), hero "313 distilled", family plates carry REAL labels
  ("wholesome slice-of-life" · "lighthearted fantasy" · "melancholic fantasy"), browse list
  populated (200 rows) with elevator-pitch subtitles, readiness rail: families ✓ 8 · distilled ✓
  313 of 327 · story themes not run · near-duplicates none found.
- The Archetypes CONTEXT tab now shows real cluster labels, real member names, varied faces and tag
  chips — **#154's "Done when" state confirmed live post-distill** (1 residual "Unknown" leaf node
  ≈ the skipped no-text cards). The "mixed"/Unknown soup was the UN-DISTILLED state degrading
  (hypothesis 2 dominant), and the same capture re-demonstrates the 320px cram (defect §3.2).
- The dossier (Yvri): facets + pitch + tags + similar characters — and **every similar-character
  score renders `0.00`** (all four neighbours), suspicious but UNCONFIRMED as a defect (possibly
  CSLS/hub-score uncalibrated — the Similarity calibration job has never run on this corpus; left
  as a lead, not a finding). "No keyword profile computed yet" — keywords are digest-fed too.
- The provenance receipt for judgment defect 7 is in the same distilled home shot: the no-portrait
  cluster ("?" faces ×19) labelled "melancholic fantasy".

**Final job results (all terminal, 2026-08-17 ~23:06):**

- **Find duplicates SUCCEEDED** — `{scanned: 768, written: 30}`. The Similarity tab now renders
  live pairs (`reports/snaps/cd-corpus-similarity-final.png`): exact self-duplicates at cosine 1.00
  (Seraphina↔Seraphina, Freya↔Freya) down through 0.79 — and every one of those pair rows is the
  §1.5 row-8 dead end, now receipted POPULATED (twenty findings on screen, no way to act on any).
  Final home state: `cd-corpus-final.png`.
- **Memory backfill WORKER_DIED** — "worker heartbeat went stale — row reaped (worker_died)" after
  ~30 min of sweeping. Cause per the orchestrator: a server restart from a merge killed the worker
  (engine-honest reaping, not a model failure). Zero digests existed at this capture; the memory-fed
  surfaces (story themes, keywords, Memories search) remained pipeline-empty. **Queue custody then
  moved to the orchestrator** (owner deconfliction): a fresh vLLM-pinned Memory backfill was running
  at lane close with Compute themes to follow — the themed/memory-fed state lands post-backfill and
  was not waited on; the mockup lane should re-capture it.
- **Compute themes #2 FAILED (skipped)** — "a dependency did not succeed … the dependent cannot
  run" — the chaining behaved exactly as the dialog promised.
- **Design implication (feeds §4.5):** the corpus readiness rail still reads "Story themes — not
  run", which is now UNTRUE in the way that matters — two runs were attempted; one died, one was
  skipped. The rail's stages must distinguish *not run* / *running* / *last run failed (with the
  Jobs door)* — today the failure is visible only inside Settings → Jobs, and a user who clicked
  \#155's future one-click button would watch nothing happen twice with no explanation on the
  surface they clicked it from.

### 1.7 Unwired server surface (evaluate-intent, not delete — constitution §1)

- `discovery.swipeHotspots` (per-chat) and `discovery.similarChats` (per-chat) have ZERO client
  consumers (Grep + ast-grep both languages, scannedFileCount 524 tsx / 451 ts, 0 matches). Both are
  chat-level analysis artifacts — natural feeders for a chat-scoped inspector in this design (§7).
- `browseCharacters`' `q` param is deliberately client-unsent (`corpus-browse-view.tsx:8-13`).

---

## §2 The law underneath (what bounds any merge)

1. **Domain seams are untouched by UI co-location.** stats = turn economics, ZERO vector tables;
   discovery = semantics; they share no tables (`Knowledge-Cluster.md` invariant 5,
   `stats-no-vector-tables`). Tags = labels, and analytics facets are a SEPARATE concept
   (`Core-0-Architecture-and-Structure.md:212`). This proposal merges SECTIONS and feature-tier
   rendering only; routers/contracts/schema do not move.
2. **Cross-feature server reads are the sanctioned channel** — the router IS the cross-feature
   contract, cache-first (`client-architecture-lockdown.md` §12 row 2, D43(3)). A merged corpus
   feature reading `trpc.stats.*` is legal by design; no contract merge required.
3. **The rail ceiling is a rule about KIND, not a count** (D121, `Core-Path-Registry.md:156`): a
   section owns a top-level workspace. Two read-only library-insight workspaces are one KIND — the
   merge is D121-aligned, not just permitted.
4. **Section retirement is a proven one-way-safe move**: config-rail R2 removed `worldInfo` from
   `SECTION_IDS` with a `RETIRED_SECTION_HEAL` row; the databank D-0 header records "demoting later
   is one file plus a heal row — exactly the move R2 already made" (`databank-section.tsx:6-20`).
5. **The SECTION_IDS coupled-site playbook** (`client-architecture-lockdown.md` §6a, ten steps) is
   the mandatory walk for the tuple edit; `feature-owns-definition` (G23/O2) deletes a feature dir
   that owns no definition — `features/stats` must dissolve or re-earn.
6. **CONTEXT law**: "detail + config OF CONTENT's active artifact… never navigation"
   (side-eye §14; `UI-Architecture-and-Layout.md` §4.2). Both sections currently bend this with
   selection-blind dashboard tabs; §4.2's grid blesses the current shape, so the redesign AMENDS
   those two grid rows (a doc edit, not a violation of standing law elsewhere).
7. **Density law** (`docs/design/density-pass-spec.md`): tier per surface class, CD1 (no boxes on
   read-only groupings), CD2 (one box deep), CD3 (one focal per surface), the voice axis. The
   corpus home already complies (#102 leg 3); the merged surfaces are specified against it in §4.
8. **Understanding-pass gating** (#154/#155, `corpus-analysis-state.ts`): one surface whose focal
   and sections are phase-driven — the pattern generalizes to every merged pane (§4.5).
9. **Config-rail rulings**: tags/regex/world-info live in the Configuration workspace (R1/R2,
   spec §2 C-11: settings homes vacated, "nothing tombstones"); presets NEVER join a
   workspace (ruling C5).

---

## §3 Judgment — what is actually wrong (the defects the redesign must clear)

1. **Two half-dossiers of one artifact.** A character's semantic understanding (dossier) and its
   economics (analytics drill) are the SAME artifact split across two rail sections with no door
   between them — the IA-single-homing defect (§13 side-eye lens), and the strongest single argument
   for the merge.
2. **The CONTEXT panel is being used as a dashboard shelf, twice.** Eight owner-scoped,
   selection-blind report tabs (5 corpus + 3 analytics) cram instrument content into a fixed
   ~320px column (the archetypes shot: full member walls wrapped to 3-line runs; the Map scatter at
   postage-stamp size), while CONTENT sits idle beside them. This inverts the shell physics (CONTEXT
   follows CONTENT) and is the root of "needs refined… look good".
3. **Artifacts are rendered as rows but not as DESTINATIONS.** Thirteen row classes (§1.5), five of
   them fully dead, because the analysis surfaces have no uniform "selected artifact" concept — only
   characters have a drill target (the dossier). Everything that is not a character dead-ends.
4. **The finder is split.** The corpus browse (semantic facets) and the analytics leaderboard
   (economic sorts) are both "rank/filter my characters" over the same rows; two panes, two
   vocabularies, no crossover ("most-played dark-fantasy card" is currently unanswerable).
5. **Readiness is split.** Corpus has the readiness rail; analytics has its own freshness line +
   "Recompute now"; memory coverage has NO surface at all (the 0-digest backfill was only
   discoverable in Jobs). One derived-data pipeline, three partial gauges.
6. **The un-analysed state renders differently per surface**: the home is honest (invitation), the
   context tabs are not (#154's "mixed"/Unknown soup), search targets degrade silently (a Memories
   search on a digest-less corpus just says "nothing matched" — indistinguishable from a true miss).
7. **Label provenance is illegible (owner critique, 2026-08-17 mid-commission).** Visual families
   are CLUSTERED from portrait embeddings but LABELLED from story distillation (genre/tone) — the
   post-distill capture shows the no-portrait cluster ("?" fallback faces, 19 members) wearing the
   narrative label "melancholic fantasy", and duplicate narrative labels across visually-clustered
   plates (`reports/snaps/cd-corpus-home-distilled.png`). The family map glosses its CLUSTER
   provenance ("Grouped from the portrait embeddings · <model>", `corpus-family-map.tsx:135-143`)
   but its LABEL provenance is silent — and `visualArchetypes` already carries the honest visual
   label source on the wire (`artStyle` · `palette` · `mood`, the VL caption facets —
   `corpus-archetypes-tab.tsx:88-95` maps them today). A derived surface that names one axis and
   silently borrows the other is how this shipped unnoticed.

---

## §4 The proposal — VARIANT 1 "The Observatory" (RECOMMENDED)

One rail section — **Corpus** — is the library observatory: *find → read → drill*. Analytics EXITS
the rail (9 → 8). `features/stats` dissolves into the corpus feature (client-tier move only; the
`stats` DOMAIN and router are untouched). All three panes earn their keep — this genuinely calls for
all three, and the answer to the owner's "or fewer panes" clause is: three, with CONTEXT finally
doing its lawful job.

### 4.1 LIST — ONE character finder (docked)

The omnibox + target picker stays the pane's heart (unchanged anatomy). The browse rest-state gains
the leaderboard's economics as ONE more axis, not a second pane:

- Facet selects (Genre · Tone · Tag) as today, **plus the Sort select absorbing
  `ANALYTICS_SORT_OPTIONS`**: Default · Recent · Name · Replies · Gen time · Swipes. One finder
  answers both vocabularies. (`stats.leaderboard` remains the data path for economic sorts —
  server-side ranked; the UI dispatches per sort exactly as the search targets already dispatch per
  engine, `corpus-search-targets.ts` precedent.)
- Rows keep the leaderboard's trailing datum (replies · tokens) when an economic sort is active —
  the row meta follows the sort axis, instrument-tier `datum` voice.
- Search targets unchanged (Characters · Scenes · Memories · Images · Text) — but every hit class
  becomes selectable (§7).

Density: LIST-pane instrument tier as mapped (`density-pass-spec.md` §3.1 row 2 — selection is bg
tint, `rounded-control`, no row boxes). The band stays title + count (read-only census, no create —
A2 holds).

### 4.2 CONTENT — the overview, the report rack, and the merged dossier

CONTENT has three states, driven by the kinded selection (§4.4):

**(a) Nothing selected — the Observatory overview.** The Cartographer composition survives intact
(masthead + hero · invitation/family-map focal swap · readiness rail · gems). Two deltas:

- The readiness rail becomes the ONE derived-data gauge (§4.5) — it absorbs analytics freshness
  ("Stats rollups — updated 1h ago") and memory coverage ("Memories — not built · run backfill"),
  each row with its quiet run/re-run door (riding #155's direct-enqueue mechanism once that lands).
- An **Activity pulse band** joins below the gems: ONE compact instrument strip of the wrapped
  headline figures (replies · words · spend · streak — `datum` voice, kicker band, boxless per CD1)
  with a "Full activity →" door into the Activity report. The overview does NOT absorb the whole
  dashboard — one band, one door (the invitation/rail already spend the page's focal budget; CD3).

**(b) A REPORT open — the report rack.** The eight context dashboards become CONTENT pages under one
feature-internal rack (the Presets tabbed-editor precedent, §4.2 grid row "Presets"):

| Report | Absorbs | Composition (instrument tier, CD1 kicker bands, no boxes) |
| - | - | - |
| **Archetypes** | corpus Archetypes tab + the family map's "All families →" | k-knob · writing + art cluster bar-lists · cluster ROWS (label · facets · size · face strip) — each row SELECTS the cluster into CONTEXT |
| **Visuals** | corpus Visuals tab | portrait-fit figures + worst-art rows (→ dossier) · caption-facet explorer; facet VALUES select into CONTEXT |
| **Map** | corpus Map tab | the PCA scatter at real size (the single biggest visual win of the move — an aspect-square chart in the fluid hero instead of a 320px column); points → dossier |
| **Similarity** | corpus Similarity tab + Compare | nearest-pair + duplicate rows (chars · art · chats) — each PAIR selects into CONTEXT where the compare machinery renders the diff; the standalone Compare tab dies, its two pickers become the pair-inspector's "pick any two" fallback |
| **Activity** | analytics CONTENT dashboard + Models/Time/Personas tabs | Year-in-review figures · economics figures · momentum columns · models bar-list + rows (→ CONTEXT) · personas bar-list + rows (→ CONTEXT) · time histograms/heatmap. Sub-grouped by kicker bands, one scroll — NOT three tabs (the tab split was a context-width artifact; in the fluid hero the three dimensions are sections of one report) |

Rack navigation: a quiet segmented control under the CONTENT band (Overview · Archetypes · Visuals ·
Map · Similarity · Activity) — feature-internal view state on the corpus selection store (a kinded
axis, the config C-3 precedent), NOT shell vocabulary and NOT context tabs (`contextTab` stays an
opaque host-interpreted string; §5 rule 5's vocabulary test keeps this out of the shell store).

**(c) A CHARACTER selected — the merged dossier.** The existing dossier + a "How you play them"
band: `stats.character` + `stats.latency({kind:"character"})` figure rows (the whole
`analytics-character-surface.tsx` content) fold in under a kicker band between "Card quality" and
"Similar characters". One artifact, one page — kills defect §3.1. The dossier's tier stays `form`
with instrument islands (as built).

### 4.3 CONTEXT — the artifact INSPECTOR (follows content, at last)

The five corpus tabs and three analytics tabs LEAVE the context panel. CONTEXT becomes
`{kind:"single"}` over the kinded selection — the inspector for whatever artifact is selected in
LIST or CONTENT:

| Selected artifact | Inspector body | Doors (≥1, always) |
| - | - | - |
| character | compact identity + headline facets + top figures (the dossier is CONTENT; the inspector is the glance) | Open dossier · Start chat (cross-section seed) |
| archetype cluster / visual family | label · facet line · size · FULL member list (clickable rows) | member → dossier |
| story theme | name · level · size · member rows (absorbs the home's inline `ThemeDetailCard`, which retires) | member → dossier |
| model | `byModel` row detail: provider · generations · tokens · cost · characters-used-with | (data-only; door to Connections deferred — see §10) |
| persona | usage detail: chats · messages · tokens · last-used | Manage personas (settings deep-link) |
| pair (duplicate/nearest — chars, art, chats) | the compare diff (`compareCharacters` for character pairs; title/relation for chat pairs) + Deep compare | each side → dossier / open chat |
| memory (digest hit) | digest text · tier · source chat · keywords | Open chat (`setActiveSection("chats")` + select — physics rule 4) |
| image (caption hit) | the avatar at size · caption · owning character | → dossier |
| keyword | count + co-occurring keywords (the explorer's drill) | Search corpus for it (seeds the omnibox) |
| tag (from the tag lens, §6) | usage breakdown by entity type + co-used tags (`catalog.tagPairs`) | **Manage in Configuration** (cross-section jump to the tag member editor) |
| nothing | the context-empty arm teaches: "Select anything — a character, a cluster, a pair — to inspect it here." | — |

Mechanism: ONE `ContextDefinition` `{kind:"single"}` whose body switches exhaustively
(`assertNever`) on the selection union — or a `defineContextTabs` mint with per-kind `when`
predicates; both ride existing shell machinery, no new arm. Panel default stays `collapsed`;
selecting any artifact calls `revealContextPanel` (the exact pattern the family map's "All
families →" button already uses, `corpus-family-map.tsx:149`). The context BAND names the artifact
(the `header` slot — N4), replacing today's static "Corpus".

**The uniform law this buys (kills #160 by construction): every artifact row is a SELECT that
drives the inspector, and every inspector carries at least one door.** Charts stay readouts where a
row twin exists; where the chart is the only rendering (theme sizes, momentum), `BarList` gains an
optional `onItemClick` — a one-prop `@orb/ui` delta with the `Scatter.onPointClick` precedent
(`corpus-map-tab.tsx:5-6` records why the primitive, not a raw SVG, must carry the interactivity).

### 4.4 State machinery

- `corpus-selection-store` grows from `characterId` to a kinded artifact union
  `{kind, id} | null` — the config workspace's kinded drill selection is the shape precedent
  (config-rail-spec C-3; `createDrillSelectionStore` kinded overload). `SectionDefinition.selection`
  / `useSelectionTitle` (the mobile pushed-frame contract) read the same union.
- The report-rack view is a second axis on the same store (view: overview | archetypes | … ), NOT
  persisted shell vocabulary.
- Mobile (`"sheet"`, H2 unchanged): the ONE-SHELL rule pushes the dossier/report as today; the
  inspector folds into CONTENT below the shell breakpoint exactly as the config context arm does.

### 4.5 The unified readiness rail + phase gating (the #154/#155 doctrine, generalized)

`corpus-analysis-state.ts` extends from four stages to the full producer set the section renders:

| Stage row | datum source | door |
| - | - | - |
| Visual families | `visualArchetypes` | (indexer-driven; no door) |
| Distilled — genre, tone, pitch | `catalog.totalDistilled` | run/re-run understanding pass (#155 direct enqueue) |
| Story themes & keywords | `home.topSceneThemes/topArcThemes` | (chained with the pass) |
| Near-duplicates | `home.duplicateCounts` | Find duplicates |
| **Stats rollups** (NEW) | `stats.freshness` | Recompute (the existing `stats.reconcile` — `analytics-overview-surface.tsx:131-152`'s single-flight/CONFLICT handling moves with it) |
| **Memories** (NEW) | digest/segment coverage (needs a cheap count read — the one small server addition this design asks for; today only the Jobs result line says "0 digests") | enable memory (settings deep-link) / Memory backfill |

Every REPORT page and every search TARGET gates on its stage: un-run ⇒ the honest teaching state
with the run affordance (`CorpusRunJobEmptyState` / `CorpusDistillEmptyState`, already built), never
fallback soup (#154) and never a silent "nothing matched" (a Memories search on a digest-less corpus
says "You have no memories yet — memory is off / run the backfill", distinguishing pipeline-empty
from true-miss the same way `corpus-browse-view.tsx:78-83` already distinguishes undistilled from
over-filtered).

### 4.6 Rail identity

`corpus` keeps its id, label and `Library` icon, group `primary` (it remains the primary
browse/search destination; the insight group loses its only member with analytics' exit). The
placeholder copy is re-derived to name the merged scope ("Search, understand, and measure your
library…" — distinct-copy gate applies). The `analytics` rail cell dies; `ChartColumn` returns to
the icon pool.

### 4.7 Provenance legibility (owner requirement, 2026-08-17 — a design LAW for every derived surface)

Judgment defect 7 generalized: **every derived surface states BOTH of its axes — what it is
computed OVER, and what its labels/scores derive FROM** — as a standing gloss line, so a
clustered-from-X-labelled-from-Y mismatch can never ship silently again. Concretely:

- **Visual families / art archetypes** re-label from the VL caption facets (`artStyle` · `mood` ·
  `palette` — already on the `visualArchetypes` wire), NEVER from story distillation; gloss:
  *"clustered from portrait embeddings · labelled from image analysis · <model>"*. A cluster whose
  members have no portraits says so ("no portrait art — grouped by absence"), instead of borrowing
  a narrative label. (The label-source FIX itself is server-side and owned by its own issue; this
  design consumes it and makes the provenance visible.)
- **Writing archetypes / story themes** gloss: *"clustered from card embeddings · labelled from
  distilled facets"* / *"clustered from memory digests"*.
- **Every inspector (§4.3) opens with its provenance line** — a `gloss`-voice sentence under the
  band, same pattern the family map half-has today.
- **The readiness rail (§4.5) names each stage's INPUT beside its output** ("Story themes — from
  memory digests · not run"), which is also what makes the pipeline dependencies legible (§1.6's
  themes-needs-digests finding): a user can see WHY a pass has nothing to chew.
- The invitation/run-affordance prose must state the true chain (see §1.6 — the current copy
  misstates the themes dependency).

---

## §5 VARIANT 2 — "The Wing" (fallback)

Analytics KEEPS its rail section; the merge happens only at the artifact level:

- The dossier absorbs the character economics band (§4.2c) and the analytics drill surface gains a
  "Open in Corpus" door (and vice versa).
- Both sections' context-tab dashboards still move to CONTENT racks in their own sections, and both
  gain the kinded inspector context (§4.3) — the dead-end kill and the density fixes do not depend
  on the section merge.
- LIST stays split (leaderboard in analytics, browse in corpus).

What it buys: no tuple edit, no feature dissolution, ~40% less migration surface. What it costs: the
owner's actual ask ("wrapped into Corpus") is unmet — two dashboards survive, the finder stays
split, and the one-KIND argument (D121) stands unanswered. **Recommended only if the owner wants
Analytics to remain its own destination.**

(A third variant — analytics as a corpus CONTEXT tab set — was considered and rejected without a
fork: it re-commits defect §3.2, the exact cram the owner is reacting to.)

---

## §6 The tags sub-fork (inside either variant)

The commission says tag management "wraps into Corpus"; the tree says tag management moved into the
Configuration workspace SIXTEEN DAYS AGO under owner-ruled config-rail R1 (§1.3) — the owner's
framing may predate that move ("find it — settings? library? both?" suggests the map is stale).
Both honest arms:

- **T-a (RECOMMENDED) — Corpus gets the tag LENS; management stays in Configuration.** Corpus
  renders tags as an insight surface: the browse tag facet + Top-tags chart (already built), a tag
  ROW list in the Catalog band of the overview (or a small "Tags" report page) where each tag
  selects into the CONTEXT inspector (usage breakdown + co-used tags) whose door is **"Manage in
  Configuration"** — a cross-section jump landing on that tag's member editor (`setActiveSection("config")`
  - kinded selection seed; the R1 deep-link posture, config-rail-spec §4). One management home
    (labels are authored in the workspace with regex/world-info — the "parts every chat is built
    from" story stands), one insight home (corpus), zero duplicated editors — the IA single-homing
    rule holds on both sides of the seam, and the domain law (labels ≠ facets) is visible in the UI
    shape itself.
- **T-b — full relocation.** The `tagCollection` contribution moves from the config door array into
  a corpus-hosted collection frame (corpus CONTENT gains a collection host for the one group).
  What it costs: unwinds a 16-day-old owner ruling; the Configuration workspace loses its founding
  and largest member (551 of 625 members) and most of its teaching story; a write-heavy
  immediate-commit editor (form tier) lands inside an insight section; and the collection-host seam
  gets a second consumer (the contract explicitly assumes ONE host consuming its registry whole —
  `collection-contracts.ts:26-28`). Pick only if the owner positively wants tag EDITING inside
  Corpus after seeing T-a.

---

## §7 Destination table — every artifact type (the #160 kill, by design)

| Artifact | Destination under V1 |
| - | - |
| character | CONTENT dossier (merged, §4.2c); inspector glance in CONTEXT |
| top-character callout | becomes clickable → dossier (also true under the #160 interim fix) |
| archetype cluster (writing/art) | select → CONTEXT cluster inspector; members → dossier |
| visual family plate | select → the SAME cluster inspector (the recorded "no family dossier exists" reason in `corpus-family-map.tsx:29-31` dies with the inspector's existence; plates stop being the one deliberate dead row) |
| story theme | select → CONTEXT theme inspector (inline detail card retires) |
| theme/keyword/momentum bars | `BarList.onItemClick` delta → same selects as their row twins |
| model | select → CONTEXT model inspector |
| persona | select → CONTEXT persona inspector; door → persona settings |
| duplicate/nearest pair (chars · art · chats) | select → CONTEXT pair inspector = the compare diff; sides → dossier / open chat |
| memory (digest) | select → CONTEXT memory inspector; door → open chat. (Message-level anchoring inside the chat is out of scope — no message deep-link seam exists today; the chat-level door is the honest v1.) |
| image (caption) | select → CONTEXT image inspector; door → dossier |
| keyword | select → CONTEXT keyword inspector (co-occurrence); door seeds the omnibox |
| tag | select → CONTEXT tag inspector; door → Configuration member editor (T-a) |
| scene evidence snippet | rides its parent hit row (chat-level door); per-message anchor deferred |
| chat-level artifacts (future) | `swipeHotspots` / `similarChats` (§1.7, currently unwired) are the natural feeders for a CHAT inspector arm when a chat artifact class lands — recorded as intent, not built |

Interim (#160, independent of the pick): the rows are ALREADY non-interactive `<div>`s
(no role, no tab stop — `list-row.tsx:304-306`), so the "stops rendering as interactive" arm is
mostly about VISUAL honesty; the cheap interim is a `presentational` row treatment (muted, no row
anatomy identical to clickable siblings) — but if the owner picks V1 promptly, wiring destinations
supersedes the interim.

---

## §8 Fences — what this design does NOT touch

- **Server domains, routers, contracts, schema**: `stats`, `discovery`, `search`, `tag` stay exactly
  as they are; the only server ask is one cheap memory-coverage count read (§4.5) — and even that
  can defer (the rail row can gate on the settings switch + last-backfill result line v1).
- **The knowledge-cluster invariants** (`Knowledge-Cluster.md`): one vector write path, the two
  cosine owners, the stats fence — unread by this design, unchanged.
- **The Configuration workspace machinery** (host, regex/world-info collections, the collection
  contract) under T-a; T-b touches only the door array + a corpus host frame.
- **Chat memory recall semantics** — corpus only reads digests through `search.search`; recall
  policy stays `chat/memory`'s.
- **Presets** (ruling C5: never joins), Refinery, Databank, Home — untouched.
- **The mobile bottom-bar curation** (corpus stays `sheet`; analytics' sheet entry simply vanishes).
- **The #154 name-join fix and #155 enqueue fix** land on the CURRENT surfaces first (their lanes
  own them); this design consumes their outcomes and does not block on them.

## §9 Migration order + the coupled sites a build lane hits

Mockup-first law applies: after the owner's pick, a MOCKUP lane draws the Observatory (overview ·
one report page · the inspector · the merged dossier · un-analysed vs populated states) before any
build. Then, stages, each independently green:

- **S1 — corpus-internal inversion** (no tuple edit): context tabs → CONTENT report rack;
  the kinded selection store; the inspector context; `revealContextPanel` retargets (the family
  map's door + `snap --context-tab` recipes and any CTs naming corpus context tabs are coupled
  sites); theme inline card retires.
- **S2 — the merged dossier**: `stats.character`/`latency` band into the dossier.
- **S3 — analytics exits the rail**: the §6a ten-step playbook walk — `SECTION_IDS` minus
  `analytics` + `RETIRED_SECTION_HEAL` row (the R2 precedent) · sanitizers · delete
  `analytics-section.tsx` + door row · fold `features/stats` surfaces into the corpus feature and
  delete the dir (G23 forces it — it owns no definition afterwards) · `analyticsSectionSelection`
  folds into the kinded store · `agent-nav` vocabulary (rejects `analytics`, and `snap --goto
  analytics` stops working — probe recipes update) · `tests/support/browser/ct-data-providers.tsx`
  fakeSection fold · mobile fate row · `assembleChrome` verify-only · placeholder-copy row deleted ·
  rail prose (`UI-Architecture-and-Layout.md` §4.1 count + §4.2 Corpus/Analytics grid rows AMENDED,
  D-entry minted). LIST gains the economic sorts (`ANALYTICS_SORT_OPTIONS` moves homes).
  **Test sweep owed**: repo-wide grep of `analytics` across `tests/**` (CTs assert the section, its
  testids, and the leaderboard) — the shared-value battery discipline.
- **S4 — Activity report + unified readiness rail + the §4.7 provenance glosses** (+ the tag lens
  under T-a; `BarList.onItemClick`
  ui delta with its CT).
- **S5 — density/side-eye polish** per surface against the mockups (side-eye is the polish
  authority; findings fixed in full per stage).

Known hazards for the build lanes: the `defineContextTabs` → `{kind:"single"}` change alters the
G3 surface (context-definition-shape arms) — the gate accepts `single` today, but the corpus CTs
asserting tab labels go red; `WORKLOAD_KIND_LABELS` copy is load-bearing in the invitation prose
(#155 will already have touched it); the S3 stage MUST squash nothing into the DB (no schema change
exists — if one appears in a lane diff, it is wrong by construction).

## §10 Not covered / open ends

- **No populated-state Compare/Ask drives**: `askCard` and `compareCharactersDeep` are model-backed;
  not exercised live this session (code-read only).
- **Model inspector doors**: whether a model row should door into Connections (the connection that
  serves it) needs the connection↔model resolution read — not investigated; the inspector ships
  data-only v1.
- **Message-level chat anchoring** for memory/evidence artifacts — no deep-link seam exists; out of
  scope (chat-level door only).
- **`--matrix`/mobile drives were not run** — the merged design's mobile behavior is specified from
  the ONE-SHELL/pushed-frame law + the config precedent, not from live mobile shots; the mockup lane
  should draw the sheet/pushed states.
- **Regions of code not read in full**: `features/stats/hooks/use-recompute-stats.ts` (read),
  discovery server verb INTERNALS (`verbs/*.ts` bodies beyond the router surface — the UI merge
  does not depend on them), the workloads engine internals.
- The corpus-state lane (#154/#155) may land changes under this report; every tree claim carries its
  read date (2026-08-17/18).

---

## Verified clean / method log

- Read IN FULL: agent-doctrine, Knowledge-Cluster.md, density-pass-spec.md,
  client-architecture-lockdown.md (all 712 lines), side-eye SKILL (§13-15 shell law), snap-driving
  SKILL, config-rail-spec.md, UI-Architecture §4.1-4.3, issues #154/#155/#159/#160, and every file
  under `features/stats`, `features/discovery` (all 23 tsx/ts), `features/tag` (collection + member
  surface), `features/config/lib/config-section.tsx`, `lib/collection-contracts.ts`,
  `state/shell-store.ts` (tuple), `databank-section.tsx` header, ListRow primitive + variants,
  BarList primitive, discovery/stats/tag routers.
- Ledger checks: D114 (tags re-home), D121 (rail KIND rule), Core-0 §6 partitioning rows 212/214,
  R2/`RETIRED_SECTION_HEAL` precedent, C5 (presets), C-11 (vacated homes). No existing D-entry rules
  the corpus/analytics merge itself — the question is genuinely open for the owner.
- Live drives (dev stack :5173, `pnpm snap`, all runs logged to scratch + `reports/snaps/cd-*`):
  corpus home/archetypes/memories-search, analytics overview/list+context, config roster, settings
  chat-behavior + workloads; the jobs enumeration and the four enqueues (§1.4).
- Absence claims: `swipeHotspots`/`similarChats` client consumers — Grep + ast-grep, scanned 524
  tsx / 451 ts, zero matches, positive control implicit (suggestCharacterTags found by the same
  method).
- Mid-commission orchestrator/owner directives folded in: the derived-data population authorization
  (§1.4), the themes-after-backfill ordering addendum (executed — themes #2 chained on the
  backfill), and the provenance critique (§3 defect 7 / §4.7).
- Docs hygiene: `check:docs` green on this file (formatter applied); `check:doc-catalog` reports the
  catalog stale for this NEW file plus a PRE-EXISTING `Core-Enforcement-Active-Gates.md` sha
  mismatch on the committed tree (not this lane's — `git status` shows only
  `docs/catalog/receipts/design.json` modified besides this report). `pnpm doc-catalog:write` is the
  orchestrator's integration step on the quiesced tree.

---

## Issue summary (for #159)

Design research delivered: `docs/reviews/stickler/2026-08-18-corpus-consolidation-proposal.md`.
Full receipted inventory of Analytics (stats), Corpus (discovery) and tag management (which lives in
the CONFIGURATION workspace since config-rail R1, 2026-08-02 — not settings), a 13-row dead-end
census with path:line receipts (kills #160 by design via a uniform artifact-inspector law), and the
live #154 receipt (context tab renders "mixed"×10/"Unknown" walls while the content family map shows
real names). Recommendation: **Variant 1 "The Observatory"** — Analytics exits the rail (9→8, the R2
`RETIRED_SECTION_HEAL` precedent), `features/stats` dissolves into the corpus feature (server
domains/contracts untouched), LIST becomes one finder (semantic facets + economic sorts), CONTENT
gains a report rack (Archetypes/Visuals/Map/Similarity/Activity) + a merged character dossier
(semantics + economics on one page), CONTEXT becomes the kinded artifact inspector (every row
selects, every inspector has a door), and the readiness rail unifies all derived-data gauges with
run affordances (#155's mechanism). Fallback: Variant 2 keeps the Analytics section, merges only at
artifact level. Tags sub-fork: T-a (recommended) — corpus gets the tag insight lens + "Manage in
Configuration" doors, management stays in the workspace; T-b full relocation costs an owner ruling
reversal and the workspace's founding member. Owner picks: V1 vs V2, and T-a vs T-b; then a mockup
lane (mockup-first law) before any build. Mid-commission the owner authorized derived-data
population: memory was enabled (was OFF) and Distill → Memory backfill → Find duplicates →
Compute themes (re-chained on the backfill per the owner's ordering addendum) were enqueued through
the real Jobs UI; the distilled state is captured live in §1.6 (#154's "Done when" confirmed
post-distill; the un-distilled "mixed"/Unknown soup was the ungated degradation). Two cross-issue
findings for their owning lanes: (1) Compute themes k-means over MEMORY DIGESTS
(`workload-contributions.ts:72`) — the invitation copy and #155's distill→themes chain both misstate
the dependency (themes needs memory backfill, not distill; a digest-less run "Succeeds" at 0
written); (2) the owner's provenance critique (visual families clustered from portraits, labelled
from story facets — receipted: the no-portrait cluster wearing "melancholic fantasy") lands as the
§4.7 provenance-legibility law: every derived surface states clustered-from AND labelled-from.
Also flagged: `workloads.list` progress is message-only (no N-of-M) — #155's live-progress card
needs a producer-side progress write; and dossier similar-character scores all render 0.00
(unconfirmed lead — CSLS calibration has never run).
