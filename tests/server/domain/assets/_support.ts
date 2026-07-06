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
import { assets, characters, chatParticipants, chats, users } from "@orb/db";
import type {
  AssetId,
  CharacterId,
  ChatId,
  ChatParticipantId,
  ExternalId,
  GalleryItemId,
  Handle,
  UserId,
} from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createCas, createVariantCache } from "@orb/server/infra/storage";
import { and, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { Mock } from "vitest";
import { vi } from "vitest";
import type { AssetsContext } from "../../../../packages/server/src/domain/assets/contract/service.ts";
import { createFrozenClock } from "../../../support/clock.ts";
import { createSeededIds } from "../../../support/ids.ts";

const FROZEN_AT = 1_750_000_000_000;

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
  const imageTransform: Mock<AssetsContext["imageTransform"]> = vi.fn<
    AssetsContext["imageTransform"]
  >(() => Promise.resolve(FAKE_WEBP));
  const ctx: AssetsContext = {
    db,
    cas,
    variants,
    imageTransform,
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
    // PD-107 roster-avatar reference-check, wired as the REAL query (mirrors the compose-root impl) so the
    // security property — a rostered character's avatar in a chat the caller is present in, NOT a bare hash
    // oracle — is exercised against the real seeded DB, not a fake.
    loadCoParticipantOwner: async (callerId: UserId, hash: string): Promise<UserId | undefined> => {
      const rosterChar = alias(chatParticipants, "roster_char");
      const callerSeat = alias(chatParticipants, "caller_seat");
      const rows = await db
        .select({ ownerId: assets.ownerId })
        .from(assets)
        .innerJoin(characters, eq(characters.avatarAssetId, assets.id))
        .innerJoin(
          rosterChar,
          and(
            eq(rosterChar.characterId, characters.id),
            eq(rosterChar.kind, "character"),
            isNull(rosterChar.leftSeq),
          ),
        )
        .innerJoin(
          callerSeat,
          and(
            eq(callerSeat.chatId, rosterChar.chatId),
            eq(callerSeat.userId, callerId),
            isNull(callerSeat.leftSeq),
          ),
        )
        .where(eq(assets.hash, hash))
        .limit(1);
      return rows[0]?.ownerId;
    },
  };
  return {
    ctx,
    emitted,
    imageTransform,
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

/** Insert a `users` row with deterministic defaults; returns its branded id (the FK target for assets). */
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

/** Fake but well-formed PNG bytes: the PNG signature + a distinguishing tail (distinct tails ⇒ distinct
 *  content hashes). `sniffMime` recognizes the signature; the CAS just hashes/stores the bytes opaquely. */
export function pngBytes(...tail: number[]): Uint8Array {
  return new Uint8Array([...PNG_SIGNATURE, ...tail]);
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
export async function seedCharacter(
  db: Db,
  ownerId: UserId,
  overrides: SeedCharacterOverrides = {},
): Promise<CharacterId> {
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
}

/** Insert a `chat_participants` row of the given `kind` (human/agent → userId, character → characterId).
 *  Supports the multi-human / multi-character / departed-member rosters the `seedChat` factory's single
 *  `withHost`/`withCharacter` opt-ins can't express (PD-107 needs those). */
export async function seedParticipant(
  db: Db,
  chatId: ChatId,
  kind: ParticipantKind,
  overrides: SeedParticipantOverrides = {},
): Promise<void> {
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
  });
}

/** Point a character's `avatarAssetId` at a stored asset id (the D21 reference the check gates on). */
export async function setCharacterAvatar(
  db: Db,
  characterId: CharacterId,
  avatarAssetId: AssetId,
): Promise<void> {
  await db.update(characters).set({ avatarAssetId }).where(eq(characters.id, characterId));
}
