// COMPOSED-REAL: the server graph loads in the untimed IMPORT phase, never inside the first test's timeout (#2386 — support/node/composed-real.ts).
// @subject packages/server/src/domain/rpg/tools/rounds/delivery.ts
import "@orb/testkit/node/composed-real.ts";

// entry/compose/rpg — patch-reply drops, the room window and overflow notices, hidden spans in NPC names and the persisted ability roll.

import type { Principal } from "@orb/contracts/identity";
import type { RpgSnapshotState } from "@orb/contracts/rpg";
import { RPG_STATE_ROUND_FAILED_SUMMARY } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import { connectionBindings, userConnections } from "@orb/db";
import type { ChatRequest } from "@orb/inference";
import { forcesToolRound } from "@orb/inference";
import type { ChatId, Handle } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { ServicesResult } from "@orb/server/entry/compose";
import { logger } from "@orb/server/foundation/observability";
import { makeCapability, makeGenerationCapability, makeResolved, TEST_CONNECTION_ID } from "@orb/testkit/node/factories/resolved-connection.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { vi } from "vitest";
// @orb-waive-file no-test-fabrication({ droppedFields?: unknown }): baselined when the gate widened to value casts; burn-down item 906.
// @orb-waive-file no-test-fabrication({ event?: string; code?: string }): baselined when the gate widened to value casts; burn-down item 906.
// @orb-waive-file no-test-fabrication({ properties: { changes: { items: { anyOf: { properties: { tool: { enum: string[] } } }[] } } } }): baselined when the gate widened to value casts; burn-down item 906.
import { stateRoundNeededTokens } from "#server/domain/rpg/substrate/state-round-fit.ts";
import { FROZEN_AT, seedCharacter, seedMessage, seedParticipant, seedUser } from "../../domain/chat/_support.ts";
import type { buildRpg } from "./_rpg-support.ts";
import {
  buildCannedRpgWithText,
  cheapGame,
  commitSnapshotForVariant,
  defaultSnapshotState,
  emptySpy,
  findSnapshotByVariant,
  findTurnToolCallsByVariant,
  hostPrincipal,
  STATE_ROUND_ROWS,
  seedHostGameChat,
  stateRoundTurn,
  TURN,
  tc,
  transcript,
  writeStagedSnapshot,
} from "./_rpg-support.ts";

// ── 0511 (verifier round 1) ─────────────────────────────────────────────────────────────────────────────────────

test("0511: a patch reply naming a prototype key drops that field by name and still lands the rest — the round never throws", async ({ app, db }) => {
  const warn = vi.spyOn(logger, "warn");
  const reply = JSON.stringify({
    changes: [
      { plane: "update_scene", call: 0, field: "constructor", item: 0, value: "x" },
      { plane: "update_scene", call: 0, field: "location", item: 0, value: "the inn" },
    ],
  });
  const rpgCompose = buildCannedRpgWithText({ app, db, api: "chat-completions", spy: emptySpy(), cannedText: reply, cannedToolCalls: [] });
  const { chatId, hostId, messageId, variantId } = await cheapGame(db, rpgCompose, "proto-field");

  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, stateRoundTurn(STATE_ROUND_ROWS.claudeNoForce));

  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(view.ambient?.location).toBe("the inn");
  expect(warn.mock.calls.some(([line]) => JSON.stringify((line as { droppedFields?: unknown }).droppedFields) === '["update_scene.constructor"]')).toBe(true);
  // The durable record names the cause and keeps the entry as sent, beside the call that applied.
  const [record] = await findTurnToolCallsByVariant(db, variantId);
  expect(record?.calls).toEqual([
    expect.objectContaining({ name: "update_scene", args: '{"location":"the inn"}', verdict: "applied" }),
    {
      name: "update_scene",
      args: JSON.stringify([{ plane: "update_scene", call: 0, field: "constructor", item: 0, value: "x" }]),
      verdict: "dropped",
      issues: ['(field): update_scene has no such field, so this value was dropped — sent {"field":"constructor","value":"x"}'],
    },
  ]);
  warn.mockRestore();
});

