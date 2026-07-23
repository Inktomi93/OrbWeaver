// Runner test: databank-ingest — the post-upload chunk+embed pass for ONE document. Thin wrapper: it reaches
// the databank ingest subsystem through `ctx.env.databank.ingest` (never a db reach) and returns its
// IngestRunResult verbatim.

import type { DocumentId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, vi } from "vitest";
import { databankIngestRunner } from "../../../../../packages/server/src/domain/workloads/runners/databank-ingest.ts";
import { expect, test } from "../../../../support/fixtures";
import { fakeEnv, makeRunnerContext } from "../_support.ts";

const DOC_ID = castId<DocumentId>("document_scrolls");

describe("databank-ingest runner", () => {
  test("ingests the one document through the injected env and returns its result", async () => {
    const env = fakeEnv();
    const result = await databankIngestRunner(makeRunnerContext(env), { documentId: DOC_ID }, vi.fn(), new AbortController().signal);
    expect(env.databank.ingest).toHaveBeenCalledWith({ documentId: DOC_ID, signal: expect.any(AbortSignal) });
    expect(result).toEqual({ documents: 1, chunksUpserted: 3, chunksNoop: 0, chunksPruned: 0, reExtracted: 0, failed: [] });
  });
});
