// verb: updateTag — partial patch, `null` clears color to theme default, rename conflict, missing → 404.

import { DomainConflictError } from "@orb/kit/errors";
import type { TagId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createTagService, TagNotFoundError } from "@orb/server/domain/tag";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeTagHarness, principal, seedTag, seedUser } from "../_support.ts";

describe("updateTag", () => {
  test("patches set fields and leaves omitted ones untouched", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    const tagId = await seedTag(db, owner, { id: "tag_a", name: "alpha" });

    const updated = await svc.updateTag({
      principal: principal(owner),
      tagId,
      patch: { color: "#abc", folderType: "CLOSED" },
    });
    expect(updated).toMatchObject({ name: "alpha", color: "#abc", folderType: "CLOSED" });
  });

  test("color: null clears to the theme default", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    const tagId = await seedTag(db, owner, { id: "tag_a", name: "alpha" });
    await svc.updateTag({ principal: principal(owner), tagId, patch: { color: "#abc" } });

    const cleared = await svc.updateTag({
      principal: principal(owner),
      tagId,
      patch: { color: null },
    });
    expect(cleared.color).toBeNull();
  });

  test("renaming onto an existing name is a conflict", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    await seedTag(db, owner, { id: "tag_a", name: "alpha" });
    const beta = await seedTag(db, owner, { id: "tag_b", name: "beta" });

    await expect(
      svc.updateTag({ principal: principal(owner), tagId: beta, patch: { name: "alpha" } }),
    ).rejects.toThrow(DomainConflictError);
  });

  test("updating a missing tag is not-found", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    await expect(
      svc.updateTag({
        principal: principal(owner),
        tagId: castId<TagId>("tag_ghost"),
        patch: { name: "x" },
      }),
    ).rejects.toThrow(TagNotFoundError);
  });
});
