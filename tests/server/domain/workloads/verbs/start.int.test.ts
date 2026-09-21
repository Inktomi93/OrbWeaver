// Verb test: start — enqueue, the re-parse defense, the single-active conflict, and the MODE model (the
// security core): a SINGULAR run is any authed caller (owned by self); a BULK run is BOX-OWNER-only; an
// unsupported mode / a missing bulk-create target / a bad target are typed errors.

import { DomainConflictError, DomainForbiddenError, DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import type { WorkloadId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { fakeContributions, makeService, principal, seedUser, seedWorkloadRow } from "../_support.ts";

/** The chat domain's own refusal sentence (#156) — asserted through the message a caller actually reads. */
const MEMORY_OFF_RE = /Memory is turned off/;

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

describe("workloads.start — dependency authority", () => {
  test("admits an existing dependency in the new row's resolved owner scope", async () => {
    const db = await freshDb();
    const alice = await seedUser(db, "user_alice");
    const dependencyId = await seedWorkloadRow(db, { id: "workload_alice_dependency", ownerId: alice, status: "running" });
    const s = makeService(db);

    const { id } = await s.start({
      input: { kind: "compute-themes", params: {} },
      caller: principal("user_alice"),
      mode: "singular",
      ownerId: alice,
      dependsOn: [dependencyId],
    });

    expect((await s.get({ id, caller: principal("user_alice") })).dependsOn).toEqual([dependencyId]);
  });

  test("a missing dependency is leak-free NOT_FOUND and no dependent row is persisted", async () => {
    const db = await freshDb();
    const alice = await seedUser(db, "user_alice");
    const missing = castId<WorkloadId>("workload_missing_dependency");
    const s = makeService(db);

    await expect(
      s.start({
        input: { kind: "compute-themes", params: {} },
        caller: principal("user_alice"),
        mode: "singular",
        ownerId: alice,
        dependsOn: [missing],
      }),
    ).rejects.toBeInstanceOf(DomainNotFoundError);
    expect(await s.list({ caller: principal("user_alice") })).toEqual([]);
  });

  test("another user's dependency collapses to the same NOT_FOUND and no dependent row is persisted", async () => {
    const db = await freshDb();
    const alice = await seedUser(db, "user_alice");
    const bob = await seedUser(db, "user_bob");
    const foreign = await seedWorkloadRow(db, { id: "workload_bob_dependency", ownerId: bob, status: "running" });
    const s = makeService(db);

    await expect(
      s.start({
        input: { kind: "compute-themes", params: {} },
        caller: principal("user_alice"),
        mode: "singular",
        ownerId: alice,
        dependsOn: [foreign],
      }),
    ).rejects.toBeInstanceOf(DomainNotFoundError);
    expect((await s.list({ caller: principal("user_admin", "admin") })).map((row) => row.id)).toEqual([foreign]);
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

  // ── `adoptActive`: THE ID OF THE RUN THAT HOLDS THE SLOT ────────────────────────────────────────────────
  // HONEST LABEL: a NEW-API pin, not a red-first defect proof — the flag did not exist before this change.
  // The DEFECT it exists for is proven at its caller (`entry/compose/portability-runner`): a caller that only
  // wants "an active run of this unit" had no way to learn the id of the one already in flight, so it
  // swallowed the conflict and lost the `dependsOn` edge its DAG was built on. The caller states the intent
  // ("start it, or give me the one already running"); the queue answers with an id either way.
  test("adoptActive returns the ACTIVE row's id instead of conflicting — and never mints a second row", async () => {
    const db = await freshDb();
    await seedUser(db, "user_alice");
    const s = makeService(db);
    const first = await s.start({
      input: { kind: "index", params: { source: "text" } },
      caller: principal("user_alice"),
      mode: "singular",
      ownerId: principal("user_alice").userId,
    });

    const adopted = await s.start({
      input: { kind: "index", params: { source: "text" } },
      caller: principal("user_alice"),
      mode: "singular",
      ownerId: principal("user_alice").userId,
      adoptActive: true,
    });

    expect(adopted.id).toBe(first.id);
    expect(await s.list({ caller: principal("user_alice") })).toHaveLength(1);
  });

  test("adoptActive is per-UNIT, not per-kind — a different admission key still mints its own row", async () => {
    const db = await freshDb();
    await seedUser(db, "user_alice");
    const s = makeService(db);
    const text = await s.start({
      input: { kind: "index", params: { source: "text" } },
      caller: principal("user_alice"),
      mode: "singular",
      ownerId: principal("user_alice").userId,
      adoptActive: true,
    });
    const image = await s.start({
      input: { kind: "index", params: { source: "image" } },
      caller: principal("user_alice"),
      mode: "singular",
      ownerId: principal("user_alice").userId,
      adoptActive: true,
    });
    expect(image.id).not.toBe(text.id);
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

// ── The OWNING DOMAIN's admission precondition (#156) ─────────────────────────────────────────────
// Owner-observed: an ST import auto-enqueued `memory-backfill` while memory was DISABLED, the sweep skipped
// every one of that host's chats (the D36 opt-out), and Jobs showed "0 segments · 0 digests" as a SUCCESS.
// The queue spells no domain's vocabulary, so chat declares the precondition and the door enforces it —
// ADMISSION, never execution: a job that structurally cannot produce anything gets no row at all.
describe("workloads.start — the owning domain's admission precondition", () => {
  test("REFUSES a memory-backfill for an owner whose memory is off, with the domain's own sentence", async () => {
    const db = await freshDb();
    const alice = await seedUser(db, "user_alice");
    const s = makeService(db, fakeContributions({ memoryEnabled: false }));
    await expect(
      s.start({ input: { kind: "memory-backfill", params: {} }, caller: principal("user_alice"), mode: "singular", ownerId: alice }),
    ).rejects.toThrow(MEMORY_OFF_RE);
    // The point of gating at ADMISSION: no row exists to read as a vacuous success.
    expect(await s.list({ caller: principal("user_alice") })).toEqual([]);
  });

  test("ADMITS the same run once memory is on", async () => {
    const db = await freshDb();
    const alice = await seedUser(db, "user_alice");
    const s = makeService(db, fakeContributions({ memoryEnabled: true }));
    const { id } = await s.start({ input: { kind: "memory-backfill", params: {} }, caller: principal("user_alice"), mode: "singular", ownerId: alice });
    expect((await s.get({ id, caller: principal("user_alice") })).status).toBe("queued");
  });

  test("a kind that declares NO precondition is unaffected by a refusing sibling", async () => {
    const db = await freshDb();
    const alice = await seedUser(db, "user_alice");
    const s = makeService(db, fakeContributions({ memoryEnabled: false }));
    const { id } = await s.start({
      input: { kind: "index", params: { source: "text" } },
      caller: principal("user_alice"),
      mode: "singular",
      ownerId: alice,
    });
    expect((await s.get({ id, caller: principal("user_alice") })).status).toBe("queued");
  });

  test("the BULK all-owners pass is still admitted with memory off (one host's opt-out is not the box's)", async () => {
    const db = await freshDb();
    await seedUser(db, "user_owner_box", "owner");
    const s = makeService(db, fakeContributions({ memoryEnabled: false }));
    const { id } = await s.start({
      input: { kind: "memory-backfill", params: {} },
      caller: principal("user_owner_box", "owner"),
      mode: "bulk",
      ownerId: null,
    });
    expect((await s.get({ id, caller: principal("user_owner_box", "owner") })).ownerId).toBeNull();
  });
});
