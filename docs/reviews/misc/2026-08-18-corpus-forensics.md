---
kind: review
status: active
updated: 2026-08-18
---

# Corpus as a product — forensic investigation (lane `corpus-forensics`) — 2026-08-18

**Read-only. No source file was changed.** Every number below was produced this session against the live
stack (client `:5173`, API `:8788`) on a library of **327 characters · 895 chats · 2,422 digests · 2,026
segments · 16 story themes · 8 visual families · 10 writing archetypes**. Every mechanism claim carries a
`path:line` receipt read on today's tree (HEAD `720b94c92`).

The commission: the owner's *"memories search-and-select is SUPER useful… not"* is **one symptom**; the
rail pass scored the surface 19/40 (`reports/design/rail-corpus-2026-08-18.md`). The question this
document answers: **does any affordance on Corpus deliver understanding a user can ACT on, and where it
doesn't, what is the mechanism?**

---

## 0. The one-paragraph root cause

**The retrieval is excellent and the surface throws away everything that would let you use it.** The
digest scan returns genuinely relevant memories in ~30 ms (§2.2 proves relevance against data whose
right answer is checkable). What reaches the reader is: the memory's text **truncated to one 215px line**,
a **6-character raw chat id** where a chat title belongs, a relevance number that is **a clamped distance
rendered so that every good hit reads `0.00` and a nonsense hit reads higher** (§3), and **no click
target of any kind** — because the row is a non-interactive `<div>` and, one level deeper, because
`DigestSearchHit` carries no field that could address a destination beyond a bare `chatId`, and the
entire `features/discovery` tree contains **zero calls to any chat-navigation API** (§2.5). Corpus knows
which 20 moments in 895 chats answer your question and cannot take you to one of them.

Three structural causes generate almost every finding in this document, and each is a small mechanism
with a wide blast radius:

| # | Structural cause | Affordances it breaks |
| - | - | - |
| **S1** | `score` on every hit is `cslsAdjust()` — a **clamped cosine DISTANCE**, lower-is-better, floored at 0 — rendered by five call sites as a bare `.toFixed(2)` "score" | memories · scenes · characters · images · similar-characters · similar-art (§3) |
| **S2** | The **corpus has no destination vocabulary**: the only artifact a user can select is a character, and the only selectable-character destination is the dossier, which is stateless w\.r.t. why you clicked | memories · scenes · themes · families · archetypes · similarity pairs · images (§2.5, §4, §5) |
| **S3** | Several readouts state a **criterion the code does not implement** — a label whose range is smaller than its domain, a tie-break that never fires, a gloss naming a different sort, a rail row marking a pass done on another pass's evidence | archetype labels · gem tiles · readiness rail · family provenance (§4, §6) |

Nothing here is a retrieval-quality problem. Every fix is in the last 10% of the chain.

---

## 1. Method + instrument honesty

- **Wire harvest** was plain `curl` against `:8788/api/trpc/<proc>` (single-user dev serves un-cookied).
  **Correction to a circulating recipe:** the input envelope is RAW (`?input={"query":…}`), *not*
  `{"json":{…}}` — the wrapped form returns HTTP 400 with a zod "received undefined" for every field.
  My first eight query drives were void for this reason and were re-run.
- **Rendered receipts** are `node scripts/probes/snap.ts` with `--goto corpus`, the `--aria`/`--eval`
  ladder before pixels, one crop (`reports/snaps/cf-mem-rows.png`).
- **A barrier lesson, paid live:** `--wait-for '[data-testid=corpus-home-surface]'` resolves while the
  body is still inside its single `QueryBoundary`, so the eval read `"Loading your corpus…"` and reported
  `focalCount: 0`. The settled barrier on this surface is `[data-corpus-focal]`. This is the rail pass's
  P2-8 reproduced from the other side.
- **`data-testid="corpus-search-hit"` matches ZERO nodes in the rendered DOM.** `ListRow` takes no rest
  props and forwards no `data-*` (`packages/ui/src/primitives/list-row/list-row.tsx:284-306` — the body
  is built from named props only), so the four `testId("corpusSearchHit")` spellings in
  `corpus-search-results.tsx` (`:230`, `:245`, `:275`, `:286`) reach the DOM only where they sit on a
  `Stack` (the Scenes branch, `:245`). Measured: `document.querySelectorAll("[data-testid=corpus-search-hit]").length === 0`
  on a Memories result set of 20 rows. Any probe recipe or CT keyed on that testid is a silent no-op.
- **One instrument error of my own, published:** my first image-target drive returned HTTP 400
  `lens_required`. That was my omission (the client always sends `lens`), not a defect. Re-run with
  `lens: "image-captioned"` it works (§2.6).

---

## 2. The Memories / search flow — the owner's named symptom, four hops

### 2.1 The chain

| Hop | What happens | Receipt |
| - | - | - |
| UI input | target `Memories`, query typed into the omnibox | `corpus-list-surface.tsx:38-50` |
| Wire | `search.search {query, topN:20, over:"digests", scope:{kind:"owner"}}` | console: `→ query search.search {"query":"shared bathing","topN":20,"over":"digests","scope":{"kind":"owner"}}` · `← 75ms · {over,hits}` |
| Server | `digestScan` — embed with the digest scope instruction → `nearestDigests` over the owner-belted pool (`min(topN×4, 200) = 80`) → CSLS sort → slice 20; returns `{blockKey, score, text}` | `search/verbs/search.ts:64-101` |
| Rendered | `DigestHitRow`: `title = the whole digest`, `subtitle = "Chat " + chatId.slice(-6)`, `actions = score.toFixed(2)`, **no `clickable`** | `corpus-search-results.tsx:271-281` |
| What the user can do | **nothing** | measured below |

