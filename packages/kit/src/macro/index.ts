// Re-export the engine internals so `@orb/kit/macro` is the single front door (D15 directory-module).
// The render entry points (`processMacros`/`createMacroContext`) + the shared budget live in `engine.ts`
// (split out of this barrel so `row-macros.ts` below can import them without an import cycle).
export {
  createMacroContext,
  globalMacroRegistry,
  type ProcessMacroOptions,
  processMacros,
} from "./engine";
export { evaluateMacros } from "./evaluator";
export { parseMacros } from "./parser";
export { createDefaultRegistry, SimpleMacroRegistry } from "./registry";
export type {
  RowCharacterName,
  RowMacroNameContext,
  RowMacroStamps,
  RowPersonaName,
} from "./row-macros";
// The chat-history row resolver (Chat-Macro-Resolution.md §2) — the ONE atom server ASSEMBLE + client
// DISPLAY both call so they cannot diverge. Composes `processMacros` (`./engine`).
export { resolveRowMacros } from "./row-macros";
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
