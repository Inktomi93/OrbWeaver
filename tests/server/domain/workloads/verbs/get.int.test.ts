// Verb test: get — one typed row by id; a missing/poison row is a DomainNotFoundError.

import { DomainNotFoundError } from "@orb/kit/errors";
import type { WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeService, principal, seedUser, seedWorkloadRow } from "../_support.ts";

describe("workloads.get", () => {
  test("returns the typed row", async () => {
    const db = await freshDb();
    const id = await seedWorkloadRow(db, { kind: "compute-themes", params: { k: 3 } });
    const row = await makeService(db).get({ id, caller: null });
    expect(row.kind).toBe("compute-themes");
    expect(row.params).toEqual({ k: 3 });
  });

  test("a missing row is a DomainNotFoundError", async () => {
    const s = makeService(await freshDb());
    await expect(s.get({ id: castId<WorkloadId>("workload_absent"), caller: null })).rejects.toBeInstanceOf(DomainNotFoundError);
  });

  // ── F3 authz ──
  test("a stranger reading another user's workload gets leak-free NOT_FOUND (the owner still reads it)", async () => {
    const db = await freshDb();
    const alice = await seedUser(db, "user_alice");
    await seedUser(db, "user_bob");
    const id = await seedWorkloadRow(db, {
      id: "w_alice",
      kind: "reconcile-stats",
      ownerId: alice,
    });
    const s = makeService(db);
    await expect(s.get({ id, caller: principal("user_bob") })).rejects.toBeInstanceOf(DomainNotFoundError);
    // The gate has teeth, not a blanket deny — the owner reads its own row.
    expect((await s.get({ id, caller: principal("user_alice") })).ownerId).toBe(alice);
  });

  test("an admin reads ANY owner's workload (the deployment-wide view)", async () => {
    const db = await freshDb();
    const alice = await seedUser(db, "user_alice");
    const id = await seedWorkloadRow(db, {
      id: "w_alice",
      kind: "reconcile-stats",
      ownerId: alice,
    });
    const s = makeService(db);
    expect((await s.get({ id, caller: principal("user_admin", "admin") })).ownerId).toBe(alice);
  });
});
