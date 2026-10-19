// domain/persona — front door: the only legal external import. The chat-assembly seam
// (resolvePersonaDescriptionPlacement, AssemblePersona) is NOT here — it imports from @orb/kit/persona +
// @orb/contracts/chat directly.

export type { DefaultPersonaSeeder, DefaultPersonaSeederDeps } from "./contract/default-seed.ts";
export { AssetNotFoundError, LastPersonaError, PersonaNotFoundError } from "./contract/errors.ts";
export type { BulkImportPersonas } from "./contract/import.ts";
export type { JoinerPersonaStatementOp, ResolvePersonasForParticipants, UserPublicsDeps } from "./contract/ops.ts";
export type { CreatePersonaInput, UpdatePersonaInput } from "./contract/params.ts";
export type { PersonaAssemblyContext as PersonaContext, PersonaService } from "./contract/service.ts";
export type { PersonaDetail, PersonaListView } from "./contract/views.ts";
export { createBulkImportPersonas } from "./persistence/import-write.ts";
// R6 — the `(ownerId, name)` lookup the orb-native chat bundle re-links its anchor + per-turn personas
// through. The SAME key persona's own import verb dedups on, so a bundle resolves exactly the row a persona
// restore would have merged onto (a bundle gets one fresh ImportContext per file, so the profile run's
// in-memory `personaByUserName` map is not available to it).
export { createFindOwnedPersonaByName } from "./persistence/owned-name.ts";
export { createPersonaOwned } from "./persistence/ownership-ops.ts";
export { createDefaultPersonaSeeder } from "./seeder/default.ts";
export { createPersonaService } from "./service.ts";
export { createFindSeededDefault } from "./verbs/find-seeded-default.ts";
// D259 — the other PRINCIPAL-LESS op: the sign-up joiner's persona statement, which chat's signup batch runs.
export { createJoinerPersonaStatement } from "./verbs/joiner-persona-statement.ts";
export { createRepointSeedsAfterPersonaDelete } from "./verbs/repoint-seeds-after-persona-delete.ts";
// Two more principal-less room-plane ops chat consumes: a seat's display surface, and a solo founding's
// auto-anchored persona. Compose wires both onto `ChatContext`.
export { createResolveConnectedPersona } from "./verbs/resolve-connected-persona.ts";
// The PRINCIPAL-LESS room-plane op (contract/ops.ts) — compose-built, injected into the chat FOREIGN-inputs
// resolver. Deliberately NOT on `PersonaService` (which is Principal-scoped by contract).
export { createResolvePersonasForParticipants } from "./verbs/resolve-personas-for-participants.ts";
export { createResolvePersonaSeedPointers } from "./verbs/resolve-seed-pointers.ts";
export { createResolveUserPublics } from "./verbs/resolve-user-publics.ts";
export { createSeedPersonaWithCompletion } from "./verbs/seed-completion.ts";
