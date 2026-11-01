// Raw external process bytes only; the installed SDK still owns Query, control routing and JSON decoding.
import process from "node:process";
import { readSdkProcessInput } from "@orb/testkit/node/helpers";
import { z } from "zod";

const { sdkSessionId: sessionId, frameId, lines } = await readSdkProcessInput();

const inputSchema = z.object({
  type: z.string(),
  ["request_id"]: z.string().optional(),
  request: z.object({ subtype: z.string(), sdkMcpServers: z.array(z.string()).optional() }).optional(),
});

function write(value: object): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function writeMetadata(model: string, mode: string, common: Readonly<Record<string, string>>): void {
  const frames = [
    {
      mode: "bad-meta-compact",
      frame: {
        type: "system",
        subtype: "compact_boundary",
        ["compact_metadata"]: { trigger: "auto", ["pre_tokens"]: mode === "bad-meta-compact" ? "3" : 3, ["post_tokens"]: 2, ["duration_ms"]: 1 },
      },
    },
    {
      mode: "bad-meta-retry",
      frame: {
        type: "system",
        subtype: "api_retry",
        error: "overloaded",
        attempt: mode === "bad-meta-retry" ? "1" : 1,
        ["max_retries"]: 2,
        ["retry_delay_ms"]: 0,
        ["error_status"]: 503,
      },
    },
    {
      mode: "bad-meta-status",
      frame: { type: "system", subtype: "status", status: "compacting", ["compact_result"]: mode === "bad-meta-status" ? 7 : "success" },
    },
    { mode: "bad-meta-thinking", frame: { type: "system", subtype: "thinking_tokens", ["estimated_tokens"]: mode === "bad-meta-thinking" ? "1" : 1 } },
    {
      mode: "bad-meta-fallback",
      frame: {
        type: "system",
        subtype: "model_refusal_fallback",
        ["original_model"]: model,
        ["fallback_model"]: mode === "bad-meta-fallback" ? 7 : `${model}-fallback`,
      },
    },
    {
      mode: "bad-meta-refusal",
      frame: {
        type: "system",
        subtype: "model_refusal_no_fallback",
        ["original_model"]: mode === "bad-meta-refusal" ? 7 : model,
        ["api_refusal_category"]: "other",
        ["api_refusal_explanation"]: "native metadata",
      },
    },
    {
      mode: "bad-meta-limit",
      frame: {
        type: "rate_limit_event",
        ["rate_limit_info"]: { status: "allowed", utilization: mode === "bad-meta-limit" ? "0.1" : 0.1, isUsingOverage: false },
      },
    },
    { mode: "bad-meta-auth", frame: { type: "auth_status", isAuthenticating: mode === "bad-meta-auth" ? "false" : false } },
    {
      mode: "bad-meta-delta",
      frame: {
        type: "stream_event",
        event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: mode === "bad-meta-delta" ? 7 : "native delta" } },
      },
    },
  ];
  for (const entry of mode === "metadata" ? frames : frames.filter((candidate) => candidate.mode === mode)) {
    write({ ...common, uuid: frameId(entry.mode), ...entry.frame });
  }
}

function writeTurn(model: string, mode: string, reply = "native wire reply"): void {
  const common = { ["session_id"]: sessionId };
  write({ ...common, uuid: frameId("init"), type: "system", subtype: "init", apiKeySource: "none", model });
  writeMetadata(model, mode, common);
  write({
    ...common,
    uuid: frameId("assistant"),
    type: "assistant",
    message: {
      role: "assistant",
      content: [{ type: "text", text: mode === "bad-text" ? { text: "not text" } : reply }],
      ["stop_reason"]: "end_turn",
    },
  });
  const usage = {
    ["input_tokens"]: mode === "bad-tokens" ? "1" : 1,
    ["output_tokens"]: 1,
    ["cache_read_input_tokens"]: 0,
    ["cache_creation_input_tokens"]: 0,
  };
  const usageModel = mode === "bad-secret-path" ? process.argv[4] : model;
  if (usageModel === undefined) {
    throw new Error("SDK wire child requires its public fixture token");
  }
  const modelUsage = {
    [usageModel]: {
      inputTokens: 1,
      outputTokens: 1,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      costUSD: mode === "bad-cost" || mode === "bad-secret-path" ? "1" : 1,
      webSearchRequests: 0,
      contextWindow: 8192,
      maxOutputTokens: 1024,
    },
    auxiliary: {
      inputTokens: 1,
      outputTokens: 1,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      costUSD: 2,
      webSearchRequests: 0,
      contextWindow: 8192,
      maxOutputTokens: 1024,
    },
  };
  write({
    ...common,
    uuid: frameId("result"),
    type: "result",
    subtype: "success",
    ["duration_ms"]: 1,
    ["duration_api_ms"]: 1,
    ["is_error"]: false,
    ["num_turns"]: 1,
    result: reply,
    ["stop_reason"]: "end_turn",
    ["total_cost_usd"]: 3,
    usage,
    modelUsage,
    ["permission_denials"]: [],
  });
}

