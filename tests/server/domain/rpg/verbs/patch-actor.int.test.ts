// verbs/patch-actor — patchActor (the actor-state review §5 R1). THE op-shaped hand door for one actor's
// volatile row, which replaced `editSnapshot`'s whole-`actorState` IMAGE. Mutations asserted at the resolved
// snapshot row (assert-the-mutation-fired), never at the return value.
//
// THE HEADLINE REGRESSION (the review's fourth, latent defect — §2 "the stale-image clobber"): the image
// carried every field of every actor AS READ AT PANEL-QUERY TIME, and the write re-resolved the head, so any
// model flush that landed in between was overwritten field-by-field. The drive below plays exactly that
// race — panel read → flush → hand write — and asserts the flush's fields SURVIVE the human's op. The same
// test then applies the OLD image over the post-flush head through the real merge engine to show the old path
// provably clobbered them (a red-first proof that outlives the deleted door).

import type { RpgSnapshotState } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import type { ChatId, ChatTurnId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach } from "vitest";
import type { RpgGameRow } from "../../../../../packages/server/src/domain/rpg/contract/service.ts";
import { findGameByChat } from "../../../../../packages/server/src/domain/rpg/persistence/games.ts";
import { resolveSnapshotForTurn } from "../../../../../packages/server/src/domain/rpg/persistence/snapshots.ts";
import { applyLockedPatch } from "../../../../../packages/server/src/domain/rpg/substrate/merge.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, makeRpgService, pinExtractionMode, principal, seedChat, seedMessage, test, turnConnection } from "../_support.ts";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

const MIRA = { kind: "cast", castKey: "mira" } as const;
const HOST = principal(castId<Handle>("host"));

interface Seeded {
  chatId: ChatId;
  game: RpgGameRow;
  service: ReturnType<typeof makeRpgService>["service"];
  fakes: ReturnType<typeof makeRpgService>["fakes"];
  h: ReturnType<typeof makeRpgService>;
}
async function seedGame(over: Parameters<typeof makeRpgService>[1] = {}): Promise<Seeded> {
  const chatId = await seedChat(db, "a");
  const h = makeRpgService(db, over);
  h.fakes.membership.set("user_host", "host");
  await h.service.createGame({ principal: HOST, chatId, mode: "lite" });
  const game = await findGameByChat(db, chatId);
  if (!game) {
    throw new Error("no game");
  }
  return { chatId, game, service: h.service, fakes: h.fakes, h };
}

/** The resolved head's row for `cast:mira` (what the panel and the reminder would read). */
async function miraRow(game: RpgGameRow, chatId: ChatId): Promise<RpgSnapshotState["actorState"][number] | undefined> {
  const snap = await resolveSnapshotForTurn(db, { id: game.id, chatId });
  return (snap?.actorState ?? []).find((a) => a.actorRef.kind === "cast" && a.actorRef.castKey === "mira");
}

test("the ops land on a MINTED row — a first hand edit on an actor with no state row is a real write", async () => {
  const { chatId, game, service } = await seedGame();
  const written = await service.patchActor({
    principal: HOST,
    chatId,
    targetRef: MIRA,
    ops: [
      { op: "setStatus", status: "wary" },
      { op: "setIdentityText", field: "name", text: "Mira Solheart" },
      { op: "setTracker", key: "trust", value: { value: 4 } },
      { op: "addCondition", condition: { name: "Chilled" } },
      { op: "addItem", item: { name: "Bone key" } },
      { op: "setWalletAmount", name: "gold", amount: 45 },
    ],
  });
  expect(written).toStrictEqual({ ok: true });

  const row = await miraRow(game, chatId);
  expect(row?.volatile.status).toBe("wary");
  // R2 — a MINTED cast row carries its identity half too, so the very first hand edit can name her.
  expect(row?.identity?.name).toBe("Mira Solheart");
  expect(row?.volatile.trackerValues["trust"]).toStrictEqual({ value: 4, items: null, max: null });
  expect(row?.volatile.conditions).toEqual([{ name: "Chilled", stat: null, modifier: 0, turnsLeft: null }]);
  expect(row?.volatile.inventory[0]).toMatchObject({ name: "Bone key", quantity: 1, description: "", location: "", type: "" });
  expect(row?.volatile.wallet).toEqual([{ name: "gold", amount: 45 }]);
});

