// Idempotent default-user-persona seeder (mirrors the default-character seeder). Called both at boot (the
// deployment owner) and on first authed request (a new user). Idempotency is the persisted latch
// `UserSettings.onboarding.defaultPersonaSeeded` — once true it never re-runs, which is also the
// deletion-respect guard (a deleted default persona isn't resurrected). `ensureSeeded` never throws.

import type { Principal } from "@orb/contracts/identity";
import type { CreatePersonaInput } from "@orb/contracts/persona";
import { errorMessage } from "@orb/kit/error-message";
import type { AssetId, PersonaId, UserId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";

/** The authored default "You" persona — a neutral, editable starting `{{user}}`. Deliberately generic (the
 *  user makes it theirs); the description reads in the first person so it drops into `{{user}}` naturally. */
const DEFAULT_PERSONA: Omit<CreatePersonaInput, "avatarAssetId"> = {
  name: "You",
  title: "Your default persona",
  description:
    "This is you — the person on the other side of the conversation. Edit this description to tell characters who you are: your name, how you speak, what you're like, whatever you want them to react to. Until you do, you're simply {{user}}: curious, present, and here to see where the story goes.",
  starred: true,
};

export interface DefaultPersonaSeederDeps {
  readonly createPersona: (args: {
    readonly principal: Principal;
    readonly input: CreatePersonaInput;
  }) => Promise<{ readonly id: PersonaId }>;
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
    const input: CreatePersonaInput =
      avatarAssetId !== null ? { ...DEFAULT_PERSONA, avatarAssetId } : DEFAULT_PERSONA;
    const created = await deps.createPersona({ principal, input });
    await deps.markSeeded(principal, created.id);
    log.info(
      { userId: principal.userId, personaId: created.id },
      "persona: seeded default persona",
    );
  }

  return {
    ensureSeeded: (principal: Principal): Promise<void> => {
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
          log.error(
            { userId: principal.userId, err: errorMessage(err) },
            "persona: default persona seed failed",
          );
        })
        .finally((): void => {
          inFlight.delete(principal.userId);
        });
      inFlight.set(principal.userId, run);
      return run;
    },
  };
}
