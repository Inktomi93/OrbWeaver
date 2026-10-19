// COMPOSED-REAL: the server graph loads in the untimed IMPORT phase, never inside the first test's timeout (#2386 — support/node/composed-real.ts).
// @subject packages/server/src/domain/rpg/tools/rounds/extraction.ts
// @subject packages/server/src/domain/rpg/tools/rounds/prompts.ts
import "@orb/testkit/node/composed-real.ts";
// entry/compose/rpg — the extraction wire: ref enums, the state-tracking guide, cancellation, schema shape, the turn connection, the story window and the plane registry, composed-real.

import type { ModelId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { makeCapability, makeGenerationCapability } from "@orb/testkit/node/factories/resolved-connection.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { makeResolved } from "../../../inference/_support.ts";
import { seedCharacter, seedMessage, seedParticipant } from "../../domain/chat/_support.ts";
import {
  buildCannedRpg,
  buildCannedRpgWithText,
  CANNED_POPULATE,
  defaultSnapshotState,
  emptySpy,
  hostPrincipal,
  seedHostGameChat,
  TURN,
  tc,
  transcript,
} from "./_rpg-support.ts";

// ── R1: the per-call ref constraint reaches the wire on BOTH arms (schema enum + prompt enumeration) ────
test("R1: the extraction schema carries the roster-ref enum + the system prompt enumerates the refs (structured arm)", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "r1-enum-summ");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "agent-sdk", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" }); // born folded — this test drives the DEDICATED round (structured on the agent-sdk wire)
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "The host acts." });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("agent-sdk"));

  // The wire schema constrained party[].targetRef to an ENUM (R1) — the actual per-call refs. The host is a
  // user participant, so the SEMANTIC `player` token leads the enum (stable across persona changes — the
  // ref-vocabulary ruling 2026-07-27), NOT just the display-name-keyed "You".
  const schema = spy.schemas[0] as { properties?: { party?: { items?: { properties?: { targetRef?: { enum?: string[] } } } } } };
  const enumVals = schema.properties?.party?.items?.properties?.targetRef?.enum;
  expect(Array.isArray(enumVals)).toBe(true);
  expect(enumVals).toContain("player"); // the semantic self-ref is enum-able
  // The system prompt enumerates the valid refs (the fallback arm), explains `player`, + the location→scene rule.
  expect(spy.systemPrompts[0]).toContain("Valid targetRef values");
  expect(spy.systemPrompts[0]).toContain('"player" = the human');
  expect(spy.systemPrompts[0]).toContain("Location goes in scene.location");
});

test("R1: the ref enum reaches the agent-sdk chat arm too (portable — same shape, provider-agnostic)", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "r1-enum-agent");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "agent-sdk", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" }); // born folded — this test drives the DEDICATED round (structured on the agent-sdk wire)
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "The host acts." });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("agent-sdk"));

  const schema = spy.schemas[0] as { properties?: { party?: { items?: { properties?: { targetRef?: { enum?: string[] } } } } } };
  expect(Array.isArray(schema.properties?.party?.items?.properties?.targetRef?.enum)).toBe(true);
  expect(spy.systemPrompts[0]).toContain("Valid targetRef values");
});

// ── ROW 27: the state-tracking GUIDE reaches BOTH write surfaces (owner ruling 2026-08-08) ──────────────
// `RPG_STATE_TRACKING_GUIDE` documented itself as "composed onto the write-surface prompts (the tool round +
// the structured extraction)" and was composed onto NOTHING for its entire life — an exported const whose only
// reference was its own declaration. Spec §11 decision 6 (wire and measure, or delete) was ruled WIRE, so it is
// now the `rpg.extract.stateTrackingGuide` slot pushed by `composePlaneTeaching`. The contracts tier proves the
// shared body carries it; only THIS tier proves the bytes ride each vehicle's actual request — which is the
// claim the doc-comment made and never kept.

test("row 27: the BE THOROUGH guide rides the STRUCTURED extraction's system prompt", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "row27-structured");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "agent-sdk", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" }); // born folded — this drives the DEDICATED round (structured on the agent-sdk wire)
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "The host acts." });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("agent-sdk"));

  expect(spy.systemPrompts[0]).toContain("BE THOROUGH — the panel should reflect the FULL richness");
  // …and it lands ahead of the reconcile rule, so "never fabricate" is what closes the coverage push.
  expect(spy.systemPrompts[0]?.indexOf("BE THOROUGH")).toBeLessThan(spy.systemPrompts[0]?.indexOf("RECONCILE:") ?? -1);
});

