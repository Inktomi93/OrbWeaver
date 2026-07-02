# 06 — The `DatabankService` Surface and the Ingest Subsystem

> **Status: COMMITTED (D49 item 5) — prescriptive design.** Every verb with its params/result zod
> inline; the authority rule per verb; the sync-vs-workload split argued; the two WorkloadKinds;
> the scrapers. The 8-slot file placement is doc 01 §4.

---

## 1. The service surface (contract/service.ts — authoritative)

```ts
export interface DatabankService {
  // ── canon producers ─────────────────────────────────────────────────────────
  upload(params: UploadDocumentParams): Promise<UploadResult>;
  createFromText(params: CreateFromTextParams): Promise<UploadResult>;
  scrapeWeb(params: ScrapeWebParams): Promise<UploadResult>;
  scrapeYoutube(params: ScrapeYoutubeParams): Promise<UploadResult>; // FAST-FOLLOW
  scrapeWiki(params: ScrapeWikiParams): Promise<UploadResult>; // FAST-FOLLOW

  // ── documents CRUD (fetchOwned) ─────────────────────────────────────────────
  get(params: GetDocumentParams): Promise<DocumentDetailView>;
  list(params: ListDocumentsParams): Promise<DocumentView[]>;
  rename(params: RenameDocumentParams): Promise<DocumentView>;
  remove(params: RemoveDocumentParams): Promise<void>;

  // ── derived-layer maintenance ───────────────────────────────────────────────
  reindex(params: ReindexParams): Promise<{ workloadId: WorkloadId }>;

  // ── scope junctions ─────────────────────────────────────────────────────────
  attachGlobal(params: GlobalAttachParams): Promise<void>;
  detachGlobal(params: GlobalAttachParams): Promise<void>;
  attachToChat(params: ChatAttachParams): Promise<void>;
  detachFromChat(params: ChatAttachParams): Promise<void>;
  attachToCharacter(params: CharacterAttachParams): Promise<void>; // FAST-FOLLOW
  detachFromCharacter(params: CharacterAttachParams): Promise<void>; // FAST-FOLLOW
  listAttachments(params: GetDocumentParams): Promise<DocumentAttachmentsView>;
  listActiveForChat(params: { chatId: ChatId }): Promise<DocumentView[]>; // the panel read

  // ── the chat graft (doc 07) ─────────────────────────────────────────────────
  gatherRetrieval(params: DatabankGatherParams): Promise<DatabankGatherResult | null>;
}
```

`rename` is included (NEW, small): `name` is mutable display metadata and the panel needs it;
it bumps `updatedAt` and touches nothing derived. REJECTED: remove+re-upload as the rename path
(destroys attachments and re-embeds everything to change a label).

### Params/results zod (contract/params.ts + results.ts — in full)

```ts
// Every verb parses its params at the front door (the zod-at-the-seam pattern).
// caller identity (ownerId/Principal) arrives via ctx, never in params — the fetchOwned idiom.

export const uploadDocumentParamsSchema = z.object({
  bytes: z.instanceof(Uint8Array), // transport (multipart route) hands the domain raw bytes
  mime: z.string().min(1),
  name: z.string().min(1).max(500),
});
export type UploadDocumentParams = z.infer<typeof uploadDocumentParamsSchema>;

export const createFromTextParamsSchema = z.object({
  name: z.string().min(1).max(500),
  text: z.string().min(1), // origin 'text' (ST Notepad); no bytes, no extraction
});

export const scrapeWebParamsSchema = z.object({ url: z.string().url() });
export const scrapeYoutubeParamsSchema = z.object({
  url: z.string().url(), // a watch URL or bare video id is normalized in the verb
  lang: z.string().default("en"),
});
export const scrapeWikiParamsSchema = z.object({
  url: z.string().url(), // a MediaWiki article URL; API endpoint derived from it
});

export const getDocumentParamsSchema = z.object({
  id: documentIdSchema,
  includeText: z.boolean().default(false), // DocumentDetailView.extractedText only when asked
});
export const listDocumentsParamsSchema = z.object({
  origin: docOriginSchema.optional(), // filter
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0),
});
export const renameDocumentParamsSchema = z.object({
  id: documentIdSchema,
  name: z.string().min(1).max(500),
});
export const removeDocumentParamsSchema = z.object({ id: documentIdSchema });

export const reindexParamsSchema = z.object({
  scope: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("document"), documentId: documentIdSchema }),
    z.object({ kind: z.literal("owner") }), // every document the caller owns
  ]),
  mode: z.enum(["chunk-embed", "re-extract"]).default("chunk-embed"), // §4
});

export const globalAttachParamsSchema = z.object({ documentId: documentIdSchema });
export const chatAttachParamsSchema = z.object({
  documentId: documentIdSchema,
  chatId: chatIdSchema,
});
export const characterAttachParamsSchema = z.object({
  documentId: documentIdSchema,
  characterId: characterIdSchema,
});

// ── results ────────────────────────────────────────────────────────────────────
export interface UploadResult {
  document: DocumentView;
  outcome: "created" | "duplicate"; // duplicate = the (ownerId, importHash) unique hit; existing doc returned
  ingest: "queued" | "skipped"; // skipped when duplicate (chunks already exist/healing anyway)
  warning?: "empty-extraction"; // extraction succeeded but charCount ≈ 0 (doc 04 §1)
}

export interface DocumentDetailView extends DocumentView {
  extractedText?: string; // present iff includeText
  extractorVersion: string;
}

export interface DocumentAttachmentsView {
  global: boolean;
  chatIds: readonly ChatId[];
  characterIds: readonly CharacterId[];
}

/** The databank-ingest / databank-reindex WORKLOAD result (per document, summed for owner scope). */
export interface IngestRunResult {
  documents: number;
  chunksUpserted: number; // written (new or changed hash)
  chunksNoop: number; // hash-gated skips — the idempotency observable
  chunksPruned: number;
  reExtracted: number; // mode:'re-extract' only
  failed: readonly { documentId: DocumentId; error: string }[]; // partial failure is DATA, not a throw
}
```

