// COMPOSED-REAL: the server graph loads in the untimed IMPORT phase, never inside the first test's timeout (#2386 — support/node/composed-real.ts).
import { FROZEN_AT_MS } from "@orb/testkit/iso/clock.ts";
import "@orb/testkit/node/composed-real.ts";
// entry/compose/rpg — the lite-rpg vertical, COMPOSED-REAL (docs/plans/rpg/design.md). The [compose-stub-goes-stale]/
// [ct-stub-lie] antidote: drive the domain end-to-end through the ACTUAL `buildRpg` wiring — the real
// `RpgService` over the real db, the real staging accumulator, the real `ChatRpgOps` flush, the REAL chat-side
// injected ops (setRpgPointer/resolveRpgRoster/getMembership) off `createServices`, and the REAL tool registry
// rpg registered its 7 state tools into. Two turns are proven:
//
//   • CHEAP tool turn — createGame (real, writes the game row + the opaque pointer through chat's real
//     setRpgPointer) → execute the REAL registered `update_scene` tool via the ONE tool-use registry (stages) →
//     `onTurnCompleted` flush (the real chatOps) → the snapshot lands on the committed variant + the pointer is
//     projected on ChatDetail + the bus emits fire through the REAL `publishRpgEvent` singleton.
//   • STRUCTURED extraction turn — a `buildRpg` over the real graph's chat ops + db but a FAKE executor
//     returning a CANNED structured extraction (NEVER a live model — memory: never-run-engine-launcher-live).
//     Since the `reliable` MODE was deleted (owner ruling 2026-08-01) the structured emission is reached the way
//     it is reached in production: a `cheap` round on an AGENT-SDK wire, which carries no `tools[]` and so
//     degrades inside `runToolRound` to one structured call. The real impl parses it, folds it to a delta,
//     stages + flushes it — the real fold + accumulator + flush path.
//   • FOLDED turn (R1) — the real `buildFoldedTurn` + `foldTurnToolCalls` over the same graph, driven with the
//     calls a character turn co-emitted. Its defining assertion is a NEGATIVE one: the executor spy stays EMPTY,
//     so the second model call is provably gone. The degrade matrix (malformed arg · ghost actor · zero calls)
//     lands here too — each with the narrative already committed, so none of them may fail or block anything.

import type { RpgBusEvent, RpgSnapshotState } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import { characters, chatParticipants, ownerStats } from "@orb/db";
import type { ChatId, Handle } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { ServicesResult } from "@orb/server/entry/compose";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { and, eq, isNull } from "drizzle-orm";
import { subscribeRpgEvents } from "#server/domain/rpg/index.ts";
import { seedCharacter, seedChat, seedMessage, seedParticipant, seedUser } from "../../domain/chat/_support.ts";
import {
  buildCannedRpg,
  buildCannedRpgWithText,
  commitSnapshotForVariant,
  defaultSnapshotState,
  emptySpy,
  hostPrincipal,
  rpgPromotionProvenance,
  seedHostGameChat,
  TURN,
  tc,
  transcript,
  writeStagedSnapshot,
} from "./_rpg-support.ts";

/** Collect rpg-bus events off the REAL singleton for a chat, until `signal` aborts. The caller owns `done`
 * so an unexpected iterator failure fails the test that started the collector. */
function collectBus(chatId: ChatId, signal: AbortSignal): { readonly events: RpgBusEvent[]; readonly done: Promise<void> } {
  const seen: RpgBusEvent[] = [];
  const done = (async (): Promise<void> => {
    try {
      for await (const event of subscribeRpgEvents(chatId, signal)) {
        seen.push(event);
      }
    } catch (err) {
      if (!signal.aborted) {
        throw err;
      }
    }
  })();
  return { events: seen, done };
}

