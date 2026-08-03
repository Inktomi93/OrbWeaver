// verbs/snapshot — editSnapshot (rpg-design/05 §4.4, §6.2). The hand-edit door: writes volatile state,
// AUTO-LOCKS touched fields (manual-edit-wins), and — for a turnless game (no snapshot rows, the no-born-seed
// ruling) — mints a fresh narrator slot to hold the first committed snapshot. Mutations asserted at the
// resolved snapshot row (assert-the-mutation-fired).
//
// R1: the `actorState` IMAGE left this door (the per-actor plane is op-shaped — `verbs/patch-actor.ts`), so
// the per-actor lock + additive-plane drives that used to live here moved to `patch-actor.int.test.ts`; what
// remains is the image-honest planes plus the refusal that redirects an `actorState` patch to its verb.
//
// The second describe is the VERB-LEVEL [merge-clear] TRANSITION TEST — the twin of the pure one in
// `substrate/merge.test.ts`, pinned END-TO-END because the pure merge was always right and the verb lied
// anyway: `{ambient: null}` (a TRACKER-VIEW grouping, not a state plane) merged into a plain object that the
// column projection then dropped, so the call wrote nothing, returned `{}`, and stamped a junk lock. The four
// pins: `{}` = no-op · null = clear (down to the leaf) · an unknown plane = errors-as-data · a null on a
// NON-nullable leaf = errors-as-data at the F1 write boundary.

import type { Db } from "@orb/db";
import { beforeEach, describe } from "vitest";
import type { RpgGameRow } from "../../../../../packages/server/src/domain/rpg/contract/service";
import { findGameByChat } from "../../../../../packages/server/src/domain/rpg/persistence/games";
import { resolveSnapshotForTurn } from "../../../../../packages/server/src/domain/rpg/persistence/snapshots";
import { freshDb } from "../../../../support/db";
import { actorWithWallet, expect, makeRpgService, principal, seedChat, test } from "../_support";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

interface Seeded {
  chatId: import("@orb/kit/ids").ChatId;
  game: RpgGameRow;
  service: ReturnType<typeof makeRpgService>["service"];
  fakes: ReturnType<typeof makeRpgService>["fakes"];
}
async function seedGame(): Promise<Seeded> {
  const chatId = await seedChat(db, "a");
  const { service, fakes } = makeRpgService(db);
  fakes.membership.set("user_host", "host");
  await service.createGame({ principal: principal("host"), chatId, mode: "lite" });
  const game = await findGameByChat(db, chatId);
  if (!game) {
    throw new Error("no game");
  }
  return { chatId, game, service, fakes };
}

