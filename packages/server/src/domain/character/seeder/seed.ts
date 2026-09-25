// domain/character/seeder/seed — the default-card seeder: seeds ONE shipped card for a user. Which cards an account
// receives, and that a deleted card never comes back, is the seed ledger's job at entry (D263).
//
// A card is created through the real CharacterService.create verb (audit log, handle-conflict translation, the
// character.updated emit — no raw SQL). A handle already taken resolves to the existing row instead of failing.
//
// A HALF-SEEDED CARD IS FINISHED, NOT ABANDONED (#1444). `create` landing while a later step throws leaves a row
// the retry resolves through handle_conflict, i.e. `created: false`; the retry asks whether the row is still
// exactly what we authored and finishes dressing it when it is. An edited card is the user's and is left alone.

import type { Principal } from "@orb/contracts/identity";
import type { ThemeBackground } from "@orb/contracts/theme";
import type { CharacterHandle, CharacterId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import { CHARACTER_HANDLE_CONFLICT, CharacterOperationError } from "../contract/errors.ts";
import type { DefaultCharacterSeeder, DefaultCharacterSeederDeps, SeedCard, SeededCardContent } from "../contract/seeder.ts";
import { matchesAuthoredContent } from "./authored-content.ts";
import { DEFAULT_CHARACTER_CARDS, WELCOME_ASSISTANT_HANDLE } from "./cards.ts";

/** The create input's optional fields land as null when unspecified (`verbs/create.ts#cardFromInput`), and
 *  spelling that as a helper rather than seventeen `??` operators keeps this projection ONE decision. */
function orNull<T>(value: T | null | undefined): T | null {
  return value ?? null;
}

/** THIS pack's authored content for one card, read the way `verbs/create.ts#cardFromInput` stores it (every
 *  unspecified field lands as null) — the resumed-seed test's reference (#1444). */
function authoredCardContent(card: SeedCard): SeededCardContent {
  const input = card.input;
  return {
    name: input.name,
    nickname: orNull(input.nickname),
    description: orNull(input.description),
    personality: orNull(input.personality),
    scenario: orNull(input.scenario),
    greetings: orNull(input.greetings) ?? [],
    exampleMessages: orNull(input.exampleMessages),
    creatorNotes: orNull(input.creatorNotes),
    systemPrompt: orNull(input.systemPrompt),
    postHistoryInstructions: orNull(input.postHistoryInstructions),
    depthPrompt: orNull(input.depthPrompt),
    creator: orNull(input.creator),
    cardVersion: orNull(input.cardVersion),
    source: orNull(input.source),
    creationDate: orNull(input.creationDate),
    modificationDate: orNull(input.modificationDate),
    extensions: orNull(input.extensions),
    residualData: orNull(input.residualData),
  };
}

interface CardOutcome {
  readonly id: CharacterId | null;
  readonly created: boolean;
}

export function createDefaultCharacterSeeder(deps: DefaultCharacterSeederDeps): DefaultCharacterSeeder {
  const log = getLog();

  async function createCardInput(principal: Principal, card: SeedCard): Promise<SeedCard["input"]> {
    if (deps.storeAvatar === undefined) {
      return card.input;
    }
    const avatarAssetId = await deps.storeAvatar(principal, card.input.handle);
    return avatarAssetId !== null ? { ...card.input, avatarAssetId } : card.input;
  }

  async function seedCard(principal: Principal, card: SeedCard): Promise<CardOutcome> {
    let outcome: CardOutcome;
    // @orb-waive caught-failure-ownership(err): narrow rethrow — only a handle-conflict
    // (`CHARACTER_HANDLE_CONFLICT`) is swallowed (treated as "already seeded, look it up"); every other
    // `CharacterOperationError` and any non-domain failure is rethrown below unhandled. Ends if a new caller
    // needs a third outcome besides created/already-exists.
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
      await dressCard(principal, card, outcome.id, true);
    } else if (outcome.id !== null && (await isUnfinishedOwnCard(principal, card, outcome.id))) {
      await dressCard(principal, card, outcome.id, false);
    }
    return outcome;
  }

  /** THE RESUME TEST (#1444): a row at our handle whose every authored field still matches THIS pack is a card a
   *  crashed run left undressed, so we finish it; one edited word makes it the user's. The re-dress is
   *  idempotent (the same presentation write, an upsert-guarded gallery add). A row we cannot read is not ours. */
  async function isUnfinishedOwnCard(principal: Principal, card: SeedCard, characterId: CharacterId): Promise<boolean> {
    const live = await deps.characters.getCard({ principal, characterId });
    return live !== null && matchesAuthoredContent(live, authoredCardContent(card));
  }

  async function attachTags(principal: Principal, card: SeedCard, characterId: CharacterId): Promise<void> {
    for (const tagName of card.tags) {
      await deps.attachCardTag({ ownerId: principal.userId, characterId, tagName });
    }
  }

  /** The card's LOOK for THIS user: the authored theme plus the scene plate resolved into their own owned
   *  asset. The plate is resolved per user rather than carried on the pack because a plate is an owned
   *  `background` asset now, not a static catalog slug (2026-09-18) — `resolveSeededBackground` lifts the
   *  shipped bytes into the caller's CAS and hands back the `kind:"asset"` ref. Unwired or unresolvable ⇒
   *  the card is dressed theme-only, never with a dangling reference. */
  async function presentationFor(principal: Principal, card: SeedCard): Promise<SeedCard["presentation"] & { backgroundOverride?: ThemeBackground }> {
    if (card.backgroundSlug === null || deps.resolveSeededBackground === undefined) {
      return card.presentation;
    }
    const background = await deps.resolveSeededBackground(principal, card.backgroundSlug);
    return background === null ? card.presentation : { ...card.presentation, backgroundOverride: background };
  }

  /** The two post-create steps.
   *  1. PRESENTATION (carried theme + the card's own scene plate): a post-create edit because both fields
   *     live on the UPDATE arm only — the create schema carries neither.
   *  2. The starter gallery.
   *
   *  `force` is FALSE for the resumed-seed arm: a card that already carries a theme or a background chose it.
   *  A freshly created row has nothing to lose, so it is written unconditionally. */
  async function dressCard(principal: Principal, card: SeedCard, characterId: CharacterId, force: boolean): Promise<void> {
    if (force || (await presentationIsUnset(principal, characterId))) {
      await deps.characters.update({ principal, characterId, input: await presentationFor(principal, card) });
    }
    if (deps.seedGallery !== undefined) {
      await deps.seedGallery(principal, characterId, card.input.handle);
    }
  }

  /** Does this card still carry NO look of its own? `kind:"none"` is the schema's own "no image", so it
   *  counts as unset exactly like a null column (`themeBackgroundSchema` heals a malformed blob to it). */
  async function presentationIsUnset(principal: Principal, characterId: CharacterId): Promise<boolean> {
    const detail = await deps.characters.get({ principal, characterId });
    const background = detail.backgroundOverride;
    return detail.themeOverride === null && (background === null || background.kind === "none");
  }

  return {
    seedCard: async (principal: Principal, handle: CharacterHandle): Promise<CharacterId | null> => {
      const card = DEFAULT_CHARACTER_CARDS.find((candidate) => candidate.input.handle === handle);
      if (card === undefined) {
        return null;
      }
      const outcome = await seedCard(principal, card);
      if (outcome.id !== null && handle === WELCOME_ASSISTANT_HANDLE) {
        await deps.markWelcomeAssistant(principal, outcome.id);
      }
      log.info({ userId: principal.userId, handle, characterId: outcome.id, created: outcome.created }, "character: seeded a default card");
      return outcome.id;
    },
  };
}
