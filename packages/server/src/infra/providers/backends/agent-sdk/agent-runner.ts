// infra/providers/backends/agent-sdk/agent-runner — AGENT MODE (tools + a multi-turn loop). Sibling to
// the roleplay `runChatTurn`: the SAME firewall base (`disciplineOptions`) + the SAME stream→result
// reducer (`consumeTurnStream`); it only ADDS the caller's in-process MCP server, auto-approves that
// server's tools, and lifts `maxTurns` so the model can run a tool loop. The roleplay turn keeps
// `mcpServers:{}` + `maxTurns:1`; THAT asymmetry is the firewall — agent mode opts INTO tools explicitly.
//
// SDK-DECOUPLED: `req.mcpServer` is the opaque {@link AgentToolServer} (`unknown` at the contract). It is
// narrowed to the SDK's `McpSdkServerConfigWithInstance` ONLY here, at the boundary (D8). Domains obtain
// one via `createAgentToolServer` (the family barrel) without importing the SDK.

import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import type { AgentTurnRequest, ChatResult } from "../../contract";
import { consumeTurnStream } from "./runner";
import { disciplineOptions, observabilityOptions } from "./translate";
import type { AgentSdkDeps } from "./types";

/** The MCP namespace the agent server registers under; tool ids are `mcp__<ns>__<tool>`. */
const MCP_NAMESPACE = "orbweaver";
/** Defaults for an agent turn (short, bounded) when the request omits them. */
const DEFAULT_AGENT_MAX_TURNS = 8;
const DEFAULT_AGENT_MAX_OUTPUT_TOKENS = 4096;
const SDK_TITLE_AGENT = "orbweaver-agent";

/**
 * Run ONE agent-with-tools turn. `maxContextTokens` (when set) caps the TOTAL working set so the SDK
 * compacts/truncates the growing tool loop BELOW the engine window — load-bearing on vLLM, where a
 * `/v1/messages` overflow is a retryable 500 the runner's fail-fast can't catch, so this cap is what
 * prevents the overflow. The caller sets it under the vLLM window on that path; the Claude backends
 * (huge windows + working SDK compaction) leave it unset. Agent turns are stateless (no resume) — a tool
 * loop is self-contained.
 */
export async function runAgentTurn(req: AgentTurnRequest, deps: AgentSdkDeps): Promise<ChatResult> {
  const overrides = {
    maxOutputTokens: req.maxOutputTokens ?? DEFAULT_AGENT_MAX_OUTPUT_TOKENS,
    ...(req.maxContextTokens !== undefined ? { maxContextTokens: req.maxContextTokens } : {}),
  };
  const abortController = new AbortController();
  if (req.signal !== undefined) {
    if (req.signal.aborted) {
      abortController.abort();
    } else {
      req.signal.addEventListener("abort", () => abortController.abort(), { once: true });
    }
  }
  const stream = deps.query({
    prompt: req.prompt,
    options: {
      // Start from the roleplay firewall base (tools:[] — no built-in Bash/Read/Edit; cowork denied;
      // strict MCP; credential-scoped env), then ADD the agent surface.
      ...disciplineOptions(req.credential, overrides),
      ...observabilityOptions(),
      // The two fields the roleplay turn NEVER sets — this is the wall:
      mcpServers: { [MCP_NAMESPACE]: req.mcpServer as McpSdkServerConfigWithInstance },
      allowedTools: [`mcp__${MCP_NAMESPACE}__*`],
      maxTurns: req.maxTurns ?? DEFAULT_AGENT_MAX_TURNS,
      model: req.model,
      systemPrompt: req.systemPrompt,
      title: SDK_TITLE_AGENT,
      ...(req.signal !== undefined ? { abortController } : {}),
    },
  });
  return await consumeTurnStream(stream, { model: req.model, resumed: false, now: deps.now });
}