### 2.2 Relevance IS real — the retrieval is the best thing on this surface

Queries whose right answer is checkable from the data, top-5 each (`s-dig-*.json`):

| Query | Top-5 digest headers returned |
| - | - |
| `shared bathing` | `[Nate, Selene, Lysara — hotel room bath scene]` · `[Kate and Ashley — bathing chamber aftermath]` · `[Nate and Ayami — bath scene]` · `[Kate & Ashley — Bathing and Bedtime Reflection]` · `[Hikari and Nate — Love hotel shower scene]` |
| `catgirl` | `[CatAsstrophe & Hikari …]` · `Azarael, Nya-tan — riverside meeting … a human catgirl` · `[Nyako Tanaka …]` · `[CatAsstrophe — Nyako and Hikari's 21-year reconciliation]` · `Ashley (catgirl) and Hikari …` |
| `Therion Farm` | `Nate, Kira, Therion — farm life and romantic milestones` · `[… Portal reunion …]` · `[Nate, Therion, Theria, Kira — Twilight Garden Realm]` · `[Nate, Hikari, Ru, Tia — Farm arrival and tour]` · `[… Realm Warding …]` |
| `magical girl` | five Hikari/Nyako magical-girl digests |

Five for five. **Do not touch the engine.** The digests themselves are also well-formed — nearly every
one opens with a `[speakers — place]` header, which is exactly the addressable context the row throws
away.

### 2.3 The relevance number is INVERTED and clamped — every good hit reads `0.00`

`packages/server/src/domain/search/substrate/csls.ts:9-11`:

```ts
export function cslsAdjust(distance: number, hubScore: number | null): number {
  return Math.max(0, distance - 1 + (hubScore ?? NULL_HUB_FALLBACK));   // NULL_HUB_FALLBACK = 0.5, :7
}
```

It is a **distance**, lower is better, floored at 0 — the file's own header says so ("LOWER is
closer/better"). With no hub score computed, any hit closer than cosine-distance 0.5 collapses to
exactly `0`. The A/B:

| Query | Top-5 `score` values as rendered |
| - | - |
| `shared bathing` (relevant) | `0.00` `0.00` `0.00` `0.00` `0.00` |
| `catgirl` (relevant) | `0.00` `0.00` `0.00` `0.00` `0.00` |
| `zzzzz` (meaningless) | `0.00` `0.00` `0.00` — **and 20 hits returned** |
| `quantum blockchain tax audit` (meaningless) | **`0.02` `0.05` `0.06` `0.07` `0.07`** |

**The only query on this surface that produces a non-zero relevance number is the one with no relevant
answer.** The rendered column is not merely uninformative — it is anti-informative. Rendered receipt:
`reports/snaps/cf-mem-rows.png`, ten consecutive rows reading `0.00`; measured DOM
`[data-slot=list-row-actions]` = `["0.00","0.00","0.00"]`.

### 2.4 The row shows ~28 characters of a 300-character memory, and a hex id

Measured on the settled Memories result set (`--eval`, 1280×800, list pane docked):

| Property | Value |
| - | - |
| result rows | 20 |
| row height | 52px |
| title element | `clientHeight 23` · `scrollHeight 23` · `white-space: nowrap` · `overflow: hidden` · `text-overflow: ellipsis` |
| title box width | **215px** at `font-size: 15px` (list pane inner width 290px) |
| title CONTENT | e.g. `[Nate, Selene, Lysara — hotel room bath scene]\n\nNate, Selene, and Lysara move to their upscale hotel room featuring a massive bed and a copper tub with arcane heating runes. All three strip naked; Nate enters the hot bath first. Selene feels initial embarrassm…` (~300 chars) |
| title VISIBLE | `[Nate and Ayami — bath sce…` (~28 chars) |
| subtitle | `Chat 2y1mf5` |
| body element | `DIV` · `role: null` · `tabindex: null` · `cursor: auto` |

Because the digest header convention puts the speakers and the place first, the ONE line that survives
truncation is the most useful line — which is why the flow feels *almost* right and then stops. The
whole body of the memory, which the wire delivered, renders zero pixels.

`ListRow`'s non-clickable arm is a bare `<div>` with "no role, no tab stop, no name/description"
(`list-row.tsx:284-292`), so a screen reader gets a container announced `role="list"` (set at
`corpus-search-results.tsx:89`) with **no `listitem` children and no interactive descendants** — the
`--aria` snapshot of `[data-testid=corpus-search-results]` is one blank line.

### 2.5 Selecting a result: there is nothing to select, and no destination exists to select toward

- **Memories rows and Images rows have no `onClick` and no `clickable`** (`corpus-search-results.tsx:271-292`,
  both commented "read-only preview").
- **`DigestSearchHit` carries `{blockKey, score, text}`** (`search/contract/results.ts`) — a `chatId` and
  a `blockIdx`, no chat title, no timestamp, no character. So even a wired row could only offer "open
  chat `2y1mf5`".
