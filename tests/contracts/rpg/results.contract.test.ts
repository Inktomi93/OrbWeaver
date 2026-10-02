import {
  createGameResultSchema,
  handDoorResultSchema,
  populateResultSchema,
  promoteActorResultSchema,
  resyncResultSchema,
  rollDiceResultSchema,
} from "@orb/contracts/rpg";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures.ts";

test("hand and spending doors keep refused, unchanged, and committed outcomes distinct", () => {
  for (const schema of [handDoorResultSchema, populateResultSchema, promoteActorResultSchema, resyncResultSchema]) {
    const refused = { ok: false, reason: "The model call could not run." };
    expect(schema.parse(refused)).toEqual(refused);
    expect(schema.safeParse({ ...refused, privateFailure: "private" }).success).toBe(false);
    expect(schema.safeParse({ ok: false }).success).toBe(false);
  }
  expect(handDoorResultSchema.parse({ ok: true })).toEqual({ ok: true });
  for (const populated of [false, true]) {
    expect(populateResultSchema.parse({ ok: true, populated })).toEqual({ ok: true, populated });
    expect(resyncResultSchema.parse({ ok: true, rebuilt: populated })).toEqual({ ok: true, rebuilt: populated });
  }
  expect(populateResultSchema.safeParse({ ok: true }).success).toBe(false);
  expect(resyncResultSchema.safeParse({ ok: true }).success).toBe(false);
  expect(promoteActorResultSchema.parse({ ok: true, issues: ["name shortened"] })).toEqual({ ok: true, issues: ["name shortened"] });
});

test("baked dice output retains faces and stamp without admitting a replay seed", () => {
  const roll = { notation: "2d6+1", rolls: [2, 5], modifier: 1, total: 8, stamp: "[dice: 2d6+1 = 8]" };
  expect(rollDiceResultSchema.parse(roll)).toEqual(roll);
  expect(rollDiceResultSchema.safeParse({ ...roll, seed: 1 }).success).toBe(false);
});

test("birth results preserve the read-only disclosure and only admit native game identity", () => {
  const result = { gameId: mintTypeId(ID_PREFIX.rpgGame), trackersReadOnly: true };
  expect(createGameResultSchema.parse(result)).toEqual(result);
  expect(createGameResultSchema.safeParse({ ...result, gameId: mintTypeId(ID_PREFIX.chat) }).success).toBe(false);
  expect(createGameResultSchema.safeParse({ ...result, gmSecret: "private" }).success).toBe(false);
});
