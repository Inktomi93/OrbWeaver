// verbs/dismiss-actor — dismissActor (the actor-state review §5 R1). THE removal gesture the actor plane
// never had: `substrate/merge.ts` justifies the plane's ADDITIVE policy with "an actor leaves the plane by a
// real gesture, never by going unmentioned" — and until this verb, no gesture removed an `actorState` element
// at all (omission never removes, no tool removes an actor, the hand image could not, and even a resync
// merges through the same additive plane). These tests pin the three couplings ONE gesture owns — the state
// row, the scene-presence row, and the element's locks — because half a dismissal is a ghost.

import type { Db } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { beforeEach } from "vitest";
import type { RpgGameRow } from "../../../../../packages/server/src/domain/rpg/contract/service";
import { findGameByChat } from "../../../../../packages/server/src/domain/rpg/persistence/games";
import { resolveSnapshotForTurn } from "../../../../../packages/server/src/domain/rpg/persistence/snapshots";
import { freshDb } from "../../../../support/db";
import { expect, makeRpgService, principal, seedChat, test } from "../_support";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

const MIRA = { kind: "cast", castKey: "mira" } as const;
const HOST = principal("host");

async function seedGame(): Promise<{
  chatId: ChatId;
  game: RpgGameRow;
  service: ReturnType<typeof makeRpgService>["service"];
  fakes: ReturnType<typeof makeRpgService>["fakes"];
}> {
  const chatId = await seedChat(db, "a");
  const h = makeRpgService(db);
  h.fakes.membership.set("user_host", "host");
  await h.service.createGame({ principal: HOST, chatId, mode: "lite" });
  const game = await findGameByChat(db, chatId);
  if (!game) {
    throw new Error("no game");
  }
  return { chatId, game, service: h.service, fakes: h.fakes };
}

test("drops the state row AND the presence row AND every lock at/below the actor's path", async () => {
  const { chatId, game, service } = await seedGame();
  // Mira is on stage and carries hand-pinned state; thorn is a bystander who must survive untouched.
  await service.editSnapshot({
    principal: HOST,
    chatId,
    patch: { presentCharacters: ["cast:mira"] },
  });
  await service.patchActor({
    principal: HOST,
    chatId,
    targetRef: MIRA,
    ops: [
      { op: "setStatus", status: "wary" },
      { op: "setTracker", key: "trust", value: { value: 4 } },
    ],
  });
  await service.patchActor({ principal: HOST, chatId, targetRef: { kind: "cast", castKey: "thorn" }, ops: [{ op: "setStatus", status: "waiting" }] });
  const before = await resolveSnapshotForTurn(db, { id: game.id, chatId });
  expect(before?.fieldLocks?.["actorState.cast:mira.volatile.status"]).toBe(true);

  expect(await service.dismissActor({ principal: HOST, chatId, targetRef: MIRA })).toStrictEqual({ ok: true });

  const after = await resolveSnapshotForTurn(db, { id: game.id, chatId });
  expect((after?.actorState ?? []).map((a) => (a.actorRef.kind === "cast" ? a.actorRef.castKey : ""))).toEqual(["thorn"]);
  expect(after?.presentCharacters ?? []).toEqual([]);
  // The symmetric lock release: mira's pins are gone, thorn's survive (a dismissal is scoped to its actor).
  expect(after?.fieldLocks?.["actorState.cast:mira.volatile.status"]).toBeUndefined();
  expect(after?.fieldLocks?.["actorState.cast:mira.volatile.trackerValues.trust"]).toBeUndefined();
  expect(after?.fieldLocks?.["actorState.cast:thorn.volatile.status"]).toBe(true);
});

test("a dismissed actor STAYS gone through a later hand write on another actor (the additive plane can't resurrect her)", async () => {
  const { chatId, game, service } = await seedGame();
  await service.patchActor({ principal: HOST, chatId, targetRef: MIRA, ops: [{ op: "setStatus", status: "wary" }] });
  await service.dismissActor({ principal: HOST, chatId, targetRef: MIRA });
  await service.patchActor({ principal: HOST, chatId, targetRef: { kind: "cast", castKey: "thorn" }, ops: [{ op: "setStatus", status: "waiting" }] });

  const after = await resolveSnapshotForTurn(db, { id: game.id, chatId });
  expect((after?.actorState ?? []).map((a) => (a.actorRef.kind === "cast" ? a.actorRef.castKey : ""))).toEqual(["thorn"]);
});

test("dismissing a PRESENCE-ONLY cast member (no state row yet) still clears her from the scene", async () => {
  const { chatId, game, service } = await seedGame();
  await service.editSnapshot({
    principal: HOST,
    chatId,
    patch: { presentCharacters: ["cast:mira"] },
  });

  expect(await service.dismissActor({ principal: HOST, chatId, targetRef: MIRA })).toStrictEqual({ ok: true });
  const after = await resolveSnapshotForTurn(db, { id: game.id, chatId });
  expect(after?.presentCharacters ?? []).toEqual([]);
});

test("dismissing an actor the game does not carry is ERRORS-AS-DATA — no write, no slot, no bus event", async () => {
  const { chatId, game, service, fakes } = await seedGame();
  await service.patchActor({ principal: HOST, chatId, targetRef: { kind: "cast", castKey: "thorn" }, ops: [{ op: "setStatus", status: "waiting" }] });
  const slotsBefore = fakes.narratorPosts.length;
  const eventsBefore = fakes.busEvents.length;

  const refused = await service.dismissActor({ principal: HOST, chatId, targetRef: MIRA });
  expect(refused.ok).toBe(false);
  expect(refused.ok === false && refused.reason).toContain("cast:mira");

  const after = await resolveSnapshotForTurn(db, { id: game.id, chatId });
  expect(after?.actorState ?? []).toHaveLength(1);
  expect(fakes.narratorPosts).toHaveLength(slotsBefore);
  expect(fakes.busEvents).toHaveLength(eventsBefore);
});
