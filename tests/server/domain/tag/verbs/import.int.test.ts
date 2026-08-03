// verb: tag-library import — restores a tag-library file into the owner's OWN namespace. Load-bearing:
// idempotent MERGE (dedup by folded name — an existing tag is left, a new one minted; a re-import creates
// zero), the round-trip twin of export, and a malformed file throws.

import { DomainOperationError } from "@orb/kit/errors";
import { createTagLibraryImport, createTagService } from "@orb/server/domain/tag";
import { buildTagLibrary } from "@orb/server/kit/serde/tag";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeTagHarness, principal, seedUser } from "../_support.ts";

function libBytes(names: readonly string[]): Uint8Array {
  return buildTagLibrary({
    tags: names.map((name) => ({
      name,
      color: null,
      color2: null,
      source: null,
      folderType: "NONE" as const,
      sortOrder: null,
      isHiddenOnCard: false,
    })),
  });
}

describe("tag-library import", () => {
  test("mints the owner's tags and is idempotent on re-import", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const harness = makeTagHarness(db);
    const importTags = createTagLibraryImport(harness.ctx);
    const svc = createTagService(harness.ctx);

    const bytes = libBytes(["fantasy", "sci-fi", "noir"]);

    const first = await importTags(owner, bytes);
    expect(first).toEqual({ total: 3, created: 3 });

    const names = (await svc.listTags({ principal: principal(owner) })).map((t) => t.name).sort();
    expect(names).toEqual(["fantasy", "noir", "sci-fi"]);

    // Re-import the same file: dedup by (ownerId, name) → zero new rows.
    const second = await importTags(owner, bytes);
    expect(second).toEqual({ total: 3, created: 0 });
    expect(await svc.listTags({ principal: principal(owner) })).toHaveLength(3);
  });

  test("merges into an existing namespace (dedup, case-insensitive) — only new names land", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const harness = makeTagHarness(db);
    const svc = createTagService(harness.ctx);
    await svc.createTag({ principal: principal(owner), input: { name: "Fantasy" } });

    // "fantasy" folds onto the existing "Fantasy"; only "western" is new.
    const result = await createTagLibraryImport(harness.ctx)(owner, libBytes(["fantasy", "western"]));
    expect(result).toEqual({ total: 2, created: 1 });
    expect((await svc.listTags({ principal: principal(owner) })).map((t) => t.name).sort()).toEqual(["Fantasy", "western"]);
  });

  test("round-trips export -> import across owners", async () => {
    const db = await freshDb();
    const source = await seedUser(db, "user_source");
    const dest = await seedUser(db, "user_dest");
    const harness = makeTagHarness(db);
    const svc = createTagService(harness.ctx);
    await svc.createTag({
      principal: principal(source),
      input: { name: "aria", color: "#ff0000" },
    });

    const bytes = buildTagLibrary({
      tags: (await svc.listTags({ principal: principal(source) })).map((t) => ({
        name: t.name,
        color: t.color,
        color2: t.color2,
        source: t.source,
        folderType: t.folderType,
        sortOrder: t.sortOrder,
        isHiddenOnCard: t.isHiddenOnCard,
      })),
    });

    await createTagLibraryImport(harness.ctx)(dest, bytes);
    const destTags = await svc.listTags({ principal: principal(dest) });
    expect(destTags).toHaveLength(1);
    expect(destTags[0]).toMatchObject({ name: "aria", color: "#ff0000" });
  });

  test("a non-tag-library file throws DomainOperationError", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const harness = makeTagHarness(db);

    const garbage = new TextEncoder().encode("{not a tag library");
    await expect(createTagLibraryImport(harness.ctx)(owner, garbage)).rejects.toBeInstanceOf(DomainOperationError);
  });
});
