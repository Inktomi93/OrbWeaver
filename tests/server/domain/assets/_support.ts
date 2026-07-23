// Shared test harness for the assets domain (NOT a test file — no `.test` suffix, so test-layout ignores
// it). Builds a real-db `AssetsContext` with injected determinism (frozen clock + seeded ids — composed
// from tests/support, never self-rolled) and the sanctioned "fake at the edges, inject at the root"
// doctrine (testing §3):
//   • `cas` / `variants` — the REAL infra adapters over fresh temp dirs (so dedup, per-user sharding, and
//     the variant cache are exercised for real, not stubbed). `cleanup()` rms the temp trees.
//   • `imageTransform` — a vi.fn FAKE (sharp is CPU/I/O; the variant assertion is identity, not pixels). It
//     RECORDS its calls so tests assert "transformed once, then cache-served."
//   • `emit` — a recording fake that pushes each `asset.created` into `emitted` (a real injected op, not an
//     internal-module mock).
// Seeds the `users` rows the FK needs directly — a test fixture may read/write `users` (the
// `no-direct-users-read` gate scopes only `packages/server/src/domain`).

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ParticipantKind } from "@orb/contracts/chat";
import type { DomainEvent } from "@orb/contracts/events";
import type { ParticipantRole, Principal, UserRole } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { assets, characters, chatParticipants, chats, messageAssets, messages, personas } from "@orb/db";
import type {
  AssetId,
  CharacterId,
  ChatId,
  ChatParticipantId,
  GalleryItemId,
  Handle,
  MessageAssetId,
  MessageId,
  PersonaId,
  PoseLibraryId,
  UserId,
} from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createCas, createVariantCache } from "@orb/server/infra/storage";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { Mock } from "vitest";
import { vi } from "vitest";
import type { AssetsContext } from "../../../../packages/server/src/domain/assets/context.ts";
import { createFrozenClock, FROZEN_AT_MS } from "../../../support/clock.ts";
import { principal as makePrincipal } from "../../../support/factories/principal.ts";
import { seedUser as seedUserRow } from "../../../support/factories/user.ts";
import { createSeededIds } from "../../../support/ids.ts";

const FROZEN_AT = FROZEN_AT_MS;

// The PNG magic bytes — every `pngBytes(...)` starts here so `sniffMime` returns image/png. The tail makes
// distinct images hash distinctly.
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

// Deterministic fake webp bytes the mocked imageTransform returns (opaque — the variant cache stores bytes,
// never decodes; the assertion is identity).
const FAKE_WEBP = new Uint8Array([0x57, 0x45, 0x42, 0x50, 0xaa, 0xbb]);

export interface AssetsHarness {
  readonly ctx: AssetsContext;
  /** Every `asset.created` the verbs emitted, in order. */
  readonly emitted: DomainEvent[];
  /** The injected sharp fake — assert call count + args (e.g. the snapped width). */
  readonly imageTransform: Mock<AssetsContext["imageTransform"]>;
  /** The injected sharp `probe` fake — override per test (e.g. mockResolvedValueOnce a landscape dim) to
   *  exercise the pose orientation computation without real decode. Defaults to a 1024×1024 png. */
  readonly imageProbe: Mock<AssetsContext["imageProbe"]>;
  /** rm the temp CAS + variant trees. Register via `onTestFinished`. */
  readonly cleanup: () => Promise<void>;
  /** Advance the injected frozen clock (ms). */
  readonly advance: (ms: number) => void;
}

