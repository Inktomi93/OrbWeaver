// verb: createTag — mints an owner-scoped tag (defaults applied) and TOCTOU-rejects a duplicate name.

import { DomainConflictError, DomainOperationError } from "@orb/kit/errors";
import { createTagService } from "@orb/server/domain/tag";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeTagHarness, principal, seedUser } from "../_support.ts";

describe("createTag", () => {
  test("mints a tag with view defaults", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);

    const view = await svc.createTag({ principal: principal(owner), input: { name: "fantasy" } });
    expect(view).toMatchObject({
      name: "fantasy",
      color: null,
      source: null,
      folderType: "NONE",
      isHiddenOnCard: false,
    });
    expect(view.id.startsWith("tag_")).toBe(true);
  });

  test("a duplicate name for the same owner is a conflict", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    await svc.createTag({ principal: principal(owner), input: { name: "dupe" } });

    await expect(
      svc.createTag({ principal: principal(owner), input: { name: "dupe" } }),
    ).rejects.toThrow(DomainConflictError);
  });

  test("the same name under two owners is allowed (namespace is per-owner)", async () => {
    const db = await freshDb();
    const a = await seedUser(db, "user_a");
    const b = await seedUser(db, "user_b");
    const svc = createTagService(makeTagHarness(db).ctx);

    await svc.createTag({ principal: principal(a), input: { name: "shared" } });
    await expect(
      svc.createTag({ principal: principal(b), input: { name: "shared" } }),
    ).resolves.toMatchObject({ name: "shared" });
  });

  test("normalizes the name before insert (trim + whitespace-collapse, casing kept)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);

    const view = await svc.createTag({
      principal: principal(owner),
      input: { name: "  Female   Knight  " },
    });
    expect(view.name).toBe("Female Knight");
  });

  test("a whitespace-only name is refused (normalizes to empty — no empty-name row)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    const err = await svc
      .createTag({ principal: principal(owner), input: { name: "   " } })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DomainOperationError);
    expect((err as DomainOperationError).code).toBe("tag_name_empty");
  });

  test("a case-variant duplicate is a conflict (the case-insensitive functional unique)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    await svc.createTag({ principal: principal(owner), input: { name: "Female" } });

    await expect(
      svc.createTag({ principal: principal(owner), input: { name: "female" } }),
    ).rejects.toThrow(DomainConflictError);
  });
});
