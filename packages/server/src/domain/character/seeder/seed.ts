// domain/character/seeder/seed — the idempotent default-card seeder (character.md §8-slot seeder/seed.ts).
//
// Same precedent as the env→OpenRouter credential boot-seed: an idempotent, composition-root-wired seeder
// that gives every user a working starting library instead of an empty drawer. Two call sites, both wired in
// `entry/` over the ONE instance compose constructs:
//   1. BOOT — the deployment owner is seeded once at startup (single-user "it just works").
//   2. FIRST AUTHED REQUEST — `entry/app.ts`'s auth middleware fires `ensureSeeded(principal)` after the
//      Principal resolves, so a NEW user (SSO first login, admin-created local account) gets the pack the
//      moment they first touch the API. An in-process memo + the persisted latch make the steady-state cost
//      a Set lookup.
//
// IDEMPOTENCY — two layers, both load-bearing:
//   • The persisted latch `UserSettings.onboarding.defaultCharactersSeeded` (read via the injected
//     `isSeeded`, written via `markSeeded`). Once true the seed NEVER re-runs, which is also the
//     deletion-respect guard: a user who deletes a default card doesn't get it resurrected on the next boot.
//   • Per-card `handle_conflict` tolerance: if a previous partial run (crash between cards) already created
//     some handles, the rerun skips those and resolves the existing row's id via `findByHandle` instead of
//     failing — so the latch always lands with a valid Assistant id.
//
// Cards are created through the REAL `CharacterService.create` verb (audit log, handle-conflict translation,
// the `character.updated` emit — no raw SQL). `create` requires the acting `Principal` (orbweaver: the verb
// gates on `principal.userId`; neo's `create({userId})` shape is gone), so `ensureSeeded` takes the Principal
// — boot holds the owner Principal, the app hook holds the resolved request Principal. The settings reads/
// writes (`isSeeded`/`markSeeded`) go through injected callbacks so this file never imports `domain/settings`
// (`domain-no-cross-feature`).

import type { Principal } from "@orb/contracts/identity";
import { errorMessage } from "@orb/kit/error-message";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import { CHARACTER_HANDLE_CONFLICT, CharacterOperationError } from "../contract/errors";
import type {
  DefaultCharacterSeeder,
  DefaultCharacterSeederDeps,
  SeedCard,
} from "../contract/seeder";
import { DEFAULT_CHARACTER_CARDS, WELCOME_ASSISTANT_HANDLE } from "./cards";

/** The outcome of seeding one card: its id (null only if a conflict resolved to a now-gone row) + whether
 *  this run actually created it (vs. resolving a prior partial run's existing handle). */
interface CardOutcome {
  readonly id: CharacterId | null;
  readonly created: boolean;
}

export function createDefaultCharacterSeeder(
  deps: DefaultCharacterSeederDeps,
): DefaultCharacterSeeder {
  const log = getLog();
  // In-process fast path: users this process has already verified-or-seeded. Only populated on SUCCESS — a
  // transient failure retries on the next touch instead of being latched out. ASSUMES(single-replica).
  const settled = new Set<UserId>();
  // Same-user concurrency guard: two parallel first requests share one in-flight seed run instead of
  // double-creating (the per-card handle_conflict tolerance would absorb it anyway, but one run is cheaper
  // and keeps the logs clean).
  const inFlight = new Map<UserId, Promise<void>>();

  /** Create one card + attach its native tags as card/pending suggestions, tolerating the partial-rerun
   *  `handle_conflict` (resolve the existing id instead of failing). The tag attach is idempotent + never
   *  downgrades an accepted row, so attaching on a resolved (re-run) id is safe. Any non-conflict create error
   *  rethrows so the latch is NOT set and the next touch retries. */
  async function seedCard(principal: Principal, card: SeedCard): Promise<CardOutcome> {
    let outcome: CardOutcome;
    try {
      const detail = await deps.characters.create({ principal, input: card.input });
      outcome = { id: detail.id, created: true };
    } catch (err) {
      if (!(err instanceof CharacterOperationError) || err.code !== CHARACTER_HANDLE_CONFLICT) {
        throw err;
      }
      const existing = await deps.characters.findByHandle({
        ownerId: principal.userId,
        handle: card.input.handle,
      });
      outcome = { id: existing?.characterId ?? null, created: false };
    }
    if (outcome.id !== null) {
      for (const tagName of card.tags) {
        // biome-ignore lint/performance/noAwaitInLoops: card tags attach sequentially — each is an independent idempotent resolve-or-create-and-attach; the tag lists are short.
        await deps.attachCardTag({ ownerId: principal.userId, characterId: outcome.id, tagName });
      }
    }
    return outcome;
  }

  async function seed(principal: Principal): Promise<void> {
    if (await deps.isSeeded(principal)) {
      return;
    }

    let welcomeAssistantId: CharacterId | null = null;
    let created = 0;
    for (const card of DEFAULT_CHARACTER_CARDS) {
      // biome-ignore lint/performance/noAwaitInLoops: cards seed sequentially — the handle_conflict resolve depends on the prior attempt's row state.
      const outcome = await seedCard(principal, card);
      if (outcome.created) {
        created += 1;
      }
      if (card.input.handle === WELCOME_ASSISTANT_HANDLE) {
        welcomeAssistantId = outcome.id;
      }
    }

    await deps.markSeeded(principal, welcomeAssistantId);
    log.info(
      {
        userId: principal.userId,
        created,
        total: DEFAULT_CHARACTER_CARDS.length,
        welcomeAssistantId,
      },
      "character: seeded default card pack",
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
            "character: default card seed failed",
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
