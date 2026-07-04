// biome-ignore-all lint/performance/noBarrelFile: this IS the domain front door (one-home-per-concept).
//
// domain/tool-use — FRONT DOOR. The ONE tool registry (D48): every entry a name + description + zod
// argsSchema + can() ceiling + handler closing over its owning domain's service, registered once at
// `entry/compose` (collision = boot-fatal), read per turn via `resolveTools`, and projected onto the
// OpenAI wire (`toWireTools`; the D47 MCP projection lands at T5 with buddy). Both projections funnel
// every invocation through the SAME `executeToolCalls` — parse-with-zod, can() gate, sequential run,
// errors-as-data — and produce the SAME `ToolCallRecord[]` that chat persistence stores on the variant.
// The recurse loop is CHAT's (T4); this domain never loops and owns no tables.

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