- **The whole `features/discovery` tree (48 paths) contains zero chat navigation.** `grep` over the
  feature returns `chatId` only as a React key, a `slice(-6)` label, and a grouping map. There is no
  `selectChat`, no `openChat`, no `setActiveSection("chats")` anywhere in the feature — the only two
  `setActiveSection` calls go to `refinery` (`corpus-distill-empty-state.tsx:30`) and `characters`
  (`corpus-home-surface.tsx:146`).
- **The door already exists one import away:** `selectChat(chatId)` is exported from `#state`
  (`packages/client/src/state/active-chat-store.ts:139`).

### 2.6 Where selection DOES work, the destination drops the context that made it a hit

The Scenes target is the strongest affordance on the surface: it returns a character **plus its matching
moments quoted per chat**. Driven live (`shared bathing vulnerability` → click the first hit):

- The hit row renders `Victoria` + `N matching moments` + three quoted evidence snippets grouped under
  `Chat gr10xx`.
- Click →`selectCorpusCharacter(hit.characterId)` (`corpus-search-results.tsx:248`) → the dossier.
- **What the dossier contains** (measured `innerText`): `Back · Victoria · FANTASY · DARK · <elevator
  pitch> · Card quality: Not scored yet — run the Refinery's library score sweep · Portrait alignment:
  Card ↔ art cosine: 0.24 · Tags … · Keywords: No keyword profile computed yet. · Similar characters:
  Audrey 0.01, Willow 0.01, Sabine Veyra … · Ask`.
- **What it does not contain:** the query, the scene, the chat, the quote, or any door to any of them.
  The evidence — `chatId` + `blockIdx` — was on the wire and is discarded at the click.

Two further defects visible in that one capture: the similar-character scores are `0.01/0.01/…` (S1
again), and `Sabine Veyra` appears **twice** in the same 16-row neighbour list under the same name.

### 2.7 The Scenes target can never say "nothing matched" — its "N matching moments" is a pool share

`discover` scans a pool of `min(topN × 20, 400)` segments with **no relevance floor**
(`search/substrate/constants.ts:16,19`), credits each pooled segment to its character(s), and reports
the credit count as `matchCount` (`search/verbs/discover.ts:57-83`). The corpus has 2,026 segments, so
**the pool is a fixed 20% of the entire library, every time**. The A/B:

| Query | Rendered result |
| - | - |
| `magical girl rivalry` | 18 characters — `Hikari 207 matching moments`, `Azarael 88`, `Ayami 51`, … |
| `shared bathing vulnerability` | 20 characters — `Bengal 58`, `Hikari 59`, `Selene 48`, … |
| **`quantum blockchain tax audit`** | **20 characters — `Hikari 106 matching moments`, `Azarael 40`, `Ysabeau 28`, `Bengal 20`, …** |

A meaningless query produces a full, confident, populated answer claiming 106 moments matched. "207
matching moments" does not mean 207 moments matched your query; it means 207 of the 400 nearest segments
belong to Hikari, i.e. it is mostly a measure of how much of your library is Hikari. The same three
result sets each contain **two different characters both named `Hikari`**, undistinguished.

### 2.8 The typeahead searches a different corpus than the target

`search.suggest` is `MiniSearch.autoSuggest` over the **character-card BM25 index**, unconditionally
(`search/substrate/field-index.ts:88-93`; `verbs/fields.ts:20-24`). It does not know which target is
active. Rendered, with the target set to **Memories** and the query `shared bathing`, the floating
suggestion list offers **`shaped bathing`** and **`scared bathing`** — fuzzy corruptions of card
vocabulary — and picking one writes it into a query that will then be embedded against digests. The
popup also **overlays the first two result rows** (`reports/snaps/cf-mem-rows.png`).

### 2.9 The Images target is contractually incapable of showing an image

`ImageSearchHit = {assetId, score, lens, caption}` (`search/contract/results.ts:101-106`). There is no
asset hash (the blob route is hash-keyed) and no owning character. So `ImageHitRow`
(`corpus-search-results.tsx:284-292`) renders a generic `Images` glyph, the caption as a title, and a
score. Retrieval quality is again good — `red hair armor` returns five red-haired armoured knights with
captions and *non-zero* distances (0.43–0.51, so this target at least escapes the clamp) — and the user
sees five sentences of text and no picture.

---

## 3. S1 in full: one function, six rendered surfaces, one wrong direction

`cslsAdjust` is the `score` on **every** hit shape the corpus renders:

| Call site | Verb | Rendered as | Live values |
| - | - | - | - |
| `search/verbs/search.ts:97` | digests | `ScoreBadge` (`corpus-search-results.tsx:297-303`) | `0.00` ×20 |
| `search/verbs/discover.ts:148` | discover | same badge | `0.00`, `0.00`, `0.0008`, … |
| `search/verbs/knn.ts:41` | characters | same badge | `0.11`, `0.16`, `0.18`, … (**ascending — the best hit shows the smallest number**) |
| `search/verbs/similar-characters.ts:37` | dossier neighbours | `Score` (`corpus-dossier-surface.tsx:224-230`) | Hikari's 8 neighbours: `0, 0, 0, 0, 0, 0.006, 0.011, 0.014` |
| `search/verbs/similar-art.ts` | dossier similar art | same | — |
| images | images | same badge | 0.43–0.51 |