test("0511: a structured reply that splits one scene update across calls lands every field on the panel", async ({ app, db }) => {
  const reply = JSON.stringify({
    changes: [
      { plane: "update_scene", call: 0, field: "location", item: 0, value: "the inn" },
      { plane: "update_scene", call: 1, field: "weather.type", item: 0, value: "rain" },
      { plane: "update_scene", call: 2, field: "recentEvent", item: 0, value: "Mira lit the lamps." },
    ],
  });
  const rpgCompose = buildCannedRpgWithText({ app, db, api: "chat-completions", spy: emptySpy(), cannedText: reply, cannedToolCalls: [] });
  const { chatId, hostId, messageId, variantId } = await cheapGame(db, rpgCompose, "split-scene");

  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, stateRoundTurn(STATE_ROUND_ROWS.claudeNoForce));

  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(view.ambient).toMatchObject({ location: "the inn", weather: expect.objectContaining({ type: "rain" }) });
  expect(view.recentBeats).toContain("Mira lit the lamps.");
});

test("0511: a patch reply naming only tools the round does not offer has no usable call, so the round fails", async ({ app, db }) => {
  const reply = JSON.stringify({ changes: [{ plane: "hack_db", call: 0, field: "x", item: 0, value: "y" }] });
  const rpgCompose = buildCannedRpgWithText({ app, db, api: "chat-completions", spy: emptySpy(), cannedText: reply, cannedToolCalls: [] });
  const { chatId, messageId, variantId } = await cheapGame(db, rpgCompose, "patch-unoffered");

  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, stateRoundTurn(STATE_ROUND_ROWS.claudeNoForce));

  expect(await findSnapshotByVariant(db, variantId)).toBeUndefined();
  const [record] = await findTurnToolCallsByVariant(db, variantId);
  expect(record?.failure).toContain(RPG_STATE_ROUND_FAILED_SUMMARY);
});

test("0511: a game asking for `structured` on a row with no structured output runs tool calls and WARNS with a named code", async ({ app, db }) => {
  const warn = vi.spyOn(logger, "warn");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy,
    cannedText: "{}",
    cannedToolCalls: [{ name: "no_changes", arguments: "{}" }],
  });
  const { chatId, messageId, variantId } = await cheapGame(db, rpgCompose, "knob-unavailable", "structured");
  const toolsOnly = makeGenerationCapability({ output: { maxTokens: { min: 1, max: 4096 }, modalities: ["text"] }, tools: { parallel: true } });

  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, stateRoundTurn(toolsOnly));

  expect(spy.chatTurns).toHaveLength(1);
  expect(spy.summarizeModels).toEqual([]);
  expect(warn.mock.calls.map(([line]) => line as { event?: string; code?: string })).toContainEqual(
    expect.objectContaining({ event: "rpg.toolround.vehicle_fallback", code: "structured-unavailable" }),
  );
  warn.mockRestore();
});

