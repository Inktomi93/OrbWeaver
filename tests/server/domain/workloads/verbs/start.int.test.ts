// Verb test: start — enqueue, the re-parse defense, the single-active conflict, and the MODE model (the
// security core): a SINGULAR run is any authed caller (owned by self); a BULK run is BOX-OWNER-only; an
// unsupported mode / a missing bulk-create target / a bad target are typed errors.

import {
  DomainConflictError,
  DomainForbiddenError,
  DomainNotFoundError,
  DomainOperationError,
} from "@orb/kit/errors";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeService, principal, seedUser } from "../_support.ts";

describe("workloads.start — enqueue + conflict", () => {
  test("enqueues a queued row (singular, system caller)", async () => {
    const s = makeService(await freshDb());
    const { id } = await s.start({
      input: { kind: "index", params: { source: "text" } },
      caller: null,
      mode: "singular",
      ownerId: null,
    });
    const row = await s.get({ id, caller: null });
    expect(row.status).toBe("queued");
    expect(row.kind).toBe("index");
    expect(row.mode).toBe("singular");
  });

  test("a second active BULK row of the same kind is a DomainConflictError (global lock)", async () => {
    const s = makeService(await freshDb());
    await s.start({
      input: { kind: "reconcile-stats", params: {} },
      caller: null,
      mode: "bulk",
      ownerId: null,
    });
    await expect(
      s.start({
        input: { kind: "reconcile-stats", params: {} },
        caller: null,
        mode: "bulk",
        ownerId: null,
      }),
    ).rejects.toBeInstanceOf(DomainConflictError);
  });

  test("re-parses params (defense in depth) — an invalid param is rejected", async () => {
    const s = makeService(await freshDb());
    await expect(
      s.start({
        input: { kind: "compute-themes", params: { k: -1 } },
        caller: null,
        mode: "singular",
        ownerId: null,
      }),
    ).rejects.toThrow();
  });
});

describe("workloads.start — MODE authz", () => {
  test("a normal user starting a SINGULAR run succeeds and is owned by the caller", async () => {
    const db = await freshDb();
    const alice = await seedUser(db, "user_alice");
    const s = makeService(db);
    const { id } = await s.start({
      input: { kind: "index", params: { source: "text" } },
      caller: principal("user_alice"),
      mode: "singular",
      ownerId: alice,
    });
    const row = await s.get({ id, caller: principal("user_alice") });
    expect(row.ownerId).toBe(alice);
    expect(row.mode).toBe("singular");
  });

  test("a SINGULAR run CANNOT stamp a foreign owner (owner is forced to self)", async () => {
    const db = await freshDb();
    const alice = await seedUser(db, "user_alice");
    await seedUser(db, "user_bob");
    const s = makeService(db);
    const { id } = await s.start({
      input: { kind: "index", params: { source: "text" } },
      caller: principal("user_alice"),
      mode: "singular",
      ownerId: principal("user_bob").userId, // hand-forged foreign owner — ignored
    });
    expect((await s.get({ id, caller: principal("user_alice") })).ownerId).toBe(alice);
  });

  test("a normal user starting a BULK run is REFUSED (DomainForbiddenError — owner-only)", async () => {
    const db = await freshDb();
    await seedUser(db, "user_alice");
    const s = makeService(db);
    await expect(
      s.start({
        input: { kind: "index", params: { source: "text" } },
        caller: principal("user_alice"),
        mode: "bulk",
        ownerId: null,
      }),
    ).rejects.toBeInstanceOf(DomainForbiddenError);
  });

  test("the BOX OWNER can start a BULK sweep (all owners → ownerId null)", async () => {
    const db = await freshDb();
    await seedUser(db, "user_owner_box", "owner");
    const s = makeService(db);
    const { id } = await s.start({
      input: { kind: "index", params: { source: "text" } },
      caller: principal("user_owner_box", "owner"),
      mode: "bulk",
      ownerId: null,
    });
    const row = await s.get({ id, caller: principal("user_owner_box", "owner") });
    expect(row.mode).toBe("bulk");
    expect(row.ownerId).toBeNull(); // a sweep-kind bulk enumerates ALL owners — no single owner
  });

  test("a BULK-ONLY kind (refresh-model-catalog) started singular → unsupported_mode", async () => {
    const db = await freshDb();
    await seedUser(db, "user_alice");
    const s = makeService(db);
    await expect(
      s.start({
        input: { kind: "refresh-model-catalog", params: {} },
        caller: principal("user_alice"),
        mode: "singular",
        ownerId: principal("user_alice").userId,
      }),
    ).rejects.toBeInstanceOf(DomainOperationError);
  });
});