**This corrects the rail pass's P2-7.** That finding filed "similar-character scores all render 0.00" as
a rendered defect needing "a server-side check of what `search.similarCharacters` puts in `score`". The
server-side check is done: `similarCharacters` is correct, `cslsAdjust` is correct and documented, and
the defect is entirely at the presentation seam — a distance is being rendered under the universal
convention for a similarity score. Five of Hikari's eight nearest neighbours read `0.00` because they
are *closer than the hub floor*, i.e. because they are the best matches in the library.

Any fix belongs in ONE place (a shared presenter), not six.

---

## 4. Clusters, themes and families — the labels carry less information than the clustering

### 4.1 Writing archetypes: 10 clusters, 5 distinct names, by construction

`archetypes.ts:129`:

```ts
label: [tone, genre].filter((x) => x !== null).join(" ") || "mixed",
```

The label is the **modal tone plus the modal genre** of a cluster's distilled facets. The live facet
distribution is `115/111/59/10/6/6/4/2` over 8 genres and `83/72/57/30/…` over 10 tones, so the
realistic label space is roughly 3 tones × 3 genres. Ten k-means clusters are then projected onto it.
Today's payload:

| size | label | genre | tone | its own `topTags` (present on the wire, five per cluster) |
| - | - | - | - | - |
| 98 | melancholic fantasy | fantasy | melancholic | tsundere · submissive · virgin · fish out of water · found family |
| 84 | lighthearted slice-of-life | slice-of-life | lighthearted | — |
| 51 | **melancholic slice-of-life** | slice-of-life | melancholic | — |
| 36 | **lighthearted slice-of-life** | slice-of-life | lighthearted | — |
| 25 | **lighthearted romance** | romance | lighthearted | — |
| 20 | **melancholic slice-of-life** | slice-of-life | melancholic | — |
| 6 | **melancholic slice-of-life** | slice-of-life | melancholic | — |
| 3 | wholesome fantasy | fantasy | wholesome | — |
| 2 | **lighthearted romance** | romance | lighthearted | — |
| 2 | lighthearted fantasy | fantasy | lighthearted | — |

Seven of ten rows collide. This is **not a labeller bug** — the label function's range is smaller than
its domain, so collisions are guaranteed on any library. `image-analytics/retrieve.ts:171-176` already
states the law verbatim ("two rows reading 'wholesome slice-of-life' are two rows a reader cannot tell
apart, which is worse than one row and a number") — the writing side simply never received the
lift-scored, distinctness-enforced treatment the visual side got.

**One correction to the rail pass's proposed fix:** it suggested disambiguating with "each cluster's own
top keywords — the UI already renders them right under the bar list." Those chips are `topTags`, not
keywords, and they *do* differ per cluster (the row above proves it) — so the disambiguating data is
indeed on the wire and unused. But `discovery.topKeywords` and `discovery.characterKeywords` both return
`[]` today (§9.1), so any fix that reaches for *keywords* has nothing to reach for.

### 4.2 Visual families: the provenance line names the clustering and hides the labelling

Live payload, all 8 families:

| size | rendered label | mood | palette | artStyle | members shown |
| - | - | - | - | - | - |
| 75 | playful | playful | warm | anime | 12 |
| 58 | **neutral** | neutral | warm | anime | 12 |
| 43 | **melancholic** | **neutral** | warm | anime | 12 |
| 34 | armor | serene | warm | anime | 12 |
| 32 | cheerful | cheerful | warm | anime | 12 |
| 29 | fantasy | serene | warm | anime | 12 |
| 28 | uniform | cheerful | warm | anime | 12 |
| 21 | **none** | neutral | monochrome | illustration | 12 |

The rendered gloss reads **"Grouped from the portrait embeddings · Qwen/Qwen3-VL-Embedding-2B"**
(`corpus-family-map.tsx`, measured live). That names the clustering axis and says nothing about the
labelling axis, which is a *different* facet vocabulary (`mood`/`outfitType`) picked by lift — hence a
family whose modal mood is `neutral` wearing the label `melancholic`, and a family named `none`. Seven
of eight families share `warm`+`anime`, so the facet line under the label discriminates almost nothing
either.

The rail pass's facet-qualifier finding stands unchanged; I add only that the **provenance gloss is a
second, independent half-truth** on the same island.

### 4.3 Every cluster surface caps its membership and offers no way past the cap

| Surface | Cluster size | Members reachable | Cap |
| - | - | - | - |
| visual family plate | 75 | 12 names in a comma run | `image-analytics/retrieve.ts:33` |
| writing archetype card | 98 | 12 | `archetypes.ts:32` |
| story-theme detail card | 279 digests | 14 characters | `views.ts:18` (`THEME_DETAIL_MEMBERS = 15`) |

There is no "show all", no pagination, and no filter-the-browse-list-by-this-cluster door. A family of 75
is a claim about your library that you can inspect 16% of.

### 4.4 The theme → moment path does not exist

A story theme **is a cluster of digests** (`themeDetail` returns `size: 279 digests`). The detail card
(`corpus-home-surface.tsx:304-359`) renders the name, the size, and up to 14 **characters**, each
clickable to the dossier. There is no affordance anywhere that shows a theme's digests, and the card
fetches `timeline` (live value: `[]`, a 0-length array) and never renders it.

So: a cluster of 279 memories, drilled, yields a list of characters, each of which leads to a page with
no memories on it.

---

## 5. Similarity, duplicates, hubness

### 5.1 The Similarity tab is 52,884 pixels of uncapped text in a 367px column

Driven live (`--goto corpus --context-tab similarity`):

| Measure | Value |
| - | - |
| context panel width | 367px |
| panel `clientHeight` | 693px |
| panel `scrollHeight` | **52,884px** — **76 viewport-heights** |
| pair rows rendered | **1,686** (1,543 graph edges + the duplicate sections) |
| a row | `Seraphina ↔ Seraphina  1.00` — plain text, non-interactive, no door on either name |

`similarityGraph` defaults to `minSimilarity 0.65` / `maxNodes 120` (`similarity-graph.ts:18-19`) and the
tab renders **every returned edge**, sorted, with no cap (`corpus-similarity-tab.tsx:160-175`). The knobs
offered are a cosine floor and a node cap — neither of which a reader knows to reach for before the wall
has already rendered.

### 5.2 The near-duplicate finder is blind to EXACT duplicates — and the readiness rail reports its blindness as a result

The three highest-similarity edges in the live graph, and their fate in `duplicateCharacters`:

| cosine | pair | in the duplicate report? |
| - | - | - |
| **1.0000** | Seraphina ↔ Seraphina | **NO** |
| **0.9998** | Freya ↔ Freya | **NO** |
| 0.9692 | Your Shitty Life ↔ Your Shitty Life | yes — the only row |

All three clear the pass's own threshold (`DEFAULT_DUP_THRESHOLD = 0.92`,
`duplicates/generate.ts:34`). The mechanism is `duplicates/generate.ts:80-92`: the all-pairs scan runs
over **content-hash-collapsed representatives**, and `collapseByHash` keeps exactly one row per distinct
hash (`substrate/collapse.ts:9-17`). Byte-identical cards therefore **cannot form a pair**. The collapse
is correct and deliberate for the *clustering* passes it was written for (it stops N identical copies
biasing a centroid — the comment says so); applied to the duplicate FINDER it deletes precisely the
duplicates a user most wants found.

