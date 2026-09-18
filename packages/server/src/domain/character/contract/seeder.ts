// domain/character/contract/seeder — the default-card seeder's typed surface; seeder/ implements
// createDefaultCharacterSeeder over these. Wired by entry over the character front door, with the settings
// latch ops injected so domain/character never imports domain/settings.

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

/** The content fields a shipped card pack AUTHORS — the edit-detection surface of the reseed migration
 *  (`seeder/pack-v1.ts`). A prior pack's values are frozen per handle and compared byte-for-byte against the
 *  live `CharacterCard`: equal ⇒ the user never touched the seeded card and it may be re-dressed to the new
 *  pack; anything else ⇒ the row is the user's and is left alone. `name`/`nickname` are IN the set (owner
 *  ruling 2026-08-02): a rename is a user's claim of ownership over the card, so a renamed-but-otherwise-
 *  virgin card is preserved, not re-dressed back to our name. Deliberately EXCLUDES row identity and the
 *  timestamps (a pack bump rewrites those, so they can't witness an edit).
 *
 *  THE SET IS EXACTLY WHAT THE REDRESS OVERWRITES, AND THAT IS THE INVARIANT (#1443). It used to be eight
 *  face fields while `redressCard` wrote the whole create input — so a user who changed ONLY their system
 *  prompt, post-history instructions, depth prompt, `extensions`/`residualData`, or the card's authorship
 *  columns still "matched" and had that edit silently replaced by the new pack's value. A field that the
 *  migration writes and this type does not carry is that defect, re-introduced: either compare it here or do
 *  not write it. The two the migration CANNOT prove are still ours — the carried presentation
 *  (theme/background) and the avatar ASSET, neither of which a frozen fixture can name for an
 *  install-specific row — are therefore never written by a redress at all (`seeder/seed.ts`). */
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
  /** `update` applies each freshly-created card's `presentation` (the theme/background override arm) and
   *  carries the CONTENT re-dress on a pack migration; `getCard` reads the live content the migration
   *  compares against the prior pack's frozen fixture (and, on a resumed seed, against the shipped pack's
   *  own authored content — #1444). `get` reads the DETAIL, which is the only projection carrying the two
   *  carried-presentation columns (`CharacterCard` has neither), so a redress can tell an untouched card's
   *  empty look from a look the user chose (#1443). */
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