### Authority rules (per verb — decided)

| Verb group | Rule | WHY |
|---|---|---|
| upload/createFromText/scrape*/get/list/rename/remove/reindex/attachGlobal/listAttachments | **owner** (`fetchOwned` on the document; the caller's own bank) | single-owned canon (D21/D23) |
| attachToChat/detachFromChat | document owner AND chat **host** (`ensureChatHost`) | attaching injects content into every participant's prompts on the host's dime — member-initiated attach would be prompt injection by junction (REJECTED: any-member attach; revisit with the D16 v2 consent model) |
| attachToCharacter/detachFromCharacter | document owner AND character owner (`ensureCharacterOwned`) | both endpoints single-owned |
| listActiveForChat | any chat participant | read-only visibility of what feeds the room's prompts (members deserve to SEE what's injected, even though only host docs are) |
| gatherRetrieval | internal (chat GATHER only; not on the tRPC surface) | doc 07 |

Attach verbs are idempotent (`INSERT OR IGNORE` on the junction PK); detach of a non-attached pair
is a no-op `void`. WHY: the panel toggles freely; conflict errors on a toggle are UX noise with no
integrity value.

---

## 2. The upload pipeline — sync-vs-workload (the decision)

```
upload(bytes, mime, name):
  1.  importHash = sha256(bytes)                       [sync]
  2.  (ownerId, importHash) exists? → outcome:'duplicate', return existing view   [sync]
  3.  assets.store(bytes, kind:'document', mime, { enforceMagic: true })          [sync]
  4.  extractText(bytes, mime) → { text, meta }        [sync — see WHY]
  5.  INSERT documents row (extractedText = text, extractorVersion = meta.extractorVersion)  [sync]
  6.  enqueueWorkload('databank-ingest', { documentId })                          [async from here]
  7.  return { document, outcome:'created', ingest:'queued' }
```

**Steps 1–5 are SYNCHRONOUS (the verb awaits them). WHY:** `extractedText` is NOT NULL canon — the
document row cannot exist without it, and a failed extraction must fail the upload atomically
(nothing persisted, doc 04 §1). Extraction of one user-initiated file is seconds at worst — an
acceptable await on an explicit upload action. REJECTED: extraction-as-workload (requires a
text-less pending document state that poisons every NOT NULL assumption, plus a second failure
surface for the common path).

**Chunk+embed (the ingest subsystem, §3) is a WORKLOAD. WHY:** embedding N chunks is N provider
calls — the genuinely slow, failure-prone half; a 200-chunk PDF must not hold an HTTP request
hostage or die with it. The build-never-blocks invariant (embeddings law) applies: derived-layer
construction is fire-and-forget. REJECTED: inline embed on upload (a provider hiccup fails an
upload whose canon half already succeeded — the user re-uploads a file that is already there);
REJECTED: a per-chunk event fanout (the workloads engine already owns queue/retry/progress —
a second async mechanism for the same job).