test("row 27: the guide rides the CHEAP TOOL ROUND's system prompt too — the second write surface", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "row27-toolround");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy,
    cannedText: "{}",
    cannedToolCalls: [{ name: "update_scene", arguments: JSON.stringify({ recentEvent: "arrived at the tower" }) }],
  });
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "They arrive at the tower." });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("chat-completions"));

  // The tool round is an ARRAY wire, so this pin exists only because the spy captures `systemPrompt` on every
  // api — a structured-arm-only capture would have made the second surface unassertable at any tier.
  expect(spy.systemPrompts[0]).toContain("Sparse tracking makes the panel feel dead.");
});

// ── RPG-SIGNAL: the cancellation reaches the LAST HOP (the provider request) ──────────────────────────────
// The flush tier proves the round is cancelable and writes nothing; only THIS tier can see whether the signal
// actually made it onto the wire request. Without it the round would run to completion on the provider's clock
// and bill in full, however promptly the flush afterwards refused to write — the "burning tokens" half of the
// defect. Both routed arms are pinned because they build their requests independently.

test("RPG-SIGNAL: the state round threads its cancellation onto the STRUCTURED dispatcher request", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "sig-structured");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "agent-sdk", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "The host acts." });

  // A `chat-completions` turn connection takes the `structured` dispatcher arm.
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("chat-completions"));

  const signal = spy.signals[0];
  expect(signal).toBeInstanceOf(AbortSignal); // NOT undefined — the socket is killable
  expect(signal?.aborted).toBe(false); // a live, un-fired signal: the round ran normally
});

test("RPG-SIGNAL: the agent-sdk chat arm carries it too (the degrade is cancelable, not just the array wires)", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "sig-agentsdk");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "agent-sdk", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "The host acts." });

  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("agent-sdk"));

  expect(spy.signals[0]).toBeInstanceOf(AbortSignal);
});

test("RPG-SIGNAL: a round entered ALREADY CANCELLED makes ZERO provider calls (nothing is billed)", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "sig-preflight");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "agent-sdk", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "The host acts." });

  const turn = new AbortController();
  turn.abort();
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("chat-completions", { signal: turn.signal }));

  // The whole point of the pre-flight gate: an abandoned turn costs nothing at all, on either arm.
  expect(spy.summarizeModels).toEqual([]);
  expect(spy.chatTurns).toEqual([]);
});

// ── D126: the structured-output SHAPE knob reaches the wire (the whole path: AppSettings → the request) ──
// The admin knob is worthless if it stops at the settings write. These two pin the FAR end: the SAME composed
// extraction, driven twice, puts two different schema SHAPES on the wire — and the shipped floor is unchanged
// (the default STANDS; this lane built the switch, not a flip).
//
// The assertions walk EVERY object node, never just the root: the extraction schema's root properties are all
// required already (six plane arrays), so the reshape is only observable NESTED — a root-only assertion would
// have gone vacuously green on both arms.

/** Every `{type:"object", properties}` node in a schema tree, root included. */
function objectNodes(node: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) {
    for (const item of node) {
      objectNodes(item, out);
    }
    return out;
  }
  if (node === null || typeof node !== "object") {
    return out;
  }
  const record = node as Record<string, unknown>;
  if (record["type"] === "object" && typeof record["properties"] === "object" && record["properties"] !== null) {
    out.push(record);
  }
  for (const value of Object.values(record)) {
    objectNodes(value, out);
  }
  return out;
}

const propertyNames = (node: Record<string, unknown>): string[] => Object.keys(node["properties"] as Record<string, unknown>);
const requiredNames = (node: Record<string, unknown>): string[] => (Array.isArray(node["required"]) ? (node["required"] as string[]) : []);

/** Nodes spelled `anyOf:[…, {"type":"null"}]` — the strict-compatible optional. */
function nullUnionCount(node: unknown, count = 0): number {
  if (Array.isArray(node)) {
    return node.reduce<number>((n, item) => nullUnionCount(item, n), count);
  }
  if (node === null || typeof node !== "object") {
    return count;
  }
  const record = node as Record<string, unknown>;
  const arms = record["anyOf"];
  const isNullUnion = Array.isArray(arms) && arms.some((arm) => arm !== null && typeof arm === "object" && (arm as Record<string, unknown>)["type"] === "null");
  return Object.values(record).reduce<number>((n, value) => nullUnionCount(value, n), count + (isNullUnion ? 1 : 0));
}

test("the extraction format states its schema AS PROJECTED and nothing else — no strict, no vehicle (the plan scrubs at the backend)", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "d126-floor");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "agent-sdk", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "The host acts." });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("agent-sdk"));

  const schema = spy.schemas[0] as Record<string, unknown>;
  const nodes = objectNodes(schema);
  expect(nodes.length).toBeGreaterThan(1);
  // The projector's own shape: SOME node still leaves properties out of `required` …
  expect(nodes.some((n) => requiredNames(n).length < propertyNames(n).length)).toBe(true);
  // … and nothing anywhere was wrapped in a null union.
  expect(nullUnionCount(schema)).toBe(0);
  expect(spy.formatKeys).toEqual([["name", "schema"]]);
});

