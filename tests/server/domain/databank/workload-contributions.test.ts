// Contribution test: databank's two RAG kinds. `databank-ingest` is the ONE `interactive`-lane job in the
// registry (a user is waiting on it — RAG is unavailable until it lands), which is the whole reason the lane
// axis exists. `databank-reindex` floors its mode and, PD-139(c), reclaims the OLD document embed space via
// the INJECTED purge op after a BULK non-aborted sweep — never on a singular pass, never on abort.

import type { WorkloadRunContext } from "@orb/contracts/workloads";
import type { DocumentId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, vi } from "vitest";
import type { DatabankWorkloadDeps } from "../../../../packages/server/src/domain/databank/contract/service.ts";
import { createDatabankWorkloadContributions } from "../../../../packages/server/src/domain/databank/workload-contributions.ts";
import { expect, test } from "../../../support/fixtures.ts";

const OWNER_ID = castId<UserId>("user_owner");
const DOCUMENT_ID = castId<DocumentId>("document_a");
const T0 = 1_700_000_000_000;
const ctx: WorkloadRunContext = { userId: OWNER_ID, ownerId: OWNER_ID, now: () => T0 };
const bulkCtx: WorkloadRunContext = { ...ctx, ownerId: null };
const sig = (): AbortSignal => new AbortController().signal;

const RUN = { documents: 1, chunksUpserted: 3, chunksNoop: 0, chunksPruned: 0, reExtracted: 0, failed: [] } as const;

function build(): { readonly deps: DatabankWorkloadDeps; readonly contributions: ReturnType<typeof createDatabankWorkloadContributions> } {
  // A recording slice of the two ingest ops the contributions call — the routing + the purge guard are what
  // @orb-waive no-test-fabrication(unknown): is under test, not the ingest subsystem's own accounting. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  const deps = {
    databankIngest: { ingestDocument: vi.fn(async () => RUN), reindex: vi.fn(async () => RUN) },
    purgeDocumentVectors: vi.fn(async () => undefined),
  } as unknown as DatabankWorkloadDeps;
  return { deps, contributions: createDatabankWorkloadContributions(deps) };
}

describe("databank-ingest", () => {
  test("ingests the ONE named document and returns the run accounting verbatim", async () => {
    const { deps, contributions } = build();
    const result = await contributions[0].run(ctx, { documentId: DOCUMENT_ID }, vi.fn(), sig());
    expect(deps.databankIngest.ingestDocument).toHaveBeenCalledWith({ documentId: DOCUMENT_ID, signal: expect.any(AbortSignal) });
    expect(result).toEqual(RUN);
  });

  test("rides the INTERACTIVE lane — a user is waiting on it, so a long sweep must not head-block it", () => {
    const { contributions } = build();
    expect(contributions[0].lane).toBe("interactive");
    expect(contributions[0].resume).toBe("idempotent-restart");
  });

  // The ADMISSION unit is the DOCUMENT, not the bank: this is the declaration that lets a user adding seven
  // documents get seven queued rows instead of one row and six CONFLICTs. Two documents ⇒ two keys.
  test("declares the DOCUMENT as its admission key (a bank ingests concurrently; one document does not)", () => {
    const { contributions } = build();
    const other = castId<DocumentId>("document_b");
    expect(contributions[0].admissionKey?.({ documentId: DOCUMENT_ID })).toBe(DOCUMENT_ID);
    expect(contributions[0].admissionKey?.({ documentId: other })).toBe(other);
  });
});

describe("databank-reindex", () => {
  test("floors the mode to chunk-embed when the row picked none, and threads the enumeration scope", async () => {
    const { deps, contributions } = build();
    await contributions[1].run(ctx, { scope: { kind: "owner" } }, vi.fn(), sig());
    expect(deps.databankIngest.reindex).toHaveBeenCalledWith({
      ownerId: OWNER_ID,
      scope: { kind: "owner" },
      mode: "chunk-embed",
      signal: expect.any(AbortSignal),
    });
  });

  test("an explicit mode wins over the floor", async () => {
    const { deps, contributions } = build();
    await contributions[1].run(ctx, { scope: { kind: "owner" }, mode: "re-extract" }, vi.fn(), sig());
    expect(vi.mocked(deps.databankIngest.reindex).mock.calls[0]?.[0]?.mode).toBe("re-extract");
  });

  test("a BULK (all-owners) sweep reclaims the old document embed space afterwards", async () => {
    const { deps, contributions } = build();
    await contributions[1].run(bulkCtx, { scope: { kind: "owner" } }, vi.fn(), sig());
    expect(deps.purgeDocumentVectors).toHaveBeenCalledTimes(1);
  });

  test("a SINGULAR per-owner run does NOT purge (a model change is box-level)", async () => {
    const { deps, contributions } = build();
    await contributions[1].run(ctx, { scope: { kind: "owner" } }, vi.fn(), sig());
    expect(deps.purgeDocumentVectors).not.toHaveBeenCalled();
  });

  test("an aborted BULK run does NOT purge (the space stays a strict superset)", async () => {
    const { deps, contributions } = build();
    const controller = new AbortController();
    controller.abort();
    await contributions[1].run(bulkCtx, { scope: { kind: "owner" } }, vi.fn(), controller.signal);
    expect(deps.purgeDocumentVectors).not.toHaveBeenCalled();
  });

  test("rides the sweep lane (bulk derived-layer maintenance, not a user's wait)", () => {
    const { contributions } = build();
    expect(contributions[1].lane).toBe("sweep");
  });

  // Same unit rule one level up: a per-document repair is its own slot (healing two wedged documents does
  // not serialize), the owner-wide sweep is one slot, and the MODE is deliberately outside the key so a
  // chunk-embed pass and a re-extract pass over one document cannot race.
  test("keys admission on the SCOPE — per document, or the single owner-wide sweep — never on the mode", () => {
    const { contributions } = build();
    const key = contributions[1].admissionKey;
    expect(key?.({ scope: { kind: "document", documentId: DOCUMENT_ID } })).toBe(DOCUMENT_ID);
    expect(key?.({ scope: { kind: "document", documentId: castId<DocumentId>("document_b") } })).toBe("document_b");
    expect(key?.({ scope: { kind: "owner" } })).toBe("owner");
    expect(key?.({ scope: { kind: "owner" }, mode: "re-extract" })).toBe(key?.({ scope: { kind: "owner" } }));
  });
});
