// Wire admin policy to session, producer and transport ops; the tool registry and export service are singletons.

import type { DatabaseHandle } from "@orb/db/wiring";
import type { IdSource, UserId } from "@orb/kit/ids";
import type { AdminCardEmbedDeps, AdminService, ServerRestartPort } from "#domain/admin";
import { can, createAdminCardEmbed, createAdminService, createAdminSessionPort } from "#domain/admin";
import type { CharacterService } from "#domain/character";
import type { EmbeddingsService } from "#domain/embeddings";
import type { ExportService } from "#domain/export";
import { createExportService } from "#domain/export";
import type { SessionsService } from "#domain/sessions";
import type { ToolUseService } from "#domain/tool-use";
import { createToolUseService } from "#domain/tool-use";
import type { AuditEntry } from "#foundation/observability";
import { createAuditWiring } from "#foundation/observability";
import type { LiveBuses } from "#transport/trpc";

import type { SessionSocketEviction } from "../http/index.ts";

/** Boot dependencies and precise sibling service capabilities wired into admin and export. */
export interface AdminComposeDeps {
  readonly emitUserEvent: LiveBuses["user"]["publishUserEvent"];

  readonly idSource: IdSource;
  readonly db: DatabaseHandle;
  readonly now: () => number;
  readonly newUserId: () => UserId;
  readonly hashPassword: (password: string) => Promise<string>;
  /** The same post-commit connection seed sessions consumes. */
  readonly seedUserConnections: (userId: UserId) => Promise<void>;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  readonly sessions: Pick<
    SessionsService,
    | "listForUser"
    | "revoke"
    | "revokeAllForUser"
    | "revokeAllForUserStatement"
    | "linkExternalIdStatement"
    | "settleUnclaimedLink"
    | "localUserInsertStatement"
    | "rolePolicy"
  >;
  /** Transport owns sockets; admin receives their eviction capability through its consumer port. */
  readonly sockets: SessionSocketEviction;
  readonly character: Pick<CharacterService, "getCard" | "loadCardText">;
  readonly embeddings: Pick<EmbeddingsService, "store">;
  /** The per-FUNDER role-client binder: the inline card embed writes into the CARD OWNER's own space (§7.5). */
  readonly roleClientsFor: AdminCardEmbedDeps["roleClientsFor"];
  /** CAS + the sharp image transform for the export service's character/chat bundle serialization. */
  readonly cas: Parameters<typeof createExportService>[0]["cas"];
  readonly imageTransform: Parameters<typeof createExportService>[0]["imageTransform"];
  /** D121-E: the card RE-EMBED op (a card's regex scripts are library rows now, not a column). */
  readonly exportCardScripts: Parameters<typeof createExportService>[0]["exportCardScripts"];
  /** R6: the chat-anchored rpg CAMPAIGN read the orb-native chat-bundle export carries. */
  readonly exportRpgGame: Parameters<typeof createExportService>[0]["exportRpgGame"];
  /** The process restart `admin.restart` drives; the lifecycle owns the close and the exit. */
  readonly serverRestart: ServerRestartPort;
}

/** The admin compose product: the admin service + the two singletons built here (the ONE tool-use registry and
 *  the export service). */
export interface AdminComposeResult {
  readonly admin: AdminService;
  readonly toolUse: ToolUseService;
  readonly exportService: ExportService;
}

export function buildAdmin(deps: AdminComposeDeps): AdminComposeResult {
  const { db, now, audit, sessions, character, embeddings } = deps;

  const admin = createAdminService({
    db,
    now,
    newUserId: deps.newUserId,
    hashPassword: deps.hashPassword,
    seedUserConnections: deps.seedUserConnections,
    audit,
    auditStatementAfterWrite: createAuditWiring(db, deps.idSource).statementAfterWrite,
    emitUserEvent: deps.emitUserEvent,
    sessions: createAdminSessionPort({
      listForUser: (userId) => sessions.listForUser(userId),
      revoke: (sessionId) => sessions.revoke(sessionId),
      revokeAllForUser: (userId) => sessions.revokeAllForUser(userId),
      revokeAllForUserStatement: sessions.revokeAllForUserStatement,
      linkExternalIdStatement: sessions.linkExternalIdStatement,
      settleUnclaimedLink: sessions.settleUnclaimedLink,
      localUserInsertStatement: sessions.localUserInsertStatement,
      evictUserSockets: (userId) => deps.sockets.evictUser(userId),
      isReservedHandle: sessions.rolePolicy.isReservedSignupHandle,
    }),
    embed: createAdminCardEmbed({
      getCard: (input) => character.getCard(input),
      loadCardText: (characterId) => character.loadCardText(characterId),
      store: (input) => embeddings.store(input),
      roleClientsFor: (userId) => deps.roleClientsFor(userId),
    }),
    serverRestart: deps.serverRestart,
  });

  // Registrants and consumers share one process-lifetime registry (D48).
  const toolUse = createToolUseService({ can, clock: now });

  const exportService = createExportService({
    db,
    cas: deps.cas,
    imageTransform: deps.imageTransform,
    exportCardScripts: deps.exportCardScripts,
    exportRpgGame: deps.exportRpgGame,
  });

  return { admin, toolUse, exportService };
}
