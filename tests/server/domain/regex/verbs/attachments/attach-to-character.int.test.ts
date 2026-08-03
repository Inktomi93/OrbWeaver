// verb: attachToCharacter — attach an owned script to an owned character. BOTH ends are gated: a foreign script
// and a foreign character are each refused with the same not-found answer. Positions APPEND.

import { characterRegexScripts } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createRegexService, RegexNotFoundError } from "@orb/server/domain/regex";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { makeHarness, principal, seedCharacter, seedScript, seedUser } from "../../_support.ts";

describe("attachToCharacter", () => {
  test("attaches, is idempotent, and APPENDS in attach order", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const characterId = await seedCharacter(db, owner);
    const first = await seedScript(db, { ownerId: owner, id: "regex_script_1", name: "first" });
    const second = await seedScript(db, { ownerId: owner, id: "regex_script_2", name: "second" });

    await svc.attachToCharacter({ principal: principal(owner), characterId, scriptId: first });
    await svc.attachToCharacter({ principal: principal(owner), characterId, scriptId: first });
    await svc.attachToCharacter({ principal: principal(owner), characterId, scriptId: second });

    expect(await db.select().from(characterRegexScripts).where(eq(characterRegexScripts.characterId, characterId))).toHaveLength(2);
    expect((await svc.listForCharacter({ principal: principal(owner), characterId })).map((r) => r.name)).toEqual(["first", "second"]);
  });

  test("refuses a FOREIGN script", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const characterId = await seedCharacter(db, owner);
    const scriptId = await seedScript(db, { ownerId: stranger, name: "theirs" });

    await expect(svc.attachToCharacter({ principal: principal(owner), characterId, scriptId })).rejects.toBeInstanceOf(RegexNotFoundError);
    expect(await db.select().from(characterRegexScripts)).toHaveLength(0);
  });
});
