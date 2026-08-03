// verb: listForCharacter — the scripts attached to an owned character, in EXECUTION order. Owner-filtered on
// BOTH sides, so it can never enumerate a foreign character's attachments.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createRegexService, RegexNotFoundError } from "@orb/server/domain/regex";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { makeHarness, principal, seedCharacter, seedScript, seedUser } from "../../_support.ts";

describe("listForCharacter", () => {
  test("lists the attachments in position order", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const characterId = await seedCharacter(db, owner);
    const a = await seedScript(db, { ownerId: owner, id: "regex_script_a", name: "a" });
    const b = await seedScript(db, { ownerId: owner, id: "regex_script_b", name: "b" });
    await svc.attachToCharacter({ principal: principal(owner), characterId, scriptId: a });
    await svc.attachToCharacter({ principal: principal(owner), characterId, scriptId: b });

    expect((await svc.listForCharacter({ principal: principal(owner), characterId })).map((r) => r.name)).toEqual(["a", "b"]);
  });

  test("refuses a FOREIGN character rather than returning an empty list", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const characterId = await seedCharacter(db, owner);

    await expect(svc.listForCharacter({ principal: principal(stranger), characterId })).rejects.toBeInstanceOf(RegexNotFoundError);
  });
});