/** Build an AssetsContext over a real db + real CAS/variant temp dirs with deterministic + recording fakes. */
export async function makeHarness(db: Db): Promise<AssetsHarness> {
  const clock = createFrozenClock(FROZEN_AT);
  const ids = createSeededIds();
  const casDir = await mkdtemp(join(tmpdir(), "orb-assets-cas-"));
  const variantDir = await mkdtemp(join(tmpdir(), "orb-assets-var-"));
  const cas = createCas(casDir);
  const variants = createVariantCache(variantDir);
  const emitted: DomainEvent[] = [];
  const imageTransform: Mock<AssetsContext["imageTransform"]> = vi.fn<AssetsContext["imageTransform"]>(() => Promise.resolve(FAKE_WEBP));
  const imageProbe: Mock<AssetsContext["imageProbe"]> = vi.fn<AssetsContext["imageProbe"]>(() => Promise.resolve({ format: "png", width: 1024, height: 1024 }));
  const ctx: AssetsContext = {
    db,
    cas,
    variants,
    imageTransform,
    imageProbe,
    newPoseLibraryId: (): PoseLibraryId => castId<PoseLibraryId>(ids.next("pose_library")),
    emit: (event: DomainEvent): void => {
      emitted.push(event);
    },
    now: (): number => clock.now(),
    newAssetId: (): AssetId => castId<AssetId>(ids.next("asset")),
    newGalleryItemId: (): GalleryItemId => castId<GalleryItemId>(ids.next("gallery_item")),
    // The gallery owner-only gate, wired as the real owner-scoped `characters` read (mirrors compose) so
    // the addToGallery character-ownership rejection is exercised for real, not stubbed.
    assertCharacterOwned: async (ownerId: UserId, characterId: CharacterId): Promise<boolean> => {
      const rows = await db
        .select({ id: characters.id })
        .from(characters)
        .where(and(eq(characters.id, characterId), eq(characters.ownerId, ownerId)))
        .limit(1);
      return rows.length > 0;
    },
    // PD-107 roster-avatar reference-check, wired as the REAL query (mirrors the compose-root impl,
    // `entry/compose/services.ts`) so the security property — a rostered character's OR a co-participant
    // human's PERSONA avatar in a chat the caller is present in, NOT a bare hash oracle — is exercised
    // against the real seeded DB, not a fake.
    loadCoParticipantOwner: async (callerId: UserId, hash: string): Promise<UserId | undefined> => {
      const rosterChar = alias(chatParticipants, "roster_char");
      const callerSeat = alias(chatParticipants, "caller_seat");
      const characterRows = await db
        .select({ ownerId: assets.ownerId })
        .from(assets)
        .innerJoin(characters, eq(characters.avatarAssetId, assets.id))
        .innerJoin(rosterChar, and(eq(rosterChar.characterId, characters.id), eq(rosterChar.kind, "character"), isNull(rosterChar.leftSeq)))
        .innerJoin(callerSeat, and(eq(callerSeat.chatId, rosterChar.chatId), eq(callerSeat.userId, callerId), isNull(callerSeat.leftSeq)))
        .where(eq(assets.hash, hash))
        .limit(1);
      if (characterRows[0] !== undefined) {
        return characterRows[0].ownerId;
      }

      const personaSeat = alias(chatParticipants, "persona_seat");
      const personaCallerSeat = alias(chatParticipants, "persona_caller_seat");
      const personaRows = await db
        .select({ ownerId: assets.ownerId })
        .from(assets)
        .innerJoin(personas, eq(personas.avatarAssetId, assets.id))
        .innerJoin(personaSeat, and(eq(personaSeat.activePersonaId, personas.id), eq(personaSeat.kind, "human"), isNull(personaSeat.leftSeq)))
        .innerJoin(
          personaCallerSeat,
          and(eq(personaCallerSeat.chatId, personaSeat.chatId), eq(personaCallerSeat.userId, callerId), isNull(personaCallerSeat.leftSeq)),
        )
        .where(eq(assets.hash, hash))
        .limit(1);
      if (personaRows[0] !== undefined) {
        return personaRows[0].ownerId;
      }

      // Attachment arm (#67 co-participant render) — mirrors the compose-root impl: the hash is an asset
      // referenced by a `message_assets` row for a message in a chat where BOTH the caller and the asset
      // owner are present participants.
      const attachOwnerSeat = alias(chatParticipants, "attach_owner_seat");
      const attachCallerSeat = alias(chatParticipants, "attach_caller_seat");
      const attachmentRows = await db
        .select({ ownerId: assets.ownerId })
        .from(assets)
        .innerJoin(messageAssets, eq(messageAssets.assetId, assets.id))
        .innerJoin(messages, eq(messages.id, messageAssets.messageId))
        .innerJoin(attachCallerSeat, and(eq(attachCallerSeat.chatId, messages.chatId), eq(attachCallerSeat.userId, callerId), isNull(attachCallerSeat.leftSeq)))
        .innerJoin(
          attachOwnerSeat,
          and(eq(attachOwnerSeat.chatId, messages.chatId), eq(attachOwnerSeat.userId, assets.ownerId), isNull(attachOwnerSeat.leftSeq)),
        )
        .where(eq(assets.hash, hash))
        .limit(1);
      return attachmentRows[0]?.ownerId;
    },
    // #67 co-participant RENDER resolver — mirrors the compose-root impl (`entry/compose/services.ts`) so the
    // structural gate (a `message_assets` reference IN `chatId` + owner present + caller present, NOT bare
    // membership) is exercised against the real seeded DB.
    loadChatAssetRefs: async (callerId, forChatId, assetIds) => {
      if (assetIds.length === 0) {
        return [];
      }
      const ownerSeat = alias(chatParticipants, "chat_ref_owner_seat");
      const callerSeat = alias(chatParticipants, "chat_ref_caller_seat");
      const rows = await db
        .selectDistinct({ assetId: assets.id, hash: assets.hash })
        .from(assets)
        .innerJoin(messageAssets, eq(messageAssets.assetId, assets.id))
        .innerJoin(messages, eq(messages.id, messageAssets.messageId))
        .innerJoin(callerSeat, and(eq(callerSeat.chatId, messages.chatId), eq(callerSeat.userId, callerId), isNull(callerSeat.leftSeq)))
        .innerJoin(ownerSeat, and(eq(ownerSeat.chatId, messages.chatId), eq(ownerSeat.userId, assets.ownerId), isNull(ownerSeat.leftSeq)))
        .where(and(eq(messages.chatId, forChatId), inArray(assets.id, [...assetIds])));
      return rows;
    },
  };
  return {
    ctx,
    emitted,
    imageTransform,
    imageProbe,
    advance: (ms: number): void => clock.advance(ms),
    cleanup: async (): Promise<void> => {
      await rm(casDir, { recursive: true, force: true });
      await rm(variantDir, { recursive: true, force: true });
    },
  };
}

