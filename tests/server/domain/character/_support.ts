// Shared test harness for the character domain (NOT a test file — no `.test` suffix, so test-layout ignores
// it). Builds a real-db `CharacterContext` with injected determinism (frozen clock + seeded ids) and
// RECORDING fakes for the cross-feature ops — the sanctioned "fake at the edges, inject at the root"
// doctrine (testing §3): real injected deps, not internal-module mocks. The fakes record their calls so a
// test can assert behaviour (the `character.updated` emit fired; the avatar was reaped; the tag op was
// called per owned character). Seeds the rows the verbs read (users / assets / characters) directly — a test
// fixture may read `users`; the `no-direct-users-read` gate scopes only `packages/server/src/domain`.

import type { DomainEvent } from "@orb/contracts/events";
import type { Principal, UserRole } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { assets, characters, users } from "@orb/db";
import type {
  AssetId,
  CharacterId,
  CharacterSnapshotId,
  ExternalId,
  Handle,
  UserId,
} from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type {
  AttachCardTagOp,
  CharacterContext,
} from "../../../../packages/server/src/domain/character/contract/service.ts";
import { createFrozenClock } from "../../../support/clock.ts";
import { createSeededIds } from "../../../support/ids.ts";

const FROZEN_AT = 1_750_000_000_000;

interface AuditCall {
  readonly entry: Parameters<CharacterContext["audit"]>[0];
  readonly at: number;
}

type TagAttachArgs = Parameters<AttachCardTagOp>[0];

export interface CharacterHarness {
  readonly ctx: CharacterContext;
  readonly audits: AuditCall[];
  readonly events: DomainEvent[];
  readonly reaps: AssetId[][];
  readonly tagAttaches: TagAttachArgs[];
  /** Advance the injected frozen clock (ms) — to break createdAt ties for newest-first ordering tests. */
  readonly advance: (ms: number) => void;
  /** Override the tag-attach port result (default: every call returns `true` = newly attached). */
  setTagAttachResult: (result: boolean) => void;
}

/** Build the CharacterContext over a real db with deterministic + recording fakes. */
export function makeHarness(db: Db): CharacterHarness {
  const clock = createFrozenClock(FROZEN_AT);
  const ids = createSeededIds();
  const audits: AuditCall[] = [];
  const events: DomainEvent[] = [];
  const reaps: AssetId[][] = [];
  const tagAttaches: TagAttachArgs[] = [];
  let tagAttachResult = true;

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
  };

  return {
    ctx,
    audits,
    events,
    reaps,
    tagAttaches,
    advance: (ms: number): void => clock.advance(ms),
    setTagAttachResult: (result: boolean): void => {
      tagAttachResult = result;
    },
  };
}

interface SeedUserOverrides {
  readonly id?: string;
  readonly handle?: string;
  readonly role?: UserRole;
}

/** Insert a `users` row with deterministic defaults; returns its branded id. */
export async function seedUser(db: Db, overrides: SeedUserOverrides = {}): Promise<UserId> {
  const id = castId<UserId>(overrides.id ?? `user_${overrides.handle ?? "x"}`);
  await db.insert(users).values({
    id,
    handle: castId<Handle>(overrides.handle ?? id),
    role: overrides.role ?? "user",
    enabled: true,
    passwordHash: null,
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
  });
  return id;
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
  readonly synthetic?: boolean;
  readonly importedFrom?: string | null;
  readonly importHash?: string | null;
  readonly contentHash?: string;
  readonly avatarAssetId?: AssetId | null;
}

/** Insert a flat `characters` row DIRECTLY (bypassing the service) — for seeding import-provenance /
 *  synthetic / cross-owner rows the CRUD wire can't author. Returns the branded id. */
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
    synthetic: overrides.synthetic ?? false,
    importedFrom: overrides.importedFrom ?? null,
    importHash: overrides.importHash ?? null,
    contentHash: overrides.contentHash ?? "seed_content_hash",
    avatarAssetId: overrides.avatarAssetId ?? null,
    createdAt: FROZEN_AT,
  });
  return id;
}

/** Build a Principal for a given user id + role (cookie-resolved by default). */
export function principal(
  userId: UserId,
  role: UserRole = "user",
  handle: string = userId,
): Principal {
  return {
    userId,
    role,
    handle: castId<Handle>(handle),
    externalId: null as ExternalId | null,
    via: "cookie",
  };
}
