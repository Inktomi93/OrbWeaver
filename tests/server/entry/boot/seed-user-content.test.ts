// entry/boot/seed-user-content — the user seed's ledger rules (ADR 0261), over injected fakes: a recorded key is
// never seeded again, a key a later manifest adds reaches an account that already has the rest, the operator
// switch seeds and records nothing, a pre-ledger account's latched kinds are recorded without seeding, and one
// failed item is left unrecorded and retried while the others land.

import type { Principal } from "@orb/contracts/identity";
import type { SeedManifestItem } from "@orb/default-content";
import type { CharacterHandle, CharacterId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { UserContentSeederDeps } from "@orb/server/entry/boot";
import { createUserContentSeeder } from "@orb/server/entry/boot";
import { expect, test } from "../../../support/fixtures.ts";

const ACTOR = { userId: castId<UserId>("user_seed"), role: "owner", handle: castId<Handle>("seed-owner"), externalId: null, via: "header" } satisfies Principal;

const CHARLOTTE: SeedManifestItem = { kind: "character", key: "character:assistant", handle: castId<CharacterHandle>("assistant") };
const NIKO: SeedManifestItem = { kind: "character", key: "character:niko", handle: castId<CharacterHandle>("niko") };
const PERSONA: SeedManifestItem = { kind: "persona", key: "persona:default" };
const PAIR: SeedManifestItem = {
  kind: "rosterPreset",
  key: "roster:pair",
  name: "Pair",
  description: "",
  characters: [castId<CharacterHandle>("assistant"), castId<CharacterHandle>("niko")],
};

interface Fake {
  readonly deps: UserContentSeederDeps;
  readonly ledger: Set<string>;
  readonly seededCharacters: CharacterHandle[];
  readonly rosters: { readonly name: string; readonly characterIds: readonly CharacterId[] }[];
}

function fake(
  manifest: readonly SeedManifestItem[],
  over: { readonly ledger?: readonly string[]; readonly enabled?: boolean; readonly latched?: boolean; readonly failing?: CharacterHandle } = {},
): Fake {
  const ledger = new Set(over.ledger ?? []);
  const seededCharacters: CharacterHandle[] = [];
  const rosters: Fake["rosters"] = [];
  const owned = new Set<CharacterHandle>();
  return {
    ledger,
    seededCharacters,
    rosters,
    deps: {
      enabled: (): boolean => over.enabled ?? true,
      manifest,
      now: (): number => 1,
      seededKeys: (): Promise<ReadonlySet<string>> => Promise.resolve(new Set(ledger)),
      recordSeeded: (_userId, keys): Promise<void> => {
        for (const key of keys) {
          ledger.add(key);
        }
        return Promise.resolve();
      },
      legacyLatches: (): Promise<{ characters: boolean; persona: boolean }> =>
        Promise.resolve({ characters: over.latched ?? false, persona: over.latched ?? false }),
      seedCharacter: (_principal, handle): Promise<CharacterId | null> => {
        if (handle === over.failing) {
          return Promise.reject(new Error("the card store is down"));
        }
        seededCharacters.push(handle);
        owned.add(handle);
        return Promise.resolve(castId<CharacterId>(`character_${handle}`));
      },
      seedPersona: (): Promise<boolean> => Promise.resolve(true),
      findCharacter: (_principal, handle): Promise<CharacterId | null> =>
        Promise.resolve(owned.has(handle) ? castId<CharacterId>(`character_${handle}`) : null),
      createRosterPreset: (_principal, preset): Promise<void> => {
        rosters.push({ name: preset.name, characterIds: preset.characterIds });
        return Promise.resolve();
      },
    },
  };
}

test("a new account gets every manifest item once, and every key is recorded", async () => {
  const f = fake([CHARLOTTE, NIKO, PERSONA, PAIR]);
  await createUserContentSeeder(f.deps).ensureSeeded(ACTOR);
  expect(f.seededCharacters).toEqual(["assistant", "niko"]);
  expect(f.rosters.map((roster) => roster.characterIds)).toEqual([["character_assistant", "character_niko"]]);
  expect([...f.ledger].toSorted()).toEqual([CHARLOTTE.key, NIKO.key, PAIR.key, PERSONA.key].toSorted());
});

test("a recorded item is never seeded again: a character the user deleted stays deleted", async () => {
  const f = fake([CHARLOTTE, NIKO], { ledger: [CHARLOTTE.key, NIKO.key] });
  await createUserContentSeeder(f.deps).ensureSeeded(ACTOR);
  expect(f.seededCharacters).toEqual([]);
});

test("an item a later manifest adds reaches an account that already has the rest", async () => {
  const f = fake([CHARLOTTE, NIKO, PAIR], { ledger: [CHARLOTTE.key] });
  await createUserContentSeeder(f.deps).ensureSeeded(ACTOR);
  expect(f.seededCharacters).toEqual(["niko"]);
  // The roster seats only the characters the account still holds: Charlotte was recorded but is not owned here.
  expect(f.rosters.map((roster) => roster.characterIds)).toEqual([["character_niko"]]);
  expect(f.ledger.has(PAIR.key)).toBe(true);
});

test("the operator switch off seeds nothing and records nothing", async () => {
  const f = fake([CHARLOTTE, PERSONA, PAIR], { enabled: false });
  await createUserContentSeeder(f.deps).ensureSeeded(ACTOR);
  expect(f.seededCharacters).toEqual([]);
  expect(f.rosters).toEqual([]);
  expect(f.ledger.size).toBe(0);
});

test("a pre-ledger account's latched characters and persona are recorded without seeding; new kinds still seed", async () => {
  const f = fake([CHARLOTTE, NIKO, PERSONA, PAIR], { latched: true });
  await createUserContentSeeder(f.deps).ensureSeeded(ACTOR);
  expect(f.seededCharacters).toEqual([]);
  expect(f.ledger.has(CHARLOTTE.key) && f.ledger.has(NIKO.key) && f.ledger.has(PERSONA.key)).toBe(true);
  expect(f.ledger.has(PAIR.key)).toBe(true);
});

test("a failed item is left unrecorded and retried, while the others land", async () => {
  const f = fake([CHARLOTTE, NIKO], { failing: castId<CharacterHandle>("assistant") });
  const seeder = createUserContentSeeder(f.deps);
  await expect(seeder.ensureSeeded(ACTOR)).resolves.toBeUndefined();
  expect(f.ledger.has(CHARLOTTE.key)).toBe(false);
  expect(f.ledger.has(NIKO.key)).toBe(true);
  // The account is not settled, so the next touch retries the failed item and seeds nothing twice.
  await seeder.ensureSeeded(ACTOR);
  expect(f.seededCharacters).toEqual(["niko"]);
});
