// verb: detachFromCharacter — remove a character attachment. Idempotent (`{detached:false}` on an absent row),
// and both ends still gated so a stranger can never detach through a script they do not own.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createRegexService, RegexNotFoundError } from "@orb/server/domain/regex";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { makeHarness, principal, seedCharacter, seedScript, seedUser } from "../../_support.ts";

describe("detachFromCharacter", () => {
  test("detaches once, then reports the no-op", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const characterId = await seedCharacter(db, owner);
    const scriptId = await seedScript(db, { ownerId: owner, name: "s" });
    await svc.attachToCharacter({ principal: principal(owner), characterId, scriptId });

    expect(await svc.detachFromCharacter({ principal: principal(owner), characterId, scriptId })).toEqual({ detached: true });
    expect(await svc.detachFromCharacter({ principal: principal(owner), characterId, scriptId })).toEqual({ detached: false });
    expect(await svc.listForCharacter({ principal: principal(owner), characterId })).toEqual([]);
  });

  test("refuses a foreign script", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const characterId = await seedCharacter(db, owner);
    const scriptId = await seedScript(db, { ownerId: stranger, name: "theirs" });

    await expect(svc.detachFromCharacter({ principal: principal(owner), characterId, scriptId })).rejects.toBeInstanceOf(RegexNotFoundError);
  });
});
