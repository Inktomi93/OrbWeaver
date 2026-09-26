// verb: create — owner-scoped mint of a saved party. Load-bearing: the producer belts (foreign member
// character / foreign anchor persona → leak-free NotFound, BEFORE any row lands), the `(owner, name)`
// typed conflict, position normalization (sparse wire positions → dense 0..n-1), the groupConfig
// parse-at-write, and the `rosterPresetsChanged` user-bus emit.

import { rosterPresetMembers, rosterPresets } from "@orb/db";
import type { PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import {
  createRosterPresetService,
  RosterPresetCharacterNotFoundError,
  RosterPresetNameConflictError,
  RosterPresetPersonaNotFoundError,
} from "@orb/server/domain/roster-preset";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { ZodError } from "zod";
import { freshDb } from "../../../../support/db.ts";
import { seedCharacter } from "../../../../support/factories/character.ts";
import { seedPersona } from "../../../../support/factories/persona.ts";
import { seedUser } from "../../../../support/factories/user.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, memberSpec, principal } from "../_support.ts";

describe("create", () => {
  test("mints an owned party: members re-stamped dense 0..n-1 in wire-position order, audited, bus-emitted", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRosterPresetService(h.ctx);
    const owner = (await seedUser(db)).id;
    const a = (await seedCharacter(db, { ownerId: owner, name: "Ash" })).id;
    const b = (await seedCharacter(db, { ownerId: owner, name: "Brook" })).id;

    const view = await svc.create({
      principal: principal(owner),
      // Sparse, out-of-order wire positions (10 before 3) — the verb sorts then re-stamps dense.
      input: { name: "Duo", description: "two of them", members: [memberSpec(a, 10, { talkativeness: 0.9 }), memberSpec(b, 3)] },
    });

    expect(view.name).toBe("Duo");
    expect(view.members.map((m) => m.characterId)).toEqual([b, a]);
    expect(view.members.map((m) => m.position)).toEqual([0, 1]);
    expect(view.members[1]?.talkativeness).toBe(0.9);
    expect(view.members[0]?.talkativeness).toBeNull();
    expect(view.members.map((m) => m.name)).toEqual(["Brook", "Ash"]);
    expect(view.groupConfig).toBeNull();

    const rows = await db.select().from(rosterPresets).where(eq(rosterPresets.id, view.id));
    expect(rows[0]?.ownerId).toBe(owner);
    expect(h.audits.map((x) => x.entry.action)).toContain("rosterPreset.create");
    expect(h.userEvents).toEqual([{ userId: owner, event: { type: "rosterPresetsChanged", rosterPresetId: view.id } }]);
  });

  test("a FOREIGN member character throws RosterPresetCharacterNotFoundError — no row, no audit", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRosterPresetService(h.ctx);
    const owner = (await seedUser(db)).id;
    const other = (await seedUser(db)).id;
    const mine = (await seedCharacter(db, { ownerId: owner })).id;
    const foreign = (await seedCharacter(db, { ownerId: other })).id;

    await expect(
      svc.create({ principal: principal(owner), input: { name: "Theft", description: "", members: [memberSpec(mine, 0), memberSpec(foreign, 1)] } }),
    ).rejects.toBeInstanceOf(RosterPresetCharacterNotFoundError);

    expect(await db.select().from(rosterPresets).where(eq(rosterPresets.ownerId, owner))).toHaveLength(0);
    expect(h.audits).toHaveLength(0);
    expect(h.userEvents).toHaveLength(0);
  });

  test("a FOREIGN (or dangling) anchor persona throws RosterPresetPersonaNotFoundError; an owned one round-trips", async () => {
    const db = await freshDb();
    const svc = createRosterPresetService(makeHarness(db).ctx);
    const owner = (await seedUser(db)).id;
    const other = (await seedUser(db)).id;
    const c = (await seedCharacter(db, { ownerId: owner })).id;
    const foreignPersona = (await seedPersona(db, { ownerId: other })).id;
    const ownedPersona = (await seedPersona(db, { ownerId: owner })).id;

    await expect(
      svc.create({
        principal: principal(owner),
        input: { name: "P1", description: "", anchorPersonaId: foreignPersona, members: [memberSpec(c, 0)] },
      }),
    ).rejects.toBeInstanceOf(RosterPresetPersonaNotFoundError);
    await expect(
      svc.create({
        principal: principal(owner),
        input: { name: "P2", description: "", anchorPersonaId: castId<PersonaId>("persona_dangling"), members: [memberSpec(c, 0)] },
      }),
    ).rejects.toBeInstanceOf(RosterPresetPersonaNotFoundError);

    const view = await svc.create({
      principal: principal(owner),
      input: { name: "P3", description: "", anchorPersonaId: ownedPersona, members: [memberSpec(c, 0)] },
    });
    expect(view.anchorPersonaId).toBe(ownedPersona);
  });

  test("a duplicate (owner, name) is the typed conflict; the SAME name under another owner is fine", async () => {
    const db = await freshDb();
    const svc = createRosterPresetService(makeHarness(db).ctx);
    const owner = (await seedUser(db)).id;
    const other = (await seedUser(db)).id;
    const mine = (await seedCharacter(db, { ownerId: owner })).id;
    const theirs = (await seedCharacter(db, { ownerId: other })).id;

    await svc.create({ principal: principal(owner), input: { name: "Party", description: "", members: [memberSpec(mine, 0)] } });
    await expect(svc.create({ principal: principal(owner), input: { name: "Party", description: "", members: [memberSpec(mine, 0)] } })).rejects.toBeInstanceOf(
      RosterPresetNameConflictError,
    );
    // Same name, different owner — allowed (the UNIQUE is per-owner).
    const view = await svc.create({ principal: principal(other), input: { name: "Party", description: "", members: [memberSpec(theirs, 0)] } });
    expect(view.name).toBe("Party");
  });

  test("a garbage groupConfig blob refuses at the VERB seam (a non-transport caller meets the same boundary)", async () => {
    const db = await freshDb();
    const svc = createRosterPresetService(makeHarness(db).ctx);
    const owner = (await seedUser(db)).id;
    const c = (await seedCharacter(db, { ownerId: owner })).id;

    // A stray key on chat's STRICT arms — refused loudly at the verb's own parse, never stored-and-healed.
    await expect(
      svc.create({
        principal: principal(owner),
        input: {
          name: "Garbage",
          description: "",
          // @orb-waive no-test-fabrication(never): a deliberately MALFORMED blob — the verb-seam refusal is this test's subject. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
          groupConfig: { output: "narrator", bogusKnob: true } as never,
          members: [memberSpec(c, 0)],
        },
      }),
    ).rejects.toThrow(ZodError);
    expect(await db.select().from(rosterPresets).where(eq(rosterPresets.ownerId, owner))).toHaveLength(0);
  });

  test("a valid narrator groupConfig blob round-trips STORED (parse output — fully defaulted)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRosterPresetService(h.ctx);
    const owner = (await seedUser(db)).id;
    const c = (await seedCharacter(db, { ownerId: owner })).id;

    const view = await svc.create({
      principal: principal(owner),
      input: {
        name: "Narrated",
        description: "",
        groupConfig: { output: "narrator", policy: "list" },
        members: [memberSpec(c, 0)],
      },
    });

    // Stored = the schema's parse OUTPUT: fully defaulted, still a valid input for chat's re-parse.
    expect(view.groupConfig).toMatchObject({ output: "narrator", policy: "list", speakerTags: true, groupNudge: true });
    const stored = await db.select().from(rosterPresets).where(eq(rosterPresets.id, view.id));
    expect(stored[0]?.groupConfig).toMatchObject({ output: "narrator", policy: "list" });
  });

  test("preset + members land atomically (the members batch rides the same commit)", async () => {
    const db = await freshDb();
    const svc = createRosterPresetService(makeHarness(db).ctx);
    const owner = (await seedUser(db)).id;
    const a = (await seedCharacter(db, { ownerId: owner })).id;
    const b = (await seedCharacter(db, { ownerId: owner })).id;

    const view = await svc.create({ principal: principal(owner), input: { name: "Pair", description: "", members: [memberSpec(a, 0), memberSpec(b, 1)] } });
    const seats = await db.select().from(rosterPresetMembers).where(eq(rosterPresetMembers.presetId, view.id));
    expect(seats).toHaveLength(2);
  });
});

