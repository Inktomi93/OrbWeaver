---
kind: spec
status: active
updated: 2026-07-03
---

# 01 — Canon Resolution, Scope Mapping, the Home in the Cake

> **Status: COMMITTED (D49 item 5) — prescriptive design; the ledger D-entry wins on any conflict.**
> This doc carries the committed canon/ownership resolution forward from
> `../databank.md` §0–§4 and expands it to build grade. Nothing in §1–§3 is new law — it is
> the committed decision restated with its enforcement made explicit.

---

## 1. What is genuinely NEW (the reuse ledger)

| Concern                   | Lean on (exists)                                                              | Genuinely NEW                                                                 |
| ------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Vector write path         | `embeddings.store` — the ONE inserter                                          | a new `store` arm: `kind:'document', lens:'chunk'` — the 4th `SOURCE_KINDS` member, the 5th vector TABLE (doc 05) |
| Source-kind / lens tuples | `SOURCE_KINDS`/`SOURCE_LENSES`/`VECTOR_TABLES` with `satisfies`/`assertNever` | add `'document'` kind, `'chunk'` lens, `'document_chunks'` table — additive    |
| Retrieval engine          | `search` — cosine scan + CSLS + rerank + threshold                             | a `search.documents` lens + a `document` scope branch (doc 05)                 |
| Embed role                | `connection.resolveRole('embed')` → 1024-dim Qwen3-VL space                    | nothing — chunks land in the SAME space                                        |
| File bytes (original)     | per-user CAS (`assets` + `infra/storage`, D21)                                 | a `document` `AssetKind`; doc-mime magic sniff (doc 02 §6)                     |
| Ownership idioms          | `fetchOwned` + per-type FK junctions (world-info pattern)                      | `documents` table + 3 scope junctions (doc 02)                                 |
| Injection into prompt     | chat-assembly GATHER, `{{memory}}` dynamic/cache-safe slot                     | a `{{databank}}` reserved macro slot + ONE injected GATHER op (doc 07)         |
| Chunker                   | — (no `kit/chunk` exists)                                                      | **NEW `@orb/kit/chunk`** — pure recursive splitter (doc 03)                    |
| Text extraction           | `infra/storage`, `infra/image` precedent (db-free vendored loaders)            | **NEW `infra/extraction`** — pdf/html/txt/md→text, db-free (doc 04)            |
| Async execution           | `workloads` engine + `RUNNERS` mapped-type Record                              | `databank-ingest` + `databank-reindex` WorkloadKinds (doc 06)                  |
| Scrapers                  | `infra/network` (`safeFetch` staged seam — gallery-design's B4/B5a home)       | scraper verbs in the domain (doc 06 §5)                                        |

---

## 2. Canon tension — RESOLVED (committed; restated)

Every pre-databank vector row is a pure function of pre-existing canon. An uploaded document has
**no pre-existing producer** — the user creates source-of-truth content by uploading. The committed
resolution: make the document a NEW canon producer, then derive as usual.

```
NEW CANON (source of truth)         DERIVED (pure function of the canon, re-runnable)
─────────────────────────────────────────────────────────────────────────────────────
documents             ──extract──▶  documents.extractedText    (binary → text; re-run on extractor upgrade)
(ownerId, fetchOwned)  ──chunk────▶  document_chunks.content    (text → slices; re-run on param change)
                       ──embed────▶  document_chunks.embedding  (chunk → vector, via embeddings.store;
                                                                 re-run on model/dim change)
```

Three independently re-runnable derive layers. **The one canon subtlety a builder must hold:**
`documents.extractedText` is ITSELF the canon the chunks derive from — the original BYTES (in the
CAS) are *provenance*, kept so extraction can be re-run when `infra/extraction` upgrades
(`extractorVersion`, doc 04 §4). A `text`-origin document (typed in, no file) has
`sourceAssetId = NULL` and can never be re-extracted — its `extractedText` is the only source, which
is fine: there is nothing better to extract from.

`document_chunks` is **exactly a `chat_segments` analogue**: verbatim slice + embedding + producer
FK (`documentId`, CASCADE) + `content_hash` staleness gate + `(model,dim)` space tag + **NO
`ownerId`** (D20 — owner derives via `documents.ownerId`).

---

## 3. ST's 3 scopes → orbweaver's 2 ownership categories (committed; restated)

ST uses a polymorphic `(type, untyped_id)` attachment source — the exact D24-forbidden pattern
(ST `chats.js:77` `ATTACHMENT_SOURCE`). Orbweaver maps via the world-info junction precedent:

| ST scope      | orbweaver model                        | Mechanism                                                        | Meaning at retrieval time                                    |
| ------------- | -------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------ |
| **global**    | single-owned (D21 — NOT a global tier) | `global_documents(ownerId, documentId)`                           | auto-active in all the owner's chats                         |
| **character** | derive via per-type FK                 | `character_documents(characterId, documentId)`                    | active when that character is in the chat (FAST-FOLLOW verb) |
| **chat**      | membership-scoped                      | `chat_documents(chatId, documentId)`                              | active in that specific chat                                 |

Every document is single-owned (`documents.ownerId`). Scope = "where it is retrieved" = per-type FK
junction rows, unioned at query time (`resolveActiveDocumentIds`, doc 05 §3) — identical to how the
chat GATHER unions the four world-book scope junctions.

### The multi-human leak — resolved (the D16 mirror; committed)

Databank v1: **document retrieval is owner-scoped; in a group chat, only the HOST's attached
documents are retrieved** — for every speaker's turn, not just the host's (the host funds and hosts
the room; a member's own global documents never leak into a shared room, and a member never
receives another member's documents). The host is resolved from live membership
(`chat_participants.role='host'`, D18 — never a stamped owner column). Solo/single-user is
unaffected (the owner IS the host). The membership-gated union (every member's docs, consented)
widens for free later, exactly as D16 promises for corpus. Enforcer: gate 8 (§6) — the
two-member int test.

### Attachment activation = junction presence (NEW decision)

ST additionally tracks `disabled_attachments` — an attachment can exist but be toggled off
(ST `chats.js` disabled-by-URL list). **Decision: orbweaver has no `enabled` flag — junction-row
presence IS activation; detach = disable.** WHY: the document row (canon, chunks, CAS bytes) is
unaffected by detach, so re-attach is a free two-column insert — the flag would be a second way to
spell "detached" with no information the junction's absence doesn't carry. REJECTED: an
`enabled: integer` column on each junction — three more columns, a filter every union must remember
(a forgotten `WHERE enabled=1` is a silent scope bug), for a toggle whose off-state is
indistinguishable from detachment.

---

## 4. Home in the cake (committed; restated with the new pieces pinned)

```
@orb/kit/chunk            NEW — pure recursive splitter (text+params → chunks[]); zero I/O, isomorphic
@orb/contracts/databank   NEW — DocumentView, DOC_ORIGINS, chunk/retrieval param schemas, wire zod
@orb/contracts/extraction NEW — the ExtractTextOp signature + ExtractionResult/meta + the error pair
                                (cross-boundary: infra implements, domain injects — the
                                 EmbedRequest/@orb/contracts/providers precedent)
@orb/db/schema/databank   NEW — documents + 3 scope junctions
@orb/db/schema/embeddings + document_chunks (the 5th vector table — the table owner names the file)
infra/extraction          NEW — vendored pdf/html/txt/md→text loaders; db-free; EXTRACTOR_VERSION
domain/databank           NEW — the canon producer domain (CRUD, junctions, ingest, scrapers, gather)
domain/embeddings         + the 'document'/'chunk' store arm + pruneDocumentChunks (written THERE)
domain/search             + the documents lens verb (written THERE; scope resolver injected from databank)
domain/chat               consumes databank.gatherRetrieval as ONE optional injected GATHER op
domain/workloads          + 'databank-ingest' / 'databank-reindex' kinds (runners are thin wrappers)
domain/assets             + the 'document' AssetKind member (contracts tuple + sniff extension)
```

### The 8-slot layout (`domain/databank`)

```
domain/databank/
├── index.ts          FRONT DOOR — DatabankService + factory + view/param/error re-exports
├── service.ts        COMPOSITION ROOT — wires verbs + injected deps. ZERO logic.
├── context.ts        DI BUNDLE — explicit interface DatabankContext:
│                       { db, assetsStore, embeddingsStore, pruneDocumentChunks, extractText,
│                         fetchUrl, getActiveEmbedSpace, enqueueWorkload, getDatabankSettings,
│                         ensureChatHost, ensureCharacterOwned, now, newId }
├── contract/
│   ├── service.ts    DatabankService interface (doc 06 §1 — the authoritative API)
│   ├── params.ts     Upload/CreateFromText/List/Reindex/Attach*/Scrape*/Gather params (zod, doc 06)
│   ├── results.ts    UploadResult, IngestRunResult, DatabankGatherResult, DocumentAttachmentsView
│   ├── views.ts      DocumentView, DocumentChunkView (derive @orb/contracts/databank)
│   └── errors.ts     DocumentNotFoundError; re-exports ExtractionFailedError /
│                     UnsupportedDocTypeError from @orb/contracts/extraction (one declaration)
├── verbs/
│   ├── upload.ts             the sync canon write: CAS store → extract → documents row → enqueue ingest
│   ├── create-from-text.ts   origin 'text' — no bytes, no extraction; straight to canon + enqueue
│   ├── get.ts list.ts rename.ts remove.ts     documents CRUD (fetchOwned)
│   ├── reindex.ts            enqueue databank-reindex (params/model/extractor change)
│   ├── gather-retrieval.ts   the chat GATHER op (doc 07)
│   ├── attach/
│   │   ├── global.ts     attachGlobal · detachGlobal
│   │   ├── chat.ts       attachToChat · detachFromChat      (host authority)
│   │   ├── character.ts  attachToCharacter · detachFromCharacter   (FAST-FOLLOW)
│   │   └── index.ts
│   └── scrape/
│       ├── web.ts youtube.ts wiki.ts    fetchUrl → extract → the upload path
│       └── index.ts
├── persistence/
│   ├── queries.ts    toDocumentView (with derived chunk/embedded counts) · loadOwnedDocument ·
│   │                 junction CRUD · listAttachments
│   └── scope.ts      resolveActiveDocumentIds({chatId}|{ownerId}) — UNION the junctions (host-only v1);
│                     the ONE home for the union (injected into search — doc 05 §3)
├── substrate/        (none — the chunker is @orb/kit/chunk; extraction is infra/extraction)
└── ingest/           NAMED SUBSYSTEM — chunk→embed→prune orchestration (doc 06 §3); called by the
                      databank-ingest/reindex runners through the injected workload env; idempotent
```

### One-home calls (committed; the enforcement column made explicit)

| Concept | ONE home | Enforcer |
|---|---|---|
| chunker | `@orb/kit/chunk` | `kit-purity` (zero I/O/domain deps); isomorphic — the Phase-6 client chunk-count preview imports the same function |
| text extraction | `infra/extraction` behind the injected `extractText` op | dep-cruiser `infra-no-db` + `infra-no-domain`; the op TYPE lives in `@orb/contracts/extraction` so the domain never imports infra |
| `document_chunks` schema | `@orb/db/schema/embeddings.ts` | the existing embeddings write-import rule extends to the 5th table |
| the `'document'`/`'chunk'` store arm | `domain/embeddings` (`store.ts` + tuples) | `assertNever`/`satisfies` belt — adding the kind without the table route is a `tsc` error |
| chunk-row deletes (reindex prune) | `domain/embeddings` (`pruneDocumentChunks`) | same write-import rule; databank never touches the table |
| the documents rank pipeline | `domain/search` (`verbs/documents.ts`) | no-second-cosine (dep-cruiser: `vector_distance_cos` only under `search/persistence/`) |
| the 3-junction scope union | `domain/databank/persistence/scope.ts` | injected into search's documents verb at compose (doc 05 §3) — search never re-implements it |
| prompt injection | `domain/chat` assembly, `{{databank}}` slot | chat imports nothing from databank (dep-cruiser both directions); the op is injected at `entry/compose` |

---

## 5. Born-compliant / sequencing posture (committed; restated)

Nothing must be reserved before Phase 5 (D49: "Born-compliant-now: NOTHING"). One optional cheap
reservation stands: if the chat macro union is locked during Phase 5, add `{{databank}}` as a
reserved dynamic/cache-safe slot then (additive, zero behavior — the slot resolves empty until the
graft lands, exactly the posture rpg-design 10 already assumes for its preset). `FLAG[PD-57]` marks
the embeddings tuples + the search scope union as the add-when-built sites.

Build order (expanded into chunks in doc 08): kit/chunk → schema + contracts + embeddings/search
arms → infra/extraction (parallel long pole) → domain/databank + workloads → search lens → chat
graft → scrapers → fast-follows.

---

## 6. Gates (every invariant ships its enforcer — committed; test mapping in doc 08 §3)

1. **No second vector write path** — databank never inserts into `document_chunks`; only via
   `embeddings.store` (deletes only via `embeddings.pruneDocumentChunks`). _(dep-cruiser: no
   `@orb/db/schema/embeddings` write import outside `domain/embeddings`.)_
2. **`vector-scope-derived` (extended)** — `document_chunks` reads only via `search.documents`;
   owner/host scope applied BEFORE cosine rank AND before `content_hash` collapse. No `ownerId` on
   `document_chunks` or any junction. _(dep-cruiser + the schema itself.)_
3. **No polymorphic attachment** — 3 typed per-type FK junctions; no `(source_type, source_id)`
   column anywhere. _(schema-shape test.)_
4. **`infra/extraction` is db-free + domain-free.** _(dep-cruiser `infra-no-db`/`infra-no-domain`.)_
5. **The chunker is pure** — zero I/O / domain deps; deterministic. _(`kit-purity` +
   `test-determinism`.)_
6. **Source-kind/lens exhaustiveness** — adding `'document'`/`'chunk'` without routing the table is
   a `tsc` error. _(the `assertNever`/`satisfies` belt.)_
7. **`test-presence`/`test-layout`** — every verb + persistence + contract-schema carries its test.
8. **Document retrieval is owner/host-scoped** — a non-owner's turn never retrieves another user's
   document; a group turn retrieves only the host's. _(int test: a 2nd member's turn returns zero of
   member-A's chunks AND zero of the member's own global docs.)_
9. **The chat graft is invisible when idle** — the op wired but no active documents ⇒ the assembled
   request is byte-identical to the op-absent build. _(contract test — the rpg no-game pin, doc 07 §5.)_
