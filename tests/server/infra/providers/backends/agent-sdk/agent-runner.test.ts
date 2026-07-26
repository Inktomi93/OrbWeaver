// biome-ignore-all lint/style/useNamingConvention: synthetic SDK message fixtures use snake_case wire
// fields (session_id, stop_reason, num_turns, modelUsage, cache_creation, …).
//
// runAgentTurn — AGENT MODE: a turn that STARTS from the same firewall base as the roleplay turn
// (disciplineOptions: tools:[] + cowork denylist + strict MCP + credential-scoped env) and ADDS exactly
// two things — the caller's in-process MCP server + a lifted maxTurns. That asymmetry IS the firewall, so
// we assert: the firewall base survives, the MCP server registers under `orbweaver` and tools are scoped
// to `mcp__orbweaver__*`, the turn/output ceilings default + honor overrides, and the stream reduces.
// Driven via createAgentSdkBackend().runAgentTurn with an injected fake `query` (no live spawn).

import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { logger } from "@orb/server/foundation/observability";
import type { AgentToolServer, AgentTurnRequest, ChatResult } from "@orb/server/infra/providers";
import type { consumeTurnStream } from "@orb/server/infra/providers/backends/agent-sdk";
import { createAgentSdkBackend } from "@orb/server/infra/providers/backends/agent-sdk";
import { describe, vi } from "vitest";
import { makeResolvedCredential } from "../../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../../support/fixtures";
import { streamOf as sharedStreamOf } from "./_support.ts";

const MODEL = "claude-agent-x";
const SESSION_ID = "agent-sess-1";
const SYSTEM_PROMPT = "you are a careful tool-using guide";
const AGENT_TITLE = "orbweaver-agent";
const ALLOWED_TOOLS = ["mcp__orbweaver__*"];
const COWORK_DENYLIST = ["DesignSync", "Monitor", "PushNotification", "RemoteTrigger"];
const DEFAULT_MAX_TURNS = 8;
const DEFAULT_MAX_OUTPUT = "2048";

/** A vLLM (keyless, loopback) credential — keeps the firewall env deterministic + host-free. */
const VLLM_CRED = makeResolvedCredential("vllm");
/** An opaque MCP tool server sentinel — the core treats it as `unknown`; we assert identity passthrough. */
const FAKE_MCP: AgentToolServer = { __sentinel: "mcp-server" };

type MessageStream = Parameters<typeof consumeTurnStream>[0];
type AgentTurn = (req: AgentTurnRequest) => Promise<ChatResult>;

/** The SDK options shape the runner builds — typed to the fields we assert (no SDK import). The dialog
 *  handlers + taskBudget are captured to prove the fail-closed wiring + the budget seam threads through. */
interface CapturedOptions {
  tools?: string[];
  disallowedTools?: string[];
  strictMcpConfig?: boolean;
  mcpServers?: Record<string, unknown>;
  allowedTools?: string[];
  maxTurns?: number;
  model?: string;
  systemPrompt?: string;
  title?: string;
  env?: Record<string, string | undefined>;
  abortController?: AbortController;
  taskBudget?: { total: number };
  onElicitation?: (request: { mode?: "form" | "url" }) => Promise<{ action: string; content?: Record<string, unknown> }>;
  onUserDialog?: (request: { dialogKind: string; payload: Record<string, unknown> }) => Promise<{ behavior: string }>;
}

/** Find the ONE logged line for `event` among a pino-spy's calls (its first arg is the fields object). */
function lineFor(spy: ReturnType<typeof vi.spyOn>, event: string): Record<string, unknown> | undefined {
  return spy.mock.calls.find((c: readonly unknown[]) => (c[0] as { event?: string }).event === event)?.[0] as Record<string, unknown> | undefined;
}

function streamOf(messages: readonly unknown[]): MessageStream {
  return sharedStreamOf(messages) as MessageStream;
}

const initMsg = { type: "system", subtype: "init", session_id: SESSION_ID, apiKeySource: "oauth" };
const assistantMsg = {
  type: "assistant",
  session_id: SESSION_ID,
  message: { content: [{ type: "text", text: "Hello" }], stop_reason: "end_turn" },
};
const successResult = {
  type: "result",
  subtype: "success",
  session_id: SESSION_ID,
  num_turns: 1,
  stop_reason: "end_turn",
  duration_api_ms: 100,
  ttft_ms: 20,
  is_error: false,
  modelUsage: {
    [MODEL]: {
      inputTokens: 10,
      outputTokens: 5,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      webSearchRequests: 0,
      costUSD: 0.001,
      contextWindow: 200_000,
      maxOutputTokens: 4096,
    },
  },
  usage: { cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 } },
};