test("each op stamps its OWN fine lock path — never the coarse `actorState` plane key", async () => {
  const { chatId, game, service } = await seedGame();
  await service.patchActor({
    principal: HOST,
    chatId,
    targetRef: MIRA,
    ops: [
      { op: "setTracker", key: "trust", value: { value: 4 } },
      { op: "setStatus", status: "wary" },
      { op: "setWalletAmount", name: "gold", amount: 45 },
      { op: "addCondition", condition: { name: "Chilled" } },
      { op: "addItem", item: { name: "Bone key" } },
    ],
  });
  const snap = await resolveSnapshotForTurn(db, { id: game.id, chatId });
  expect(snap?.fieldLocks).toStrictEqual({
    "actorState.cast:mira.volatile.trackerValues.trust": true,
    "actorState.cast:mira.volatile.status": true,
    "actorState.cast:mira.volatile.wallet.gold": true,
    "actorState.cast:mira.volatile.conditions": true,
    "actorState.cast:mira.volatile.inventory": true,
  });
  expect(snap?.fieldLocks?.["actorState"]).toBeUndefined();
});

test("`autoLock:false` stamps NOTHING — the model-unreachable field (an item icon) pins no story write", async () => {
  const { chatId, game, service } = await seedGame();
  await service.patchActor({ principal: HOST, chatId, targetRef: MIRA, ops: [{ op: "addItem", item: { name: "Bone key" } }], autoLock: false });
  const snap = await resolveSnapshotForTurn(db, { id: game.id, chatId });
  const itemId = (snap?.actorState ?? [])[0]?.volatile.inventory[0]?.id ?? "";
  await service.patchActor({ principal: HOST, chatId, targetRef: MIRA, ops: [{ op: "patchItem", id: itemId, patch: { icon: "key" } }], autoLock: false });

  const after = await resolveSnapshotForTurn(db, { id: game.id, chatId });
  expect((after?.actorState ?? [])[0]?.volatile.inventory[0]?.icon).toBe("key");
  expect(after?.fieldLocks ?? {}).toStrictEqual({});
});

test("ops apply IN ORDER against one another (the batch is a sequence, not a set)", async () => {
  const { chatId, game, service } = await seedGame();
  await service.patchActor({
    principal: HOST,
    chatId,
    targetRef: MIRA,
    ops: [
      { op: "addCondition", condition: { name: "Chilled" } },
      { op: "setTracker", key: "trust", value: { value: 1 } },
      { op: "removeCondition", name: "Chilled" },
      { op: "setTracker", key: "trust", value: { max: 10 } },
    ],
  });
  const row = await miraRow(game, chatId);
  expect(row?.volatile.conditions).toEqual([]);
  // The second `setTracker` named only `max`: the reading beside it SURVIVED (a partial op is not a blank).
  expect(row?.volatile.trackerValues["trust"]).toStrictEqual({ value: 1, items: null, max: 10 });
});

test("a write on ONE actor leaves every other actor's row untouched (the additive plane, through the op door)", async () => {
  const { chatId, game, service } = await seedGame();
  await service.patchActor({
    principal: HOST,
    chatId,
    targetRef: { kind: "cast", castKey: "thorn" },
    ops: [{ op: "setWalletAmount", name: "gold", amount: 45 }],
  });
  await service.patchActor({ principal: HOST, chatId, targetRef: MIRA, ops: [{ op: "setTracker", key: "trust", value: { value: 4 } }] });

  const snap = await resolveSnapshotForTurn(db, { id: game.id, chatId });
  const byKey = new Map((snap?.actorState ?? []).map((a) => [a.actorRef.kind === "cast" ? a.actorRef.castKey : "", a]));
  expect(byKey.get("thorn")?.volatile.wallet).toEqual([{ name: "gold", amount: 45 }]);
  expect(byKey.get("mira")?.volatile.trackerValues["trust"]?.value).toBe(4);
});

test("an op naming a datum the actor does not carry is ERRORS-AS-DATA — no write, no slot, no bus event", async () => {
  const { chatId, game, service, fakes } = await seedGame();
  await service.patchActor({ principal: HOST, chatId, targetRef: MIRA, ops: [{ op: "setStatus", status: "wary" }] });
  const slotsBefore = fakes.narratorPosts.length;
  const eventsBefore = fakes.busEvents.length;

  const refused = await service.patchActor({ principal: HOST, chatId, targetRef: MIRA, ops: [{ op: "removeItem", id: "itm-ghost" }] });
  expect(refused.ok).toBe(false);
  expect(refused.ok === false && refused.reason).toContain("itm-ghost");

  const row = await miraRow(game, chatId);
  expect(row?.volatile.status).toBe("wary"); // the earlier write stands; the refused call wrote nothing
  expect(fakes.narratorPosts).toHaveLength(slotsBefore);
  expect(fakes.busEvents).toHaveLength(eventsBefore);
});

