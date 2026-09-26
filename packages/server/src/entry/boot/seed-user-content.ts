// The user seed (D263): walks `@orb/default-content`'s manifest for one account and seeds every item the
// account's seed ledger has not recorded, then records it. A deleted item stays deleted because its key is
// recorded; an item a later build adds reaches the account on its next seed. `ensureSeeded` never throws.
//
// Accounts seeded before the ledger carry the old `onboarding` latches instead of ledger rows. On such an
// account's first ledger pass the latched kinds are recorded without seeding, so a card the user deleted
// under the latch is not brought back; only the items those latches never covered are seeded.

import type { Principal } from "@orb/contracts/identity";
import type { RpgGameTemplate } from "@orb/contracts/rpg";
import type { SeedManifestItem } from "@orb/default-content";
import { errorMessage } from "@orb/kit/error-message";
import type { CharacterHandle, CharacterId, UserId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";

/** What an account was already given before the ledger existed. */
interface LegacySeedLatches {
  readonly characters: boolean;
  readonly persona: boolean;
}

export interface UserContentSeederDeps {
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
  readonly createRosterPreset: (
    principal: Principal,
    preset: {
      readonly name: string;
      readonly description: string;
      readonly characterIds: readonly CharacterId[];
      readonly game: RpgGameTemplate | null;
    },
  ) => Promise<void>;
}

export interface UserContentSeeder {
  readonly ensureSeeded: (principal: Principal) => Promise<void>;
}

/** The keys the pre-ledger latches already stand for. */
function latchedKeys(manifest: readonly SeedManifestItem[], latches: LegacySeedLatches): readonly string[] {
  return manifest.flatMap((item) => ((item.kind === "character" && latches.characters) || (item.kind === "persona" && latches.persona) ? [item.key] : []));
}

export function createUserContentSeeder(deps: UserContentSeederDeps): UserContentSeeder {
  const log = getLog();
  // The hook fires on every authed request: an account whose pass settled every item is skipped until the
  // process restarts, which is when a new build's manifest items arrive. Assumes single-replica.
  const settled = new Set<UserId>();
  // Two parallel first requests share one run instead of seeding an item twice.
  const inFlight = new Map<UserId, Promise<void>>();

  /** Seed one item. `true` ⇒ the item is settled for this account and its key may be recorded. */
  async function seedItem(principal: Principal, item: SeedManifestItem): Promise<boolean> {
    switch (item.kind) {
      case "character":
        return (await deps.seedCharacter(principal, item.handle)) !== null;
      case "persona":
        return await deps.seedPersona(principal);
      case "rosterPreset": {
        const found = await Promise.all(item.characters.map((handle) => deps.findCharacter(principal, handle)));
        const characterIds = found.filter((id): id is CharacterId => id !== null);
        // Every seated character is gone (the user deleted them): there is nothing to start, so the item settles
        // without a preset rather than retrying forever.
        if (characterIds.length > 0) {
          // A campaign roster carries rpg's default template (`{}` ⇒ the birth-default ruleset); the manifest
          // package sits below contracts and cannot name a ruleset itself.
          await deps.createRosterPreset(principal, { name: item.name, description: item.description, characterIds, game: item.startsGame ? {} : null });
        }
        return true;
      }
      default: {
        const exhaustive: never = item;
        return exhaustive;
      }
    }
  }

  /** The keys already settled for this account: its ledger, or on its first ledger pass its pre-ledger latches. */
  async function settledKeys(principal: Principal): Promise<ReadonlySet<string>> {
    const seeded = await deps.seededKeys(principal.userId);
    if (seeded.size > 0) {
      return seeded;
    }
    const legacy = latchedKeys(deps.manifest, await deps.legacyLatches(principal));
    await deps.recordSeeded(principal.userId, legacy, deps.now());
    return new Set(legacy);
  }

  /** One pass over the manifest. Resolves `true` when every item is settled for this account. */
  async function seed(principal: Principal): Promise<boolean> {
    const userId = principal.userId;
    const seeded = await settledKeys(principal);
    let complete = true;
    // Sequential, in manifest order: a roster preset seats the characters seeded before it.
    for (const item of deps.manifest) {
      if (seeded.has(item.key)) {
        continue;
      }
      // One item's failure is logged and its key left unrecorded, so the next seed retries it; the others still seed.
      try {
        if (await seedItem(principal, item)) {
          await deps.recordSeeded(userId, [item.key], deps.now());
        }
      } catch (err) {
        complete = false;
        log.error({ userId, key: item.key, err: errorMessage(err) }, "seed: a manifest item failed; it retries on the next seed");
      }
    }
    return complete;
  }

  return {
    ensureSeeded: (principal: Principal): Promise<void> => {
      if (!deps.enabled() || settled.has(principal.userId)) {
        return Promise.resolve();
      }
      const pending = inFlight.get(principal.userId);
      if (pending !== undefined) {
        return pending;
      }
      const run = seed(principal)
        .then((complete): void => {
          if (complete) {
            settled.add(principal.userId);
          }
        })
        .catch((err: unknown): void => {
          log.error({ userId: principal.userId, err: errorMessage(err) }, "seed: the user seed failed");
        })
        .finally((): void => {
          inFlight.delete(principal.userId);
        });
      inFlight.set(principal.userId, run);
      return run;
    },
  };
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
