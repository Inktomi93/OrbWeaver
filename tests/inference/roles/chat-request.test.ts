// roles/chat-request — `toChatRequest`, the ONE projection from the backend-neutral chat turn onto the request
// arm the connection's api reads (D177). Pins both deliveries of the same
// neutral tools: an ARRAY wire declares them in `tools[]` (executable first, terminal after, `toolChoice: auto`)
// and never calls `execute`; the AGENT SDK mounts the executable set as an in-process MCP server whose handlers
// synthesize `mcp_<name>_<n>` call ids and run `execute`, and carries the terminal set on its own channel. Also
// the history half (the system band lifts onto the dynamic prompt on the SDK arm only) and the no-api refusal.

import type { ChatApi } from "@orb/contracts/inference";
import type { ChatRequest, ChatToolDefinition, ChatToolExecution, ChatTurnInput, ToolCallInput, WireTool } from "@orb/inference";
import { ProviderError, toChatRequest } from "@orb/inference";
import type { ChatId, ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { z } from "zod";
import { makeResolved } from "../../support/factories/resolved-connection.ts";
import { expect, test } from "../../support/fixtures.ts";

const CHAT_ID = castId<ChatId>("chat_projection");

const TICK: ChatToolDefinition = {
  name: "tick_clock",
  description: "advance the clock",
  parameters: { type: "object", properties: { minutes: { type: "number" } }, required: ["minutes"], additionalProperties: false },
  inputShape: { minutes: z.number() },
};

const ROLL: ChatToolDefinition = {
  name: "roll_dice",
  description: "roll",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  inputShape: {},
};

const SCENE: WireTool = { name: "update_scene", description: "scene", parameters: { type: "object", properties: {} } };

/** A recording `execute`: every call lands in `calls`; `isError` flips on a `fail` argument. */
function recordingExecute(calls: ToolCallInput[]): (call: ToolCallInput) => Promise<ChatToolExecution> {
  return (call) => {
    calls.push(call);
    return Promise.resolve({ text: `ran ${call.name} ${call.arguments}`, isError: call.arguments.includes("fail") });
  };
}

function turnOf(api: ChatApi | null, over: { readonly tools?: ChatTurnInput["tools"] } = {}): ChatTurnInput {
  return {
    connection: makeResolved({ api, model: castId<ModelId>("test-model") }),
    params: {},
    systemPrompt: { static: "STATIC", dynamic: "DYNAMIC" },
    chatId: CHAT_ID,
    onDelta: () => undefined,
    history: [
      { role: "user", content: [{ type: "text", text: "hello" }] },
      { role: "assistant", content: [{ type: "text", text: "hi" }] },
      { role: "system", content: [{ type: "text", text: "GM note" }] },
      { role: "user", content: [{ type: "text", text: "and then?" }] },
    ],
    cacheBreakpointDepth: 2,
    reasoningTags: { prefix: "<think>", suffix: "</think>" },
    ...(over.tools !== undefined ? { tools: over.tools } : {}),
  };
}

/** The mounted MCP tool's handler, read off the server instance the SDK itself dispatches through. LOUD if the
 *  SDK moves its registry: a silently-absent handler would make every assertion below vacuous. */
type McpHandler = (args: Record<string, unknown>, extra: unknown) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>;
function mountedHandler(req: ChatRequest, name: string): McpHandler {
  const server = "toolServer" in req ? req.toolServer : undefined;
  const registered = (server as { instance?: { _registeredTools?: Record<string, { handler?: McpHandler }> } } | undefined)?.instance?._registeredTools;
  const handler = registered?.[name]?.handler;
  if (handler === undefined) {
    throw new Error(`no mounted MCP handler for ${name} — the SDK's server registry shape moved`);
  }
  return handler;
}

describe("toChatRequest — array wires", () => {
  test("executable definitions ride FIRST as plain declarations, terminal after, with toolChoice auto", () => {
    const calls: ToolCallInput[] = [];
    const req = toChatRequest(
      turnOf("chat-completions", { tools: { offer: { definitions: [TICK, ROLL], execute: recordingExecute(calls), turnLimit: 3 }, terminal: [SCENE] } }),
    );
    expect(req.api).toBe("chat-completions");
    // The zod shape is the MCP projection's alone — it never reaches a JSON body.
    expect("tools" in req ? req.tools : undefined).toEqual([
      { name: "tick_clock", description: "advance the clock", parameters: TICK.parameters },
      { name: "roll_dice", description: "roll", parameters: ROLL.parameters },
      SCENE,
    ]);
    expect("toolChoice" in req ? req.toolChoice : undefined).toEqual({ mode: "auto" });
    expect(req).not.toHaveProperty("toolServer");
    // The caller's loop runs array-wire calls; the projection never invokes `execute`.
    expect(calls).toEqual([]);
  });

  test("the history rides VERBATIM (system rows included) with the array-only knobs", () => {
    const input = turnOf("anthropic-messages");
    const req = toChatRequest(input);
    expect(req.api).toBe("anthropic-messages");
    expect("history" in req ? req.history : undefined).toBe(input.history);
    expect(req.systemPrompt).toEqual({ static: "STATIC", dynamic: "DYNAMIC" });
    expect("cacheBreakpointDepth" in req ? req.cacheBreakpointDepth : undefined).toBe(2);
    expect("reasoningTags" in req ? req.reasoningTags : undefined).toEqual({ prefix: "<think>", suffix: "</think>" });
    expect(req.chatId).toBe(CHAT_ID);
  });

  test("a tool-less turn carries NEITHER tools nor toolChoice — byte-identical to a pre-tools request", () => {
    const req = toChatRequest(turnOf("chat-completions"));
    expect(req).not.toHaveProperty("tools");
    expect(req).not.toHaveProperty("toolChoice");
  });

  test("terminal-only tools still ride the one tools[] with toolChoice auto", () => {
    const req = toChatRequest(turnOf("chat-completions", { tools: { terminal: [SCENE] } }));
    expect("tools" in req ? req.tools : undefined).toEqual([SCENE]);
    expect("toolChoice" in req ? req.toolChoice : undefined).toEqual({ mode: "auto" });
  });
});

describe("toChatRequest — the Agent SDK", () => {
  test("the executable set mounts as an MCP server whose handlers run `execute` with synthesized call ids", async () => {
    const calls: ToolCallInput[] = [];
    const req = toChatRequest(turnOf("agent-sdk", { tools: { offer: { definitions: [TICK, ROLL], execute: recordingExecute(calls), turnLimit: 3 } } }));
    expect(req.api).toBe("agent-sdk");
    expect("toolTurnLimit" in req ? req.toolTurnLimit : undefined).toBe(3);
    expect(req).not.toHaveProperty("tools");
    expect(req).not.toHaveProperty("toolChoice");

    const first = await mountedHandler(req, "tick_clock")({ minutes: 30 }, {});
    const second = await mountedHandler(req, "roll_dice")({}, {});
    const failed = await mountedHandler(req, "tick_clock")({ minutes: 1, note: "fail" }, {});

    // ONE ordinal per mounted server, counted across every tool on it; the arguments are the SDK's parsed
    // object re-serialized for the caller's one execute path.
    expect(calls).toEqual([
      { toolCallId: "mcp_tick_clock_1", name: "tick_clock", arguments: '{"minutes":30}' },
      { toolCallId: "mcp_roll_dice_2", name: "roll_dice", arguments: "{}" },
      { toolCallId: "mcp_tick_clock_3", name: "tick_clock", arguments: '{"minutes":1,"note":"fail"}' },
    ]);
    // The outcome maps onto the MCP result: the text verbatim, `isError` only when the execution says so.
    expect(first).toEqual({ content: [{ type: "text", text: 'ran tick_clock {"minutes":30}' }] });
    expect(second).toEqual({ content: [{ type: "text", text: "ran roll_dice {}" }] });
    expect(failed).toEqual({ content: [{ type: "text", text: 'ran tick_clock {"minutes":1,"note":"fail"}' }], isError: true });
  });

  test("terminal tools ride their own channel, never an array and never the executable server", () => {
    const req = toChatRequest(turnOf("agent-sdk", { tools: { terminal: [SCENE] } }));
    expect("terminalTools" in req ? req.terminalTools : undefined).toEqual([SCENE]);
    expect(req).not.toHaveProperty("toolServer");
    expect(req).not.toHaveProperty("toolTurnLimit");
    expect(req).not.toHaveProperty("tools");
  });

  test("the history becomes seed + prompt, the system band lifts onto the tail hook text, and the array knobs drop", () => {
    const req = toChatRequest(turnOf("agent-sdk"));
    expect("seed" in req ? req.seed : undefined).toEqual([
      { role: "user", content: [{ type: "text", text: "hello" }] },
      { role: "assistant", content: [{ type: "text", text: "hi" }] },
    ]);
    expect("prompt" in req ? req.prompt : undefined).toBe("and then?");
    // The system-region halves stay where the prompt put them; only the rows below the history ride the hook.
    expect(req.systemPrompt).toEqual({ static: "STATIC", dynamic: "DYNAMIC" });
    expect("tailSystem" in req ? req.tailSystem : undefined).toBe("GM note");
    expect(req).not.toHaveProperty("history");
    expect(req).not.toHaveProperty("cacheBreakpointDepth");
    expect(req).not.toHaveProperty("reasoningTags");
  });

  test("a tool-less turn mounts nothing", () => {
    const req = toChatRequest(turnOf("agent-sdk"));
    expect(req).not.toHaveProperty("toolServer");
    expect(req).not.toHaveProperty("terminalTools");
  });
});

test("a chat connection with NO chat api is refused as an invariant, never projected", () => {
  const input = turnOf(null);
  expect(() => toChatRequest(input)).toThrow(ProviderError);
  expect(() => toChatRequest(input)).toThrow(`connection ${input.connection.connectionId} carries no chat api`);
});
