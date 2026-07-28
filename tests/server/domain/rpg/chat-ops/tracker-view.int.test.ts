// tests/server/domain/rpg/chat-ops/tracker-view — the SHARED tracker-view projection (rpg-design/05 §4.8), the
// one the `getTrackerView` verb AND the gather both read. A principal-free build over a resolved game: roster ∪
// sheets (a rosterless-sheet actor renders the default sheet), the resolved snapshot's volatile, `trackersReadOnly`
// passed through. The verb's member-gate + the swipe-consistency are covered by their own suites; this pins the
// projection is byte-shared (no drift between the panel and the steering injection).

import type { Db } from "@orb/db";
import type { ChatTurnId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { buildTrackerView } from "../../../../../packages/server/src/domain/rpg/chat-ops/tracker-view";
import type { RpgContext, RpgGameRow } from "../../../../../packages/server/src/domain/rpg/contract/service";
import { findGameByChat, updateGame } from "../../../../../packages/server/src/domain/rpg/persistence/games";
import { writeStagedSnapshot } from "../../../../../packages/server/src/domain/rpg/persistence/snapshots";
import { createRpgStagingStore } from "../../../../../packages/server/src/domain/rpg/staging";
import { freshDb } from "../../../../support/db";
import { emptyState, expect, liteConfig, makeRpgService, rosterCharacter, seedChat, seedGame, seedLiteGame, seedMessage, target, test } from "../_support";

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
  expect(view.actors[0]?.sheet).toEqual({ className: "", attributes: {}, poolDefs: [], maxHp: null, level: null });
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

/** Write a committed snapshot with `beats` recentEvents on a fresh selected variant + cap the config's
 *  recentBeatsKeepLast; return the parsed game + a real ctx (harness fakes) so buildTrackerView reads the
 *  capped slice. */
async function seedGameWithBeats(db: Db, key: string, beats: readonly string[], keepLast: number): Promise<{ game: RpgGameRow; ctx: RpgContext }> {
  const chatId = await seedChat(db, key);
  const gameId = await seedGame(db, chatId, key);
  const base = liteConfig();
  await updateGame(db, gameId, { config: { ...base, features: { ...base.features, recentBeatsKeepLast: keepLast } } });
  const { variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
  const store = createRpgStagingStore();
  const turn = castId<ChatTurnId>(`chat_turn_${key}`);
  store.ensure(turn, emptyState());
  store.stage(turn, { recentEvents: [...beats] });
  const flush = store.take(turn);
  if (!flush) {
    throw new Error("no flush");
  }
  await writeStagedSnapshot(db, flush.state, target({ gameId, chatId, seq: 1, variantId, key }));
  const game = await findGameByChat(db, chatId);
  if (game === undefined) {
    throw new Error("game not found");
  }
  return { game, ctx: makeRpgService(db, { roster: [] }).ctx };
}

test("recentBeats is SLICED to config.features.recentBeatsKeepLast (P3 fold — the durable log stays append-only)", async () => {
  const db = await freshDb();
  const twelveBeats = Array.from({ length: 12 }, (_, i) => `beat ${i + 1}`);
  const { game, ctx } = await seedGameWithBeats(db, "beats", twelveBeats, 3);
  const view = await buildTrackerView(ctx, game, false);
  // The reminder slice is the LAST 3 beats (append order preserved); the earlier 9 are dropped from the view.
  expect(view.recentBeats).toEqual(["beat 10", "beat 11", "beat 12"]);
});

test("recentBeatsKeepLast=0 drops the Recent-beats block entirely (durable log untouched)", async () => {
  const db = await freshDb();
  const { game, ctx } = await seedGameWithBeats(db, "nobeats", ["beat 1", "beat 2"], 0);
  expect((await buildTrackerView(ctx, game, false)).recentBeats).toEqual([]);
});

test("P5: the plot plane rides the tracker view from the resolved snapshot (null for a turnless game)", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, "plotv");
  const gameId = await seedGame(db, chatId, "plotv");
  const ctx = makeRpgService(db, { roster: [] }).ctx;
  let game = await findGameByChat(db, chatId);
  if (game === undefined) {
    throw new Error("game not found");
  }
  // Turnless game — the synthesized default carries no plot (the act rail renders nothing).
  expect((await buildTrackerView(ctx, game, false)).plot).toBeNull();
  // A staged snapshot carrying a plot surfaces it on the view (the act rail's datum).
  const { variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
  const plot = { act: 1, title: "The Bone Key", acts: [{ title: "Arrival", summary: "" }] };
  await writeStagedSnapshot(db, { ...emptyState(), plot }, target({ gameId, chatId, seq: 1, variantId, key: "plotv" }));
  game = await findGameByChat(db, chatId);
  if (game === undefined) {
    throw new Error("game not found");
  }
  expect((await buildTrackerView(ctx, game, false)).plot).toEqual(plot);
});
