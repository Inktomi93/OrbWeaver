// Composition seam for the databank domain: the source-document producer + its derived `document_chunks`
// (written ONLY via embeddings.store — the single write path) and the chunk→embed ingest subsystem the
// runner-env reaches through `env.databank.*`. Built BEFORE chat so `gatherDatabank` (the {{databank}} slot,
// DB6) can inject into the chat build. Its host/member guards are the compose-root requireHost/requireParticipant
// (the same predicates chat's own seam wraps). Owns no business logic — it only threads the already-built infra
// handles + sibling service front doors onto the `DatabankContext`.

import type { DatabaseHandle } from "@orb/db/wiring";
import type { IdSource } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import type { Clock } from "@orb/kit/time";
import { can } from "#domain/admin";
import type { ChatServiceDeps } from "#domain/chat";
import { createWiredChatGuards, loadPresentHostUserId } from "#domain/chat";
import type { DatabankAssemblyContext, DatabankIngest, DatabankPortabilityAssemblyContext, DatabankService } from "#domain/databank";
import { createDatabankIngest, createDatabankService } from "#domain/databank";
import type { EmbeddingsService, LiveEmbedSpaceDeps } from "#domain/embeddings";
import { createGetLiveEmbedSpace } from "#domain/embeddings";
import type { SearchService } from "#domain/search";
import type { SettingsService } from "#domain/settings";
import { createGetDatabankSettings } from "#domain/settings";
import type { WorkloadService } from "#domain/workloads";
import type { AuditWiring, Logger } from "#foundation/observability";
import { EXTRACTOR_VERSION } from "#infra/extraction";
import type { ScopedEgress } from "#infra/network";
import type { LiveBuses } from "#transport/trpc";
import { minter } from "./minter.ts";
import {
  createDeleteReachCapture,
  createEmitRoomDatabankChanged,
  createFanDatabankCharacterRooms,
  createFanDatabankDocumentRooms,
  createFanDatabankMemberRooms,
} from "./room-reach.ts";
import { createVisibleRoomsReader } from "./visible-rooms.ts";

/** What the databank seam needs from the composition root: infra handles + the already-built sibling service
 *  front doors databank's injected ops route through. */
export interface DatabankComposeDeps {
  readonly logger: Logger;
  readonly emitUserEvent: LiveBuses["user"]["publishUserEvent"];

  readonly fetchWebDocument: ScopedEgress["fetchWebDocument"];
  readonly idSource: IdSource;
  readonly db: DatabaseHandle;
  readonly now: Clock;
  readonly audit: AuditWiring["log"];
  readonly assetsStore: DatabankAssemblyContext["assetsStore"];
  readonly loadAssetBytes: DatabankAssemblyContext["loadAssetBytes"];
  readonly embeddings: Pick<EmbeddingsService, "store" | "pruneDocumentChunks" | "countDocumentChunks" | "countDocumentChunksByOwner">;
  readonly extractText: DatabankAssemblyContext["extractText"];
  /** The per-FUNDER role-client binder: a bank's space is its OWNER's `embed` binding (vector tasks are
   *  owner-scoped, §7.5), read per call so a re-bound connection reaches the next ingest with no restart. */
  readonly roleClientsFor: LiveEmbedSpaceDeps["roleClientsFor"];
  readonly search: Pick<SearchService, "documents">;
  readonly workloads: Pick<WorkloadService, "start">;
  /** The per-user settings loader — `getDatabankSettings(ownerId)` reads the user's `databank` section
   *  (chunk params for ingest + retrieval params for gather), replacing the schema-default stub. */
  readonly loadUserSettings: SettingsService["loadUserSettings"];
  /** chat's DURABLE-APPEND-FREE live fan — the entity→room bridge's emit surface (the regex precedent).
   *  Threaded here because every databank junction write has a member-visible projection in the rooms
   *  that credit the document (the D85 rack), and `databankChanged` is a per-USER channel that never
   *  reaches them. */
  readonly emitChatEventLive: ChatServiceDeps["emitLive"];
}

/** The databank compose product: the retrieval/producer service + the chunk-embed ingest subsystem. */
export interface DatabankComposeResult {
  readonly databank: DatabankService;
  readonly databankIngest: DatabankIngest;
  /** The PRINCIPAL-LESS slice the bundle descriptors close over (the delivery core knows only `ownerId`).
   *  It IS the same `DatabankContext` — narrowed here so the portability seam can't reach the rest of it. */
  readonly databankPortability: DatabankPortabilityAssemblyContext;
}

