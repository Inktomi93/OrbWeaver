# 08 — Build Plan: Chunks, Checkpoints, Test Matrix, the Resolved-Questions Ledger

> **Status: COMMITTED (D49 item 5) — prescriptive design.** DB1–DB8 shippable chunks, honestly
> sized (S ≈ a day, M ≈ 2–4 days, L ≈ a week for one focused agent), each ending green-to-commit
> (`pnpm check` + `pnpm test`). Prerequisites: Phase 4 (`embeddings`, `search`, `assets`,
> `workloads`) for DB2+; Phase 5 chat (whole, D16) for DB6. v1 scope (committed): global + chat
> scopes, owner/host-only retrieval, txt/md/pdf/html.

---

## 1. The chunks

| # | Chunk | Size | Contents | Depends on | Checkpoint (must be TRUE to commit) |
|---|---|---|---|---|---|
| DB1 | `@orb/kit/chunk` + wire schemas | **S** | the doc-03 engine + `@orb/contracts/databank` (DOC_ORIGINS, chunkParamsSchema + satisfies pin, settings schemas, DocumentView) + `@orb/contracts/extraction` (op type + error pair) | nothing (pure) | goldens + the 5 property tests green; `kit-purity` green; the contracts pin compiles |
| DB2 | Schema + the embeddings arm | **M** | `@orb/db/schema/databank.ts` (documents + 3 junctions, doc 02) · `document_chunks` in `schema/embeddings.ts` · migration · tuples + `DocumentChunkStoreParams` arm + routing + `pruneDocumentChunks` in `domain/embeddings` · the `document` AssetKind + sniff extension in `assets` | Phase 4 embeddings/assets; DB1 (types) | arm round-trip int test (store→row→noop) green; prune test green; schema-shape test (gate 3) green; FK-cascade tests green (doc delete → chunks+junctions gone; character delete → junction gone, doc survives) |
| DB3 | `infra/extraction` v1 | **M–L** (THE LONG POLE) | doc 04: `textlike` → `html` → `pdf` loaders, in that order; normalize pipeline; EXTRACTOR_VERSION; error pair wiring | DB1 (contracts) — **runs in PARALLEL with DB2/DB4**; only pdf is the pole | per-format goldens + error-path tests green; `infra-no-db`/`infra-no-domain` green; DB4 may start once `textlike` lands |
| DB4 | `domain/databank` core | **L** | the 8-slot domain (doc 01 §4): upload/createFromText/CRUD/rename/reindex verbs · attach family (global+chat; character verbs stubbed OUT of the surface, junction table already live) · persistence (queries, `resolveActiveDocumentIds`) · the ingest subsystem · `databank-ingest`/`databank-reindex` kinds + runners in workloads · tRPC router | DB1, DB2, DB3(textlike), Phase 4 workloads | round-trip ingest int test (§3) green; importHash dedup test; idempotent re-ingest (all no-ops, zero embed calls — counting fake); reindex prune-on-shrink test; authority tests (host-only attachToChat; fetchOwned 404s); `test-presence`/`test-layout` green |
| DB5 | `search.documents` lens | **M** | doc 05 §3: the verb + persistence scope branch + the injected resolver wiring + UnifiedSearchResult branch | DB2, DB4 (resolver), Phase 4 search | reading-order test; minScore/collapse tests; empty-allowlist zero-embed test; **the gate-8 owner-scope leak int test** (two users, one group chat: B's search + B's turn-scope return zero of A-private chunks) |
| DB6 | The chat graft | **M** | doc 07: `gatherRetrieval` verb + the `{{databank}}` reserved slot + the GATHER branch + budget fitting + compose wiring | DB5, **Phase 5 chat (whole)** | the byte-identity contract test (§ doc 07 §5) green; budget-fitting + slot-format tests; the group-turn leak test through the REAL assemble path |
| DB7 | Scrapers v1 (web) | **S** | `scrapeWeb` + `createFromText` polish; rides `safeFetch` | DB4; the gallery-design network seam WIRED | scrape-web int test (fixture server → doc created, origin/sourceUrl stamped, ingest queued); SSRF belt asserted (the seam's own tests; databank adds the pass-through test only) |
| DB8 | Fast-follows | **M** | character scope verbs + scope-union branch · docx/epub loaders (vendoring gate, doc 04 §5) · youtube/wiki scrapers | DB4–DB7 | per-item: the same test classes as their v1 siblings; the character-scope leak variant |

Client panel (drag-drop upload, per-scope lists, attach toggles, chunk-count preview via
`@orb/kit/chunk`) is Phase 6 client work — out of this doc set's scope by design; the wire types it
needs are all in `@orb/contracts/databank` from DB1.

**Critical-path note:** DB3's pdf loader is the only genuinely uncertain-cost item. The plan
isolates it: DB4/DB5/DB6 are fully buildable + testable on txt/md (the `textlike` loader), so a pdf
slip delays ONLY pdf uploads, never the graft.

---

## 2. Sequencing against the phase plan (committed order, restated)

1. Prereq: `embeddings` + `search` + `assets` + `workloads` (Phase 4). 2. DB1 (any time). 3.
DB2 + DB3 in parallel. 4. DB4. 5. DB5. 6. DB6 — lands with/after chat (Phase 5 whole, D16). 7.
DB7. 8. DB8. 9. Client panel (Phase 6). `FLAG[PD-57]` stays on the embeddings tuples + search
scope union until DB2/DB5 consume it.

---

## 3. The gates → tests matrix (doc 01 §6 mapped to actual tests)

| Gate | Enforcing tier | The actual test/rule |
|---|---|---|
| 1. no second vector write path | lint | dep-cruiser: `@orb/db/schema/embeddings` write-context import only under `domain/embeddings/**` (existing rule; table 5 is covered by the file, not a new rule) |
| 2. vector-scope-derived (extended) | lint + test | dep-cruiser: `vector_distance_cos` only under `search/persistence/`; int test: scope WHERE applied before rank (seed cross-owner rows; assert the scan's SQL predicate via the leak test) |
| 3. no polymorphic attachment | test | schema-shape test: no `(source_type, source_id)`-style column pair anywhere in `schema/databank.ts`; the three junctions' columns are FK-typed |
| 4. extraction db-free/domain-free | lint | dep-cruiser `infra-no-db` + `infra-no-domain` over `infra/extraction/**` |
| 5. chunker purity + determinism | lint + test | `kit-purity`; the doc-03 determinism property; `test-determinism` (no Date.now/Math.random — the domain takes `now`/`newId` injected) |
| 6. kind/lens exhaustiveness | compile | the `satisfies`/`assertNever` belts in `embeddings/store.ts` + search's dispatch — a missing route fails `tsc` (no runtime test needed) |
| 7. test-presence/test-layout | lint | the existing structure gates over the new domain's verbs/persistence/contract |
| 8. owner/host-scope no-leak | test | **the flagship int test** (DB5): users A (host) + B (member) share a chat; A attaches global+chat docs, B has his own global docs; assert (a) B's turn-scope retrieval returns only A's docs, (b) B's personal `{ownerId:B}` search returns zero of A's chunks, (c) A's search returns zero of B's |
| 9. graft byte-identity | test | the DB6 contract test: wired-empty vs absent assembled request deep-equal; positive control differs only in the slot region |

**The round-trip ingest test (DB4's checkpoint, spelled out):** upload a fixture `.md` → assert
CAS blob (kind `document`), documents row (canon text normalized), `databank-ingest` runs →
`document_chunks` rows with contiguous `chunkIdx`, spans partitioning the canon
(`slice(charStart, charEnd)` concat === extractedText), correct `(model,dim)`, hashes present →
`search.documents` with a query matching a known chunk returns it, in reading order → `remove` →
rows, junctions, chunks all gone (CASCADE), CAS blob unreferenced.

---

## 4. The resolved-questions ledger (the one-pager's §9, each closed or LEANed)

| # | Question (one-pager §9) | Resolution |
|---|---|---|
| Q1 | `extractedText` inline TEXT vs CAS text blob | **DECIDED: inline TEXT.** WHY: the canon is read on every reindex/chunk-preview/panel-view; a CAS hop per read buys nothing at exact-scan scale, and SQLite TEXT handles multi-MB rows. REJECTED: CAS text blob (an extra I/O + GC surface for a hypothetical size problem). Criterion to revisit: documents routinely > ~5 MB of TEXT measurably hurting row reads — then move the column behind the CAS with a byte-count trigger. |
| Q2 | chunk params: global default vs per-document override | **DECIDED: ONE user-setting** (`databankSettingsSchema`, doc 02 §4 — chunk + retrieval blobs, UserSettings tier). WHY: ST ships bank-wide params; nobody has demonstrated per-doc need; a param change is already safe (reindex + prune). REJECTED: per-document override columns (a second config home + panel surface for an unproven knob). Criterion: a real user need for format-divergent chunking (e.g. code vs prose banks) — then an optional per-document `chunkParams` JSON column, additive. |
| Q3 | whole-file-if-small threshold | **DECIDED: KEEP, default 5120 chars of extracted text** (doc 03 §1 — ST's ≤5 KB rule, re-based onto text chars with the WHY + rejected alternative recorded there). |
| Q4 | docx/epub vendoring | **LEAN: vendor mammoth + jszip as fast-follows**, gated by the 4-point criterion in doc 04 §5 (license/pure-JS/size/maintenance). A failing candidate leaves the format unsupported rather than shipping a liability. |
| Q5 | multi-human widening (host-only → membership union) | **DEFERRED with a committed default: host-only v1** (D49/D16 mirror). The flip is ONE file (`resolveActiveDocumentIds`, doc 05 §3.2) + widening gate-8's test. Criterion: when the D16 v2 membership-consent model lands for corpus, databank flips in the same change (README review flag 2 tracks the corpus asymmetry). |
| Q6 | re-extract on extractor upgrade | **DECIDED: the `databank-reindex` workload, `mode:'re-extract'`,** selected by `extractorVersion != EXTRACTOR_VERSION AND sourceAssetId IS NOT NULL` (docs 04 §4, 06 §4). Trigger LEAN: manual from the panel v1; criterion to automate (a boot sweep): a shipped version bump demonstrably leaving users stale. |

New LEANs introduced by this design (each recorded at its decision site): rerank default OFF
(doc 05 §3.5) · html loader = html-to-text with the Readability criterion (doc 04 §2) · upload
size cap 20 MB AppSettings (doc 02 §6) · query-text constants not settings (doc 07 §4) ·
ingest-lane concurrency single-slot (doc 06 §4) · manual re-extract trigger (above).
