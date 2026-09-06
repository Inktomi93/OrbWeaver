// Shared test harness for the character domain (NOT a test file — no `.test` suffix, so test-layout ignores
// it). Builds a real-db `CharacterContext` with injected determinism (frozen clock + seeded ids) and
// RECORDING fakes for the cross-feature ops — the sanctioned "fake at the edges, inject at the root"
// doctrine (testing §3): real injected deps, not internal-module mocks. The fakes record their calls so a
// test can assert behaviour (the `character.updated` emit fired; the avatar was reaped; the tag op was
// called per owned character). Seeds the rows the verbs read (users / assets / characters) directly — a test
// fixture may read `users`; the `no-direct-users-read` gate scopes only `packages/server/src/domain`.

import type { DomainEvent } from "@orb/contracts/events";
import type { Principal, UserRole } from "@orb/contracts/identity";
import type { ProseOverrides } from "@orb/contracts/prose";
import type { MaterializeBackgroundOp } from "@orb/contracts/theme";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { Db } from "@orb/db";
import { assets, characterSummaries, characters, chatParticipants, chats } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import type { AssetId, CharacterHandle, CharacterId, CharacterSnapshotId, ChatId, ChatParticipantId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { CharacterContext } from "../../../../packages/server/src/domain/character/context.ts";
import type { AttachCardTagOp, DetachCardTagOp } from "../../../../packages/server/src/domain/character/contract/service.ts";
import { bumpStatsCanonVersion } from "../../../../packages/server/src/domain/stats/write/apply-delta.ts";
import { createCopyCharacterBooks } from "../../../../packages/server/src/domain/world-info/index.ts";
import { createFrozenClock, FROZEN_AT_MS } from "../../../support/clock.ts";
import { principal as makePrincipal } from "../../../support/factories/principal.ts";
import { seedUser as seedUserRow } from "../../../support/factories/user.ts";
import { createSeededIds } from "../../../support/ids.ts";

const FROZEN_AT = FROZEN_AT_MS;

interface AuditCall {
  readonly entry: Parameters<CharacterContext["audit"]>[0];
  readonly at: number;
}

interface UserEventCall {
  readonly userId: UserId;
  readonly event: UserBusEvent;
}

type TagAttachArgs = Parameters<AttachCardTagOp>[0];
type TagDetachArgs = Parameters<DetachCardTagOp>[0];

export interface CharacterHarness {
  readonly ctx: CharacterContext;
  readonly audits: AuditCall[];
  readonly events: DomainEvent[];
  readonly reaps: AssetId[][];
  /** The recorded `listCharacterSpriteAssets` calls — a READ, so a delete that then refuses has destroyed
   *  nothing (the op used to detach the bindings up front). */
  readonly spriteAssetReads: CharacterId[];
  /** Override the listed sprite assetIds — the set remove folds into the post-delete `reapAssets` call. */
  setSpriteAssetsResult: (ids: readonly AssetId[]) => void;
  readonly tagAttaches: TagAttachArgs[];
  readonly tagDetaches: TagDetachArgs[];
  /** The recorded `emitUserEvent` calls (assert `charactersChanged` fires after a durable write). */
  readonly userEvents: UserEventCall[];
  /** Advance the injected frozen clock (ms) — to break createdAt ties for newest-first ordering tests. */
  readonly advance: (ms: number) => void;
  /** Override the tag-attach port result (default: every call returns `true` = newly attached). */
  setTagAttachResult: (result: boolean) => void;
  /** Override the tag-detach port result (default: every call returns `true` = a row was removed). */
  setTagDetachResult: (result: boolean) => void;
  /** The recorded greeting-studio template resolutions (assert the verb read the caller's template). */
  readonly greetingTemplateCalls: { readonly caller: Principal; readonly kind: "greeting_rewrite" | "greeting_new" }[];
  /** The recorded greeting-studio bounded completions (assert the verb ran ONE, and with what prompt). */
  readonly greetingTextCalls: { readonly caller: Principal; readonly prompt: string }[];
  /** Override the template the resolveGreetingTemplate fake returns (default: `"[TPL {{base}} {{input}}]"`). */
  setGreetingTemplate: (template: string) => void;
  /** Override the {text,costUsd} the generateGreetingText fake returns (default: echoes the prompt). */
  setGreetingText: (result: { readonly text: string; readonly costUsd: number | null }) => void;
  /** Override the caller's preset prose the resolveGreetingTemplate fake returns (default: `{}` = the
   *  shipped slot defaults, i.e. the pre-fork fragment bytes). */
  setGreetingProse: (prose: ProseOverrides) => void;
}

/** Build the CharacterContext over a real db with deterministic + recording fakes. */
export function makeHarness(db: Db, overrides: { readonly materializeBackground?: MaterializeBackgroundOp } = {}): CharacterHarness {
  const clock = createFrozenClock(FROZEN_AT);
  const ids = createSeededIds();
  const audits: AuditCall[] = [];
  const events: DomainEvent[] = [];
  const reaps: AssetId[][] = [];
  const spriteAssetReads: CharacterId[] = [];
  const tagAttaches: TagAttachArgs[] = [];
  const tagDetaches: TagDetachArgs[] = [];
  const userEvents: UserEventCall[] = [];
  let tagAttachResult = true;
  let tagDetachResult = true;
  let spriteAssetsResult: readonly AssetId[] = [];
  const greetingTemplateCalls: { caller: Principal; kind: "greeting_rewrite" | "greeting_new" }[] = [];
  const greetingTextCalls: { caller: Principal; prompt: string }[] = [];
  let greetingTemplate = "[TPL {{base}} {{input}}]";
  let greetingText: { text: string; costUsd: number | null } | null = null;
  // The caller's preset prose overrides (ARM B): the greeting studio's transform fragments are
  // `preset.greetingTransform.*` slots the verb resolves through this op. `{}` = the shipped defaults.
  let greetingProse: ProseOverrides = {};

  const ctx: CharacterContext = {
    db,
    bumpStatsCanonVersion: (batch, opDb, ownerId) => bumpStatsCanonVersion(batch as BatchStmt[], opDb, ownerId),
    now: (): number => clock.now(),
    newCharacterId: (): CharacterId => castId<CharacterId>(ids.next("character")),
    newSnapshotId: (): CharacterSnapshotId => castId<CharacterSnapshotId>(ids.next("character_snapshot")),
    audit: (entry: AuditCall["entry"], at: number): Promise<void> => {
      audits.push({ entry, at });
      return Promise.resolve();
    },
    emit: (event: DomainEvent): void => {
      events.push(event);
    },
    reapAssets: (assetIds: readonly AssetId[]): Promise<void> => {
      reaps.push([...assetIds]);
      return Promise.resolve();
    },
    listCharacterSpriteAssets: (characterId: CharacterId): Promise<readonly AssetId[]> => {
      spriteAssetReads.push(characterId);
      return Promise.resolve(spriteAssetsResult);
    },
    attachCardTag: (args: TagAttachArgs): Promise<boolean> => {
      tagAttaches.push(args);
      return Promise.resolve(tagAttachResult);
    },
    detachCardTag: (args: TagDetachArgs): Promise<boolean> => {
      tagDetaches.push(args);
      return Promise.resolve(tagDetachResult);
    },
    // PD-141: the REAL world-info carry (db-bound, deterministic) so a test can assert junction rows land —
    // faithful to compose, which wires this same persistence factory.
    copyCharacterBooks: createCopyCharacterBooks({ db, now: (): number => clock.now() }),
    // PD user-bus lane: records the emit so a test can assert `charactersChanged` fires after a durable write.
    emitUserEvent: (userId: UserId, event: UserBusEvent): void => {
      userEvents.push({ userId, event });
    },
    // F-P0-2: default refuses (never hit by non-external tests); the external-materialize test injects a stub.
    materializeBackground:
      overrides.materializeBackground ?? ((): ReturnType<MaterializeBackgroundOp> => Promise.resolve({ ok: false, reason: "unreachable" })),
    // Greeting studio (audit §3) — recording fakes: the template resolver records the caller+kind, the
    // completion records the caller+prompt (so a test asserts the owner-gate fired BEFORE any completion,
    // and the prompt carried the resolved template + neutralized base/steer). Default text echoes the prompt.
    resolveGreetingTemplate: ({ caller, kind }): Promise<{ template: string; prose: ProseOverrides }> => {
      greetingTemplateCalls.push({ caller, kind });
      return Promise.resolve({ template: greetingTemplate, prose: greetingProse });
    },
    generateGreetingText: ({ caller, prompt }): Promise<{ text: string; costUsd: number | null }> => {
      greetingTextCalls.push({ caller, prompt });
      return Promise.resolve(greetingText ?? { text: `GEN(${prompt})`, costUsd: null });
    },
  };

  return {
    ctx,
    audits,
    events,
    reaps,
    spriteAssetReads,
    tagAttaches,
    tagDetaches,
    userEvents,
    advance: (ms: number): void => clock.advance(ms),
    setSpriteAssetsResult: (assetIds: readonly AssetId[]): void => {
      spriteAssetsResult = assetIds;
    },
    setTagAttachResult: (result: boolean): void => {
      tagAttachResult = result;
    },
    setTagDetachResult: (result: boolean): void => {
      tagDetachResult = result;
    },
    greetingTemplateCalls,
    greetingTextCalls,
    setGreetingTemplate: (template: string): void => {
      greetingTemplate = template;
    },
    setGreetingText: (result: { text: string; costUsd: number | null }): void => {
      greetingText = result;
    },
    setGreetingProse: (prose: ProseOverrides): void => {
      greetingProse = prose;
    },
  };
}

interface SeedUserOverrides {
  readonly id?: string;
  readonly handle?: Handle;
  readonly role?: UserRole;
}

/** Insert a `users` row with deterministic defaults; returns its branded id. Thin delegate over the
 *  canonical factory — character's call sites want the id back, not the row. */
export async function seedUser(db: Db, overrides: SeedUserOverrides = {}): Promise<UserId> {
  const id = castId<UserId>(overrides.id ?? `user_${overrides.handle ?? "x"}`);
  const seeded = await seedUserRow(db, {
    id,
    handle: castId<Handle>(overrides.handle ?? id),
    role: overrides.role ?? "user",
  });
  return seeded.id;
}

interface SeedAssetOverrides {
  readonly id?: string;
  readonly ownerId: UserId;
  readonly hash?: string;
}

/** Insert an `avatar` asset row; returns its branded id (for the avatar JOIN + reap tests). */
export async function seedAsset(db: Db, overrides: SeedAssetOverrides): Promise<AssetId> {
  const id = castId<AssetId>(overrides.id ?? "asset_a");
  await db.insert(assets).values({
    id,
    ownerId: overrides.ownerId,
    kind: "avatar",
    mime: "image/png",
    size: 1,
    hash: overrides.hash ?? "hash_a",
    uploadedAt: FROZEN_AT,
  });
  return id;
}

interface SeedRawCharacterOverrides {
  readonly id?: string;
  readonly ownerId: UserId;
  readonly handle?: CharacterHandle;
  readonly name?: string;
  readonly starred?: boolean;
  /** The library list's archived axis — seeded raw because the CRUD wire only reaches it through `update`. */
  readonly archived?: boolean;
  readonly synthetic?: boolean;
  readonly importedFrom?: string | null;
  readonly importHash?: string | null;
  /** The card's `creator` — the SHIPPED-provenance marker (#865). The seeded pack stamps
   *  `AUTHORED_CARD_CREATOR`; a raw insert is the only way to author that arm without running the seeder. */
  readonly creator?: string | null;
  readonly contentHash?: string;
  readonly avatarAssetId?: AssetId | null;
  /** Overrides the default frozen instant — the `list` keyset-cursor tests pin exact `(createdAt, id)`
   *  boundaries this way (the CRUD wire always stamps `ctx.now()`, so a raw insert is the only way to
   *  author a deliberate createdAt tie or ordering). */
  readonly createdAt?: number;
  /** The `token_size` denorm — set explicitly to author deliberate `largestCards`/`smallestCards` orderings
   *  + ties (a raw insert bypasses the write-side `cardTokenSize` stamp). Defaults to the column default (0). */
  readonly tokenSize?: number;
  /** Residual `data.extensions` vendor keys — seeded raw to author a plugin's reserved `plugin_<slug>`
   *  card-state key (#1708 backfill fixtures) without running the plugin capability. */
  readonly extensions?: Record<string, unknown> | null;
}

/** Insert a flat `characters` row DIRECTLY (bypassing the service) — for seeding import-provenance /
 *  synthetic / cross-owner / starred rows the CRUD wire can't author. Returns the branded id. */
export async function seedRawCharacter(db: Db, overrides: SeedRawCharacterOverrides): Promise<CharacterId> {
  const id = castId<CharacterId>(overrides.id ?? "character_seed");
  await db.insert(characters).values({
    id,
    handle: overrides.handle ?? castId<CharacterHandle>(id),
    ownerId: overrides.ownerId,
    name: overrides.name ?? "Seed",
    starred: overrides.starred ?? false,
    archived: overrides.archived ?? false,
    synthetic: overrides.synthetic ?? false,
    importedFrom: overrides.importedFrom ?? null,
    importHash: overrides.importHash ?? null,
    creator: overrides.creator ?? null,
    contentHash: overrides.contentHash ?? "seed_content_hash",
    avatarAssetId: overrides.avatarAssetId ?? null,
    createdAt: overrides.createdAt ?? FROZEN_AT,
    ...(overrides.tokenSize !== undefined ? { tokenSize: overrides.tokenSize } : {}),
    ...(overrides.extensions !== undefined ? { extensions: overrides.extensions } : {}),
  });
  return id;
}

/**
 * Seed ONE room this owner is in, with this character seated in it — the source the library list derives
 * `lastChattedAt` + `chatCount` from since #1131 (it used to read the `character_stats` rollup, which is
 * turn economics and counted only a room's FIRST founding character; `seedCharacterStats` went with it).
 *
 * NO MESSAGES, DELIBERATELY: `chatRecencyExpr` is `coalesce(max(selected message.created_at), updated_at)`,
 * so a message-less room's recency IS its `updatedAt` — which makes `recencyAt` the one dial a keyset test
 * needs, without seeding a whole canon chain per row. `startedAt` is stamped (a HUSK is invisible to the
 * library for everyone) and both lenses are open by default; pass them to model the excluded arms.
 */
export async function seedSeatedChat(
  db: Db,
  args: {
    readonly chatId: ChatId;
    readonly ownerId: UserId;
    readonly characterId: CharacterId;
    /** The room's recency — `chats.updatedAt`, which IS the clock for a message-less room. */
    readonly recencyAt: number;
    readonly archived?: boolean;
    readonly temporary?: boolean;
    /** `false` ⇒ a HUSK (`started_at` NULL): a room nobody claimed, hidden from every library. */
    readonly started?: boolean;
    /** `false` ⇒ the owner has LEFT the room (`left_seq` set) — out of her membership scope. */
    readonly present?: boolean;
  },
): Promise<void> {
  await db.insert(chats).values({
    id: args.chatId,
    archived: args.archived ?? false,
    temporary: args.temporary ?? false,
    startedAt: (args.started ?? true) ? args.recencyAt : null,
    createdAt: args.recencyAt,
    updatedAt: args.recencyAt,
  });
  await db.insert(chatParticipants).values({
    id: castId<ChatParticipantId>(`chat_participant_${args.chatId}_human`),
    chatId: args.chatId,
    kind: "human",
    userId: args.ownerId,
    role: "host",
    joinSeq: 0,
    ...((args.present ?? true) ? {} : { leftSeq: 1 }),
  });
  await db.insert(chatParticipants).values({
    id: castId<ChatParticipantId>(`chat_participant_${args.chatId}_${args.characterId}`),
    chatId: args.chatId,
    kind: "character",
    characterId: args.characterId,
    role: "member",
    joinSeq: 0,
  });
}

/** Seed a `character_summaries` distillation row carrying `elevatorPitch` — the FIX-#2 LIST-subtitle denorm
 *  source (LEFT JOINed by the library list). `model` is the only other NOT-NULL column (no default). */
export async function seedCharacterSummary(db: Db, args: { readonly characterId: CharacterId; readonly elevatorPitch: string | null }): Promise<void> {
  await db.insert(characterSummaries).values({
    characterId: args.characterId,
    elevatorPitch: args.elevatorPitch,
    model: "test-summarizer",
  });
}

/** Build a Principal for a given user id + role (cookie-resolved by default). Delegates to the shared
 *  `support/factories/principal` — character keeps its existing positional `(id, role, handle?)` convention. */
export function principal(userId: UserId, role: UserRole = "user", handle: Handle = castId<Handle>(userId)): Principal {
  return makePrincipal(userId, { role, handle });
}
