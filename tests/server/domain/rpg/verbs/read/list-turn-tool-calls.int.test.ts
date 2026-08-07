// verbs/read/list-turn-tool-calls — the recorded-turn window (TOOLCALLS-INVISIBLE, arm A). `.int`: the
// authority is a real membership resolve through the real FK chain, which is the only thing between a
// stranger and another room's game.
//
// THE GATE THAT MATTERS HERE IS THE ONE THAT IS *NOT* HOST-ONLY. Every sibling host-gated read on this domain
// (`getConfigView`, `revealHidden`) exists to keep something from a member; this one deliberately does not —
// a tool call is the mechanical record of a turn everyone at the table watched. So the cross-tenant belt
// carries the whole load, and these pin both halves: a MEMBER sees it, a STRANGER gets leak-free NOT_FOUND.

import type { Db } from "@orb/db";
import type { Handle, RpgTurnToolCallsId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { recordTurnToolCalls } from "../../../../../../packages/server/src/domain/rpg/persistence/turn-tool-calls.ts";
import { freshDb } from "../../../../../support/db.ts";
import { expect, FROZEN_AT, principal, seedLiteGame, seedMessage, test } from "../../_support.ts";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

const HOST = principal(castId<Handle>("host"));
const STRANGER = principal(castId<Handle>("stranger"));

describe("listTurnToolCalls", () => {
  test("a MEMBER reads the room's recorded turns, keyed to the producing variant", async () => {
    const { chatId, gameId, h } = await seedLiteGame(db);
    const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
    await recordTurnToolCalls(db, {
      id: castId<RpgTurnToolCallsId>("rpg_turn_tool_calls_a"),
      gameId,
      messageId,
      variantId,
      calls: [{ name: "update_scene", args: '{"location":"the ford"}', verdict: "applied", issues: [] }],
      createdAt: FROZEN_AT,
    });

    const rows = await h.service.listTurnToolCalls({ principal: HOST, chatId });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.variantId).toBe(variantId);
    expect(rows[0]?.messageId).toBe(messageId);
    expect(rows[0]?.calls[0]?.name).toBe("update_scene");
  });

  test("a STRANGER is refused — leak-free, indistinguishable from a chat with no game", async () => {
    const { chatId, h } = await seedLiteGame(db);
    await expect(h.service.listTurnToolCalls({ principal: STRANGER, chatId })).rejects.toThrow();
  });

  test("a game with no recorded turns answers EMPTY, never an error", async () => {
    const { chatId, h } = await seedLiteGame(db);
    expect(await h.service.listTurnToolCalls({ principal: HOST, chatId })).toEqual([]);
  });
});
