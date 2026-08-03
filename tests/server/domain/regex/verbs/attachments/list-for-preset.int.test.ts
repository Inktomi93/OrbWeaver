// verb: listForPreset — the scripts attached to an owned preset, in EXECUTION order. Owner-filtered on
// BOTH sides, so it can never enumerate a foreign preset's attachments.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createRegexService, RegexNotFoundError } from "@orb/server/domain/regex";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { makeHarness, principal, seedPreset, seedScript, seedUser } from "../../_support.ts";

describe("listForPreset", () => {
  test("lists the attachments in position order", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const presetId = await seedPreset(db, owner);
    const a = await seedScript(db, { ownerId: owner, id: "regex_script_a", name: "a" });
    const b = await seedScript(db, { ownerId: owner, id: "regex_script_b", name: "b" });
    await svc.attachToPreset({ principal: principal(owner), presetId, scriptId: a });
    await svc.attachToPreset({ principal: principal(owner), presetId, scriptId: b });

    expect((await svc.listForPreset({ principal: principal(owner), presetId })).map((r) => r.name)).toEqual(["a", "b"]);
  });

  test("refuses a FOREIGN preset rather than returning an empty list", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const presetId = await seedPreset(db, owner);

    await expect(svc.listForPreset({ principal: principal(stranger), presetId })).rejects.toBeInstanceOf(RegexNotFoundError);
  });
});
