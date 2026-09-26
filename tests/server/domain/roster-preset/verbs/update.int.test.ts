// verb: update — full replace of the authored fields, member list included. Load-bearing: the member
// swap is whole-list (a dropped member's seat row is GONE), the same producer belts as create run
// against the NEW list, the name-conflict pre-check excludes SELF (a same-name save is not a
// self-conflict), and not-owned/not-found collapse to one leak-free NotFound.

import { rosterPresetMembers } from "@orb/db";
import type { RosterPresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import {
  createRosterPresetService,
  RosterPresetCharacterNotFoundError,
  RosterPresetNameConflictError,
  RosterPresetNotFoundError,
} from "@orb/server/domain/roster-preset";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { seedCharacter } from "../../../../support/factories/character.ts";
import { seedUser } from "../../../../support/factories/user.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, memberSpec, principal } from "../_support.ts";

describe("update", () => {
  test("full-replaces the member list (dropped seats deleted, new seats dense-positioned) + bus emit", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRosterPresetService(h.ctx);
    const owner = (await seedUser(db)).id;
    const a = (await seedCharacter(db, { ownerId: owner, name: "Ash" })).id;
    const b = (await seedCharacter(db, { ownerId: owner, name: "Brook" })).id;
    const c = (await seedCharacter(db, { ownerId: owner, name: "Cinder" })).id;

    const created = await svc.create({
      principal: principal(owner),
      input: { name: "Trio", description: "", members: [memberSpec(a, 0), memberSpec(b, 1)] },
    });
    const view = await svc.update({
      principal: principal(owner),
      presetId: created.id,
      input: { name: "Trio v2", description: "re-cast", members: [memberSpec(c, 0, { disabled: true }), memberSpec(a, 1)] },
    });

    expect(view.name).toBe("Trio v2");
    expect(view.description).toBe("re-cast");
    expect(view.members.map((m) => m.characterId)).toEqual([c, a]);
    expect(view.members[0]?.disabled).toBe(true);
    // The dropped member's seat row is GONE (whole-list swap, not a merge).
    const seats = await db.select().from(rosterPresetMembers).where(eq(rosterPresetMembers.presetId, created.id));
    expect(seats.map((s) => s.characterId).toSorted()).toEqual([a, c].toSorted());
    expect(h.userEvents.at(-1)).toEqual({ userId: owner, event: { type: "rosterPresetsChanged", rosterPresetId: created.id } });
  });

  test("a same-name save is NOT a self-conflict; a sibling's name IS the typed conflict", async () => {
    const db = await freshDb();
    const svc = createRosterPresetService(makeHarness(db).ctx);
    const owner = (await seedUser(db)).id;
    const ch = (await seedCharacter(db, { ownerId: owner })).id;
    const one = await svc.create({ principal: principal(owner), input: { name: "One", description: "", members: [memberSpec(ch, 0)] } });
    await svc.create({ principal: principal(owner), input: { name: "Two", description: "", members: [memberSpec(ch, 0)] } });

    // Same name, same row — a no-op rename passes.
    const kept = await svc.update({ principal: principal(owner), presetId: one.id, input: { name: "One", description: "d", members: [memberSpec(ch, 0)] } });
    expect(kept.description).toBe("d");
    // The sibling's name — refused typed.
    await expect(
      svc.update({ principal: principal(owner), presetId: one.id, input: { name: "Two", description: "", members: [memberSpec(ch, 0)] } }),
    ).rejects.toBeInstanceOf(RosterPresetNameConflictError);
  });

  test("a FOREIGN member in the replacement list is refused and the stored list survives untouched", async () => {
    const db = await freshDb();
    const svc = createRosterPresetService(makeHarness(db).ctx);
    const owner = (await seedUser(db)).id;
    const other = (await seedUser(db)).id;
    const mine = (await seedCharacter(db, { ownerId: owner })).id;
    const foreign = (await seedCharacter(db, { ownerId: other })).id;
    const created = await svc.create({ principal: principal(owner), input: { name: "Solo", description: "", members: [memberSpec(mine, 0)] } });

    await expect(
      svc.update({ principal: principal(owner), presetId: created.id, input: { name: "Solo", description: "", members: [memberSpec(foreign, 0)] } }),
    ).rejects.toBeInstanceOf(RosterPresetCharacterNotFoundError);

    const seats = await db.select().from(rosterPresetMembers).where(eq(rosterPresetMembers.presetId, created.id));
    expect(seats.map((s) => s.characterId)).toEqual([mine]);
  });

  test("B updating A's preset (or a dangling id) is one leak-free NotFound", async () => {
    const db = await freshDb();
    const svc = createRosterPresetService(makeHarness(db).ctx);
    const owner = (await seedUser(db)).id;
    const stranger = (await seedUser(db)).id;
    const mine = (await seedCharacter(db, { ownerId: owner })).id;
    const strangers = (await seedCharacter(db, { ownerId: stranger })).id;
    const created = await svc.create({ principal: principal(owner), input: { name: "Mine", description: "", members: [memberSpec(mine, 0)] } });

    await expect(
      svc.update({ principal: principal(stranger), presetId: created.id, input: { name: "Stolen", description: "", members: [memberSpec(strangers, 0)] } }),
    ).rejects.toBeInstanceOf(RosterPresetNotFoundError);
    await expect(
      svc.update({
        principal: principal(owner),
        presetId: castId<RosterPresetId>("roster_preset_missing"),
        input: { name: "X", description: "", members: [memberSpec(mine, 0)] },
      }),
    ).rejects.toBeInstanceOf(RosterPresetNotFoundError);
  });

  test("full-replaces the RULES like every other field: a new list swaps in, an omitted list clears (B10 — the editor ECHOES to preserve)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRosterPresetService(h.ctx);
    const owner = (await seedUser(db)).id;
    const a = (await seedCharacter(db, { ownerId: owner })).id;
    const created = await svc.create({
      principal: principal(owner),
      input: { name: "Ruled", description: "", members: [memberSpec(a, 0)], rules: [{ rulePresetId: "sceneVeil", knobs: {} }] },
    });
    expect(created.rules.map((rule) => rule.rulePresetId)).toEqual(["sceneVeil"]);

    // Replace with a DIFFERENT rule list — the old junction rows swap out wholesale.
    const swapped = await svc.update({
      principal: principal(owner),
      presetId: created.id,
      input: { name: "Ruled", description: "", members: [memberSpec(a, 0)], rules: [{ rulePresetId: "pacingNudge", knobs: { everyN: 3 } }] },
    });
    expect(swapped.rules.map((rule) => rule.rulePresetId)).toEqual(["pacingNudge"]);
    expect(swapped.rules[0]?.knobs).toMatchObject({ everyN: 3 });

    // Omitting `rules` is the FULL-REPLACE semantics saying "none" — the library editor echoes the
    // stored list back on a rename precisely because of this.
    const cleared = await svc.update({
      principal: principal(owner),
      presetId: created.id,
      input: { name: "Ruled", description: "", members: [memberSpec(a, 0)] },
    });
    expect(cleared.rules).toEqual([]);
  });
});

describe("update — the game template", () => {
  test("full replace: an echoed template survives the update, and an omitted one clears it", async () => {
    const db = await freshDb();
    const svc = createRosterPresetService(makeHarness(db).ctx);
    const owner = (await seedUser(db)).id;
    const c = (await seedCharacter(db, { ownerId: owner })).id;
    const created = await svc.create({ principal: principal(owner), input: { name: "Campaign", description: "", game: {}, members: [memberSpec(c, 0)] } });

    const renamed = await svc.update({
      principal: principal(owner),
      presetId: created.id,
      input: { name: "Campaign II", description: "", game: created.game, members: [memberSpec(c, 0)] },
    });
    expect(renamed.game).toEqual({});

    const cleared = await svc.update({
      principal: principal(owner),
      presetId: created.id,
      input: { name: "Campaign II", description: "", members: [memberSpec(c, 0)] },
    });
    expect(cleared.game).toBeNull();
  });
});
