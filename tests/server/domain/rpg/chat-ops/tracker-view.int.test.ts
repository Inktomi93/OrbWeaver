// tests/server/domain/rpg/chat-ops/tracker-view — the SHARED tracker-view projection (rpg-design/05 §4.8), the
// one the `getTrackerView` verb AND the gather both read. A principal-free build over a resolved game: roster ∪
// sheets (a rosterless-sheet actor renders the default sheet), the resolved snapshot's volatile, `trackersReadOnly`
// passed through. The verb's member-gate + the swipe-consistency are covered by their own suites; this pins the
// projection is byte-shared (no drift between the panel and the steering injection).

import type { RpgActorEntry, RpgSheet, RpgTrackerDef, RpgTrackerValue } from "@orb/contracts/rpg";
import { rpgTrackerDefSchema } from "@orb/contracts/rpg";
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
  expect(view.actors[0]?.sheet).toEqual({ className: "", attributes: {}, flavor: "", level: null, trackerGrants: [], trackerRevokes: [] });
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

/** Seed one CHARACTER-actor game whose CONFIG defines trackers AND whose committed snapshot carries that
 *  actor's readings — the both-planes shape the retired pool max lived in (a def max on the sheet, a second
 *  max on the volatile row). Seeds a REAL character: the sheet FKs it, and its branded id is what the volatile
 *  actorRef + the roster both key on (a `cast` ref carries no sheet, so it can't exercise the carrier join). */
