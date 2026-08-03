// verbs/checkpoint/create-checkpoint — createCheckpoint (rpg-design/05 §4.4, §6.2). Labels the current
// resolved snapshot; the row is asserted at persistence (assert-the-mutation-fired).

import type { Db } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { listCheckpoints } from "../../../../../../packages/server/src/domain/rpg/persistence/checkpoints";
import { freshDb } from "../../../../../support/db";
import { expect, principal, seedLiteGame, test } from "../../_support";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

describe("createCheckpoint", () => {
  test("labels the current snapshot — the checkpoint row lands pointing at the head", async () => {
    const { chatId, gameId, h } = await seedLiteGame(db);
    // Establish a snapshot (a hand edit mints the first one).
    await h.service.editSnapshot({ principal: principal(castId<Handle>("host")), chatId, patch: { location: "The Ruins" } });

    const checkpointId = await h.service.createCheckpoint({ principal: principal(castId<Handle>("host")), chatId, label: "before the fight" });

    const rows = await listCheckpoints(db, gameId);
    expect(rows.map((c) => c.label)).toEqual(["before the fight"]);
    expect(rows[0]?.id).toBe(checkpointId);
    expect(rows[0]?.trigger).toBe("manual");
  });
});
