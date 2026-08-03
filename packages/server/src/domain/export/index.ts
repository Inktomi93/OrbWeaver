// domain/export — FRONT DOOR: the only legal external import; re-exports the public surface. The pure
// serde core (card mapper, PNG codec) is not re-exported here — verbs import it from its own package.

export type { HostChatRef } from "./contract/results.ts";
export type { ExportCardFormat, ExportChatFormat, ExportService } from "./contract/service.ts";

export { createExportService } from "./service.ts";
