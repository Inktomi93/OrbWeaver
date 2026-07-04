// domain/tool-use/context — the conventional context slot re-exports the explicit DI bundle
// (§7.4 / no-context-returntype; the type lives in contract/service.ts).

export type { ToolUseContext } from "./contract/service";
