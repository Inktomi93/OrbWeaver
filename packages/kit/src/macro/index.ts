// Macro rendering, authoring metadata and registration share this directory door (D15).
// Implementation-only helpers and bookkeeping remain in their owning modules.
export { macroTextInvalidatesCache } from "./cache-safety.ts";
export { neutralizeMacros, swapIdentityMacros } from "./content.ts";
export {
  createMacroContext,
  globalMacroRegistry,
  type ProcessMacroOptions,
  processMacros,
} from "./engine.ts";
export { queryMacros } from "./metadata.ts";
// MACRO_NAME_RE: the fully-anchored macro-name shape — user-macro registration + the contracts-side
// authoring schema both validate against it (one vocabulary with the parser's identifier scan).
export { MACRO_NAME_RE, type MacroRun, scanMacroRuns, stripComments } from "./parser.ts";
export { createDefaultRegistry, createNamesOnlyRegistry, createVolatileOnlyRegistry } from "./registry.ts";
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
  MacroArgType,
  MacroContext,
  MacroDiagnostic,
  MacroEnv,
  MacroFreeze,
  MacroMetadata,
  MacroRegistry,
  MacroSourceKind,
  MacroSourceRef,
  VarOp,
} from "./types.ts";
// MACRO_FLAG_DEFS: the ONE reserved-flags vocabulary — the parser derives from it, the macro
// browser documents from it.
export { MACRO_ARG_TYPES, MACRO_FLAG_DEFS, MACRO_SOURCE_KINDS } from "./types.ts";
// The #24 typed-input fold: preset/game-authored user macros as first-class registry entries + the typed
// choice-block input vocabulary and its pure values-bag resolution (random-pick draws freeze-at-commit).
export {
  findOffVocabularyPicks,
  type OffVocabularyPick,
  type RejectedUserMacro,
  registerUserMacros,
  resolveUserMacroInputs,
  USER_MACRO_INPUT_KINDS,
  type UserMacroDef,
  type UserMacroInputDef,
  type UserMacroInputKind,
  type UserMacroInputValue,
  type UserMacroRegistration,
  userMacroToggleDefaultsOn,
} from "./user-macros.ts";
// D46 runtime variable delta model: the ordered op the mutation handlers record + the shared apply/fold.
export { foldVarOps, parseCompleteInteger } from "./variables.ts";
