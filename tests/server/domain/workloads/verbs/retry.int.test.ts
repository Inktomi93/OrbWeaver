// Verb test: retry — clones a terminal row's kind+params into a FRESH queued row, never mutating the
// original (the audit trail), and 404s a missing row.

import { DomainNotFoundError } from "@orb/kit/errors";
import type { WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, expect, test } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { makeService, seedWorkloadRow } from "../_support.ts";

describe("workloads.retry", () => {
  test("clones a failed row into a fresh queued row (original untouched)", async () => {
    const db = await freshDb();
    const s = makeService(db);
    const originalId = await seedWorkloadRow(db, {
      id: "workload_orig",
      kind: "compute-themes",
      status: "failed",
      params: { k: 5 },
    });
    const { id } = await s.retry({ id: originalId, ownerId: null });
    expect(id).not.toBe(originalId);
    const clone = await s.get({ id, ownerId: null });
    expect(clone.status).toBe("queued");
    expect(clone.kind).toBe("compute-themes");
    expect(clone.params).toEqual({ k: 5 });
    expect((await s.get({ id: originalId, ownerId: null })).status).toBe("failed");
  });

  test("a missing row is a DomainNotFoundError", async () => {
    const s = makeService(await freshDb());
    await expect(
      s.retry({ id: castId<WorkloadId>("workload_absent"), ownerId: null }),
    ).rejects.toBeInstanceOf(DomainNotFoundError);
  });
});