interface SeedUserOverrides {
  readonly id?: string;
  readonly handle?: string;
  readonly role?: UserRole;
}

/** Insert a `users` row with deterministic defaults; returns its branded id (the FK target for assets).
 *  Thin delegate over the canonical factory — assets' call sites want the id back, not the row. */
export async function seedUser(db: Db, overrides: SeedUserOverrides = {}): Promise<UserId> {
  const id = castId<UserId>(overrides.id ?? `user_${overrides.handle ?? "x"}`);
  const seeded = await seedUserRow(db, {
    id,
    handle: castId<Handle>(overrides.handle ?? id),
    role: overrides.role ?? "user",
  });
  return seeded.id;
}

/** Build a Principal for a given user id + role (cookie-resolved by default). Delegates to the shared
 *  `support/factories/principal` — assets keeps its existing positional `(id, role, handle?)` convention. */
export function principal(userId: UserId, role: UserRole = "user", handle: string = userId): Principal {
  return makePrincipal(userId, { role, handle: castId<Handle>(handle) });
}

/** Fake but well-formed PNG bytes: the PNG signature + a distinguishing tail (distinct tails ⇒ distinct
 *  content hashes). `sniffMime` recognizes the signature; the CAS just hashes/stores the bytes opaquely. */
export function pngBytes(...tail: number[]): Uint8Array {
  return new Uint8Array([...PNG_SIGNATURE, ...tail]);
}

// "GIF89a" — every GIF is treated animated by `@orb/kit/image-sniff` `isAnimated` (gallery-design §3).
const GIF89A_SIGNATURE = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] as const;

/** Fake but well-formed GIF bytes: the GIF89a signature + a distinguishing tail. `isAnimated` returns true
 *  for any GIF, so these drive the store `animated` fact + the `resolveVariant` bailout under test. */
export function gifBytes(...tail: number[]): Uint8Array {
  return new Uint8Array([...GIF89A_SIGNATURE, ...tail]);
}

/** Index into a query result with a non-empty assertion — narrows `T | undefined` (noUncheckedIndexedAccess)
 *  to `T` for the paging cursor/field reads, throwing a legible error if the page is unexpectedly short. */
export function row<T>(rows: readonly T[], i: number): T {
  const r = rows[i];
  if (r === undefined) {
    throw new Error(`expected a row at index ${i}, got a page of ${rows.length}`);
  }
  return r;
}

interface SeedCharacterOverrides {
  readonly id?: string;
  readonly handle?: string;
  readonly name?: string;
}

/** Insert a minimal `characters` row owned by `ownerId` (the gallery `subjectCharacterId` FK target).
 *  Only the notNull/no-default columns are supplied. Returns the branded id. */