test("0511: a structured round that skipped a named existing item runs the inventory audit in its own structured shape", async ({ app, db }) => {
  const spy = emptySpy();
  const rpgCompose = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy,
    cannedText: "{}",
    structuredReplies: [
      JSON.stringify({ changes: [{ tool: "update_scene", args: { recentEvent: "Mira pocketed the small brass key" } }] }),
      JSON.stringify({
        changes: [{ tool: "update_inventory", args: { targetRef: "Mira", update: [{ name: "Small brass key", location: "front hoodie pocket" }] } }],
      }),
    ],
  });
  const seeded = await seedHostGameChat(db, "sr-audit");
  const created = await rpgCompose.service.createGame({ principal: hostPrincipal(seeded.hostId), chatId: seeded.chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(seeded.hostId), chatId: seeded.chatId, extractionMode: "cheap" });
  const base = await seedMessage(db, seeded.chatId, 1, { role: "assistant", content: "Mira eyes the key." });
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
  expect(
    (
      await writeStagedSnapshot(db, state, {
        id: castId("rpg_snapshot_sr_audit"),
        gameId: created.gameId,
        messageId: base.messageId,
        variantId: base.variantId,
        now: FROZEN_AT,
      })
    ).ok,
  ).toBe(true);
  await commitSnapshotForVariant(db, base.variantId);
  const turn = await seedMessage(db, seeded.chatId, 2, { role: "assistant", content: "Mira slips the small brass key into her hoodie pocket." });

  await rpgCompose.chatOps.onTurnCompleted(seeded.chatId, turn.messageId, turn.variantId, TURN, {
    ...stateRoundTurn(STATE_ROUND_ROWS.local),
    transcript: transcript([{ speaker: "Narrator", text: "Mira slips the small brass key into her hoodie pocket." }]),
  });

  expect(spy.chatTurns).toEqual([]);
  expect(spy.summarizeModels).toHaveLength(2);
  const audit = spy.schemas[1] as { properties: { changes: { items: { anyOf: { properties: { tool: { enum: string[] } } }[] } } } };
  expect(audit.properties.changes.items.anyOf.map((member) => member.properties.tool.enum[0])).toEqual(["update_inventory", "no_changes"]);
  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(seeded.hostId), chatId: seeded.chatId });
  expect(view.actors.find((actor) => actor.name === "Mira")?.volatile?.inventory).toEqual([
    expect.objectContaining({ name: "Small brass key", location: "front hoodie pocket" }),
  ]);
});

test("0511: the panel's game read names a `structured` knob the room's model cannot honour; with structured output it does not", async ({ app, db }) => {
  const toolsOnly = makeGenerationCapability({ output: { maxTokens: { min: 1, max: 4096 }, modalities: ["text"] }, tools: { parallel: true } });
  const unable = buildCannedRpgWithText({ app, db, api: "chat-completions", spy: emptySpy(), cannedText: "{}", capability: toolsOnly });
  const a = await cheapGame(db, unable, "panel-unavailable", "structured");
  expect((await unable.service.getGame({ principal: hostPrincipal(a.hostId), chatId: a.chatId })).effectiveDelivery).toEqual({
    path: "tool-round",
    fallbackReason: null,
    structuredUnavailable: true,
    stateRoundOverflow: null,
  });

  const able = buildCannedRpgWithText({ app, db, api: "chat-completions", spy: emptySpy(), cannedText: "{}" });
  const b = await cheapGame(db, able, "panel-available", "structured");
  expect((await able.service.getGame({ principal: hostPrincipal(b.hostId), chatId: b.chatId })).effectiveDelivery).toEqual({
    path: "tool-round",
    fallbackReason: null,
    structuredUnavailable: false,
    stateRoundOverflow: null,
  });
});

// An unpinned Ollama model resolves to its lowest default window, and the round's own request does not fit it: state
// capture would drop every turn. The game read names the viewer's connection instead of raising the window behind the
// host's back; the same game on that connection with a larger declared window reads clean.
test("0532: a state round that cannot fit the connection's window is named on the game read; a larger declared window clears it", async ({ app, db }) => {
  const withWindow = (window: number): ReturnType<typeof makeGenerationCapability> =>
    makeGenerationCapability({
      output: { maxTokens: { min: 1, max: 4096 }, structured: true, modalities: ["text"] },
      tools: { parallel: true },
      context: { window },
    });
  const unpinned = buildCannedRpgWithText({ app, db, api: "chat-completions", spy: emptySpy(), cannedText: "{}", capability: withWindow(4096) });
  const game = await cheapGame(db, unpinned, "window-unpinned");
  const read = { principal: hostPrincipal(game.hostId), chatId: game.chatId };
  expect((await unpinned.service.getGame(read)).effectiveDelivery.stateRoundOverflow).toEqual({ connectionId: TEST_CONNECTION_ID, windowTokens: 4096 });

  const declared = buildCannedRpgWithText({ app, db, api: "chat-completions", spy: emptySpy(), cannedText: "{}", capability: withWindow(16_384) });
  expect((await declared.service.getGame(read)).effectiveDelivery.stateRoundOverflow).toBeNull();

  // A folding room runs no post-commit round, so there is nothing to fit even on the small window.
  await unpinned.service.updateConfig({ ...read, extractionMode: "folded" });
  expect((await unpinned.service.getGame(read)).effectiveDelivery).toMatchObject({ path: "folded", stateRoundOverflow: null });
});

