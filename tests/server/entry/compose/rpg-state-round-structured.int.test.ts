// COMPOSED-REAL: the server graph loads in the untimed IMPORT phase, never inside the first test's timeout (#2386 — support/node/composed-real.ts).
import "@orb/testkit/node/composed-real.ts";
// entry/compose/rpg — the structured state round keyed on capability: the forced tool round, the empty-round retry and the per-game vehicle knob.

// @orb-waive-file no-test-fabrication({ message: { content: string } }): baselined when the gate widened to value casts; burn-down item 906.
// @orb-waive-file no-test-fabrication({ properties: { changes: { minItems: number; items: { anyOf: { properties: { tool: { enum: string[] } } }[] } } } }): baselined when the gate widened to value casts; burn-down item 906.
import { createHash } from "node:crypto";
import { resolveProseText } from "@orb/contracts/prose";
import { RPG_STATE_ROUND_FAILED_SUMMARY, RPG_TOOL_ROUND_TOOL_NAMES } from "@orb/contracts/rpg";
import type { ChatResult } from "@orb/inference";
import { logger } from "@orb/server/foundation/observability";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { vi } from "vitest";
import { OLLAMA_NATIVE_RECORDINGS } from "../../../inference/backends/openai-compat/_ollama-native-recordings.ts";
import { seedMessage } from "../../domain/chat/_support.ts";
import {
  buildCannedRpgWithText,
  cheapGame,
  emptySpy,
  findSnapshotByVariant,
  findTurnToolCallsByVariant,
  hostPrincipal,
  panelState,
  STATE_ROUND_ROWS,
  seedHostGameChat,
  stateRoundTurn,
  TURN,
} from "./_rpg-support.ts";
import { ANTHROPIC_PATCH_ROUND_200 } from "./_structured-state-round-recordings.ts";

/** A request with its per-run identities (chat id, resolved row, signal) blanked, hashed: equal fingerprints are
 *  byte-identical requests. */
function requestFingerprint(value: unknown): string {
  const blanked =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? { ...value, chatId: "<chat>", connection: "<connection>", signal: "<signal>" }
      : value;
  return createHash("sha256").update(JSON.stringify(blanked)).digest("hex");
}

/** The recorded Ollama reply's message text — what the structured batch hands back to the round. */
const RECORDED_STATE_ROUND_REPLY = (JSON.parse(OLLAMA_NATIVE_RECORDINGS.stateRound.body) as { message: { content: string } }).message.content;

test("0511: a no-force structured row asks for the changes schema, and the recorded multi-change reply writes through the tool path", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "sr-local");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpgWithText({ app, db, api: "chat-completions", spy, cannedText: RECORDED_STATE_ROUND_REPLY });
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "Corvin's blade catches Mira's arm." });

  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, stateRoundTurn(STATE_ROUND_ROWS.local));

  // ONE structured call, no tool round: the schema rides as `response_format`, never as a forced tool.
  expect(spy.chatTurns).toEqual([]);
  expect(spy.formatKeys).toEqual([["name", "schema"]]);
  const schema = spy.schemas[0] as { properties: { changes: { minItems: number; items: { anyOf: { properties: { tool: { enum: string[] } } }[] } } } };
  expect(schema.properties.changes.minItems).toBe(1);
  expect(schema.properties.changes.items.anyOf.map((member) => member.properties.tool.enum)).toEqual(
    [...RPG_TOOL_ROUND_TOOL_NAMES].filter((n) => n !== "set_tracker").map((n) => [n]),
  );
  // The model is taught the reply shape and every tool, because a grammar-only wire never shows it the schema.
  expect(spy.systemPrompts[0]).toContain("`changes` array");
  expect(spy.systemPrompts[0]).toContain("update_scene: ");

  // Every change is recorded as the tool call it stands for, and the party change landed through the same fold.
  const [record] = await findTurnToolCallsByVariant(db, variantId);
  expect(record?.calls.map((call) => call.name)).toEqual(["update_party", "update_inventory"]);
  expect(record?.failure).toBeNull();
  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(JSON.stringify(view.actors)).toContain("Bleeding");
});

test("0511: a structured `no_changes` reply writes nothing and records the quiet call", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "sr-quiet");
  const rpgCompose = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy: emptySpy(),
    cannedText: JSON.stringify({ changes: [{ tool: "no_changes", args: {} }] }),
  });
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "They wait." });

  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, stateRoundTurn(STATE_ROUND_ROWS.local));

  expect(await findSnapshotByVariant(db, variantId)).toBeUndefined();
  const [record] = await findTurnToolCallsByVariant(db, variantId);
  expect(record?.calls.map((call) => call.name)).toEqual(["no_changes"]);
  expect(record?.failure).toBeNull();
});

