// persistence/turn-tool-calls — the per-variant record of what a folded turn CALLED (TOOLCALLS-INVISIBLE,
// arm A). `.int`: real FK, so the CASCADE and the UNIQUE are the DB's claims, not this file's.
//
// The three properties the surface above it rests on:
//   • ONE record per variant, and a re-flush REPLACES rather than throwing (a turn's description is not a
//     log — the newest description of it wins, and an observability row must never fail a turn);
//   • the record dies with its variant (CASCADE) — a record whose swipe is gone is unreachable forever, so
//     keeping it is a leak, exactly the `rpg_journal` model-entry ruling one plane over;
//   • two variants of ONE slot keep SEPARATE records — the swipe-correctness the whole keying exists for.

import type { RpgRecordedToolCall, RpgToolCallVerdict } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import { messageVariants } from "@orb/db";
import type { RpgTurnToolCallsId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import {
  findTurnToolCallsByVariant,
  listTurnToolCalls,
  recordTurnToolCalls,
} from "../../../../../packages/server/src/domain/rpg/persistence/turn-tool-calls.ts";
import { freshDb } from "../../../../support/db.ts";
import { addVariant, expect, FROZEN_AT, seedChat, seedGame, seedMessage, test } from "../_support.ts";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

/** One recorded call set, in the shape `recordToolCalls` produces. The verdict DERIVES from the homed tuple
 *  (§5.5) rather than re-spelling it, so a widened axis reaches this fixture through `tsc`. */
function callsFor(name: string, verdict: RpgToolCallVerdict): readonly RpgRecordedToolCall[] {
  return [{ name, args: '{"location":"the ford"}', verdict, issues: verdict === "applied" ? [] : [`${name}.weather`] }];
}

describe("recordTurnToolCalls", () => {
  test("two variants of ONE slot keep SEPARATE records (the swipe-correctness the keying exists for)", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const { messageId, variantId: variantA } = await seedMessage(db, chatId, 1, { role: "assistant" });
    const variantB = await addVariant(db, messageId, 1, "swipe B body");

    await recordTurnToolCalls(db, {
      id: castId<RpgTurnToolCallsId>("rpg_turn_tool_calls_a"),
      gameId,
      messageId,
      variantId: variantA,
      calls: callsFor("update_scene", "applied"),
      createdAt: FROZEN_AT,
    });
    await recordTurnToolCalls(db, {
      id: castId<RpgTurnToolCallsId>("rpg_turn_tool_calls_b"),
      gameId,
      messageId,
      variantId: variantB,
      calls: callsFor("update_party", "dropped"),
      createdAt: FROZEN_AT + 1,
    });

    expect((await findTurnToolCallsByVariant(db, variantA))[0]?.calls[0]?.name).toBe("update_scene");
    expect((await findTurnToolCallsByVariant(db, variantB))[0]?.calls[0]?.verdict).toBe("dropped");
    // Both live in the game's window — the client indexes by variant and the ROW picks its own.
    expect(await listTurnToolCalls(db, gameId, { limit: 50 })).toHaveLength(2);
  });

  test("a RE-FLUSH of the same variant REPLACES its record rather than throwing on the unique index", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
    const id = castId<RpgTurnToolCallsId>("rpg_turn_tool_calls_a");

    await recordTurnToolCalls(db, { id, gameId, messageId, variantId, calls: callsFor("update_scene", "dropped"), createdAt: FROZEN_AT });
    await recordTurnToolCalls(db, {
      id: castId<RpgTurnToolCallsId>("rpg_turn_tool_calls_a2"),
      gameId,
      messageId,
      variantId,
      calls: callsFor("update_scene", "applied"),
      createdAt: FROZEN_AT + 5,
    });

    const rows = await findTurnToolCallsByVariant(db, variantId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.calls[0]?.verdict).toBe("applied");
  });

  test("the record dies with its VARIANT (CASCADE) — a dead swipe leaves no unreachable row", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
    const variantB = await addVariant(db, messageId, 1, "swipe B body");
    await recordTurnToolCalls(db, {
      id: castId<RpgTurnToolCallsId>("rpg_turn_tool_calls_b"),
      gameId,
      messageId,
      variantId: variantB,
      calls: callsFor("update_scene", "applied"),
      createdAt: FROZEN_AT,
    });

    await db.delete(messageVariants).where(eq(messageVariants.id, variantB));

    expect(await findTurnToolCallsByVariant(db, variantB)).toEqual([]);
    // The surviving variant's record is untouched — the delete was scoped to the dead swipe.
    expect(await listTurnToolCalls(db, gameId, { limit: 50 })).toHaveLength(0);
    expect(variantId).not.toBe(variantB);
  });

  test("the window is newest-first and bounded by `limit`", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    // Seeded in PARALLEL on purpose: each row carries its own `createdAt`, so the ordering under test is the
    // query's, not the insert sequence's — a serial loop would let insert order mask a missing ORDER BY.
    const seeded = await Promise.all(
      [1, 2, 3].map(async (seq) => {
        const { messageId, variantId } = await seedMessage(db, chatId, seq, { role: "assistant" });
        await recordTurnToolCalls(db, {
          id: castId<RpgTurnToolCallsId>(`rpg_turn_tool_calls_${seq}`),
          gameId,
          messageId,
          variantId,
          calls: callsFor("update_scene", "applied"),
          createdAt: FROZEN_AT + seq,
        });
        return variantId;
      }),
    );

    const window = await listTurnToolCalls(db, gameId, { limit: 2 });
    expect(window.map((r) => r.variantId)).toEqual([seeded[2], seeded[1]]);
  });
});