// On Ollama's native route the turn sends the preset's Max context as `num_ctx`, so the round is priced against that
// window: a preset that raises it clears the notice the server's floor would raise.
test("0532: on a route that sends the window, the overflow notice prices the preset's Max context, not the floor", async ({ app, db }) => {
  const floor = makeGenerationCapability({
    output: { maxTokens: { min: 1, max: 4096 }, structured: true, modalities: ["text"] },
    tools: { parallel: true },
    context: { window: 4096, windowEstimated: true, settable: { max: 32_768 } },
  });
  const unset = buildCannedRpgWithText({ app, db, api: "chat-completions", spy: emptySpy(), cannedText: "{}", capability: floor });
  const game = await cheapGame(db, unset, "window-settable");
  const read = { principal: hostPrincipal(game.hostId), chatId: game.chatId };
  expect((await unset.service.getGame(read)).effectiveDelivery.stateRoundOverflow).toEqual({ connectionId: TEST_CONNECTION_ID, windowTokens: 4096 });

  const raised = buildCannedRpgWithText({ app, db, api: "chat-completions", spy: emptySpy(), cannedText: "{}", capability: floor, presetMaxContext: 16_384 });
  expect((await raised.service.getGame(read)).effectiveDelivery.stateRoundOverflow).toBeNull();
});

/** An unpinned Ollama model on its native route: the server's 4096 floor, a 32768 trained maximum. */
const OLLAMA_FLOOR = makeGenerationCapability({
  output: { maxTokens: { min: 1, max: 4096 }, structured: true, modalities: ["text"] },
  tools: { parallel: true },
  context: { window: 4096, windowEstimated: true, settable: { max: 32_768 } },
});

// A host resync reads up to 16384 tokens of story; on a route that sends the window it must send the room's own,
// or the server cuts the story at its floor while the turn and the overflow notice say it fits.
test("0532: a host resync and populate send the room preset's Max context as the window, not the server's floor", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "resync-window");
  const principal = hostPrincipal(hostId);
  const spy = emptySpy();
  const compose = buildCannedRpgWithText({ app, db, api: "chat-completions", spy, cannedText: "{}", capability: OLLAMA_FLOOR, presetMaxContext: 16_384 });
  await compose.service.createGame({ principal, chatId, mode: "lite" });
  const characterId = await seedCharacter(db, hostId, "resync_window_mira", { id: mintTypeId(ID_PREFIX.character) });
  await seedParticipant(db, { chatId, key: "resync_window_char", characterId, joinSeq: 1 });

  await compose.service.resyncFromStory({ principal, chatId });
  await compose.service.populateFromCharacter({ principal, chatId, actorRef: { kind: "character", characterId } });

  expect(spy.windows.length).toBeGreaterThanOrEqual(2);
  expect(new Set(spy.windows)).toEqual(new Set([16_384]));
});

/** A cheap game whose host and one member each bind their own chat connection: the host's from `host`, the
 *  member's from `member`. Returns both read principals. */
async function hostAndMemberGame(
  args: { readonly app: ServicesResult; readonly db: Db },
  key: string,
  connections: { readonly host: ReturnType<typeof makeResolved>; readonly member: ReturnType<typeof makeResolved> },
): Promise<{ readonly rpgCompose: ReturnType<typeof buildRpg>; readonly host: Principal; readonly member: Principal; readonly chatId: ChatId }> {
  const memberId = await seedUser(args.db, castId<Handle>(`${key}_member`));
  const rpgCompose = buildCannedRpgWithText({
    ...args,
    api: "chat-completions",
    spy: emptySpy(),
    cannedText: "{}",
    resolvedFor: (userId) => (userId === memberId ? connections.member : connections.host),
  });
  const game = await cheapGame(args.db, rpgCompose, key);
  await seedParticipant(args.db, { chatId: game.chatId, key: `${key}_member`, userId: memberId, role: "member", joinSeq: 1 });
  return { rpgCompose, host: hostPrincipal(game.hostId), member: hostPrincipal(memberId), chatId: game.chatId };
}