// The rail states only the schema on BOTH arms (the per-turn chat extraction and the `structured` dispatcher behind
// the host populate door): how it rides, and the scrub, are the structured plan's at the backend.
test("the extraction rail states only the schema on either arm — no strict, no vehicle", async ({ app, db }) => {
  const chatSpy = emptySpy();
  const { chatId, hostId } = await seedHostGameChat(db, "vehicle-chat");
  const chatCompose = buildCannedRpg(app, db, "agent-sdk", chatSpy);
  await chatCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await chatCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "The host acts." });
  await chatCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("agent-sdk"));
  expect(chatSpy.formatKeys).toEqual([["name", "schema"]]);

  const structuredSpy = emptySpy();
  const populate = await seedHostGameChat(db, "vehicle-structured");
  const characterId = await seedCharacter(db, populate.hostId, "mira", { id: mintTypeId(ID_PREFIX.character) });
  await seedParticipant(db, { chatId: populate.chatId, key: "vehicle_char", characterId, joinSeq: 1 });
  await seedMessage(db, populate.chatId, 1, { role: "assistant", content: "You meet Mira at the ford." });
  const structuredCompose = buildCannedRpgWithText({ app, db, api: "chat-completions", spy: structuredSpy, cannedText: JSON.stringify(CANNED_POPULATE) });
  await structuredCompose.service.createGame({ principal: hostPrincipal(populate.hostId), chatId: populate.chatId, mode: "lite" });
  await structuredCompose.service.populateFromCharacter({
    principal: hostPrincipal(populate.hostId),
    chatId: populate.chatId,
    actorRef: { kind: "character", characterId },
  });
  expect(structuredSpy.summarizeModels).toEqual(["fake-chat-model"]);
  expect(structuredSpy.formatKeys).toEqual([["name", "schema"]]);
});

test("F1 (room connection): the round runs on the TURN's connection (vllm), never a re-resolved global default", async ({ app, db }) => {
  // The wrong-connection half: the round used to `resolveRole({role:'chat'})` (the host's GLOBAL default), so a
  // room on vllm could run its round on the sub. Now the round rides `turnConnection.connection`. Prove it by
  // giving the turn connection a DISTINCT model the pill's `resolveChat` never returns ("fake-chat-model"): the
  // round must record the THREADED model, not the pill's — i.e. it did not re-resolve.
  const { chatId, hostId } = await seedHostGameChat(db, "f1-room-conn");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "chat-completions", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" }); // the fold is the BORN default — this test drives the dedicated round
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "They cross the bridge." });

  const vllmTurn = tc("chat-completions", {
    connection: makeResolved({
      api: "chat-completions",
      model: castId<ModelId>("threaded-vllm-model"), // NOT the pill's "fake-chat-model"
      capability: makeCapability(
        makeGenerationCapability({ output: { maxTokens: { min: 1, max: 4096 }, structured: true, modalities: ["text"] }, tools: { parallel: true } }),
      ),
    }),
  });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, vllmTurn);

  // The round fired on the THREADED connection's model — proving no re-resolve of a global default.
  expect(spy.chatTurns.map((c) => c.model)).toEqual(["threaded-vllm-model"]);
});

