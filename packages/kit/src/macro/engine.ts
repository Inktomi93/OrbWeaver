// The macro engine's render entry points (`processMacros`/`createMacroContext`) + the defense-in-depth
// budget they share. Split out of `index.ts` (which stays the barrel) so `row-macros.ts` — itself
// re-exported from the barrel — can import `processMacros` without an import CYCLE (index → row-macros →
// index would trip `noImportCycles`/`no-circular`; index → row-macros → engine does not).

import { trimContent } from "./content.ts";
import { evaluateMacros } from "./evaluator.ts";
import { parseMacros } from "./parser.ts";
import { createDefaultRegistry } from "./registry.ts";
import type { MacroAST, MacroBudget, MacroContext, MacroRegistry } from "./types.ts";

// Defense-in-depth caps. `{{setvar::a::{{a}}}}`-style chains are unbounded in one render pass
// without these; trivially DoS-able if multi-user is ever turned on. Generous limits — real
// prompts are tiny compared to 1 MB / 64 levels — so legitimate usage never trips.
const MAX_DEPTH = 64;
const MAX_OUTPUT_BYTES = 1_000_000;

// Defense-in-depth INPUT belt (2026-08-09 DoS audit). The parser is now O(n) (parser.ts spanFrom), but the
// engine must not TRUST that all ~10 call sites capped their input — a caller that forgets its schema cap
// would hand an unbounded string straight to the parser. Every legitimate macro input is tiny; the largest
// a write-boundary schema admits is a 100 KB card field / world-info `content` (TEXT_MAX = CONTENT_MAX =
// 100_000). This cap sits at 2 MB — 20× that ceiling and 2× the output cap — so any real input (a maxed
// card field, or a section concatenating several) passes, while a pathological multi-megabyte input is
// refused before it is parsed. Measured in `.length` (UTF-16 units) to match MAX_OUTPUT_BYTES's accounting.
const MAX_INPUT_BYTES = 2_000_000;

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

export type ProcessMacroOptions = Omit<MacroContext, "evaluateString" | "evaluateAST" | "resolve"> & {
  postProcess?: (val: string) => string;
};

export function createMacroContext(options: ProcessMacroOptions, registry: MacroRegistry = globalMacroRegistry): MacroContext {
  const budget: MacroBudget = options.__budget ?? createMacroBudget();
  // Wrap each recursion seam in a depth check — handler-driven re-entry (ctx.evaluateString in
  // args, ctx.evaluateAST in block bodies, ctx.resolve on the lazy path) is exactly where the
  // recursion bomb lives.
  const guard = (fn: () => string): string => {
    if (budget.tripped) {
      return "";
    }
    if (budget.depth >= budget.maxDepth) {
      // `budget.tripped` was already checked false above and nothing between here and there
      // mutates it, so this is the first time we trip — always warn.
      budget.tripped = true;
      options.onWarn?.(`[Macro Engine] depth limit ${budget.maxDepth} exceeded — rendering aborted`);
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
    // The lazy-contract handle: delegates to the guarded seams above, so it threads the
    // SAME budget/PRNG/opLog as eager resolution — a lazy handler's late draws land in document order,
    // byte-identical to the eager path. `trim: true` = the resolveContent body treatment (trimContent).
    resolve: (content, opts) => {
      const out = typeof content === "string" ? ctx.evaluateString(content) : ctx.evaluateAST(content);
      return opts?.trim === true ? trimContent(out) : out;
    },
  };
  return ctx;
}

export function processMacros(text: string, options: ProcessMacroOptions, registry: MacroRegistry = globalMacroRegistry): string {
  // Input belt (see MAX_INPUT_BYTES): refuse a pathological input before parsing. Degrade-don't-throw —
  // the engine's posture on every cap — so a hostile field can never block the shared event loop.
  if (text.length > MAX_INPUT_BYTES) {
    options.onWarn?.(`[Macro Engine] input limit ${MAX_INPUT_BYTES} bytes exceeded — rendering skipped`);
    return "";
  }
  const ctx = createMacroContext(options, registry);

  const ast = parseMacros(text);
  return ctx.evaluateAST(ast);
}
