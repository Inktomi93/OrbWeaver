// Shared test harness for the export domain (NOT a test file — no `.test` suffix, so test-layout ignores
// it). Builds a real-db `ExportContext` with FAKE infra edges (the "fake at the edges, inject at the root"
// doctrine, testing §3): an in-memory `cas` (records reads; ENOENT for an absent blob) and a recording
// `imageTransform` (returns a real PNG so `writeCardChunk` accepts it). Both are real injected ports, not
// internal-module mocks. Seeds the rows the verb reads (users / characters / assets / world books+entries /
// character_books / tags / character_tags) directly — a test fixture may read/insert `users`; the
// `no-direct-users-read` gate scopes only `packages/server/src/domain`.

import { Buffer } from "node:buffer";
import type { CardDepthPrompt } from "@orb/contracts/character";
import type { Principal, UserRole } from "@orb/contracts/identity";
import type { RegexScript } from "@orb/contracts/regex";
import type { TagStatus } from "@orb/contracts/tag";
import type { EntryMetadata } from "@orb/contracts/world-info";
import type { Db } from "@orb/db";
import {
  assets,
  characterBooks,
  characters,
  characterTags,
  tags,
  users,
  worldBooks,
  worldEntries,
} from "@orb/db";
import type {
  AssetId,
  CharacterId,
  ExternalId,
  Handle,
  TagId,
  UserId,
  WorldBookId,
  WorldEntryId,
} from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ExportContext } from "../../../../packages/server/src/domain/export/contract/service.ts";

const FROZEN_AT = 1_750_000_000_000;

// An 8×8 PNG (distinct from the 256×256 placeholder) — a real, decodable PNG so `writeCardChunk` accepts
// it as a base image; being distinct lets a test prove the AVATAR (not the placeholder) was embedded.
// biome-ignore format: keep the blob on one line so the noSecrets suppression attaches to it.
// biome-ignore lint/security/noSecrets: a base64-encoded 8×8 PNG, not a credential.
const AVATAR_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGM4ISeHFTEMLQkAkL9BAbKfPiIAAAAASUVORK5CYII=";

/** A real 8×8 PNG used as a stand-in avatar blob in tests. */
export const AVATAR_PNG: Uint8Array = new Uint8Array(Buffer.from(AVATAR_PNG_BASE64, "base64"));

interface TransformCall {
  readonly bytes: Uint8Array;
  readonly format: string | undefined;
}

export interface ExportHarness {
  readonly ctx: ExportContext;
  /** Seed a blob into the in-memory CAS under `(ownerId, hash)`. */
  readonly putBlob: (ownerId: UserId, hash: string, bytes: Uint8Array) => void;
  /** The `(ownerId:hash)` keys `cas.read` was called with — asserts the single-read TOCTOU pattern. */
  readonly reads: string[];
  /** Recorded `imageTransform` calls — asserts the transcode path fires only for a non-PNG avatar. */
  readonly transforms: TransformCall[];
}

const enoent = (): Error => Object.assign(new Error("blob not found"), { code: "ENOENT" });
const unused = (): never => {
  throw new Error("export tests do not exercise this CAS method");
};

/** Build the ExportContext over a real db with an in-memory CAS + a recording imageTransform fake. */
export function makeHarness(db: Db): ExportHarness {
  const blobs = new Map<string, Uint8Array>();
  const reads: string[] = [];
  const transforms: TransformCall[] = [];
  const key = (ownerId: UserId, hash: string): string => `${ownerId}:${hash}`;

  const cas: ExportContext["cas"] = {
    read: (ownerId: UserId, hash: string): Promise<Uint8Array> => {
      reads.push(key(ownerId, hash));
      const bytes = blobs.get(key(ownerId, hash));
      return bytes === undefined ? Promise.reject(enoent()) : Promise.resolve(bytes);
    },
    putBytes: unused,
    blobPath: unused,
    exists: unused,
    verify: unused,
    remove: unused,
    listHashes: () => unused(),
    listOwners: () => unused(),
  };

  const imageTransform: ExportContext["imageTransform"] = (bytes, opts) => {
    transforms.push({ bytes, format: opts?.format });
    // Return a real PNG (the 1×1) so the transcoded result is a valid base for writeCardChunk.
    return Promise.resolve(AVATAR_PNG);
  };

  return {
    ctx: { db, cas, imageTransform },
    putBlob: (ownerId, hash, bytes): void => {
      blobs.set(key(ownerId, hash), bytes);
    },
    reads,
    transforms,
  };
}

interface SeedUserOverrides {
  readonly handle?: string;
  readonly role?: UserRole;
}