function chatConnection(window: number, tools: boolean): ReturnType<typeof makeResolved> {
  return makeResolved({
    api: "chat-completions",
    connectionId: mintTypeId(ID_PREFIX.userConnection),
    capability: makeCapability(
      makeGenerationCapability({
        output: { maxTokens: { min: 1, max: 4096 }, structured: tools, modalities: ["text"] },
        ...(tools ? { tools: { parallel: true } } : {}),
        context: { window },
      }),
    ),
  });
}

// The state round rides the turn's connection, and a turn is funded by the room's host whoever sends it. So the
// read prices the HOST's connection and tells only the host: a member cannot change the host's window, and their
// own connection never runs the round.
test("0532: the overflow notice prices the host's connection and reaches only the host", async ({ app, db }) => {
  const roomy = await hostAndMemberGame({ app, db }, "fit-roomy-host", { host: chatConnection(32_768, true), member: chatConnection(4096, true) });
  expect((await roomy.rpgCompose.service.getGame({ principal: roomy.member, chatId: roomy.chatId })).effectiveDelivery.stateRoundOverflow).toBeNull();
  expect((await roomy.rpgCompose.service.getGame({ principal: roomy.host, chatId: roomy.chatId })).effectiveDelivery.stateRoundOverflow).toBeNull();

  const hostConnection = chatConnection(4096, true);
  const cramped = await hostAndMemberGame({ app, db }, "fit-cramped-host", { host: hostConnection, member: chatConnection(32_768, true) });
  expect((await cramped.rpgCompose.service.getGame({ principal: cramped.host, chatId: cramped.chatId })).effectiveDelivery.stateRoundOverflow).toEqual({
    connectionId: hostConnection.connectionId,
    windowTokens: 4096,
  });
  expect((await cramped.rpgCompose.service.getGame({ principal: cramped.member, chatId: cramped.chatId })).effectiveDelivery.stateRoundOverflow).toBeNull();
});

// The delivery verdicts describe what the next turn does, and the next turn runs on the host's connection: a member
// whose own connection has no write path still reads the room as writing its state.
test("0532: a member's game and tracker reads carry the host connection's delivery verdict, not their own", async ({ app, db }) => {
  const room = await hostAndMemberGame({ app, db }, "verdict-host", { host: chatConnection(32_768, true), member: chatConnection(32_768, false) });
  const read = { principal: room.member, chatId: room.chatId };
  expect((await room.rpgCompose.service.getGame(read)).trackersReadOnly).toBe(false);
  expect((await room.rpgCompose.service.getTrackerView(read)).trackersReadOnly).toBe(false);
});

// An NPC key is an address every viewer receives, and the member belt rewrites values, not addresses: a hidden span
// in a model-written name must be gone before the name becomes a key.
test("0536: a hidden span in a model-written NPC name never reaches a member through the actor's key", async ({ app, db }) => {
  // One word, so the slug's hyphenation cannot hide it from the byte check.
  const truth = "informant";
  const name = `Mara <lie truth="${truth}"/>`;
  const memberId = await seedUser(db, castId<Handle>("npc_key_member"));
  const rpgCompose = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy: emptySpy(),
    cannedText: "{}",
    cannedToolCalls: [{ name: "update_scene", arguments: JSON.stringify({ presentUpsert: [{ name, mood: "calm" }] }) }],
  });
  const { chatId, hostId, messageId, variantId } = await cheapGame(db, rpgCompose, "npc-key-lie");
  await seedParticipant(db, { chatId, key: "npc_key_member", userId: memberId, role: "member", joinSeq: 1 });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("chat-completions"));

  const memberView = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(memberId), chatId });
  const hostView = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(JSON.stringify(memberView)).not.toContain(truth);
  // One address for every viewer; the host still reads the name the model wrote.
  expect(memberView.cast).toEqual(["npc:mara"]);
  expect(hostView.cast).toEqual(memberView.cast);
  expect(hostView.actors.find((actor) => actor.actorRef.kind === "npc")).toMatchObject({ actorRef: { kind: "npc", npcKey: "mara" }, name });
});

