// domain/persona — FRONT DOOR: the only legal external import; re-exports the public surface.
//   • the PersonaService contract + PersonaDetail view (client consumes via tRPC service-method inference)
//   • the wire INPUT types (canonical home @orb/contracts/persona; re-exported for ergonomics)
//   • PersonaNotFoundError + LastPersonaError + AssetNotFoundError (so the transport + tests discriminate
//     them past the bases)
//   • createPersonaService (the factory the entry root wires over the assembled PersonaContext)
//
// The chat-assembly seam (`resolvePersonaDescriptionPlacement`, the `AssemblePersona` shape) is NOT here —
// it imports from `@orb/kit/persona` + `@orb/contracts/chat` directly.

export { AssetNotFoundError, LastPersonaError, PersonaNotFoundError } from "./contract/errors";
// The persona-OWNED bulk-import WRITE op's DI bundle + op type (Option B; PD-77) — the entry root constructs
// `PersonaImportContext` and wires `createBulkImportPersonas` (below) into `import`'s `bulkImportPersonas`.
export type { BulkImportPersonas, PersonaImportContext } from "./contract/import";
export type { CreatePersonaInput, UpdatePersonaInput } from "./contract/params";
export type { PersonaService } from "./contract/service";
export type { PersonaDetail } from "./contract/views";
export { createBulkImportPersonas } from "./persistence/import-write";
export { createPersonaService } from "./service";