describe("create — the rules rider (B10)", () => {
  test("captured rule specs store the RESOLVED bag (partial knobs completed by their descriptor defaults), array order preserved", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRosterPresetService(h.ctx);
    const owner = (await seedUser(db)).id;
    const a = (await seedCharacter(db, { ownerId: owner })).id;

    const view = await svc.create({
      principal: principal(owner),
      input: {
        name: "Ruled",
        description: "",
        members: [memberSpec(a, 0)],
        // Partial bags — resolution fills the rest from the catalogue's own defaults (the REAL resolver;
        // the harness wires automation's actual belt).
        rules: [
          { rulePresetId: "sceneVeil", knobs: { veilWord: "((fade))" } },
          { rulePresetId: "pacingNudge", knobs: { everyN: 4 } },
        ],
      },
    });

    expect(view.rules.map((rule) => rule.rulePresetId)).toEqual(["sceneVeil", "pacingNudge"]);
    expect(view.rules[0]?.knobs).toEqual({
      veilWord: "((fade))",
      redirect: "Draw the veil: cut away from that beat and resume afterward, in a new moment.",
    });
    expect(view.rules[1]?.knobs).toMatchObject({ everyN: 4 });
    // A rules-free create stays rules-free (the summary's badge premise).
    const plain = await svc.create({ principal: principal(owner), input: { name: "Plain", description: "", members: [memberSpec(a, 0)] } });
    expect(plain.rules).toEqual([]);
  });

  test("a BAD knob refuses through automation's own typed validation — no row lands", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRosterPresetService(h.ctx);
    const owner = (await seedUser(db)).id;
    const a = (await seedCharacter(db, { ownerId: owner })).id;

    await expect(
      svc.create({
        principal: principal(owner),
        input: { name: "Bad", description: "", members: [memberSpec(a, 0)], rules: [{ rulePresetId: "pacingNudge", knobs: { everyN: 5000 } }] },
      }),
    ).rejects.toThrow(/between 2 and 200/);
    expect(await db.select().from(rosterPresets)).toHaveLength(0);
    expect(h.userEvents).toEqual([]);
  });

  test("a GLOBAL-scope rule preset refuses by name — a cast is a ROOM artifact", async () => {
    const db = await freshDb();
    const svc = createRosterPresetService(makeHarness(db).ctx);
    const owner = (await seedUser(db)).id;
    const a = (await seedCharacter(db, { ownerId: owner })).id;

    await expect(
      svc.create({
        principal: principal(owner),
        input: { name: "Global", description: "", members: [memberSpec(a, 0)], rules: [{ rulePresetId: "livingLibrary", knobs: {} }] },
      }),
    ).rejects.toThrow(/cannot ride a saved cast/);
  });
});

