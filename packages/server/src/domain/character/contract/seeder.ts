// domain/character/contract/seeder — the default-card seeder's typed surface; seeder/ implements
// createDefaultCharacterSeeder over these. Wired by entry over the character front door, with the settings
// latch ops injected so domain/character never imports domain/settings.

import type { CreateCharacterInput } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import type { AssetId, CharacterId, UserId } from "@orb/kit/ids";
import type { CharacterService } from "./service";

/** One authored default card: the create input plus its author-shipped native tags (attached separately —
 *  CreateCharacterInput carries no tags field). */
export interface SeedCard {
  readonly input: CreateCharacterInput;
  readonly tags: readonly string[];
}

export interface DefaultCharacterSeederDeps {
  readonly characters: Pick<CharacterService, "create" | "findByHandle">;
  /** Attach one of a seeded card's native tags as a card/pending suggestion. Idempotent + never downgrades. */
  readonly attachCardTag: (args: { readonly ownerId: UserId; readonly characterId: CharacterId; readonly tagName: string }) => Promise<boolean>;
  /** Store this handle's bundled avatar art, or null when the pack ships none / the store fails. */
  readonly storeAvatar?: (principal: Principal, handle: string) => Promise<AssetId | null>;
  /** Seed this character's starter gallery so a fresh library isn't an empty grid. Failures swallowed by the caller. */
  readonly seedGallery?: (principal: Principal, characterId: CharacterId, handle: string) => Promise<void>;
  readonly isSeeded: (principal: Principal) => Promise<boolean>;
  /** Persists the latch + (when unset) points `seeds.welcomeAssistantCharacterId` at the seeded Assistant. */
  readonly markSeeded: (principal: Principal, welcomeAssistantId: CharacterId | null) => Promise<void>;
}

export interface DefaultCharacterSeeder {
  /** Idempotent + never throws; safe on every request (an in-process memo makes steady-state a Set lookup). */
  readonly ensureSeeded: (principal: Principal) => Promise<void>;
}
