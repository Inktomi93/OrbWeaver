// verb: detachFromPreset — remove a preset attachment. Idempotent (`{detached:false}` on an absent row),
// and both ends still gated so a stranger can never detach through a script they do not own.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createRegexService, RegexNotFoundError } from "@orb/server/domain/regex";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { makeHarness, principal, seedPreset, seedScript, seedUser } from "../../_support.ts";

describe("detachFromPreset", () => {
  test("detaches once, then reports the no-op", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const presetId = await seedPreset(db, owner);
    const scriptId = await seedScript(db, { ownerId: owner, name: "s" });
    await svc.attachToPreset({ principal: principal(owner), presetId, scriptId });

    expect(await svc.detachFromPreset({ principal: principal(owner), presetId, scriptId })).toEqual({ detached: true });
    expect(await svc.detachFromPreset({ principal: principal(owner), presetId, scriptId })).toEqual({ detached: false });
    expect(await svc.listForPreset({ principal: principal(owner), presetId })).toEqual([]);
  });

  test("refuses a foreign script", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const presetId = await seedPreset(db, owner);
    const scriptId = await seedScript(db, { ownerId: stranger, name: "theirs" });

    await expect(svc.detachFromPreset({ principal: principal(owner), presetId, scriptId })).rejects.toBeInstanceOf(RegexNotFoundError);
  });
});
