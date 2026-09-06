// domain/regex — FRONT DOOR: the only legal external import; re-exports the public surface. The chat turn
// does NOT read these tables directly — it consumes the injected `ResolveRegexSources` op (contract/
// resolve.ts), which is what keeps the four-scope dereference in ONE home.

export type { RegexContext } from "./context.ts";
export type { CardLiftInput, CardLiftPlan, PlannedInsert, SplitScript } from "./contract/dedup.ts";
export { RegexNotFoundError } from "./contract/errors.ts";
export type { CopyHandoffRegexScripts, CountHandoffRegexScripts, RegexHandoffCopyContext } from "./contract/handoff-copy.ts";
export type { ApplyScopeOrderParams, RegexAttachScopeRef } from "./contract/params.ts";
export type {
  ExportCardScripts,
  ExportedCardScripts,
  ExportedRegexScriptFile,
  ExportRegexScript,
  ExportRegexScripts,
  ImportCardScripts,
  ImportCardScriptsArgs,
  ImportCardScriptsResult,
  ImportGlobalScripts,
  ImportPresetScripts,
  ImportPresetScriptsArgs,
  ImportRegexScript,
  RegexPortabilityContext,
} from "./contract/portability.ts";
export type { RegexResolveContext, ResolvedRegexSources, ResolveRegexSources, ResolveRegexSourcesArgs } from "./contract/resolve.ts";
export type { BulkResult, DetachResult, RemoveResult, ReorderResult } from "./contract/results.ts";
export type { ScriptRecord } from "./contract/rows.ts";
export type { RegexService } from "./contract/service.ts";
export type { CreateRegexScriptInput, PortableRegexScript, RegexScriptRow, UpdateRegexScriptInput } from "./contract/views.ts";
export { createCopyHandoffRegexScripts, createCountHandoffRegexScripts } from "./persistence/handoff-copy-write.ts";
export {
  createExportCardScripts,
  createExportRegexScripts,
  createImportCardScripts,
  createImportGlobalScripts,
  createImportPresetScripts,
  createImportRegexScript,
} from "./persistence/portability-write.ts";
export { createResolveRegexSources } from "./persistence/resolve-sources.ts";
export { createRegexService } from "./service.ts";
