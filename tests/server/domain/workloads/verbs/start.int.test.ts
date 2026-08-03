// Verb test: start — enqueue, the re-parse defense, the single-active conflict, and the MODE model (the
// security core): a SINGULAR run is any authed caller (owned by self); a BULK run is BOX-OWNER-only; an
// unsupported mode / a missing bulk-create target / a bad target are typed errors.

import { DomainConflictError, DomainForbiddenError, DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
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

  // The lane is EXECUTION policy owned by the CONTRIBUTION, stamped at the enqueue door (never client
  // input, never derived at claim time — so a restart keeps every queued row in the lane it was filed under).
  test("stamps the row's lane from the OWNING domain's contribution", async () => {
    const db = await freshDb();
    const s = makeService(db);
    const ingest = await s.start({
      input: { kind: "databank-ingest", params: { documentId: mintTypeId(ID_PREFIX.document) } },
      caller: null,
      mode: "singular",
      ownerId: null,
    });
    // databank-ingest is the interactive archetype (a user is waiting on their upload).
    expect((await s.get({ id: ingest.id, caller: null })).lane).toBe("interactive");

    const sweep = await s.start({
      input: { kind: "reconcile-stats", params: {} },
      caller: null,
      mode: "bulk",
      ownerId: null,
    });
    expect((await s.get({ id: sweep.id, caller: null })).lane).toBe("sweep");
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
    expect((await s.get({ id, caller: principal("user_owner_box", "owner") })).ownerId).toBe(target);
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

// DBK-B(a): the databank kinds were `singular:false, stub:true` at HEAD, so `start()`'s mode gate REJECTED
// every databank enqueue (compose enqueues `databank-ingest`/`databank-reindex` in mode:"singular" off the
// upload/reindex verbs). The int suites faked the enqueue op, so the rejection was invisible. This drives the
// REAL `start()` mode gate — a green queued row proves the policy flip landed.
describe("workloads.start — databank singular enqueue (DBK-B(a))", () => {
  test("a singular databank-ingest enqueue is ACCEPTED and lands a queued row", async () => {
    const db = await freshDb();
    const alice = await seedUser(db, "user_alice");
    const s = makeService(db);
    const { id } = await s.start({
      input: { kind: "databank-ingest", params: { documentId: mintTypeId(ID_PREFIX.document) } },
      caller: principal("user_alice"),
      mode: "singular",
      ownerId: alice,
    });
    const row = await s.get({ id, caller: principal("user_alice") });
    expect(row.status).toBe("queued");
    expect(row.kind).toBe("databank-ingest");
    expect(row.mode).toBe("singular");
    expect(row.ownerId).toBe(alice);
  });

  test("a singular databank-reindex enqueue is ACCEPTED and lands a queued row", async () => {
    const db = await freshDb();
    const alice = await seedUser(db, "user_alice");
    const s = makeService(db);
    const { id } = await s.start({
      input: { kind: "databank-reindex", params: { scope: { kind: "owner" } } },
      caller: principal("user_alice"),
      mode: "singular",
      ownerId: alice,
    });
    const row = await s.get({ id, caller: principal("user_alice") });
    expect(row.status).toBe("queued");
    expect(row.kind).toBe("databank-reindex");
    expect(row.mode).toBe("singular");
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

  // THE HEAD-BLOCKING DEFECT (DBFIX): a user seeding a bank adds document after document, and each document
  // is its OWN unit of work. Before the ADMISSION KEY existed the singular lock keyed on (kind, owner,
  // source) with every databank row carrying the shared `none` bucket, so the SECOND document was refused
  // server-side with a CONFLICT while the first ingested — and the already-inserted `documents` row was left
  // with no workload at all (parked at `Queued` forever). Two DIFFERENT documents hold two DIFFERENT slots.
  test("one user ingests two DIFFERENT documents concurrently (the document is the admission unit)", async () => {
    const db = await freshDb();
    await seedUser(db, "user_alice");
    const s = makeService(db);
    const first = await s.start({
      input: { kind: "databank-ingest", params: { documentId: mintTypeId(ID_PREFIX.document) } },
      caller: principal("user_alice"),
      mode: "singular",
      ownerId: principal("user_alice").userId,
    });
    const second = await s.start({
      input: { kind: "databank-ingest", params: { documentId: mintTypeId(ID_PREFIX.document) } },
      caller: principal("user_alice"),
      mode: "singular",
      ownerId: principal("user_alice").userId,
    });
    expect(first.id).not.toBe(second.id);
    const rows = await s.list({ caller: principal("user_alice") });
    expect(rows.map((r) => r.status)).toEqual(["queued", "queued"]);
  });

  // The other half of the same key: the SAME document twice is STILL single-active — a double-enqueue of one
  // document is exactly the collision the lock exists to refuse (that work is genuinely already in flight).
  test("the SAME document twice is still refused (per-document single-active)", async () => {
    const db = await freshDb();
    await seedUser(db, "user_alice");
    const s = makeService(db);
    const documentId = mintTypeId(ID_PREFIX.document);
    await s.start({
      input: { kind: "databank-ingest", params: { documentId } },
      caller: principal("user_alice"),
      mode: "singular",
      ownerId: principal("user_alice").userId,
    });
    await expect(
      s.start({
        input: { kind: "databank-ingest", params: { documentId } },
        caller: principal("user_alice"),
        mode: "singular",
        ownerId: principal("user_alice").userId,
      }),
    ).rejects.toBeInstanceOf(DomainConflictError);
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