`createFromText` = steps 1–2 with `importHash = sha256(utf8(text))`, skip 3–4 (no bytes, no
extraction; `sourceAssetId NULL`, `extractorVersion "none"`), then 5–7. Scrapers = fetch (§5) then
the SAME pipeline with the fetched bytes.

---

## 3. The ingest subsystem (`domain/databank/ingest/`)

The chunk→embed→prune orchestration, called by the workload runners through the injected env — the
`embeddings/indexer` analogue, idempotent end to end:

```
ingestDocument(documentId):                       // the ONE core both kinds share
  1. doc = load(documentId)
  2. settings = getDatabankSettings(doc.ownerId)  // chunk params (ONE user-setting, doc 08 §4 Q2)
  3. chunks = chunkText(doc.extractedText, settings.chunk)          // @orb/kit/chunk — pure
  4. space = getActiveEmbedSpace()                                   // injected connection op → {model, dim}
  5. for each chunk (bounded concurrency, progress-reported):
       embeddingsStore({ kind:'document', lens:'chunk', content: chunk.content,
                         model: space.model, dim: space.dim,
                         fkRefs: { documentId, chunkIdx: chunk.idx,
                                   charStart: chunk.start, charEnd: chunk.end } })
       → 'noop' when the hash is unchanged (free re-runs)
  6. pruneDocumentChunks({ documentId, keepCount: chunks.length, model: space.model })
  7. return per-document IngestRunResult line
```

**Idempotency (the invariant):** `importHash` dedups the CANON layer (re-upload); `contentHash`
no-ops dedup the VECTOR layer (re-run); the prune bounds the set. Running `ingestDocument` twice is
byte-identical state + zero extra provider calls — which makes crash recovery "just run it again"
(the workload retry verb), with no status column to repair (doc 02 §1.2).

**Partial failure posture:** a chunk's embed call failing mid-run leaves earlier chunks written
(visible as `embeddedCount < chunkCount` on `DocumentView` — the derived
extracted-but-not-fully-embedded state). The runner reports it in `IngestRunResult.failed` (data,
not a throw — one bad document must not fail an owner-wide reindex) and the workload completes; a
retry resumes from the no-ops. Retrieval over a partially-embedded document is safe by
construction: missing chunks simply aren't hits yet. REJECTED: transactional all-or-nothing embeds
(holding N provider calls hostage to the last one buys nothing — the partial state is already
consistent and self-describing).

---

## 4. The WorkloadKinds (`<domain>-<task>` convention; the crew/rpg naming pattern)

```ts
// @orb/contracts/workloads — additive members (kind union + WORKLOAD_KINDS tuple)
'databank-ingest'   // params: { documentId: DocumentId }
                    // chunk+embed+prune ONE document (the post-upload path)
'databank-reindex'  // params: { ownerId: UserId,
                    //           scope: { kind:'document', documentId } | { kind:'owner' },
                    //           mode: 'chunk-embed' | 're-extract' }
                    // bulk maintenance (param change, model change, extractor upgrade)
```

Both get: a params zod schema in `workload-params.ts`, a result type (`IngestRunResult`) in
`workload-result.ts`, a thin runner in `runners/`, a `RUNNERS` entry — the five mechanical edits;
the mapped-type Record makes a missing one a `tsc` error (the §7.5 gold standard, untouched).

