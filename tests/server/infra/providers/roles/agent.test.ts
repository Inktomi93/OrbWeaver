// createAgentRole — the `agent` role dispatcher. Agent mode is ALWAYS the agent-sdk backend (the key is
// fixed, not derived from source), but the firewall still gates the source (sub/skin/vllm, never BYO)
// and the D17 owner-consent belt. This mirror asserts: every eligible source lands on agent-sdk's
// runAgentTurn (NOT on an openrouter/vllm backend), and every fail-closed path of THIS dispatcher.

import type {
  AgentTurnRequest,
  ChatResult,
  ProviderBackend,
  ResolvedCredential,
} from "@orb/server/infra/providers";
import { createAgentRole, ProviderError } from "@orb/server/infra/providers";
import { describe, expect, test } from "vitest";

function cred(source: ResolvedCredential["source"]): ResolvedCredential {
  return { source, credentialId: null } as unknown as ResolvedCredential;
}

const CHAT_RESULT = { reply: "ok" } as unknown as ChatResult;

/** A backend whose `runAgentTurn` records `${key}:agent` so the routed selection is observable. */
function spy(key: ProviderBackend["key"], calls: string[]): ProviderBackend {
  return {
    key,
    runAgentTurn: (): Promise<ChatResult> => {
      calls.push(`${key}:agent`);
      return Promise.resolve(CHAT_RESULT);
    },
  };
}

/** Both the agent-sdk backend AND an openrouter backend are wired, so a wrong route would be caught:
 *  a correct dispatch hits agent-sdk REGARDLESS of source. */
function allBackends(calls: string[]): Map<ProviderBackend["key"], ProviderBackend> {
  return new Map([
    ["agent-sdk", spy("agent-sdk", calls)],
    ["openrouter", spy("openrouter", calls)],
    ["vllm", spy("vllm", calls)],
  ]);
}

function agentReq(over: Partial<AgentTurnRequest>): AgentTurnRequest {
  return {
    credential: cred("vllm"),
    model: "m",
    systemPrompt: "",
    prompt: "hi",
    mcpServer: {},
    ...over,
  } as AgentTurnRequest;
}

describe("createAgentRole — the agent-sdk-eligible sources all land on the agent-sdk backend", () => {
  test("the OR skin and local vllm route to agent-sdk (the fixed key), not their own backend", async () => {
    const skin: string[] = [];
    const loopback: string[] = [];
    await Promise.all([
      createAgentRole({ backends: allBackends(skin) })(
        agentReq({ credential: cred("openrouter") }),
      ),
      createAgentRole({ backends: allBackends(loopback) })(agentReq({ credential: cred("vllm") })),
    ]);
    expect(skin).toEqual(["agent-sdk:agent"]);
    expect(loopback).toEqual(["agent-sdk:agent"]);
  });

  test("max-pro-sub WITH owner consent routes to agent-sdk", async () => {
    const calls: string[] = [];
    const role = createAgentRole({ backends: allBackends(calls) });
    await role(agentReq({ credential: cred("max-pro-sub"), ownerConsented: true }));
    expect(calls).toEqual(["agent-sdk:agent"]);
  });
});

describe("createAgentRole — fail-closed (firewall + sealed dispatch)", () => {
  test("a custom_openai (BYO) credential is denied for agent mode, before any backend runs", async () => {
    const calls: string[] = [];
    const role = createAgentRole({ backends: allBackends(calls) });
    await expect(role(agentReq({ credential: cred("custom_openai") }))).rejects.toBeInstanceOf(
      ProviderError,
    );
    expect(calls).toEqual([]);
  });

  test("local-light (chat-less tier) is denied for agent mode", async () => {
    const calls: string[] = [];
    const role = createAgentRole({ backends: allBackends(calls) });
    await expect(role(agentReq({ credential: cred("local-light") }))).rejects.toBeInstanceOf(
      ProviderError,
    );
    expect(calls).toEqual([]);
  });

  test("max-pro-sub WITHOUT owner consent is refused (D17 belt; default OFF)", async () => {
    const calls: string[] = [];
    const role = createAgentRole({ backends: allBackends(calls) });
    await expect(role(agentReq({ credential: cred("max-pro-sub") }))).rejects.toBeInstanceOf(
      ProviderError,
    );
    expect(calls).toEqual([]);
  });

  test("an UNWIRED agent-sdk backend fail-closes (a missing composition-root wire)", async () => {
    const role = createAgentRole({ backends: new Map() });
    await expect(role(agentReq({ credential: cred("vllm") }))).rejects.toBeInstanceOf(
      ProviderError,
    );
  });

  test("an agent-sdk backend that doesn't implement runAgentTurn fail-closes", async () => {
    const role = createAgentRole({ backends: new Map([["agent-sdk", { key: "agent-sdk" }]]) });
    await expect(role(agentReq({ credential: cred("vllm") }))).rejects.toBeInstanceOf(
      ProviderError,
    );
  });
});
