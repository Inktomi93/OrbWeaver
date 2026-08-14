// Composition seam for the databank domain: the source-document producer + its derived `document_chunks`
// (written ONLY via embeddings.store — the single write path) and the chunk→embed ingest subsystem the
// runner-env reaches through `env.databank.*`. Built BEFORE chat so `gatherDatabank` (the {{databank}} slot,
// DB6) can inject into the chat build. Its host/member guards are the compose-root requireHost/requireParticipant
// (the same predicates chat's own seam wraps). Owns no business logic — it only threads the already-built infra
// handles + sibling service front doors onto the `DatabankContext`.

import type { Db } from "@orb/db";
import { ID_PREFIX } from "@orb/kit/ids";
import { can } from "#domain/admin";
import type { DatabankContext, DatabankIngest, DatabankPortabilityContext, DatabankService } from "#domain/databank";
import { createDatabankIngest, createDatabankService } from "#domain/databank";
import type { EmbeddingsService } from "#domain/embeddings";
import type { SearchService } from "#domain/search";
import type { SettingsService } from "#domain/settings";
import type { WorkloadService } from "#domain/workloads";
import { env } from "#foundation/env";
import type { AuditEntry } from "#foundation/observability";
import { EXTRACTOR_VERSION } from "#infra/extraction";
import { fetchWebDocument } from "#infra/network";
import { requireHost, requireParticipant } from "../../domain/chat/index.ts";
import { publishUserEvent } from "../../transport/trpc/index.ts";
import { minter } from "./minter.ts";

/** What the databank seam needs from the composition root: infra handles + the already-built sibling service
 *  front doors databank's injected ops route through. */
export interface DatabankComposeDeps {
  readonly db: Db;
  readonly now: () => number;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  readonly assetsStore: DatabankContext["assetsStore"];
  readonly loadAssetBytes: (assetId: Parameters<DatabankContext["loadAssetBytes"]>[0]) => Promise<Uint8Array | null>;
  readonly embeddings: Pick<EmbeddingsService, "store" | "pruneDocumentChunks" | "countDocumentChunks">;
  readonly extractText: DatabankContext["extractText"];
  /** The active embed-space model tag — `roleClients.embedModel` (the same source `getActiveEmbedSpace` read).
   *  A THUNK: that field is a live getter that follows a role re-point, so capturing the string at compose
   *  would hand ingest a boot-frozen space tag after the owner moves the embed role. */
  readonly embedModel: () => string;
  readonly search: Pick<SearchService, "documents">;
  readonly workloads: Pick<WorkloadService, "start">;
  /** The per-user settings loader — `getDatabankSettings(ownerId)` reads the user's `databank` section
   *  (chunk params for ingest + retrieval params for gather), replacing the schema-default stub. */
  readonly loadUserSettings: SettingsService["loadUserSettings"];
}

/** The databank compose product: the retrieval/producer service + the chunk-embed ingest subsystem. */
export interface DatabankComposeResult {
  readonly databank: DatabankService;
  readonly databankIngest: DatabankIngest;
  /** The PRINCIPAL-LESS slice the bundle descriptors close over (the delivery core knows only `ownerId`).
   *  It IS the same `DatabankContext` — narrowed here so the portability seam can't reach the rest of it. */
  readonly databankPortability: DatabankPortabilityContext;
}

/** The bound `getDatabankSettings(ownerId)` op — reads the owner's REAL `UserSettings.databank` and projects
 *  the `{chunk, retrieval}` the `DatabankSettings` op contract carries (the user tier's `slotTokenBudget` is a
 *  chat-side concern threaded via ForeignInputs, not this op). Extracted (not inlined) so the composed-real
 *  test invokes the EXACT binding, not a re-implementation of it. Replaced the compose-stub-goes-stale 0-param
 *  arrow that ignored `ownerId` and returned schema defaults. */
export function bindGetDatabankSettings(loadUserSettings: SettingsService["loadUserSettings"]): DatabankContext["getDatabankSettings"] {
  return async (ownerId) => {
    const { databank } = await loadUserSettings(ownerId);
    return { chunk: databank.chunk, retrieval: databank.retrieval };
  };
}

export function buildDatabank(deps: DatabankComposeDeps): DatabankComposeResult {
  const { db, now, audit, embeddings, extractText, search, workloads, loadUserSettings } = deps;
  const databankCtx: DatabankContext = {
    db,
    now,
    newDocumentId: minter(ID_PREFIX.document),
    audit,
    // The ONE per-user freshness plane (the house injected-emit pattern — the domain never reaches at
    // transport, D38): every persisting verb fans `databankChanged`, and the ingest subsystem fans it once
    // per touched owner at a pass terminal (event-bus coverage survey H3).
    emitUserEvent: publishUserEvent,
    assetsStore: deps.assetsStore,
    loadAssetBytes: async (assetId): Promise<Uint8Array | undefined> => (await deps.loadAssetBytes(assetId)) ?? undefined,
    embeddingsStore: embeddings.store,
    pruneDocumentChunks: embeddings.pruneDocumentChunks,
    countChunks: embeddings.countDocumentChunks,
    extractText,
    extractorVersion: EXTRACTOR_VERSION,
    // The DB7 scrapeWeb port: infra/network's `fetchWebDocument` (the ANY_HOST arbitrary-URL class — no host
    // pin, but https + private-range denial run per hop; throws on refusal/non-2xx/cap, the verb maps it).
    fetchUrl: fetchWebDocument,
    getActiveEmbedSpace: () => ({ model: deps.embedModel(), dim: env.VLLM_EMBED_DIM }),
    // The OWNER's real databank settings (chunk params ingest uses + retrieval params gather passes to
    // search.documents) — the extracted binding (below), replacing the compose-stub-goes-stale 0-param stub.
    getDatabankSettings: bindGetDatabankSettings(loadUserSettings),
    searchDocuments: search.documents,
    enqueueIngest: async ({ documentId, ownerId }) => {
      const started = await workloads.start({ input: { kind: "databank-ingest", params: { documentId } }, caller: null, mode: "singular", ownerId });
      return { workloadId: started.id };
    },
    enqueueReindex: async ({ ownerId, scope, mode }) => {
      const started = await workloads.start({ input: { kind: "databank-reindex", params: { scope, mode } }, caller: null, mode: "singular", ownerId });
      return { workloadId: started.id };
    },
    ensureChatHost: (principal, chatId) => requireHost({ db, can }, principal, chatId).then((): void => undefined),
    ensureChatMember: (principal, chatId) => requireParticipant({ db, can }, principal, chatId).then((): void => undefined),
  };
  const databank = createDatabankService(databankCtx);
  const databankIngest: DatabankIngest = createDatabankIngest(databankCtx);
  return { databank, databankIngest, databankPortability: databankCtx };
}
