// Shared test harness for the regex domain (NOT a test file — no `.test` suffix, so test-layout ignores
// it). Builds a real-db `RegexContext` with injected determinism (frozen clock + seeded ids) and recording
// FAKE `audit` / `emitUserEvent` ops — the sanctioned "fake at the edges, inject at the root" doctrine
// (testing §3): real injected deps, not internal-module mocks. The fakes RECORD their calls so tests assert
// behaviour (e.g. no audit on a not-found, no emit on an idempotent no-op detach).
//
// The chat-guard ops and the D121-E room-display policy DEFAULT TO THROWING ("not stubbed"), so a test that
// accidentally reaches the chat scope fails loudly instead of silently passing on a permissive fake.

import type { Principal, UserRole } from "@orb/contracts/identity";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { RegexScriptBehavior } from "@orb/contracts/regex";
import { regexScriptBehaviorSchema } from "@orb/contracts/regex";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { Db } from "@orb/db";
import { characters, chats, presets, regexScripts } from "@orb/db";
import type { CharacterHandle, CharacterId, ChatId, Handle, PresetId, RegexScriptId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RegexContext } from "../../../../packages/server/src/domain/regex/context.ts";
import { createFrozenClock, FROZEN_AT_MS } from "../../../support/clock.ts";
import { principal as makePrincipal } from "../../../support/factories/principal.ts";
import { seedUser as seedUserRow } from "../../../support/factories/user.ts";
import { createSeededIds } from "../../../support/ids.ts";

const FROZEN_AT = FROZEN_AT_MS;

interface AuditCall {
  readonly entry: Parameters<RegexContext["audit"]>[0];
  readonly at: number;
}

interface UserEventCall {
  readonly userId: UserId;
  readonly event: UserBusEvent;
}

export interface RegexHarness {
  readonly ctx: RegexContext;
  readonly audits: AuditCall[];
  /** The recorded user-bus emits — assert `regexChanged` fires after a durable write, and NOT on a no-op. */
  readonly userEvents: UserEventCall[];
  /** The recorded ROOM-plane fans (#1733) — assert a chat-arm write announced its room and a library-row
   *  write announced the row, and that a no-op detach announced nothing. */
  readonly roomFans: RoomFanCall[];
  /** Advance the injected frozen clock (ms) — to break createdAt ties for newest-first ordering tests. */
  readonly advance: (ms: number) => void;
}

/** Overridable injected ops. Defaults THROW (the "not stubbed" doctrine); chat-scope tests inject fakes. */
interface HarnessOverrides {
  readonly requireChatHost?: RegexContext["requireChatHost"];
  readonly requireChatMember?: RegexContext["requireChatMember"];
  readonly resolveRoomDisplayPolicy?: RegexContext["resolveRoomDisplayPolicy"];
  readonly resolveVisibleRooms?: RegexContext["resolveVisibleRooms"];
}

/** ONE room-plane fan the harness recorded (#1733) — `{kind}` says which of the two ops raised it, so a test
 *  can assert that a chat-arm write announced ITS room and a library-row write announced every room that
 *  attaches the row. */
interface RoomFanCall {
  readonly kind: "room" | "script";
  readonly id: string;
}

export function makeHarness(db: Db, overrides: HarnessOverrides = {}): RegexHarness {
  const clock = createFrozenClock(FROZEN_AT);
  const ids = createSeededIds();
  const audits: AuditCall[] = [];
  const userEvents: UserEventCall[] = [];
  const roomFans: RoomFanCall[] = [];
  const notStubbed = (): never => {
    throw new Error("RegexContext chat op not stubbed in this test");
  };
  const ctx: RegexContext = {
    db,
    now: (): number => clock.now(),
    newScriptId: (): RegexScriptId => castId<RegexScriptId>(ids.next("regex_script")),
    audit: (entry: AuditCall["entry"], at: number): Promise<void> => {
      audits.push({ entry, at });
      return Promise.resolve();
    },
    requireChatHost: overrides.requireChatHost ?? notStubbed,
    requireChatMember: overrides.requireChatMember ?? notStubbed,
    resolveRoomDisplayPolicy: overrides.resolveRoomDisplayPolicy ?? notStubbed,
    resolveVisibleRooms: overrides.resolveVisibleRooms ?? notStubbed,
    emitRoomRegexChanged: (chatId: ChatId): void => {
      roomFans.push({ kind: "room", id: chatId });
    },
    fanRegexScriptRooms: (scriptId: RegexScriptId): Promise<void> => {
      roomFans.push({ kind: "script", id: scriptId });
      return Promise.resolve();
    },
    emitUserEvent: (userId: UserId, event: UserBusEvent): void => {
      userEvents.push({ userId, event });
    },
  };
  return { ctx, audits, userEvents, roomFans, advance: (ms: number): void => clock.advance(ms) };
}

