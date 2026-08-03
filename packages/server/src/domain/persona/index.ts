// domain/persona — front door: the only legal external import. The chat-assembly seam
// (resolvePersonaDescriptionPlacement, AssemblePersona) is NOT here — it imports from @orb/kit/persona +
// @orb/contracts/chat directly.

export type { PersonaContext } from "./context.ts";
export { AssetNotFoundError, LastPersonaError, PersonaNotFoundError } from "./contract/errors.ts";
export type { BulkImportPersonas, PersonaImportContext } from "./contract/import.ts";
export type { ResolvePersonasForRoster } from "./contract/ops.ts";
export type { CreatePersonaInput, UpdatePersonaInput } from "./contract/params.ts";
export type { PersonaService } from "./contract/service.ts";
export type { PersonaDetail, PersonaRosterView } from "./contract/views.ts";
export { createBulkImportPersonas } from "./persistence/import-write.ts";
export { createPersonaService } from "./service.ts";
// The PRINCIPAL-LESS room-plane op (contract/ops.ts) — compose-built, injected into the chat FOREIGN-inputs
// resolver. Deliberately NOT on `PersonaService` (which is Principal-scoped by contract).
export { createResolvePersonasForRoster } from "./verbs/resolve-personas-for-roster.ts";
