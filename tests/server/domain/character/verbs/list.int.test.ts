// verb: list — owner-scoped, newest-first. Load-bearing INVARIANT 3: synthetic group buckets NEVER appear
// in a user-facing list (they'd leak the hidden memory identities). Also owner-scoped (no foreign rows).

import { characterTags, tags } from "@orb/db";
import type { TagId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createCharacterService } from "@orb/server/domain/character";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedRawCharacter, seedUser } from "../_support.ts";

describe("list", () => {
  test("returns the owner's characters newest-first, excluding other owners", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });

    await svc.create({
      principal: principal(owner),
      input: { handle: "a", name: "A", description: "d" },
    });
    h.advance(1000);
    const second = await svc.create({
      principal: principal(owner),
      input: { handle: "b", name: "B", description: "d" },
    });
    await svc.create({
      principal: principal(other),
      input: { handle: "c", name: "C", description: "d" },
    });

    const rows = await svc.list({ principal: principal(owner) });
    expect(rows.map((r) => r.handle)).toEqual(["b", "a"]);
    expect(rows[0]?.id).toBe(second.id);
    expect(rows[0]?.tokenSize).toBeGreaterThan(0);
  });

  test("synthetic group buckets are excluded from the list (invariant 3)", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    await svc.create({
      principal: principal(owner),
      input: { handle: "real", name: "Real", description: "d" },
    });
    await seedRawCharacter(db, {
      id: "character_grp",
      ownerId: owner,
      handle: "__group__chat_1",
      synthetic: true,
    });

    const rows = await svc.list({ principal: principal(owner) });
    expect(rows.map((r) => r.handle)).toEqual(["real"]);
  });
});

describe("list — canonical tags (tag.md L56: the library tag filter)", () => {
  test("each summary carries its ACCEPTED tags; pending suggestions and other rows' tags don't bleed", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const tagged = await svc.create({
      principal: principal(owner),
      input: { handle: "tagged", name: "Tagged", description: "d" },
    });
    const bare = await svc.create({
      principal: principal(owner),
      input: { handle: "bare", name: "Bare", description: "d" },
    });
    const fantasy = castId<TagId>("tag_fantasy");
    const staged = castId<TagId>("tag_staged");
    await db.insert(tags).values([
      { id: fantasy, ownerId: owner, name: "fantasy" },
      { id: staged, ownerId: owner, name: "staged" },
    ]);
    await db.insert(characterTags).values([
      { characterId: tagged.id, tagId: fantasy, status: "accepted" },
      { characterId: tagged.id, tagId: staged, status: "pending" },
    ]);

    const rows = await svc.list({ principal: principal(owner) });

    const taggedRow = rows.find((r) => r.id === tagged.id);
    const bareRow = rows.find((r) => r.id === bare.id);
    expect(taggedRow?.tags.map((t) => t.name)).toEqual(["fantasy"]);
    expect(bareRow?.tags).toEqual([]);
  });
});