test("a refused op in the MIDDLE of a batch rolls the whole batch back (all of it or none of it)", async () => {
  const { chatId, game, service } = await seedGame();
  await service.patchActor({ principal: HOST, chatId, targetRef: MIRA, ops: [{ op: "setStatus", status: "wary" }] });

  const refused = await service.patchActor({
    principal: HOST,
    chatId,
    targetRef: MIRA,
    ops: [
      { op: "setStatus", status: "bleeding" },
      { op: "removeCondition", name: "Chilled" }, // never applied — she carries no such condition
      { op: "setTracker", key: "trust", value: { value: 9 } },
    ],
  });
  expect(refused.ok).toBe(false);

  const row = await miraRow(game, chatId);
  expect(row?.volatile.status).toBe("wary"); // NOT "bleeding" — the ops before the refusal are not half-written
  expect(row?.volatile.trackerValues["trust"]).toBeUndefined();
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// THE STALE-IMAGE CLOBBER (the review's §2 latent defect) — the reason this verb exists.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
test("a model flush landing between the panel's READ and the hand's WRITE survives the op (the old image clobbered it)", async () => {
  // The model flush writes mira's `status` + a condition the same way the appliers do (a whole-row patch
  // through the keyed-array merge). The host, meanwhile, is looking at a panel rendered BEFORE that flush.
  const flushed = {
    statePatch: {
      actorState: [
        {
          actorRef: MIRA,
          volatile: {
            trackerValues: { trust: { value: 4, items: null, max: null } },
            conditions: [{ name: "Bleeding", stat: null, modifier: 0, turnsLeft: null }],
            inventory: [],
            wallet: [],
            status: "bleeding badly",
          },
        },
      ],
    },
    journal: [],
  };
  const { chatId, game, service, h } = await seedGame({ toolRoundDelta: flushed });
  await pinExtractionMode(h, chatId, "cheap");

  // t0 — mira's standing row, and the PANEL READS it. This object is exactly what the retired image door
  // re-sent on every click: the whole row, as of the read. Seeded `autoLock:false` so the pins the gesture
  // under test stamps are the only ones in play (a `…status` pin would legitimately block the flush's status
  // write — that is manual-edit-wins doing its job, and it is not the race this test is about).
  await service.patchActor({
    principal: HOST,
    chatId,
    targetRef: MIRA,
    ops: [
      { op: "setStatus", status: "calm" },
      { op: "setTracker", key: "trust", value: { value: 4 } },
    ],
    autoLock: false,
  });
  const panelImage = await miraRow(game, chatId);
  expect(panelImage?.volatile.status).toBe("calm");

  // t1 — a turn completes and its state round flushes: mira is now bleeding and wounded. The slot must sit
  // AFTER the anchor the t0 hand write clone-forwarded onto (the harness mints anchors from seq 1000), or the
  // flush would write a snapshot the resolution ladder never resolves as head.
  const { messageId, variantId } = await seedMessage(db, chatId, 2000, { role: "assistant" });
  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, castId<ChatTurnId>("chat_turn_1"), turnConnection());
  expect((await miraRow(game, chatId))?.volatile.status).toBe("bleeding badly");

  // t2 — the host, still looking at the t0 panel, edits the ONE datum they touched: trust 4 → 7.
  await service.patchActor({ principal: HOST, chatId, targetRef: MIRA, ops: [{ op: "setTracker", key: "trust", value: { value: 7 } }] });

  const after = await miraRow(game, chatId);
  expect(after?.volatile.trackerValues["trust"]?.value).toBe(7); // the human's datum landed
  expect(after?.volatile.status).toBe("bleeding badly"); // …and the flush's status was NOT reverted to "calm"
  expect(after?.volatile.conditions.map((c) => c.name)).toEqual(["Bleeding"]); // …nor its condition dropped

  // THE CONTRAST — what the retired image door did with the same three events: the t0 image, merged onto the
  // post-flush head (hand-always-wins ⇒ `fieldLocks: null`, exactly as `applyHandEdit` called it), reverts the
  // status and removes the condition by omission from the stale nested array.
  // Both casts below are the production hand door's OWN (`snapshot-edit.ts` — the pure merge takes and returns
  // the state as plain JSON); nothing is fabricated here, the base is the real resolved row.
  const headRow = await resolveSnapshotForTurn(db, { id: game.id, chatId });
  const headBeforeHandWrite = { ...headRow } as unknown as Record<string, unknown>; // FABRICATION-OK: the real row, as the merge takes it
  const staleImage = {
    actorState: [{ ...panelImage, volatile: { ...panelImage?.volatile, trackerValues: { trust: { value: 7, items: null, max: null } } } }],
  };
  const clobbered = applyLockedPatch(headBeforeHandWrite, staleImage, null) as unknown as RpgSnapshotState; // FABRICATION-OK: the merge's own return cast
  const clobberedRow = clobbered.actorState.find((a) => a.actorRef.kind === "cast" && a.actorRef.castKey === "mira");
  expect(clobberedRow?.volatile.status).toBe("calm"); // the flush's status: gone
  expect(clobberedRow?.volatile.conditions).toEqual([]); // the flush's condition: gone
});