// 30s: the composed-real graph (full createServices) + a real tool turn is heavy under parallel load — this
// FIRST test pays the whole fixture warm-up for the file, and it was landing within a hair of the old 20s cap.
test("CHEAP turn — createGame + a real tool turn flush lands state + the pointer + bus emits (composed-real)", { timeout: 30_000 }, async ({
  app,
  services,
  db,
}) => {
  const { chatId, hostId } = await seedHostGameChat(db, "cheap");
  const bus = new AbortController();
  const collector = collectBus(chatId, bus.signal);
  const { events } = collector;

  // createGame through the REAL service — writes the game row AND the opaque pointer via chat's real setRpgPointer.
  const created = await services.rpg.createGame({ principal: await hostPrincipal(db, hostId), chatId, mode: "lite" });
  await services.rpg.updateConfig({ principal: await hostPrincipal(db, hostId), chatId, extractionMode: "cheap" });

  // The pointer is projected onto ChatDetail (the client's takeover gate reads it off data it already holds).
  const detail = await services.chat.getChat({ principal: await hostPrincipal(db, hostId), chatId });
  expect(detail.rpg).toEqual({ gameId: created.gameId, engaged: true }); // born engaged (#40)

  // A committed assistant slot the flush keys the snapshot to.
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "They enter the cave." });

  // Execute the REAL registered `update_scene` tool through the ONE tool-use registry (stages into the real
  // accumulator) — proving the compose tool-registration is LIVE (not a stub of it).
  // Driver-scoped since #677; `update_scene` is a BUILTIN, so it lives on the ownerless shelf every driver
  // falls back to — the host resolves it exactly as anyone else would.
  const set = app.toolUse.resolveTools(hostId, ["update_scene"]);
  const records = await app.toolUse.executeToolCalls(
    set,
    [{ toolCallId: "call_1", name: "update_scene", arguments: JSON.stringify({ location: "the cave mouth", recentEvent: "entered the cave" }) }],
    { principal: await hostPrincipal(db, hostId), triggeredBy: hostId, chatId, turnId: TURN, membership: null },
  );
  expect(records[0]?.isError).toBe(false); // the real handler staged the scene write (errors-as-data would set true)

  // Flush the turn through the REAL chatOps — the staged write becomes the committed variant's snapshot. The
  // turn connection is a cheap-WRITER (so the F2 readonly gate passes); the dedicated tool round then fires
  // against the real (credential-less, vllm-disabled) executor, throws, is caught (errors-as-data → empty
  // delta), and the pre-staged `update_scene` write is what flushes — proving the registry+flush seam is live.
  await app.rpgChatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("chat-completions"));

  // State landed — read it back through the REAL tracker view (roster ∪ sheets, resolved-current snapshot).
  const view = await services.rpg.getTrackerView({ principal: await hostPrincipal(db, hostId), chatId });
  expect(view.ambient?.location).toBe("the cave mouth");
  expect(view.recentBeats).toContain("entered the cave");

  // The §4.9 emits fired through the REAL bus singleton: gameChanged (create + config) then snapshotPatched.
  await Promise.resolve(); // let the microtask-queued bus fan-out settle
  bus.abort();
  await collector.done;
  expect(events.some((e) => e.type === "gameChanged")).toBe(true);
  expect(events.some((e) => e.type === "snapshotPatched")).toBe(true);
});

test("createGame on an unsent room claims it into the host's Chats list (composed-real)", async ({ services, db }) => {
  const hostId = await seedUser(db, castId<Handle>("rpghost_husk"));
  const chatId = await seedChat(db, "husk", { startedAt: null });
  await seedParticipant(db, { chatId, key: "husk_host", userId: hostId, role: "host", joinSeq: 0 });
  const listed = async (): Promise<{ readonly ids: readonly ChatId[]; readonly totalCount: number }> => {
    const page = await services.chat.listChats({ principal: await hostPrincipal(db, hostId) });
    return { ids: page.items.map((c) => c.id), totalCount: page.totalCount };
  };
  expect(await listed()).toStrictEqual({ ids: [], totalCount: 0 });

  await services.rpg.createGame({ principal: await hostPrincipal(db, hostId), chatId, mode: "lite" });

  expect(await listed()).toStrictEqual({ ids: [chatId], totalCount: 1 });
});

test("a start-as-game room the host edits is claimed: listed, and the nav-away reap leaves it (composed-real)", async ({ services, db }) => {
  const hostId = await seedUser(db, castId<Handle>("rpghost_startgame"));
  const principal = await hostPrincipal(db, hostId);
  const characterId = await seedCharacter(db, hostId, "startgame", { id: mintTypeId(ID_PREFIX.character) });
  const { chat } = await services.chat.startChat({ principal, characterIds: [characterId], opening: "none", startAsGame: {} });
  const listedIds = async (): Promise<readonly ChatId[]> => (await services.chat.listChats({ principal })).items.map((c) => c.id);
  expect(await listedIds()).toStrictEqual([]);

  await services.rpg.patchSheet({ principal, chatId: chat.id, actorRef: { kind: "user", userId: hostId }, patch: { className: "Warden" } });
  expect(await listedIds()).toStrictEqual([chat.id]);

  await services.chat.reapHusk({ principal, chatId: chat.id });
  expect(await listedIds()).toStrictEqual([chat.id]);
});

