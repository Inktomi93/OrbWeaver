// domain/regex — FRONT DOOR: the only legal external import; re-exports the public surface. The chat turn
// does NOT read these tables directly — it consumes the injected `ResolveRegexSources` op (contract/
// resolve.ts), which is what keeps the four-scope dereference in ONE home.

export { RegexNotFoundError } from "./contract/errors.ts";

export type {
  ExportCardScripts,
  ExportRegexScripts,
  ImportCardScripts,
  ImportGlobalScripts,
  ImportPresetScripts,
  ImportRegexScript,
} from "./contract/portability.ts";
export type { ResolveRegexSources } from "./contract/resolve.ts";

export type { RegexAssemblyContext as RegexContext, RegexService } from "./contract/service.ts";

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
export { createRegexRoomReach } from "./persistence/room-reach.ts";
export { createRegexService } from "./service.ts";
