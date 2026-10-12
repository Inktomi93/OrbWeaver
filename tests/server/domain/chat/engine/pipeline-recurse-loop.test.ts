// engine/pipeline — the D48 recurse loop, the reasoning carry across a tool chain, structured turns and the backend-neutral tool offer.

import type { ChatReasoningPart, MessageView, ToolCallRecord } from "@orb/contracts/chat";
import type { GenerationCapability } from "@orb/contracts/inference";
import type { UserIntent } from "@orb/contracts/preset";
import type { ChatToolExecution, Resolved, ToolCallInput } from "@orb/inference";
import { ProviderError } from "@orb/inference";
import type { CharacterId, ChatId, ChatTurnId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { wireSchema } from "@orb/testkit/iso/wire-ready.ts";
import { makeCapability, makeGenerationCapability } from "@orb/testkit/node/factories/resolved-connection.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { synthesizeCapability } from "#inference/capability/synthesize.ts";
import type { ChatToolOps, RunChatTurnOp, TurnMessage, TurnRequest, TurnStreamChunk } from "./_pipeline-support.ts";
import {
  assertConvertedToolNames,
  baseArgs,
  CAPABILITY,
  CONNECTION,
  doneFinal,
  fakeToolOps,
  rowOf,
  runTurnPipeline,
  scriptedDepths,
  TOOL_CAPABILITY,
  TOOL_CONNECTION,
  toolFinal,
  userRow,
} from "./_pipeline-support.ts";

type PipelineArgs = Parameters<typeof runTurnPipeline>[0];

test("consecutive recursive requests with no intervening prose keep same native ids scoped to each original exchange", async () => {
  const { args } = baseArgs({
    connection: TOOL_CONNECTION,
    tools: fakeToolOps([]),
    attachedToolNames: ["draw", "tick_clock"],
    runChatTurn: scriptedDepths(
      [
        [toolFinal("Before.", [{ id: "same", name: "draw", args: "{}" }])],
        [toolFinal("", [{ id: "same", name: "tick_clock", args: "{}" }])],
        [doneFinal("After.")],
      ],
      [],
    ),
  });
  const result = await runTurnPipeline(args);
  expect(result.content).toBe("Before.After.");
  expect(result.toolRecords.map((record) => [record.toolCallId, record.textOffset, record.exchangeOrdinal])).toEqual([
    ["same", 7, 0],
    ["same", 7, 1],
  ]);
  await assertConvertedToolNames(result.toolRecords, result.content, ["draw", "tick_clock"]);
});

test("later turns replay the active variant's completed tool exchange", async () => {
  const previous = rowOf("assistant", "The card is the Moon.");
  const record: ToolCallRecord = {
    toolCallId: "draw-1",
    name: "plugin_oracle__deck_draw",
    arguments: "{}",
    result: '{"card":"Moon"}',
    isError: false,
    durationMs: 1,
  };
  const requests: TurnRequest[] = [];
  const { args } = baseArgs({
    connection: TOOL_CONNECTION,
    canon: [{ ...previous, toolCalls: [record] }, userRow("What does it mean?")],
    runChatTurn: scriptedDepths([[doneFinal("A hidden truth.")]], requests),
  });
  await runTurnPipeline(args);
  const parts = requests[0]?.history.flatMap((message) => message.content) ?? [];
  expect(parts).toContainEqual({ type: "tool-call", toolCallId: "draw-1", name: record.name, arguments: "{}" });
  expect(parts).toContainEqual({ type: "tool-result", toolCallId: "draw-1", content: record.result });
});

test("tool recursion preserves provider bytes and records the prose boundary", async () => {
  const requests: TurnRequest[] = [];
  const { args } = baseArgs({
    connection: TOOL_CONNECTION,
    tools: fakeToolOps([]),
    attachedToolNames: ["tick_clock"],
    runChatTurn: scriptedDepths(
      [[toolFinal("with suspicion.", [{ id: "c1", name: "tick_clock", args: "{}" }])], [doneFinal("I turn the card over")]],
      requests,
    ),
  });
  const result = await runTurnPipeline(args);
  expect(result.content).toBe("with suspicion.I turn the card over");
  expect(result.toolRecords[0]).toMatchObject({ textOffset: "with suspicion.".length });
});

test("active-swipe replay respects capability, row hiding, per-call hiding, deletion, opt-out and unexecuted calls", async () => {
  const record: ToolCallRecord = { toolCallId: "active", name: "draw", arguments: "{}", result: '"Moon"', isError: false, durationMs: 1 };
  const previous = rowOf("assistant", "A card.");
  const run = async (over: Partial<MessageView>, connection = TOOL_CONNECTION): Promise<readonly string[]> => {
    const { args } = baseArgs({ connection, canon: [{ ...previous, toolCalls: [record], ...over }, userRow("Explain.")] });
    const result = await runTurnPipeline(args);
    return result.request.history.flatMap((message) => message.content.flatMap((part) => (part.type === "tool-call" ? [part.toolCallId] : [])));
  };
  expect(await run({})).toEqual(["active"]);
  expect(await run({ toolCalls: [{ ...record, toolCallId: "other-swipe", result: '"Sun"' }] })).toEqual(["other-swipe"]);
  expect(await run({}, CONNECTION)).toEqual([]);
  expect(await run({ excludedFromPrompt: true })).toEqual([]);
  for (const suppressed of [{ hidden: true }, { deleted: true }, { replayHistory: false }, { result: null }]) {
    expect(await run({ toolCalls: [{ ...record, ...suppressed }] })).toEqual([]);
  }
  expect(await run({ toolCalls: [] })).toEqual([]);
});

test("tool-only and adjacent assistant rows survive shaping and replay in order without dropping either exchange", async () => {
  const record: ToolCallRecord = { toolCallId: "c1", name: "draw", arguments: "{}", result: '"Moon"', isError: false, durationMs: 1 };
  const first = { ...rowOf("assistant", ""), toolCalls: [record] };
  const second = { ...rowOf("assistant", "The next card."), toolCalls: [{ ...record, toolCallId: "c2", result: '"Sun"' }] };
  const { args } = baseArgs({ connection: TOOL_CONNECTION, canon: [first, second, userRow("Explain.")] });
  const result = await runTurnPipeline(args);
  expect(
    result.request.history
      .flatMap((message) => message.content)
      .filter((part) => part.type === "tool-call")
      .map((part) => part.toolCallId),
  ).toEqual(["c1", "c2"]);
  expect(result.request.history.map((message) => message.role)).toEqual(["assistant", "tool", "assistant", "tool", "assistant", "user"]);
});

test("replayed tool payloads are priced and trimmed with their whole history row", async () => {
  const record: ToolCallRecord = {
    toolCallId: "expensive",
    name: "draw",
    arguments: "{}",
    result: JSON.stringify("card ".repeat(4000)),
    isError: false,
    durationMs: 1,
  };
  const prior = { ...rowOf("assistant", "A short sentence."), toolCalls: [record] };
  const { args } = baseArgs({
    connection: TOOL_CONNECTION,
    intent: { maxContextTokens: 1000, maxOutputTokens: 100 },
    canon: [userRow("Draw."), prior, userRow("Explain.")],
  });
  const result = await runTurnPipeline(args);
  expect(result.droppedCount).toBeGreaterThan(0);
  expect(result.request.history.flatMap((message) => message.content).some((part) => part.type === "tool-call" || part.type === "tool-result")).toBe(false);
  expect(result.request.history.flatMap((message) => message.content).some((part) => part.type === "text" && part.text.includes("A short sentence."))).toBe(
    false,
  );
});

test("replay restores text/tool boundaries and private tool signatures without changing provider text", async () => {
  const prose = "Before.After.";
  const prior = rowOf("assistant", prose);
  const record: ToolCallRecord = { toolCallId: "signed", name: "draw", arguments: "{}", result: '"Moon"', isError: false, durationMs: 1, textOffset: 7 };
  const { args } = baseArgs({
    connection: TOOL_CONNECTION,
    canon: [{ ...prior, toolCalls: [record] }, userRow("Explain.")],
    loadContentSignatures: () =>
      Promise.resolve(
        new Map([
          [
            prior.id,
            {
              content: prose,
              text: [
                { text: "Before.", thoughtSignature: "before" },
                { text: "After.", thoughtSignature: "after" },
              ],
              images: [],
              tools: [{ toolCallId: "signed", thoughtSignature: "call" }],
            },
          ],
        ]),
      ),
  });
  const result = await runTurnPipeline(args);
  expect(result.request.history.slice(0, 3)).toEqual([
    {
      role: "assistant",
      content: [
        { type: "text", text: "Before.", thoughtSignature: "before" },
        { type: "tool-call", toolCallId: "signed", name: "draw", arguments: "{}", thoughtSignature: "call" },
      ],
    },
    { role: "tool", content: [{ type: "tool-result", toolCallId: "signed", content: '"Moon"' }] },
    { role: "assistant", content: [{ type: "text", text: "After.", thoughtSignature: "after" }] },
  ]);
});

test("scoped foreign prose keeps its user role while its original tool exchange remains in history", async () => {
  const other = castId<CharacterId>("char_other");
  const target = castId<CharacterId>("char_target");
  const previous = {
    ...rowOf("assistant", "Before.After."),
    characterId: other,
    toolCalls: [{ toolCallId: "foreign", name: "draw", arguments: "{}", result: "Moon", isError: false, durationMs: 1, textOffset: 7 }],
  };
  const { args } = baseArgs({
    connection: {
      ...TOOL_CONNECTION,
      capability: makeCapability(
        makeGenerationCapability({ ...TOOL_CAPABILITY, reasoning: { mode: "adaptive", enabled: true, effortLevels: ["high"], replay: "signed" } }),
      ),
    },
    intent: { effort: "high", carryReasoning: "conversation" },
    loadReasoningParts: () =>
      Promise.resolve(new Map([[previous.id, [{ type: "reasoning" as const, text: "foreign thinking", meta: { anthropic: { signature: "foreign" } } }]]])),
    loadContentSignatures: () =>
      Promise.resolve(
        new Map([
          [
            previous.id,
            {
              content: previous.content,
              text: [{ text: "Before.", thoughtSignature: "foreign-prose" }],
              images: [],
              tools: [
                {
                  toolCallId: "foreign",
                  thoughtSignature: "foreign-call",
                  reasoningParts: [{ type: "reasoning" as const, text: "foreign thinking", meta: { anthropic: { signature: "foreign" } } }],
                },
              ],
            },
          ],
        ]),
      ),
    canon: [previous, userRow("Explain.")],
    shape: {
      output: "per-speaker",
      cardScope: "scoped",
      scopedTargetId: target,
      speakerName: "Target",
      speakerRef: { kind: "character", characterId: target },
    },
  });
  const result = await runTurnPipeline(args);
  const call = result.request.history.find((message) => message.content.some((part) => part.type === "tool-call"));
  expect(call).toMatchObject({
    role: "assistant",
    content: [{ type: "tool-call", toolCallId: "foreign", name: "draw", arguments: "{}", thoughtSignature: "foreign-call" }],
  });
  expect(
    result.request.history
      .filter((message) => message.content.some((part) => part.type === "text" && (part.text.includes("Before.") || part.text.includes("After."))))
      .map((message) => message.role),
  ).toEqual(["user", "user"]);
  expect(result.request.history.flatMap((message) => message.content)).toContainEqual({ type: "tool-result", toolCallId: "foreign", content: "Moon" });
  const parts = result.request.history.flatMap((message) => message.content);
  expect(parts.some((part) => part.type === "reasoning")).toBe(false);
  expect(parts.filter((part) => part.type === "text").some((part) => part.thoughtSignature !== undefined)).toBe(false);
});

test("a signed reply image before a tool call keeps its original part order on replay", async () => {
  const assetId = mintTypeId(ID_PREFIX.asset);
  const prefix = `Before.![image](asset:${assetId})`;
  const previous = {
    ...rowOf("assistant", `${prefix}After.`),
    toolCalls: [{ toolCallId: "image-call", name: "draw", arguments: "{}", result: "Moon", isError: false, durationMs: 1, textOffset: prefix.length }],
  };
  const connection = { ...TOOL_CONNECTION, capability: makeCapability(makeGenerationCapability({ ...TOOL_CAPABILITY, input: ["text", "image"] })) };
  const { args } = baseArgs({
    connection,
    canon: [previous, userRow("Explain.")],
    loadInlineReplyAssetIds: () => Promise.resolve(new Map([[previous.id, new Set([assetId])]])),
    loadContentSignatures: () =>
      Promise.resolve(new Map([[previous.id, { content: previous.content, text: [], images: [{ assetId, thoughtSignature: "image-signature" }] }]])),
  });
  const result = await runTurnPipeline(args);
  expect(result.request.history[0]?.content.map((part) => part.type)).toEqual(["text", "image", "tool-call"]);
  expect(result.request.history[0]?.content[1]).toMatchObject({ type: "image", thoughtSignature: "image-signature" });
  expect(result.request.history[2]?.content).toEqual([{ type: "text", text: "After." }]);
});

/** Every tool NAME a request offers, in the order an array wire declares them — the executable offer first, the
 *  terminal set after (`toChatRequest`'s projection, pinned in tests/inference/roles/chat-request.test.ts). */

describe("runTurnPipeline — the D48 recurse loop", () => {
  test("#677: the attach-time resolve is scoped to the TURN HOST, never the triggering member", async () => {
    // The attach union comes from the host's own contributor tools (`tctx.runAsUserId`), so the resolve that
    // turns those names into entries has to be keyed the same way — otherwise a name that exists once per
    // installing user resolves to whoever registered first. `runAsUserId` and `triggeredBy` differ in the
    // fixture precisely so a pipeline reaching for the wrong one is visible.
    const drivers: UserId[] = [];
    const host = castId<UserId>("user_room_host");
    const member = castId<UserId>("user_room_member");
    const { args } = baseArgs({
      connection: TOOL_CONNECTION,
      tools: fakeToolOps([], undefined, drivers),
      attachedToolNames: ["tick_clock"],
      runChatTurn: scriptedDepths([[doneFinal("ok")]], []),
      toolExecFrame: {
        runAsUserId: host,
        triggeredBy: member,
        chatId: castId<ChatId>("chat_a"),
        membership: null,
        turnId: castId<ChatTurnId>("chat_turn_a"),
      },
    });
    await runTurnPipeline(args);
    expect(drivers).toEqual([host]);
  });

  test("loop golden: emits calls → executes → recurses with the exchange → finishes; content + usage aggregate", async () => {
    const requests: TurnRequest[] = [];
    const executed: string[][] = [];
    const { args } = baseArgs({
      connection: TOOL_CONNECTION,
      tools: fakeToolOps(executed),
      attachedToolNames: ["tick_clock"],
      runChatTurn: scriptedDepths(
        [[toolFinal("The clock ticks... ", [{ id: "c1", name: "tick_clock", args: '{"m":30}' }])], [doneFinal("Half an hour passes.")]],
        requests,
      ),
    });
    const result = await runTurnPipeline(args);

    // Two role calls; the first carried the neutral offer (the wire's `tools[]` + `auto` are inference's
    // projection of it — tests/inference/roles/chat-request.test.ts).
    expect(requests).toHaveLength(2);
    expect(requests[0]?.tools?.offer?.definitions.map((t) => t.name)).toEqual(["tick_clock"]);
    expect(requests[0]?.tools?.offer?.turnLimit).toBe(5);
    // The recursed request's history grew by the materialized exchange: assistant(tool-call) + tool(result).
    const secondHistory = requests[1]?.history ?? [];
    const appended = secondHistory.slice((requests[0]?.history ?? []).length);
    expect(appended.map((m) => m.role)).toEqual(["assistant", "tool"]);
    expect(appended[0]?.content.some((p) => p.type === "tool-call" && p.name === "tick_clock")).toBe(true);
    expect(appended[1]?.content.some((p) => p.type === "tool-result" && p.toolCallId === "c1")).toBe(true);
    // Executed once, in order; records land on the result in execution order.
    expect(executed).toEqual([["tick_clock"]]);
    expect(result.toolRecords.map((r) => r.name)).toEqual(["tick_clock"]);
    expect(result.toolRecords[0]?.isError).toBe(false);
    // Prose flows across depths into ONE variant; usage sums into one economics row.
    expect(result.content).toBe("The clock ticks... Half an hour passes.");
    expect(result.economics?.tokensIn).toBe(17);
    expect(result.economics?.tokensOut).toBe(8);
    expect(result.economics?.costUsd).toBeCloseTo(0.03);
    expect(result.toolsUnsupported).toBe(false);
  });

  test("limit boundary: the limit-th depth RECORDS the pending calls unexecuted (result:null) and stops", async () => {
    const requests: TurnRequest[] = [];
    const executed: string[][] = [];
    const always = toolFinal("more... ", [{ id: "cX", name: "tick_clock", args: "{}" }]);
    const { args } = baseArgs({
      connection: TOOL_CONNECTION,
      tools: fakeToolOps(executed),
      attachedToolNames: ["tick_clock"],
      toolRecurseLimit: 2,
      runChatTurn: scriptedDepths([[always]], requests),
    });
    const result = await runTurnPipeline(args);
    // Depths 0 and 1 execute; the limit hit at depth 2 records-without-executing and ends the turn.
    expect(requests).toHaveLength(3);
    expect(executed).toHaveLength(2);
    expect(result.toolRecords).toHaveLength(3);
    const last = result.toolRecords.at(-1);
    expect(last?.result).toBeNull();
    expect(last?.isError).toBe(false);
    expect(last?.durationMs).toBeNull();
    expect(result.toolRecords.map((record) => record.callOrdinal)).toEqual([0, 1, 2]);
    expect(last?.turnId).toBe(args.toolExecFrame.turnId);
  });

  test("errors-as-data feedback is VISIBLE to the recursed model (the tool message carries the error document)", async () => {
    const requests: TurnRequest[] = [];
    const { args } = baseArgs({
      connection: TOOL_CONNECTION,
      tools: fakeToolOps([], "party is mid-combat"),
      attachedToolNames: ["tick_clock"],
      runChatTurn: scriptedDepths([[toolFinal("", [{ id: "c1", name: "tick_clock", args: "{}" }])], [doneFinal("I cannot do that right now.")]], requests),
    });
    const result = await runTurnPipeline(args);
    const toolRow = requests[1]?.history.at(-1);
    const resultPart = toolRow?.content.find((p) => p.type === "tool-result");
    const narrowed = resultPart?.type === "tool-result" ? resultPart : null;
    expect(JSON.parse(narrowed?.content ?? "{}")).toEqual({ error: "party is mid-combat" });
    expect(narrowed?.isError).toBe(true);
    expect(result.toolRecords[0]?.isError).toBe(true);
  });

  test("byte-identity pin (05 §T4): tools null vs wired-but-unattached — the request is deep-equal, no tools field", async () => {
    const reqA: TurnRequest[] = [];
    const reqB: TurnRequest[] = [];
    const depthScript = [[doneFinal("hi")]];
    const { args: a } = baseArgs({ tools: null, runChatTurn: scriptedDepths(depthScript, reqA) });
    const { args: b } = baseArgs({
      tools: fakeToolOps([]),
      attachedToolNames: [],
      runChatTurn: scriptedDepths(depthScript, reqB),
    });
    await runTurnPipeline(a);
    await runTurnPipeline(b);
    expect(reqA[0]).not.toHaveProperty("tools");
    expect(reqB[0]).not.toHaveProperty("tools");
    expect(JSON.stringify(reqA[0])).toBe(JSON.stringify(reqB[0]));
  });

  test("the capability gate: attached but capability.tools absent → dropped + flagged; ONE call, no tools field", async () => {
    const requests: TurnRequest[] = [];
    const executed: string[][] = [];
    const { args } = baseArgs({
      // CONNECTION (no tools capability) — the gate drops the attachment.
      tools: fakeToolOps(executed),
      attachedToolNames: ["tick_clock"],
      runChatTurn: scriptedDepths([[doneFinal("plain reply")]], requests),
    });
    const result = await runTurnPipeline(args);
    expect(requests).toHaveLength(1);
    expect(requests[0]).not.toHaveProperty("tools");
    expect(executed).toHaveLength(0);
    expect(result.toolsUnsupported).toBe(true);
    expect(result.toolRecords).toEqual([]);
  });

  // The connection editor's tool-calls no: a declared absence folded over a server's reported yes.
  test("a declared no to tool calls over a reported yes sends no tools field", async () => {
    const requests: TurnRequest[] = [];
    const folded = synthesizeCapability("generation", "other", {
      advertised: { tools: { parallel: true } },
      declared: { generation: { tools: null } },
    }).capability;
    const { args } = baseArgs({
      connection: { ...TOOL_CONNECTION, capability: folded },
      tools: fakeToolOps([]),
      attachedToolNames: ["tick_clock"],
      runChatTurn: scriptedDepths([[doneFinal("plain reply")]], requests),
    });
    const result = await runTurnPipeline(args);
    expect(requests[0]).not.toHaveProperty("tools");
    expect(result.toolsUnsupported).toBe(true);
    // PLANTED CONTROL: the same reported yes without the declaration attaches the tools.
    const control: TurnRequest[] = [];
    const reported = synthesizeCapability("generation", "other", { advertised: { tools: { parallel: true } } }).capability;
    await runTurnPipeline(
      baseArgs({
        connection: { ...TOOL_CONNECTION, capability: reported },
        tools: fakeToolOps([]),
        attachedToolNames: ["tick_clock"],
        runChatTurn: scriptedDepths([[doneFinal("plain reply")]], control),
      }).args,
    );
    expect(control[0]).toHaveProperty("tools");
  });
});

// A structured-output payload a turn may ask for; how it rides is the backend plan's.
const RESPONSE_FORMAT = { name: "narrative", schema: wireSchema({ type: "object", properties: {}, additionalProperties: false }) } as const;

describe("runTurnPipeline — §8.8 reasoning CARRY across a tool chain", () => {
  // A model that reasons AND round-trips its own signed thinking — the only shape where the carry knob has
  // anything to do. `replay: "signed"` is the capability cell; `effort` is what turns reasoning ON.
  const carryCapability: GenerationCapability = makeGenerationCapability({
    ...CAPABILITY,
    tools: { parallel: true },
    reasoning: { mode: "adaptive", enabled: true, effortLevels: ["low", "medium", "high"], replay: "signed" },
  });
  const carryConnection: Resolved<"chat"> = { ...CONNECTION, capability: makeCapability(carryCapability) };

  const signedPart: ChatReasoningPart = { type: "reasoning", text: "I should tick the clock.", meta: { anthropic: { signature: "SIG-1" } } };

  /** Leg 1 emits a signed thinking block + a tool call; leg 2 answers. The parts ride the FINAL chunk, which
   *  is how a real wire hands them over (`ChatResult.reasoningParts` → `finalTurnChunk`). */
  const legs = (requests: TurnRequest[]): RunChatTurnOp =>
    scriptedDepths(
      [
        [
          {
            kind: "final",
            economics: {
              content: "Let me check. ",
              finishReason: "tool",
              toolCalls: [{ toolCallId: "c1", name: "tick_clock", arguments: "{}", thoughtSignature: "TOOL-SIG-1" }],
              reasoningParts: [signedPart],
            },
          },
        ],
        [doneFinal("Half an hour passes.")],
      ],
      requests,
    );

  const carryArgs = (carryReasoning: UserIntent["carryReasoning"], requests: TurnRequest[]): PipelineArgs =>
    baseArgs({
      connection: carryConnection,
      tools: fakeToolOps([]),
      attachedToolNames: ["tick_clock"],
      intent: { effort: "high", ...(carryReasoning === undefined ? {} : { carryReasoning }) } satisfies UserIntent,
      runChatTurn: legs(requests),
    }).args;

  /** The assistant row the loop appended for the next leg — the one the converter turns into wire blocks. */
  const appendedAssistantRow = (requests: readonly TurnRequest[]): TurnMessage | undefined => {
    const second = requests[1]?.history ?? [];
    return second.slice((requests[0]?.history ?? []).length).at(0);
  };

  test("`tool-chain`: leg 2's assistant row carries the signed thinking FIRST, ahead of the prose and the tool call", async () => {
    const requests: TurnRequest[] = [];
    await runTurnPipeline(carryArgs("tool-chain", requests));

    const row = appendedAssistantRow(requests);
    expect(row?.role).toBe("assistant");
    // ORDER IS THE PIN: Anthropic requires the thinking block at the head of an assistant turn, and the
    // converter emits parts in array order — a signature behind the tool_use is not the turn the model signed.
    expect(row?.content.map((part) => part.type)).toEqual(["reasoning", "text", "tool-call"]);
    expect(row?.content[0]).toEqual(signedPart);
  });

  test("`off` (the default): the same loop hands leg 2 NO thinking — the model sees an amnesiac chain", async () => {
    const requests: TurnRequest[] = [];
    await runTurnPipeline(carryArgs(undefined, requests));

    const row = appendedAssistantRow(requests);
    expect(row?.content.map((part) => part.type)).toEqual(["text", "tool-call"]);
  });

  test("required tool signature rides the follow-up with thinking off and stays out of public tool records", async () => {
    const requests: TurnRequest[] = [];
    const result = await runTurnPipeline(carryArgs(undefined, requests));
    expect(appendedAssistantRow(requests)?.content.find((part) => part.type === "tool-call")).toMatchObject({ thoughtSignature: "TOOL-SIG-1" });
    expect(result.toolRecords).toHaveLength(1);
    expect(result.toolRecords[0]).not.toHaveProperty("thoughtSignature");
  });

  test("the COHERENCE rule: a carry knob on a turn with reasoning OFF drops back to `off`", async () => {
    const requests: TurnRequest[] = [];
    // Same capability, but `effort: "none"` turns reasoning off for the turn — so there is nothing to carry
    // and the rung collapses, exactly as §8.8 states (the funnel raises the drop warning on the wire side).
    const { args } = baseArgs({
      connection: carryConnection,
      tools: fakeToolOps([]),
      attachedToolNames: ["tick_clock"],
      intent: { effort: "none", carryReasoning: "tool-chain" } satisfies UserIntent,
      runChatTurn: legs(requests),
    });
    await runTurnPipeline(args);

    expect(appendedAssistantRow(requests)?.content.map((part) => part.type)).toEqual(["text", "tool-call"]);
  });

  test("the CAPABILITY gate: a model that accepts no replayed thinking (`replay` absent ⇒ the `none` floor) drops it", async () => {
    const requests: TurnRequest[] = [];
    const noReplay: GenerationCapability = makeGenerationCapability({
      ...CAPABILITY,
      tools: { parallel: true },
      reasoning: { mode: "adaptive", enabled: true, effortLevels: ["high"] },
    });
    const { args } = baseArgs({
      connection: { ...CONNECTION, capability: makeCapability(noReplay) },
      tools: fakeToolOps([]),
      attachedToolNames: ["tick_clock"],
      intent: { effort: "high", carryReasoning: "tool-chain" } satisfies UserIntent,
      runChatTurn: legs(requests),
    });
    await runTurnPipeline(args);

    expect(appendedAssistantRow(requests)?.content.map((part) => part.type)).toEqual(["text", "tool-call"]);
  });
});

describe("runTurnPipeline — a structured turn rides the plan, with no free-text fallback", () => {
  test("a responseFormat always rides the request: the capability is the plan's to read, not the pipeline's", async () => {
    const requests: TurnRequest[] = [];
    const { args } = baseArgs({
      responseFormat: RESPONSE_FORMAT,
      runChatTurn: scriptedDepths([[doneFinal("{}")]], requests),
    });
    await runTurnPipeline(args);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.responseFormat).toEqual(RESPONSE_FORMAT);
  });

  test("a structured turn the plan refuses ends with the typed violations and runs no free-text turn", async () => {
    const requests: TurnRequest[] = [];
    const refusal = new ProviderError({
      kind: "invalid",
      retryable: false,
      message: "the structured request does not fit this model",
      detail: "schema_rejected",
      violations: [{ kind: "no-vehicle", mode: "hosted-common", cause: "unsupported" }],
    });
    const { args } = baseArgs({
      responseFormat: RESPONSE_FORMAT,
      runChatTurn: (req) => {
        requests.push(req);
        return (async function* (): AsyncGenerator<TurnStreamChunk> {
          await Promise.resolve();
          yield* [];
          throw refusal;
        })();
      },
    });
    await expect(runTurnPipeline(args)).rejects.toMatchObject({ detail: "schema_rejected", violations: [{ kind: "no-vehicle" }] });
    expect(requests).toHaveLength(1);
  });

  test("no responseFormat requested → byte-identical no-op (no field)", async () => {
    const requests: TurnRequest[] = [];
    const { args } = baseArgs({ runChatTurn: scriptedDepths([[doneFinal("hi")]], requests) });
    await runTurnPipeline(args);
    expect(requests[0]).not.toHaveProperty("responseFormat");
  });
});