function buildReq(extra: Partial<AgentTurnRequest> = {}): AgentTurnRequest {
  return {
    credential: VLLM_CRED,
    model: castId<ModelId>(MODEL),
    systemPrompt: SYSTEM_PROMPT,
    prompt: "use the tool",
    mcpServer: FAKE_MCP,
    ...extra,
  };
}

function harness(): { run: AgentTurn; lastOptions: () => CapturedOptions | undefined } {
  const fakeQuery = vi.fn((_args: { options?: CapturedOptions }) => streamOf([initMsg, assistantMsg, successResult]));
  const backend = createAgentSdkBackend({
    now: () => 0,
    query: fakeQuery as never,
    refreshHostSubToken: () => Promise.resolve(false),
  });
  const run = backend.runAgentTurn as AgentTurn;
  return {
    run,
    lastOptions: (): CapturedOptions | undefined => fakeQuery.mock.calls.at(-1)?.[0]?.options,
  };
}

describe("runAgentTurn — the firewall base survives into agent mode", () => {
  test("no built-in tools, the cowork denylist, and strict MCP all carry through", async () => {
    const { run, lastOptions } = harness();
    await run(buildReq());
    const opts = lastOptions();
    expect(opts?.tools).toStrictEqual([]);
    expect(opts?.disallowedTools).toStrictEqual(COWORK_DENYLIST);
    expect(opts?.strictMcpConfig).toBe(true);
  });

  test("the credential-scoped env is the vLLM firewall env (loopback, keyless)", async () => {
    const { run, lastOptions } = harness();
    await run(buildReq());
    expect(lastOptions()?.env?.["ANTHROPIC_AUTH_TOKEN"]).toBe("local-vllm");
  });
});

describe("runAgentTurn — the agent surface it ADDS (the only asymmetry)", () => {
  test("registers the caller's MCP server under the orbweaver namespace, by identity", async () => {
    const { run, lastOptions } = harness();
    await run(buildReq());
    expect(lastOptions()?.mcpServers?.["orbweaver"]).toBe(FAKE_MCP);
  });

  test("scopes allowedTools to the orbweaver MCP wildcard only", async () => {
    const { run, lastOptions } = harness();
    await run(buildReq());
    expect(lastOptions()?.allowedTools).toStrictEqual(ALLOWED_TOOLS);
  });

  test("model, systemPrompt, and the agent title pass through", async () => {
    const { run, lastOptions } = harness();
    await run(buildReq());
    const opts = lastOptions();
    expect(opts?.model).toBe(MODEL);
    expect(opts?.systemPrompt).toBe(SYSTEM_PROMPT);
    expect(opts?.title).toBe(AGENT_TITLE);
  });
});

describe("runAgentTurn — bounded defaults + overrides", () => {
  test("maxTurns defaults to 8 and maxOutputTokens defaults to 2048 (preset contract align) (short, bounded)", async () => {
    const { run, lastOptions } = harness();
    await run(buildReq());
    const opts = lastOptions();
    expect(opts?.maxTurns).toBe(DEFAULT_MAX_TURNS);
    expect(opts?.env?.["CLAUDE_CODE_MAX_OUTPUT_TOKENS"]).toBe(DEFAULT_MAX_OUTPUT);
  });

  test("an explicit maxTurns / maxOutputTokens override the defaults", async () => {
    const { run, lastOptions } = harness();
    await run(buildReq({ maxTurns: 3, maxOutputTokens: 256 }));
    const opts = lastOptions();
    expect(opts?.maxTurns).toBe(3);
    expect(opts?.env?.["CLAUDE_CODE_MAX_OUTPUT_TOKENS"]).toBe("256");
  });
});

