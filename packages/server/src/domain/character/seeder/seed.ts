// domain/character/seeder/seed — idempotent default-card seeder. Wired at entry/ from two call sites: boot
// (the deployment owner) and first authed request (a new user gets the pack on first touch).
//
// Idempotency has two layers: the persisted latch UserSettings.onboarding.defaultCharactersSeeded (once
// true never re-runs — also the deletion-respect guard), and per-card handle_conflict tolerance (a crash
// mid-run resolves the existing row via findByHandle instead of failing, so the latch always lands valid).
//
// Cards are created through the real CharacterService.create verb (audit log, handle-conflict translation,
// the character.updated emit — no raw SQL). Settings reads/writes go through injected callbacks so this
// file never imports domain/settings.

import type { Principal } from "@orb/contracts/identity";
import { errorMessage } from "@orb/kit/error-message";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import { CHARACTER_HANDLE_CONFLICT, CharacterOperationError } from "../contract/errors";
import type { DefaultCharacterSeeder, DefaultCharacterSeederDeps, SeedCard } from "../contract/seeder";
import { DEFAULT_CHARACTER_CARDS, WELCOME_ASSISTANT_HANDLE } from "./cards";

interface CardOutcome {
  readonly id: CharacterId | null;
  readonly created: boolean;
}

export function createDefaultCharacterSeeder(deps: DefaultCharacterSeederDeps): DefaultCharacterSeeder {
  const log = getLog();
  // Only populated on success — a transient failure retries on the next touch. Assumes single-replica.
  const settled = new Set<UserId>();
  // Two parallel first requests share one in-flight seed run instead of double-creating.
  const inFlight = new Map<UserId, Promise<void>>();

  async function createCardInput(principal: Principal, card: SeedCard): Promise<SeedCard["input"]> {
    if (deps.storeAvatar === undefined) {
      return card.input;
    }
    const avatarAssetId = await deps.storeAvatar(principal, card.input.handle);
    return avatarAssetId !== null ? { ...card.input, avatarAssetId } : card.input;
  }

  async function seedCard(principal: Principal, card: SeedCard): Promise<CardOutcome> {
    let outcome: CardOutcome;
    try {
      const input = await createCardInput(principal, card);
      const detail = await deps.characters.create({ principal, input });
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
      await attachTags(principal, card, outcome.id);
    }
    if (outcome.created && outcome.id !== null) {
      await dressFreshCard(principal, card, outcome.id);
    }
    return outcome;
  }

  async function attachTags(principal: Principal, card: SeedCard, characterId: CharacterId): Promise<void> {
    for (const tagName of card.tags) {
      // biome-ignore lint/performance/noAwaitInLoops: card tags attach sequentially — each is an independent idempotent resolve-or-create-and-attach; the tag lists are short.
      await deps.attachCardTag({ ownerId: principal.userId, characterId, tagName });
    }
  }

  /** The two FRESHLY-CREATED-ONLY steps. A card resolved through the handle_conflict arm is a row the user
   *  already owns (a partial prior run, or their own card at that handle) — re-dressing it would stomp their
   *  edits, so both steps are gated on `created`.
   *  1. PRESENTATION (carried theme + seeded background): a post-create edit because both fields live on the
   *     UPDATE arm only — the create schema carries neither.
   *  2. The starter gallery — failures are swallowed by the caller so a gallery seed never breaks the seed. */
  async function dressFreshCard(principal: Principal, card: SeedCard, characterId: CharacterId): Promise<void> {
    await deps.characters.update({ principal, characterId, input: card.presentation });
    if (deps.seedGallery !== undefined) {
      await deps.seedGallery(principal, characterId, card.input.handle);
    }
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
          log.error({ userId: principal.userId, err: errorMessage(err) }, "character: default card seed failed");
        })
        .finally((): void => {
          inFlight.delete(principal.userId);
        });
      inFlight.set(principal.userId, run);
      return run;
    },
  };
}
