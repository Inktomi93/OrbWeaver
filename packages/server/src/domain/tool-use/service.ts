// domain/tool-use — COMPOSITION ROOT: wires the verbs over the ONE process-lifetime registry Map
// (zero logic). Built once at `entry/compose`; registrants populate it there via `register` (the
// owning-domain closure idiom — tool-use imports NO registrant, ever). `toToolDefinitions` is the ONE
// projection every wire consumes (`@orb/inference` places it); every invocation, whichever side drives the
// loop, funnels through the SAME executeToolCalls.

import type { ToolUseContext } from "./context.ts";
import type { ToolRegistry } from "./contract/results.ts";
import type { ToolUseService } from "./contract/service.ts";
import { createExecuteToolCalls } from "./verbs/execute-tool-calls.ts";
import { createIsToolDrivableBy } from "./verbs/is-tool-drivable-by.ts";
import { createListDrivableToolNames } from "./verbs/list-drivable-tool-names.ts";
import { createRegister } from "./verbs/register.ts";
import { createRegisterPluginTool } from "./verbs/register-plugin-tool.ts";
import { createResolveTools } from "./verbs/resolve-tools.ts";
import { createToToolDefinitions } from "./verbs/to-tool-definitions.ts";

export function createToolUseService(ctx: ToolUseContext): ToolUseService {
  const registry: ToolRegistry = new Map();
  const executeToolCalls = createExecuteToolCalls(ctx);
  return {
    register: createRegister(registry),
    registerPluginTool: createRegisterPluginTool(registry),
    isToolDrivableBy: createIsToolDrivableBy(registry),
    listDrivableToolNames: createListDrivableToolNames(registry),
    resolveTools: createResolveTools(registry),
    executeToolCalls,
    toToolDefinitions: createToToolDefinitions(),
  };
}