async function seedGameWithTrackers(
  db: Db,
  key: string,
  seed: { trackers: readonly RpgTrackerDef[]; values?: Record<string, RpgTrackerValue>; sheetOver?: Partial<RpgSheet> },
): Promise<{ game: RpgGameRow; ctx: RpgContext }> {
  const { trackers, values = {}, sheetOver = {} } = seed;
  const chatId = await seedChat(db, key);
  const gameId = await seedGame(db, chatId, key, { config: { ...liteConfig(), trackers: [...trackers] } });
  const ownerId = await seedUser(db, `owner_${key}`);
  // A REAL minted TypeID — the volatile actorRef's `characterId` is re-validated at snapshot-write, so a
  // fabricated `character_<key>` id would be silently dropped (the write asserts ok below).
  const characterId = await seedCharacter(db, ownerId, key, { id: mintTypeId(ID_PREFIX.character) });
  const sheet: RpgSheet = { className: "", attributes: {}, flavor: "", level: null, trackerGrants: [], trackerRevokes: [], ...sheetOver };
  await upsertSheet(db, { id: castId<RpgSheetId>(`rpg_sheet_${key}`), gameId, characterId, userId: null, sheet, now: FROZEN_AT });
  const volatile: RpgActorEntry = {
    actorRef: { kind: "character", characterId },
    volatile: { trackerValues: values, conditions: [], inventory: [], wallet: [], status: "" },
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

/** A tracker def with the axes a case cares about; everything else takes its schema default. */
function def(over: Partial<RpgTrackerDef> & Pick<RpgTrackerDef, "key" | "label" | "shape" | "write" | "subject">): RpgTrackerDef {
  return rpgTrackerDefSchema.parse(over);
}

test("the def's max is the DEFAULT ceiling; a carrier with no override reads it (owner amendment)", async () => {
  const db = await freshDb();
  const { game, ctx } = await seedGameWithTrackers(db, "maxhome", {
    trackers: [def({ key: "vitality", label: "Vitality", shape: "meter", write: "delta", subject: "actor", appliesTo: "party", max: 40, pinned: true })],
    values: { vitality: { value: 24, items: null, max: null } },
  });
  const view = await buildTrackerView(ctx, game, false);
  const actor = view.actors[0];
  expect(actor?.trackers.map((t) => [t.key, t.max])).toEqual([["vitality", 40]]);
  expect(actor?.volatile?.trackerValues["vitality"]).toEqual({ value: 24, items: null, max: null });
  // The BAND orb draws the effective ceiling — with no override that is the def's default.
  expect(view.trackerOrbs.map((o) => [o.key, o.value, o.max])).toEqual([["vitality", 24, 40]]);
});

test("a PER-CARRIER max override wins over the def default — everywhere the ceiling is read (band orb included)", async () => {
  const db = await freshDb();
  // Two characters may legitimately differ (the d20 max-HP reality): this carrier's Vitality tops out at 34
  // where the game default is 40. The stored override MEANS "deliberately different" (the anti-drift write
  // rule clears it when it equals the default), so every read follows it through the ONE resolver.
  const { game, ctx } = await seedGameWithTrackers(db, "maxoverride", {
    trackers: [def({ key: "vitality", label: "Vitality", shape: "meter", write: "delta", subject: "actor", appliesTo: "party", max: 40, pinned: true })],
    values: { vitality: { value: 24, items: null, max: 34 } },
  });
  const view = await buildTrackerView(ctx, game, false);
  // The DEF still carries the default (the Game tab edits that number) …
  expect(view.actors[0]?.trackers.map((t) => t.max)).toEqual([40]);
  // … and the carrier's own ceiling rides its value plane, which is what the orb arc describes.
  expect(view.actors[0]?.volatile?.trackerValues["vitality"]?.max).toBe(34);
  expect(view.trackerOrbs.map((o) => [o.key, o.value, o.max])).toEqual([["vitality", 24, 34]]);
});

test("carrier resolution decides what an actor's row SHOWS — class + grants − revokes, resolved server-side", async () => {
  const db = await freshDb();
  const trackers = [
    def({ key: "mana", label: "Mana", shape: "meter", write: "delta", subject: "actor", appliesTo: "party", max: 40 }),
    def({ key: "suspicion", label: "Suspicion", shape: "meter", write: "set", subject: "actor", appliesTo: "npcs", max: 10 }),
    def({ key: "bound_will", label: "Bound Will", shape: "meter", write: "delta", subject: "actor", appliesTo: "npcs", max: 3 }),
  ];
  // Kael is a PARTY actor: the party-class Mana, NOT the npc-class Suspicion — plus a GRANTED Bound Will and
  // an explicit REVOKE that beats the class.
  const { game, ctx } = await seedGameWithTrackers(db, "carriers", { trackers, sheetOver: { trackerGrants: ["bound_will"], trackerRevokes: [] } });
  const actor = (await buildTrackerView(ctx, game, false)).actors[0];
  expect(actor?.trackers.map((t) => t.key)).toEqual(["bound_will", "mana"]);
  expect(actor?.trackers.map((t) => t.key)).not.toContain("suspicion");
});

test("a REVOKE on the sheet beats the carrier class (the per-actor exception)", async () => {
  const db = await freshDb();
  const trackers = [def({ key: "mana", label: "Mana", shape: "meter", write: "delta", subject: "actor", appliesTo: "everyone", max: 40 })];
  const { game, ctx } = await seedGameWithTrackers(db, "revoke", { trackers, sheetOver: { trackerRevokes: ["mana"] } });
  expect((await buildTrackerView(ctx, game, false)).actors[0]?.trackers).toEqual([]);
});

test("the band renders the PINNED trackers with a numeric reading — never a def-order coincidence", async () => {
  const db = await freshDb();
  const trackers = [
    def({ key: "mana", label: "Mana", shape: "meter", write: "delta", subject: "actor", appliesTo: "party", max: 40, sort: 0 }),
    def({ key: "focus", label: "Focus", shape: "meter", write: "delta", subject: "actor", appliesTo: "party", max: 20, sort: 1, pinned: true }),
    def({ key: "unset", label: "Unset", shape: "meter", write: "delta", subject: "actor", appliesTo: "party", max: 5, sort: 2, pinned: true }),
  ];
  const { game, ctx } = await seedGameWithTrackers(db, "band", {
    trackers,
    values: { mana: { value: 28, items: null, max: null }, focus: { value: 12, items: null, max: null } },
  });
  const orbs = (await buildTrackerView(ctx, game, false)).trackerOrbs;
  // Only the PINNED-and-readable one: `mana` is unpinned (the retired auto-first-3 rule would have shown it),
  // and the pinned-but-unset `unset` has nothing honest to draw.
  expect(orbs).toEqual([{ key: "focus", label: "Focus", value: 12, max: 20, color: null }]);
});

// A cast NPC's volatile plane lives on the SAME per-actor rows a roster member's does (`cast:<key>`), and
// `RpgPresentCharacter` has no volatile plane at all — so until the view projected it, everything a beat wrote
// onto an NPC (hp/status/conditions/inventory/wallet) reached NO reader, and the steering reminder could not
// state the affliction, the wound or the purse the tool round had just given that NPC. The WHOLE row is
// projected, never a slice: a slice is how the gap came back after the conditions half was fixed.
test("a scene-cast member is an ORDINARY actor row in the view — identity, presence, volatile, trackers (R2)", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, "castcond");
  const gameId = await seedGame(db, chatId, "castcond");
  const ctx = makeRpgService(db, { roster: [] }).ctx;
  const { variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
  const written = await writeStagedSnapshot(
    db,
    {
      ...emptyState(),
      presentCharacters: ["cast:mari", "cast:bran"],
      actorState: [
        {
          actorRef: { kind: "cast", castKey: "mari" },
          identity: { name: "Mari", emoji: "", mood: "", relationship: { kind: "neutral", label: "" } },
          volatile: {
            trackerValues: {},
            conditions: [{ name: "poisoned", stat: null, modifier: 0, turnsLeft: null }],
            inventory: [{ id: "i1", name: "dagger", description: "", quantity: 1, location: "", type: "" }],
            wallet: [{ name: "gold", amount: 12 }],
            status: "favouring one leg",
          },
        },
        // A tracked cast actor who is NOT on the presence list — the OFFSTAGE row, which no projection
        // carried before R2 (her state was retained and unreadable, and no gesture could remove her).
        {
          actorRef: { kind: "cast", castKey: "vesna" },
          identity: { name: "Sister Vesna", emoji: "", mood: "guarded", relationship: { kind: "enemy", label: "" } },
          volatile: { trackerValues: {}, conditions: [], inventory: [], wallet: [], status: "" },
        },
      ],
    },
    target({ gameId, chatId, seq: 1, variantId, key: "castcond" }),
  );
  if (!written.ok) {
    throw new Error(`snapshot write dropped: ${written.reason}`);
  }
  const game = await findGameByChat(db, chatId);
  if (game === undefined) {
    throw new Error("game not found");
  }
  const view = await buildTrackerView(ctx, game, false);
  // ONE list, one shape: the cast NPC is an `RpgActorView` beside the roster, not a bolted-on projection.
  const mari = view.actors.find((a) => a.name === "Mari");
  expect(mari?.presence).toBe(true);
  expect(mari?.volatile?.conditions.map((c) => c.name)).toEqual(["poisoned"]);
  expect(mari?.volatile?.status).toBe("favouring one leg");
  expect(mari?.volatile?.inventory.map((i) => i.name)).toEqual(["dagger"]);
  expect(mari?.volatile?.wallet).toEqual([{ name: "gold", amount: 12 }]);
  // Her carrier CLASS derives from `actorRef.kind` — a partition of people, not of rows (the §1.4 fix).
  expect(mari?.actorRef.kind).toBe("cast");

  // THE OFFSTAGE ROW is projected too, with everything on it — that visibility IS the R2 deliverable.
  const vesna = view.actors.find((a) => a.name === "Sister Vesna");
  expect(vesna?.presence).toBe(false);
  expect(vesna?.identity?.relationship).toEqual({ kind: "enemy", label: "" });

  // The presence ECHO is derived from the same rows (a presence key with no actor row is simply not an actor).
  expect(view.cast).toEqual(["cast:mari", "cast:bran"]);
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
