// tests/server/domain/rpg/stale-actor-key — WHAT A SNAPSHOT WRITTEN UNDER THE OLD ACTOR-KEY SPELLING DOES
// TO A GAME AFTER #906 RENAMED IT. A cross-plane property suite: the behaviour spans
// `persistence/snapshots.ts` (parse-on-read), `chat-ops/tracker-view.ts` (the presence projection) and
// `contracts/rpg/snapshot.ts`'s lock-path derivation — no single source mirrors it, so it is a
// `.suite.int.test.ts` (the `hand-edit-vs-flush` precedent).
//
// WHY IT EXISTS. #906 renamed the scene-only extra's actor-ref arm from `{kind:"cast", castKey}` to
// `{kind:"npc", npcKey}`, which moves `actorRefKey`'s projection from `cast:<slug>` to `npc:<slug>`. That
// string is not a type — it is DATA, persisted in three `rpg_snapshots` JSON columns, and a JSON *value*
// change trips NO db-schema auto-reset (`.claude/rules/db-schema.md` keys off the drizzle schema hash, and
// no column moved). So every snapshot written before the rename keeps the old spelling, and the three planes
// fail in three DIFFERENT ways — one loud, two silent. The owner ruled the remedy is a dev-db WIPE, not a
// one-shot migration (#906: "does that involve nuking the db? if so idgaf"); these pins are the receipt for
// WHAT the wipe is buying, so a future reader who finds a pre-#906 database does not have to re-derive it.
//
// EVERY STALE SHAPE HERE IS WRITTEN AS RAW JSON through a `db.update`, never through a typed literal: the old
// spelling is one the live type system has already forgotten (the `migrate-prose-slot-vocab` posture — "a
// migration's whole job is to name a spelling the live type system has already forgotten"), and a pin that
// could only be written in the OLD era would not compile in this one.