describe("editSnapshot on a turnless game", () => {
  test("writes the first committed snapshot as a message-less HAND row with an auto-lock — and posts NOTHING", async () => {
    const { chatId, game, service, fakes } = await seedGame();
    // No snapshot exists yet (no born seed).
    expect(await resolveSnapshotForTurn(db, { id: game.id, chatId })).toBeUndefined();

    await service.editSnapshot({ principal: principal("host"), chatId, patch: { location: "The Crypt" } });

    // D124: a hand write posts NO message at all — the row class that leaked onto every canon plane is gone.
    expect(fakes.narratorPosts).toEqual([]);
    const snap = await resolveSnapshotForTurn(db, { id: game.id, chatId });
    expect(snap?.location).toBe("The Crypt");
    expect(snap?.committed).toBe(1);
    // The HAND arm: no message, no variant. Turnless ⇒ no as-of slot either (it orders before all history).
    expect(snap?.messageId).toBeNull();
    expect(snap?.variantId).toBeNull();
    expect(snap?.asOfMessageId).toBeNull();
    // The touched field is auto-locked (manual-edit-wins).
    expect(snap?.fieldLocks?.["location"]).toBe(true);
  });

  test("a locked field survives a later TOOL-style overlay but a re-hand-edit still wins", async () => {
    const { chatId, game, service } = await seedGame();
    await service.editSnapshot({ principal: principal("host"), chatId, patch: { location: "Locked City" } });
    // A second hand edit re-writes the locked field (the human always wins over their own lock).
    await service.editSnapshot({ principal: principal("host"), chatId, patch: { location: "New City" } });
    const snap = await resolveSnapshotForTurn(db, { id: game.id, chatId });
    expect(snap?.location).toBe("New City");
    expect(snap?.fieldLocks?.["location"]).toBe(true);
  });

  test("`lockPaths` stamps the FINE per-field pin instead of the coarse top-level key (#10)", async () => {
    const { chatId, game, service } = await seedGame();
    await service.editSnapshot({
      principal: principal("host"),
      chatId,
      patch: { trackerValues: { focus: { value: 5, items: null, max: null } } },
      lockPaths: ["trackerValues.focus"],
    });
    const snap = await resolveSnapshotForTurn(db, { id: game.id, chatId });
    // The named fine path is locked; the coarse `trackerValues` default was NOT stamped.
    expect(snap?.fieldLocks?.["trackerValues.focus"]).toBe(true);
    expect(snap?.fieldLocks?.["trackerValues"]).toBeUndefined();
  });

  test("releaseLocks clears a fine path stamped earlier (release-only call, empty patch)", async () => {
    const { chatId, game, service } = await seedGame();
    await service.editSnapshot({ principal: principal("host"), chatId, patch: { location: "The Crypt" }, lockPaths: ["location"] });
    await service.editSnapshot({ principal: principal("host"), chatId, patch: {}, releaseLocks: ["location"] });
    const snap = await resolveSnapshotForTurn(db, { id: game.id, chatId });
    expect(snap?.fieldLocks?.["location"]).toBeUndefined();
  });

  // R1 — the `actorState` IMAGE left this door. The plane is op-shaped now, and the refusal has to NAME the
  // verb that owns it: a hand caller (a host at a keyboard, a console, a seed script) told only "no" just
  // moves the guess. Nothing is written and no snapshot row is minted.
  test("an `actorState` image is REFUSED as data, naming rpg.patchActor — no write, no slot, no bus event", async () => {
    const { chatId, game, service, fakes } = await seedGame();
    await service.editSnapshot({ principal: principal("host"), chatId, patch: { location: "The Crypt" } });
    const slotsBefore = fakes.narratorPosts.length;
    const eventsBefore = fakes.busEvents.length;

    const refused = await service.editSnapshot({ principal: principal("host"), chatId, patch: { actorState: [actorWithWallet("mari", 10, 5)] } });
    expect(refused.ok).toBe(false);
    expect(refused.ok === false && refused.reason).toContain("rpg.patchActor");
    expect(refused.ok === false && refused.reason).toContain("rpg.dismissActor");

    const snap = await resolveSnapshotForTurn(db, { id: game.id, chatId });
    expect(snap?.actorState ?? []).toHaveLength(0);
    expect(snap?.fieldLocks?.["actorState"]).toBeUndefined();
    expect(fakes.narratorPosts).toHaveLength(slotsBefore);
    expect(fakes.busEvents).toHaveLength(eventsBefore);
  });
});

/** The ambient planes, all set — the state a null-clear has to collapse. */
const AMBIENT_SET = {
  location: "The Crypt",
  clock: { day: 3, hour: 9, minute: 0 },
  weather: { type: "rain", label: "cold drizzle" },
  calendarDate: "the third day",
};

