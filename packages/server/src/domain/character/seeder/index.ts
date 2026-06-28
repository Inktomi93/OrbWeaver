// domain/character/seeder — the default-card seeder subsystem barrel. The character front door re-exports
// these; entry (boot + the app first-request hook) constructs the ONE instance via `createDefaultCharacter
// Seeder` over the built `CharacterService` + the injected settings latch ops. The TYPES
// (`DefaultCharacterSeeder` / `DefaultCharacterSeederDeps`) live in `contract/seeder.ts` (the §7.4 one-type-
// home rule); this barrel re-exports them alongside the factory + the authored card constants.

export type {
  DefaultCharacterSeeder,
  DefaultCharacterSeederDeps,
  SeedCard,
} from "../contract/seeder";
export { DEFAULT_CHARACTER_CARDS, WELCOME_ASSISTANT_HANDLE } from "./cards";
export { createDefaultCharacterSeeder } from "./seed";
