// entry/compose/demo-chat-game — the demo-chat seeder's GAME door: mint the flagship example's rpg-lite game
// through rpg's real create verb, then replay its hand-authored opening state through rpg's real HAND doors
// (`updateConfig` → `patchSheet`/`patchActor` → `upsertQuest` → `addJournalEntry` → `editSnapshot`).
//
// WHY IT LIVES AT ENTRY. `domain/chat` owns the manifest (which cards, which transcript, which authored
// state) but must stay rpg-table-blind: it never spells an `RpgActorRef`, never resolves a packaged profile,
// never calls an rpg verb. This seam is where the two meet — the composition root, exactly as every other
// cross-domain op is wired. The authored blob's `player`/`handle`/`cast` seats become real actor refs HERE,
// which is also what makes the demo re-bind to the RECEIVING user rather than shipping the fixture author's
// identity (the "my game says the player is `owner`" defect).
//
// IDEMPOTENCE IS THE DOOR'S CONTRACT (the seeder's pack-bump heal calls it on already-seeded rooms): the
// game is minted only when the chat carries none, and the authored setup is replayed only onto a STILL-BORN
// state. `addItem`/`addCondition`/`upsertQuest`/`addJournalEntry` are additive by design — replaying them on
// a played game would duplicate a host's board, so the born check is load-bearing, not a nicety.
//
// THE AUTHORED BOARD IS A STARTING POSITION, NOT A SET OF HOST PINS. Every hand door AUTO-LOCKS the datum it
// writes (`patchActor` → `applied.lockPaths`, `editSnapshot` → every top-level patch key, `upsertQuest` →
// `quests.<id>`, unconditionally), and a locked datum is one the model may never move again. Replayed
// verbatim that turns a shipped example into a board frozen against its own continuation: the receiving user
// plays on and their hp, status, inventory, quests, location and clock all sit exactly where the fixture left
// them. So the replay opts OUT where the door lets it (`autoLock:false` / `lockPaths:[]`) and RELEASES what
// the quest door stamps anyway — verified live on the generating stack, where a locked setup pass made every
// extraction round a no-op for four straight turns.

import type { Principal } from "@orb/contracts/identity";
import type { RpgActorRef } from "@orb/contracts/rpg";
import { actorRefKey, RPG_RULESET_PROFILE, rpgSeedTrackers } from "@orb/contracts/rpg";
import type { ChatId } from "@orb/kit/ids";
import type { DemoChatActorSeat, DemoChatGame, DemoChatGameActor, DemoChatSeat } from "#domain/chat";
import type { HandDoorResult, RpgService } from "#domain/rpg";

export interface DemoChatGameDoorDeps {
  /** Narrowed to the eight doors the replay actually drives (the `ExportDeps` precedent): the door is a
   *  REPLAY of a host's own gestures, and the `Pick` is what says so — anything outside this list would be the
   *  seam growing a second job. */
  readonly rpg: Pick<
    RpgService,
    "createGame" | "getTrackerView" | "updateConfig" | "patchSheet" | "patchActor" | "upsertQuest" | "addJournalEntry" | "editSnapshot"
  >;
}

export interface DemoChatGameDoorArgs {
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly game: DemoChatGame;
  readonly seats: readonly DemoChatSeat[];
  /** `true` on a freshly-written example (mint the game first); `false` on the pack-bump heal, whose room
   *  already carries one. The caller KNOWS which it is — probing would mean catching rpg's deliberately
   *  leak-free not-found as control flow. */
  readonly mint: boolean;
}

/**
 * EDITSNAP-OK — the errors-as-data CHECK every hand-door call in this file goes through.
 *
 * `patchActor`/`editSnapshot` refuse LEGIBLY as data (`HandDoorResult`): a bad plane, an unreachable datum or
 * a value that fails the F1 write-boundary parse comes back `{ok:false, reason}` on a resolved promise, and
 * `editSnapshot` rejects the WHOLE patch on ONE bad plane. Un-checked, a malformed manifest field therefore
 * seeded a SILENTLY half-dressed example — the room and its transcript land, the scene planes simply don't,
 * and nothing anywhere says so (a five-plane scene write was lost to one over-length label exactly this way).
 *
 * A refusal here is a bug in the DATA WE SHIP, never a user condition, so it throws rather than warns: the
 * seeder's own `ensureSeeded` catch turns that into one `chat: demo-chat seed failed` error log naming the
 * door and the reason, which is loud in dev and contained in prod.
 */
function assertHandWrote(door: string, chatId: ChatId, result: HandDoorResult): void {
  if (!result.ok) {
    throw new Error(`demo-chat game seed refused at rpg.${door} (chat ${chatId}): ${result.reason}`);
  }
}

/** Run one awaited step per item, IN ORDER. Every rpg hand door is a read-modify-write against the game's
 *  ONE resolved snapshot head (`writeHandState`), so concurrent calls would each resolve the same base and
 *  the last writer would silently drop the others. Expressed as a fold rather than an awaited loop so the
 *  serialization is the SHAPE of the code, not a lint suppression on top of it. */
async function runInOrder<T>(items: readonly T[], run: (item: T) => Promise<void>): Promise<void> {
  await items.reduce<Promise<void>>(async (prior, item) => {
    await prior;
    await run(item);
  }, Promise.resolve());
}

/** The authored seat → a real actor ref. `player` binds to THE CALLER (per-install re-bind, the whole point);
 *  a `handle` binds to the card the seeder resolved it to; `cast` is a scene-only NPC minted by its first op.
 *  `undefined` ⇒ a handle this example's roster does not carry, which skips that actor rather than throwing
 *  (a partially-seeded library still gets its examples). */
