// biome-ignore-all lint/performance/noBarrelFile: this IS the domain front door (one-home-per-concept).
//
// domain/tool-use — FRONT DOOR. The one tool registry: every entry a name + description + zod argsSchema
// + can() ceiling + handler closing over its owning domain's service, registered once at entry/compose,
// read per turn via resolveTools, and projected onto the OpenAI wire. Every invocation funnels through the
// same executeToolCalls, producing the same ToolCallRecord[] that chat persistence stores on the variant.

export { ToolNameCollisionError, ToolNotFoundError } from "./contract/errors";
export type {
  ToolCallInput,
  ToolCapability,
  ToolDefinition,
  ToolExecutionContext,
  ToolHandler,
  ToolHandlerResult,
  ToolSource,
} from "./contract/params";
export { TOOL_NAME_RE, TOOL_SOURCES } from "./contract/params";
export type { ResolvedToolSet, ToolCallRecord } from "./contract/results";
export type { ToolUseContext, ToolUseService } from "./contract/service";
export { createToolUseService } from "./service";
export { projectArgSchema } from "./substrate/json-schema";
