// domain/tool-use — COMPOSITION ROOT: wires the verbs over the ONE process-lifetime registry Map
// (zero logic). Built once at `entry/compose`; registrants populate it there via `register` (the
// owning-domain closure idiom — tool-use imports NO registrant, ever). `project-mcp` joins the surface
// at T5 (with buddy's consumption — its dependency is the D47 agent-sdk factory).

import type { ToolUseContext } from "./context";
import type { ToolRegistry } from "./contract/results";
import type { ToolUseService } from "./contract/service";
import { createExecuteToolCalls } from "./verbs/execute-tool-calls";
import { createRegister } from "./verbs/register";
import { createResolveTools } from "./verbs/resolve-tools";
import { createToWireTools } from "./verbs/to-wire-tools";

export function createToolUseService(ctx: ToolUseContext): ToolUseService {
  const registry: ToolRegistry = new Map();
  return {
    register: createRegister(registry),
    resolveTools: createResolveTools(registry),
    executeToolCalls: createExecuteToolCalls(ctx),
    toWireTools: createToWireTools(),
  };
}
