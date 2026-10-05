// verbs/dice — rollDice (docs/plans/rpg/design.md). Server CSPRNG (injected `randomInt`, scripted here for
// determinism), bake-once: the roll is server-authoritative, zero durable state, and the composer stamp is
// returned. Notation parsing (`NdM+K`) + bounds. Member-gated (covered in the authority matrix).

import type { Db } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, makeRpgService, participantUser, principal, seedChat, seedLiteGame, seedUser, test } from "../_support.ts";

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

describe("ability checks", () => {
  test("uses the caller's persisted score and the game's modifier, without changing the sheet", async () => {
    const host = principal(castId<Handle>("host"));
    const userId = await seedUser(db, castId<Handle>("host"));
    const { chatId, h } = await seedLiteGame(db, { participants: [participantUser(castId<Handle>("host"), "Host")] });
    await h.service.updateConfig({ principal: host, chatId, patch: { ruleset: "d20" } });
    await h.service.patchSheet({ principal: host, chatId, actorRef: { kind: "user", userId }, patch: { attributes: { str: 15, dex: 7 } } });
    const before = await h.service.getTrackerView({ principal: host, chatId });
    const result = await h.service.rollDice({ principal: host, chatId, notation: "d20", ...{ ability: "str" } });
    expect(result.modifier).toBe(2);
    expect(result.total).toBe((result.rolls[0] ?? 0) + 2);
    expect(result.stamp).toBe(`[dice: Strength d20+2 → ${result.total}]`);
    const negative = await h.service.rollDice({ principal: host, chatId, notation: "d20", ...{ ability: "dex" } });
    expect(negative.modifier).toBe(-2);
    expect(negative.stamp).toBe(`[dice: Dexterity d20-2 → ${negative.total}]`);
    expect(await h.service.getTrackerView({ principal: host, chatId })).toEqual(before);
  });

  test("refuses an unset or unknown ability and a non-d20 notation", async () => {
    const { chatId, h } = await seedGame([]);
    const host = principal(castId<Handle>("host"));
    await h.service.updateConfig({ principal: host, chatId, patch: { ruleset: "d20" } });
    await expect(h.service.rollDice({ principal: host, chatId, notation: "d20", ...{ ability: "str" } })).rejects.toThrow(/set.*score/i);
    await expect(h.service.rollDice({ principal: host, chatId, notation: "d20", ...{ ability: "absent" } })).rejects.toThrow(/not in the profile/i);
    await expect(h.service.rollDice({ principal: host, chatId, notation: "d6", ...{ ability: "str" } })).rejects.toThrow(/d20/i);
  });
});

test("an ability check reads a member's own score and refuses nonmembers before consuming dice", async () => {
  const hostId = await seedUser(db, castId<Handle>("host"));
  const memberId = await seedUser(db, castId<Handle>("member"));
  const { chatId, h } = await seedLiteGame(db, {
    dice: [9, 9],
    participants: [participantUser(castId<Handle>("host"), "Host"), participantUser(castId<Handle>("member"), "Member")],
  });
  h.fakes.membership.set("user_member", "member");
  const host = principal(castId<Handle>("host"));
  const member = principal(castId<Handle>("member"));
  await h.service.updateConfig({ principal: host, chatId, patch: { ruleset: "d20" } });
  await h.service.patchSheet({ principal: host, chatId, actorRef: { kind: "user", userId: hostId }, patch: { attributes: { str: 20 } } });
  await h.service.patchSheet({ principal: member, chatId, actorRef: { kind: "user", userId: memberId }, patch: { attributes: { str: 8 } } });
  const result = await h.service.rollDice({ principal: member, chatId, notation: "d20", ability: "str" });
  expect(result).toMatchObject({ rolls: [10], modifier: -1, total: 9, stamp: "[dice: Strength d20-1 → 9]" });
  await expect(h.service.rollDice({ principal: principal(castId<Handle>("outsider")), chatId, notation: "d20", ability: "str" })).rejects.toBeInstanceOf(
    DomainNotFoundError,
  );
  expect(h.fakes.dice).toEqual([9]);
});
