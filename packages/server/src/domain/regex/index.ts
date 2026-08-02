// domain/regex — FRONT DOOR: the only legal external import; re-exports the public surface. The chat turn
// does NOT read these tables directly — it consumes the injected `ResolveRegexSources` op (contract/
// resolve.ts), which is what keeps the four-scope dereference in ONE home.

export type { RegexContext } from "./context";
export type { CardLiftInput, CardLiftPlan, PlannedInsert, SplitScript } from "./contract/dedup";
export { RegexNotFoundError } from "./contract/errors";
export type { ApplyScopeOrderParams, RegexAttachScopeRef } from "./contract/params";
export type {
  ExportCardScripts,
  ExportedCardScripts,
  ExportedRegexScriptFile,
  ExportRegexScripts,
  ImportCardScripts,
  ImportCardScriptsArgs,
  ImportCardScriptsResult,
  ImportRegexScript,
  RegexPortabilityContext,
} from "./contract/portability";
export type { RegexResolveContext, ResolvedRegexSources, ResolveRegexSources, ResolveRegexSourcesArgs } from "./contract/resolve";
export type { DetachResult, RemoveResult, ReorderResult } from "./contract/results";
export type { ScriptRecord } from "./contract/rows";
export type { RegexService } from "./contract/service";
export type { CreateRegexScriptInput, PortableRegexScript, RegexScriptRow, UpdateRegexScriptInput } from "./contract/views";
export {
  createExportCardScripts,
  createExportRegexScripts,
  createImportCardScripts,
  createImportRegexScript,
} from "./persistence/portability-write";
export { createResolveRegexSources } from "./persistence/resolve-sources";
export { createRegexService } from "./service";
