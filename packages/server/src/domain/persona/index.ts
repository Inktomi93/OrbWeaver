// domain/persona — FRONT DOOR: the only legal external import; re-exports the public surface.
//   • the PersonaService contract + PersonaDetail view (client consumes via tRPC service-method inference)
//   • the wire INPUT types (canonical home @orb/contracts/persona; re-exported for ergonomics)
//   • PersonaNotFoundError (so the transport + tests discriminate it past the base DomainNotFoundError)
//   • createPersonaService (the factory the entry root wires over the assembled PersonaContext)
//
// The chat-assembly seam (`resolvePersonaDescriptionPlacement`, the `AssemblePersona` shape) is NOT here —
// it imports from `@orb/kit/persona` + `@orb/contracts/chat` directly.

export { PersonaNotFoundError } from "./contract/errors";
export type { CreatePersonaInput, UpdatePersonaInput } from "./contract/params";
export type { PersonaService } from "./contract/service";
export type { PersonaDetail } from "./contract/views";
export { createPersonaService } from "./service";
