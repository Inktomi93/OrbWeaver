// verb: upsertEntries — the SHARED hand-edit-safe machine-writer bulk upsert (chat-crew-design/02 §7, CC-D).
// Load-bearing: insert-by-title, replace-same-title (idempotent re-run), and the HAND-EDIT GUARD — an entry a
// human curated (its content no longer hashes to the stored `metadata.crew.contentHash`) is SKIPPED, never
// overwritten. A foreign book is NotFound.

import type { UpsertEntriesResult } from "@orb/contracts/world-info";
import { createWorldInfoService, WorldInfoNotFoundError } from "@orb/server/domain/world-info";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../../_support.ts";

const SPAN = { fromSeq: 10, toSeq: 40 };

describe("upsertEntries", () => {
  test("inserts new keyed entries, stamping crew provenance (contentHash + span)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createWorldInfoService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "Keeper" } });

    const result = await svc.upsertEntries({
      principal: principal(owner),
      bookId: book.id,
      entries: [{ title: "Greenhouse promise", keys: ["greenhouse", "promise"], content: "She swore to return by spring.", span: SPAN }],
    });

    expect(result).toEqual({ inserted: 1, updated: 0, skippedHandEdited: 0 });
    const [entry] = await svc.listEntries({ principal: principal(owner), bookId: book.id });
    expect(entry?.keys).toEqual(["greenhouse", "promise"]);
    expect(entry?.metadata?.crew?.span).toEqual(SPAN);
    expect(entry?.metadata?.crew?.contentHash).toEqual(expect.any(String));
  });

  test("a re-run over the same title UPDATES in place (idempotent replace-same-span)", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
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
    const owner = await seedUser(db, { handle: "owner" });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "Keeper" } });
    await svc.upsertEntries({ principal: principal(owner), bookId: book.id, entries: [{ title: "Fact", keys: ["k"], content: "machine text", span: SPAN }] });

    // The host curates it by hand (its content now diverges from the stored crew.contentHash).
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

  test("a foreign book is NotFound — nothing written", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const theirs = await svc.createBook({ principal: principal(other), input: { name: "Theirs" } });

    await expect(
      svc.upsertEntries({ principal: principal(owner), bookId: theirs.id, entries: [{ title: "X", keys: ["x"], content: "c" }] }),
    ).rejects.toBeInstanceOf(WorldInfoNotFoundError);
  });
});
