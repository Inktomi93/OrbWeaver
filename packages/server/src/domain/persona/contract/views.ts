export type { PersonaListView } from "@orb/contracts/persona";

// domain/persona/contract/views — the client read-model. PersonaDetail is what every read verb returns.
// metadata is typed (not Record<string, unknown>); persistence/queries.ts detailOf narrows the stored
// blob through personaMetadataSchema at the read seam. avatarHash is joined from assets, null when unset.

export type { ConnectedCharacterView, PersonaDetail } from "@orb/contracts/persona";