describe("runAgentTurn — cancellation + reduction", () => {
  test("no signal → no abortController is wired", async () => {
    const { run, lastOptions } = harness();
    await run(buildReq());
    expect(lastOptions()?.abortController).toBeUndefined();
  });

  test("an already-aborted signal aborts the wired controller before the spawn", async () => {
    const controller = new AbortController();
    controller.abort();
    const { run, lastOptions } = harness();
    await run(buildReq({ signal: controller.signal }));
    expect(lastOptions()?.abortController?.signal.aborted).toBe(true);
  });

  test("the SDK stream reduces to a ChatResult", async () => {
    const { run } = harness();
    const result = await run(buildReq());
    expect(result.reply).toBe("Hello");
    expect(result.finishReason).toBe("stop");
  });
});

describe("runAgentTurn — non-interactive fail-close (elicitation + user-dialog)", () => {
  test("registers deterministic decline/cancel handlers on every turn", async () => {
    const { run, lastOptions } = harness();
    await run(buildReq());
    const opts = lastOptions();
    expect(typeof opts?.onElicitation).toBe("function");
    expect(typeof opts?.onUserDialog).toBe("function");
    // The backend NEVER declares supportedDialogKinds — so the SDK emits no user-dialog at all (fail-closed
    // by absence); the handler is belt-and-suspenders. There is no supportedDialogKinds option captured.
    expect(opts).not.toHaveProperty("supportedDialogKinds");
  });

  test("onElicitation DECLINES and emits ONE provider.dialog warn (kind only, no message)", async () => {
    const warn = vi.spyOn(logger, "warn");
    const { run, lastOptions } = harness();
    await run(buildReq());
    const result = await lastOptions()?.onElicitation?.({ mode: "url" });
    expect(result).toEqual({ action: "decline" });
    const line = lineFor(warn, "provider.dialog");
    expect(line).toMatchObject({
      provider: true,
      backend: "agent-sdk",
      source: "elicitation",
      kind: "url",
    });
    // The elicitation message/schema NEVER rides the line (RP/tool content stays off logs).
    expect(line).not.toHaveProperty("message");
  });

  test("onUserDialog CANCELS and emits provider.dialog with the dialogKind classifier", async () => {
    const warn = vi.spyOn(logger, "warn");
    const { run, lastOptions } = harness();
    await run(buildReq());
    const result = await lastOptions()?.onUserDialog?.({
      dialogKind: "refusal_fallback_prompt",
      payload: { secret: "never-logged" },
    });
    expect(result).toEqual({ behavior: "cancelled" });
    const line = lineFor(warn, "provider.dialog");
    expect(line).toMatchObject({ source: "user-dialog", kind: "refusal_fallback_prompt" });
    // The dialog payload (possibly content) NEVER rides the line.
    expect(JSON.stringify(line)).not.toContain("never-logged");
  });
});

describe("runAgentTurn — the taskBudget seam", () => {
  test("threads taskBudget into options as { total } when the caller sets it", async () => {
    const { run, lastOptions } = harness();
    await run(buildReq({ taskBudget: 50_000 }));
    expect(lastOptions()?.taskBudget).toEqual({ total: 50_000 });
  });

  test("no taskBudget option when the request omits it", async () => {
    const { run, lastOptions } = harness();
    await run(buildReq());
    expect(lastOptions()).not.toHaveProperty("taskBudget");
  });
});

describe("runAgentTurn — external MCP servers (sealed optional seam; caller owns egress/authz)", () => {
  test("no external servers → only the in-process orbweaver server is registered", async () => {
    const { run, lastOptions } = harness();
    await run(buildReq());
    expect(Object.keys(lastOptions()?.mcpServers ?? {})).toStrictEqual(["orbweaver"]);
  });

  test("stdio/sse/http specs map faithfully alongside the in-process server", async () => {
    const { run, lastOptions } = harness();
    await run(
      buildReq({
        externalMcpServers: {
          local: { transport: "stdio", command: "node", args: ["srv.js"], env: { K: "v" } },
          remote: {
            transport: "sse",
            url: "https://sse.example",
            headers: { Authorization: "Bearer t" },
          },
          api: { transport: "http", url: "https://http.example" },
        },
      }),
    );
    const servers = lastOptions()?.mcpServers as Record<string, Record<string, unknown>>;
    expect(servers["orbweaver"]).toBe(FAKE_MCP);
    expect(servers["local"]).toEqual({
      type: "stdio",
      command: "node",
      args: ["srv.js"],
      env: { K: "v" },
    });
    expect(servers["remote"]).toEqual({
      type: "sse",
      url: "https://sse.example",
      headers: { Authorization: "Bearer t" },
    });
    // http with no headers → headers omitted (no undefined slot leaks into the SDK config).
    expect(servers["api"]).toEqual({ type: "http", url: "https://http.example" });
  });
});

