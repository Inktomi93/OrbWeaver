// tests/server/domain/rpg/chat-ops/tracker-view — the SHARED tracker-view projection (rpg-design/05 §4.8), the
// one the `getTrackerView` verb AND the gather both read. A principal-free build over a resolved game: roster ∪
// sheets (a rosterless-sheet actor renders the default sheet), the resolved snapshot's volatile, `trackersReadOnly`
// passed through. The verb's member-gate + the swipe-consistency are covered by their own suites; this pins the
// projection is byte-shared (no drift between the panel and the steering injection).

import { buildTrackerView } from "../../../../../packages/server/src/domain/rpg/chat-ops/tracker-view";
import { findGameByChat } from "../../../../../packages/server/src/domain/rpg/persistence/games";
import { freshDb } from "../../../../support/db";
import { expect, rosterCharacter, seedLiteGame, test } from "../_support";

test("projects roster ∪ sheets — a roster actor with no sheet row renders the default sheet", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db, { roster: [rosterCharacter("kael", "Kael")] });
  const game = await findGameByChat(db, chatId);
  expect(game).not.toBeUndefined();
  if (game === undefined) {
    return;
  }
  const view = await buildTrackerView(h.ctx, game, false);
  expect(view.actors).toHaveLength(1);
  expect(view.actors[0]?.name).toBe("Kael");
  expect(view.actors[0]?.sheet).toEqual({ className: "", attributes: {}, poolDefs: [], maxHp: null });
  expect(view.actors[0]?.volatile).toBeNull(); // no snapshot yet — turnless game
});

test("trackersReadOnly is passed through (the caller resolves it, the projection carries it)", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db);
  const game = await findGameByChat(db, chatId);
  if (game === undefined) {
    throw new Error("game not found");
  }
  expect((await buildTrackerView(h.ctx, game, true)).trackersReadOnly).toBe(true);
  expect((await buildTrackerView(h.ctx, game, false)).trackersReadOnly).toBe(false);
});
