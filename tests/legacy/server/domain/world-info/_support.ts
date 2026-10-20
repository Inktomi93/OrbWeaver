// Shared test harness for the world-info domain (NOT a test file — no `.test` suffix, so test-layout ignores
// it). Builds a real-db `WorldInfoContext` with injected determinism (frozen clock + seeded ids) and a
// recording FAKE `audit` op — the sanctioned "fake at the edges, inject at the root" doctrine (testing §3):
// a real injected dep, not an internal-module mock. The fake RECORDS its calls so tests assert audit
// behaviour (e.g. no audit on a not-found / no-op). Seeds the rows the verbs read (users / characters /
// personas) directly — a test fixture may read `users`; the `no-direct-users-read` gate scopes only
// `packages/server/src/domain`.

import type { DomainEvent } from "@orb/contracts/events";
import type { Principal, UserRole } from "@orb/contracts/identity";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { Db } from "@orb/db";
import { characters, chats, personas } from "@orb/db";
import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseHandle } from "@orb/db/wiring-driver";
import type { CharacterHandle, CharacterId, ChatId, Handle, PersonaId, UserId, WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createFrozenClock, FROZEN_AT_MS } from "@orb/testkit/iso/clock.ts";
import { createSeededIds } from "@orb/testkit/iso/ids.ts";
import { makeCharacter } from "@orb/testkit/node/factories/character.ts";
import { seedUser as seedUserRow } from "@orb/testkit/node/factories/user.ts";
import type { WorldInfoContext } from "#server/domain/world-info/context.ts";
import { principal as makePrincipal } from "../../../db/schema/_support.ts";

interface AuditCall {
  readonly entry: Parameters<WorldInfoContext["audit"]>[0];
  readonly at: number;
}

interface UserEventCall {
  readonly userId: UserId;
  readonly event: UserBusEvent;
}

export interface WorldInfoHarness {
  readonly ctx: DbAssemblyInput<WorldInfoContext>;
  readonly audits: AuditCall[];
  /** Chat-scope verbs' bus emissions. */
  readonly wiEvents: Parameters<WorldInfoContext["emitWiEvent"]>[0][];
  /** The recorded user-bus `emitUserEvent` calls — assert `worldInfoChanged` fires after a durable write. */
  readonly userEvents: UserEventCall[];
  /** The recorded DOMAIN-event emits — the ROOM plane (entity→room bridge). A CONTENT write owes all three
   *  planes; a test asserting only the user-bus one would pass with the room announcement missing. */
  readonly domainEvents: DomainEvent[];
  /** Advance the injected frozen clock (ms) — to break createdAt ties for newest-first ordering tests. */
  readonly advance: (ms: number) => void;
}

/** Overridable injected chat-guard ops. Defaults THROW (the "not stubbed" doctrine) so a non-chat
 *  test that accidentally reaches the chat scope fails loudly; chat-scope tests inject their own fakes. */
interface HarnessOverrides {
  readonly requireChatHost?: WorldInfoContext["requireChatHost"];
  readonly requireChatMember?: WorldInfoContext["requireChatMember"];
  readonly readInheritedChatBooks?: WorldInfoContext["readInheritedChatBooks"];
  /** The DELETE-residual reach capture (§3.6). A room-plane `removeBook` test injects the REAL
   *  `createDeleteReachCapture(db, spy)["world-info"]` here to assert the seated-room fan. */
  readonly captureRoomReachForDelete?: WorldInfoContext["captureRoomReachForDelete"];
}