describe("editSnapshot — the [merge-clear] transition contract, end to end", () => {
  test("null CLEARS its plane — the whole ambient grouping collapses to the view's null (compact) arm", async () => {
    const { chatId, game, service } = await seedGame();
    expect(await service.editSnapshot({ principal: principal("host"), chatId, patch: AMBIENT_SET })).toStrictEqual({ ok: true });
    expect((await service.getTrackerView({ principal: principal("host"), chatId })).ambient).not.toBeNull();

    // The honest clear: the three NULLABLE ambient leaves take null, `location` takes its empty value.
    const cleared = await service.editSnapshot({
      principal: principal("host"),
      chatId,
      patch: { clock: null, weather: null, calendarDate: null, location: "" },
    });
    expect(cleared).toStrictEqual({ ok: true });

    const snap = await resolveSnapshotForTurn(db, { id: game.id, chatId });
    expect(snap?.clock).toBeNull();
    expect(snap?.weather).toBeNull();
    expect(snap?.calendarDate).toBeNull();
    expect(snap?.location).toBe("");
    // The reachable consequence: the tracker view's ambient sub-view is null, so the panel renders compact.
    expect((await service.getTrackerView({ principal: principal("host"), chatId })).ambient).toBeNull();
  });

  test("`{}` is a NO-OP, not a reset — the leaf under it survives", async () => {
    const { chatId, game, service } = await seedGame();
    await service.editSnapshot({ principal: principal("host"), chatId, patch: { trackerValues: { gold: { value: 5, items: null, max: 10 } } } });

    expect(await service.editSnapshot({ principal: principal("host"), chatId, patch: { trackerValues: {} } })).toStrictEqual({ ok: true });

    const snap = await resolveSnapshotForTurn(db, { id: game.id, chatId });
    expect(snap?.trackerValues?.["gold"]).toStrictEqual({ value: 5, items: null, max: 10 });
  });

  test("a null on a nullable LEAF clears exactly that leaf; its siblings keep their values", async () => {
    const { chatId, game, service } = await seedGame();
    await service.editSnapshot({ principal: principal("host"), chatId, patch: { trackerValues: { gold: { value: 5, items: null, max: 10 } } } });

    expect(await service.editSnapshot({ principal: principal("host"), chatId, patch: { trackerValues: { gold: { max: null } } } })).toStrictEqual({
      ok: true,
    });

    const snap = await resolveSnapshotForTurn(db, { id: game.id, chatId });
    expect(snap?.trackerValues?.["gold"]).toStrictEqual({ value: 5, items: null, max: null });
  });

  test("an UNKNOWN plane is errors-as-data — no write, no lock, no slot, no bus event", async () => {
    const { chatId, game, service, fakes } = await seedGame();
    await service.editSnapshot({ principal: principal("host"), chatId, patch: AMBIENT_SET });
    const slotsBefore = fakes.narratorPosts.length;
    const eventsBefore = fakes.busEvents.length;

    // `ambient` is the TRACKER VIEW's grouping of location/date/clock/weather — it has no state home, and the
    // old verb merged it into a plain object the column projection silently dropped.
    const refused = await service.editSnapshot({ principal: principal("host"), chatId, patch: { ambient: null } });
    expect(refused.ok).toBe(false);
    expect(refused.ok === false && refused.reason).toContain("ambient");
    // The refusal NAMES what is writable (a hand caller must not have to guess twice).
    expect(refused.ok === false && refused.reason).toContain("location");

    const snap = await resolveSnapshotForTurn(db, { id: game.id, chatId });
    expect(snap?.location).toBe(AMBIENT_SET.location);
    expect(snap?.fieldLocks?.["ambient"]).toBeUndefined();
    expect(fakes.narratorPosts).toHaveLength(slotsBefore);
    expect(fakes.busEvents).toHaveLength(eventsBefore);
  });

  test("a null on a NON-nullable leaf is refused at the F1 write boundary, not coerced", async () => {
    const { chatId, game, service, fakes } = await seedGame();
    await service.editSnapshot({ principal: principal("host"), chatId, patch: AMBIENT_SET });
    const slotsBefore = fakes.narratorPosts.length;

    // `location` is a non-nullable string (its empty value is ""), so a merge-clear null is contract-invalid.
    const refused = await service.editSnapshot({ principal: principal("host"), chatId, patch: { location: null } });
    expect(refused.ok).toBe(false);
    expect(refused.ok === false && refused.reason).toContain("location");

    const snap = await resolveSnapshotForTurn(db, { id: game.id, chatId });
    expect(snap?.location).toBe(AMBIENT_SET.location);
    // Refused BEFORE the clone-forward mint — a rejected edit leaves no blank anchor slot behind.
    expect(fakes.narratorPosts).toHaveLength(slotsBefore);
  });
});
