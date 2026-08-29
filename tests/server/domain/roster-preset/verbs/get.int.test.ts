// verb: get — one owned party, members in position order. Load-bearing: the not-owned and not-found
// answers collapse into ONE leak-free NotFound (no foreign-existence oracle).

import type { RosterPresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createRosterPresetService, RosterPresetNotFoundError } from "@orb/server/domain/roster-preset";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { seedCharacter } from "../../../../support/factories/character.ts";
import { seedUser } from "../../../../support/factories/user.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, memberSpec, principal } from "../_support.ts";

describe("get", () => {
  test("returns the owned party with members in position order", async () => {
    const db = await freshDb();
    const svc = createRosterPresetService(makeHarness(db).ctx);
    const owner = (await seedUser(db)).id;
    const a = (await seedCharacter(db, { ownerId: owner, name: "Ash" })).id;
    const b = (await seedCharacter(db, { ownerId: owner, name: "Brook" })).id;
    const created = await svc.create({ principal: principal(owner), input: { name: "Pair", description: "", members: [memberSpec(b, 0), memberSpec(a, 1)] } });

    const view = await svc.get({ principal: principal(owner), presetId: created.id });
    expect(view.members.map((m) => m.name)).toEqual(["Brook", "Ash"]);
    expect(view.members.map((m) => m.position)).toEqual([0, 1]);
  });

  test("a stranger's get and a dangling id are the SAME leak-free NotFound", async () => {
    const db = await freshDb();
    const svc = createRosterPresetService(makeHarness(db).ctx);
    const owner = (await seedUser(db)).id;
    const stranger = (await seedUser(db)).id;
    const c = (await seedCharacter(db, { ownerId: owner })).id;
    const mine = await svc.create({ principal: principal(owner), input: { name: "Mine", description: "", members: [memberSpec(c, 0)] } });

    await expect(svc.get({ principal: principal(stranger), presetId: mine.id })).rejects.toBeInstanceOf(RosterPresetNotFoundError);
    await expect(svc.get({ principal: principal(owner), presetId: castId<RosterPresetId>("roster_preset_missing") })).rejects.toBeInstanceOf(
      RosterPresetNotFoundError,
    );
  });
});
