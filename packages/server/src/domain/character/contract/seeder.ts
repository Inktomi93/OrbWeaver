// domain/character/contract/seeder — the default-card seeder's typed surface (the §7.4 one-type-home rule:
// a feature's exported types live under contract/, not inside the subsystem that implements them). The
// `seeder/` subsystem (`seed.ts` + `cards.ts`) implements `createDefaultCharacterSeeder` over these.
//
// The seeder is wired by ENTRY (boot + the app first-request hook) over the character front door — it takes
// the constructed `CharacterService` (only `create` + `findByHandle`) and the settings latch ops INJECTED, so
// `domain/character` never imports `domain/settings` (`domain-no-cross-feature`).

import type { CreateCharacterInput } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import type { AssetId, CharacterId, UserId } from "@orb/kit/ids";
import type { CharacterService } from "./service";

/** One authored default card: the `create` input PLUS its author-shipped native tags. The tags are attached
 *  as card/pending suggestions after the card is created (the same model as an imported card's `card.tags`)
 *  — `CreateCharacterInput` carries no tags field (tags are the `character_tags` junction, D28),
 *  so they ride alongside it here. */
export interface SeedCard {
  readonly input: CreateCharacterInput;
  readonly tags: readonly string[];
}

export interface DefaultCharacterSeederDeps {
  /** The real character service — cards go through `create` (audit, the emit, no raw SQL); the seeder's
   *  partial-rerun resolve path uses `findByHandle`. Only those two verbs are needed. */
  readonly characters: Pick<CharacterService, "create" | "findByHandle">;
  /** Attach one of a seeded card's native tags as a card/pending suggestion. Injected (tags live in the
   *  SIBLING `domain/tag` — `domain-no-cross-feature`); the composition root binds it to
   *  `tag.attachCardTagByName` with `source:'card'`, `status:'pending'`. Idempotent + never downgrades. */
  readonly attachCardTag: (args: {
    readonly ownerId: UserId;
    readonly characterId: CharacterId;
    readonly tagName: string;
  }) => Promise<boolean>;
  /** Store this handle's BUNDLED avatar art and return its asset id, or `null` when the pack ships no avatar
   *  for the handle / the store fails. Threaded into the card's `avatarAssetId` at create so the seeded card
   *  is born with art (no post-create relink). Injected (assets is a SIBLING domain + the bundled bytes are an
   *  ENTRY/fs concern — `domain-no-cross-feature`); the composition root wires it over `assets.store` + the
   *  bundled `seed-assets` reader. Optional — absent in unit tests / non-avatar seed contexts (cards seed
   *  avatar-less, exactly as before). */
  readonly storeAvatar?: (principal: Principal, handle: string) => Promise<AssetId | null>;
  /** Seed this seeded character's STARTER gallery (its avatar + a bundled generative piece) so a fresh
   *  library isn't an empty grid. Idempotent (the gallery add is upsert-guarded on `(assetId, subject)`).
   *  Injected (assets sibling + bundled-bytes ENTRY concern); wired over `assets.store` + `assets.addToGallery`.
   *  Optional — absent in unit tests / non-gallery contexts; failures are swallowed by the caller (a gallery
   *  seed never fails the card seed). */
  readonly seedGallery?: (
    principal: Principal,
    characterId: CharacterId,
    handle: string,
  ) => Promise<void>;
  /** Reads `UserSettings.onboarding.defaultCharactersSeeded` for the acting principal. Injected (settings
   *  live in a sibling domain — `domain-no-cross-feature`); the composition root wires the settings read. */
  readonly isSeeded: (principal: Principal) => Promise<boolean>;
  /** Persists the latch + (when the user has none yet) points `seeds.welcomeAssistantCharacterId` at the
   *  seeded Assistant. Never clobbers an explicit existing pick (the composition root enforces that). */
  readonly markSeeded: (
    principal: Principal,
    welcomeAssistantId: CharacterId | null,
  ) => Promise<void>;
}

export interface DefaultCharacterSeeder {
  /** Idempotent + never throws: seed the default card pack for `principal` if the persisted latch isn't set.
   *  Safe on every request — an in-process memo makes the steady-state a Set lookup. */
  readonly ensureSeeded: (principal: Principal) => Promise<void>;
}
