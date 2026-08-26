// verb: setTagOrder — persists manual order (position → sortOrder); empty input is a no-op.

import { DomainOperationError } from "@orb/kit/errors";
import type { TagId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createTagService, TagNotFoundError } from "@orb/server/domain/tag";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeTagHarness, principal, seedTag, seedUser } from "../_support.ts";

describe("setTagOrder", () => {
  test("stamps sortOrder by position and reorders the list", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    const a = await seedTag(db, owner, { id: "tag_a", name: "alpha" });
    const b = await seedTag(db, owner, { id: "tag_b", name: "beta" });

    await svc.setTagOrder({ principal: principal(owner), orderedIds: [b, a] });
    const ordered = (await svc.listTags({ principal: principal(owner) })).map((t) => t.id);
    expect(ordered).toEqual([b, a]);
  });

  test("an empty order is a no-op (does not throw)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    await expect(svc.setTagOrder({ principal: principal(owner), orderedIds: [] })).resolves.toBeUndefined();
  });

  test("rejects duplicate and partial permutations of owned ids before changing any order", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    const a = await seedTag(db, owner, { id: "tag_a", name: "alpha" });
    const b = await seedTag(db, owner, { id: "tag_b", name: "beta" });

    for (const orderedIds of [[a, a], [a]]) {
      const rejected = svc.setTagOrder({ principal: principal(owner), orderedIds });
      await expect(rejected).rejects.toBeInstanceOf(DomainOperationError);
      await expect(rejected).rejects.toMatchObject({ code: "tag_order_not_permutation" });
    }
    expect((await svc.listTags({ principal: principal(owner) })).map((tag) => tag.id)).toEqual([a, b]);
  });

  test("collapses foreign and missing ids to not-found without changing any order", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const stranger = await seedUser(db, "user_stranger");
    const svc = createTagService(makeTagHarness(db).ctx);
    const a = await seedTag(db, owner, { id: "tag_a", name: "alpha" });
    const b = await seedTag(db, owner, { id: "tag_b", name: "beta" });
    const foreign = await seedTag(db, stranger, { id: "tag_foreign", name: "foreign" });

    for (const unowned of [foreign, castId<TagId>("tag_missing")]) {
      await expect(svc.setTagOrder({ principal: principal(owner), orderedIds: [a, unowned] })).rejects.toBeInstanceOf(TagNotFoundError);
    }
    expect((await svc.listTags({ principal: principal(owner) })).map((tag) => tag.id)).toEqual([a, b]);
  });
});
