// Re-export the engine internals so `@orb/kit/macro` is the single front door (D15 directory-module).
// The render entry points (`processMacros`/`createMacroContext`) + the shared budget live in `engine.ts`
// (split out of this barrel so `row-macros.ts` below can import them without an import cycle).
// The scoped-block body normalizer (trim + indent-dedent; the `#` flag bypasses it in the evaluator)
// + the ZWSP macro-re-injection defense (re-homed from kit/guided, which re-exports it — one home).
export { type IdentityMapping, neutralizeMacros, swapIdentityMacros, type TrimContentOptions, trimContent, ZWSP } from "./content.ts";
export {
  createMacroContext,
  globalMacroRegistry,
  type ProcessMacroOptions,
  processMacros,
} from "./engine.ts";
export { evaluateMacros } from "./evaluator.ts";
// The macro-DX layer + the runtime-enforcement core: typed violations
// (checkMacroArgs → MacroArgViolation) with validateMacroArgs deriving the positional diagnostics, and
// the autocomplete query. Types + MACRO_CATEGORIES home in ./types (below) so the registry references
// them cycle-free.
export { type CheckMacroArgsOptions, checkMacroArgs, queryMacros, validateMacroArgs } from "./metadata.ts";
// MACRO_NAME_RE: the fully-anchored macro-name shape — user-macro registration + the contracts-side
// authoring schema both validate against it (one vocabulary with the parser's identifier scan).
export { MACRO_NAME_RE, type MacroRun, parseMacros, scanMacroRuns } from "./parser.ts";
export { createDefaultRegistry, createNamesOnlyRegistry, createVolatileOnlyRegistry, SimpleMacroRegistry } from "./registry.ts";
export type {
  RowCharacterName,
  RowMacroNameContext,
  RowMacroStamps,
  RowPersonaName,
} from "./row-macros.ts";
// The chat-history row resolver (Chat-Macro-Resolution.md §2) — the ONE atom server ASSEMBLE + client
// DISPLAY both call so they cannot diverge. Composes `processMacros` (`./engine`).
export { resolveRowMacros } from "./row-macros.ts";
export type {
  GlobalVarWrite,
  MacroArgDef,
  MacroArgType,
  MacroArgViolation,
  MacroArgViolationKind,
  MacroAST,
  MacroBlockNode,
  MacroBudget,
  MacroCallNode,
  MacroCategory,
  MacroContext,
  MacroDiagnostic,
  MacroEnv,
  MacroFlagKey,
  MacroFlags,
  MacroFreeze,
  MacroHandler,
  MacroListSpec,
  MacroMetadata,
  MacroMetadataInput,
  MacroNode,
  MacroRegisterOptions,
  MacroRegistry,
  MacroResolveOptions,
  MacroSourceRef,
  MacroSpan,
  TextNode,
  VarOp,
} from "./types.ts";
// MACRO_FLAG_DEFS: the ONE reserved-flags vocabulary (§12A.4) — the parser derives from it, the macro
// browser documents from it.
export { MACRO_ARG_TYPES, MACRO_CATEGORIES, MACRO_FLAG_DEFS } from "./types.ts";
// WAVE MU (M5 + #24): preset/game-authored user macros as first-class registry entries + the typed
// choice-block input vocabulary and its pure values-bag resolution (random-pick draws freeze-at-commit).
export {
  type RegisterUserMacrosOptions,
  type RejectedUserMacro,
  type ResolvedUserMacroInputs,
  type ResolveUserMacroInputsOptions,
  registerUserMacros,
  resolveUserMacroInputs,
  USER_MACRO_CONTENT_BINDING,
  USER_MACRO_INPUT_KINDS,
  type UserMacroDef,
  type UserMacroInputDef,
  type UserMacroInputKind,
  type UserMacroInputOption,
  type UserMacroInputValue,
  type UserMacroInputValueBag,
  type UserMacroRegistration,
  userMacroToggleDefaultsOn,
} from "./user-macros.ts";
// D46 runtime variable delta model: the ordered op the mutation handlers record + the shared apply/fold.
export { applyVarOp, foldVarOps } from "./variables.ts";