Consequence on screen: the readiness rail states **"Near-duplicates — 1 found"** while the Similarity
tab one click away opens with two cosine-1.00 same-name pairs. Two answers to one question, on one
surface.

*Scope note:* the graph is capped to the 120 highest-degree nodes, so 1 vs 3 is a lower bound on the
disagreement, not the library-wide count.

### 5.3 Hubness is computed, consumed, and never shown

`hubScore` is real: it is the `-1 + hub` term inside every ranked score (§3) and it drives
`compareCslsBy` tie-breaking everywhere. `similarityGraph` also returns a `degree` per node (live: max
84, `Miyako`). **Neither appears in any rendered surface.** The only place a user meets hubness is as
the invisible reason their relevance numbers are all zero.

---

## 6. The gem tiles — the band names a sort the code does not perform, twice

`corpus-gem-tiles.tsx:67`, rendered verbatim:

> Lifetime totals per character — **most tokens returned, least recently opened.**

`economics-insights.ts:51`:

```ts
gems.sort((a, b) => b.messageCount - a.messageCount || a.lastActiveAt - b.lastActiveAt);
```

The primary key is **message count** — neither of the two things the gloss names. Two independent
failures:

1. **"most tokens returned" is not the sort.** Live tile #1 is Hikari (283,035 tokens returned); tile #2
   is **Selene, `0 tokens returned`**, ranked second on 1,187 exchanges. A reader told the shelf is
   ordered by tokens sees the second item contradict it.
2. **"least recently opened" — and the section title "INVESTED, BUT QUIET" — never fire at all.**
   `lastActiveAt` is only a tie-break on an exact `messageCount` collision. Live: **20 of 20 gems have
   distinct message counts**, so the quiet term contributed nothing to the shipped list. The result:

| rank | messages | quiet for | name |
| - | - | - | - |
| 1 | 1,602 | **0.2 days** | Hikari |
| 2 | 1,187 | 71.8 days | Selene |
| 3 | 892 | 171.8 days | Bess |
| … | | | |
| 20 | 148 | 347.3 days | Erina |

**The headline "forgotten gem" is the character the owner played six hours ago.** The concept
("invested AND quiet") is a conjunction; the implementation is a lexicographic sort whose primary key is
a high-cardinality integer, which makes the second term unreachable by construction. The owner-picked
mock drew this correctly — every tile in it reads `2w quiet`, i.e. the drawing's data had the quiet axis
doing visible work.

*(This is a distinct defect class from the rail pass's #174 tokens-vs-words label fix, which landed and
is correct — the label now says "tokens returned". The problem is that the band claims tokens are the
ORDER.)*

---

## 7. The charts — what question does each answer?

Measured live at 1280×800, list pane docked (the shipped default):

| Chart | Height | Question it answers | Is it a question this user has? |
| - | - | - | - |
| Story theme sizes | 400px | how many digests per theme (16 bars) | yes — but it duplicates the "Story themes" rows 400px above it, which are clickable, whereas the bars are not |
| Genres | 272px | 8 genres by count | marginal — the same 8 values are the browse filter's options |
| Tones | 336px | 10 tones by count | same |
| Top tags | 1,296px | **40 tag bars** | the top 5 are informative; rows 6–40 are a tail |
| **Cost by route** | **4,304px** | genre → model spend, **134 rows** | **no** |
| **total charts** | **6,608px** | | **70% of a 9,438px surface** |

