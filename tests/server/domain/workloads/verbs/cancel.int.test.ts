// Verb test: cancel — the queued→cancelled / running→cancelling transitions returned to the caller.

import type { WorkloadStatus } from "@orb/contracts/workloads";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { WorkloadId } from "@orb/kit/ids";
import { workloadStreamEmitter } from "@orb/server/domain/workloads";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeService, principal, seedUser, seedWorkloadRow } from "../_support.ts";

describe("workloads.cancel", () => {
  test("a queued row cancels outright", async () => {
    const db = await freshDb();
    const id = await seedWorkloadRow(db, { status: "queued" });
    expect(await makeService(db).cancel({ id, caller: null })).toEqual({ status: "cancelled" });
  });

  test("a queued terminal cancellation emits exactly once after the row is durable", async () => {
    const db = await freshDb();
    const id = await seedWorkloadRow(db, { status: "queued" });
    const service = makeService(db);
    const observedStatuses: Promise<WorkloadStatus>[] = [];
    const listener = (event: { workloadId: WorkloadId }): void => {
      if (event.workloadId === id) {
        observedStatuses.push(service.get({ id, caller: null }).then((row) => row.status));
      }
    };
    workloadStreamEmitter.on("workload", listener);
    try {
      await service.cancel({ id, caller: null });
      await service.cancel({ id, caller: null });
    } finally {
      workloadStreamEmitter.off("workload", listener);
    }

    expect(observedStatuses).toHaveLength(1);
    await expect(observedStatuses[0]).resolves.toBe("cancelled");
  });

  test("a running row enters cancelling", async () => {
    const db = await freshDb();
    const id = await seedWorkloadRow(db, { status: "running" });
    expect(await makeService(db).cancel({ id, caller: null })).toEqual({ status: "cancelling" });
  });

  test("a terminal row is a no-op (null)", async () => {
    const db = await freshDb();
    const id = await seedWorkloadRow(db, { status: "succeeded" });
    expect(await makeService(db).cancel({ id, caller: null })).toEqual({ status: null });
  });

  // ── F3 authz ──
  test("a stranger cancelling another user's RUNNING workload → NOT_FOUND, no state change", async () => {
    const db = await freshDb();
    const alice = await seedUser(db, "user_alice");
    await seedUser(db, "user_bob");
    const id = await seedWorkloadRow(db, {
      id: "w_alice",
      kind: "reconcile-stats",
      ownerId: alice,
      status: "running",
    });
    const s = makeService(db);
    await expect(s.cancel({ id, caller: principal("user_bob") })).rejects.toBeInstanceOf(DomainNotFoundError);
    // The row is untouched — still running (the stranger's cancel mutated NOTHING).
    expect((await s.get({ id, caller: principal("user_alice") })).status).toBe("running");
  });
});
