---
kind: spec
status: active
updated: 2026-07-03
---

# Databank Design — the prescriptive plan for `domain/databank` (doc-set index)

> **Status: COMMITTED (D49 item 5, 2026-06-28).** Data Bank / document-RAG IS built, as a post-chat
> ADDITIVE GRAFT (Phase 7). `Core-Laws-and-Precedents.md` D49 item (5) is the decision record and
> wins on any conflict; [`databank.md`](databank.md) is the committed
> one-page decision record this set expands — its decisions are LAW here, never re-decided. The
> evidence base (the ST source audit) is archived to git history
> (`docs/architecture/domains/proposed/databank/databank.md` at commit `982fd99~1`). Everything here
> is prescriptive and self-contained: a builder with ONLY this doc set + the orbweaver law docs

> **Triage 2026-07-09 (dispatch board — `../README.md` §0):** READY-TO-BUILD. DB3 (`infra/extraction`, the declared long pole) is dispatchable NOW and should start early; DB2 schema landed 2026-07-09. DB6 needs the chat GATHER op (obligation #20); DB7 needs hub H1.
> (AGENTS-1/2/3, the committed domain docs it cites — `embeddings.md`, `search.md`, `assets.md`,
> `workloads.md`, `chat.md`, `world-info.md`) can build the whole system — no ST reading required.
> Every new decision carries its WHY + the rejected alternative; where a call is deliberately open,
> it is a LEAN with a committed default + the criterion that flips it.

## The one-paragraph design

A Data Bank is **books-shaped ownership over a chat_segments-shaped vector substrate.** An uploaded
document is a NEW **single-owned canon producer** (`documents.ownerId` + `fetchOwned` — a
`characters`/`world_books` twin); its chunks are a canon-**DERIVED** 5th vector table
(`document_chunks`, a `chat_segments` twin: verbatim slice + embedding, producer FK CASCADE,
`content_hash` staleness, `(model,dim)` space tag, NO `ownerId` — D20). ST's three scopes map onto
orbweaver's two ownership categories via three per-type FK junctions
(`global_documents`/`character_documents`/`chat_documents` — never a polymorphic `(type,id)` table,
D24). The graft is ~70% reuse: chunks ride `embeddings.store` (a new discriminated arm — the 4th
`SOURCE_KINDS` member feeding the 5th vector table; the ONE
write path), retrieval is a `search.documents` lens (the ONE engine — rank, then reading-order
restore, then dedupe), the original bytes ride the per-user CAS (D21, a `document` `AssetKind`),
and the chat graft is ONE optional injected GATHER op (`databank.gatherRetrieval`) filling a
`{{databank}}` macro slot in the dynamic/cache-safe half, parallel to `{{memory}}` — a null result
is a byte-identical non-databank turn (the rpg `no-if(isGame)` enforcement pattern; rpg-design 05 §0
cites THIS graft as its precedent). Genuinely new code is bounded: a pure `@orb/kit/chunk` recursive
splitter, a db-free vendored `infra/extraction` loader (the long pole), the producer + junction
tables, the ingest subsystem (sync canon write, workload-driven chunk+embed), and the scraper verbs.
Retrieval is owner/host-scoped v1 (the D16 mirror); the membership-gated union widens for free.

## Reading order

| Doc | What it locks |
|---|---|
| [`01-canon-and-domain-shape.md`](01-canon-and-domain-shape.md) | the canon resolution, the 3-scopes→2-categories mapping, the home in the cake, the 8-slot layout, the one-home calls, the gate table |
| [`02-schema-and-contracts.md`](02-schema-and-contracts.md) | the full DDL (documents · document_chunks · the 3 junctions), the argued column extensions, `@orb/contracts/databank` zod, views, errors, the `document` AssetKind |
| [`03-chunker-kit.md`](03-chunker-kit.md) | `@orb/kit/chunk` in full: the recursive-split algorithm, params + defaults, determinism rules, edge cases, the golden-test plan |
| [`04-extraction-infra.md`](04-extraction-infra.md) | `infra/extraction` in full: the per-format loader table, the ONE injected `extractText` op, the error taxonomy, `EXTRACTOR_VERSION`, the vendoring LEAN, why it is the long pole |
| [`05-embeddings-and-search-arms.md`](05-embeddings-and-search-arms.md) | the 5th `embeddings.store` arm (tuples + discriminated params + routing), the prune seam, the `search.documents` lens (signature, scope resolution, the full rank pipeline) |
| [`06-service-and-ingest.md`](06-service-and-ingest.md) | the complete `DatabankService` surface (every verb, zod inline), authority rules, the ingest subsystem (sync-vs-workload), `databank-ingest`/`databank-reindex` WorkloadKinds, the scrapers |
| [`07-chat-graft.md`](07-chat-graft.md) | the injected GATHER op, `DatabankGatherResult`, the `{{databank}}` slot semantics, query-text construction, the budget posture, the byte-identity pin |
| [`08-build-plan.md`](08-build-plan.md) | DB1–DB8 shippable chunks with sizes/checkpoints/dependencies, the per-chunk test plans, the gates→tests matrix, the resolved-open-questions ledger |

## Standing decisions a cold agent must not re-litigate

An uploaded document is a NEW canon producer, chunks are derived — derive-don't-stamp is EXTENDED,
never broken (D49 item 5) · `document_chunks` carries NO `ownerId` (D20); owner derives via
`documents.ownerId` · three typed per-type FK junctions, never a polymorphic `(type,id)` table
(D24) · documents are single-owned; there is NO global tier (D21) · databank never inserts a vector
row — `embeddings.store` is the only inserter (the single-write-path invariant) · databank never
runs cosine — `search.documents` is the only reader (no-second-cosine) · retrieval is owner-scoped;
in a group chat only the HOST's attached documents are retrieved (the D16 mirror; the
membership-gated union widens for free later) · `document_chunks` schema lives in
`@orb/db/schema/embeddings.ts` (the vector-table owner names the file); `documents` + the 3
junctions live in `@orb/db/schema/databank.ts` · the chunker is pure `@orb/kit/chunk`
(`kit-purity`); extraction is db-free + domain-free `infra/extraction` (`infra-no-db`/
`infra-no-domain`) · chat gains NOTHING databank-specific beyond ONE optional injected GATHER op +
the `{{databank}}` reserved macro slot; a non-databank turn is byte-identical · v1 scope = global +
chat scopes, txt/md/pdf/html, owner/host-only retrieval; character scope + docx/epub + youtube/wiki
scrapers are fast-follow · chunks land in the SAME 1024-dim space via the same `embed` role —
nothing about the substrate changes.