/** Insert a `users` row with deterministic defaults; returns its branded id. */
export async function seedUser(db: Db, overrides: SeedUserOverrides = {}): Promise<UserId> {
  const handle = overrides.handle ?? "x";
  const id = castId<UserId>(`user_${handle}`);
  await db.insert(users).values({
    id,
    handle: castId<Handle>(handle),
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
  readonly mime?: string;
}

/** Insert an avatar `assets` row; returns its branded id (for the avatar JOIN + CAS read). */
export async function seedAsset(db: Db, overrides: SeedAssetOverrides): Promise<AssetId> {
  const id = castId<AssetId>(overrides.id ?? "asset_a");
  await db.insert(assets).values({
    id,
    ownerId: overrides.ownerId,
    kind: "avatar",
    mime: overrides.mime ?? "image/png",
    size: 1,
    hash: overrides.hash ?? "hash_a",
    uploadedAt: FROZEN_AT,
  });
  return id;
}

// Card-content overrides default to null/[]; `ownerId` is required, the rest are the live-card columns. Keys
// are actual column names, so overrides spread directly over the defaults (drizzle insert).
interface SeedCharacterOverrides {
  readonly id?: string;
  readonly handle?: string;
  readonly ownerId: UserId;
  readonly name?: string;
  readonly description?: string | null;
  readonly personality?: string | null;
  readonly scenario?: string | null;
  readonly greetings?: string[];
  readonly exampleMessages?: string | null;
  readonly systemPrompt?: string | null;
  readonly postHistoryInstructions?: string | null;
  readonly creatorNotes?: string | null;
  readonly creator?: string | null;
  readonly cardVersion?: string | null;
  readonly regexScripts?: RegexScript[];
  readonly extensions?: Record<string, unknown> | null;
  readonly depthPrompt?: CardDepthPrompt | null;
  readonly avatarAssetId?: AssetId | null;
}

/** Insert a flat `characters` row (D28 — no version table); returns its branded id. */
export async function seedCharacter(
  db: Db,
  overrides: SeedCharacterOverrides,
): Promise<CharacterId> {
  const { id: idOverride, handle, ...columns } = overrides;
  const id = castId<CharacterId>(idOverride ?? "character_c");
  await db.insert(characters).values({
    name: "Char",
    description: null,
    personality: null,
    scenario: null,
    greetings: [],
    exampleMessages: null,
    systemPrompt: null,
    postHistoryInstructions: null,
    creatorNotes: null,
    creator: null,
    cardVersion: null,
    regexScripts: [],
    extensions: null,
    depthPrompt: null,
    avatarAssetId: null,
    contentHash: "content_hash_c",
    createdAt: FROZEN_AT,
    // overrides win over the defaults above; identity columns are set last.
    ...columns,
    id,
    handle: handle ?? id,
  });
  return id;
}

/** Insert a `world_books` row owned by `ownerId`; returns its branded id. */
export async function seedWorldBook(
  db: Db,
  ownerId: UserId,
  id = "world_book_b",
): Promise<WorldBookId> {
  const bookId = castId<WorldBookId>(id);
  await db.insert(worldBooks).values({
    id: bookId,
    ownerId,
    name: "Book",
    description: null,
    createdAt: FROZEN_AT,
  });
  return bookId;
}

interface SeedEntryOverrides {
  readonly id?: string;
  readonly worldBookId: WorldBookId;
  readonly title?: string;
  readonly content?: string;
  readonly keys?: string[] | null;
  readonly enabled?: boolean;
  readonly priority?: number;
  readonly ignoreBudget?: boolean;
  readonly metadata?: EntryMetadata | null;
}

/** Insert a `world_entries` row in a book; returns its branded id. */
export async function seedWorldEntry(db: Db, overrides: SeedEntryOverrides): Promise<WorldEntryId> {
  const id = castId<WorldEntryId>(overrides.id ?? "world_entry_e");
  await db.insert(worldEntries).values({
    id,
    worldBookId: overrides.worldBookId,
    title: overrides.title ?? "Entry",
    description: null,
    content: overrides.content ?? "lore",
    keys: overrides.keys ?? null,
    enabled: overrides.enabled ?? true,
    priority: overrides.priority ?? 0,
    ignoreBudget: overrides.ignoreBudget ?? false,
    metadata: overrides.metadata ?? null,
    createdAt: FROZEN_AT,
  });
  return id;
}

/** Attach a book to a character (`character_books`). */
export async function seedCharacterBook(
  db: Db,
  characterId: CharacterId,
  worldBookId: WorldBookId,
): Promise<void> {
  await db.insert(characterBooks).values({ characterId, worldBookId, createdAt: FROZEN_AT });
}

/** Insert a `tags` row owned by `ownerId`; returns its branded id. */
export async function seedTag(db: Db, ownerId: UserId, name: string): Promise<TagId> {
  const id = castId<TagId>(`tag_${name}`);
  await db.insert(tags).values({ id, ownerId, name, createdAt: FROZEN_AT });
  return id;
}

/** Attach a tag to a character (`character_tags`) at a given status (default pending). */
export async function seedCharacterTag(
  db: Db,
  characterId: CharacterId,
  tagId: TagId,
  status: TagStatus = "pending",
): Promise<void> {
  await db.insert(characterTags).values({ characterId, tagId, status, createdAt: FROZEN_AT });
}

/** Build a Principal for a given user id + role (cookie-resolved by default). */
export function principal(userId: UserId, role: UserRole = "user"): Principal {
  return {
    userId,
    role,
    handle: castId<Handle>(userId),
    externalId: null as ExternalId | null,
    via: "cookie",
  };
}
