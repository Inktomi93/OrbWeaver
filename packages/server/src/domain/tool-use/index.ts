// biome-ignore-all lint/performance/noBarrelFile: this IS the domain front door (one-home-per-concept).
//
// domain/tool-use — FRONT DOOR. The one tool registry: every entry a name + description + zod argsSchema
// + can() ceiling + handler closing over its owning domain's service, registered once at entry/compose,
// read per turn via resolveTools, and projected onto the OpenAI wire. Every invocation funnels through the
// same executeToolCalls, producing the same ToolCallRecord[] that chat persistence stores on the variant.

export type { ToolUseContext } from "./context.ts";
export { ToolNameCollisionError, ToolNotFoundError } from "./contract/errors.ts";
export type {
  CreateAgentToolServer,
  PluginToolSpec,
  ToolCallInput,
  ToolCapability,
  ToolDefinition,
  ToolExecutionContext,
  ToolHandler,
  ToolHandlerResult,
  ToolSource,
} from "./contract/params.ts";
export { TOOL_NAME_RE, TOOL_SOURCES } from "./contract/params.ts";
export type { PluginToolHandle, ResolvedToolSet, ToolCallRecord } from "./contract/results.ts";
export type { ToolUseService } from "./contract/service.ts";
export { createToolUseService } from "./service.ts";