`corpus-content` measures `scrollHeight 9,438px` against a `clientHeight 752px` — **12.5
viewport-heights**, with no in-page anchors, no caps, and no collapse.

**Cost by route, corrected.** The rail pass reported "all 134 values are $0.00". The precise figure:
**134 rows, 133 of them exactly `$0.00`, one at `$0.0377` — total lifetime spend across the entire
library is 3.8 cents.** The surface's own header claims the opposite is impossible:

> Model economics survives as a section that renders only when there is **spend** to report — on a local
> instance `modelRouting` is `[]` and the block simply is not there.
> — `corpus-home-surface.tsx:26-29`

The guard is `{routing.length === 0 ? null : …}` (`:251`) — a **row-count** test, and `modelRouting`
returns a row per (distilled genre × model) whether or not money changed hands. The header states a law
the code does not implement. The section is 46% of the surface.

**A second, quieter problem with the same chart:** it is grouped by *distilled genre*, so it can only
ever tell you "your comedy cards go to claude-opus-4.1" — a routing fact the user chose themselves in
Connections. It answers a question about the past that the user already authored.

---

## 8. The mock delta — what was added after the drawing, and was it ever reviewed

The build names its target: mockup A "The Cartographer"
(`reports/design/corpus-mockups/corpus-a-cartographer.html`, `corpus-home-surface.tsx:1-3`). **The mock
ends after the gem tiles** — verified by reading `corpus-a-cartographer-1280.png` end to end: masthead →
readouts → family-map island beside the READINESS rail + accent CTA → "INVESTED, BUT QUIET" tiles →
page ends.

Everything below the gem tiles on the shipped surface has **no drawing behind it**:

| # | Shipped below the mock's last element | Source | Height |
| - | - | - | - |
| 1 | "Story themes" — Scenes + Arcs clickable rows + an inline `ThemeDetailCard` | `corpus-home-surface.tsx:214-221` | ~600px |
| 2 | "All story themes" — level toggle + `Story theme sizes` bars | `corpus-home-charts.tsx:44-79` | 400px |
| 3 | "Keywords" — `Top keywords` bars + co-occurrence drill | `:82-112` | **0px (renders `null`, §9.1)** |
| 4 | "Catalog" — Genres · Tones · Top tags bars | `:184-222` | 1,904px |
| 5 | "Story-theme drift" — month buckets × theme badges | `:141-181` | ~200px |
| 6 | "Never played" — a 204-row `VirtualList` | `corpus-home-surface.tsx:238-249` | capped `max-h-96` |
| 7 | "Model economics" — `Cost by route` | `:251-263` | 4,304px |

**Answer to the rail pass's open question (its mock-delta row 11):** the tail was not reviewed against a
drawing, and it did not "survive from the pre-#102 surface" unexamined either — items 1–7 are all
authored in the #102 files themselves, with their own headers, deliberately. What is missing is not
intent; it is that **the composition was designed down to the gem tiles and then continued for another
6,900px with no composition at all**. Every one of items 2, 4, 5, 7 is a `BarList`, which by construction
exposes no item click (`packages/ui/src/charts/bar-list/bar-list.tsx`), so the entire un-drawn 73% of the
surface is non-interactive by primitive choice.

**A related honest note in the build's favour:** items 1–7 all render `null` when empty, and that
discipline is real and correct (`corpus-home-charts.tsx:7-12`). On a populated library it is exactly
that discipline which makes the tail appear.

### 8.1 Two mock-delta rows the rail pass filed are still live and I re-measured them

- **The two-column focal split still never fires at the default width.** `Grid cols="lead"` resolves to a
  single track: measured `grid-template-columns: 868.812px`, needing 896px. Unchanged.
- **The masthead still restates itself.** Rendered: `327 characters, distilled into 16 story themes.`
  beside readouts `16 story themes · 327 characters · 8 visual families`.

---

## 9. Symptom → mechanism map

