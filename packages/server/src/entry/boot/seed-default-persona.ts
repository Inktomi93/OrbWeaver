// Idempotent default-user-persona seeder (mirrors the default-character seeder). Called both at boot (the
// deployment owner) and on first authed request (a new user). Idempotency is the persisted latch
// `UserSettings.onboarding.defaultPersonaSeeded` — once true it never re-runs, which is also the
// deletion-respect guard (a deleted default persona isn't resurrected). `ensureSeeded` never throws.
//
// THE AUTO-CREATE ARM IS CONDITIONAL (owner ruling, 2026-08-03 — the forced-first-run redesign). Auto-seeding
// a persona is what made the shipped `FirstRunPersonaDialog` dead by construction: its trigger is "the viewer
// owns ZERO personas" (D107 — the ruled trigger; `personaWizardSeen` was deleted as dead), and the per-request
// hook minted Traveler before the client's first `persona.list` could ever return empty. On a REAL stack the
// first sign-in must ASK. But the ask must never fire on a stack an agent or a script boots — every dev regen
// and every e2e stack re-mint would land on a blocking modal — so the auto-create arm stays ON exactly where a
// human is not there to answer: `autoSeedEnabled` (wired at compose to `E2E_HARNESS=on || DEV_SEED=on`, the
// two stamps that mean "this stack was started by automation").
//
// ONE conditional covers BOTH trigger sites (boot-owner + the per-user first authed request) because both
// route through `ensureSeeded` — and it must, or the deployment owner (a real first sign-in too) would be the
// one user who never sees the ask.

import type { Principal } from "@orb/contracts/identity";
import type { CreatePersonaInput } from "@orb/contracts/persona";
import { errorMessage } from "@orb/kit/error-message";
import type { AssetId, PersonaId, UserId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";

/** The authored default persona — a neutral, editable starting `{{user}}`. Deliberately generic (the user
 *  makes it theirs); the description reads in the first person so it drops into `{{user}}` naturally.
 *
 *  THE NAME IS OWNER-RULED COPY, and it is not decorative: this string is what a model receives as `{{user}}`,
 *  so it gets used as a form of address. It was "You" and that produced literal vocatives — "Goodnight, You."
 *  — and it collided with the no-persona DISPLAY fallback, which is itself "You" (owner ruling 2026-07-27,
 *  `entry/compose/rpg.ts` `PLAYER_SEMANTIC_REF`), making "has a persona" and "has none" render identically.
 *  A neutral NOUN reads correctly in the vocative position a model will inevitably put it in.
 *
 *  Renaming it is safe for existing users BY CONSTRUCTION, with no gating code and no backfill: `seed()`
 *  returns early on the persisted `onboarding.defaultPersonaSeeded` latch, so anyone already seeded never
 *  reaches this constant again. (There is no separate "first-run complete" flag — `personaWizardSeen` was
 *  deleted as dead in D107; this latch IS the first-run signal.) */
const DEFAULT_PERSONA: Omit<CreatePersonaInput, "avatarAssetId"> = {
  name: "Traveler",
  title: "Your default persona",
  description:
    "This is you — the person on the other side of the conversation. Edit this description to tell characters who you are: your name, how you speak, what you're like, whatever you want them to react to. Until you do, you're simply {{user}}: curious, present, and here to see where the story goes.",
  starred: true,
};

export interface DefaultPersonaSeederDeps {
  /** Is AUTO-CREATION on for this stack (see the file header)? `false` ⇒ `ensureSeeded` creates nothing and
   *  records nothing — not even the latch — so the zero-personas first-run trigger genuinely holds and the
   *  user names their own `{{user}}`. REQUIRED (never defaulted): a composer that has not decided which kind
   *  of stack it is wiring must not silently get the automation arm. */
  readonly autoSeedEnabled: () => boolean;
  readonly createPersona: (args: { readonly principal: Principal; readonly input: CreatePersonaInput }) => Promise<{ readonly id: PersonaId }>;
  /** Store the bundled "You" avatar art → its asset id, or `null` when the pack ships none / the store fails. */
  readonly storeAvatar: (principal: Principal) => Promise<AssetId | null>;
  readonly isSeeded: (principal: Principal) => Promise<boolean>;
  /** Persists the latch + (when the user has none yet) points seeds.defaultPersonaId/currentPersonaId at
   *  the seeded persona. Never clobbers an explicit existing pick. */
  readonly markSeeded: (principal: Principal, seededPersonaId: PersonaId | null) => Promise<void>;
}

export interface DefaultPersonaSeeder {
  readonly ensureSeeded: (principal: Principal) => Promise<void>;
}

export function createDefaultPersonaSeeder(deps: DefaultPersonaSeederDeps): DefaultPersonaSeeder {
  const log = getLog();
  // Populated only on success — a transient failure retries on the next touch. ASSUMES(single-replica).
  const settled = new Set<UserId>();
  const inFlight = new Map<UserId, Promise<void>>();

  async function seed(principal: Principal): Promise<void> {
    if (await deps.isSeeded(principal)) {
      return;
    }
    const avatarAssetId = await deps.storeAvatar(principal);
    const input: CreatePersonaInput = avatarAssetId !== null ? { ...DEFAULT_PERSONA, avatarAssetId } : DEFAULT_PERSONA;
    const created = await deps.createPersona({ principal, input });
    await deps.markSeeded(principal, created.id);
    log.info({ userId: principal.userId, personaId: created.id }, "persona: seeded default persona");
  }

  return {
    ensureSeeded: (principal: Principal): Promise<void> => {
      // The real-stack arm: no create, no latch, no settings read at all (the FIRST-RUN ASK owns this user).
      // Checked per call, not once at build: the knob is a stack posture, and reading it here keeps the
      // seeder honest under a test that flips it between runs.
      if (!deps.autoSeedEnabled()) {
        return Promise.resolve();
      }
      if (settled.has(principal.userId)) {
        return Promise.resolve();
      }
      const pending = inFlight.get(principal.userId);
      if (pending) {
        return pending;
      }
      const run = seed(principal)
        .then((): void => {
          settled.add(principal.userId);
        })
        .catch((err: unknown): void => {
          log.error({ userId: principal.userId, err: errorMessage(err) }, "persona: default persona seed failed");
        })
        .finally((): void => {
          inFlight.delete(principal.userId);
        });
      inFlight.set(principal.userId, run);
      return run;
    },
  };
}
