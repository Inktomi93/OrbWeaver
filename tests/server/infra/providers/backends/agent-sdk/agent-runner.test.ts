// biome-ignore-all lint/style/useNamingConvention: synthetic SDK message fixtures use snake_case wire
// fields (session_id, stop_reason, num_turns, modelUsage, cache_creation, …).
//
// runAgentTurn — AGENT MODE: a turn that STARTS from the same firewall base as the roleplay turn
// (disciplineOptions: tools:[] + cowork denylist + strict MCP + credential-scoped env) and ADDS exactly
// two things — the caller's in-process MCP server + a lifted maxTurns. That asymmetry IS the firewall, so
// we assert: the firewall base survives, the MCP server registers under `orbweaver` and tools are scoped
// to `mcp__orbweaver__*`, the turn/output ceilings default + honor overrides, and the stream reduces.
// Driven via createAgentSdkBackend().runAgentTurn with an injected fake `query` (no live spawn).

import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AgentToolServer, AgentTurnRequest, ChatResult } from "@orb/server/infra/providers";
import type { consumeTurnStream } from "@orb/server/infra/providers/backends/agent-sdk";
import { createAgentSdkBackend } from "@orb/server/infra/providers/backends/agent-sdk";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../../support/fixtures";

const MODEL = "claude-agent-x";
const SESSION_ID = "agent-sess-1";
const SYSTEM_PROMPT = "you are a careful tool-using guide";
const AGENT_TITLE = "orbweaver-agent";
const ALLOWED_TOOLS = ["mcp__orbweaver__*"];
const COWORK_DENYLIST = ["DesignSync", "Monitor", "PushNotification", "RemoteTrigger"];
const DEFAULT_MAX_TURNS = 8;
const DEFAULT_MAX_OUTPUT = "4096";

/** A vLLM (keyless, loopback) credential — keeps the firewall env deterministic + host-free. */
const VLLM_CRED = { source: "vllm", credentialId: null } as unknown as ResolvedCredential;
/** An opaque MCP tool server sentinel — the core treats it as `unknown`; we assert identity passthrough. */
const FAKE_MCP: AgentToolServer = { __sentinel: "mcp-server" };

type MessageStream = Parameters<typeof consumeTurnStream>[0];
type AgentTurn = (req: AgentTurnRequest) => Promise<ChatResult>;

/** The SDK options shape the runner builds — typed to the fields we assert (no SDK import). */
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
}

function streamOf(messages: readonly unknown[]): MessageStream {
  async function* gen(): AsyncGenerator<never> {
    await Promise.resolve();
    for (const message of messages) {
      yield message as never;
    }
  }
  return gen() as MessageStream;
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
  const fakeQuery = vi.fn((_args: { options?: CapturedOptions }) =>
    streamOf([initMsg, assistantMsg, successResult]),
  );
  const backend = createAgentSdkBackend({ now: () => 0, query: fakeQuery as never });
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
  test("maxTurns defaults to 8 and maxOutputTokens defaults to 4096 (short, bounded)", async () => {
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