interface SeedUserOverrides {
  readonly id?: string;
  readonly handle?: Handle;
  readonly role?: UserRole;
}

/** Thin delegate over the canonical factory — regex's call sites want the id back, not the row. */
export async function seedUser(db: Db, overrides: SeedUserOverrides = {}): Promise<UserId> {
  const id = castId<UserId>(overrides.id ?? `user_${overrides.handle ?? "x"}`);
  const seeded = await seedUserRow(db, {
    id,
    handle: castId<Handle>(overrides.handle ?? id),
    role: overrides.role ?? "user",
  });
  return seeded.id;
}

/** A fully-defaulted behavior body with the given find/replace + placements. */
export function behavior(over: Partial<RegexScriptBehavior> = {}): RegexScriptBehavior {
  return regexScriptBehaviorSchema.parse({ findRegex: "a", replaceString: "b", placement: ["AI_OUTPUT"], ...over });
}

interface SeedScriptOverrides {
  readonly id?: string;
  readonly ownerId: UserId;
  readonly name?: string;
  readonly enabled?: boolean;
  readonly behavior?: RegexScriptBehavior;
  readonly createdAt?: number;
  /** The X-16 edit stamp. Defaults to `createdAt` (a never-edited row reads as edited when it was born),
   *  and is spelled EXPLICITLY rather than left to the column default so a fixture never carries wall-clock
   *  time into an assertion (`test-determinism`). */
  readonly updatedAt?: number;
}

/** Seed a library row DIRECTLY (bypassing the verb) — for the read/attach suites that need a fixture, not
 *  a create-path exercise. */
export async function seedScript(db: Db, over: SeedScriptOverrides): Promise<RegexScriptId> {
  const id = castId<RegexScriptId>(over.id ?? "regex_script_seed");
  await db.insert(regexScripts).values({
    id,
    ownerId: over.ownerId,
    name: over.name ?? "seed",
    enabled: over.enabled ?? true,
    behavior: over.behavior ?? behavior(),
    createdAt: over.createdAt ?? FROZEN_AT,
    updatedAt: over.updatedAt ?? over.createdAt ?? FROZEN_AT,
  });
  return id;
}

/** D28 — flat row, no version table. */
export async function seedCharacter(db: Db, ownerId: UserId, key = "c"): Promise<CharacterId> {
  const id = castId<CharacterId>(`character_${key}`);
  await db.insert(characters).values({
    id,
    handle: castId<CharacterHandle>(id),
    ownerId,
    name: "Char",
    description: null,
    avatarAssetId: null,
    contentHash: `content_hash_${key}`,
    createdAt: FROZEN_AT,
  });
  return id;
}

export async function seedPreset(db: Db, ownerId: UserId | null, key = "p"): Promise<PresetId> {
  const id = castId<PresetId>(`preset_${key}`);
  await db.insert(presets).values({ id, ownerId, name: `Preset ${key}`, kind: "roleplay", config: DEFAULT_PROMPT_CONFIG, createdAt: FROZEN_AT });
  return id;
}

/** D18 — no owner column; chat-scope tests gate via the injected fake guards, so no roster rows are needed. */
export async function seedChat(db: Db, key = "c"): Promise<ChatId> {
  const id = castId<ChatId>(`chat_${key}`);
  await db.insert(chats).values({ id, createdAt: FROZEN_AT, updatedAt: FROZEN_AT });
  return id;
}

export function principal(userId: UserId, role: UserRole = "user", handle: Handle = castId<Handle>(userId)): Principal {
  return makePrincipal(userId, { role, handle });
}

/** The permissive chat-guard fake (a present host/member) — chat-scope tests that aren't ABOUT authority. */
export const allowChat = (): Promise<void> => Promise.resolve();
