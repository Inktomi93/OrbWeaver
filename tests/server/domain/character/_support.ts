// Shared test harness for the character domain (NOT a test file — no `.test` suffix, so test-layout ignores
// it). Builds a real-db `CharacterContext` with injected determinism (frozen clock + seeded ids) and
// RECORDING fakes for the cross-feature ops — the sanctioned "fake at the edges, inject at the root"
// doctrine (testing §3): real injected deps, not internal-module mocks. The fakes record their calls so a
// test can assert behaviour (the `character.updated` emit fired; the avatar was reaped; the tag op was
// called per owned character). Seeds the rows the verbs read (users / assets / characters) directly — a test
// fixture may read `users`; the `no-direct-users-read` gate scopes only `packages/server/src/domain`.

import type { DomainEvent } from "@orb/contracts/events";
import type { Principal, UserRole } from "@orb/contracts/identity";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { Db } from "@orb/db";
import { assets, characterStats, characterSummaries, characters } from "@orb/db";
import type {
  AssetId,
  CharacterId,
  CharacterSnapshotId,
  CharacterStatId,
  Handle,
  UserId,
} from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type {
  AttachCardTagOp,
  CharacterContext,
  DetachCardTagOp,
} from "../../../../packages/server/src/domain/character/contract/service.ts";
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
}

/** Build the CharacterContext over a real db with deterministic + recording fakes. */
export function makeHarness(db: Db): CharacterHarness {
  const clock = createFrozenClock(FROZEN_AT);
  const ids = createSeededIds();
  const audits: AuditCall[] = [];
  const events: DomainEvent[] = [];
  const reaps: AssetId[][] = [];
  const tagAttaches: TagAttachArgs[] = [];
  const tagDetaches: TagDetachArgs[] = [];
  const userEvents: UserEventCall[] = [];
  let tagAttachResult = true;
  let tagDetachResult = true;

  const ctx: CharacterContext = {
    db,
    now: (): number => clock.now(),
    newCharacterId: (): CharacterId => castId<CharacterId>(ids.next("character")),
    newSnapshotId: (): CharacterSnapshotId =>
      castId<CharacterSnapshotId>(ids.next("character_snapshot")),
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
    attachCardTag: (args: TagAttachArgs): Promise<boolean> => {
      tagAttaches.push(args);
      return Promise.resolve(tagAttachResult);
    },
    detachCardTag: (args: TagDetachArgs): Promise<boolean> => {
      tagDetaches.push(args);
      return Promise.resolve(tagDetachResult);
    },
    // PD user-bus lane: records the emit so a test can assert `charactersChanged` fires after a durable write.
    emitUserEvent: (userId: UserId, event: UserBusEvent): void => {
      userEvents.push({ userId, event });
    },
  };

  return {
    ctx,
    audits,
    events,
    reaps,
    tagAttaches,
    tagDetaches,
    userEvents,
    advance: (ms: number): void => clock.advance(ms),
    setTagAttachResult: (result: boolean): void => {
      tagAttachResult = result;
    },
    setTagDetachResult: (result: boolean): void => {
      tagDetachResult = result;
    },
  };
}

interface SeedUserOverrides {
  readonly id?: string;
  readonly handle?: string;
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
  readonly handle?: string;
  readonly name?: string;
  readonly starred?: boolean;
  readonly synthetic?: boolean;
  readonly importedFrom?: string | null;
  readonly importHash?: string | null;
  readonly contentHash?: string;
  readonly avatarAssetId?: AssetId | null;
  /** Overrides the default frozen instant — the `list` keyset-cursor tests pin exact `(createdAt, id)`
   *  boundaries this way (the CRUD wire always stamps `ctx.now()`, so a raw insert is the only way to
   *  author a deliberate createdAt tie or ordering). */
  readonly createdAt?: number;
  /** The `token_size` denorm — set explicitly to author deliberate `largestCards`/`smallestCards` orderings
   *  + ties (a raw insert bypasses the write-side `cardTokenSize` stamp). Defaults to the column default (0). */
  readonly tokenSize?: number;
}

/** Insert a flat `characters` row DIRECTLY (bypassing the service) — for seeding import-provenance /
 *  synthetic / cross-owner / starred rows the CRUD wire can't author. Returns the branded id. */
export async function seedRawCharacter(
  db: Db,
  overrides: SeedRawCharacterOverrides,
): Promise<CharacterId> {
  const id = castId<CharacterId>(overrides.id ?? "character_seed");
  await db.insert(characters).values({
    id,
    handle: overrides.handle ?? id,
    ownerId: overrides.ownerId,
    name: overrides.name ?? "Seed",
    starred: overrides.starred ?? false,
    synthetic: overrides.synthetic ?? false,
    importedFrom: overrides.importedFrom ?? null,
    importHash: overrides.importHash ?? null,
    contentHash: overrides.contentHash ?? "seed_content_hash",
    avatarAssetId: overrides.avatarAssetId ?? null,
    createdAt: overrides.createdAt ?? FROZEN_AT,
    ...(overrides.tokenSize !== undefined ? { tokenSize: overrides.tokenSize } : {}),
  });
  return id;
}

/** Seed a `character_stats` rollup row carrying `lastActivityAt` (+ optional `chats`) — the FIX-#2 `recent`-sort
 *  / `lastChattedAt` denorm source AND the `most/fewestChats` chat-count source (both LEFT JOINed by the
 *  library list). Only the columns the list read projects are meaningful; the rest default (`chats` → 0). Pass
 *  `lastActivityAt: null` to model a stats row that exists but has never chatted. A card with NO stats row at
 *  all (don't call this) is the join-null case both sorts sink to the tail. */
export async function seedCharacterStats(
  db: Db,
  args: {
    readonly characterId: CharacterId;
    readonly lastActivityAt: number | null;
    readonly chats?: number;
  },
): Promise<void> {
  await db.insert(characterStats).values({
    id: castId<CharacterStatId>(`character_stat_${args.characterId}`),
    characterId: args.characterId,
    lastActivityAt: args.lastActivityAt,
    ...(args.chats !== undefined ? { chats: args.chats } : {}),
  });
}

/** Seed a `character_summaries` distillation row carrying `elevatorPitch` — the FIX-#2 LIST-subtitle denorm
 *  source (LEFT JOINed by the library list). `model` is the only other NOT-NULL column (no default). */
export async function seedCharacterSummary(
  db: Db,
  args: { readonly characterId: CharacterId; readonly elevatorPitch: string | null },
): Promise<void> {
  await db.insert(characterSummaries).values({
    characterId: args.characterId,
    elevatorPitch: args.elevatorPitch,
    model: "test-summarizer",
  });
}

/** Build a Principal for a given user id + role (cookie-resolved by default). Delegates to the shared
 *  `support/factories/principal` — character keeps its existing positional `(id, role, handle?)` convention. */
export function principal(
  userId: UserId,
  role: UserRole = "user",
  handle: string = userId,
): Principal {
  return makePrincipal(userId, { role, handle: castId<Handle>(handle) });
}
