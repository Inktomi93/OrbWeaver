// verb: setTagOrder — persists manual order (position → sortOrder); empty input is a no-op.

import { DomainOperationError } from "@orb/kit/errors";
import { createTagService } from "@orb/server/domain/tag";
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

  test("rejects duplicate, partial, and foreign ids before changing any order", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const stranger = await seedUser(db, "user_stranger");
    const svc = createTagService(makeTagHarness(db).ctx);
    const a = await seedTag(db, owner, { id: "tag_a", name: "alpha" });
    const b = await seedTag(db, owner, { id: "tag_b", name: "beta" });
    const foreign = await seedTag(db, stranger, { id: "tag_foreign", name: "foreign" });

    for (const orderedIds of [[a, a], [a], [a, foreign]]) {
      await expect(svc.setTagOrder({ principal: principal(owner), orderedIds })).rejects.toBeInstanceOf(DomainOperationError);
    }
    expect((await svc.listTags({ principal: principal(owner) })).map((tag) => tag.id)).toEqual([a, b]);
  });
});