describe("workloads.start — bulk CREATE-kind target (import-st)", () => {
  test("a bulk import WITHOUT a targetOwnerId is refused (bulk_target_required)", async () => {
    const db = await freshDb();
    await seedUser(db, "user_owner_box", "owner");
    const s = makeService(db);
    await expect(
      s.start({
        input: { kind: "import-st", params: {} },
        caller: principal("user_owner_box", "owner"),
        mode: "bulk",
        ownerId: null,
      }),
    ).rejects.toBeInstanceOf(DomainOperationError);
  });

  test("a bulk import INTO a real target user succeeds and is owned by the target", async () => {
    const db = await freshDb();
    await seedUser(db, "user_owner_box", "owner");
    const target = await seedUser(db, "user_target");
    const s = makeService(db);
    const { id } = await s.start({
      input: { kind: "import-st", params: {} },
      caller: principal("user_owner_box", "owner"),
      mode: "bulk",
      targetOwnerId: target,
      ownerId: null,
    });
    expect((await s.get({ id, caller: principal("user_owner_box", "owner") })).ownerId).toBe(
      target,
    );
  });

  test("a bulk import into a NON-existent target → leak-free NOT_FOUND (the owner FK)", async () => {
    const db = await freshDb();
    await seedUser(db, "user_owner_box", "owner");
    const s = makeService(db);
    await expect(
      s.start({
        input: { kind: "import-st", params: {} },
        caller: principal("user_owner_box", "owner"),
        mode: "bulk",
        targetOwnerId: principal("user_ghost").userId,
        ownerId: null,
      }),
    ).rejects.toBeInstanceOf(DomainNotFoundError);
  });
});

describe("workloads.start — the per-(kind, owner, source) singular lock", () => {
  test("the same user can't start a 2nd of one SINGULAR (kind, source), but two users each can", async () => {
    const db = await freshDb();
    await seedUser(db, "user_alice");
    await seedUser(db, "user_bob");
    const s = makeService(db);
    await s.start({
      input: { kind: "index", params: { source: "text" } },
      caller: principal("user_alice"),
      mode: "singular",
      ownerId: principal("user_alice").userId,
    });
    // Alice's 2nd index{text} collides on her per-(kind, owner, source) singular slot.
    await expect(
      s.start({
        input: { kind: "index", params: { source: "text" } },
        caller: principal("user_alice"),
        mode: "singular",
        ownerId: principal("user_alice").userId,
      }),
    ).rejects.toBeInstanceOf(DomainConflictError);
    // Bob's concurrent index{text} is ALLOWED — a different owner, a different slot.
    const bob = await s.start({
      input: { kind: "index", params: { source: "text" } },
      caller: principal("user_bob"),
      mode: "singular",
      ownerId: principal("user_bob").userId,
    });
    expect(bob.id).toBeTruthy();
  });

  // THE CRUX (flexible collapse, verb level): one user runs index{text} + index{image} CONCURRENTLY — a
  // different source is a different lock slot, so the second start does NOT conflict.
  test("one user runs index{text} + index{image} concurrently (different source, no conflict)", async () => {
    const db = await freshDb();
    await seedUser(db, "user_alice");
    const s = makeService(db);
    const textRun = await s.start({
      input: { kind: "index", params: { source: "text" } },
      caller: principal("user_alice"),
      mode: "singular",
      ownerId: principal("user_alice").userId,
    });
    const imageRun = await s.start({
      input: { kind: "index", params: { source: "image" } },
      caller: principal("user_alice"),
      mode: "singular",
      ownerId: principal("user_alice").userId,
    });
    expect(textRun.id).toBeTruthy();
    expect(imageRun.id).toBeTruthy();
    // Both are live, un-conflicted, under their OWN slots.
    const rows = await s.list({ caller: principal("user_alice") });
    expect(rows.map((r) => r.status)).toEqual(["queued", "queued"]);
  });
});
