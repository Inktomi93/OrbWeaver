// Automation-only default-persona seed; settings latches and owned art arrive as injected capabilities.

import type { Principal } from "@orb/contracts/identity";
import type { AssetId, PersonaId } from "@orb/kit/ids";
import type { PersonaService } from "./service.ts";

export interface DefaultPersonaSeederDeps {
  /** Is AUTO-CREATION on for this stack (see the file header)? `false` ⇒ `ensureSeeded` creates nothing and
   *  records nothing — not even the latch — so the zero-personas first-run trigger genuinely holds and the
   *  user names their own `{{user}}`. REQUIRED (never defaulted): a composer that has not decided which kind
   *  of stack it is wiring must not silently get the automation arm. */
  readonly autoSeedEnabled: (principal: Principal) => boolean;
  readonly createPersona: (args: Parameters<PersonaService["create"]>[0]) => Promise<Pick<Awaited<ReturnType<PersonaService["create"]>>, "id">>;
  /** Store the bundled "You" avatar art → its asset id, or `null` when the pack ships none / the store fails. */
  readonly storeAvatar: (principal: Principal) => Promise<AssetId | null>;
  readonly isSeeded: (principal: Principal) => Promise<boolean>;
  /** LAYER 2 (file header): the id of the row this seeder already minted for this user
   *  (`metadata.seededDefault`), or `null`. Consulted only when the latch says "not seeded", and a hit means
   *  HEAL the latch, create nothing. Deliberately narrower than "owns any persona" — an unrelated persona has
   *  never suppressed the seed. It returns the ID rather than a boolean (#1412) because the heal is also the
   *  POINTER REPAIR: the incident this layer exists for is a settings blob that came back at schema defaults,
   *  which nulls `seeds.defaultPersonaId`/`currentPersonaId` alongside the latch, and a heal that latched
   *  without repointing left the user permanently pointing at nothing. */
  readonly findSeededDefault: (principal: Principal) => Promise<PersonaId | null>;
  /** Points seeds.defaultPersonaId/currentPersonaId at the seeded persona where they are still null, THEN
   *  persists the latch. Never clobbers an explicit existing pick (the PICK LAW). The order is the contract:
   *  the latch is written LAST so it means "complete" (#1412) — an interrupted mark leaves the user
   *  re-seedable rather than latched-and-pointerless. */
  readonly markSeeded: (principal: Principal, seededPersonaId: PersonaId) => Promise<void>;
}

export interface DefaultPersonaSeeder {
  readonly ensureSeeded: (principal: Principal) => Promise<void>;
}
