// domain/export — FRONT DOOR: the only legal external import; re-exports the public surface. The entry
// composition root wires `createExportService(ctx)` and hands it to the download registrar
// (`entry/http/export.ts`), which imports THIS door only (never an internal file). The pure serde core
// (card mapper, PNG codec) is NOT re-exported here — the verbs import it from its own packages.
//
// FLAG[PD-42]: `ExportChatFormat` joins this surface with the `exportChat` verb in P5 — see
// contract/service.ts. For now the door exposes the character-card surface only.

// Service contract (consumed by entry/http via service-method-signature inference).
export type { ExportService } from "./contract/service";

// Factory (wired at the composition root).
export { createExportService } from "./service";
