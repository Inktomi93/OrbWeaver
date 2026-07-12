// entry/boot/seed-default-persona — the idempotent default-USER-PERSONA seeder (mirrors the default-character
// seeder, PD-32). Every fresh user gets ONE ready-to-use "You" persona (with a bundled on-brand avatar) so a
// new install has a working `{{user}}` identity instead of an empty persona drawer.
//
// TWO call sites, one instance (the SAME shape as `characterSeeder`):
//   1. BOOT — the deployment owner is seeded once at startup (single-user "it just works").
//   2. FIRST AUTHED REQUEST — the app auth middleware fires `ensureSeeded(principal)` after the Principal
//      resolves, so a NEW user (SSO first login, admin-created account) gets the persona on first touch.
//
// IDEMPOTENCY — the persisted latch `UserSettings.onboarding.defaultPersonaSeeded` (read via `isSeeded`,
// written via `markSeeded`). Once true the seed NEVER re-runs, which is also the deletion-respect guard: a user
// who deletes the default persona doesn't get it resurrected on the next boot. An in-process memo makes the
// steady-state cost a Set lookup. `markSeeded` also points `seeds.defaultPersonaId` + `seeds.currentPersonaId`
// at the seeded persona ONLY when the user hasn't already picked one (never clobbers an explicit choice) — the
// exact mirror of `welcomeAssistantCharacterId`.
//
// Persona has no seeder subsystem (unlike character): this is a THIN entry-composition seeder over injected ops
// (persona.create + the settings latch + the bundled-avatar store), which keeps the persona domain unaware of
// both settings (a sibling domain) and the bundled-bytes fs concern (an entry concern). `ensureSeeded` never
// throws — a seed failure logs + retries on the next touch, never aborts boot or a request.

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
  /** Create the persona (the real verb — audit + the emit + ownership gate; requires the Principal). */
  readonly createPersona: (args: {
    readonly principal: Principal;
    readonly input: CreatePersonaInput;
  }) => Promise<{ readonly id: PersonaId }>;
  /** Store the bundled "You" avatar art → its asset id (or `null` when the pack ships none / the store
   *  fails). Threaded into the persona's `avatarAssetId` at create so it's born with art. Injected — assets is
   *  a sibling domain + the bundled bytes are an entry/fs concern (`domain-no-cross-feature`). */
  readonly storeAvatar: (principal: Principal) => Promise<AssetId | null>;
  /** Reads `UserSettings.onboarding.defaultPersonaSeeded` for the acting principal. Injected (settings is a
   *  sibling domain); the composition root wires the settings read. */
  readonly isSeeded: (principal: Principal) => Promise<boolean>;
  /** Persists the latch + (when the user has none yet) points `seeds.defaultPersonaId`/`currentPersonaId` at
   *  the seeded persona. Never clobbers an explicit existing pick (the composition root enforces that). */
  readonly markSeeded: (principal: Principal, seededPersonaId: PersonaId | null) => Promise<void>;
}

export interface DefaultPersonaSeeder {
  /** Idempotent + never throws: seed the default "You" persona for `principal` if the persisted latch isn't
   *  set. Safe on every request — an in-process memo makes the steady-state a Set lookup. */
  readonly ensureSeeded: (principal: Principal) => Promise<void>;
}

export function createDefaultPersonaSeeder(deps: DefaultPersonaSeederDeps): DefaultPersonaSeeder {
  const log = getLog();
  // In-process fast path: users this process already verified-or-seeded. Populated only on SUCCESS (a
  // transient failure retries on the next touch instead of being latched out). ASSUMES(single-replica).
  const settled = new Set<UserId>();
  // Same-user concurrency guard: two parallel first requests share one in-flight run instead of double-seeding.
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
          // Never let a failed seed break request handling or boot — log and retry on the next touch.
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
