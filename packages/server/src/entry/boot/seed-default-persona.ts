// Idempotent default-user-persona seeder (mirrors the default-character seeder). Called both at boot (the
// deployment owner) and on first authed request (a new user). `ensureSeeded` never throws.
//
// IDEMPOTENCY HAS TWO LAYERS (the character seeder's shape — #461 is what it cost to only have one):
//   1. the persisted latch `UserSettings.onboarding.defaultPersonaSeeded` — once true it never re-runs, which
//      is also the DELETION-RESPECT guard (a deleted default persona isn't resurrected);
//   2. `findSeededDefault` — the seeder recognises its OWN artifact (`metadata.seededDefault`) in the library
//      and heals the latch (plus any null `seeds.*` pointer, #1412) instead of minting a second one.
// Layer 2 exists because layer 1 is a value in a settings BLOB and a blob can come back at schema defaults:
// live dev-db receipt 2026-08-22, every `user_settings.config` section byte-identical to
// DEFAULT_USER_SETTINGS 19.4h after a good seed, with zero audited settings writes in between — `isSeeded`
// answered false and a second byte-identical "Traveler" was minted (the character pack survived the identical
// boot untouched, on ITS layer 2: per-card handle-conflict tolerance against the db's own uniqueness).
// Personas carry no unique key by design (same-named personas are supported, #458), so the artifact marker is
// the persona analogue of that handle. Layer 2 is deliberately NOT "the user owns any persona": owning
// UNRELATED personas has never suppressed the seed, and that arm is pinned by its own test.
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
import { DEFAULT_PERSONA_NAME } from "@orb/kit/persona";
import { getLog } from "#foundation/observability";

/** The authored default persona — a neutral, editable starting `{{user}}`. Deliberately generic (the user
 *  makes it theirs), with no description until they write one.
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
 *  deleted as dead in D107; this latch IS the first-run signal.)
 *
 *  THE TITLE IS A DESCRIPTOR, NOT A STATE CLAIM (owner ruling 2026-08-22, #462). It was "Your default
 *  persona" — a sentence that goes FALSE the moment the user defaults any other persona, while still being
 *  displayed: the crown derives from the real `seeds.defaultPersonaId` flag, the title does not, so the two
 *  contradict each other on screen (the 2026-08-03 side-eye ruling killed the row's other two
 *  default-tellings and left this one standing). It is also USER-EDITABLE PROSE, so no backfill may correct
 *  it — the only fix is to author copy that stays true forever. "Your first persona" is a fact about how the
 *  row came to exist, and nothing the user does later can falsify it. Existing rows keep whatever prose they
 *  have: `seed()` returns early on the latch, so a seeded user never reaches this constant again. */
const DEFAULT_PERSONA: Omit<CreatePersonaInput, "avatarAssetId"> = {
  name: DEFAULT_PERSONA_NAME,
  title: "Your first persona",
  // Empty on purpose: the description is what assembly sends for `{{user}}`, so it must never carry an
  // instruction addressed to the person.
  description: "",
  starred: true,
  // The layer-2 artifact marker (file header). Stamped at MINT so the row is self-identifying forever —
  // independent of the name/title copy, which is owner-ruled and moves (#462).
  metadata: { seededDefault: true },
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

export function createDefaultPersonaSeeder(deps: DefaultPersonaSeederDeps): DefaultPersonaSeeder {
  const log = getLog();
  // Populated only on success — a transient failure retries on the next touch. ASSUMES(single-replica).
  const settled = new Set<UserId>();
  const inFlight = new Map<UserId, Promise<void>>();

  async function seed(principal: Principal): Promise<void> {
    if (await deps.isSeeded(principal)) {
      return;
    }
    // LAYER 2: the latch is gone but the artifact is not. Heal the latch (so the next boot short-circuits on
    // layer 1 again) and mint nothing. The surviving row's id IS handed over (#1412): the blob-reset this
    // layer exists for nulls the `seeds.*` pointers too, and `markSeeded` only ever fills a pointer that is
    // already null — so the repair cannot relitigate a pick, and withholding the id was the difference
    // between a healed user and one pointing at nothing forever.
    const survivor = await deps.findSeededDefault(principal);
    if (survivor !== null) {
      await deps.markSeeded(principal, survivor);
      log.info({ userId: principal.userId, personaId: survivor }, "persona: default persona already present — latch healed, nothing seeded");
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