import { rpgActorVolatileLockBase } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import { rpgSnapshots } from "@orb/db";
import type { ChatId, ChatTurnId, MessageVariantId, RpgGameId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { buildTrackerView } from "../../../../packages/server/src/domain/rpg/chat-ops/tracker-view.ts";
import type { RpgContext } from "../../../../packages/server/src/domain/rpg/contract/service.ts";
import { snapshotRowToState } from "../../../../packages/server/src/domain/rpg/contract/service.ts";
import { findGameByChat } from "../../../../packages/server/src/domain/rpg/persistence/games.ts";
import { findSnapshotByVariant, writeStagedSnapshot } from "../../../../packages/server/src/domain/rpg/persistence/snapshots.ts";
import { createRpgStagingStore } from "../../../../packages/server/src/domain/rpg/staging.ts";
import { freshDb } from "../../../support/db.ts";
import { emptyState, expect, seedLiteGame, seedMessage, target, test } from "./_support.ts";

/** The corrupt-row error names the table it came from (`RpgStateCorruptError("rpg_snapshots", …)`). */
const CORRUPT_TABLE_RE = /rpg_snapshots/;
/** …and the COLUMN, which is what tells a reader which plane the stale key sat on. */
const ACTOR_STATE_COLUMN_RE = /actorState/;

/** The NPC this suite follows across the rename, spelled once. */
const SLUG = "sister-vesna";
/** Her key as every pre-#906 snapshot spells it — `actorRefKey({kind:"cast", castKey})`. */
const STALE_KEY = `cast:${SLUG}`;
/** The volatile lock a host stamped on her status under the old spelling. */
const STALE_LOCK_PATH = `actorState.${STALE_KEY}.volatile.status`;

/** An `actorState` ROW as a pre-#906 snapshot holds it: the retired `cast` arm, raw. */
const STALE_ACTOR_STATE = [
  {
    actorRef: { kind: "cast", castKey: SLUG },
    identity: { name: "Sister Vesna", emoji: "", mood: "", appearance: "", outfit: "", thoughts: "", relationship: { kind: "neutral", label: "" } },
    volatile: { trackerValues: {}, conditions: [], inventory: [], wallet: [], status: "wary" },
  },
];

/** The SAME actor as a post-#906 snapshot holds her — used by the two SILENT pins, whose whole point is that
 *  the actor plane is fine and the OTHER plane still carries the old key. */
const LIVE_ACTOR_STATE = [
  {
    actorRef: { kind: "npc", npcKey: SLUG },
    identity: { name: "Sister Vesna", emoji: "", mood: "", appearance: "", outfit: "", thoughts: "", relationship: { kind: "neutral", label: "" } },
    volatile: { trackerValues: {}, conditions: [], inventory: [], wallet: [], status: "wary" },
  },
];

interface Seeded {
  readonly db: Db;
  readonly chatId: ChatId;
  readonly gameId: RpgGameId;
  readonly variantId: MessageVariantId;
  readonly ctx: RpgContext;
}

/** A lite game with ONE assistant slot carrying a VALID (empty) committed snapshot — the row the pins then
 *  poison plane by plane. Written through the real staging + write door so the row is born the way a turn
 *  flush makes one, never hand-assembled past the write boundary. */
async function seedGameWithSnapshot(key: string): Promise<Seeded> {
  const db = await freshDb();
  const { chatId, gameId, h } = await seedLiteGame(db, { roster: [] }, key);
  const { variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
  const store = createRpgStagingStore();
  const turn = castId<ChatTurnId>(`chat_turn_${key}`);
  store.ensure(turn, emptyState());
  store.stage(turn, { location: "the undercroft" });
  const flush = store.take(turn);
  if (!flush) {
    throw new Error("no flush");
  }
  const written = await writeStagedSnapshot(db, flush.state, target({ gameId, chatId, seq: 1, variantId, key }));
  expect(written.ok).toBe(true);
  return { db, chatId, gameId, variantId, ctx: h.ctx };
}

/** Overwrite JSON columns on the seeded row with RAW shapes — the only way to land a spelling the live
 *  contract refuses, which is precisely the state a pre-#906 database is in. */
async function poison(
  db: Db,
  variantId: MessageVariantId,
  columns: Partial<Record<"actorState" | "presentCharacters" | "fieldLocks", unknown>>,
): Promise<void> {
  await db
    .update(rpgSnapshots)
    .set(columns as never)
    .where(eq(rpgSnapshots.variantId, variantId));
}

/** Resolve the game row the tracker view projects against. */
async function gameFor(db: Db, chatId: ChatId): ReturnType<typeof findGameByChat> {
  const game = await findGameByChat(db, chatId);
  if (game === undefined) {
    throw new Error("game not found");
  }
  return game;
}

test("PLANE 1 — a stale `cast` actorState row THROWS RpgStateCorruptError: the whole game is unreadable", async () => {
  const { db, variantId } = await seedGameWithSnapshot("p1");
  await poison(db, variantId, { actorState: STALE_ACTOR_STATE });

  // `rpgActorRefSchema` is a discriminated union and `cast` is no longer one of its arms, so parse-on-read
  // refuses the row rather than defaulting it away. This is the LOUD failure — and it is the good one: the
  // host is told the state cannot be read instead of quietly losing an actor. It is also total: the whole
  // snapshot fails, so the game's ambient, quests, trackers and journal go with her.
  await expect(findSnapshotByVariant(db, variantId)).rejects.toThrow(CORRUPT_TABLE_RE);
  await expect(findSnapshotByVariant(db, variantId)).rejects.toThrow(ACTOR_STATE_COLUMN_RE);
});

test("PLANE 2 — a stale `cast` presence key SILENTLY stops matching: the NPC is on stage and reads as offstage", async () => {
  const { db, chatId, variantId, ctx } = await seedGameWithSnapshot("p2");
  // The actor plane is CURRENT (she survived the rename); only the presence echo still spells her the old way.
  await poison(db, variantId, { actorState: LIVE_ACTOR_STATE, presentCharacters: [STALE_KEY] });

  const view = await buildTrackerView(ctx, await gameFor(db, chatId), false);

  // `presentCharacters` is a flat `z.array(z.string().min(1))` — it carries no arm to discriminate, so the
  // stale key parses CLEANLY and rides all the way into the view.
  expect(view.cast).toEqual([STALE_KEY]);
  // …and matches nobody. The projection keys presence by `actorRefKey(entry.actorRef)`, which now mints
  // `npc:<slug>`, so the NPC standing in the scene renders as departed: her card leaves the Scene tab's "On
  // stage" list for "Known characters", and the steering reminder stops telling the model she is present.
  const vesna = view.actors.find((a) => a.name === "Sister Vesna");
  expect(vesna).toBeDefined();
  expect(vesna?.presence).toBe(false);
});

test("PLANE 3 — a stale `cast` fieldLocks path SILENTLY detaches: the host's manual-edit-wins pin guards nothing", async () => {
  const { db, chatId, variantId, ctx } = await seedGameWithSnapshot("p3");
  await poison(db, variantId, { actorState: LIVE_ACTOR_STATE, fieldLocks: { [STALE_LOCK_PATH]: true } });

  const row = await findSnapshotByVariant(db, variantId);
  expect(row).toBeDefined();
  if (row === undefined) {
    return;
  }
  const state = snapshotRowToState(row);

  // `rpgFieldLocksSchema` is `z.record(z.string(), z.literal(true))` — every key is a legal key, so the stale
  // path parses and survives verbatim.
  expect(Object.keys(state.fieldLocks ?? {})).toEqual([STALE_LOCK_PATH]);

  // The path the panel and the merge engine now LOOK for is derived from the live actor's own ref, and it is
  // a different string — so the lock is orphaned in both directions: the host's pin protects nothing (the
  // next model flush overwrites the status it claimed), and the panel draws no Release affordance for a path
  // no actor answers to, which makes it unremovable by any gesture.
  const liveRef = state.actorState[0]?.actorRef;
  expect(liveRef).toBeDefined();
  if (liveRef === undefined) {
    return;
  }
  const wanted = `${rpgActorVolatileLockBase(liveRef)}.status`;
  expect(wanted).not.toBe(STALE_LOCK_PATH);
  expect(Object.keys(state.fieldLocks ?? {})).not.toContain(wanted);

  // The same orphaning is visible on the wire the client renders from.
  const view = await buildTrackerView(ctx, await gameFor(db, chatId), false);
  expect(view.lockedPaths).toEqual([STALE_LOCK_PATH]);
  expect(view.lockedPaths).not.toContain(wanted);
});
