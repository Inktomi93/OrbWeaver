// support/factories — the entity-builder barrel (core/Spine-Testing.md §2/§4). Every factory pairs a
// pure `makeX(overrides?): X` (deterministic — seeded ids, the shared frozen instant) with a persisted
// `seedX(db, overrides?): Promise<X>`; relations are ids by default, `withX: true` opt-ins explicit.
// Gate: test-factory-contract. Grown as entities land — user (the identity root every FK chain needs) +
// the first four: character, persona, chat, message.

export type { AssetRow } from "./asset.ts";
export { makeAsset, seedAsset } from "./asset.ts";
export type { CharacterRow } from "./character.ts";
export { makeCharacter, seedCharacter } from "./character.ts";
export type { ChatRow, SeedChatOptions, SeededChat } from "./chat.ts";
export { makeChat, seedChat } from "./chat.ts";
export type { MessageRow, SeededMessage, SeedMessageOptions } from "./message.ts";
export { makeMessage, seedMessage } from "./message.ts";
export type { PersonaRow } from "./persona.ts";
export { makePersona, seedPersona } from "./persona.ts";
export { principal } from "./principal.ts";
export {
  makeModelCapability,
  makeOpenRouterCredential,
  makeResolvedChatCapability,
  makeResolvedConnection,
  makeResolvedCredential,
} from "./resolved-connection.ts";
export type { UserRow } from "./user.ts";
export { makeUser, seedUser } from "./user.ts";
