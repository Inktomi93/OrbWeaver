// domain/export — FRONT DOOR: the only legal external import; re-exports the public surface. The entry
// composition root wires `createExportService(ctx)`. The download registrar (`entry/http/export.ts`,
// which must import THIS door only) is NOT BUILT YET — the composed service currently has no HTTP
// consumer (gap tracked in the debt registry; spec: `docs/architecture/history/export-import-portability.md` §3).
// The pure serde core (card mapper, PNG codec) is NOT re-exported here — the verbs import it from its
// own packages.
//
// Service contract (consumed by entry/http via service-method-signature inference) + the chat transcript
// format union (PD-42).
export type { ExportChatFormat, ExportService } from "./contract/service";

export { createExportService } from "./service";
