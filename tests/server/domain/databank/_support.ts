// Shared test harness for the databank domain (NOT a test file — no `.test` suffix). Builds a real-db
// `DatabankContext` with the REAL embeddings write path (a `createEmbeddingsService` over the embeddings
// harness's recording fake `roleClients` — deterministic `EMBED_DIM` vectors, a counting `embed` mock) and
// fakes at the remaining edges (assets store/read, extractText, the workload enqueues, the chat guards) per
// the "fake at the edges, inject at the root" doctrine. Reuses the embeddings harness's FK-parent seeders
// (users/chats/characters) + the frozen clock + seeded ids so ingest is byte-deterministic.

import { databankSettingsSchema } from "@orb/contracts/databank";
import type { ExtractionResult, ExtractTextOp } from "@orb/contracts/extraction";
import type { ParticipantRole, Principal } from "@orb/contracts/identity";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { Db } from "@orb/db";
import { assets, chatParticipants } from "@orb/db";
import type { AssetId, CharacterId, ChatId, ChatParticipantId, DocumentId, Handle, UserId, WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { Mock } from "vitest";
import { vi } from "vitest";
import type { DatabankContext, DatabankIngest, DatabankService } from "../../../../packages/server/src/domain/databank/contract/service.ts";
import { createDatabankService } from "../../../../packages/server/src/domain/databank/index.ts";
import { createDatabankIngest } from "../../../../packages/server/src/domain/databank/ingest/index.ts";
import { createEmbeddingsService } from "../../../../packages/server/src/domain/embeddings/index.ts";
import { createFrozenClock, FROZEN_AT_MS } from "../../../support/clock.ts";
import { createSeededIds } from "../../../support/ids.ts";
import { EMBED_DIM, EMBED_MODEL, makeStoreHarness } from "../embeddings/_support.ts";

export { EMBED_DIM, EMBED_MODEL, seedCharacter, seedChat, seedUser } from "../embeddings/_support.ts";

/** Seat a character on a chat (the roster arm the character-scope union reads: kind='character', present). */
export async function seedRosterCharacter(db: Db, chatId: ChatId, characterId: CharacterId, leftSeq: number | null = null): Promise<void> {
  await db.insert(chatParticipants).values({
    id: castId<ChatParticipantId>(`chatpart_${chatId}_${characterId}`),
    chatId,
    kind: "character",
    characterId,
    role: "member",
    joinSeq: 0,
    leftSeq,
  });
}

/** A resolved `Principal` for `userId` (the fetchOwned subject). */
export function principalFor(userId: UserId): Principal {
  return { userId, role: "user", handle: castId<Handle>(userId), externalId: null, via: "fallback" };
}

/** Seed a chat with `hostId` as its live host (the scope resolver reads chat_participants role='host'). */
export async function seedChatHost(db: Db, chatId: ChatId, hostId: UserId, role: ParticipantRole = "host"): Promise<void> {
  await db.insert(chatParticipants).values({
    id: castId<ChatParticipantId>(`chatpart_${chatId}_${hostId}`),
    chatId,
    kind: "human",
    userId: hostId,
    role,
    joinSeq: 0,
  });
}

export interface DatabankHarnessOptions {
  /** Override the databank settings (e.g. a small `wholeFileThreshold`/`chunkSize` to force multiple chunks). */
  readonly settings?: Parameters<typeof databankSettingsSchema.parse>[0];
  /** Override the chat-host guard (default: resolves — host). Throw to exercise the authority gate. */
  readonly ensureChatHost?: DatabankContext["ensureChatHost"];
  readonly ensureChatMember?: DatabankContext["ensureChatMember"];
  /** The injected `search.documents` lens (DB6 gather). Default: a bankless fake returning `[]`. Script it
   *  to drive the gather verb's fit/format/null paths without a full retrieval stack. */
  readonly searchDocuments?: DatabankContext["searchDocuments"];
  /** Inject the REAL `infra/extraction` dispatcher (op + its `EXTRACTOR_VERSION`) in place of the default
   *  textlike fake — for the DB3 upload→extract→ingest round-trip through the actual loaders. */
  readonly extractor?: { readonly op: ExtractTextOp; readonly version: string };
  /** The DB7 scrapeWeb fetch port (compose-bound `safeFetch` ANY_HOST in prod). Default: returns empty bytes.
   *  Scrape tests reconfigure the exposed `fetchUrl` mock per-case (canned html, or a rejection = an egress
   *  refusal / fetch failure) — no live network. */
  readonly fetchUrl?: DatabankContext["fetchUrl"];
  /** chat's leak-safe reverse-room read (`listAttachments`' room half, #276). Unstubbed it THROWS: the
   *  membership filter is the whole point of that arm, and a default returning `[]` would let a verb that
   *  silently stopped calling it pass as "no visible rooms". */
  readonly resolveVisibleRooms?: DatabankContext["resolveVisibleRooms"];
}

export interface DatabankHarness {
  readonly ctx: DatabankContext;
  readonly service: DatabankService;
  readonly ingest: DatabankIngest;
  readonly roleClients: ReturnType<typeof makeStoreHarness>["roleClients"];
  readonly enqueueIngest: Mock<DatabankContext["enqueueIngest"]>;
  readonly enqueueReindex: Mock<DatabankContext["enqueueReindex"]>;
  readonly fetchUrl: Mock<DatabankContext["fetchUrl"]>;
  readonly extractText: Mock<ExtractTextOp>;
  readonly assetsStore: Mock<DatabankContext["assetsStore"]>;
  /** The bytes the assets fake stored, keyed by minted assetId (the re-extract `loadAssetBytes` source). */
  readonly storedBytes: Map<AssetId, Uint8Array>;
  /** Every recorded `emitUserEvent` call, in order — the per-user freshness plane the verbs fan
   *  `databankChanged` on, and the ingest subsystem fans per touched owner at its terminal (event-bus
   *  coverage survey H3). Shared by the service AND the ingest product, exactly as compose wires one
   *  publisher for both. */
  readonly userEvents: UserEventCall[];
  readonly advance: (ms: number) => void;
}

/** One recorded user-bus emit. */
interface UserEventCall {
  readonly userId: UserId;
  readonly event: UserBusEvent;
}

const EXTRACTOR_VERSION = "textlike-1";

/** Decode UTF-8, normalize newlines to `\n` — the textlike extraction contract (the default fake). */
function decode(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/\r\n?/g, "\n");
}

