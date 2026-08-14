import type { DocOrigin, IngestPhase, ScraperKind } from "@orb/contracts/databank";
import {
  chatDocumentVisibilitySchema,
  chunkParamsSchema,
  DEFAULT_CHAT_DOCUMENT_VISIBILITY,
  DOC_ORIGINS,
  databankSettingsSchema,
  docOriginSchema,
  documentIdSchema,
  documentViewSchema,
  INGEST_PHASES,
  ingestPhaseSchema,
  reindexModeSchema,
  reindexScopeSchema,
  SCRAPER_KINDS,
  STALE_INGEST_MS,
  scraperKindSchema,
} from "@orb/contracts/databank";
import { mintTypeId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures.ts";

test("DOC_ORIGINS is exactly the pinned origin axis [upload, web, youtube, wiki, text]", () => {
  expect(DOC_ORIGINS).toEqual(["upload", "web", "youtube", "wiki", "text"]);
  expect(docOriginSchema.options).toEqual(DOC_ORIGINS);
});

test("docOriginSchema round-trips every valid origin and rejects non-members", () => {
  for (const origin of DOC_ORIGINS) {
    expect(docOriginSchema.parse(origin)).toBe(origin);
  }
  expect(docOriginSchema.safeParse("pdf").success).toBe(false);
  expect(docOriginSchema.safeParse("").success).toBe(false);
});

// Exhaustiveness: a `Record<DocOrigin, …>` is tsc-red if a member is added/removed (no inline re-spelling).
const ORIGIN_SEEN: Record<DocOrigin, true> = {
  upload: true,
  web: true,
  youtube: true,
  wiki: true,
  text: true,
};
test("DocOrigin has no member beyond the tuple", () => {
  expect(Object.keys(ORIGIN_SEEN).sort()).toEqual(DOC_ORIGINS.toSorted());
});

test("SCRAPER_KINDS is the fetched-bytes subset of the origin axis (web/youtube/wiki)", () => {
  expect(SCRAPER_KINDS).toEqual(["web", "youtube", "wiki"]);
  expect(scraperKindSchema.options).toEqual(SCRAPER_KINDS);
  // Every scraper kind is a real origin (the `satisfies readonly DocOrigin[]` pin, verified at runtime).
  for (const kind of SCRAPER_KINDS) {
    expect(docOriginSchema.safeParse(kind).success).toBe(true);
  }
});

const SCRAPER_SEEN: Record<ScraperKind, true> = { web: true, youtube: true, wiki: true };
test("ScraperKind has no member beyond the tuple", () => {
  expect(Object.keys(SCRAPER_SEEN).sort()).toEqual(SCRAPER_KINDS.toSorted());
});

test("INGEST_PHASES is the pinned phase axis, and the schema is built from that one tuple", () => {
  expect(INGEST_PHASES).toEqual(["empty", "indexing", "embedding", "ready", "stalled"]);
  expect(ingestPhaseSchema.options).toEqual(INGEST_PHASES);
  // The `databank.list` phase lens is a WIRE input now, so a non-member has to be refused at the boundary
  // rather than reaching a SQL predicate that would silently match nothing.
  expect(ingestPhaseSchema.safeParse("queued").success).toBe(false);
  expect(ingestPhaseSchema.safeParse("").success).toBe(false);
});

// Exhaustiveness: a `Record<IngestPhase, …>` is tsc-red if a member is added/removed — the same pin the
// server's `byPhase` census and the client's badge/chip Records carry.
const PHASE_SEEN: Record<IngestPhase, true> = { empty: true, indexing: true, embedding: true, ready: true, stalled: true };
test("IngestPhase has no member beyond the tuple", () => {
  expect(Object.keys(PHASE_SEEN).sort()).toEqual(INGEST_PHASES.toSorted());
});

// The stall threshold is CROSS-TIER: the server's `phase:'stalled'` SQL predicate and the client's rendered
// chip both measure against it, so a lens can never select a row the badge then calls something else.
test("STALE_INGEST_MS is the pinned 5-minute in-flight threshold", () => {
  expect(STALE_INGEST_MS).toBe(300_000);
});

test("chunkParamsSchema.parse({}) yields the documented ST-derived defaults (the kit-shape twin's contract)", () => {
  expect(chunkParamsSchema.parse({})).toEqual({ chunkSize: 2500, overlapPercent: 0, wholeFileThreshold: 5120 });
});

test("chunkParamsSchema enforces its bounds (min chunk 200, overlap 0–50)", () => {
  expect(chunkParamsSchema.safeParse({ chunkSize: 199 }).success).toBe(false);
  expect(chunkParamsSchema.safeParse({ overlapPercent: 51 }).success).toBe(false);
  expect(chunkParamsSchema.parse({ chunkSize: 400, overlapPercent: 10 })).toMatchObject({ chunkSize: 400, overlapPercent: 10 });
});

test("databankSettingsSchema.parse({chunk:{},retrieval:{}}) nests the chunk + retrieval defaults", () => {
  expect(databankSettingsSchema.parse({ chunk: {}, retrieval: {} })).toEqual({
    chunk: { chunkSize: 2500, overlapPercent: 0, wholeFileThreshold: 5120 },
    retrieval: { k: 5, minScore: 0.25, rerank: false },
  });
});

test("documentIdSchema validates the document_ prefix and rejects a foreign brand", () => {
  const id = mintTypeId("document");
  expect(documentIdSchema.parse(id)).toBe(id);
  expect(documentIdSchema.safeParse(mintTypeId("chat")).success).toBe(false);
});

test("reindexModeSchema is exactly [chunk-embed, re-extract]", () => {
  expect(reindexModeSchema.options).toEqual(["chunk-embed", "re-extract"]);
  expect(reindexModeSchema.safeParse("full").success).toBe(false);
});

test("reindexScopeSchema discriminates document (needs a documentId) vs owner", () => {
  const documentId = mintTypeId("document");
  expect(reindexScopeSchema.parse({ kind: "document", documentId })).toEqual({ kind: "document", documentId });
  expect(reindexScopeSchema.parse({ kind: "owner" })).toEqual({ kind: "owner" });
  expect(reindexScopeSchema.safeParse({ kind: "document" }).success).toBe(false); // missing documentId
  expect(reindexScopeSchema.safeParse({ kind: "nope" }).success).toBe(false);
});

test("documentViewSchema accepts a well-formed view and rejects a bad origin", () => {
  const view = {
    id: mintTypeId("document"),
    name: "notes.md",
    mime: "text/markdown",
    origin: "text",
    sourceUrl: null,
    byteSize: 42,
    charCount: 42,
    chunkCount: 3,
    embeddedCount: 3,
    createdAt: 1_750_000_000_000,
    updatedAt: 1_750_000_000_000,
  };
  expect(documentViewSchema.parse(view)).toMatchObject({ name: "notes.md", origin: "text" });
  expect(documentViewSchema.safeParse({ ...view, origin: "pdf" }).success).toBe(false);
});

test("chatDocumentVisibilitySchema (D85) validates a branded document-id set and default-denies stray keys", () => {
  const a = mintTypeId("document");
  const b = mintTypeId("document");
  expect(chatDocumentVisibilitySchema.parse({ hidden: [a, b] })).toEqual({ hidden: [a, b] });
  // Empty set is valid (nothing hidden — the widened union is retrieved in full).
  expect(chatDocumentVisibilitySchema.parse({ hidden: [] })).toEqual({ hidden: [] });
  // Strict at the trust boundary: a malformed id is rejected, and a stray key is default-denied.
  expect(chatDocumentVisibilitySchema.safeParse({ hidden: ["not-a-document-id"] }).success).toBe(false);
  expect(chatDocumentVisibilitySchema.safeParse({ hidden: [a], evil: true }).success).toBe(false);
});

test("DEFAULT_CHAT_DOCUMENT_VISIBILITY is the empty (nothing-hidden) set", () => {
  expect(DEFAULT_CHAT_DOCUMENT_VISIBILITY).toEqual({ hidden: [] });
  expect(chatDocumentVisibilitySchema.parse(DEFAULT_CHAT_DOCUMENT_VISIBILITY)).toEqual({ hidden: [] });
});