export function buildDatabank(deps: DatabankComposeDeps): DatabankComposeResult {
  const { db, now, audit, embeddings, extractText, search, workloads, loadUserSettings } = deps;
  const chatGuards = createWiredChatGuards({ db, can });
  const databankCtx: DatabankAssemblyContext = {
    logger: deps.logger,
    db,
    can,
    now,
    newDocumentId: minter(ID_PREFIX.document, deps.idSource),
    audit,
    // The ONE per-user freshness plane (the house injected-emit pattern — the domain never reaches at
    // transport, D38): every persisting verb fans `databankChanged`, and the ingest subsystem fans it once
    // per touched owner at a pass terminal (event-bus coverage survey H3).
    emitUserEvent: deps.emitUserEvent,
    // Databank owns document-junction reach; chat owns seat reach and the room fan/capture policy.
    // This seam only assembles their typed operations over the live transport surface.
    emitRoomDatabankChanged: createEmitRoomDatabankChanged(deps.emitChatEventLive),
    fanDatabankRoomsForDocument: createFanDatabankDocumentRooms(db, deps.emitChatEventLive, deps.logger),
    fanDatabankRoomsForCharacter: createFanDatabankCharacterRooms(db, deps.emitChatEventLive, deps.logger),
    fanDatabankRoomsForMember: createFanDatabankMemberRooms(db, deps.emitChatEventLive, deps.logger),
    captureRoomReachForDelete: createDeleteReachCapture(db, deps.emitChatEventLive, deps.logger).databank,
    assetsStore: deps.assetsStore,
    loadAssetBytes: deps.loadAssetBytes,
    embeddingsStore: embeddings.store,
    pruneDocumentChunks: embeddings.pruneDocumentChunks,
    countChunks: embeddings.countDocumentChunks,
    chunkCountsByOwner: embeddings.countDocumentChunksByOwner,
    extractText,
    extractorVersion: EXTRACTOR_VERSION,
    // The DB7 scrapeWeb port: infra/network's `fetchWebDocument` (the ANY_HOST arbitrary-URL class — no host
    // pin, but https + private-range denial run per hop; throws on refusal/non-2xx/cap, the verb maps it).
    fetchUrl: deps.fetchWebDocument,
    // `model` is the SPACE TAG (`embedSpaceOf`), never the bare row column: every count read here is
    // compared against `document_chunks.model`, which carries the dtype the backend stamped (§10-2).
    //
    // DELIBERATELY THE LIVE SPACE, NOT §10-5's `activeSpace`. The retrieval readers follow the last COMPLETE
    // space because a scan in the wrong geometry is worse than no scan; this is a PROGRESS read — "how many
    // of this bank's chunks are embedded where they need to be". Counting against the last-complete space
    // would report a bank as fully embedded while a reindex is still moving it, which is the one answer the
    // databank surface must not give. During a transition "0 of N" is the truth and the progress signal.
    getActiveEmbedSpace: createGetLiveEmbedSpace({ roleClientsFor: deps.roleClientsFor }),
    // Settings owns the live owner projection; chat's slot budget stays on its separate input plane.
    getDatabankSettings: createGetDatabankSettings(loadUserSettings),
    searchDocuments: search.documents,
    enqueueIngest: async ({ documentId, ownerId }) => {
      const started = await workloads.start({
        input: { kind: "databank-ingest", params: { documentId } },
        caller: null,
        funderUserId: null,
        mode: "singular",
        ownerId,
      });
      return { workloadId: started.id };
    },
    enqueueReindex: async ({ ownerId, scope, mode }) => {
      const started = await workloads.start({
        input: { kind: "databank-reindex", params: { scope, mode } },
        caller: null,
        funderUserId: null,
        mode: "singular",
        ownerId,
      });
      return { workloadId: started.id };
    },
    ensureChatHost: chatGuards.requireHost,
    ensureChatMember: chatGuards.requireParticipant,
    resolveChatHost: (chatId) => loadPresentHostUserId(db, chatId),
    // The SHARED leak-safe reverse-room read — the same factory regex's roster and the preset
    // CONTEXT's GM bindings wire. A `chat_documents` row outlives its attacher's seat, so the "Active in"
    // roster names PRESENT rooms only.
    resolveVisibleRooms: createVisibleRoomsReader(db),
  };
  const databank = createDatabankService(databankCtx);
  const databankIngest: DatabankIngest = createDatabankIngest(databankCtx);
  return { databank, databankIngest, databankPortability: databankCtx };
}
