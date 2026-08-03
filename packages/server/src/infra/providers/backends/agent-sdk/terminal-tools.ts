// The agent-sdk wire's TERMINAL-TOOL channel (D112 R1 — the folded state extraction): DECLARE + CAPTURE,
// never EXECUTE. The chat pipeline hands the same `WireTool[]` the array wires put in `tools[]`; the SDK owns
// its wire body and reads no tools array, so the declaration rides the ONE channel it does read — an
// in-process MCP server — under its OWN namespace, and the call is stopped dead at the permission seam.
//
// THE THREE HALVES (each is load-bearing; drop one and the fold either dies or costs the call it exists to
// delete). Every claim below is read off the bundled runtime (`claude` 0.3.216), not the docs:
//   1. DECLARE — `createSdkMcpServer` + `tool()`, whose `inputSchema` is a zod raw shape. The projected
//      per-game JSON Schema is lifted back to zod through the ONE inverse projection (`liftJsonSchema`,
//      @orb/kit) so the ref/condition enums the game constrained the tools with actually reach the model;
//      the MCP `tools/list` answer round-trips them (verified: enums + required survive).
//   2. STOP — a `PreToolUse` hook returning `{continue:false, stopReason, hookSpecificOutput:{permissionDecision:
//      "deny"}}`. The runtime's hook-output normalizer maps `continue:false` → `preventContinuation` and the
//      deny → a HOOK-sourced permission denial; the tool loop then emits its `hook_stopped_continuation`
//      attachment and the query loop RETURNS `{reason:"hook_stopped"}` — the tool never runs, no tool_result
//      is fed back, and no second completion is billed. The result frame is still `subtype:"success"` (only
//      `aborted_*` terminal reasons become an error result), so the narrative turn lands normally.
//      NOT the `permissionDecision:"defer"` arm: the runtime ignores defer whenever the assistant message
//      carries more than one tool_use ("defer is solo-only"), and a folded beat routinely calls two or three.
//   3. CAPTURE — the assistant message's own `tool_use` blocks, read off the stream BEFORE any permission
//      decision. That is the complete, ordered set even though the hook only ever fires for the first call
//      (it ends the turn), and it is the same `{toolCallId,name,arguments}` shape the openrouter runner
//      reduces, so the fold sees ONE contract.
//
// The handler below is therefore unreachable on the happy path and exists only because `tool()` requires one:
// it records nothing and returns a trivial ack, so even a runtime that executed it would touch no domain
// logic (capture-only — the Principal story of `chat-tools-execute-as-host` simply does not arise here).

import type { HookInput, HookJSONOutput, McpSdkServerConfigWithInstance, Options } from "@anthropic-ai/claude-agent-sdk";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { JsonSchemaLiftError, liftJsonSchema } from "@orb/kit/json-schema";
import type { ZodRawShape } from "zod";
import type { ToolCallInput, WireTool } from "../../contract/index.ts";
import { logProviderTerminalTools } from "./log.ts";
import { TERMINAL_MCP_NAMESPACE } from "./translate.ts";

/** The model-visible prefix the SDK gives every tool of the terminal mount (`mcp__<ns>__<tool>`). */
const TERMINAL_TOOL_PREFIX = `mcp__${TERMINAL_MCP_NAMESPACE}__`;

/** What the denial tells the model (it is fed to nothing — the turn ends — but the runtime requires a reason,
 *  and a legible one keeps the CLI trail honest about WHY the call did not run). */
const TERMINAL_DENY_REASON = "orbweaver recorded this state call off the completion; the turn ends here (no tool round is run).";

/** The ack a terminal tool's handler would return if it ever ran. Capture-only: no domain logic, no state. */
const TERMINAL_ACK = { content: [{ type: "text" as const, text: "recorded" }] };

/** Strip the SDK's MCP prefix off a model-emitted tool name, or `null` when the call is not ours (a registry
 *  tool from the OTHER mount, or a built-in that leaked past the firewall — neither is terminal state). */
function terminalToolName(sdkName: string): string | null {
  return sdkName.startsWith(TERMINAL_TOOL_PREFIX) ? sdkName.slice(TERMINAL_TOOL_PREFIX.length) : null;
}

/** Is this model-emitted call one of ours? (The capture filter + the permission-denial tripwire's exemption.) */
export function isTerminalToolCall(sdkName: string): boolean {
  return terminalToolName(sdkName) !== null;
}

/** Why a mount was refused: the FIRST tool whose schema is outside the liftable subset, named for the log. */
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

/** The PreToolUse deny-and-stop hook (half 2). Fires for EVERY tool call on the turn; anything that is not a
 *  terminal call passes through untouched (`{}` — the registry mount keeps its own loop). */
function terminalStopHook(input: HookInput): Promise<HookJSONOutput> {
  if (input.hook_event_name !== "PreToolUse" || !isTerminalToolCall(input.tool_name)) {
    return Promise.resolve({});
  }
  return Promise.resolve({
    // `continue:false` + a hook-sourced DENY is the pair the runtime turns into `hook_stopped_continuation`:
    // either alone leaves the loop running (a deny alone just feeds an error tool_result back = a 2nd call).
    continue: false,
    stopReason: TERMINAL_DENY_REASON,
    reason: TERMINAL_DENY_REASON,
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: TERMINAL_DENY_REASON,
    },
  });
}

/** The SDK options the terminal channel contributes: its own MCP mount + the stop hook. `null` ⇒ do not mount
 *  (nothing requested, or a schema would not lift) — the turn is then byte-identical to a tool-less one.
 *
 *  Deliberately NOT added to `allowedTools`: an allow-listed tool resolves to `behavior:"allow"` before the
 *  hook's denial can end the turn, and it would execute + earn the second call the fold exists to delete. */
export function terminalToolOptions(tools: readonly WireTool[], turnId: string): Pick<Options, "mcpServers" | "hooks"> | null {
  if (tools.length === 0) {
    return null;
  }
  const toolNames = tools.map((t) => t.name);
  const shapes = liftShapes(tools);
  if ("unliftable" in shapes) {
    logProviderTerminalTools({ turnId, mounted: false, toolNames, unliftable: shapes.unliftable });
    return null;
  }
  logProviderTerminalTools({ turnId, mounted: true, toolNames });
  const server: McpSdkServerConfigWithInstance = createSdkMcpServer({
    name: TERMINAL_MCP_NAMESPACE,
    // The handler is annotated (not inferred) for the same reason `createAgentToolServer` annotates its own:
    // an inferred-`never` args shape is not assignable to the SDK's tool-definition type.
    tools: shapes.lifted.map(({ wire, shape }) => tool(wire.name, wire.description, shape, (_args: Record<string, unknown>) => Promise.resolve(TERMINAL_ACK))),
  });
  return {
    mcpServers: { [TERMINAL_MCP_NAMESPACE]: server },
    hooks: { PreToolUse: [{ hooks: [terminalStopHook] }] },
  };
}

/** One assistant `tool_use` block → the cross-backend {@link ToolCallInput} (half 3). `arguments` is the raw
 *  JSON string every other backend reports, so the fold parses ONE shape regardless of wire. */
export function toTerminalCall(block: { readonly id: string; readonly name: string; readonly input: unknown }): ToolCallInput | null {
  const name = terminalToolName(block.name);
  if (name === null) {
    return null;
  }
  return { toolCallId: block.id, name, arguments: JSON.stringify(block.input ?? {}) };
}