function controlResponse(subtype: string | undefined, model: string, mode: string): object {
  if (subtype === "initialize") {
    return {
      commands: [],
      agents: [],
      ["output_style"]: "default",
      ["available_output_styles"]: [],
      ["hooks_applied"]: true,
      models: [{ value: mode === "bad-models" ? 7 : model, displayName: "Native wire model", description: "Scripted external model" }],
      account: { email: mode === "bad-account" ? 7 : "native@example.test", apiProvider: "firstParty" },
    };
  }
  if (subtype === "get_context_usage") {
    return { totalTokens: 2, maxTokens: 8192, percentage: (2 / 8192) * 100, model };
  }
  throw new Error("unscripted SDK wire control");
}

const MCP_PROBE_MODE = "mcp-probe";
const mcpReplySchema = z.object({
  type: z.literal("control_response"),
  response: z.object({ ["request_id"]: z.string(), response: z.object({ ["mcp_response"]: z.json() }) }),
});

function flagValue(flag: string): string | undefined {
  const at = process.argv.indexOf(flag);
  return at === -1 ? process.argv.find((argument) => argument.startsWith(`${flag}=`))?.slice(flag.length + 1) : process.argv[at + 1];
}

/** The runtime's half of the in-process MCP handshake: the SDK-owned server answers these exactly as it answers the runtime. */
function mcpProbe(servers: readonly string[], finish: (report: string) => void): { readonly begin: () => void; readonly answer: (line: string) => void } {
  const steps = [
    { method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "sdk-wire-child", version: "0" } } },
    { method: "tools/list", params: {} },
    { method: "tools/call", params: { name: "probe", arguments: { label: "wire" } } },
  ];
  const replies: unknown[] = [];
  const send = (): void => {
    const step = steps[replies.length];
    write({
      type: "control_request",
      ["request_id"]: `mcp-${String(replies.length)}`,
      request: { subtype: "mcp_message", ["server_name"]: servers[0], message: { jsonrpc: "2.0", id: replies.length, ...step } },
    });
  };
  return {
    begin: send,
    answer: (line): void => {
      replies.push(mcpReplySchema.parse(JSON.parse(line)).response.response.mcp_response);
      if (replies.length < steps.length) {
        send();
      } else {
        finish(JSON.stringify({ servers, allowedTools: flagValue("--allowedTools"), replies }));
      }
    },
  };
}

async function run(): Promise<void> {
  const mode = process.argv[2];
  const model = process.argv[3];
  if (mode === undefined || model === undefined) {
    throw new Error("SDK wire child requires its explicit case and model");
  }
  const servers: string[] = [];
  const probe = mode === MCP_PROBE_MODE ? mcpProbe(servers, (report) => writeTurn(model, mode, report)) : null;
  for await (const line of lines) {
    const message = inputSchema.parse(JSON.parse(line));
    if (message.type === "control_response") {
      probe?.answer(line);
      continue;
    }
    if (message.type === "control_request") {
      servers.push(...(message.request?.sdkMcpServers ?? []));
      const response = controlResponse(message.request?.subtype, model, mode);
      write({ type: "control_response", response: { subtype: "success", ["request_id"]: message.request_id, response } });
      continue;
    }
    if (message.type !== "user") {
      throw new Error("unscripted SDK wire input");
    }
    if (probe === null || servers.length === 0) {
      writeTurn(model, mode);
    } else {
      probe.begin();
    }
  }
}

if (import.meta.main) {
  await run();
}
