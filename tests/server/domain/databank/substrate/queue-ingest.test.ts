// queueIngest — the one guarded call site of the `enqueueIngest` injected op. Pins the load-bearing claim:
// a rejecting enqueue NEVER throws (the canon write already landed) — it surfaces as a typed
// `ingest: 'not-queued'` field instead, never a swallow.

import type { DocumentId, UserId, WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, vi } from "vitest";
import { queueIngest } from "../../../../../packages/server/src/domain/databank/substrate/queue-ingest.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const documentId = castId<DocumentId>("document_x");
const ownerId = castId<UserId>("user_x");

describe("queueIngest", () => {
  test("a successful enqueue returns queued + the workloadId", async () => {
    const workloadId = castId<WorkloadId>("workload_1");
    const ctx = { enqueueIngest: vi.fn(() => Promise.resolve({ workloadId })) };
    const result = await queueIngest(ctx, { documentId, ownerId });
    expect(result).toEqual({ ingest: "queued", workloadId });
  });

  test("a rejecting enqueue resolves (never throws) to not-queued/null — the canon write is not rolled back", async () => {
    const ctx = { enqueueIngest: vi.fn(() => Promise.reject(new Error("workload queue down"))) };
    const result = await queueIngest(ctx, { documentId, ownerId });
    expect(result).toEqual({ ingest: "not-queued", workloadId: null });
  });
});
