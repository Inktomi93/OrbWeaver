// Shared test harness for the world-info domain (NOT a test file — no `.test` suffix, so test-layout ignores
// it). Builds a real-db `WorldInfoContext` with injected determinism (frozen clock + seeded ids) and a
// recording FAKE `audit` op — the sanctioned "fake at the edges, inject at the root" doctrine (testing §3):
// a real injected dep, not an internal-module mock. The fake RECORDS its calls so tests assert audit
// behaviour (e.g. no audit on a not-found / no-op). Seeds the rows the verbs read (users / characters /
// personas) directly — a test fixture may read `users`; the `no-direct-users-read` gate scopes only
// `packages/server/src/domain`.

import type { Principal, UserRole } from "@orb/contracts/identity";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { Db } from "@orb/db";
import { characters, chats, personas, users } from "@orb/db";
import type {
  CharacterId,
  ChatId,
  ExternalId,
  Handle,
  PersonaId,
  UserId,
  WorldBookId,
  WorldEntryId,
} from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { WorldInfoContext } from "../../../../packages/server/src/domain/world-info/contract/service.ts";
import { createFrozenClock } from "../../../support/clock.ts";
import { createSeededIds } from "../../../support/ids.ts";

const FROZEN_AT = 1_750_000_000_000;

interface AuditCall {
  readonly entry: Parameters<WorldInfoContext["audit"]>[0];
  readonly at: number;
}

interface UserEventCall {
  readonly userId: UserId;
  readonly event: UserBusEvent;
}

export interface WorldInfoHarness {
  readonly ctx: WorldInfoContext;
  readonly audits: AuditCall[];
  /** Chat-scope verbs' bus emissions (PD-30). */
  readonly wiEvents: Parameters<WorldInfoContext["emitWiEvent"]>[0][];
  /** The recorded user-bus `emitUserEvent` calls — assert `worldInfoChanged` fires after a durable write. */
  readonly userEvents: UserEventCall[];
  /** Advance the injected frozen clock (ms) — to break createdAt ties for newest-first ordering tests. */
  readonly advance: (ms: number) => void;
}

/** Overridable injected chat-guard ops (PD-30). Defaults THROW (the "not stubbed" doctrine) so a non-chat
 *  test that accidentally reaches the chat scope fails loudly; chat-scope tests inject their own fakes. */
interface HarnessOverrides {
  readonly requireChatHost?: WorldInfoContext["requireChatHost"];
  readonly requireChatMember?: WorldInfoContext["requireChatMember"];
}

export function makeHarness(db: Db, overrides: HarnessOverrides = {}): WorldInfoHarness {
  const clock = createFrozenClock(FROZEN_AT);
  const ids = createSeededIds();
  const audits: AuditCall[] = [];
  const wiEvents: Parameters<WorldInfoContext["emitWiEvent"]>[0][] = [];
  const userEvents: UserEventCall[] = [];
  const notStubbed = (): never => {
    throw new Error("WorldInfoContext chat-guard op not stubbed in this test");
  };
  const ctx: WorldInfoContext = {
    db,
    now: (): number => clock.now(),
    newBookId: (): WorldBookId => castId<WorldBookId>(ids.next("world_book")),
    newEntryId: (): WorldEntryId => castId<WorldEntryId>(ids.next("world_entry")),
    audit: (entry: AuditCall["entry"], at: number): Promise<void> => {
      audits.push({ entry, at });
      return Promise.resolve();
    },
    requireChatHost: overrides.requireChatHost ?? notStubbed,
    requireChatMember: overrides.requireChatMember ?? notStubbed,
    emitWiEvent: (event): Promise<void> => {
      wiEvents.push(event);
      return Promise.resolve();
    },
    // PD user-bus lane: records the emit so a chat-scope test can assert `worldInfoChanged` fires.
    emitUserEvent: (userId: UserId, event: UserBusEvent): void => {
      userEvents.push({ userId, event });
    },
  };
  return { ctx, audits, wiEvents, userEvents, advance: (ms: number): void => clock.advance(ms) };
}

interface SeedUserOverrides {
  readonly id?: string;
  readonly handle?: string;
  readonly role?: UserRole;
}

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

interface SeedCharacterOverrides {
  readonly id?: string;
  readonly ownerId: UserId;
  readonly name?: string;
  readonly handle?: string;
}

/** D28 — flat row, no version table. */
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
    description: null,
    avatarAssetId: null,
    contentHash: "content_hash_c",
    createdAt: FROZEN_AT,
  });
  return id;
}

/** D18 — no owner column; chat-scope tests gate via the injected fake guards, so no roster rows are needed. */
export async function seedChat(db: Db, key = "c"): Promise<ChatId> {
  const id = castId<ChatId>(`chat_${key}`);
  await db.insert(chats).values({ id, createdAt: FROZEN_AT, updatedAt: FROZEN_AT });
  return id;
}

interface SeedPersonaOverrides {
  readonly id?: string;
  readonly ownerId: UserId;
  readonly name?: string;
}

export async function seedPersona(db: Db, overrides: SeedPersonaOverrides): Promise<PersonaId> {
  const id = castId<PersonaId>(overrides.id ?? "persona_p");
  await db.insert(personas).values({
    id,
    ownerId: overrides.ownerId,
    name: overrides.name ?? "Persona",
    description: "d",
    avatarAssetId: null,
    metadata: null,
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
  });
  return id;
}

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