test("0511: a patch reply whose every value was refused is a recorded DROP naming the value sent — never a quiet beat", async ({ app, db }) => {
  const reply = JSON.stringify({ changes: [{ plane: "update_scene", call: 0, field: "timeOfDay", item: 0, value: "Evening" }] });
  const rpgCompose = buildCannedRpgWithText({ app, db, api: "chat-completions", spy: emptySpy(), cannedText: reply, cannedToolCalls: [] });
  const { chatId, messageId, variantId } = await cheapGame(db, rpgCompose, "patch-refused");

  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, stateRoundTurn(STATE_ROUND_ROWS.claudeNoForce));

  expect(await findSnapshotByVariant(db, variantId)).toBeUndefined();
  const [record] = await findTurnToolCallsByVariant(db, variantId);
  expect(record?.calls).toEqual([
    expect.objectContaining({ name: "update_scene", verdict: "dropped", issues: [expect.stringMatching(/^timeOfDay: .* — sent "Evening"$/u)] }),
  ]);
});

test("0567: resync refuses a room window smaller than its fixed request instead of sending an overflowing read", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "resync-small-window");
  const principal = hostPrincipal(hostId);
  const spy = emptySpy();
  const compose = buildCannedRpgWithText({ app, db, api: "chat-completions", spy, cannedText: "{}", capability: OLLAMA_FLOOR });
  await compose.service.createGame({ principal, chatId, mode: "lite" });
  await seedMessage(db, chatId, 1, { role: "assistant", content: "The story begins." });
  const verdict = await compose.service.resyncFromStory({ principal, chatId });
  expect(verdict).toMatchObject({ ok: false, reason: expect.stringMatching(/window.*4096/i) });
  expect(spy.chatTurns).toEqual([]);
  expect(spy.summarizeModels).toEqual([]);
});

test("0567: a larger room window admits resync and the actual sent request fits it", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "resync-fit-window");
  const principal = hostPrincipal(hostId);
  const spy = emptySpy();
  const compose = buildCannedRpgWithText({ app, db, api: "agent-sdk", spy, cannedText: "{}", capability: OLLAMA_FLOOR, presetMaxContext: 16_384 });
  await compose.service.createGame({ principal, chatId, mode: "lite" });
  await seedMessage(db, chatId, 1, { role: "assistant", content: "old-story ".repeat(4500) });
  await seedMessage(db, chatId, 2, { role: "assistant", content: "The latest story fits." });
  const verdict = await compose.service.resyncFromStory({ principal, chatId });
  expect(verdict).toEqual({ ok: true, rebuilt: false });
  expect(spy.userPrompts[0]).toContain("The latest story fits.");
  expect(spy.windows).toEqual([16_384]);
  expect(stateRoundNeededTokens([spy.systemPrompts[0] ?? "", spy.userPrompts[0] ?? "", JSON.stringify(spy.schemas[0])])).toBeLessThanOrEqual(16_384);
});

test("0681: an ability roll persists in canon through Simple send and survives a room re-read", async ({ app, services, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "ability-canon");
  const principal = hostPrincipal(hostId);
  const compose = buildCannedRpgWithText({ app, db, api: "chat-completions", spy: emptySpy(), cannedText: "{}" });
  await compose.service.createGame({ principal, chatId, mode: "lite", ruleset: "d20" });
  await compose.service.patchSheet({ principal, chatId, actorRef: { kind: "user", userId: hostId }, patch: { attributes: { str: 15 } } });
  const roll = await compose.service.rollDice({ principal, chatId, notation: "d20", ability: "str" });
  const content = `I push the door. ${roll.stamp}`;
  await db
    .insert(userConnections)
    .values({ id: TEST_CONNECTION_ID, ownerId: hostId, label: "ability test connection", providerId: makeResolved().providerId, model: makeResolved().model });
  await db.insert(connectionBindings).values({
    id: mintTypeId(ID_PREFIX.connectionBinding),
    actorKind: "user",
    userId: hostId,
    ruleId: null,
    pluginId: null,
    task: "chat",
    connectionId: TEST_CONNECTION_ID,
  });
  await services.chat.commitMessage({ principal, chatId, content });
  const reread = await services.chat.listMessages({ principal, chatId, limit: 20 });
  expect(reread.messages.map((message) => message.content)).toContain(content);
  const canon = await app.chatRpgOps.resolveCanonWindow(chatId, { maxTokens: 4096 });
  expect(canon.map((message) => message.content)).toContain(content);
  expect(roll.modifier).toBe(2);
});

