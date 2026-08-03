// domain/character/seeder/seed — idempotent default-card seeder. Wired at entry/ from two call sites: boot
// (the deployment owner) and first authed request (a new user gets the pack on first touch).
//
// Idempotency has two layers: the persisted latch UserSettings.onboarding.defaultCharactersSeeded (once
// true never re-runs — also the deletion-respect guard), and per-card handle_conflict tolerance (a crash
// mid-run resolves the existing row via findByHandle instead of failing, so the latch always lands valid).
//
// A LATCHED library is not frozen: `onboarding.defaultCharactersPackVersion` stamps WHICH pack it holds, and
// a stamp behind CARD_PACK_VERSION runs the reseed migration (`migratePack`) — the shipped pack's net-new
// cards are created, and a card at a handle a PRIOR pack shipped is re-dressed to the new one ONLY when its
// live content still matches that pack's frozen fixture byte-for-byte (`pack-v1.ts`). An edited card — one
// changed word, one added greeting, a rename — is the user's; it is left untouched and receipted in the log.
// A handle no shipped pack carries (a card a later pack DROPPED, or the user's own) is never even read.
//
// Cards are created through the real CharacterService.create verb (audit log, handle-conflict translation,
// the character.updated emit — no raw SQL). Settings reads/writes go through injected callbacks so this
// file never imports domain/settings.

import type { Principal } from "@orb/contracts/identity";
import { errorMessage } from "@orb/kit/error-message";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import { CHARACTER_HANDLE_CONFLICT, CharacterOperationError } from "../contract/errors.ts";
import type { DefaultCharacterSeeder, DefaultCharacterSeederDeps, SeedCard } from "../contract/seeder.ts";
import { CARD_PACK_VERSION, DEFAULT_CHARACTER_CARDS, WELCOME_ASSISTANT_HANDLE } from "./cards.ts";
import { matchesPriorPack, PRIOR_PACK_CONTENT } from "./pack-v1.ts";

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

  /** The ONE sequential walk of the authored pack, shared by the fresh seed and the migration. Sequential is
   *  load-bearing on BOTH paths: each card's resolve (handle_conflict / findByHandle) depends on the prior
   *  attempt's row state, so a parallel walk could double-create a handle. */
  async function forEachCard(run: (card: SeedCard) => Promise<void>): Promise<void> {
    for (const card of DEFAULT_CHARACTER_CARDS) {
      // biome-ignore lint/performance/noAwaitInLoops: sequential BY DESIGN — see the doc comment above; the pack is ten cards and this runs once per library.
      await run(card);
    }
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

  /** The re-dress: everything `seedCard` + `dressFreshCard` would have done for a fresh card, applied to a
   *  row that is provably still the prior pack's. ONE update carries the content + the presentation (the
   *  create/update split doesn't apply here — `update` accepts both arms), with the bundled art re-stored
   *  through the SAME `storeAvatar` callback a fresh seed uses. A null from `storeAvatar` (no bundled file /
   *  a store hiccup) leaves the existing avatar alone rather than clearing it — the least-destructive arm on
   *  a one-shot migration. Tags re-attach idempotently; a tag the user added is additive and survives. */
  async function redressCard(principal: Principal, card: SeedCard, characterId: CharacterId): Promise<void> {
    const { handle: _handle, ...content } = await createCardInput(principal, card);
    await deps.characters.update({ principal, characterId, input: { ...content, ...card.presentation } });
    await attachTags(principal, card, characterId);
    if (deps.seedGallery !== undefined) {
      await deps.seedGallery(principal, characterId, card.input.handle);
    }
  }

  /** One already-seeded card under a pack bump: re-dress it, or preserve it and say so. Returns whether it
   *  was re-dressed. A missing card read (`getCard` → null, i.e. mid-delete) is treated as "not ours". */
  async function migrateExistingCard(principal: Principal, card: SeedCard, characterId: CharacterId): Promise<boolean> {
    const prior = PRIOR_PACK_CONTENT[card.input.handle];
    const live = prior === undefined ? null : await deps.characters.getCard({ principal, characterId });
    if (prior === undefined || live === null || !matchesPriorPack(live, prior)) {
      log.info({ userId: principal.userId, handle: card.input.handle, characterId }, "character: pack migration preserved a card the user owns");
      return false;
    }
    await redressCard(principal, card, characterId);
    return true;
  }

  /** The reseed migration for a library latched under an older pack. Additive + non-destructive: net-new
   *  cards are created (a card the user separately deleted comes back — the pack-version bump is the intent),
   *  colliding cards are re-dressed only while untouched, and a handle this pack doesn't ship is never read. */
  async function migratePack(principal: Principal): Promise<void> {
    if ((await deps.readPackVersion(principal)) >= CARD_PACK_VERSION) {
      return;
    }

    let added = 0;
    let redressed = 0;
    await forEachCard(async (card): Promise<void> => {
      const existing = await deps.characters.findByHandle({ ownerId: principal.userId, handle: card.input.handle });
      if (existing === null) {
        const outcome = await seedCard(principal, card);
        added += outcome.created ? 1 : 0;
        return;
      }
      redressed += (await migrateExistingCard(principal, card, existing.characterId)) ? 1 : 0;
    });

    // LAST, so a throw anywhere above leaves the old stamp and the next touch retries — the retry is a no-op
    // on everything already migrated (a re-dressed card no longer matches the prior pack's fixture).
    await deps.markPackVersion(principal, CARD_PACK_VERSION);
    log.info(
      { userId: principal.userId, added, redressed, preserved: DEFAULT_CHARACTER_CARDS.length - added - redressed, packVersion: CARD_PACK_VERSION },
      "character: migrated the default card pack",
    );
  }

  async function seed(principal: Principal): Promise<void> {
    if (await deps.isSeeded(principal)) {
      await migratePack(principal);
      return;
    }

    let welcomeAssistantId: CharacterId | null = null;
    let created = 0;
    await forEachCard(async (card): Promise<void> => {
      const outcome = await seedCard(principal, card);
      if (outcome.created) {
        created += 1;
      }
      if (card.input.handle === WELCOME_ASSISTANT_HANDLE) {
        welcomeAssistantId = outcome.id;
      }
    });

    await deps.markSeeded(principal, welcomeAssistantId);
    // A fresh library holds the shipped pack by construction — stamping it here is what keeps the NEXT pack
    // bump's migration off it until there is actually something to migrate.
    await deps.markPackVersion(principal, CARD_PACK_VERSION);
    log.info(
      {
        userId: principal.userId,
        created,
        total: DEFAULT_CHARACTER_CARDS.length,
        welcomeAssistantId,
        packVersion: CARD_PACK_VERSION,
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
