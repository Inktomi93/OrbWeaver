// verb: bulkRemoveCardTag — owner-scopes targets, then routes each to the injected tag DETACH port (the mirror
// of bulkAddCardTag). Load-bearing: unowned characters are never touched; a blank name is a no-op (no port
// calls); freshness fires charactersChanged only when a row was actually removed.

import type { CharacterHandle, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createCharacterService } from "@orb/server/domain/character";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("bulk remove card tag", () => {
  test("calls the tag detach port once per OWNED character and skips foreign ones", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const a = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("a"), name: "A", description: "d" },
    });
    const b = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("b"), name: "B", description: "d" },
    });
    const foreign = await svc.create({
      principal: principal(other),
      input: { handle: castId<CharacterHandle>("c"), name: "C", description: "d" },
    });

    await svc.bulkRemoveCardTag({
      principal: principal(owner),
      tagName: "  hero  ",
      characterIds: [a.id, b.id, foreign.id],
    });

    expect(h.tagDetaches.map((t) => t.characterId)).toEqual([a.id, b.id]);
    // the trimmed name is what reaches the port
    expect(h.tagDetaches.every((t) => t.tagName === "hero")).toBe(true);
    expect(h.tagDetaches.every((t) => t.ownerId === owner)).toBe(true);
  });

  test("a blank tag name is a no-op (no port calls)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const a = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("a"), name: "A", description: "d" },
    });
    await svc.bulkRemoveCardTag({
      principal: principal(owner),
      tagName: "   ",
      characterIds: [a.id],
    });
    expect(h.tagDetaches).toEqual([]);
  });

  test("fires charactersChanged + a bulk_remove audit ONLY when a row was actually removed", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const a = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("a"), name: "A", description: "d" },
    });

    // Baseline AFTER setup — `create` itself emits `charactersChanged` + audits, so measure the deltas.
    const eventsBefore = h.userEvents.length;
    const auditsBefore = h.audits.length;

    // The port reports "nothing removed" → no NEW emit, no NEW audit.
    h.setTagDetachResult(false);
    await svc.bulkRemoveCardTag({
      principal: principal(owner),
      tagName: "hero",
      characterIds: [a.id],
    });
    expect(h.userEvents).toHaveLength(eventsBefore);
    expect(h.audits).toHaveLength(auditsBefore);

    // The port reports a removal → charactersChanged fires (owner-scoped) + one audit lands.
    h.setTagDetachResult(true);
    await svc.bulkRemoveCardTag({
      principal: principal(owner),
      tagName: "hero",
      characterIds: [a.id],
    });
    expect(h.userEvents).toHaveLength(eventsBefore + 1);
    expect(h.userEvents.at(-1)).toEqual({ userId: owner, event: { type: "charactersChanged" } });
    expect(h.audits.at(-1)?.entry).toMatchObject({
      actorUserId: owner,
      action: "character.bulk_remove_card_tag",
      entityType: "character",
      metadata: { tag: "hero", removed: 1 },
    });
  });
});
