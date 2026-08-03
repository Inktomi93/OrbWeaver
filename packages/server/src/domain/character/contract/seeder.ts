// domain/character/contract/seeder — the default-card seeder's typed surface; seeder/ implements
// createDefaultCharacterSeeder over these. Wired by entry over the character front door, with the settings
// latch ops injected so domain/character never imports domain/settings.

import type { CharacterCard, CreateCharacterInput, UpdateCharacterInput } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import type { AssetId, CharacterHandle, CharacterId, UserId } from "@orb/kit/ids";
import type { CharacterService } from "./service.ts";

/** One authored default card: the create input, its author-shipped native tags (attached separately —
 *  CreateCharacterInput carries no tags field), and its PRESENTATION (carried theme + background).
 *  `presentation` rides separately because both fields live on the UPDATE arm only (the create schema
 *  carries neither), so the seeder applies them as a post-create edit — see `seeder/seed.ts`. */
export interface SeedCard {
  readonly input: CreateCharacterInput;
  readonly tags: readonly string[];
  readonly presentation: Pick<UpdateCharacterInput, "themeOverride" | "backgroundOverride">;
}

/** The content fields a shipped card pack AUTHORS — the edit-detection surface of the reseed migration
 *  (`seeder/pack-v1.ts`). A prior pack's values are frozen per handle and compared byte-for-byte against the
 *  live `CharacterCard`: equal ⇒ the user never touched the seeded card and it may be re-dressed to the new
 *  pack; anything else ⇒ the row is the user's and is left alone. `name`/`nickname` are IN the set (owner
 *  ruling 2026-08-02): a rename is a user's claim of ownership over the card, so a renamed-but-otherwise-
 *  virgin card is preserved, not re-dressed back to our name. Deliberately EXCLUDES row identity, the
 *  timestamps, and the typed provenance columns (a pack bump rewrites those, so they can't witness an edit). */
export type SeededCardContent = Pick<
  CharacterCard,
  "name" | "nickname" | "description" | "personality" | "scenario" | "greetings" | "exampleMessages" | "creatorNotes"
>;

export interface DefaultCharacterSeederDeps {
  /** `update` applies each freshly-created card's `presentation` (the theme/background override arm) and
   *  carries the whole re-dress on a pack migration; `getCard` reads the live content the migration compares
   *  against the prior pack's frozen fixture. */
  readonly characters: Pick<CharacterService, "create" | "findByHandle" | "update" | "getCard">;
  /** Attach one of a seeded card's native tags as a card/pending suggestion. Idempotent + never downgrades. */
  readonly attachCardTag: (args: { readonly ownerId: UserId; readonly characterId: CharacterId; readonly tagName: string }) => Promise<boolean>;
  /** Store this handle's bundled avatar art, or null when the pack ships none / the store fails. */
  readonly storeAvatar?: (principal: Principal, handle: CharacterHandle) => Promise<AssetId | null>;
  /** Seed this character's starter gallery so a fresh library isn't an empty grid. Failures swallowed by the caller. */
  readonly seedGallery?: (principal: Principal, characterId: CharacterId, handle: CharacterHandle) => Promise<void>;
  readonly isSeeded: (principal: Principal) => Promise<boolean>;
  /** Persists the latch + (when unset) points `seeds.welcomeAssistantCharacterId` at the seeded Assistant. */
  readonly markSeeded: (principal: Principal, welcomeAssistantId: CharacterId | null) => Promise<void>;
  /** Reads `onboarding.defaultCharactersPackVersion` — the pack this library was last seeded/migrated to.
   *  `0` is the pre-stamp cohort (a v1 install), which is what makes the migration reachable at all. */
  readonly readPackVersion: (principal: Principal) => Promise<number>;
  /** Persists the pack stamp. Written LAST on both paths (fresh seed + migration), so a crash mid-run leaves
   *  the old stamp and the next touch re-runs — the re-run is a no-op on cards it already re-dressed
   *  (they no longer match the prior pack's fixture). */
  readonly markPackVersion: (principal: Principal, version: number) => Promise<void>;
}

export interface DefaultCharacterSeeder {
  /** Idempotent + never throws; safe on every request (an in-process memo makes steady-state a Set lookup). */
  readonly ensureSeeded: (principal: Principal) => Promise<void>;
}