function resolveSeat(seat: DemoChatActorSeat, principal: Principal, seats: readonly DemoChatSeat[]): RpgActorRef | undefined {
  if (seat.kind === "player") {
    return { kind: "user", userId: principal.userId };
  }
  if (seat.kind === "npc") {
    return { kind: "npc", npcKey: seat.slug };
  }
  const seated = seats.find((s) => s.handle === seat.handle);
  return seated === undefined ? undefined : { kind: "character", characterId: seated.characterId };
}

/** Is this game's state still the one `createGame` was born with? Read through rpg's own member view: a born
 *  game has no quests and no actor carrying a volatile row (`getTrackerView` projects `volatile: null` for an
 *  actor the story has never touched). Anything else means a human or a model has played it. */
async function isBornEmpty(rpg: Pick<RpgService, "getTrackerView">, principal: Principal, chatId: ChatId): Promise<boolean> {
  const view = await rpg.getTrackerView({ principal, chatId });
  return view.quests.length === 0 && view.actors.every((actor) => actor.volatile === null);
}

export function createDemoChatGameDoor(deps: DemoChatGameDoorDeps): (args: DemoChatGameDoorArgs) => Promise<void> {
  const { rpg } = deps;

  /** The actor blocks: sheet (durable half) then volatile ops, per actor. Returns the ref keys of the actors
   *  the manifest says stand in the closing scene. */
  async function applyActors(args: DemoChatGameDoorArgs, actors: readonly DemoChatGameActor[]): Promise<readonly string[]> {
    const { principal, chatId, seats } = args;
    const present: string[] = [];
    await runInOrder(actors, async (actor): Promise<void> => {
      const actorRef = resolveSeat(actor.seat, principal, seats);
      if (actorRef === undefined) {
        return;
      }
      if (actor.sheet !== undefined) {
        await rpg.patchSheet({ principal, chatId, actorRef, patch: actor.sheet });
      }
      if (actor.ops !== undefined && actor.ops.length > 0) {
        assertHandWrote("patchActor", chatId, await rpg.patchActor({ principal, chatId, targetRef: actorRef, ops: actor.ops, autoLock: false }));
      }
      if (actor.present === true) {
        present.push(actorRefKey(actorRef));
      }
    });
    return present;
  }

  /** The two append-only planes, in authored order. */
  async function applyQuestsAndJournal(args: DemoChatGameDoorArgs, setup: NonNullable<DemoChatGame["setup"]>): Promise<void> {
    const { principal, chatId } = args;
    await runInOrder(setup.quests ?? [], async (quest): Promise<void> => {
      await rpg.upsertQuest({
        principal,
        chatId,
        name: quest.name,
        status: quest.status,
        description: quest.description,
        objectives: quest.objectives.map((objective) => ({ text: objective.text, completed: objective.completed })),
      });
    });
    await runInOrder(setup.journal ?? [], async (entry): Promise<void> => {
      await rpg.addJournalEntry({ principal, chatId, type: entry.type, title: entry.title, content: entry.content });
    });
  }

  async function applySetup(args: DemoChatGameDoorArgs): Promise<void> {
    const { principal, chatId, game } = args;
    const setup = game.setup;
    if (setup === undefined || !(await isBornEmpty(rpg, principal, chatId))) {
      return;
    }

    // 1. The tracker DEFS first — an actor op naming a tracker its game has never defined writes a value the
    //    panel would render against nothing. The write is whole-list, so the profile's own seeded defs are
    //    DERIVED here and the manifest only carries what it adds.
    if (setup.trackers !== undefined) {
      const profile = RPG_RULESET_PROFILE[game.ruleset];
      await rpg.updateConfig({ principal, chatId, patch: { trackers: [...rpgSeedTrackers(profile), ...setup.trackers] } });
    }

    const present = await applyActors(args, setup.actors ?? []);
    await applyQuestsAndJournal(args, setup);

    // 3. The snapshot planes LAST — including the presence plane derived from the actor blocks above (a
    //    manifest cannot spell resolved actor-ref keys, so it declares WHO stands in the scene and this seam
    //    projects it).
    const snapshot = { ...(setup.snapshot ?? {}), ...(present.length > 0 ? { presentCharacters: present } : {}) };
    if (Object.keys(snapshot).length > 0) {
      assertHandWrote("editSnapshot", chatId, await rpg.editSnapshot({ principal, chatId, patch: snapshot, lockPaths: [] }));
    }

    // 4. UNPIN. `upsertQuest` locks `quests.<id>` with no opt-out, so the only way an authored quest stays
    //    playable is to release it after the fact. The read is safe to take wholesale: this runs exclusively on
    //    a still-born game (the guard above), so every lock present is one THIS replay just stamped.
    await releaseAuthoredLocks(args);
  }

  /** Release every lock the setup replay stamped. Separate from the writes so the "authored ≠ pinned" rule has
   *  one home rather than an opt-out argument repeated at four call sites. */
  async function releaseAuthoredLocks(args: DemoChatGameDoorArgs): Promise<void> {
    const { principal, chatId } = args;
    const { lockedPaths } = await rpg.getTrackerView({ principal, chatId });
    if (lockedPaths.length === 0) {
      return;
    }
    assertHandWrote("editSnapshot(release)", chatId, await rpg.editSnapshot({ principal, chatId, patch: {}, lockPaths: [], releaseLocks: [...lockedPaths] }));
  }

  return async (args: DemoChatGameDoorArgs): Promise<void> => {
    const { principal, chatId, game, mint } = args;
    if (mint) {
      await rpg.createGame({ principal, chatId, mode: "lite", ruleset: game.ruleset });
    }
    await applySetup(args);
  };
}
