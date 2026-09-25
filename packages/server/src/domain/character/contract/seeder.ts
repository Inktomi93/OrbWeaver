// domain/character/contract/seeder — the default-card seeder's typed surface; seeder/ implements
// createDefaultCharacterSeeder over these. Wired by entry over the character front door; the seed ledger that
// decides WHICH cards an account receives lives at entry (D263), so this seeder seeds one card at a time.

import type { CharacterCard, CreateCharacterInput, UpdateCharacterInput } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import type { ThemeBackground } from "@orb/contracts/theme";
import type { AssetId, CharacterHandle, CharacterId, UserId } from "@orb/kit/ids";
import type { CharacterService } from "./service.ts";

/** One authored default card: the create input, its author-shipped native tags (attached separately —
 *  CreateCharacterInput carries no tags field), and its PRESENTATION (carried theme + background).
 *  `presentation` rides separately because both fields live on the UPDATE arm only (the create schema
 *  carries neither), so the seeder applies them as a post-create edit — see `seeder/seed.ts`. */
export interface SeedCard {
  readonly input: CreateCharacterInput;
  readonly tags: readonly string[];
  /** The authored look MINUS the scene plate — `backgroundOverride` is resolved at SEED TIME, per user, from
   *  `backgroundSlug` (see below), because it now names an asset only that user owns. */
  readonly presentation: Pick<UpdateCharacterInput, "themeOverride">;
  /** This card's shipped scene plate, by content slug (`<handle>-bg`). Until 2026-09-18 the pack spelled a
   *  whole `kind:"seeded"` background here, because a plate was a static catalog slug every install resolved
   *  to the same `public/` URL. A plate is now an OWNED asset per user, so the pack can only name WHICH
   *  plate; `resolveSeededBackground` turns that into the receiving user's own `kind:"asset"` ref at seed
   *  time. `null` ⇒ this card ships no plate (it seeds background-less rather than blank-referencing one). */
  readonly backgroundSlug: string | null;
}

/** The content fields the shipped pack AUTHORS — the half-seeded-card test (`seeder/authored-content.ts`) compares
 *  exactly this set against the live `CharacterCard`: equal ⇒ a card a crashed seed left undressed, safe to
 *  finish; anything else ⇒ the row is the user's. Excludes row identity and timestamps. */
export type SeededCardContent = Pick<
  CharacterCard,
  | "name"
  | "nickname"
  | "description"
  | "personality"
  | "scenario"
  | "greetings"
  | "exampleMessages"
  | "creatorNotes"
  | "systemPrompt"
  | "postHistoryInstructions"
  | "depthPrompt"
  | "creator"
  | "cardVersion"
  | "source"
  | "creationDate"
  | "modificationDate"
  | "extensions"
  | "residualData"
>;

export interface DefaultCharacterSeederDeps {
  /** `update` applies each freshly-created card's `presentation` (the theme/background override arm); `getCard`
   *  reads the live content a resumed seed compares against the shipped pack (#1444); `get` reads the DETAIL,
   *  the only projection carrying the carried-presentation columns, so a finished card keeps a look the user
   *  chose (#1443). */
  readonly characters: Pick<CharacterService, "create" | "findByHandle" | "update" | "getCard" | "get">;
  /** Attach one of a seeded card's native tags as a card/pending suggestion. Idempotent + never downgrades. */
  readonly attachCardTag: (args: { readonly ownerId: UserId; readonly characterId: CharacterId; readonly tagName: string }) => Promise<boolean>;
  /** Store this handle's bundled avatar art, or null when the pack ships none / the store fails. */
  readonly storeAvatar?: (principal: Principal, handle: CharacterHandle) => Promise<AssetId | null>;
  /** Seed this character's starter gallery so a fresh library isn't an empty grid. Failures swallowed by the caller. */
  readonly seedGallery?: (principal: Principal, characterId: CharacterId, handle: CharacterHandle) => Promise<void>;
  /** Resolve a card's `backgroundSlug` to THIS user's own plate asset (`kind:"asset"`), lifting the shipped
   *  bytes into their CAS on first ask. `null` ⇒ no plate lands, and the card is dressed theme-only. Wired
   *  at the composition root off `domain/settings`' scene-plate seeder — character never imports settings,
   *  and the seeder never touches the filesystem. */
  readonly resolveSeededBackground?: (principal: Principal, slug: string) => Promise<ThemeBackground | null>;
  /** Points `seeds.welcomeAssistantCharacterId` at the seeded welcome card, when it is still unset. */
  readonly markWelcomeAssistant: (principal: Principal, welcomeAssistantId: CharacterId) => Promise<void>;
}

export interface DefaultCharacterSeeder {
  /** Seed ONE shipped card for this user: create it (or resolve the row already at its handle), tag it and dress
   *  it. Returns its id, or `null` when the pack ships no card at the handle. Throws on a failure, so the
   *  caller's ledger records only a card that landed. */
  readonly seedCard: (principal: Principal, handle: CharacterHandle) => Promise<CharacterId | null>;
}