## Review flags (arguments to the lead — the committed decisions above are NOT edited)

1. **`StoreParams` shape drift (embeddings.md).** `domains/embeddings.md` (gutted — the code is the doc; git history) sketches ONE flat
   `StoreParams` with an optional `fkRefs` bag; the committed databank one-pager names a
   *discriminated* `DocumentChunkStoreParams` arm. Doc 05 specs the discriminated-union shape (the
   databank commitment) and treats the other four kinds' arms as the mechanical consequence.
   `embeddings.md`'s prose should be updated to the union shape when the 5th arm lands — flat
   `fkRefs` cannot give the per-kind exhaustiveness (`assertNever` routing) both docs demand.
2. **Host-only v1 vs search.md's corpus posture.** `search.md` (knowledge-cluster merge §6) states
   cross-chat corpus is "MEMBERSHIP-GATED in full (not host-only v1)" — it superseded D16's
   host-only-v1 for corpus. Databank's host-only v1 is separately committed (D49 mirrors D16), so
   no conflict in law — but the "widens for free" promise should be tracked against corpus: when
   the corpus union pattern exists in `search/persistence/scope.ts`, flipping databank to the
   membership union is a one-site change in `resolveActiveDocumentIds` (doc 05 §3). Flagging so
   the asymmetry is a known choice, not drift.
3. **SSRF prerequisite home — cite UPDATED (D61; design-review DB-2).** The scrapers'
   remote-fetch guard (`safeFetch` + `isAllowedImageBuffer`) is a shared infra prerequisite whose
   AUTHORITATIVE design is now **`proposed/hub-browse-design/01-network-guard.md`** (B5a —
   self-enforcing posture, required host allowlist, dimension caps, `@orb/kit/image-sniff`);
   `gallery-design.md` §6 carries the delta banner pointing there, and the staged seam itself is
   `infra/network/egress.ts` (`Tier-3-Infra.md`). This set cites it one-line only (doc 06 §5) and
   designs nothing — exactly the relocation this flag anticipated.
4. **Additive column extensions to the committed DDL** (doc 02 argues each): `documents` gains
   `updatedAt`, `extractorVersion`, `sourceUrl`; `document_chunks` gains `charStart`/`charEnd`.
   All additive, none alters a committed column/index/invariant. Lead sign-off requested since the
   one-pager's DDL is quoted elsewhere.
5. **`embeddings.pruneDocumentChunks` — a new narrow write seam** (doc 05 §2.4). Reindex can shrink
   a document's chunk count; upsert alone strands tail rows. The delete lives in `embeddings`
   (the table owner), mirroring `writeHubScores` as a second sanctioned non-`store` write. If the
   lead prefers zero new seams, the fallback is clear-then-restore (correct, loses the hash-gated
   no-op economy on re-extract) — argued in 05, default is the prune verb.
