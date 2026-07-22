// domain/tool-use — COMPOSITION ROOT: wires the verbs over the ONE process-lifetime registry Map
// (zero logic). Built once at `entry/compose`; registrants populate it there via `register` (the
// owning-domain closure idiom — tool-use imports NO registrant, ever). `toAgentToolServer` (T5) is the
// SECOND projection: it wraps the resolved set over the SAME executeToolCalls, so both projections share
// one execute path (its dependency, the D47 agent-sdk factory, is injected by the caller, never imported).

import type { ToolUseContext } from "./context";
import type { ToolRegistry } from "./contract/results";
import type { ToolUseService } from "./contract/service";
import { createExecuteToolCalls } from "./verbs/execute-tool-calls";
import { createProjectMcp } from "./verbs/project-mcp";
import { createRegister } from "./verbs/register";
import { createRegisterPluginTool } from "./verbs/register-plugin-tool";
import { createResolveTools } from "./verbs/resolve-tools";
import { createToWireTools } from "./verbs/to-wire-tools";

export function createToolUseService(ctx: ToolUseContext): ToolUseService {
  const registry: ToolRegistry = new Map();
  const executeToolCalls = createExecuteToolCalls(ctx);
  return {
    register: createRegister(registry),
    registerPluginTool: createRegisterPluginTool(registry, ctx.can),
    resolveTools: createResolveTools(registry),
    executeToolCalls,
    toWireTools: createToWireTools(),
    toAgentToolServer: createProjectMcp(executeToolCalls),
  };
}
