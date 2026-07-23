// verb: gatherRetrieval — the chat GATHER op (DB6, databank-design/07 §2/§3/§6). Asserts the slot FORMAT
// (`# {name}` headers, `\n` within a document, `\n\n` between), the NULL contract (no hits ⇒ null; budget too
// small ⇒ null — the byte-identity pin), and BUDGET fitting (whole-chunk drop from the tail, reading order
// preserved, `tokensEstimated <= tokenBudget`). The `search.documents` lens is a scripted fake — the lens's
// own scope-gating is proven in the search-domain gate-8 test; here we drive the fit/format/null logic.

import type { ChatId, DocumentId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { estimateTokens } from "@orb/kit/tokens";
import { describe } from "vitest";
import type { DocumentChunkHit } from "../../../../../packages/server/src/domain/search/contract/results.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeDatabankHarness } from "../_support.ts";

const CHAT = castId<ChatId>("chat_gather");

/** A DocumentChunkHit fixture (the score is irrelevant to fit/format — the lens already ranked). */
function hit(documentId: string, name: string, chunkIdx: number, content: string): DocumentChunkHit {
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
    const hits = [hit("document_a", "Alpha", 0, "a0"), hit("document_a", "Alpha", 1, "a1"), hit("document_b", "Beta", 0, "b0")];
    const { service } = makeDatabankHarness(db, { searchDocuments: () => Promise.resolve(hits) });

    const result = await service.gatherRetrieval({ chatId: CHAT, queryText: "q", tokenBudget: 10_000 });

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

    const result = await service.gatherRetrieval({ chatId: CHAT, queryText: "q", tokenBudget: 10_000 });

    expect(result).toBeNull();
  });

  test("returns null when the budget cannot seat even the best chunk", async () => {
    const db = await freshDb();
    const hits = [hit("document_a", "Alpha", 0, "a very long chunk that will not fit a tiny budget at all")];
    const { service } = makeDatabankHarness(db, { searchDocuments: () => Promise.resolve(hits) });

    const result = await service.gatherRetrieval({ chatId: CHAT, queryText: "q", tokenBudget: 1 });

    expect(result).toBeNull();
  });

  test("drops whole chunks from the tail to fit the budget, reading order preserved", async () => {
    const db = await freshDb();
    const c0 = "alpha zero content chunk";
    const c1 = "bravo one content chunk";
    const hits = [hit("document_a", "Alpha", 0, c0), hit("document_a", "Alpha", 1, c1)];
    const { service } = makeDatabankHarness(db, { searchDocuments: () => Promise.resolve(hits) });

    // A budget that seats exactly the header + the first chunk — the second would overflow the rendered text.
    const budget = estimateTokens(`# Alpha\n${c0}`);
    const result = await service.gatherRetrieval({ chatId: CHAT, queryText: "q", tokenBudget: budget });

    expect(result?.text).toBe(`# Alpha\n${c0}`);
    expect(result?.hits).toEqual([{ documentId: castId<DocumentId>("document_a"), chunkIdx: 0, score: 0 }]);
    expect(result?.tokensEstimated).toBeLessThanOrEqual(budget);
  });
});
