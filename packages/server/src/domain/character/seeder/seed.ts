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
// THE MIGRATION WRITES ONLY WHAT IT PROVED IS STILL OURS (#1443). For CONTENT the proof is the frozen
// fixture, and the compared set and the written set are now ONE type (`SeededCardContent`) so they cannot
// drift apart again. The avatar and the carried presentation have no fixture — they are install-specific —
// so their proof is ABSENCE: the pack's art fills an empty avatar and never replaces one, and its theme
// lands only on a card carrying no look of its own. A v1 row has neither by construction, so an untouched
// install still receives the new pack's face; an avatar-only or theme-only edit is no longer destroyed.
//
// A HALF-SEEDED CARD IS FINISHED, NOT ABANDONED (#1444). `create` landing while a later step throws leaves a
// row that the retry resolves through handle_conflict, i.e. `created: false`; dressing gated on `created`
// alone left that card permanently without its presentation and gallery while the pack latched. The retry now
// asks the SAME question the migration asks — is this row still exactly what we authored? — and finishes it
// when the answer is yes.
//
// Cards are created through the real CharacterService.create verb (audit log, handle-conflict translation,
// the character.updated emit — no raw SQL). Settings reads/writes go through injected callbacks so this
// file never imports domain/settings.

import type { Principal } from "@orb/contracts/identity";
import type { ThemeBackground } from "@orb/contracts/theme";
import { errorMessage } from "@orb/kit/error-message";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import { CHARACTER_HANDLE_CONFLICT, CharacterOperationError } from "../contract/errors.ts";
import type { DefaultCharacterSeeder, DefaultCharacterSeederDeps, SeedCard, SeededCardContent } from "../contract/seeder.ts";
import { CARD_PACK_VERSION, DEFAULT_CHARACTER_CARDS, WELCOME_ASSISTANT_HANDLE } from "./cards.ts";
import { matchesAuthoredContent, PRIOR_PACK_CONTENT } from "./pack-v1.ts";

/** THIS pack's authored content for one card, in the untouched-oracle's shape — the create INPUT read the
 *  way `verbs/create.ts#cardFromInput` will store it (every unspecified field lands as null). The frozen
 *  `pack-v1.ts` fixture is the same record for a pack whose source no longer exists; this one is derived
 *  because the source IS right here, and a hand-copy would be the drift that fixture's header warns about.
 *  Used by the resumed-seed reconciliation (#1444) to tell a half-dressed card of OURS from the user's own
 *  card at the same handle. */
/** The create input's optional fields land as null when unspecified (`verbs/create.ts#cardFromInput`), and
 *  spelling that as a helper rather than seventeen `??` operators keeps this projection ONE decision. */