export async function seedCharacter(db: Db, ownerId: UserId, overrides: SeedCharacterOverrides = {}): Promise<CharacterId> {
  const id = castId<CharacterId>(overrides.id ?? `character_${overrides.handle ?? "x"}`);
  await db.insert(characters).values({
    id,
    handle: overrides.handle ?? id,
    ownerId,
    contentHash: `hash_${id}`,
    name: overrides.name ?? "Test Character",
  });
  return id;
}

/** Insert a bare `chats` row (D18: no ownerId — authority is the host participant). Returns the id. */
export async function seedChatRow(db: Db, id: string): Promise<ChatId> {
  const chatId = castId<ChatId>(id);
  await db.insert(chats).values({ id: chatId, createdAt: FROZEN_AT, updatedAt: FROZEN_AT });
  return chatId;
}

interface SeedParticipantOverrides {
  readonly id?: string;
  readonly userId?: UserId;
  readonly characterId?: CharacterId;
  readonly role?: ParticipantRole;
  /** Set to mark the participant as DEPARTED (the present-membership gate keys on `leftSeq IS NULL`). */
  readonly leftSeq?: number;
  /** A human seat's CURRENT persona (the PD-107 persona-sibling reference-check gates on this). */
  readonly activePersonaId?: PersonaId;
}

/** Insert a `chat_participants` row of the given `kind` (human/agent → userId, character → characterId).
 *  Supports the multi-human / multi-character / departed-member rosters the `seedChat` factory's single
 *  `withHost`/`withCharacter` opt-ins can't express (PD-107 needs those). */
export async function seedParticipant(db: Db, chatId: ChatId, kind: ParticipantKind, overrides: SeedParticipantOverrides = {}): Promise<void> {
  await db.insert(chatParticipants).values({
    id: castId<ChatParticipantId>(overrides.id ?? `chat_participant_${kind}_${chatId}`),
    chatId,
    kind,
    userId: overrides.userId,
    characterId: overrides.characterId,
    role: overrides.role ?? "member",
    joinedAt: FROZEN_AT,
    joinSeq: 0,
    leftSeq: overrides.leftSeq,
    activePersonaId: overrides.activePersonaId,
  });
}

/** Point a character's `avatarAssetId` at a stored asset id (the D21 reference the check gates on). */
export async function setCharacterAvatar(db: Db, characterId: CharacterId, avatarAssetId: AssetId): Promise<void> {
  await db.update(characters).set({ avatarAssetId }).where(eq(characters.id, characterId));
}

interface SeedPersonaOverrides {
  readonly id?: string;
  readonly name?: string;
}

/** Insert a minimal `personas` row owned by `ownerId` (the PD-107 persona-sibling reference-check target).
 *  Only the notNull/no-default columns are supplied. Returns the branded id. */
export async function seedPersona(db: Db, ownerId: UserId, overrides: SeedPersonaOverrides = {}): Promise<PersonaId> {
  const id = castId<PersonaId>(overrides.id ?? `persona_${overrides.name ?? "x"}`);
  await db.insert(personas).values({
    id,
    ownerId,
    name: overrides.name ?? "Test Persona",
    description: "",
  });
  return id;
}

/** Point a persona's `avatarAssetId` at a stored asset id (the D21 reference the check gates on). */
export async function setPersonaAvatar(db: Db, personaId: PersonaId, avatarAssetId: AssetId): Promise<void> {
  await db.update(personas).set({ avatarAssetId }).where(eq(personas.id, personaId));
}

/** Insert a minimal `messages` row (the #67 attachment structural reference — a `message_assets` row FKs to
 *  it). Only the notNull/no-default columns are supplied (id, chatId, seq, role). Returns the branded id. */
export async function seedMessage(db: Db, chatId: ChatId, overrides: { readonly id?: string; readonly seq?: number } = {}): Promise<MessageId> {
  const id = castId<MessageId>(overrides.id ?? `message_${chatId}`);
  await db.insert(messages).values({ id, chatId, seq: overrides.seq ?? 0, role: "user" });
  return id;
}

/** Insert a `message_assets` row — the STRUCTURAL chat-message ↔ asset link the #67 co-participant render
 *  gate keys on (an asset is renderable in a chat ONLY when it has one of these for a message in that chat). */
export async function seedMessageAsset(db: Db, messageId: MessageId, assetId: AssetId, id?: string): Promise<void> {
  await db.insert(messageAssets).values({
    id: castId<MessageAssetId>(id ?? `message_asset_${messageId}_${assetId}`),
    messageId,
    assetId,
  });
}