test("RPG-R2: a structured-only chat-completions resync fits its actual request in 8000 tokens", async ({ app, db }) => {
  for (const window of [10_000, 8000]) {
    const { chatId, hostId } = await seedHostGameChat(db, `r2-structured-${window}`);
    const principal = hostPrincipal(hostId);
    const spy = emptySpy();
    const compose = buildCannedRpgWithText({
      app,
      db,
      api: "chat-completions",
      spy,
      cannedText: "{}",
      capability: makeGenerationCapability({ output: { maxTokens: { min: 1, max: 4096 }, structured: true, modalities: ["text"] }, context: { window } }),
    });
    await compose.service.createGame({ principal, chatId, mode: "lite" });
    await seedMessage(db, chatId, 1, { role: "assistant", content: "story ".repeat(2000) });
    const verdict = await compose.service.resyncFromStory({ principal, chatId });
    expect(verdict).toEqual({ ok: true, rebuilt: false });
    expect(spy.schemas).toHaveLength(1);
    expect(spy.chatTurns).toEqual([]);
    const actual = stateRoundNeededTokens([spy.systemPrompts[0] ?? "", spy.userPrompts[0] ?? "", JSON.stringify(spy.schemas[0])]);
    expect(actual).toBeLessThanOrEqual(8000);
    expect(spy.userPrompts[0]).toContain("story ".repeat(2000).trimEnd());
    expect(spy.windows).toEqual([window]);
  }
});

test("RPG-R2: a forced tool resync reserves only requests its dispatcher can send", async ({ app, db }) => {
  let tightWindow = 20_000;
  for (const pass of ["control", "tight"] as const) {
    const { chatId, hostId } = await seedHostGameChat(db, `r2-tool-${pass}`);
    const principal = hostPrincipal(hostId);
    const requests: ChatRequest[] = [];
    const compose = buildCannedRpgWithText({
      app,
      db,
      api: "chat-completions",
      spy: emptySpy(),
      cannedText: "{}",
      cannedToolCalls: [{ name: "no_changes", arguments: "{}" }],
      capability: makeGenerationCapability({
        output: { maxTokens: { min: 1, max: 4096 }, structured: true, modalities: ["text"] },
        tools: { parallel: true },
        context: { window: tightWindow },
      }),
      onRequest: (incoming) => {
        requests.push(incoming);
      },
    });
    await compose.service.createGame({ principal, chatId, mode: "lite" });
    await compose.service.updateConfig({ principal, chatId, patch: { stateCaptureVehicle: "tools" } });
    await seedMessage(db, chatId, 1, { role: "assistant", content: "story ".repeat(2000) });
    expect(await compose.service.resyncFromStory({ principal, chatId })).toEqual({ ok: true, rebuilt: false });
    expect(requests).toHaveLength(1);
    const request = requests[0];
    if (request === undefined || request.api !== "chat-completions" || request.tools === undefined) {
      throw new Error("expected the forced tool request");
    }
    expect(request.responseFormat).toBeUndefined();
    expect(forcesToolRound(request.connection, request.tools)).toBe(true);
    const userPrompt = request.history[0]?.content.map((part) => (part.type === "text" ? part.text : "")).join("") ?? "";
    expect(userPrompt).toContain("story ".repeat(2000).trimEnd());
    const actual = stateRoundNeededTokens([request.systemPrompt.static, userPrompt, JSON.stringify(request.tools)]);
    expect(actual).toBeLessThanOrEqual(tightWindow);
    // Leave only a small allowance for different room-name tokens; no unused retry may consume it.
    if (pass === "control") {
      tightWindow = actual + 128;
    }
  }
});
