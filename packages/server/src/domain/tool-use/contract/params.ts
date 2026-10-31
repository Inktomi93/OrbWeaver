// The registry entry contract. A `ToolDefinition` is a contracts `ToolDescriptor` plus its handler, registered once
// at `entry/compose` (collision = boot-fatal) and closed over its owning domain's service — tool-use never
// imports a registrant. `ToolDefinition` stays domain-internal (no client surface enumerates tools).

import type { InvocationChat } from "@orb/contracts/plugin";
import type { PluginToolSpecData, ToolDescriptor, ToolExecutionData, ToolHandlerResult } from "@orb/contracts/tool-use";
import type { ToolCallInput } from "@orb/inference";

/** What a handler receives beside its parsed args: the contracts data plus the turn's cancellation, which honoring is
 *  the handler's job. */
export interface ToolExecutionContext extends ToolExecutionData {
  readonly signal?: AbortSignal | undefined;
}

/** A RUNTIME plugin-tool registration: the contracts data plus `invoke`, which runs the guest handler under its
 *  invocation budget (the infra port's `invoke`, curried over the resident instance + the guest handler ref).
 *  `chat` is the resident handler's invocation-chat scope (`null` off-chat). */
export interface PluginToolSpec extends PluginToolSpecData {
  readonly invoke: (argsJson: string, chat: InvocationChat | null, signal?: AbortSignal) => Promise<string>;
}

/** A tool's handler. Args are already zod-parsed; a raw string never reaches a handler. */
export type ToolHandler<A> = (args: A, exec: ToolExecutionContext) => Promise<ToolHandlerResult>;

/** OpenAI function-name charset ∩ MCP tool-name charset — one name must survive both projections. */
export const TOOL_NAME_RE = /^[a-z][a-z0-9_]{0,63}$/u;

export interface ToolDefinition<A = unknown> extends ToolDescriptor<A> {
  readonly handler: ToolHandler<A>;
}

/** The batch the loop hands execute (assembled by the stream reducer — the infra shape, one home). */
export type ToolCallBatch = readonly ToolCallInput[];
