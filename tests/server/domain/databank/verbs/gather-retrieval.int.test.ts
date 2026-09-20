// verb: gatherRetrieval — the chat GATHER op (DB6, databank-design/07 §2/§3/§6). Asserts the slot FORMAT
// (`# {name}` headers, `\n` within a document, `\n\n` between), the NULL contract (no hits ⇒ null; budget too
// small ⇒ null — the byte-identity pin), and BUDGET fitting (whole-chunk drop from the tail, reading order
// preserved, `tokensEstimated <= tokenBudget`). The `search.documents` lens is a scripted fake — the lens's
// own scope-gating is proven in the search-domain gate-8 test; here we drive the fit/format/null logic.

import { databankRetrievalSettingsSchema } from "@orb/contracts/databank";
import type { ChatId, DocumentId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { estimateTokens } from "@orb/kit/tokens";
import { describe } from "vitest";
import type { DocumentChunkHit } from "../../../../../packages/server/src/domain/search/contract/results.ts";
import { DEFAULT_DOCUMENT_K, DEFAULT_DOCUMENT_MIN_SCORE } from "../../../../../packages/server/src/domain/search/substrate/constants.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeDatabankHarness } from "../_support.ts";

const CHAT = castId<ChatId>("chat_gather");
const HOST = castId<UserId>("user_host");

/** A DocumentChunkHit fixture (the score is irrelevant to fit/format — the lens already ranked). */
function hit(documentId: DocumentId, name: string, chunkIdx: number, content: string): DocumentChunkHit {
  return {
    documentId: castId<DocumentId>(documentId),
    documentName: name,
    chunkId: castId<DocumentChunkHit["chunkId"]>(`document_chunk_${documentId}_${chunkIdx}`),
    chunkIdx,
    content,
    score: 0,
    contentHash: `hash_${documentId}_${chunkIdx}`,
  };
}

describe("gatherRetrieval", () => {
  test("renders the reading-order hits into the slot format", async () => {
    const db = await freshDb();
    const hits = [
      hit(castId<DocumentId>("document_a"), "Alpha", 0, "a0"),
      hit(castId<DocumentId>("document_a"), "Alpha", 1, "a1"),
      hit(castId<DocumentId>("document_b"), "Beta", 0, "b0"),
    ];
    const { service } = makeDatabankHarness(db, { searchDocuments: () => Promise.resolve(hits) });

    const result = await service.gatherRetrieval({ chatId: CHAT, hostUserId: HOST, queryText: "q", tokenBudget: 10_000 });

    expect(result?.text).toBe("# Alpha\na0\na1\n\n# Beta\nb0");
    expect(result?.hits).toEqual([
      { documentId: castId<DocumentId>("document_a"), chunkIdx: 0, score: 0 },
      { documentId: castId<DocumentId>("document_a"), chunkIdx: 1, score: 0 },
      { documentId: castId<DocumentId>("document_b"), chunkIdx: 0, score: 0 },
    ]);
  });

  test("returns null when the lens finds nothing (the byte-identity no-op)", async () => {
    const db = await freshDb();
    const { service } = makeDatabankHarness(db, { searchDocuments: () => Promise.resolve([]) });

    const result = await service.gatherRetrieval({ chatId: CHAT, hostUserId: HOST, queryText: "q", tokenBudget: 10_000 });

    expect(result).toBeNull();
  });

  test("passes the retrieval params (k/minScore/rerank) to search.documents when supplied", async () => {
    const db = await freshDb();
    const seen: { k: number | undefined; minScore: number | undefined; rerank: boolean | undefined }[] = [];
    const { service } = makeDatabankHarness(db, {
      searchDocuments: (p) => {
        seen.push({ k: p.k, minScore: p.minScore, rerank: p.rerank });
        return Promise.resolve([hit(castId<DocumentId>("document_a"), "Alpha", 0, "a0")]);
      },
    });

    await service.gatherRetrieval({ chatId: CHAT, hostUserId: HOST, queryText: "q", tokenBudget: 10_000, k: 3, minScore: 0.4, rerank: true });

    expect(seen).toEqual([{ k: 3, minScore: 0.4, rerank: true }]);
  });

  test("omits retrieval params when absent ⇒ search.documents uses its own defaults (byte-identity pin)", async () => {
    const db = await freshDb();
    const seen: { k: number | undefined; minScore: number | undefined; rerank: boolean | undefined }[] = [];
    const { service } = makeDatabankHarness(db, {
      searchDocuments: (p) => {
        seen.push({ k: p.k, minScore: p.minScore, rerank: p.rerank });
        return Promise.resolve([hit(castId<DocumentId>("document_a"), "Alpha", 0, "a0")]);
      },
    });

    await service.gatherRetrieval({ chatId: CHAT, hostUserId: HOST, queryText: "q", tokenBudget: 10_000 });

    expect(seen).toEqual([{ k: undefined, minScore: undefined, rerank: undefined }]);
  });

  // PIN, NOT a derive: `search.documents`' own fallbacks (DEFAULT_DOCUMENT_K / DEFAULT_DOCUMENT_MIN_SCORE) and
  // the databank retrieval-settings defaults (databankRetrievalSettingsSchema) are TWO INDEPENDENT literals in
  // two domains. They MUST agree so an unset databank knob (gather omits it → search falls to its own default)
  // is byte-identical to the databank default the UI shows. They stay SEPARATE by design: `search` is
  // databank-agnostic (the Knowledge-Cluster boundary — search is the one retrieval engine, it must not import
  // databank), so this is an equality ASSERTION, never a derive. Do NOT "fix" the duplication by importing one
  // into the other — that would couple retrieval to databank across the cluster boundary.
  test("search's document-retrieval defaults EQUAL the databank retrieval defaults (cluster-boundary pin, not a derive)", () => {
    const databankDefaults = databankRetrievalSettingsSchema.parse({});
    expect(DEFAULT_DOCUMENT_K).toBe(databankDefaults.k);
    expect(DEFAULT_DOCUMENT_MIN_SCORE).toBe(databankDefaults.minScore);
  });

  test("returns null when the budget cannot seat even the best chunk", async () => {
    const db = await freshDb();
    const hits = [hit(castId<DocumentId>("document_a"), "Alpha", 0, "a very long chunk that will not fit a tiny budget at all")];
    const { service } = makeDatabankHarness(db, { searchDocuments: () => Promise.resolve(hits) });

    const result = await service.gatherRetrieval({ chatId: CHAT, hostUserId: HOST, queryText: "q", tokenBudget: 1 });

    expect(result).toBeNull();
  });

  test("drops whole chunks from the tail to fit the budget, reading order preserved", async () => {
    const db = await freshDb();
    const c0 = "alpha zero content chunk";
    const c1 = "bravo one content chunk";
    const hits = [hit(castId<DocumentId>("document_a"), "Alpha", 0, c0), hit(castId<DocumentId>("document_a"), "Alpha", 1, c1)];
    const { service } = makeDatabankHarness(db, { searchDocuments: () => Promise.resolve(hits) });

    // A budget that seats exactly the header + the first chunk — the second would overflow the rendered text.
    const budget = estimateTokens(`# Alpha\n${c0}`);
    const result = await service.gatherRetrieval({ chatId: CHAT, hostUserId: HOST, queryText: "q", tokenBudget: budget });

    expect(result?.text).toBe(`# Alpha\n${c0}`);
    expect(result?.hits).toEqual([{ documentId: castId<DocumentId>("document_a"), chunkIdx: 0, score: 0 }]);
    expect(result?.tokensEstimated).toBeLessThanOrEqual(budget);
  });
});
