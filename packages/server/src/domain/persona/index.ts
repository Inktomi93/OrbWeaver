// domain/persona — front door: the only legal external import. The chat-assembly seam
// (resolvePersonaDescriptionPlacement, AssemblePersona) is NOT here — it imports from @orb/kit/persona +
// @orb/contracts/chat directly.

export type { PersonaContext } from "./context";
export { AssetNotFoundError, LastPersonaError, PersonaNotFoundError } from "./contract/errors";
export type { BulkImportPersonas, PersonaImportContext } from "./contract/import";
export type { ResolvePersonasForRoster } from "./contract/ops";
export type { CreatePersonaInput, UpdatePersonaInput } from "./contract/params";
export type { PersonaService } from "./contract/service";
export type { PersonaDetail, PersonaRosterView } from "./contract/views";
export { createBulkImportPersonas } from "./persistence/import-write";
export { createPersonaService } from "./service";
// The PRINCIPAL-LESS room-plane op (contract/ops.ts) — compose-built, injected into the chat FOREIGN-inputs
// resolver. Deliberately NOT on `PersonaService` (which is Principal-scoped by contract).
export { createResolvePersonasForRoster } from "./verbs/resolve-personas-for-roster";