test("0511: a structured reply outside the schema fails LOUDLY — a durable failure, never a quiet beat", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "sr-bad");
  const warn = vi.spyOn(logger, "warn");
  const rpgCompose = buildCannedRpgWithText({ app, db, api: "chat-completions", spy: emptySpy(), cannedText: '{"changes": []}' });
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "Static." });

  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, stateRoundTurn(STATE_ROUND_ROWS.local));

  expect(await findSnapshotByVariant(db, variantId)).toBeUndefined();
  const [record] = await findTurnToolCallsByVariant(db, variantId);
  expect(record?.calls).toEqual([]);
  expect(record?.failure).toContain(RPG_STATE_ROUND_FAILED_SUMMARY);
  // @orb-waive no-test-fabrication({ event?: string }): baselined when the gate widened to value casts; burn-down item 906.
  expect(warn.mock.calls.some(([line]) => (line as { event?: string }).event === "rpg.toolround.unparseable")).toBe(true);
  warn.mockRestore();
});

// Computed against main's compose/rpg.ts (the pre-0511 source) with this exact harness: the forced tool round every
// row below sent before the structured round existed. A Claude row must keep sending it.
const MAIN_TOOL_ROUND_FINGERPRINT = "570deed22c1a4b5935c36107b250384b55b1cf972fcebf608017b29d74f4f0a8";
const MAIN_FOLDED_MOUNT_FINGERPRINT = "61b8e99d25c678e314c7f54733e29b1be177f7df2b9fda5fe39212862ac5351e";

test("0511: Claude (5.5 and 4.x), OpenAI and plain tool rows send the forced tool round byte-identical to main", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "sr-pins");
  const sent: unknown[] = [];
  const rpgCompose = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy: emptySpy(),
    cannedText: "{}",
    chatArm: (req) => {
      sent.push(req);
      // @orb-waive no-test-fabrication(unknown): minimal ChatResult double — the round reads toolCalls and the economics fields only.
      return Promise.resolve({
        reply: "",
        // A real quiet beat, so the downgraded Claude 5.5 round does not take its empty-round retry here.
        toolCalls: [{ name: "no_changes", arguments: "{}" }],
        usage: { model: "m", tokensIn: 1, tokensOut: 1, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: null, costUsd: null },
        durationApiMs: 1,
        finishReason: "tool_calls",
      } as unknown as ChatResult);
    },
  });
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" });
  let seq = 1;
  for (const row of [STATE_ROUND_ROWS.claudeNoForce, STATE_ROUND_ROWS.claudeForced, STATE_ROUND_ROWS.openai]) {
    const { messageId, variantId } = await seedMessage(db, chatId, seq, { role: "assistant", content: "They arrive." });
    seq += 1;
    await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, stateRoundTurn(row));
  }

  expect(sent).toHaveLength(3);
  for (const req of sent) {
    expect(req).toMatchObject({ api: "chat-completions", params: {}, toolChoice: { mode: "required" } });
    expect(req).not.toHaveProperty("responseFormat");
    expect(requestFingerprint(req)).toBe(MAIN_TOOL_ROUND_FINGERPRINT);
  }
});

test("0511: the folded mount on a Claude 5.5 row is byte-identical to main", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "sr-fold-pin");
  const rpgCompose = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy: emptySpy(),
    cannedText: "{}",
    capability: STATE_ROUND_ROWS.claudeNoForce,
  });
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "folded" });

  const folded = await rpgCompose.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false, funderUserId: hostId });

  expect(folded?.terminalTools?.map((t) => t.name)).toEqual([...RPG_TOOL_ROUND_TOOL_NAMES].filter((n) => n !== "set_tracker"));
  expect(requestFingerprint(folded?.terminalTools)).toBe(MAIN_FOLDED_MOUNT_FINGERPRINT);
});

// ── 0511 (expansion): the empty-round retry and the per-game vehicle knob ─────────────────────────────────────────

/** Claude Sonnet 5.5's recorded patch-list answer to one beat (OpenRouter, pinned to Anthropic). */
const PATCH_REPLY = ANTHROPIC_PATCH_ROUND_200.content;

test("0511: a downgraded Claude 5.5 round that comes back EMPTY is retried once as a patch-list round, and its changes land", async ({ app, db }) => {
  const spy = emptySpy();
  const rpgCompose = buildCannedRpgWithText({ app, db, api: "chat-completions", spy, cannedText: PATCH_REPLY, cannedToolCalls: [] });
  const { chatId, hostId, messageId, variantId } = await cheapGame(db, rpgCompose, "fb-empty");

  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, stateRoundTurn(STATE_ROUND_ROWS.claudeNoForce));

  // The tool round ran first (unchanged), then exactly one structured call in the flat shape Claude's grammar fits.
  expect(spy.chatTurns).toHaveLength(1);
  expect(spy.formatKeys).toEqual([["name", "schema"]]);
  expect(JSON.stringify(spy.schemas[0])).toContain('"plane"');
  expect(spy.systemPrompts[1]).toContain(resolveProseText("rpg.extract.patchRoundFrame", {}));
  expect(spy.systemPrompts[1]).toContain("fields: location");
  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(view.ambient?.location).toBe("cave by the river");
  const [record] = await findTurnToolCallsByVariant(db, variantId);
  expect(record?.calls.map((call) => call.name)).toEqual(["update_party", "update_scene", "add_journal_entry"]);
});

