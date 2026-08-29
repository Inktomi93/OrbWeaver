// verb: remove — delete an owned party. Load-bearing: the seats CASCADE with the row, siblings survive,
// the not-owned answer collapses leak-free, and the bus emit carries the removed id.

import { rosterPresetMembers, rosterPresets } from "@orb/db";
import { createRosterPresetService, RosterPresetNotFoundError } from "@orb/server/domain/roster-preset";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { seedCharacter } from "../../../../support/factories/character.ts";
import { seedUser } from "../../../../support/factories/user.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, memberSpec, principal } from "../_support.ts";

describe("remove", () => {
  test("deletes the row, CASCADEs the seats, leaves the sibling preset intact (audited + bus emit)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRosterPresetService(h.ctx);
    const owner = (await seedUser(db)).id;
    const a = (await seedCharacter(db, { ownerId: owner })).id;
    const doomed = await svc.create({ principal: principal(owner), input: { name: "Doomed", description: "", members: [memberSpec(a, 0)] } });
    const kept = await svc.create({ principal: principal(owner), input: { name: "Kept", description: "", members: [memberSpec(a, 0)] } });

    await svc.remove({ principal: principal(owner), presetId: doomed.id });

    expect(await db.select().from(rosterPresets).where(eq(rosterPresets.id, doomed.id))).toHaveLength(0);
    expect(await db.select().from(rosterPresetMembers).where(eq(rosterPresetMembers.presetId, doomed.id))).toHaveLength(0);
    expect(await db.select().from(rosterPresets).where(eq(rosterPresets.id, kept.id))).toHaveLength(1);
    expect(h.audits.map((x) => x.entry.action)).toContain("rosterPreset.remove");
    expect(h.userEvents.at(-1)).toEqual({ userId: owner, event: { type: "rosterPresetsChanged", rosterPresetId: doomed.id } });
  });

  test("B removing A's preset is a leak-free NotFound — the row survives, nothing audited", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRosterPresetService(h.ctx);
    const owner = (await seedUser(db)).id;
    const stranger = (await seedUser(db)).id;
    const a = (await seedCharacter(db, { ownerId: owner })).id;
    const mine = await svc.create({ principal: principal(owner), input: { name: "Mine", description: "", members: [memberSpec(a, 0)] } });
    const auditsBefore = h.audits.length;

    await expect(svc.remove({ principal: principal(stranger), presetId: mine.id })).rejects.toBeInstanceOf(RosterPresetNotFoundError);
    expect(await db.select().from(rosterPresets).where(eq(rosterPresets.id, mine.id))).toHaveLength(1);
    expect(h.audits).toHaveLength(auditsBefore);
  });
});
