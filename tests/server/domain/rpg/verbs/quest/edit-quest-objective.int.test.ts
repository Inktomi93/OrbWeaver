import type { Db } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { resolveSnapshotForTurn } from "../../../../../../packages/server/src/domain/rpg/persistence/snapshots.ts";
import { freshDb } from "../../../../../support/db.ts";
import { expect, principal, seedLiteGame, test } from "../../_support.ts";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

describe("editQuestObjective", () => {
  test("independent objective operations derive from the current head and preserve each other's changes", async () => {
    const { chatId, gameId, h } = await seedLiteGame(db);
    const host = principal(castId<Handle>("host"));
    const questId = await h.service.upsertQuest({
      principal: host,
      chatId,
      name: "Open the vault",
      objectives: [
        { text: "Find the key" },
        { text: "Reach the door" },
      ],
    });
    const initial = await resolveSnapshotForTurn(db, { id: gameId, chatId });
    const initialQuest = initial?.quests?.[0];
    if (initialQuest === undefined) {
      throw new Error("seeded quest was not resolved");
    }
    const first = initialQuest.objectives[0]?.id;
    const second = initialQuest.objectives[1]?.id;
    if (first === undefined || second === undefined) {
      throw new Error("seeded objectives were not resolved");
    }

    await h.service.editQuestObjective({ principal: host, chatId, questId, op: { kind: "setCompleted", objectiveId: first, completed: true } });
    await h.service.editQuestObjective({ principal: host, chatId, questId, op: { kind: "delete", objectiveId: second } });
    await h.service.editQuestObjective({ principal: host, chatId, questId, op: { kind: "add", text: "Turn the wheel" } });

    const quest = (await resolveSnapshotForTurn(db, { id: gameId, chatId }))?.quests?.[0];
    expect(quest?.objectives.map((objective) => ({ text: objective.text, completed: objective.completed }))).toEqual([
      { text: "Find the key", completed: true },
      { text: "Turn the wheel", completed: false },
    ]);
  });
});
