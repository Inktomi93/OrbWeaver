import { evaluateMacros } from "./evaluator";
import { parseMacros } from "./parser";
import { createDefaultRegistry } from "./registry";
import type { MacroAST, MacroBudget, MacroContext, MacroRegistry } from "./types";

// Re-export the engine internals so `@orb/kit/macro` is the single front door (D15 directory-module).
export { evaluateMacros } from "./evaluator";
export { parseMacros } from "./parser";
export { createDefaultRegistry, SimpleMacroRegistry } from "./registry";
export type {
  MacroAST,
  MacroBlockNode,
  MacroBudget,
  MacroCallNode,
  MacroContext,
  MacroEnv,
  MacroHandler,
  MacroNode,
  MacroRegisterOptions,
  MacroRegistry,
  TextNode,
  VarOp,
} from "./types";
// D46 runtime variable delta model: the ordered op the mutation handlers record + the shared apply/fold.
export { applyVarOp, foldVarOps } from "./variables";

// Defense-in-depth caps. `{{setvar::a::{{a}}}}`-style chains are unbounded in one render pass
// without these; trivially DoS-able if multi-user is ever turned on. Generous limits — real
// prompts are tiny compared to 1 MB / 64 levels — so legitimate usage never trips.
const MAX_DEPTH = 64;
const MAX_OUTPUT_BYTES = 1_000_000;

// Intra-file helper — `createMacroContext` below is its only caller. Off the public surface (the
// "share a budget across multiple createMacroContext calls" use case has no consumer today).
function createMacroBudget(): MacroBudget {
  return {
    depth: 0,
    maxDepth: MAX_DEPTH,
    output: 0,
    maxOutput: MAX_OUTPUT_BYTES,
    tripped: false,
  };
}

// A singleton registry for the application, so extensions can register new macros globally.
// SINGLE-TENANT ASSUMPTION: this is process-wide mutable state — every `register` call affects
// every user's prompt evaluation. A true multi-tenant variant would need a per-request registry
// or a tenant scope on the macro names. The macro evaluator's depth/output caps are tenant-
// agnostic and stay correct either way; this caveat is only about who gets to add names.
export const globalMacroRegistry: MacroRegistry = createDefaultRegistry();

export type ProcessMacroOptions = Omit<MacroContext, "evaluateString" | "evaluateAST"> & {
  postProcess?: (val: string) => string;
};

export function createMacroContext(
  options: ProcessMacroOptions,
  registry: MacroRegistry = globalMacroRegistry,
): MacroContext {
  const budget: MacroBudget = options.__budget ?? createMacroBudget();
  // Wrap each recursion seam in a depth check — handler-driven re-entry (ctx.evaluateString in
  // args, ctx.evaluateAST in block bodies) is exactly where the recursion bomb lives.
  const guard = (fn: () => string): string => {
    if (budget.tripped) {
      return "";
    }
    if (budget.depth >= budget.maxDepth) {
      if (!budget.tripped) {
        budget.tripped = true;
        options.onWarn?.(
          `[Macro Engine] depth limit ${budget.maxDepth} exceeded — rendering aborted`,
        );
      }
      return "";
    }
    budget.depth += 1;
    try {
      return fn();
    } finally {
      budget.depth -= 1;
    }
  };
  const ctx: MacroContext = {
    ...options,
    __budget: budget,
    evaluateString: (str: string) => guard(() => evaluateMacros(parseMacros(str), registry, ctx)),
    evaluateAST: (astNode: MacroAST) => guard(() => evaluateMacros(astNode, registry, ctx)),
  };
  return ctx;
}

export function processMacros(
  text: string,
  options: ProcessMacroOptions,
  registry: MacroRegistry = globalMacroRegistry,
): string {
  const ctx = createMacroContext(options, registry);

  const ast = parseMacros(text);
  return ctx.evaluateAST(ast);
}
