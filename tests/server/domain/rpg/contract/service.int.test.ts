// contract/service — snapshotRowToState: the parsed-row → composed-state projection. Pins the P5 clone-forward
// claim (the header's load-bearing note): a forwarded snapshot's `quests`/`plot`/`actorState`/`recentEvents`
// arrays and `trackerValues` object are COPIES of the row's parsed values, never a shared reference — and
// nullable-array columns collapse a null (an empty-born row) to `[]` so the projected state is total.

import { describe } from "vitest";
import { snapshotRowToState } from "../../../../../packages/server/src/domain/rpg/contract/service.ts";
import { insertSnapshot } from "../../../../../packages/server/src/domain/rpg/persistence/snapshots.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { emptyState, seedChat, seedGame, seedMessage, target } from "../_support.ts";

describe("snapshotRowToState", () => {
  test("nullable-array columns (never populated) collapse to [] — the projected state is total", async () => {
    const db = await freshDb();
    const chatId = await seedChat(db, "proj1");
    const gameId = await seedGame(db, chatId, "proj1");
    const { variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
    const row = await insertSnapshot(db, {
      ...target({ gameId, chatId, seq: 1, variantId, key: "b1" }),
      ...emptyState(),
      committed: 1,
    });

    const state = snapshotRowToState(row);

    expect(state).toMatchObject({ presentCharacters: [], recentEvents: [], actorState: [], quests: [], trackerValues: {}, plot: null });
  });

  test("plot's acts array clone-forwards by COPY — mutating the projected state never touches the row's own parsed object", async () => {
    const db = await freshDb();
    const chatId = await seedChat(db, "proj2");
    const gameId = await seedGame(db, chatId, "proj2");
    const { variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
    const row = await insertSnapshot(db, {
      ...target({ gameId, chatId, seq: 1, variantId, key: "b2" }),
      ...emptyState(),
      plot: { act: 1, title: "Rising Tide", acts: [{ title: "Act One", summary: "" }] },
      committed: 1,
    });

    const state = snapshotRowToState(row);
    expect(state.plot).not.toBeNull();
    expect(state.plot).not.toBe(row.plot);
    expect(state.plot?.acts).not.toBe(row.plot?.acts);
    const plot = state.plot;
    if (plot === null) {
      throw new Error("snapshot projection lost the seeded plot");
    }
    const firstAct = plot.acts[0];
    if (firstAct === undefined) {
      throw new Error("snapshot projection lost the seeded first act");
    }
    firstAct.title = "mutated";
    expect(row.plot?.acts[0]?.title).toBe("Act One");
  });
});