test("0511: the retry never fires after a real `no_changes`, nor on a row whose `required` was not downgraded", async ({ app, db }) => {
  const quietSpy = emptySpy();
  const quiet = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy: quietSpy,
    cannedText: PATCH_REPLY,
    cannedToolCalls: [{ name: "no_changes", arguments: "{}" }],
  });
  const a = await cheapGame(db, quiet, "fb-quiet");
  await quiet.chatOps.onTurnCompleted(a.chatId, a.messageId, a.variantId, TURN, stateRoundTurn(STATE_ROUND_ROWS.claudeNoForce));
  expect(quietSpy.summarizeModels).toEqual([]);

  const forcedSpy = emptySpy();
  const forced = buildCannedRpgWithText({ app, db, api: "chat-completions", spy: forcedSpy, cannedText: PATCH_REPLY, cannedToolCalls: [] });
  const b = await cheapGame(db, forced, "fb-forced");
  await forced.chatOps.onTurnCompleted(b.chatId, b.messageId, b.variantId, TURN, stateRoundTurn(STATE_ROUND_ROWS.claudeForced));
  expect(forcedSpy.summarizeModels).toEqual([]);
  expect(await findSnapshotByVariant(db, b.variantId)).toBeUndefined();
});

test("0511: a retry the provider refuses surfaces as the round's failure, never as a quiet beat", async ({ app, db }) => {
  const rpgCompose = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy: emptySpy(),
    cannedText: PATCH_REPLY,
    cannedToolCalls: [],
    structuredThrows: new Error("upstream 400 from the retry"),
  });
  const { chatId, messageId, variantId } = await cheapGame(db, rpgCompose, "fb-fail");

  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, stateRoundTurn(STATE_ROUND_ROWS.claudeNoForce));

  const [record] = await findTurnToolCallsByVariant(db, variantId);
  expect(record?.failure).toContain("upstream 400 from the retry");
  expect(await findSnapshotByVariant(db, variantId)).toBeUndefined();
});

test("0511: the `tools` knob keeps a no-force local row on its tool round; `structured` puts a forcible row on the union round", async ({ app, db }) => {
  const toolsSpy = emptySpy();
  const toolsOnly = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy: toolsSpy,
    cannedText: RECORDED_STATE_ROUND_REPLY,
    cannedToolCalls: [{ name: "no_changes", arguments: "{}" }],
  });
  const a = await cheapGame(db, toolsOnly, "knob-tools", "tools");
  await toolsOnly.chatOps.onTurnCompleted(a.chatId, a.messageId, a.variantId, TURN, stateRoundTurn(STATE_ROUND_ROWS.local));
  expect(toolsSpy.chatTurns).toHaveLength(1);
  expect(toolsSpy.summarizeModels).toEqual([]);

  const structuredSpy = emptySpy();
  const structured = buildCannedRpgWithText({ app, db, api: "chat-completions", spy: structuredSpy, cannedText: RECORDED_STATE_ROUND_REPLY });
  const b = await cheapGame(db, structured, "knob-structured", "structured");
  await structured.chatOps.onTurnCompleted(b.chatId, b.messageId, b.variantId, TURN, stateRoundTurn(STATE_ROUND_ROWS.openai));
  expect(structuredSpy.chatTurns).toEqual([]);
  expect(structuredSpy.formatKeys).toEqual([["name", "schema"]]);
  expect(JSON.stringify(structuredSpy.schemas[0])).toContain('"tool"');
  const [record] = await findTurnToolCallsByVariant(db, b.variantId);
  expect(record?.calls.map((call) => call.name)).toEqual(["update_party", "update_inventory"]);
});

test("0511: a host resync on a downgraded Claude 5.5 row that comes back empty takes the same patch-list retry", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "fb-resync");
  const principal = hostPrincipal(hostId);
  const spy = emptySpy();
  const compose = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy,
    cannedText: PATCH_REPLY,
    cannedToolCalls: [],
    capability: STATE_ROUND_ROWS.claudeNoForce,
  });
  await compose.service.createGame({ principal, chatId, mode: "lite" });

  const verdict = await compose.service.resyncFromStory({ principal, chatId });

  expect(verdict.ok).toBe(true);
  expect(spy.chatTurns).toHaveLength(1);
  expect(spy.formatKeys).toEqual([["name", "schema"]]);
  expect((await panelState(compose, hostId, chatId)).location).toBe("cave by the river");
});
