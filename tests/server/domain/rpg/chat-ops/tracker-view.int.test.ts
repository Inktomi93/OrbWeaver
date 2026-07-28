// tests/server/domain/rpg/chat-ops/tracker-view — the SHARED tracker-view projection (rpg-design/05 §4.8), the
// one the `getTrackerView` verb AND the gather both read. A principal-free build over a resolved game: roster ∪
// sheets (a rosterless-sheet actor renders the default sheet), the resolved snapshot's volatile, `trackersReadOnly`
// passed through. The verb's member-gate + the swipe-consistency are covered by their own suites; this pins the
// projection is byte-shared (no drift between the panel and the steering injection).

import type { RpgActorVolatile, RpgSheet } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import type { ChatTurnId, RpgSheetId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { buildTrackerView } from "../../../../../packages/server/src/domain/rpg/chat-ops/tracker-view";
import type { RpgContext, RpgGameRow } from "../../../../../packages/server/src/domain/rpg/contract/service";
import { findGameByChat, updateGame } from "../../../../../packages/server/src/domain/rpg/persistence/games";
import { upsertSheet } from "../../../../../packages/server/src/domain/rpg/persistence/sheets";
import { writeStagedSnapshot } from "../../../../../packages/server/src/domain/rpg/persistence/snapshots";
import { createRpgStagingStore } from "../../../../../packages/server/src/domain/rpg/staging";
import { freshDb } from "../../../../support/db";
import {
  emptyState,
  expect,
  FROZEN_AT,
  liteConfig,
  makeRpgService,
  rosterCharacter,
  seedCharacter,
  seedChat,
  seedGame,
  seedLiteGame,
  seedMessage,
  seedUser,
  target,
  test,
} from "../_support";

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

/** Seed one CHARACTER-actor game with a sheet (poolDefs) AND a committed snapshot carrying that actor's
 *  volatile pools — the exact both-planes shape the pool-max drift lived in. Seeds a REAL character (the
 *  sheet FKs it, and its branded id is what the volatile actorRef + roster both key on — a `cast` ref would
 *  carry no sheet, so it can't exercise the sheet↔volatile pool-max join). Returns game + ctx. */
async function seedGameWithSheetAndPools(
  db: Db,
  key: string,
  poolDefs: RpgSheet["poolDefs"],
  pools: RpgActorVolatile["pools"],
): Promise<{ game: RpgGameRow; ctx: RpgContext }> {
  const chatId = await seedChat(db, key);
  const gameId = await seedGame(db, chatId, key);
  const ownerId = await seedUser(db, `owner_${key}`);
  // A REAL minted TypeID — the volatile actorRef's `characterId` is re-validated at snapshot-write, so a
  // fabricated `character_<key>` id would be silently dropped (the write asserts ok below).
  const characterId = await seedCharacter(db, ownerId, key, { id: mintTypeId(ID_PREFIX.character) });
  const sheet: RpgSheet = { className: "", attributes: {}, poolDefs, maxHp: null, flavor: "", level: null };
  await upsertSheet(db, { id: castId<RpgSheetId>(`rpg_sheet_${key}`), gameId, characterId, userId: null, sheet, now: FROZEN_AT });
  const volatile: RpgActorVolatile = {
    actorRef: { kind: "character", characterId },
    hp: null,
    pools,
    conditions: [],
    inventory: [],
    wallet: [],
    status: "",
  };
  const { variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
  // The snapshot write RE-VALIDATES the volatile (`rpgActorRefSchema` checks `characterId` is a real TypeID);
  // assert it landed so a silent drop (an invalid ref) can't mask the join as "no volatile".
  const written = await writeStagedSnapshot(db, { ...emptyState(), actorState: [volatile] }, target({ gameId, chatId, seq: 1, variantId, key }));
  if (!written.ok) {
    throw new Error(`snapshot write dropped: ${written.reason}`);
  }
  const game = await findGameByChat(db, chatId);
  if (game === undefined) {
    throw new Error("game not found");
  }
  // The roster fake carries the SAME real character id (its ref keys the volatile the projection joins).
  const roster = [{ actorRef: { kind: "character" as const, characterId }, name: "Kael" }];
  return { game, ctx: makeRpgService(db, { roster }).ctx };
}

test("pool MAX has ONE home — the displayed max resolves from sheet.poolDefs, NOT the volatile's stored max (both-directions no-drift)", async () => {
  const db = await freshDb();
  // The DRIFT shape: the Sheet def says Vitality max 40, but the volatile pool still carries a stale max 30
  // (e.g. a Sheet max-edit that never touched the volatile). The projection must show 40 on BOTH the Status
  // meter and the Sheet read — the def is the single source, so the two tabs can never disagree.
  const { game, ctx } = await seedGameWithSheetAndPools(
    db,
    "maxhome",
    [{ name: "Vitality", max: 40, color: null, hint: "" }],
    [{ name: "Vitality", value: 24, max: 30 }], // stale volatile max — the def overrides it
  );

  const view = await buildTrackerView(ctx, game, false);
  const actor = view.actors[0];
  expect(view.actors).toHaveLength(1);
  // Sheet read (what the Sheet tab renders): the def max.
  expect(actor?.sheet.poolDefs).toEqual([{ name: "Vitality", max: 40, color: null, hint: "" }]);
  // Status read (what the Status meter renders): the SAME 40, resolved from the def — never the stale 30.
  expect(actor?.volatile?.pools).toEqual([{ name: "Vitality", value: 24, max: 40 }]);
});

test("pool max: a def max LOWERED below the volatile value drags the displayed value down (§12.3 tell, read-side)", async () => {
  const db = await freshDb();
  // The Sheet lowered Vitality's def max to 20 while the volatile still holds value 24 — the projection
  // clamps the displayed value to the def max (so a Status max-edit routed to patchSheet lands honestly even
  // if the volatile value write is missed), never a value-over-max overflow from a hand-lowered def.
  const { game, ctx } = await seedGameWithSheetAndPools(
    db,
    "drag",
    [{ name: "Vitality", max: 20, color: null, hint: "" }],
    [{ name: "Vitality", value: 24, max: 30 }],
  );
  const actor = (await buildTrackerView(ctx, game, false)).actors[0];
  expect(actor?.volatile?.pools).toEqual([{ name: "Vitality", value: 20, max: 20 }]);
});

test("pool max: an ORPHAN volatile pool (no matching def) keeps its own max — no phantom clamp to a def that doesn't exist", async () => {
  const db = await freshDb();
  // A model-minted pool the host never defined (or a since-deleted def): the def map has no entry, so the
  // volatile keeps its own max/value — honest, never clamped to a nonexistent def.
  const { game, ctx } = await seedGameWithSheetAndPools(db, "orphan", [], [{ name: "Fervor", value: 5, max: 8 }]);
  const actor = (await buildTrackerView(ctx, game, false)).actors[0];
  expect(actor?.volatile?.pools).toEqual([{ name: "Fervor", value: 5, max: 8 }]);
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
