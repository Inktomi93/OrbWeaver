// domain/character/contract/seeder — the default-card seeder's typed surface (the §7.4 one-type-home rule:
// a feature's exported types live under contract/, not inside the subsystem that implements them). The
// `seeder/` subsystem (`seed.ts` + `cards.ts`) implements `createDefaultCharacterSeeder` over these.
//
// The seeder is wired by ENTRY (boot + the app first-request hook) over the character front door — it takes
// the constructed `CharacterService` (only `create` + `findByHandle`) and the settings latch ops INJECTED, so
// `domain/character` never imports `domain/settings` (`domain-no-cross-feature`).

import type { Principal } from "@orb/contracts/identity";
import type { CharacterId } from "@orb/kit/ids";
import type { CharacterService } from "./service";

export interface DefaultCharacterSeederDeps {
  /** The real character service — cards go through `create` (audit, the emit, no raw SQL); the seeder's
   *  partial-rerun resolve path uses `findByHandle`. Only those two verbs are needed. */
  readonly characters: Pick<CharacterService, "create" | "findByHandle">;
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
