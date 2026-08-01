// Verb test: retry — clones a terminal row's kind+params into a FRESH queued row, never mutating the
// original (the audit trail), and 404s a missing row.

import { DomainNotFoundError } from "@orb/kit/errors";
import type { WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { loadRawWorkloadParams } from "../../../../../packages/server/src/domain/workloads/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeService, principal, seedUser, seedWorkloadRow } from "../_support.ts";

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
    const { id } = await s.retry({ id: originalId, caller: null });
    expect(id).not.toBe(originalId);
    const clone = await s.get({ id, caller: null });
    expect(clone.status).toBe("queued");
    expect(clone.kind).toBe("compute-themes");
    expect(clone.params).toEqual({ k: 5 });
    expect((await s.get({ id: originalId, caller: null })).status).toBe("failed");
  });

  // A POISON original (params that no longer parse) is exactly the row the read-path fix made visible —
  // and retry is the action it exists to offer. The clone carries the RAW blob verbatim, so a build that
  // fixed the schema re-runs the operator's original input instead of a silently emptied one.
  test("a POISON row is retryable and its raw params blob survives the clone", async () => {
    const db = await freshDb();
    const s = makeService(db);
    const originalId = await seedWorkloadRow(db, {
      id: "workload_poison",
      kind: "compute-themes",
      status: "failed",
      params: { k: -5 },
    });
    const original = await s.get({ id: originalId, caller: null });
    expect(original.poison).toBe(true);
    expect(original.params).toBeNull();

    const { id } = await s.retry({ id: originalId, caller: null });
    const clone = await s.get({ id, caller: null });
    expect(clone.status).toBe("queued");
    expect(clone.poison).toBe(true);
    // The raw blob is on the row (it is still poison against the current schema — nothing was invented).
    expect(await loadRawWorkloadParams(db, id)).toEqual({ k: -5 });
  });

  test("re-stamps the clone's lane from the kind's CURRENT contribution", async () => {
    const db = await freshDb();
    const s = makeService(db);
    // Seeded in the WRONG lane (a row filed before its domain changed its declaration).
    const originalId = await seedWorkloadRow(db, {
      id: "workload_stale_lane",
      kind: "reconcile-stats",
      status: "failed",
      lane: "interactive",
    });
    const { id } = await s.retry({ id: originalId, caller: null });
    expect((await s.get({ id, caller: null })).lane).toBe("sweep");
  });

  test("a missing row is a DomainNotFoundError", async () => {
    const s = makeService(await freshDb());
    await expect(s.retry({ id: castId<WorkloadId>("workload_absent"), caller: null })).rejects.toBeInstanceOf(DomainNotFoundError);
  });

  // ── F3 authz ──
  test("a stranger retrying another user's workload → NOT_FOUND, no clone created", async () => {
    const db = await freshDb();
    const alice = await seedUser(db, "user_alice");
    await seedUser(db, "user_bob");
    const id = await seedWorkloadRow(db, {
      id: "w_alice",
      kind: "reconcile-stats",
      ownerId: alice,
      status: "failed",
    });
    const s = makeService(db);
    await expect(s.retry({ id, caller: principal("user_bob") })).rejects.toBeInstanceOf(DomainNotFoundError);
    // No clone leaked into anyone's world — only the original row exists (admin sees all).
    expect((await s.list({ caller: principal("user_admin", "admin") })).map((r) => r.id)).toEqual([id]);
  });

  test("the owner retries its OWN failed workload; the clone stays owned by that owner", async () => {
    const db = await freshDb();
    const alice = await seedUser(db, "user_alice");
    const id = await seedWorkloadRow(db, {
      id: "w_alice",
      kind: "reconcile-stats",
      ownerId: alice,
      status: "failed",
    });
    const s = makeService(db);
    const { id: cloneId } = await s.retry({ id, caller: principal("user_alice") });
    expect((await s.get({ id: cloneId, caller: principal("user_alice") })).ownerId).toBe(alice);
  });
});