describe("runAgentTurn — structured output (responseFormat → outputFormat)", () => {
  const SCHEMA = { type: "object", properties: { verdict: { type: "string" } } };

  test("maps responseFormat.schema to the SDK outputFormat json_schema (schema only)", async () => {
    const { run, lastOptions } = harness();
    await run(
      buildReq({
        responseFormat: { name: "verdict", schema: SCHEMA, strict: true, description: "d" },
        supportsStructuredOutput: true,
      }),
    );
    const opts = lastOptions() as CapturedOptions & { outputFormat?: Record<string, unknown> };
    expect(opts.outputFormat).toEqual({ type: "json_schema", schema: SCHEMA });
    // name/strict/description are caller-side validator metadata — no SDK slot, dropped.
    expect(opts.outputFormat).not.toHaveProperty("name");
  });

  test("no outputFormat option when responseFormat is absent", async () => {
    const { run, lastOptions } = harness();
    await run(buildReq());
    expect(lastOptions()).not.toHaveProperty("outputFormat");
  });

  test("FAILS CLOSED with a typed invalid ProviderError when the model can't do structured output", async () => {
    const { run } = harness();
    await expect(
      run(
        buildReq({
          responseFormat: { name: "v", schema: SCHEMA },
          supportsStructuredOutput: false,
        }),
      ),
    ).rejects.toMatchObject({ kind: "invalid", retryable: false });
  });

  test("also fails closed when supportsStructuredOutput is omitted (must be explicitly true)", async () => {
    const { run } = harness();
    await expect(run(buildReq({ responseFormat: { name: "v", schema: SCHEMA } }))).rejects.toMatchObject({ kind: "invalid" });
  });
});

/** A Query-like stream: the async generator PLUS the control methods the runner probes (mcpServerStatus).
 *  A bare `streamOf` lacks them, so the health probe self-guards and skips — this harness exercises the
 *  probe path with a realistic d.ts-shaped fake. */
function harnessWithMcpStatus(statuses: readonly unknown[]): {
  run: AgentTurn;
} {
  const fakeQuery = vi.fn(() => {
    const gen = streamOf([initMsg, assistantMsg, successResult]) as MessageStream & {
      mcpServerStatus?: () => Promise<readonly unknown[]>;
    };
    gen.mcpServerStatus = (): Promise<readonly unknown[]> => Promise.resolve(statuses);
    return gen;
  });
  const backend = createAgentSdkBackend({
    now: () => 0,
    query: fakeQuery as never,
    refreshHostSubToken: () => Promise.resolve(false),
  });
  return { run: backend.runAgentTurn as AgentTurn };
}

describe("runAgentTurn — MCP health surfacing (best-effort probe)", () => {
  test("no mcpServerHealth on the result when the stream has no control channel (test/agent stream)", async () => {
    const { run } = harness();
    const result = await run(buildReq());
    expect(result).not.toHaveProperty("mcpServerHealth");
  });

  test("a connected in-process server → mcpServerHealth on the result + provider.mcp debug", async () => {
    const debug = vi.spyOn(logger, "debug");
    const { run } = harnessWithMcpStatus([{ name: "orbweaver", status: "connected" }]);
    const result = await run(buildReq());
    expect(result.mcpServerHealth).toEqual([{ name: "orbweaver", status: "connected" }]);
    expect(lineFor(debug, "provider.mcp")).toMatchObject({ unhealthy: false });
  });

  test("a failed server → mcpServerHealth carries name+status+error and provider.mcp WARNS", async () => {
    const warn = vi.spyOn(logger, "warn");
    const { run } = harnessWithMcpStatus([{ name: "remote", status: "failed", error: "connect ECONNREFUSED" }]);
    const result = await run(buildReq());
    expect(result.mcpServerHealth).toEqual([{ name: "remote", status: "failed", error: "connect ECONNREFUSED" }]);
    expect(lineFor(warn, "provider.mcp")).toMatchObject({ unhealthy: true });
  });
});