describe("create — the game template", () => {
  test("a template is stored as rpg's parse output and served on get and list; a roster without one reads null", async () => {
    const db = await freshDb();
    const svc = createRosterPresetService(makeHarness(db).ctx);
    const owner = (await seedUser(db)).id;
    const c = (await seedCharacter(db, { ownerId: owner })).id;

    const campaign = await svc.create({
      principal: principal(owner),
      input: { name: "Campaign", description: "", game: { ruleset: "d20" }, members: [memberSpec(c, 0)] },
    });
    const plain = await svc.create({ principal: principal(owner), input: { name: "Plain", description: "", members: [memberSpec(c, 0)] } });

    expect(campaign.game).toEqual({ ruleset: "d20" });
    expect(plain.game).toBeNull();
    expect((await svc.get({ principal: principal(owner), presetId: campaign.id })).game).toEqual({ ruleset: "d20" });
    const listed = await svc.list({ principal: principal(owner) });
    expect(listed.map((row) => [row.name, row.game])).toEqual([
      ["Campaign", { ruleset: "d20" }],
      ["Plain", null],
    ]);
    const stored = await db.select().from(rosterPresets).where(eq(rosterPresets.id, campaign.id));
    expect(stored[0]?.gameTemplate).toEqual({ ruleset: "d20" });
  });

  test("a ruleset rpg does not know refuses at the verb seam, and no row lands", async () => {
    const db = await freshDb();
    const svc = createRosterPresetService(makeHarness(db).ctx);
    const owner = (await seedUser(db)).id;
    const c = (await seedCharacter(db, { ownerId: owner })).id;

    await expect(
      svc.create({
        principal: principal(owner),
        input: {
          name: "Bad game",
          description: "",
          // @orb-waive no-test-fabrication(never): a deliberately unknown ruleset — the verb-seam refusal is this test's subject. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
          game: { ruleset: "gurps" } as never,
          members: [memberSpec(c, 0)],
        },
      }),
    ).rejects.toThrow(ZodError);
    expect(await db.select().from(rosterPresets).where(eq(rosterPresets.ownerId, owner))).toHaveLength(0);
  });
});
