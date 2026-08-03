// verb: tag-library export — serializes the owner's whole tag namespace to portable JSON bytes. Load-bearing:
// owner-scoped (a foreign owner's tags never travel), and the bytes parse back to the same name set.

import type { PortableParse } from "@orb/contracts/portability";
import { createTagLibraryExport, createTagService } from "@orb/server/domain/tag";
import { parseTagLibrary } from "@orb/server/kit/serde/tag";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeTagHarness, principal, seedUser } from "../_support.ts";

/** The parse outcome's value — the portable serdes return a typed refusal reason, never null. */
function must<T>(result: PortableParse<T>): T {
  if (!result.ok) {
    throw new Error(`portable parse refused: ${result.reason}`);
  }
  return result.value;
}

describe("tag-library export", () => {
  test("serializes only the owner's tags; the bytes parse back to the same set", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_owner");
    const other = await seedUser(db, "user_other");
    const harness = makeTagHarness(db);
    const svc = createTagService(harness.ctx);

    await svc.createTag({
      principal: principal(owner),
      input: { name: "fantasy", color: "#abcdef" },
    });
    await svc.createTag({ principal: principal(owner), input: { name: "sci-fi" } });
    await svc.createTag({ principal: principal(other), input: { name: "theirs" } });

    const bytes = await createTagLibraryExport(harness.ctx)(owner);
    const lib = must(parseTagLibrary(bytes));

    const names = lib?.tags.map((t) => t.name).sort();
    expect(names).toEqual(["fantasy", "sci-fi"]);
    expect(lib?.tags.find((t) => t.name === "fantasy")?.color).toBe("#abcdef");
  });

  test("an owner with no tags exports an empty library", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const harness = makeTagHarness(db);

    const lib = must(parseTagLibrary(await createTagLibraryExport(harness.ctx)(owner)));
    expect(lib?.tags).toEqual([]);
  });
});
