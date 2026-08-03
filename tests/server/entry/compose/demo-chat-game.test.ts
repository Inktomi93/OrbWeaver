// entry/compose/demo-chat-game — the demo-chat seeder's GAME door, over a fake rpg service (no db).
//
// What is pinned here is the one thing the replay can silently get wrong: WHO OWNS THE BOARD AFTERWARDS.
// Every rpg hand door auto-locks the datum it writes, and a locked datum is one the story may never move
// again — so a verbatim replay ships an example whose hp, status, inventory, quests, location and clock are
// frozen against the receiving user's own play (observed live: a locked setup pass made four consecutive
// extraction rounds no-ops). The replay must therefore write UNLOCKED and release what `upsertQuest` stamps
// with no opt-out.
//
// Also pinned: the per-install re-bind (`player` → the CALLER, never the fixture author) and the idempotence
// contract the pack-bump heal depends on (a played game is never re-dressed).

import type { Principal } from "@orb/contracts/identity";
import type { RpgActorView, RpgQuestView, RpgTrackerView } from "@orb/contracts/rpg";
import type { CharacterHandle, CharacterId, ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { DemoChatGame } from "@orb/server/domain/chat";
import type { DemoChatGameDoorDeps } from "@orb/server/entry/compose";
import { createDemoChatGameDoor } from "@orb/server/entry/compose";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures";

/** The hand doors' errors-as-data verdict, DERIVED off the door's own dep contract rather than re-spelled or
 *  imported from a server-internal alias the test program cannot resolve. */
type HandDoorResult = Awaited<ReturnType<DemoChatGameDoorDeps["rpg"]["editSnapshot"]>>;

const CHAT_ID = castId<ChatId>("chat_demo");
const USER_ID = castId<UserId>("user_receiving");
const SABINE = castId<CharacterId>("character_sabine");
const PRINCIPAL: Principal = { userId: USER_ID, role: "owner", handle: castId<Handle>("owner"), externalId: null, via: "cookie" };

interface Recorded {
  readonly patchActor: { readonly autoLock: boolean | undefined; readonly targetKey: string }[];
  readonly editSnapshot: {
    readonly patchKeys: string[];
    readonly lockPaths: readonly string[] | undefined;
    readonly releaseLocks: readonly string[] | undefined;
  }[];
  /** The game's lock set as the REAL doors would leave it — the property the receiving user's play depends on. */
  readonly locks: Set<string>;
}

/** A fake rpg service that models the ONE behaviour this door has to get right: the doors' AUTO-LOCK, exactly
 *  as the real verbs stamp it — `patchActor` locks a path per op unless `autoLock:false` (`patch-actor.ts:53`),
 *  `editSnapshot` locks `lockPaths ?? Object.keys(patch)` and clears `releaseLocks` (`edit-snapshot.ts:70-74`),
 *  `upsertQuest` locks `quests.<id>` with NO opt-out (`upsert-quest.ts:36`). Because the fake locks like the
 *  tree locks, the assertions can be about the RESULT — a board the story can still move — instead of about
 *  which arguments were passed. */
function harness(options: { readonly bornEmpty?: boolean; readonly refuseHandDoors?: string } = {}): {
  readonly deps: DemoChatGameDoorDeps;
  readonly rec: Recorded;
} {
  const rec: Recorded = { patchActor: [], editSnapshot: [], locks: new Set<string>() };
  const bornEmpty = options.bornEmpty ?? true;
  /** EDITSNAP-OK — make both hand doors answer with an errors-as-data REFUSAL instead of `{ok:true}`. */
  const refusal: HandDoorResult | null = options.refuseHandDoors === undefined ? null : { ok: false, reason: options.refuseHandDoors };
  let questSeq = 0;
  /** The door reads exactly three things off this view — `quests`, `actors[].volatile` (its born-empty oracle)
   *  and `lockedPaths` — but the value is spelled WHOLE and typed, so a field added to `RpgTrackerView` or
   *  `RpgActorView` breaks this fixture at `tsc` instead of silently surviving as a double-cast lie. */
  const playedActor: RpgActorView = {
    actorRef: { kind: "user", userId: USER_ID },
    name: "someone who has played",
    presence: true,
    identity: null,
    sheet: { className: "", attributes: {}, flavor: "", level: null, trackerGrants: [], trackerRevokes: [] },
    volatile: { trackerValues: {}, conditions: [], inventory: [], wallet: [], status: "played" },
    trackers: [],
  };
  const bornActor: RpgActorView = { ...playedActor, name: "an untouched seat", volatile: null };
  const playedQuest: RpgQuestView = { id: "quest_played", name: "already played", status: "active", description: "", objectives: [] };
  const view = (): RpgTrackerView => ({
    ambient: null,
    actors: [bornEmpty ? bornActor : playedActor],
    cast: [],
    trackerDefs: [],
    gameTrackers: [],
    quests: bornEmpty ? [] : [playedQuest],
    plot: null,
    recentBeats: [],
    trackersReadOnly: false,
    trackerOrbs: [],
    lockedPaths: [...rec.locks],
  });

  const deps: DemoChatGameDoorDeps = {
    rpg: {
      createGame: (): Promise<never> => Promise.resolve(undefined as never),
      getTrackerView: (): Promise<RpgTrackerView> => Promise.resolve(view()),
      updateConfig: (): Promise<never> => Promise.resolve(undefined as never),
      patchSheet: (): Promise<never> => Promise.resolve(undefined as never),
      // EDITSNAP-OK — the hand doors answer with a `HandDoorResult` VERDICT, never `undefined`: the door
      // now READS `ok`, and a fake that lied about the wire shape would be testing a contract the server
      // does not have. `refuseHandDoors` drives the refused arm.
      patchActor: ({ targetRef, ops, autoLock }): Promise<HandDoorResult> => {
        const key = targetRef.kind === "user" ? `user:${targetRef.userId}` : JSON.stringify(targetRef);
        rec.patchActor.push({ autoLock, targetKey: key });
        if (autoLock !== false) {
          for (const op of ops) {
            rec.locks.add(`actorState.${key}.volatile.${op.op}`);
          }
        }
        return Promise.resolve(refusal ?? { ok: true });
      },
      upsertQuest: (): Promise<never> => {
        questSeq += 1;
        rec.locks.add(`quests.quest_${questSeq}`);
        return Promise.resolve(undefined as never);
      },
      addJournalEntry: (): Promise<never> => Promise.resolve(undefined as never),
      editSnapshot: ({ patch, lockPaths, releaseLocks }): Promise<HandDoorResult> => {
        rec.editSnapshot.push({ patchKeys: Object.keys(patch), lockPaths, releaseLocks });
        for (const path of releaseLocks ?? []) {
          rec.locks.delete(path);
        }
        for (const path of lockPaths ?? Object.keys(patch)) {
          rec.locks.add(path);
        }
        return Promise.resolve(refusal ?? { ok: true });
      },
    },
  };
  return { deps, rec };
}

const GAME: DemoChatGame = {
  profile: "d20",
  setup: {
    trackers: [],
    snapshot: { location: "the throne hall" },
    actors: [
      { seat: { kind: "player" }, present: true, ops: [{ op: "setStatus", status: "ward-touched" }] },
      { seat: { kind: "handle", handle: castId<CharacterHandle>("sabine") }, present: true, ops: [{ op: "setStatus", status: "left of you, unarmed" }] },
    ],
    quests: [{ name: "The Seal", status: "active", description: "", objectives: [{ text: "climb", completed: true }] }],
    journal: [{ type: "location", title: "The Ashen Spire", content: "black glass" }],
  },
};

const SEATS = [{ handle: castId<CharacterHandle>("sabine"), characterId: SABINE }];

describe("createDemoChatGameDoor", () => {
  test("THE PROPERTY: after the replay the seeded game carries NO lock — every authored datum is one the receiving user's own play can still move", async () => {
    const { deps, rec } = harness();
    await createDemoChatGameDoor(deps)({ principal: PRINCIPAL, chatId: CHAT_ID, game: GAME, seats: SEATS, mint: true });

    expect(
      [...rec.locks],
      "a lock left behind by the replay is a datum the story may never write again — hp, status, inventory, quests, location all frozen in the user's own copy of the example",
    ).toEqual([]);
  });

  test("the two arms of that property: actor ops write with autoLock off, and the quest door's unconditional lock is released", async () => {
    const { deps, rec } = harness();
    await createDemoChatGameDoor(deps)({ principal: PRINCIPAL, chatId: CHAT_ID, game: GAME, seats: SEATS, mint: true });

    expect(rec.patchActor.map((p) => p.autoLock)).toEqual([false, false]);
    const release = rec.editSnapshot.find((e) => e.releaseLocks !== undefined && e.releaseLocks.length > 0);
    expect(release?.releaseLocks, "`upsertQuest` has no autoLock argument — releasing after the fact is its only opt-out").toEqual(["quests.quest_1"]);
    expect(release?.patchKeys, "the release is a lock gesture, never a second write").toEqual([]);
  });

  test("a setup that stamped nothing to release makes no empty release call", async () => {
    const { deps, rec } = harness();
    const questless: DemoChatGame = { profile: "d20", setup: { snapshot: { location: "the throne hall" } } };
    await createDemoChatGameDoor(deps)({ principal: PRINCIPAL, chatId: CHAT_ID, game: questless, seats: SEATS, mint: true });

    expect(rec.editSnapshot.every((e) => e.releaseLocks === undefined)).toBe(true);
    expect([...rec.locks]).toEqual([]);
  });

  test("the `player` seat binds to the RECEIVING user, never a fixture-frozen identity", async () => {
    const { deps, rec } = harness();
    await createDemoChatGameDoor(deps)({ principal: PRINCIPAL, chatId: CHAT_ID, game: GAME, seats: SEATS, mint: true });

    expect(rec.patchActor[0]?.targetKey).toBe(`user:${USER_ID}`);
  });

  test("a PLAYED game is never re-dressed (the pack-bump heal's contract)", async () => {
    const { deps, rec } = harness({ bornEmpty: false });
    await createDemoChatGameDoor(deps)({ principal: PRINCIPAL, chatId: CHAT_ID, game: GAME, seats: SEATS, mint: false });

    expect(rec.patchActor).toHaveLength(0);
    expect(rec.editSnapshot).toHaveLength(0);
  });
  // EDITSNAP-OK — the hand doors refuse LEGIBLY as DATA on a RESOLVED promise, so an un-checked call left the
  // seeder cheerfully "successful" with a half-dressed example: the room and its transcript land, the scene
  // planes silently do not, and `editSnapshot` rejects the WHOLE patch on ONE bad plane (a five-plane scene
  // write was lost to a single over-length label exactly this way). A refusal here is a bug in the data WE
  // SHIP, so the door fails LOUD — the seeder's own `ensureSeeded` catch turns the throw into one error log.
  test("EDITSNAP-OK: a refused hand door FAILS the replay, naming the door and the server's reason", async () => {
    const reason = "label exceeds 40 characters";
    const { deps } = harness({ refuseHandDoors: reason });
    const door = createDemoChatGameDoor(deps);

    await expect(door({ principal: PRINCIPAL, chatId: CHAT_ID, game: GAME, seats: SEATS, mint: true })).rejects.toThrow(
      new RegExp(`rpg\\.patchActor.*${reason}`, "u"),
    );
  });
});
