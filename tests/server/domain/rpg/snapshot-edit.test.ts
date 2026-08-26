import type { RpgGameId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { serializeHandWrite } from "../../../../packages/server/src/domain/rpg/snapshot-edit.ts";
import { expect, test } from "../../../support/fixtures.ts";

const GAME_A = castId<RpgGameId>("rpg_game_hand_queue_a");
const GAME_B = castId<RpgGameId>("rpg_game_hand_queue_b");

describe("serializeHandWrite", () => {
  test("same-game work starts in admission order", async () => {
    const firstStarted = Promise.withResolvers<void>();
    const releaseFirst = Promise.withResolvers<void>();
    const order: string[] = [];
    const first = serializeHandWrite(GAME_A, async () => {
      order.push("first:start");
      firstStarted.resolve();
      await releaseFirst.promise;
      order.push("first:end");
    });
    await firstStarted.promise;

    const second = serializeHandWrite(GAME_A, () => {
      order.push("second:start");
      return Promise.resolve();
    });
    await Promise.resolve();
    expect(order).toEqual(["first:start"]);

    releaseFirst.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(["first:start", "first:end", "second:start"]);
  });

  test("a held game does not block another game", async () => {
    const firstStarted = Promise.withResolvers<void>();
    const releaseFirst = Promise.withResolvers<void>();
    const held = serializeHandWrite(GAME_A, async () => {
      firstStarted.resolve();
      await releaseFirst.promise;
      return "held";
    });
    await firstStarted.promise;

    await expect(serializeHandWrite(GAME_B, () => Promise.resolve("independent"))).resolves.toBe("independent");
    releaseFirst.resolve();
    await expect(held).resolves.toBe("held");
  });

  test("a rejected owner releases the next same-game waiter", async () => {
    const firstStarted = Promise.withResolvers<void>();
    const rejectFirst = Promise.withResolvers<void>();
    const failed = serializeHandWrite(GAME_A, async () => {
      firstStarted.resolve();
      await rejectFirst.promise;
      throw new Error("write failed");
    });
    await firstStarted.promise;
    const recovered = serializeHandWrite(GAME_A, () => Promise.resolve("recovered"));

    rejectFirst.resolve();
    await expect(failed).rejects.toThrow("write failed");
    await expect(recovered).resolves.toBe("recovered");
  });
});
