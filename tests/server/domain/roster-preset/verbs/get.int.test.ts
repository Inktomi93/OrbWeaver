// verb: get — one owned party, members in position order. Load-bearing: the not-owned and not-found
// answers collapse into ONE leak-free NotFound (no foreign-existence oracle).

import { rosterPresetViewSchema } from "@orb/contracts/roster-preset";
import { rosterPresets } from "@orb/db";
import type { RosterPresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createRosterPresetService, RosterPresetNotFoundError } from "@orb/server/domain/roster-preset";
import { eq, sql } from "drizzle-orm";
import { describe } from "vitest";
import { ZodError } from "zod";
import { freshDb } from "../../../../support/db.ts";
import { seedCharacter } from "../../../../support/factories/character.ts";
import { seedUser } from "../../../../support/factories/user.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, memberSpec, principal } from "../_support.ts";

describe("get", () => {
  for (const scenario of [
    {
      name: "legacy narrator Smart",
      raw: { output: "narrator", policy: "smart", smartPicker: "utility" },
      expected: { output: "narrator", policy: "natural", smartPicker: "utility" },
    },
    { name: "sparse narrator", raw: { output: "narrator" }, expected: { output: "narrator" } },
    { name: "sparse per-speaker", raw: { output: "per-speaker", cardScope: "scoped" }, expected: { output: "per-speaker", cardScope: "scoped" } },
    {
      name: "normal per-speaker Smart",
      raw: { output: "per-speaker", policy: "smart", autoMode: false },
      expected: { output: "per-speaker", policy: "smart", autoMode: false },
    },
  ] as const) {
    test(`actual ${scenario.name} stored group view normalizes without defaults or storage mutation`, async () => {
      const db = await freshDb();
      const harness = makeHarness(db);
      const svc = createRosterPresetService(harness.ctx);
      const owner = (await seedUser(db)).id;
      const stranger = (await seedUser(db)).id;
      const character = (await seedCharacter(db, { ownerId: owner, name: "Stored roster member" })).id;
      const created = await svc.create({
        principal: principal(owner),
        input: { name: "Sparse stored party", description: "Stored description", members: [memberSpec(character, 0)] },
      });
      await db.update(rosterPresets).set({ groupConfig: scenario.raw }).where(eq(rosterPresets.id, created.id));
      const before = await db.select().from(rosterPresets).where(eq(rosterPresets.id, created.id));
      const events = [...harness.userEvents];
      const audits = [...harness.audits];

      const view = await svc.get({ principal: principal(owner), presetId: created.id });
      expect(view.groupConfig).toEqual(scenario.expected);
      expect(view).toMatchObject({
        id: created.id,
        name: created.name,
        description: created.description,
        members: created.members,
        rules: created.rules,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      });
      expect(rosterPresetViewSchema.parse(view)).toEqual(view);
      expect(await db.select().from(rosterPresets).where(eq(rosterPresets.id, created.id))).toEqual(before);
      await expect(svc.get({ principal: principal(stranger), presetId: created.id })).rejects.toBeInstanceOf(RosterPresetNotFoundError);
      expect(harness.userEvents).toEqual(events);
      expect(harness.audits).toEqual(audits);
      expect(harness.hostChecks).toEqual([]);
      expect(harness.configs).toEqual([]);
    });
  }

  test("the actual view rejects unknown partial group fields without healing, rewriting or exposing a foreign row", async () => {
    const db = await freshDb();
    const harness = makeHarness(db);
    const svc = createRosterPresetService(harness.ctx);
    const owner = (await seedUser(db)).id;
    const stranger = (await seedUser(db)).id;
    const character = (await seedCharacter(db, { ownerId: owner })).id;
    const created = await svc.create({ principal: principal(owner), input: { name: "Invalid stored party", members: [memberSpec(character, 0)] } });
    await db
      .update(rosterPresets)
      .set({ groupConfig: sql`${JSON.stringify({ output: "narrator", undeclared: true })}` })
      .where(eq(rosterPresets.id, created.id));
    const before = await db.select().from(rosterPresets).where(eq(rosterPresets.id, created.id));
    const events = [...harness.userEvents];
    const audits = [...harness.audits];
    await expect(svc.get({ principal: principal(stranger), presetId: created.id })).rejects.toBeInstanceOf(RosterPresetNotFoundError);
    await expect(svc.get({ principal: principal(owner), presetId: created.id })).rejects.toBeInstanceOf(ZodError);
    expect(await db.select().from(rosterPresets).where(eq(rosterPresets.id, created.id))).toEqual(before);
    expect(harness.userEvents).toEqual(events);
    expect(harness.audits).toEqual(audits);
  });
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
