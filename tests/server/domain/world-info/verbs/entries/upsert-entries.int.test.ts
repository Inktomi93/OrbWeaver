// verb: upsertEntries — the SHARED hand-edit-safe machine-writer bulk upsert (D59).
// Load-bearing: insert-by-title, replace-same-title (idempotent re-run), and the HAND-EDIT GUARD — an entry a
// human curated (its content no longer hashes to the stored `metadata.provenance.contentHash`) is SKIPPED, never
// overwritten. A foreign book is NotFound.

import type { UpsertEntriesResult } from "@orb/contracts/world-info";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createWorldInfoService, WorldInfoNotFoundError } from "@orb/server/domain/world-info";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { makeHarness, principal, seedUser } from "../../_support.ts";

const SPAN = { fromSeq: 10, toSeq: 40 };

describe("upsertEntries", () => {
  test("inserts new keyed entries, stamping provenance (contentHash + span)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createWorldInfoService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "Keeper" } });

    const result = await svc.upsertEntries({
      principal: principal(owner),
      bookId: book.id,
      entries: [{ title: "Greenhouse promise", keys: ["greenhouse", "promise"], content: "She swore to return by spring.", span: SPAN }],
    });

    expect(result).toEqual({ inserted: 1, updated: 0, skippedHandEdited: 0 });
    const [entry] = await svc.listEntries({ principal: principal(owner), bookId: book.id });
    expect(entry?.keys).toEqual(["greenhouse", "promise"]);
    expect(entry?.metadata?.provenance?.span).toEqual(SPAN);
    expect(entry?.metadata?.provenance?.contentHash).toEqual(expect.any(String));
  });

  test("a re-run over the same title UPDATES in place (idempotent replace-same-span)", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "Keeper" } });
    const write = (content: string): Promise<UpsertEntriesResult> =>
      svc.upsertEntries({ principal: principal(owner), bookId: book.id, entries: [{ title: "Fact", keys: ["k"], content, span: SPAN }] });

    await write("v1");
    const second = await write("v2");

    expect(second).toEqual({ inserted: 0, updated: 1, skippedHandEdited: 0 });
    const entries = await svc.listEntries({ principal: principal(owner), bookId: book.id });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.content).toBe("v2");
  });

  test("a host-edited entry is SKIPPED — the machine writer never overwrites a curated entry", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "Keeper" } });
    await svc.upsertEntries({ principal: principal(owner), bookId: book.id, entries: [{ title: "Fact", keys: ["k"], content: "machine text", span: SPAN }] });

    // The host curates it by hand (its content now diverges from the stored provenance.contentHash).
    const [entry] = await svc.listEntries({ principal: principal(owner), bookId: book.id });
    if (entry === undefined) {
      throw new Error("entry missing");
    }
    await svc.updateEntry({ principal: principal(owner), entryId: entry.id, input: { content: "the HOST's careful wording" } });

    const result = await svc.upsertEntries({
      principal: principal(owner),
      bookId: book.id,
      entries: [{ title: "Fact", keys: ["k"], content: "machine rewrite", span: SPAN }],
    });

    expect(result).toEqual({ inserted: 0, updated: 0, skippedHandEdited: 1 });
    const after = await svc.listEntries({ principal: principal(owner), bookId: book.id });
    expect(after[0]?.content).toBe("the HOST's careful wording");
  });

  // `title` IS the upsert key within the book (contracts/world-info, the UpsertLoreEntryInput doc), so two
  // inputs carrying the same title in ONE request are two writes to ONE key: the second must land on the row
  // the first just wrote. A prior-snapshot that is never folded forward made both inputs see `prior ===
  // undefined` and INSERT, minting two rows under one key — the state no consumer's re-run can ever repair
  // (the next run's snapshot then has two candidates for the same title).
  test("two same-title inputs in ONE request fold onto the SAME entry (title is the upsert key)", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "Keeper" } });

    const result = await svc.upsertEntries({
      principal: principal(owner),
      bookId: book.id,
      entries: [
        { title: "Fact", keys: ["k"], content: "first", span: SPAN },
        { title: "Fact", keys: ["k2"], content: "second", span: SPAN },
      ],
    });

    expect(result).toEqual({ inserted: 1, updated: 1, skippedHandEdited: 0 });
    const entries = await svc.listEntries({ principal: principal(owner), bookId: book.id });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.content).toBe("second");
    expect(entries[0]?.keys).toEqual(["k2"]);
  });

  // The same fold on the UPDATE arm. A FENCE, not a defect proof — it was green before the fold too (both
  // updates already targeted the one prior row) — and it is what fails if the fold is ever "fixed" by
  // REFUSING a repeated title instead: this arm must keep applying both writes in order.
  test("a same-title pair over an EXISTING entry applies both writes in order (last wins)", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "Keeper" } });
    await svc.upsertEntries({ principal: principal(owner), bookId: book.id, entries: [{ title: "Fact", keys: ["k"], content: "v1", span: SPAN }] });

    const result = await svc.upsertEntries({
      principal: principal(owner),
      bookId: book.id,
      entries: [
        { title: "Fact", keys: ["k"], content: "v2", span: SPAN },
        { title: "Fact", keys: ["k"], content: "v3", span: SPAN },
      ],
    });

    expect(result).toEqual({ inserted: 0, updated: 2, skippedHandEdited: 0 });
    const entries = await svc.listEntries({ principal: principal(owner), bookId: book.id });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.content).toBe("v3");
  });

  // The hand-edit belt survives the fold: a curated row stays curated for EVERY input naming its title.
  // A FENCE (green before the fold as well): it is what fails if the fold ever stamps a SKIPPED row forward
  // as though the writer had rewritten it, which would disarm the guard mid-request.
  test("a hand-edited entry is skipped for BOTH same-title inputs", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "Keeper" } });
    await svc.upsertEntries({ principal: principal(owner), bookId: book.id, entries: [{ title: "Fact", keys: ["k"], content: "machine", span: SPAN }] });
    const [seeded] = await svc.listEntries({ principal: principal(owner), bookId: book.id });
    if (seeded === undefined) {
      throw new Error("entry missing");
    }
    await svc.updateEntry({ principal: principal(owner), entryId: seeded.id, input: { content: "the HOST's wording" } });

    const result = await svc.upsertEntries({
      principal: principal(owner),
      bookId: book.id,
      entries: [
        { title: "Fact", keys: ["k"], content: "rewrite a", span: SPAN },
        { title: "Fact", keys: ["k"], content: "rewrite b", span: SPAN },
      ],
    });

    expect(result).toEqual({ inserted: 0, updated: 0, skippedHandEdited: 2 });
    const after = await svc.listEntries({ principal: principal(owner), bookId: book.id });
    expect(after).toHaveLength(1);
    expect(after[0]?.content).toBe("the HOST's wording");
  });

  test("a foreign book is NotFound — nothing written", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const theirs = await svc.createBook({ principal: principal(other), input: { name: "Theirs" } });

    await expect(
      svc.upsertEntries({ principal: principal(owner), bookId: theirs.id, entries: [{ title: "X", keys: ["x"], content: "c" }] }),
    ).rejects.toBeInstanceOf(WorldInfoNotFoundError);
  });
});