export function makeHarness(db: Db, overrides: HarnessOverrides = {}): WorldInfoHarness {
  const clock = createFrozenClock(FROZEN_AT_MS);
  const ids = createSeededIds();
  const audits: AuditCall[] = [];
  const wiEvents: Parameters<WorldInfoContext["emitWiEvent"]>[0][] = [];
  const userEvents: UserEventCall[] = [];
  const domainEvents: DomainEvent[] = [];
  const notStubbed = (): never => {
    throw new Error("WorldInfoContext chat-guard op not stubbed in this test");
  };
  const ctx: DbAssemblyInput<WorldInfoContext> = {
    db: databaseHandle(db),
    now: (): number => clock.now(),
    newBookId: (): WorldBookId => castId<WorldBookId>(ids.next("world_book")),
    newEntryId: (): WorldEntryId => castId<WorldEntryId>(ids.next("world_entry")),
    audit: (entry: AuditCall["entry"], at: number): Promise<void> => {
      audits.push({ entry, at });
      return Promise.resolve();
    },
    requireChatHost: overrides.requireChatHost ?? notStubbed,
    requireChatMember: overrides.requireChatMember ?? notStubbed,
    readInheritedChatBooks: overrides.readInheritedChatBooks ?? notStubbed,
    emitWiEvent: (event): Promise<void> => {
      wiEvents.push(event);
      return Promise.resolve();
    },
    // PD user-bus lane: records the emit so a chat-scope test can assert `worldInfoChanged` fires.
    emitUserEvent: (userId: UserId, event: UserBusEvent): void => {
      userEvents.push({ userId, event });
    },
    // The entity→room bridge's producer side — the THIRD plane (see `WorldInfoContext.emit`).
    emit: (event: DomainEvent): void => {
      domainEvents.push(event);
    },
    // The DELETE-residual reach capture (§3.6). Default = a no-op thunk; a `removeBook` room-plane test injects
    // the real capture via `overrides` to assert the fan to the rooms whose pool read the book.
    captureRoomReachForDelete: overrides.captureRoomReachForDelete ?? ((): Promise<() => void> => Promise.resolve(() => undefined)),
  };
  return { ctx, audits, wiEvents, userEvents, domainEvents, advance: (ms: number): void => clock.advance(ms) };
}

interface SeedUserOverrides {
  readonly id?: string;
  readonly handle?: Handle;
  readonly role?: UserRole;
}

/** Thin delegate over the canonical factory — world-info's call sites want the id back, not the row. */
export async function seedUser(db: Db, overrides: SeedUserOverrides = {}): Promise<UserId> {
  const id = castId<UserId>(overrides.id ?? `user_${overrides.handle ?? "x"}`);
  const seeded = await seedUserRow(db, {
    id,
    handle: castId<Handle>(overrides.handle ?? id),
    role: overrides.role ?? "user",
  });
  return seeded.id;
}

interface SeedCharacterOverrides {
  readonly id?: string;
  readonly ownerId: UserId;
  readonly name?: string;
  readonly handle?: CharacterHandle;
}

/** D28 — flat row, no version table. */
export async function seedCharacter(db: Db, overrides: SeedCharacterOverrides): Promise<CharacterId> {
  const id = castId<CharacterId>(overrides.id ?? "character_c");
  await db.insert(characters).values(
    makeCharacter({
      id,
      handle: overrides.handle ?? castId<CharacterHandle>(id),
      ownerId: overrides.ownerId,
      name: overrides.name ?? "Char",
      description: null,
      avatarAssetId: null,
      createdAt: FROZEN_AT_MS,
    }),
  );
  return id;
}

/** D18 — no owner column; chat-scope tests gate via the injected fake guards, so no roster rows are needed. */
export async function seedChat(db: Db, key = "c"): Promise<ChatId> {
  const id = castId<ChatId>(`chat_${key}`);
  await db.insert(chats).values({ id, createdAt: FROZEN_AT_MS, updatedAt: FROZEN_AT_MS });
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
    createdAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
  });
  return id;
}

/** Resolve a caller's Principal through the production row resolver; a passed role or handle is first written onto the user's row. */
export async function principal(db: Db, userId: UserId, role?: UserRole, handle?: Handle): Promise<Principal> {
  return await makePrincipal({ db }, userId, { role, handle });
}