// ── F2: a readonly (no-writer-capability) turn connection runs NO round (no per-turn failing model call) ────
test("F2 (readonly gate): a turn connection with no writer capability fires NO state round and writes nothing", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "f2-readonly");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "chat-completions", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" }); // every mode needs `tools`
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "Nothing writable here." });

  // A connection that carries NO tools → every surviving mode is readonly (manual-steering). The flush must
  // skip the round entirely (no `structured`/`runChatTurn` call, no failing per-turn spend) and write no snapshot.
  const readonlyTurn = tc("chat-completions", {
    connection: makeResolved({
      api: "chat-completions",
      model: castId<ModelId>("no-tools-model"),
      capability: makeCapability(makeGenerationCapability({ output: { maxTokens: { min: 1, max: 4096 }, structured: true, modalities: ["text"] } })), // tools ABSENT
    }),
  });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, readonlyTurn);

  // NO round fired (neither arm) — the readonly gate short-circuited before any model call.
  expect(spy.summarizeModels).toEqual([]);
  expect(spy.chatTurns).toEqual([]);
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// W-B (§1.3) — the state round rides the turn's OWN transcript: window content · beat byte-compat · registry
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test("§1.3 (window arm): the RECENT STORY block carries the turn's transcript, name-stamped, oldest-first", async ({ app, db }) => {
  // A game defaults to extractionContext:"window" (§1.3). Thread a multi-beat transcript on the turn context;
  // the round's user prompt must carry the prior beats as name-stamped story evidence — proving the extraction
  // is no longer context-blind (it reads the arc, not just one beat).
  const { chatId, hostId } = await seedHostGameChat(db, "wb-window");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "agent-sdk", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" }); // born window (default)
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" }); // born folded — this test drives the DEDICATED round (structured on the agent-sdk wire)
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "The dragon lunges." });

  const turn = tc("agent-sdk", {
    transcript: transcript([
      { speaker: "You", text: "I draw my blade and step into the ruined hall.", role: "user" },
      { speaker: "Mira", text: "Mira nocks an arrow, whispering: stay behind me." },
      { speaker: "Mira", text: "The dragon lunges." }, // the latest beat (transcript.at(-1))
    ]),
  });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turn);

  const prompt = spy.userPrompts[0] ?? "";
  // The RECENT STORY block exists and carries the PRIOR beats (the arc), oldest-first, name-stamped.
  expect(prompt).toContain("RECENT STORY (oldest first):");
  expect(prompt).toContain("You: I draw my blade and step into the ruined hall.");
  expect(prompt).toContain("Mira: Mira nocks an arrow, whispering: stay behind me.");
  // The newest turn rides the LATEST BEAT block, not the story block (the delta target).
  expect(prompt).toContain("LATEST BEAT (the newest story turn above — your delta covers exactly this):\nThe dragon lunges.");
  // The three-block structure — CURRENT TRACKED STATE sits between story and beat.
  expect(prompt).toContain("CURRENT TRACKED STATE:");
});

test("§1.3 (beat arm): the request is BYTE-IDENTICAL to the pre-redesign shape (CURRENT STATE + one beat, no story, unstripped)", async ({ app, db }) => {
  // The escape hatch's byte-compat contract: extractionContext:"beat" reproduces today's request EXACTLY — the
  // full unstripped state JSON, no RECENT STORY block, no §4.4 strip. The verifier's diff is this equality.
  const { chatId, hostId } = await seedHostGameChat(db, "wb-beat");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "agent-sdk", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" }); // born folded — this test drives the DEDICATED round (structured on the agent-sdk wire)
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, patch: { extractionContext: "beat" } });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "They cross the bridge." });

  const turn = tc("agent-sdk", {
    transcript: transcript([
      { speaker: "You", text: "prior beat that must NOT appear on the beat arm", role: "user" },
      { speaker: "Mira", text: "They cross the bridge." },
    ]),
  });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turn);

  // A fresh game's base is the default snapshot state — the round reasons against it. The beat arm's user prompt
  // is byte-identical to the pre-redesign `CURRENT STATE:\n${JSON.stringify(base)}\n\nLATEST BEAT:\n${beat}`.
  const expected = `CURRENT STATE:\n${JSON.stringify(defaultSnapshotState())}\n\nLATEST BEAT:\nThey cross the bridge.`;
  expect(spy.userPrompts[0]).toBe(expected);
  // No transcript leakage on the beat arm — the prior beat and the new-block labels are ABSENT.
  expect(spy.userPrompts[0]).not.toContain("RECENT STORY");
  expect(spy.userPrompts[0]).not.toContain("prior beat that must NOT appear");
});

test("§1.6 (plane registry): the extraction system prompt teaches the newly-covered planes (plot + emoji + reconcile)", async ({ app, db }) => {
  // The plane-under-service gap (§1.6): plot/emoji/reconcile were schema-writable but prompt-silent. The registry
  // now composes them into the system prompt. plotProgression defaults ON, so the plot clause must appear.
  const { chatId, hostId } = await seedHostGameChat(db, "wb-registry");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "agent-sdk", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" }); // born folded — this test drives the DEDICATED round (structured on the agent-sdk wire)
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "A new act dawns." });
  await rpgCompose.chatOps.onTurnCompleted(
    chatId,
    messageId,
    variantId,
    TURN,
    tc("agent-sdk", { transcript: transcript([{ speaker: "Narrator", text: "A new act dawns." }]) }),
  );

  const sys = spy.systemPrompts[0] ?? "";
  expect(sys).toContain("scene.plot"); // §1.6 gap — the plot act rail (plotProgression ON by default)
  expect(sys).toContain("emoji"); // §1.6 gap — the portrait-fallback emoji clause
  expect(sys).toContain("RECONCILE"); // the anti-drift doctrine composed by the registry
});
