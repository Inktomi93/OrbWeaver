// verb: remove — delete + best-effort avatar reap. Load-bearing: an owned delete reaps the avatar asset
// (FK is SET NULL, so the asset isn't FK-deleted), no character.updated emit fires (delete cascades the
// embedding), and not-owned throws.

import { characters, statsCanonVersions } from "@orb/db";
import type { CharacterHandle, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { CharacterNotFoundError, createCharacterService } from "@orb/server/domain/character";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedAsset, seedRawCharacter, seedUser } from "../_support.ts";

describe("remove", () => {
  test("deletes an owned character and reaps its avatar; no character.updated emit", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const avatar = await seedAsset(db, { ownerId: owner });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("nyx"), name: "Nyx", description: "d", avatarAssetId: avatar },
    });
    h.events.length = 0;

    await svc.remove({ principal: principal(owner), characterId: created.id });

    await expect(svc.get({ principal: principal(owner), characterId: created.id })).rejects.toBeInstanceOf(CharacterNotFoundError);
    expect(h.reaps).toEqual([[avatar]]);
    expect(h.events).toEqual([]);
    expect((await db.select().from(statsCanonVersions).where(eq(statsCanonVersions.ownerId, owner)))[0]?.version).toBe(2);
  });

  test("a character with no avatar deletes without a reap call", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("nyx"), name: "Nyx", description: "d" },
    });
    await svc.remove({ principal: principal(owner), characterId: created.id });
    expect(h.reaps).toEqual([]);
  });

  test("a delete whose write FAILS destroys nothing: the row survives and no asset is reaped", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const avatar = await seedAsset(db, { ownerId: owner });
    const created = await seedRawCharacter(db, { ownerId: owner, handle: castId<CharacterHandle>("nyx"), avatarAssetId: avatar });

    // Stage the outage on the EXECUTOR (`db.batch`), never on a builder method: `deleteOwnedCharacter`
    // composes its statements through `db.delete(...)` before handing them to `batch`, so failing the
    // builder would kill the write's own construction instead of its execution.
    const brokenWrites = new Proxy(db, {
      get(target, prop): unknown {
        if (prop === "batch") {
          return (): Promise<never> => Promise.reject(new Error("the write leg is down"));
        }
        const value = Reflect.get(target, prop) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const svc = createCharacterService({ ...h.ctx, db: brokenWrites });

    await expect(svc.remove({ principal: principal(owner), characterId: created })).rejects.toThrow("the write leg is down");

    expect(await db.select().from(characters).where(eq(characters.id, created))).toHaveLength(1);
    expect(h.reaps).toEqual([]);
    expect(h.audits).toEqual([]);
    expect(h.userEvents).toEqual([]);
  });

  test("removing another user's character throws CharacterNotFoundError", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("nyx"), name: "Nyx", description: "d" },
    });
    await expect(svc.remove({ principal: principal(other), characterId: created.id })).rejects.toBeInstanceOf(CharacterNotFoundError);
  });
});
