// Shared test harness for the persona domain (NOT a test file — no `.test` suffix, so test-layout ignores
// it). Builds a real-db `PersonaContext` with injected determinism (frozen clock + seeded ids) and a
// recording FAKE `audit` op — the sanctioned "fake at the edges, inject at the root" doctrine (testing §3):
// a real injected dep, not an internal-module mock. The fake RECORDS its calls so tests assert audit
// behaviour (e.g. no audit on a not-found / no-op). Seeds the rows the verbs read (users / assets /
// characters / personas) directly — a test fixture may read `users`; the `no-direct-users-read` gate
// scopes only `packages/server/src/domain`.

import type { Principal, UserRole } from "@orb/contracts/identity";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { Db } from "@orb/db";
import { assets, characters } from "@orb/db";
import type { AssetId, CharacterHandle, CharacterId, Handle, PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { PersonaContext } from "../../../../packages/server/src/domain/persona/context.ts";
import { createFrozenClock, FROZEN_AT_MS } from "../../../support/clock.ts";
import { principal as makePrincipal } from "../../../support/factories/principal.ts";
import { seedUser as seedUserRow } from "../../../support/factories/user.ts";
import { createSeededIds } from "../../../support/ids.ts";

const FROZEN_AT = FROZEN_AT_MS;

interface AuditCall {
  readonly entry: Parameters<PersonaContext["audit"]>[0];
  readonly at: number;
}

/** A recorded user-bus emit (PD user-bus lane) — tests assert a persona CRUD verb fired `personasChanged`. */
interface UserEventCall {
  readonly userId: UserId;
  readonly event: UserBusEvent;
}

/** A recorded seed re-point call — `remove` fires it after a delete so the current/default pointer never
 *  dangles (the injected settings write is faked here; the real op lives at `entry/compose/services.ts`). */
interface RepointSeedsCall {
  readonly ownerId: UserId;
  readonly deletedId: PersonaId;
}

export interface PersonaHarness {
  readonly ctx: PersonaContext;
  readonly audits: AuditCall[];
  /** The recorded `emitUserEvent` calls (assert `personasChanged` fires after a durable write). */
  readonly userEvents: UserEventCall[];
  /** The recorded seed re-point calls (assert `remove` re-points the current/default pointer on delete). */
  readonly repointCalls: RepointSeedsCall[];
  /** Advance the injected frozen clock (ms) — to break createdAt ties for newest-first ordering tests. */
  readonly advance: (ms: number) => void;
}

/** Build the PersonaContext over a real db with deterministic + recording fakes. */
export function makeHarness(db: Db, overrides: Partial<PersonaContext> = {}): PersonaHarness {
  const clock = createFrozenClock(FROZEN_AT);
  const ids = createSeededIds();
  const audits: AuditCall[] = [];
  const userEvents: UserEventCall[] = [];
  const repointCalls: RepointSeedsCall[] = [];
  const ctx: PersonaContext = {
    db,
    now: (): number => clock.now(),
    newPersonaId: (): PersonaId => castId<PersonaId>(ids.next("persona")),
    audit: (entry: AuditCall["entry"], at: number): Promise<void> => {
      audits.push({ entry, at });
      return Promise.resolve();
    },
    emitUserEvent: (userId: UserId, event: UserBusEvent): void => {
      userEvents.push({ userId, event });
    },
    requireChatAuthorOrHost: () => Promise.resolve(),
    setChatActivePersona: () => Promise.resolve(),
    repointSeedsAfterPersonaDelete: (ownerId: UserId, deletedId: PersonaId): Promise<void> => {
      repointCalls.push({ ownerId, deletedId });
      return Promise.resolve();
    },
    ...overrides,
  };
  return {
    ctx,
    audits,
    userEvents,
    repointCalls,
    advance: (ms: number): void => clock.advance(ms),
  };
}

interface SeedUserOverrides {
  readonly id?: string;
  readonly handle?: Handle;
  readonly role?: UserRole;
}

/** Insert a `users` row with deterministic defaults; returns its branded id. Thin delegate over the
 *  canonical factory — persona's call sites want the id back, not the row. */
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
  readonly handle?: CharacterHandle;
}

/** Insert a flat `characters` row (D28 — no version table); returns its branded id. */
export async function seedCharacter(db: Db, overrides: SeedCharacterOverrides): Promise<CharacterId> {
  const id = castId<CharacterId>(overrides.id ?? "character_c");
  await db.insert(characters).values({
    id,
    handle: overrides.handle ?? castId<CharacterHandle>(id),
    ownerId: overrides.ownerId,
    name: overrides.name ?? "Char",
    description: overrides.description ?? null,
    avatarAssetId: overrides.avatarAssetId ?? null,
    contentHash: "content_hash_c",
    createdAt: FROZEN_AT,
  });
  return id;
}

/** Build a Principal for a given user id + role (cookie-resolved by default). Delegates to the shared
 *  `support/factories/principal` — persona keeps its existing positional `(id, role, handle?)` convention. */
export function principal(userId: UserId, role: UserRole = "user", handle: Handle = castId<Handle>(userId)): Principal {
  return makePrincipal(userId, { role, handle });
}
