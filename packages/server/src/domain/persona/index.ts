// domain/persona — front door: the only legal external import. The chat-assembly seam
// (resolvePersonaDescriptionPlacement, AssemblePersona) is NOT here — it imports from @orb/kit/persona +
// @orb/contracts/chat directly.

export { AssetNotFoundError, LastPersonaError, PersonaNotFoundError } from "./contract/errors";
export type { BulkImportPersonas, PersonaImportContext } from "./contract/import";
export type { CreatePersonaInput, UpdatePersonaInput } from "./contract/params";
export type { PersonaService } from "./contract/service";
export type { PersonaDetail } from "./contract/views";
export { createBulkImportPersonas } from "./persistence/import-write";
export { createPersonaService } from "./service";
