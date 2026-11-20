// domain/regex — FRONT DOOR: the only legal external import; re-exports the public surface. The chat turn
// does NOT read these tables directly — it consumes the injected `ResolveRegexSources` op (contract/
// resolve.ts), which is what keeps the four-scope dereference in ONE home.

export type { RegexService } from "./contract/service.ts";

export { createCopyHandoffRegexScripts, createCountHandoffRegexScripts, createDetachHandoffRegexScripts } from "./persistence/handoff-copy-write.ts";
export {
  createExportCardScripts,
  createExportPresetScripts,
  createExportRegexScripts,
  createImportCardScripts,
  createImportGlobalScripts,
  createImportPresetScripts,
  createImportRegexScript,
  createListPresetScriptKeys,
  createPlanPresetScripts,
} from "./persistence/portability-write.ts";
export { createResolveRegexSources } from "./persistence/resolve-sources.ts";
export { createRegexRoomReach } from "./persistence/room-reach.ts";
export { createRegexService } from "./service.ts";
export { createRemoveUnattachedScripts } from "./verbs/scripts/remove-unattached.ts";