function orNull<T>(value: T | null | undefined): T | null {
  return value ?? null;
}

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

  /** THE RESUME TEST (#1444). A card that resolved through the handle_conflict arm is usually the user's own
   *  row at our handle — but it is ALSO what a crashed prior run leaves behind: `create` landed, then tags or
   *  the presentation edit threw, `ensureSeeded` swallowed it, and the latch never landed. On the retry that
   *  row resolves `created: false`, and gating the dressing on `created` alone left it permanently
   *  under-dressed — no theme, no background, no starter gallery — while the pack latched as a whole.
   *
   *  The evidence available is the row's CONTENT: a card whose every authored field still matches THIS pack
   *  byte-for-byte is ours and unfinished, so we finish it; one single edited word makes it the user's and it
   *  is left alone (the migration's rule, applied to the shipped pack instead of a prior one). The re-dress it
   *  buys is idempotent by construction — the presentation `update` writes the same values a completed seed
   *  wrote, and `addToGallery` is upsert-guarded — so a row that was ALREADY dressed pays one no-op write
   *  rather than needing a fourth state to distinguish. A row we cannot read (mid-delete) is not ours. */
  async function isUnfinishedOwnCard(principal: Principal, card: SeedCard, characterId: CharacterId): Promise<boolean> {
    const live = await deps.characters.getCard({ principal, characterId });
    return live !== null && matchesAuthoredContent(live, authoredCardContent(card));
  }

  /** The ONE sequential walk of the authored pack, shared by the fresh seed and the migration. Sequential is
   *  load-bearing on BOTH paths: each card's resolve (handle_conflict / findByHandle) depends on the prior
   *  attempt's row state, so a parallel walk could double-create a handle. */
  async function forEachCard(run: (card: SeedCard) => Promise<void>): Promise<void> {
    for (const card of DEFAULT_CHARACTER_CARDS) {
      await run(card);
    }
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
   *  2. The starter gallery — failures are swallowed by the caller so a gallery seed never breaks the seed.
   *
   *  `force` is FALSE for every row this seeder did not just create (the resumed-seed arm and the pack
   *  migration): a card that already carries a theme or a background chose it, and the shipped pack does not
   *  get to replace a look the user picked. A freshly created row has nothing to lose, so it is written
   *  unconditionally — one code path, one difference, stated. */
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

  /** The re-dress of a row that is provably still the prior pack's. EVERY FIELD IT WRITES IS ONE IT PROVED
   *  IS STILL OURS (#1443) — that proof is the whole licence, and the three fields have three different
   *  proofs:
   *
   *  · CONTENT — compared byte-for-byte against the prior pack's frozen fixture by the caller
   *    ({@link migrateExistingCard}), over the whole of `SeededCardContent`, which is exactly this field set.
   *    `handle` is dropped: row identity, never content.
   *  · The AVATAR — an install-specific asset id no frozen fixture can name, so the only provable state is
   *    ABSENCE: the pack's art fills an EMPTY avatar and never replaces one. The old redress re-stored the
   *    new art over whatever was there (and, with no `storeAvatar` wired, wrote `null` — CLEARING it), which
   *    destroyed an avatar-only edit silently.
   *  · The PRESENTATION — written only onto a card carrying no look of its own ({@link dressCard}'s
   *    unforced arm). A v1 row has none by construction (the v1 pack authored neither override), so an
   *    untouched card still receives the new pack's theme; a card the user themed keeps it.
   *
   *  Tags re-attach idempotently (a tag the user added is additive and survives). */
  async function redressCard(principal: Principal, card: SeedCard, characterId: CharacterId, liveAvatarAssetId: string | null): Promise<void> {
    const { handle: _handle, avatarAssetId: _authoredAvatar, ...content } = card.input;
    // The art is STORED only when there is an empty slot to fill — a card that already has a face pays no
    // CAS write, and `avatarAssetId` is OMITTED from the patch rather than sent as the authored `null`
    // (which the update arm reads as "clear it").
    const storedAvatar = liveAvatarAssetId === null ? ((await createCardInput(principal, card)).avatarAssetId ?? null) : null;
    await deps.characters.update({ principal, characterId, input: storedAvatar === null ? content : { ...content, avatarAssetId: storedAvatar } });
    await attachTags(principal, card, characterId);
    await dressCard(principal, card, characterId, false);
  }

  /** One already-seeded card under a pack bump: re-dress it, or preserve it and say so. Returns whether it
   *  was re-dressed. A missing card read (`getCard` → null, i.e. mid-delete) is treated as "not ours". */
  async function migrateExistingCard(principal: Principal, card: SeedCard, characterId: CharacterId): Promise<boolean> {
    const prior = PRIOR_PACK_CONTENT[card.input.handle];
    const live = prior === undefined ? null : await deps.characters.getCard({ principal, characterId });
    if (prior === undefined || live === null || !matchesAuthoredContent(live, prior)) {
      log.info({ userId: principal.userId, handle: card.input.handle, characterId }, "character: pack migration preserved a card the user owns");
      return false;
    }
    await redressCard(principal, card, characterId, live.avatarAssetId);
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
