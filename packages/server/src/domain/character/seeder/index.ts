// Entry composes the default-card seeder with the character service and settings latch.
// Contract types stay in contract/seeder.ts; this door exposes the factory and consumed public surface.

export type { DefaultCharacterSeeder } from "../contract/seeder.ts";
export { DEFAULT_CHARACTER_CARDS, WELCOME_ASSISTANT_HANDLE } from "./cards.ts";
export { createDefaultCharacterSeeder } from "./seed.ts";
