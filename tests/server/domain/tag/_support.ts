// Shared test harness for the tag domain (NOT a test file — no `.test` suffix, so test-layout ignores it).
// Builds a real-db `TagContext` with the injected determinism seam (seeded ids) + a FAKE injected
// `requireParticipant` (the D30 chat membership gate — the sanctioned "fake at the edges, inject at the root"
// doctrine, testing §3). The fake RECORDS its calls and gates on an allow-set so tests assert both the
// member (allow) and non-member (deny) paths. Seed helpers insert minimal-valid target rows for the five
// junction types.

import type { Principal, UserRole } from "@orb/contracts/identity";
import type { PromptConfig } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import { characters, chats, personas, presets, tags, users, worldBooks } from "@orb/db";
import { DomainForbiddenError } from "@orb/kit/errors";
import type {
  CharacterId,
  ChatId,
  ExternalId,
  Handle,
  PersonaId,
  PresetId,
  TagId,
  UserId,
  WorldBookId,
} from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AuditEntry } from "@orb/server/foundation/observability";
import type { TagContext } from "../../../../packages/server/src/domain/tag/contract/service.ts";
import { createSeededIds } from "../../../support/ids.ts";

/** The harness: the TagContext + recorders/controls for the injected membership-gate fake. */
export interface TagHarness {
  readonly ctx: TagContext;
  /** Mark a chat as one the principal is a participant of (so `requireParticipant` resolves for it). */
  readonly allowChat: (chatId: ChatId) => void;
  /** Every `(chatId)` the gate was asked about — proves the chat junction routes through membership. */
  readonly participantChecks: ChatId[];
  /** Every audit entry the verbs wrote (the recording fake of the root-bound best-effort `logAudit`). */
  readonly audits: AuditEntry[];
}

/** Build a TagContext over a real db: seeded ids + a recording membership-gate fake (default-deny) + a
 *  recording audit fake (tag is clockless — the root binds the timestamp, so the op takes only the entry). */
export function makeTagHarness(db: Db): TagHarness {
  const ids = createSeededIds();
  const allowed = new Set<string>();
  const participantChecks: ChatId[] = [];
  const audits: AuditEntry[] = [];
  const ctx: TagContext = {
    db,
    newTagId: (): TagId => castId<TagId>(ids.next("tag")),
    requireParticipant: (_principal: Principal, chatId: ChatId): Promise<void> => {
      participantChecks.push(chatId);
      return allowed.has(chatId)
        ? Promise.resolve()
        : Promise.reject(new DomainForbiddenError(`not a participant of ${chatId}`));
    },
    audit: (entry: AuditEntry): Promise<void> => {
      audits.push(entry);
      return Promise.resolve();
    },
  };
  return {
    ctx,
    allowChat: (chatId: ChatId): void => {
      allowed.add(chatId);
    },
    participantChecks,
    audits,
  };
}

/** A cookie-resolved Principal for a user id (role defaults to `user` — tags are role-agnostic). */
export function principal(userId: UserId, role: UserRole = "user"): Principal {
  return {
    userId,
    role,
    handle: castId<Handle>(userId),
    externalId: null as ExternalId | null,
    via: "cookie",
  };
}

export async function seedUser(db: Db, id = "user_owner"): Promise<UserId> {
  const userId = castId<UserId>(id);
  await db.insert(users).values({
    id: userId,
    handle: castId<Handle>(id),
    role: "user",
    enabled: true,
    passwordHash: null,
  });
  return userId;
}

/** Insert a `tags` row directly (the persistence-level seed; the verb path is exercised by create tests). */
export async function seedTag(
  db: Db,
  ownerId: UserId,
  overrides: { readonly id?: string; readonly name?: string; readonly sortOrder?: number } = {},
): Promise<TagId> {
  const tagId = castId<TagId>(overrides.id ?? "tag_x");
  await db.insert(tags).values({
    id: tagId,
    ownerId,
    name: overrides.name ?? tagId,
    sortOrder: overrides.sortOrder ?? null,
  });
  return tagId;
}

export async function seedCharacter(
  db: Db,
  ownerId: UserId,
  id = "character_x",
): Promise<CharacterId> {
  const characterId = castId<CharacterId>(id);
  await db.insert(characters).values({
    id: characterId,
    handle: id,
    ownerId,
    contentHash: "hash",
    name: id,
  });
  return characterId;
}

export async function seedChat(db: Db, id = "chat_x"): Promise<ChatId> {
  const chatId = castId<ChatId>(id);
  await db.insert(chats).values({ id: chatId });
  return chatId;
}

export async function seedPersona(db: Db, ownerId: UserId, id = "persona_x"): Promise<PersonaId> {
  const personaId = castId<PersonaId>(id);
  await db.insert(personas).values({ id: personaId, ownerId, name: id, description: "d" });
  return personaId;
}

export async function seedWorldBook(
  db: Db,
  ownerId: UserId,
  id = "world_book_x",
): Promise<WorldBookId> {
  const worldBookId = castId<WorldBookId>(id);
  await db.insert(worldBooks).values({ id: worldBookId, ownerId, name: id });
  return worldBookId;
}

export async function seedPreset(db: Db, ownerId: UserId, id = "preset_x"): Promise<PresetId> {
  const presetId = castId<PresetId>(id);
  await db.insert(presets).values({
    id: presetId,
    ownerId,
    name: id,
    kind: "roleplay",
    config: {} as unknown as PromptConfig,
  });
  return presetId;
}
