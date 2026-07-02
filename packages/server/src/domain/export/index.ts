// domain/export — FRONT DOOR: the only legal external import; re-exports the public surface. The entry
// composition root wires `createExportService(ctx)` and hands it to the download registrar
// (`entry/http/export.ts`), which imports THIS door only (never an internal file). The pure serde core
// (card mapper, PNG codec) is NOT re-exported here — the verbs import it from its own packages.
//
// Service contract (consumed by entry/http via service-method-signature inference) + the chat transcript
// format union (PD-42).
export type { ExportChatFormat, ExportService } from "./contract/service";

// Factory (wired at the composition root).
export { createExportService } from "./service";
