// verbs/dice — rollDice (rpg-design/05 §4.4, §6.2). Server CSPRNG (injected `randomInt`, scripted here for
// determinism), bake-once: the roll is server-authoritative, zero durable state, and the composer stamp is
// returned. Notation parsing (`NdM+K`) + bounds. Member-gated (covered in the authority matrix).

import type { Db } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { freshDb } from "../../../../support/db";
import { expect, makeRpgService, principal, seedChat, test } from "../_support";

const BAD_NOTATION_RE = /notation/i;

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

async function seedGame(dice: number[]): Promise<{ chatId: import("@orb/kit/ids").ChatId; h: ReturnType<typeof makeRpgService> }> {
  const chatId = await seedChat(db, "a");
  const h = makeRpgService(db, { dice });
  h.fakes.membership.set("user_host", "host");
  await h.service.createGame({ principal: principal(castId<Handle>("host")), chatId, mode: "lite" });
  return { chatId, h };
}

describe("rollDice", () => {
  test("rolls NdM+K from the CSPRNG, applies the modifier, and returns a composer stamp", async () => {
    // randomInt(6) returns queue%6; queue [3,5] → faces 4 and 6, +2 modifier → total 12.
    const { chatId, h } = await seedGame([3, 5]);
    const result = await h.service.rollDice({ principal: principal(castId<Handle>("host")), chatId, notation: "2d6+2" });
    expect(result.rolls).toEqual([4, 6]);
    expect(result.modifier).toBe(2);
    expect(result.total).toBe(12);
    expect(result.stamp).toBe("[dice: 2d6+2 → 12]");
  });

  test("a bare dM notation defaults to one die", async () => {
    const { chatId, h } = await seedGame([9]);
    const result = await h.service.rollDice({ principal: principal(castId<Handle>("host")), chatId, notation: "d20" });
    expect(result.rolls).toEqual([10]);
    expect(result.total).toBe(10);
  });

  test("an unparseable notation is refused", async () => {
    const { chatId, h } = await seedGame([]);
    await expect(h.service.rollDice({ principal: principal(castId<Handle>("host")), chatId, notation: "banana" })).rejects.toThrow(BAD_NOTATION_RE);
  });
});
