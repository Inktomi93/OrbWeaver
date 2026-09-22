//
// domain/tool-use — FRONT DOOR. The one tool registry: every entry a name + description + zod argsSchema
// + can() ceiling + handler closing over its owning domain's service, registered once at entry/compose,
// read per turn via resolveTools, and projected ONCE into backend-neutral definitions `@orb/inference` places.
// Every invocation funnels through the same executeToolCalls, producing the same ToolCallRecord[] that chat
// persistence stores on the variant.

export type { ToolUseContext } from "./context.ts";
export { ToolNameCollisionError, ToolNotFoundError } from "./contract/errors.ts";
export type {
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
// The S2 teaching contribution (D145's 11th root slot): the per-turn attach of the turn HOST's own plugin
// tools. Exported HERE and only here — the `domain-teaching-contribution-compose-only` cruiser stanza makes
// this front door the sole legal importer, so the contribution reaches a turn through the injected registry
// at `entry/compose` and never through an inline call from a verb.
export { createToolUseTeachingContributions } from "./teaching-contribution.ts";
