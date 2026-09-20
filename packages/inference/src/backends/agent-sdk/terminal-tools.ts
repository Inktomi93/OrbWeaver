// The agent-sdk wire's TERMINAL-TOOL channel (D112 R1 — the folded state extraction): DECLARE + CAPTURE,
// never EXECUTE. The declaration rides the ONE channel the SDK reads — an in-process MCP server — under its
// OWN namespace, and the call is stopped dead at the permission seam (a `PreToolUse` hook returning
// `continue:false` + a hook-sourced DENY: the loop returns `hook_stopped`, no tool_result is fed back, no second
// completion is billed, the result frame is still `success`). The CAPTURE reads the assistant frame's own
// `tool_use` blocks BEFORE any permission decision — the complete, ordered set.

import type { HookInput, HookJSONOutput, McpSdkServerConfigWithInstance, Options } from "@anthropic-ai/claude-agent-sdk";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { JsonSchemaLiftError, liftJsonSchema } from "@orb/kit/json-schema";
import type { ZodRawShape } from "zod";
import type { ToolCallInput, WireTool } from "../../contract/chat.ts";
import type { AgentSdkLog } from "./log.ts";
import { TERMINAL_MCP_NAMESPACE } from "./translate.ts";

const TERMINAL_TOOL_PREFIX = `mcp__${TERMINAL_MCP_NAMESPACE}__`;
const TERMINAL_DENY_REASON = "orbweaver recorded this state call off the completion; the turn ends here (no tool round is run).";
const TERMINAL_ACK = { content: [{ type: "text" as const, text: "recorded" }] };

function terminalToolName(sdkName: string): string | null {
  return sdkName.startsWith(TERMINAL_TOOL_PREFIX) ? sdkName.slice(TERMINAL_TOOL_PREFIX.length) : null;
}

/** Is this model-emitted call one of ours? (The capture filter + the permission-denial tripwire's exemption.) */
export function isTerminalToolCall(sdkName: string): boolean {
  return terminalToolName(sdkName) !== null;
}

interface UnliftableTool {
  readonly tool: string;
  readonly construct: string;
  readonly path: string;
}

/** Lift every wire declaration into its zod raw shape, or name the first tool that would not lift.
 *  All-or-nothing: a half-mounted state surface silently loses a plane the model can no longer write. */
function liftShapes(
  tools: readonly WireTool[],
): { readonly lifted: { readonly wire: WireTool; readonly shape: ZodRawShape }[] } | { readonly unliftable: UnliftableTool } {
  const lifted: { wire: WireTool; shape: ZodRawShape }[] = [];
  for (const wire of tools) {
    try {
      lifted.push({ wire, shape: liftJsonSchema(wire.parameters).shape });
    } catch (err) {
      const lift = err instanceof JsonSchemaLiftError ? { construct: err.construct, path: err.path } : { construct: String(err), path: "#" };
      return { unliftable: { tool: wire.name, ...lift } };
    }
  }
  return { lifted };
}

/** The PreToolUse deny-and-stop hook. Anything that is not a terminal call passes through untouched. */
function terminalStopHook(input: HookInput): Promise<HookJSONOutput> {
  if (input.hook_event_name !== "PreToolUse" || !isTerminalToolCall(input.tool_name)) {
    return Promise.resolve({});
  }
  return Promise.resolve({
    continue: false,
    stopReason: TERMINAL_DENY_REASON,
    reason: TERMINAL_DENY_REASON,
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: TERMINAL_DENY_REASON },
  });
}

/** The SDK options the terminal channel contributes: its own MCP mount + the stop hook. `null` ⇒ do not mount
 *  (nothing requested, or a schema would not lift). Deliberately NOT added to `allowedTools`. */
export function terminalToolOptions(tools: readonly WireTool[], turnId: string, log: AgentSdkLog): Pick<Options, "mcpServers" | "hooks"> | null {
  if (tools.length === 0) {
    return null;
  }
  const toolNames = tools.map((t) => t.name);
  const shapes = liftShapes(tools);
  if ("unliftable" in shapes) {
    log.terminalTools({ turnId, mounted: false, toolNames, unliftable: shapes.unliftable });
    return null;
  }
  log.terminalTools({ turnId, mounted: true, toolNames });
  const server: McpSdkServerConfigWithInstance = createSdkMcpServer({
    name: TERMINAL_MCP_NAMESPACE,
    tools: shapes.lifted.map(({ wire, shape }) => tool(wire.name, wire.description, shape, (_args: Record<string, unknown>) => Promise.resolve(TERMINAL_ACK))),
  });
  return { mcpServers: { [TERMINAL_MCP_NAMESPACE]: server }, hooks: { PreToolUse: [{ hooks: [terminalStopHook] }] } };
}

/** One assistant `tool_use` block → the cross-backend {@link ToolCallInput}. */
export function toTerminalCall(block: { readonly id: string; readonly name: string; readonly input: unknown }): ToolCallInput | null {
  const name = terminalToolName(block.name);
  if (name === null) {
    return null;
  }
  return { toolCallId: block.id, name, arguments: JSON.stringify(block.input ?? {}) };
}
