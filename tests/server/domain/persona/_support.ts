// Shared test harness for the persona domain (NOT a test file — no `.test` suffix, so test-layout ignores
// it). Builds a real-db `PersonaContext` with injected determinism (frozen clock + seeded ids) and a
// recording FAKE `audit` op — the sanctioned "fake at the edges, inject at the root" doctrine (testing §3):
// a real injected dep, not an internal-module mock. The fake RECORDS its calls so tests assert audit
// behaviour (e.g. no audit on a not-found / no-op). Seeds the rows the verbs read (users / assets /
// characters / personas) directly — a test fixture may read `users`; the `no-direct-users-read` gate
// scopes only `packages/server/src/domain`.

import type { Principal, UserRole } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { assets, characters, users } from "@orb/db";
import type { AssetId, CharacterId, ExternalId, Handle, PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { PersonaContext } from "../../../../packages/server/src/domain/persona/contract/service.ts";
import { createFrozenClock } from "../../../support/clock.ts";
import { createSeededIds } from "../../../support/ids.ts";

const FROZEN_AT = 1_750_000_000_000;

interface AuditCall {
  readonly entry: Parameters<PersonaContext["audit"]>[0];
  readonly at: number;
}

export interface PersonaHarness {
  readonly ctx: PersonaContext;
  readonly audits: AuditCall[];
  /** Advance the injected frozen clock (ms) — to break createdAt ties for newest-first ordering tests. */
  readonly advance: (ms: number) => void;
}

/** Build the PersonaContext over a real db with deterministic + recording fakes. */
export function makeHarness(db: Db): PersonaHarness {
  const clock = createFrozenClock(FROZEN_AT);
  const ids = createSeededIds();
  const audits: AuditCall[] = [];
  const ctx: PersonaContext = {
    db,
    now: (): number => clock.now(),
    newPersonaId: (): PersonaId => castId<PersonaId>(ids.next("persona")),
    audit: (entry: AuditCall["entry"], at: number): Promise<void> => {
      audits.push({ entry, at });
      return Promise.resolve();
    },
  };
  return { ctx, audits, advance: (ms: number): void => clock.advance(ms) };
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

/** Insert an `avatar` asset row; returns its branded id (for the avatar JOIN tests). */
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

interface SeedCharacterOverrides {
  readonly id?: string;
  readonly ownerId: UserId;
  readonly name?: string;
  readonly description?: string | null;
  readonly avatarAssetId?: AssetId | null;
  readonly handle?: string;
}

/** Insert a flat `characters` row (D28 — no version table); returns its branded id. */
export async function seedCharacter(
  db: Db,
  overrides: SeedCharacterOverrides,
): Promise<CharacterId> {
  const id = castId<CharacterId>(overrides.id ?? "character_c");
  await db.insert(characters).values({
    id,
    handle: overrides.handle ?? id,
    ownerId: overrides.ownerId,
    name: overrides.name ?? "Char",
    description: overrides.description ?? null,
    avatarAssetId: overrides.avatarAssetId ?? null,
    contentHash: "content_hash_c",
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