// The chat-side write is a title rather than a send: a send needs a bound model connection this graph lacks, and
// a title claims through the same chat-service chokepoint a send does.
test("a chat write racing createGame on an unsent room replays the creation stats once (one shared claim)", async ({ services, db }) => {
  const hostId = await seedUser(db, castId<Handle>("rpghost_race"));
  const chatId = await seedChat(db, "race", { startedAt: null, id: mintTypeId(ID_PREFIX.chat) });
  await seedParticipant(db, { chatId, key: "race_host", userId: hostId, role: "host", joinSeq: 0 });
  const principal = await hostPrincipal(db, hostId);

  await Promise.all([services.chat.updateTitle({ principal, chatId, title: "We ride at dawn" }), services.rpg.createGame({ principal, chatId, mode: "lite" })]);

  const stats = await db.select({ chats: ownerStats.chats }).from(ownerStats).where(eq(ownerStats.ownerId, hostId));
  expect(stats).toStrictEqual([{ chats: 1 }]);
});

async function provePlantedPromotionRecovery(args: {
  readonly db: Db;
  readonly services: ServicesResult["services"];
  readonly key: string;
  readonly seatBeforeRetry: boolean;
}): Promise<{ readonly markedCards: number; readonly liveSeats: number; readonly characterActors: number; readonly castActors: number }> {
  const { db, services, key, seatBeforeRetry } = args;
  const { chatId, hostId } = await seedHostGameChat(db, key);
  const principal = await hostPrincipal(db, hostId);
  await services.rpg.createGame({ principal, chatId, mode: "lite" });
  await services.rpg.editSnapshot({ principal, chatId, patch: { presentCharacters: ["npc:vesna"] } });
  await services.rpg.patchActor({
    principal,
    chatId,
    targetRef: { kind: "npc", npcKey: "vesna" },
    ops: [{ op: "setIdentityText", field: "name", text: "Sister Vesna" }],
  });

  // Plant the exact production result after the card step. The second arm additionally plants the seat step;
  // neither calls the RPG verb until the interrupted durable prefix exists in the fresh database.
  const provenance = rpgPromotionProvenance(chatId, "npc:vesna");
  const card = await services.character.create({
    principal,
    input: { handle: castId("sister-vesna"), name: "Sister Vesna", description: "" },
    provenance,
  });
  if (seatBeforeRetry) {
    await services.chat.addCharacterToChat({ principal, chatId, characterId: card.id });
  }

  await expect(services.rpg.promoteActor({ principal, chatId, targetRef: { kind: "npc", npcKey: "vesna" } })).resolves.toEqual({ ok: true, issues: [] });

  const markedCards = await db
    .select({ id: characters.id })
    .from(characters)
    .where(and(eq(characters.ownerId, hostId), eq(characters.importHash, provenance.importHash)));
  expect(markedCards).toEqual([{ id: card.id }]);
  const seats = await db
    .select({ characterId: chatParticipants.characterId })
    .from(chatParticipants)
    .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.characterId, card.id), isNull(chatParticipants.leftSeq)));
  expect(seats).toEqual([{ characterId: card.id }]);
  const view = await services.rpg.getTrackerView({ principal, chatId });
  return {
    markedCards: markedCards.length,
    liveSeats: seats.length,
    characterActors: view.actors.filter((actor) => actor.actorRef.kind === "character" && actor.actorRef.characterId === card.id).length,
    castActors: view.actors.filter((actor) => actor.actorRef.kind === "npc" && actor.actorRef.npcKey === "vesna").length,
  };
}

test("#723 composed-real promotion retries from a planted card-only durable prefix", async ({ db, services }) => {
  await expect(provePlantedPromotionRecovery({ db, services, key: "promote_card_only", seatBeforeRetry: false })).resolves.toEqual({
    markedCards: 1,
    liveSeats: 1,
    characterActors: 1,
    castActors: 0,
  });
});

test("#723 composed-real promotion retries from a planted card-and-seat durable prefix", async ({ db, services }) => {
  await expect(provePlantedPromotionRecovery({ db, services, key: "promote_card_seat", seatBeforeRetry: true })).resolves.toEqual({
    markedCards: 1,
    liveSeats: 1,
    characterActors: 1,
    castActors: 0,
  });
});