| Symptom (source) | Mechanism | Receipt |
| - | - | - |
| **Owner: "memories search-and-select is SUPER useful… not"** | (a) `DigestHitRow` has no `clickable` (b) `DigestSearchHit` carries no destination-bearing field (c) `features/discovery` has zero chat-navigation calls (d) the title is one 215px ellipsized line (e) the score is an inverted clamped distance | §2.3–§2.5 |
| Owner (#159): "clicking analyzed schemes and memories does literally absolutely nothing" | **S2** — the corpus's only selectable artifact is a character and its only destination is the dossier | §2.5, §4.4 |
| Rail P1-1: 4,304px all-$0.00 chart | guard is `routing.length === 0`, not a spend test; the header states the spend law the code doesn't implement | §7 |
| Rail P1-2: designed split never fires | `@4xl` (896px) vs the 868.8px default pane container | §8.1 |
| Rail P1-3: the primary action is invisible | (unchanged; not re-diagnosed this pass) | rail pass |
| Rail P2-2: writing archetypes ship duplicate labels | **S3** — `label = mode(tone) + " " + mode(genre)`, a range smaller than its domain | §4.1 |
| Rail P2-7: "similar characters render 0.00" — *"diagnosis is a verifier's job"* | **S1 — CLOSED.** Not a `similarCharacters` bug: `cslsAdjust` is a clamped distance and six call sites render it as a score | §3 |
| Rail P2-10: three different counts on one screen | 327 characters / 313 distilled / 320 clustered — three real, differently-scoped measurements sharing one noun | §rail, live-confirmed |
| Rail P2-8: one all-or-nothing Suspense boundary | re-confirmed from the other side: `[data-testid=corpus-home-surface]` attaches while the body still reads "Loading your corpus…" | §1 |
| *(new)* readiness rail marks the keyword pass done | the `storyThemes` stage is labelled **"Story themes & keywords"** but its datum and `done` read `storyThemes` alone (`corpus-analysis-state.ts:210-215`); `topKeywords` is `[]` | §9.1 |
| *(new)* "Near-duplicates — 1 found" while cosine-1.00 pairs sit one tab away | content-hash collapse removes exact duplicates before the all-pairs scan | §5.2 |
| *(new)* the gem shelf's headline is the most-recently-played character | a conjunction implemented as a lexicographic sort; 20/20 distinct primary keys | §6 |
| *(new)* the Scenes target cannot report a miss | a fixed 400-segment pool with no relevance floor | §2.7 |
| *(new)* the typeahead suggests card vocabulary for a memory search | `suggest` is BM25 over card text, target-blind | §2.8 |
| *(new)* the Images target shows no image | `ImageSearchHit` has no asset hash and no character | §2.9 |

### 9.1 The keyword subsystem is dark, and the rail says it is done

`discovery.topKeywords` → `[]`. `discovery.characterKeywords(Hikari)` → `[]`. Both read
`character_keyword_profiles` / `keyword_cooccurrence` (`cooccurrence/retrieve.ts:22-33,53-62`), which are
written only by the `compute-cooccurrence` maintenance workload (`cooccurrence/generate.ts:1-4`) — never
run on this instance. Consequences:

- the Keywords section renders `null` (correct, by the file's own law);
- the dossier prints **"No keyword profile computed yet."** with no door (`corpus-dossier-surface.tsx`);
- and the readiness rail — the surface's single designated home for "what has not run" — shows
  **"Story themes & keywords — 16 themes computed"**, marking the row `done: true` on the strength of the
  themes pass. The rail's own neighbouring stage carries a comment recording the #164 lesson about
  exactly this class of error ("a zero must be a state a reader can act on"), and the stage above it
  commits it.

---

## 10. Recommended shape — options, with costs

The owner picks. I split this into **what belongs on Corpus** and **what belongs to the parked
Observatory program** (`docs/reviews/stickler/2026-08-18-corpus-consolidation-proposal.md`, Variant 1 —
the Analytics/Corpus section merge, awaiting an owner ruling). The Observatory answers *where surfaces
live*; nothing below depends on that ruling, and all of it survives either arm.

### R1 — Give the corpus a MOMENT as a first-class artifact (the fix for the owner's symptom)

Today the corpus can address exactly one thing: a character. Every dead end in §9 is that fact. The
smallest change that removes it:

- **R1a (cheapest, ~1 day).** Make `DigestHitRow` and the Scenes evidence snippets `clickable` →
  `selectChat(chatId)` (already exported, `active-chat-store.ts:139`). Add `chatTitle` + `msgMidAt` to
  `DigestSearchHit` so the subtitle can read `Amethyst Hollow · 3 weeks ago` instead of `Chat 2y1mf5`.
  Let the row wrap to 3 lines (`line-clamp-3`) so the memory is legible.
  **Cost:** one contract field, one persistence join, three client edits. **Buys:** the owner's named
  symptom, entirely.
  **Does not buy:** landing on the *message*. There is no message-level deep-link seam today, and I did
  not investigate whether one is cheap — chat-level is the honest v1 (the Observatory proposal reaches
  the same conclusion independently, its §7).
- **R1b (the real shape, ~3–4 days).** A `MOMENT` artifact: `{chatId, blockIdx, tier, text, characters,
  when}` becomes a thing the corpus can select, preview in place (expand the row to show the whole
  digest + its chat + its cast), and open. Then themes drill to their moments (§4.4), scene evidence
  becomes a moment list, and the memory search result is a moment list — one artifact, four surfaces.
  **Cost:** a contract shape, a selection-store arm, and the theme-detail read gains a digest list.
  **Buys:** §2.5, §4.4, and the "analyzed schemes and memories do nothing" complaint at its root.
  **My recommendation.** R1a is the same work started; do not build R1a and stop.

### R2 — Fix the score at ONE seam (~2 hours, highest value per line on the surface)

Do **not** change `cslsAdjust` — it is correct, documented and load-bearing for ranking. Add one
presenter in the client (or one derived field on the hit shapes) that converts the clamped distance into
something a reader can use. Three arms:

- **R2a — drop the number, keep the rank.** Order already carries all the information the number does.
  Replace the badge with nothing, or with a rank glyph on the top hit.
  **Cost:** ~0. **Buys:** the anti-information disappears. **Loses:** nothing measurable, since 5 of 8
  neighbours currently read identical zeros anyway.
- **R2b — render a similarity, not a distance.** Carry the raw cosine alongside the CSLS score and show
  `1 − distance` as a percentage. **Cost:** one field on five hit shapes. **Buys:** a number that goes
  the right way and separates good hits (Hikari's neighbours would read 88%, 84%, 81% instead of
  0.00 ×5). **Watch:** the ORDER must stay CSLS-ranked, or hub-inflated characters win everything back.
- **R2c — a relative band.** "Very close / close / related", thresholded off the raw distance.
  **Cost:** same as R2b plus a thresholds decision. **Buys:** the least jargon.

**I recommend R2b**, with R2a as the zero-risk fallback if nobody wants to touch the contracts. Either
way this is one seam, not six.

### R3 — Make every cluster complete and every cluster label distinct

- **Labels (§4.1):** give `archetypes` the lift-scored + distinctness-enforced labeller
  `visualArchetypes` already has (`image-analytics/retrieve.ts:87-101,171-176`) — the code exists, it
  just never crossed to the writing side. Where distinctness still can't be achieved, append the
  cluster's own top tag (which is on the wire and differs per cluster). **Cost:** one verb.
- **Membership (§4.3):** every cluster gets a "see all N" that seeds the browse list with that cluster as
  a filter. **Cost:** one filter arm on `browseCharacters` + a door. **Buys:** the cluster stops being a
  claim you can only sample.
- **Provenance (§4.2):** the family gloss states BOTH axes — *"grouped from portrait embeddings ·
  labelled from image captions (mood/outfit)"*. This is the Observatory proposal's §4.7 law and it costs
  a string.

### R4 — Cut the tail; put the removed information where it can be acted on

- Guard model economics on **spend**, not row count (`routing.some((r) => r.costUsd > 0)`) — one
  expression, removes 4,304px (46% of the surface) on this and every local-model instance.
- Cap `Top tags` at 8–10 with a "see all" door — removes another ~1,000px.
- Fold `Genres`/`Tones` bars into the browse filter they duplicate.
- Keep `Story theme sizes` only if the theme ROWS above it go away (they are the same data, and the rows
  are the interactive twin).
- Net: ~9,400px → ~2,600px, which is what makes the top of the surface readable at all.

### R5 — Fix the four readouts that state a criterion the code does not implement

Each of these is a copy-or-one-line-of-logic fix, and each is currently a small lie on a surface whose
entire job is to be believed:

| Readout | Says | Does | Fix |
| - | - | - | - |
| gem band gloss | "most tokens returned, least recently opened" | sorts by message count | either sort by the stated keys, or state the sort |
| gem section title | "INVESTED, **BUT QUIET**" | quiet never fires | make it a real conjunction (e.g. rank by `messageCount × log(daysQuiet)`), or rename the shelf |
| readiness rail row | "Story themes **& keywords** — 16 themes computed" | reads themes only | split the row; keywords gets its own stage with the `compute-cooccurrence` door |
| readiness rail row | "Near-duplicates — 1 found" | exact duplicates are structurally excluded | run the duplicate scan over uncollapsed rows, emitting hash-identical pairs at cosine 1.0 as their own class ("identical copies"), and keep the collapse for the clustering passes that need it |

### What belongs to the Observatory program, not here

- The Analytics↔Corpus section merge, the report rack, the LIST-pane sort unification, and the
  `stats.character` band on the dossier. All still awaiting the owner's V1/V2 ruling.
- The kinded CONTEXT inspector. **Caveat worth stating:** the Observatory's §4.3 inspector would give
  every artifact a home, which subsumes R1b's "moment" and R3's "see all". If the owner rules V1, build
  R1b **as** the moment arm of that inspector rather than twice.
- The 52,884px Similarity tab (§5.1) is only fixable *in place* by capping it; the Observatory moves that
  report into CONTENT where a 1,543-edge list is at least the right shape of container. **Interim
  regardless of the ruling: cap the rendered edges at ~50 and make the knobs the door to more.**

### What I would NOT do

- Do not touch the retrieval engines. §2.2 and §2.9 are the two best-performing things on this surface.
- Do not "fix" the family map's read-only plates by making them clickable before a destination exists —
  `corpus-family-map.tsx:29-31` records that reason and it is still correct today. The plate becomes a
  door when R3's "see all N" gives it somewhere to go, not before.
- Do not add explanatory copy for "cosine", "hubness", "lift" as the fix for §3. The number is wrong, not
  under-explained.

---

## 11. What I did NOT verify

- **The `--rerank` arm.** Every drive ran with `rerank` absent (the corpus omnibox never sends it), so
  every score in this document is the vector-retrieve path. A reranked pool may distribute differently;
  the clamp arithmetic is unchanged by it.
- **Whether the two cosine-1.00 pairs are byte-identical.** I proved they clear the 0.92 threshold, are
  absent from `duplicateCharacters`, and that content-hash collapse is the only mechanism in the pass
  that can remove an above-threshold pair. I did not read their `content_hash` values. The inference is
  strong but is an inference.
- **Mobile, the appearance-preset arms, `--theme` arms, Lighthouse, motion-audit.** All were run by the
  rail pass 24 hours ago; I did not re-run them and this document does not restate their numbers except
  where I re-measured (§7, §8.1).
- **The Compare and Ask panels, `askCard`, `compareCharactersDeep`.** Model-backed; not driven (a drive
  would have spent tokens against the owner's stack for a surface not named in the commission).
- **`swipeHotspots` / `similarChats`.** Still client-unconsumed per the Observatory proposal §1.7; I did
  not re-derive that absence claim.
- **Whether a message-level deep-link seam is cheap.** R1a/R1b both stop at the chat door because I did
  not investigate the chat feature's scroll-to-message capability.