describe("runTurnPipeline — the backend-neutral tool offer (a backend-owned loop drives `execute`)", () => {
  const agentConnection: Resolved<"chat"> = { ...TOOL_CONNECTION, api: "agent-sdk" };

  /** A role that plays a backend OWNING the tool loop: mid-turn it invokes the offer's `execute` once per call
   *  (as the Agent SDK's mounted MCP handlers do) and records what came back, then finishes with no tool pivot. */
  function backendLoop(calls: readonly ToolCallInput[], sink: TurnRequest[], outcomes: ChatToolExecution[]): RunChatTurnOp {
    return (req) => {
      sink.push(req);
      return (async function* (): AsyncGenerator<TurnStreamChunk> {
        for (const call of calls) {
          const offer = req.tools?.offer;
          if (offer === undefined) {
            throw new Error("no tool offer rode the request");
          }
          outcomes.push(await offer.execute(call));
        }
        yield doneFinal("done");
      })();
    };
  }

  test("the SAME neutral offer rides whichever wire the connection speaks — the pipeline never branches on it", async () => {
    const offersFor = async (connection: Resolved<"chat">): Promise<TurnRequest["tools"]> => {
      const requests: TurnRequest[] = [];
      const { args } = baseArgs({
        connection,
        tools: fakeToolOps([]),
        attachedToolNames: ["tick_clock"],
        toolRecurseLimit: 3,
        runChatTurn: scriptedDepths([[doneFinal("x")]], requests),
      });
      await runTurnPipeline(args);
      return requests[0]?.tools;
    };
    const onAgent = await offersFor(agentConnection);
    const onArray = await offersFor(TOOL_CONNECTION);
    expect(onAgent?.offer?.definitions).toEqual(onArray?.offer?.definitions);
    expect(onAgent?.offer?.turnLimit).toBe(3);
    expect(onArray?.offer?.turnLimit).toBe(3);
    expect(onAgent?.terminal).toBeUndefined();
  });

  test("a backend-driven call runs the ONE execute path and its record is persisted with the turn", async () => {
    const requests: TurnRequest[] = [];
    const executed: string[][] = [];
    const outcomes: ChatToolExecution[] = [];
    const call: ToolCallInput = { toolCallId: "mcp_tick_clock_1", name: "tick_clock", arguments: '{"m":30}', thoughtSignature: "backend-call-signature" };
    const { args } = baseArgs({
      connection: agentConnection,
      tools: fakeToolOps(executed),
      attachedToolNames: ["tick_clock"],
      runChatTurn: backendLoop([call], requests, outcomes),
    });
    const result = await runTurnPipeline(args);
    // One role call: the backend owned the loop, so there is no `finishReason: "tool"` pivot to recurse on.
    expect(requests).toHaveLength(1);
    // Single call in, single call executed — the batch path is the same one the recurse loop uses.
    expect(executed).toEqual([["tick_clock"]]);
    // The record the backend's call produced is the one the turn persists, byte-for-byte (D48 parity)…
    expect(result.toolRecords).toEqual([
      {
        toolCallId: "mcp_tick_clock_1",
        turnId: args.toolExecFrame.turnId,
        callOrdinal: 0,
        exchangeOrdinal: 0,
        exchangeTextEnd: 0,
        textOffset: 0,
        name: "tick_clock",
        arguments: '{"m":30}',
        result: JSON.stringify({ ok: "tick_clock" }),
        isError: false,
        durationMs: 1,
      },
    ]);
    expect(result.toolSignatures).toEqual([
      { toolCallId: call.toolCallId, turnId: args.toolExecFrame.turnId, callOrdinal: 0, thoughtSignature: "backend-call-signature" },
    ]);
    // …and the backend is handed exactly the record's serialized result.
    expect(outcomes).toEqual([{ text: JSON.stringify({ ok: "tick_clock" }), isError: false }]);
    expect(result.toolsUnsupported).toBe(false);
    expect(result.content).toBe("done");
  });

  test("concurrent backend offers reserve occurrence ordinals before execution settles", async () => {
    const releases: (() => void)[] = [];
    const calls: readonly ToolCallInput[] = [
      { toolCallId: "shared", name: "draw", arguments: "{}", thoughtSignature: "first" },
      { toolCallId: "shared", name: "tick_clock", arguments: "{}", thoughtSignature: "second" },
    ];
    const { args } = baseArgs({
      connection: agentConnection,
      attachedToolNames: ["draw", "tick_clock"],
      tools: {
        resolveTools: () => ({}),
        toToolDefinitions: () => [],
        prepareExecution: () =>
          Promise.resolve(async (batch) => {
            await new Promise<void>((resolve) => releases.push(resolve));
            return batch.map((call) => ({
              toolCallId: call.toolCallId,
              name: call.name,
              arguments: call.arguments,
              result: call.name,
              isError: false,
              durationMs: 1,
            }));
          }),
      },
      runChatTurn: (request) =>
        (async function* (): AsyncGenerator<TurnStreamChunk> {
          const offer = request.tools?.offer;
          if (offer === undefined) {
            throw new Error("missing offer");
          }
          const pending = calls.map((call) => offer.execute(call));
          expect(releases).toHaveLength(2);
          releases[1]?.();
          await pending[1];
          releases[0]?.();
          await Promise.all(pending);
          yield doneFinal("Done.");
        })(),
    });
    const result = await runTurnPipeline(args);
    expect(result.toolRecords.map((record) => [record.name, record.callOrdinal])).toEqual([
      ["draw", 0],
      ["tick_clock", 1],
    ]);
    expect(result.toolSignatures.map((record) => [record.thoughtSignature, record.callOrdinal])).toEqual([
      ["first", 0],
      ["second", 1],
    ]);
    expect(result.toolRecords.map((record) => record.exchangeOrdinal)).toEqual([0, 1]);
    await assertConvertedToolNames(result.toolRecords, result.content, ["draw", "tick_clock"]);
  });

  test("an errors-as-data execution reaches the backend as an error, and is still recorded", async () => {
    const outcomes: ChatToolExecution[] = [];
    const call: ToolCallInput = { toolCallId: "mcp_tick_clock_1", name: "tick_clock", arguments: "{}" };
    const { args } = baseArgs({
      connection: agentConnection,
      tools: fakeToolOps([], "not permitted: tick_clock"),
      attachedToolNames: ["tick_clock"],
      runChatTurn: backendLoop([call], [], outcomes),
    });
    const result = await runTurnPipeline(args);
    expect(outcomes).toEqual([{ text: JSON.stringify({ error: "not permitted: tick_clock" }), isError: true }]);
    expect(result.toolRecords.map((r) => r.isError)).toEqual([true]);
  });

  test("an execute path that returns NO record fails the call loudly — never a silent empty result", async () => {
    const ops: ChatToolOps = { ...fakeToolOps([]), prepareExecution: () => Promise.resolve(() => Promise.resolve([])) };
    const call: ToolCallInput = { toolCallId: "mcp_tick_clock_1", name: "tick_clock", arguments: "{}" };
    const { args } = baseArgs({
      connection: agentConnection,
      tools: ops,
      attachedToolNames: ["tick_clock"],
      runChatTurn: backendLoop([call], [], []),
    });
    await expect(runTurnPipeline(args)).rejects.toThrow("tool-use: executeToolCalls returned no record for tick_clock");
  });

  test("the turn's authority is bound ONCE, before the first model call, and every recursion depth reuses it", async () => {
    const order: string[] = [];
    const base = fakeToolOps([]);
    const depths = scriptedDepths([[toolFinal("", [{ id: "c1", name: "tick_clock", args: "{}" }])], [doneFinal("x")]], []);
    const ops: ChatToolOps = {
      ...base,
      prepareExecution: (set, frame) => {
        order.push("bind");
        return base.prepareExecution(set, frame);
      },
    };
    const { args } = baseArgs({
      connection: TOOL_CONNECTION,
      tools: ops,
      attachedToolNames: ["tick_clock"],
      runChatTurn: (req) => {
        order.push("model");
        return depths(req);
      },
    });
    await runTurnPipeline(args);
    expect(order).toEqual(["bind", "model", "model"]);
  });

  test("an array wire's calls run through the recurse loop — the offer's execute is never the pipeline's to call", async () => {
    const requests: TurnRequest[] = [];
    const executed: string[][] = [];
    const { args } = baseArgs({
      connection: TOOL_CONNECTION,
      tools: fakeToolOps(executed),
      attachedToolNames: ["tick_clock"],
      runChatTurn: scriptedDepths([[toolFinal("", [{ id: "c1", name: "tick_clock", args: "{}" }])], [doneFinal("x")]], requests),
    });
    const result = await runTurnPipeline(args);
    expect(requests).toHaveLength(2);
    expect(executed).toEqual([["tick_clock"]]);
    expect(result.toolRecords.map((r) => r.toolCallId)).toEqual(["c1"]);
  });
});
