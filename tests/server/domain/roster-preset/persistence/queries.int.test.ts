// persistence — the FK physics the schema promises (the design's deletion-semantics test surface) plus
// the name-taken pre-check's exclude-self arm. Real libSQL :memory: (freshDb) — cascade behavior is only
// "correct" against a real db with FK PRAGMA on.

import type { Db } from "@orb/db";
import { characters, personas, rosterPresetMembers, rosterPresets, users } from "@orb/db";
import type { CharacterId, PersonaId, RosterPresetId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { RosterPresetNotFoundError } from "@orb/server/domain/roster-preset";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import {
  insertPresetWithMembers,
  listOwnedPresetRows,
  loadMemberCardRows,
  loadMemberRows,
  loadOwnedPresetRow,
  ownedPresetNameTaken,
  updatePresetWithMembers,
} from "../../../../../packages/server/src/domain/roster-preset/persistence/queries.ts";
import { groupMemberViews } from "../../../../../packages/server/src/domain/roster-preset/substrate/members.ts";
import { freshDb } from "../../../../support/db.ts";
import { seedCharacter } from "../../../../support/factories/character.ts";
import { seedPersona } from "../../../../support/factories/persona.ts";
import { seedUser } from "../../../../support/factories/user.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const AT = 1_700_000_000_000;

interface SeedPresetArgs {
  readonly id: string;
  readonly ownerId: UserId;
  readonly name: string;
  readonly anchorPersonaId?: PersonaId | null;
  readonly memberIds: readonly CharacterId[];
}

async function seedPreset(db: Db, args: SeedPresetArgs): Promise<RosterPresetId> {
  const presetId = castId<RosterPresetId>(args.id);
  await insertPresetWithMembers(
    db,
    {
      id: presetId,
      ownerId: args.ownerId,
      name: args.name,
      description: "",
      anchorPersonaId: args.anchorPersonaId ?? null,
      groupConfig: null,
      createdAt: AT,
      updatedAt: AT,
    },
    args.memberIds.map((characterId, i) => ({ characterId, position: i, talkativeness: null, disabled: false })),
  );
  return presetId;
}

describe("roster-preset persistence — FK physics", () => {
  test("character delete → seat row CASCADEs out, the preset survives smaller", async () => {
    const db = await freshDb();
    const owner = (await seedUser(db)).id;
    const keep = (await seedCharacter(db, { ownerId: owner })).id;
    const doomed = (await seedCharacter(db, { ownerId: owner })).id;
    const presetId = await seedPreset(db, { id: "roster_preset_p1", ownerId: owner, name: "P", memberIds: [keep, doomed] });

    await db.delete(characters).where(eq(characters.id, doomed));

    const members = await loadMemberRows(db, presetId);
    expect(members.map((m) => m.characterId)).toEqual([keep]);
    expect(await loadOwnedPresetRow(db, owner, presetId)).toBeDefined();
  });

  test("persona delete → the anchor pointer NULLs, the preset survives", async () => {
    const db = await freshDb();
    const owner = (await seedUser(db)).id;
    const c = (await seedCharacter(db, { ownerId: owner })).id;
    const anchor = (await seedPersona(db, { ownerId: owner })).id;
    const presetId = await seedPreset(db, { id: "roster_preset_p2", ownerId: owner, name: "P", anchorPersonaId: anchor, memberIds: [c] });

    await db.delete(personas).where(eq(personas.id, anchor));

    const row = await loadOwnedPresetRow(db, owner, presetId);
    expect(row?.anchorPersonaId).toBeNull();
  });

  test("preset delete → members CASCADE; owner delete → everything CASCADEs", async () => {
    const db = await freshDb();
    const owner = (await seedUser(db)).id;
    const c = (await seedCharacter(db, { ownerId: owner })).id;
    const p1 = await seedPreset(db, { id: "roster_preset_p3", ownerId: owner, name: "A", memberIds: [c] });
    const p2 = await seedPreset(db, { id: "roster_preset_p4", ownerId: owner, name: "B", memberIds: [c] });

    await db.delete(rosterPresets).where(eq(rosterPresets.id, p1));
    expect(await db.select().from(rosterPresetMembers).where(eq(rosterPresetMembers.presetId, p1))).toHaveLength(0);
    expect(await loadMemberRows(db, p2)).toHaveLength(1);

    await db.delete(users).where(eq(users.id, owner));
    expect(await db.select().from(rosterPresets)).toHaveLength(0);
    expect(await db.select().from(rosterPresetMembers)).toHaveLength(0);
  });

  test("updatePresetWithMembers with a MISMATCHED owner refuses leak-free and mutates NO cross-owner member (stickler F2 — the direct belt probe the verb path can't reach)", async () => {
    const db = await freshDb();
    const alice = (await seedUser(db)).id;
    const bob = (await seedUser(db)).id;
    const alicesChar = (await seedCharacter(db, { ownerId: alice, name: "AliceHero" })).id;
    const bobsChar = (await seedCharacter(db, { ownerId: bob })).id;
    const alicesPreset = await seedPreset(db, { id: "roster_preset_f2", ownerId: alice, name: "Alice's party", memberIds: [alicesChar] });

    // Bob calls the persistence op DIRECTLY (bypassing the verb's owned read) with Alice's presetId.
    // Pre-fix this no-op'd the row but WIPED+replaced Alice's member list — the half-belt.
    await expect(
      updatePresetWithMembers(db, {
        ownerId: bob,
        presetId: alicesPreset,
        patch: { name: "stolen", description: "", anchorPersonaId: null, groupConfig: null, updatedAt: AT + 1 },
        members: [{ characterId: bobsChar, position: 0, talkativeness: null, disabled: false }],
      }),
    ).rejects.toBeInstanceOf(RosterPresetNotFoundError);

    // Alice's world is byte-untouched: her row AND her member list survive.
    const row = await loadOwnedPresetRow(db, alice, alicesPreset);
    expect(row?.name).toBe("Alice's party");
    const members = await loadMemberRows(db, alicesPreset);
    expect(members.map((m) => m.characterId)).toEqual([alicesChar]);

    // POSITIVE CONTROL (non-vacuity): the SAME op under the RIGHT owner does replace the list.
    await updatePresetWithMembers(db, {
      ownerId: alice,
      presetId: alicesPreset,
      patch: { name: "Alice's party", description: "", anchorPersonaId: null, groupConfig: null, updatedAt: AT + 2 },
      members: [{ characterId: alicesChar, position: 0, talkativeness: 0.9, disabled: false }],
    });
    expect((await loadMemberRows(db, alicesPreset))[0]?.talkativeness).toBe(0.9);
  });

  test("ownedPresetNameTaken: taken for a sibling, NOT taken for self (excludeId), owner-partitioned", async () => {
    const db = await freshDb();
    const a = (await seedUser(db)).id;
    const b = (await seedUser(db)).id;
    const ca = (await seedCharacter(db, { ownerId: a })).id;
    const p = await seedPreset(db, { id: "roster_preset_p5", ownerId: a, name: "Party", memberIds: [ca] });

    expect(await ownedPresetNameTaken(db, a, "Party")).toBe(true);
    expect(await ownedPresetNameTaken(db, a, "Party", p)).toBe(false);
    expect(await ownedPresetNameTaken(db, b, "Party")).toBe(false);
    expect(await ownedPresetNameTaken(db, a, "Other")).toBe(false);
  });

  test("loadMemberCardRows batches MULTIPLE presets; groupMemberViews buckets each in position order", async () => {
    const db = await freshDb();
    const owner = (await seedUser(db)).id;
    const x = (await seedCharacter(db, { ownerId: owner, name: "Xan" })).id;
    const y = (await seedCharacter(db, { ownerId: owner, name: "Yara" })).id;
    const p1 = await seedPreset(db, { id: "roster_preset_p6", ownerId: owner, name: "One", memberIds: [y, x] });
    const p2 = await seedPreset(db, { id: "roster_preset_p7", ownerId: owner, name: "Two", memberIds: [x] });

    const buckets = groupMemberViews(await loadMemberCardRows(db, [p1, p2]));
    expect(buckets.get(p1)?.map((m) => m.name)).toEqual(["Yara", "Xan"]);
    expect(buckets.get(p2)?.map((m) => m.name)).toEqual(["Xan"]);
    expect(await listOwnedPresetRows(db, owner)).toHaveLength(2);
  });
});