- **`databank-ingest` runner:** calls `ingestDocument(params.documentId)` via the injected env.
- **`databank-reindex` runner:** resolves the document set (one, or all the owner's); for
  `mode:'re-extract'`: for each doc with `sourceAssetId != NULL AND extractorVersion !=
  EXTRACTOR_VERSION` → load bytes from the CAS → `extractText` → rewrite
  `extractedText`/`extractorVersion`/`updatedAt` → then `ingestDocument`. For `mode:'chunk-embed'`:
  `ingestDocument` only (covers chunk-param and embed-model changes — the hash/prune machinery
  sorts out what actually changed).
- **Two kinds, not one parameterized kind (decision).** WHY: the single-active-per-kind slot —
  a long owner-wide reindex must not block the "I just uploaded a file" ingest lane (and vice
  versa); separating the kinds gives each lane its own slot for free. REJECTED: one
  `databank-index` kind with a scope param (uploads queue behind a bulk reindex for hours).
- **Triggers:** upload/createFromText/scrape enqueue `databank-ingest` (automatic); the `reindex`
  VERB enqueues `databank-reindex` (user/panel action). Embed-model change: the connection-settings
  re-index workflow (embeddings.md open-decision — a `connection` → `workloads` concern) enqueues
  reindex per producer; databank participates by being enqueueable, it does not watch settings.
  Extractor upgrade: **LEAN — manual** (the panel surfaces "N documents extracted with an older
  extractor" from the derived count; the user clicks reindex). Criterion to automate: a shipped
  `EXTRACTOR_VERSION` bump demonstrably leaving users stale (then: an entry/boot sweep enqueues
  `databank-reindex mode:'re-extract'` per owner — additive).
- Single-active-per-kind consequence: rapid multi-file uploads serialize their ingests. Accepted —
  the queue drains in upload order and the panel shows progress. Criterion for a concurrency lane:
  bulk imports of hundreds of documents proving painful in practice.

---

## 5. The scrapers (`verbs/scrape/` — v1: web; fast-follow: youtube, wiki)

**SSRF prerequisite (ONE-LINE cross-ref; designed elsewhere):** all scraper fetches ride
`infra/network`'s `safeFetch` + response-validation belt — the shared remote-fetch prerequisite
whose design home is `proposed/gallery-design.md` §6 (the B4/B5a rows); scrapers add NO guard logic of
their own and do not land before that seam is wired.

| Verb | Fetch | Extract | Stamps |
|---|---|---|---|
| `scrapeWeb` | `fetchUrl(url)` → html bytes (size-capped) | the html loader (doc 04 §2) | `origin:'web'`, `sourceUrl`, `name` = page `title` (fallback: hostname+path), `mime:'text/html'` |
| `scrapeYoutube` | the transcript endpoint for the video id (timedtext; no API key) → caption text | passthrough (it IS text; joined with `\n`) | `origin:'youtube'`, `sourceUrl` = canonical watch URL, `name` = video title when available else the id, `mime:'text/plain'` |
| `scrapeWiki` | the MediaWiki API plain-text extract for the article (`action=query&prop=extracts&explaintext`) | passthrough | `origin:'wiki'`, `sourceUrl` = article URL, `name` = article title, `mime:'text/plain'` |

Each verb ends in the §2 pipeline (importHash over the fetched bytes → CAS → documents row →
enqueue ingest). A re-scrape of a changed page yields a new hash = a NEW document (the old one
stays until removed — scrape results are canon like any upload; REJECTED: in-place re-scrape
overwrite, which would silently rewrite canon another chat already retrieved from; `sourceUrl`
makes a future explicit "refresh" verb possible without deciding it now). ST parity note: ST's
`file`/`text` scrapers are our upload/createFromText; `fandom` rides `scrapeWiki` (a MediaWiki
host); ST's mediawiki/fandom server PLUGIN is not carried (one-line cite `scrapers.js:574`).

---

## 6. `DatabankContext` (the DI bundle — explicit interface)

```ts
export interface DatabankContext {
  db: Db;
  // injected cross-feature ops (types from the owning contracts; wired at entry/compose)
  assetsStore: AssetsStoreOp; // assets.store — CAS write (kind:'document')
  embeddingsStore: EmbeddingsStoreOp; // the ONE vector write path
  pruneDocumentChunks: PruneDocumentChunksOp; // the doc-05 §2.4 seam
  extractText: ExtractTextOp; // infra/extraction (via @orb/contracts/extraction)
  searchDocuments: SearchDocumentsOp; // search.documents — gatherRetrieval's engine call (doc 07)
  fetchUrl: SafeFetchOp; // infra/network safeFetch (the gallery-design prerequisite)
  getActiveEmbedSpace: () => Promise<{ model: string; dim: number }>; // connection
  enqueueWorkload: EnqueueWorkloadOp; // workloads.start
  getDatabankSettings: (ownerId: UserId) => Promise<DatabankSettings>; // settings tier
  ensureChatHost: EnsureChatHostOp; // chat-authority predicate (D18 requireHost)
  ensureCharacterOwned: EnsureCharacterOwnedOp;
  now: () => number; // injected clock (test-determinism)
  newId: NewTypeIdOp; // injected id mint
}
```

The databank↔search pairing is a MUTUAL injection wired at `entry/compose` with zero imports in
either direction: databank's `gatherRetrieval` calls `searchDocuments` (the engine); search's
`documents` verb calls databank's injected `resolveActiveDocumentIdsOp` (the scope union, doc 05
§3.2). The no-second-cosine invariant holds — databank never ranks; the one-home invariant holds —
search never unions junctions. Chat sits above both and injects only `databank.gatherRetrieval`.
