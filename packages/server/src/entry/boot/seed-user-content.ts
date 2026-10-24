// Graph adapter for D263: select concrete owner factories from the immutable canonical manifest once.
// Settings owns settlement; character/persona/roster own each operation. Boot ordering stays at lifecycle.

import type { Principal } from "@orb/contracts/identity";
import type { SeedManifestItem } from "@orb/default-content";
import type { CharacterHandle, CharacterId, UserId } from "@orb/kit/ids";
import { createCharacterSeedStep } from "#domain/character";
import type { SeedRosterPreset } from "#domain/roster-preset";
import { createRosterSeedStep } from "#domain/roster-preset";
import type { ContentSeedStep, LegacySeedLatches, UserContentSeeder } from "#domain/settings";
import { createUserContentSeeder as createContentSeedPolicy } from "#domain/settings";
import type { Logger } from "#foundation/observability";

export type { UserContentSeeder } from "#domain/settings";

export interface UserContentSeederDeps {
  readonly logger: Logger;
  /** The operator switch (`SEED_CONTENT`); off ⇒ nothing is seeded and nothing is recorded. */
  readonly enabled: () => boolean;
  readonly manifest: readonly SeedManifestItem[];
  readonly now: () => number;
  readonly seededKeys: (userId: UserId) => Promise<ReadonlySet<string>>;
  readonly recordSeeded: (userId: UserId, keys: readonly string[], at: number) => Promise<void>;
  readonly legacyLatches: (principal: Principal) => Promise<LegacySeedLatches>;
  /** Seeds one shipped card; throws on failure. */
  readonly seedCharacter: (principal: Principal, handle: CharacterHandle) => Promise<CharacterId | null>;
  /** Runs the default-persona seeder and answers whether the account now holds its default persona (the persona
   *  seeder creates one only on an automation-started stack; a real first sign-in asks instead). */
  readonly seedPersona: (principal: Principal) => Promise<boolean>;
  readonly findCharacter: (principal: Principal, handle: CharacterHandle) => Promise<CharacterId | null>;
  readonly createRosterPreset: SeedRosterPreset;
}

export function createUserContentSeeder(deps: UserContentSeederDeps): UserContentSeeder {
  const steps = deps.manifest.map((item): ContentSeedStep => {
    switch (item.kind) {
      case "character":
        return {
          key: item.key,
          legacyLatch: "characters",
          seed: createCharacterSeedStep((principal, handle) => deps.seedCharacter(principal, handle), item.handle),
        };
      case "persona":
        return { key: item.key, legacyLatch: "persona", seed: (principal) => deps.seedPersona(principal) };
      case "rosterPreset":
        return {
          key: item.key,
          seed: createRosterSeedStep({
            name: item.name,
            description: item.description,
            characterHandles: item.characters,
            startsGame: item.startsGame,
            findCharacter: (principal, handle) => deps.findCharacter(principal, handle),
            createRosterPreset: (principal, roster) => deps.createRosterPreset(principal, roster),
          }),
        };
      default: {
        const exhaustive: never = item;
        return exhaustive;
      }
    }
  });
  return createContentSeedPolicy({
    logger: deps.logger,
    enabled: () => deps.enabled(),
    steps,
    now: () => deps.now(),
    seededKeys: (userId) => deps.seededKeys(userId),
    recordSeeded: (userId, keys, at) => deps.recordSeeded(userId, keys, at),
    legacyLatches: (principal) => deps.legacyLatches(principal),
  });
}

export interface SeedUserContentDeps {
  /** Shared with the app first-request hook. */
  readonly seeder: UserContentSeeder;
  readonly owner: Principal;
}

/** Seed the deployment owner at boot (idempotent; never throws). */
export async function seedUserContent(deps: SeedUserContentDeps): Promise<void> {
  await deps.seeder.ensureSeeded(deps.owner);
}