test("CHEAP turn (tool-round arm) — a wire that CAN carry tools rides them, never the structured dispatcher", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "cheap-toolround");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy,
    cannedText: "{}",
    cannedToolCalls: [{ name: "update_scene", arguments: JSON.stringify({ location: "the obsidian tower", recentEvent: "arrived at the tower" }) }],
  });

  await rpgCompose.service.createGame({ principal: await hostPrincipal(db, hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: await hostPrincipal(db, hostId), chatId, extractionMode: "cheap" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "They arrive at the tower." });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("chat-completions"));

  // The chat arm fired carrying WIRE TOOLS and no responseFormat; the `structured` dispatcher was NOT touched.
  // (With the `reliable` mode deleted, the dispatcher is the host RESYNC's arm only — pinned further below.)
  expect(spy.summarizeModels).toEqual([]);
  expect(spy.chatTurns).toEqual([{ model: "fake-chat-model", hasResponseFormat: false, hasToolServer: false }]);
  expect(spy.wireTools[0]?.map((t) => t.name)).toContain("update_scene");

  const view = await rpgCompose.service.getTrackerView({ principal: await hostPrincipal(db, hostId), chatId });
  expect(view.ambient?.location).toBe("the obsidian tower");
  expect(view.recentBeats).toContain("arrived at the tower");
});

test("CHEAP turn repairs a named existing item's omitted move with one inventory-only audit", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "cheap-inventory-audit");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy,
    cannedText: "{}",
    cannedToolCalls: [{ name: "update_scene", arguments: JSON.stringify({ recentEvent: "Mira pocketed the small brass key" }) }],
    inventoryAuditToolCalls: [
      {
        name: "update_inventory",
        arguments: JSON.stringify({ targetRef: "Mira", update: [{ name: "Small brass key", location: "front hoodie pocket" }] }),
      },
    ],
  });

  const { gameId } = await rpgCompose.service.createGame({ principal: await hostPrincipal(db, hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: await hostPrincipal(db, hostId), chatId, extractionMode: "cheap" });
  const base = await seedMessage(db, chatId, 1, { role: "assistant", content: "Mira eyes the key." });
  const state: RpgSnapshotState = {
    ...defaultSnapshotState(),
    actorState: [
      {
        actorRef: { kind: "npc", npcKey: "mira" },
        identity: { name: "Mira", emoji: "", mood: "", relationship: { kind: "neutral", label: "" } },
        volatile: {
          trackerValues: {},
          conditions: [],
          inventory: [{ id: "item_brass_key", name: "Small brass key", description: "a worn key", quantity: 1, location: "table", type: "key" }],
          wallet: [],
          status: "",
        },
      },
    ],
  };
  const written = await writeStagedSnapshot(db, state, {
    id: castId("rpg_snapshot_inventory_audit"),
    gameId,
    messageId: base.messageId,
    variantId: base.variantId,
    now: FROZEN_AT_MS,
  });
  expect(written.ok).toBe(true);
  await commitSnapshotForVariant(db, base.variantId);

  const turn = await seedMessage(db, chatId, 2, { role: "assistant", content: "Mira slips the small brass key into her hoodie pocket." });
  await rpgCompose.chatOps.onTurnCompleted(
    chatId,
    turn.messageId,
    turn.variantId,
    TURN,
    tc("chat-completions", { transcript: transcript([{ speaker: "Narrator", text: "Mira slips the small brass key into her hoodie pocket." }]) }),
  );

  expect(spy.chatTurns).toHaveLength(2);
  expect(spy.wireTools[1]?.map((tool) => tool.name)).toEqual(["update_inventory", "no_changes"]);
  const view = await rpgCompose.service.getTrackerView({ principal: await hostPrincipal(db, hostId), chatId });
  expect(view.actors.find((actor) => actor.name === "Mira")?.volatile?.inventory).toEqual([
    expect.objectContaining({ name: "Small brass key", location: "front hoodie pocket" }),
  ]);
});

test("CHEAP turn (agent-sdk degrade) — a wire with no `tools[]` runs ONE structured CHAT call instead", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "cheap-agent");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "agent-sdk", spy);

  await rpgCompose.service.createGame({ principal: await hostPrincipal(db, hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: await hostPrincipal(db, hostId), chatId, extractionMode: "cheap" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "They arrive at the tower." });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("agent-sdk"));

  // ONE structured call fired, the same side-generation turn every api takes, with a response format and no tool
  // server (read-only structured emission, firewall intact); no tool round ran.
  expect(spy.summarizeModels).toEqual(["fake-chat-model"]);
  expect(spy.chatTurns).toEqual([]);

  // IDENTICAL state lands via the structured call (same canned delta, one fold path).
  const view = await rpgCompose.service.getTrackerView({ principal: await hostPrincipal(db, hostId), chatId });
  expect(view.ambient?.location).toBe("the obsidian tower");
  const journal = await rpgCompose.service.listJournal({ principal: await hostPrincipal(db, hostId), chatId, limit: 50 });
  expect(journal.map((j) => j.title)).toContain("Arrival");
});