export function makeDatabankHarness(db: Db, options: DatabankHarnessOptions = {}): DatabankHarness {
  const store = makeStoreHarness(db);
  const embeddings = createEmbeddingsService(store.ctx);
  const clock = createFrozenClock(FROZEN_AT_MS);
  const ids = createSeededIds();
  const storedBytes = new Map<AssetId, Uint8Array>();

  const enqueueIngest: Mock<DatabankContext["enqueueIngest"]> = vi.fn(() => Promise.resolve({ workloadId: castId<WorkloadId>(ids.next("workload")) }));
  const enqueueReindex: Mock<DatabankContext["enqueueReindex"]> = vi.fn(() => Promise.resolve({ workloadId: castId<WorkloadId>(ids.next("workload")) }));
  const fetchUrl: Mock<DatabankContext["fetchUrl"]> = vi.fn(options.fetchUrl ?? ((): Promise<Uint8Array> => Promise.resolve(new Uint8Array())));

  const { extractor } = options;
  const extractText: Mock<ExtractTextOp> = vi.fn(
    extractor
      ? extractor.op
      : (bytes: Uint8Array): Promise<ExtractionResult> => {
          const text = decode(bytes);
          return Promise.resolve({ text, meta: { format: "markdown" as const, extractorVersion: EXTRACTOR_VERSION, charCount: text.length } });
        },
  );
  const extractorVersion = extractor ? extractor.version : EXTRACTOR_VERSION;

  const assetsStore: Mock<DatabankContext["assetsStore"]> = vi.fn(async ({ principal, bytes, mime }) => {
    const assetId = castId<AssetId>(ids.next("asset"));
    const hash = `hash-${assetId}`;
    storedBytes.set(assetId, bytes);
    // Insert a real assets row so the documents.sourceAssetId FK resolves (the CAS write's db side).
    await db.insert(assets).values({ id: assetId, ownerId: principal.userId, kind: "document", mime, size: bytes.length, hash, uploadedAt: clock.now() });
    return { assetId, hash, size: bytes.length, created: true };
  });

  const settings = databankSettingsSchema.parse(options.settings ?? { chunk: {}, retrieval: {} });
  const userEvents: UserEventCall[] = [];

  const ctx: DatabankContext = {
    db,
    now: () => clock.now(),
    newDocumentId: () => castId<DocumentId>(ids.next("document")),
    audit: () => Promise.resolve(),
    emitUserEvent: (userId: UserId, event: UserBusEvent): void => {
      userEvents.push({ userId, event });
    },
    assetsStore,
    loadAssetBytes: (assetId) => Promise.resolve(storedBytes.get(assetId)),
    embeddingsStore: embeddings.store,
    pruneDocumentChunks: embeddings.pruneDocumentChunks,
    countChunks: embeddings.countDocumentChunks,
    chunkCountsByOwner: embeddings.countDocumentChunksByOwner,
    extractText,
    extractorVersion,
    fetchUrl,
    getActiveEmbedSpace: () => Promise.resolve({ model: EMBED_MODEL, dim: EMBED_DIM }),
    getDatabankSettings: () => Promise.resolve(settings),
    enqueueIngest,
    enqueueReindex,
    ensureChatHost: options.ensureChatHost ?? (() => Promise.resolve()),
    ensureChatMember: options.ensureChatMember ?? (() => Promise.resolve()),
    searchDocuments: options.searchDocuments ?? (() => Promise.resolve([])),
    resolveVisibleRooms:
      options.resolveVisibleRooms ??
      ((): never => {
        throw new Error("DatabankContext.resolveVisibleRooms not stubbed in this test");
      }),
  };

  return {
    ctx,
    service: createDatabankService(ctx),
    ingest: createDatabankIngest(ctx),
    roleClients: store.roleClients,
    enqueueIngest,
    enqueueReindex,
    fetchUrl,
    extractText,
    assetsStore,
    storedBytes,
    userEvents,
    advance: (ms) => clock.advance(ms),
  };
}
