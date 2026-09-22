// Composition seam for the admin surfaces + two sibling singletons built alongside it: the ONE process-lifetime
// tool-use registry (buddy/imagery/rpg/plugin all register into this same instance) and the export service.
// Owns no business logic — it wires admin's session/vllm/embed sub-bundles onto the already-built sessions
// service, the provider backend registry's engine handle, and character/embeddings front doors.

import { EMBED_SPACE_DIMS } from "@orb/contracts/inference";
import type { SessionView } from "@orb/contracts/session";
import type { Db } from "@orb/db";
import type { RoleClientsWithSignal } from "@orb/inference";
import type { SessionId, UserId } from "@orb/kit/ids";
import type { AdminService } from "#domain/admin";
import { can, createAdminService } from "#domain/admin";
import type { CharacterService } from "#domain/character";
import type { EmbeddingsService } from "#domain/embeddings";
import type { ExportService } from "#domain/export";
import { createExportService } from "#domain/export";
import type { SessionsService } from "#domain/sessions";
import type { ToolUseService } from "#domain/tool-use";
import { createToolUseService } from "#domain/tool-use";
import type { AuditEntry } from "#foundation/observability";
import { buildAuditStatementIfPrecedingWrote } from "#foundation/observability";
import { publishUserEvent } from "../../transport/trpc/index.ts";
import type { SessionSocketEviction } from "../http/index.ts";

/** What the admin seam needs from the composition root: boot primitives + the sibling services admin's
 *  session/vllm/embed sub-bundles route through. `vllmEngine` is the registry's live engine handle (null when
 *  vLLM is disabled). */
export interface AdminComposeDeps {
  readonly db: Db;
  readonly now: () => number;
  readonly newUserId: () => UserId;
  readonly hashPassword: (password: string) => Promise<string>;
  /** #2481 — the per-user local-light seed `admin.createUser` runs after its audited batch commits.
   *  The SAME op `domain/sessions` gets, built once in `createServices`. */
  readonly seedUserConnections: (userId: UserId) => Promise<void>;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  readonly sessions: Pick<
    SessionsService,
    "listForUser" | "revoke" | "revokeAllForUser" | "revokeAllForUserStatement" | "linkExternalIdStatement" | "settleUnclaimedLink"
  >;
  /** W7a — the live-socket eviction edge for every admin revoke (see the wrapper below for the granularity
   *  ruling). Transport state, injected as a port: `domain/admin` may not import transport. */
  readonly sockets: SessionSocketEviction;
  readonly character: Pick<CharacterService, "getCard" | "loadCardText">;
  readonly embeddings: Pick<EmbeddingsService, "store">;
  /** The per-FUNDER role-client binder: the inline card embed writes into the CARD OWNER's own space (§7.5). */
  readonly roleClientsFor: (funderUserId: UserId) => Promise<Pick<RoleClientsWithSignal, "resolved">>;
  /** CAS + the sharp image transform for the export service's character/chat bundle serialization. */
  readonly cas: Parameters<typeof createExportService>[0]["cas"];
  readonly imageTransform: Parameters<typeof createExportService>[0]["imageTransform"];
  /** D121-E: the card RE-EMBED op (a card's regex scripts are library rows now, not a column). */
  readonly exportCardScripts: Parameters<typeof createExportService>[0]["exportCardScripts"];
  /** R6: the chat-anchored rpg CAMPAIGN read the orb-native chat-bundle export carries. */
  readonly exportRpgGame: Parameters<typeof createExportService>[0]["exportRpgGame"];
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
    // #1691 — the ATOMIC audit channel for the privileged writes (create/reset-password/set-role/
    // set-enabled). `audit` above stays `logAudit` (best-effort, suppress → count → drop) for the advisory
    // verbs; this seam hands back an UNEXECUTED, `changes()`-guarded insert that rides the privileged write's
    // own batch, so the write and its forensic row commit together or neither does.
    auditStatementAfterWrite: (entry, at) => buildAuditStatementIfPrecedingWrote(db, entry, at),
    // W7b — the identity freshness plane. The house injected-emit pattern (the domain never reaches at
    // transport, D38); admin is the one producer whose channel is the TARGET user's, never the actor's.
    emitUserEvent: publishUserEvent,
    sessions: {
      // SessionView deliberately omits userId; re-stamp it onto each row.
      listForUser: async (userId: UserId): Promise<readonly (SessionView & { userId: UserId })[]> => {
        const views = await sessions.listForUser(userId);
        return views.map((view): SessionView & { userId: UserId } => ({ ...view, userId }));
      },
      // W7a — every admin revoke ends the STREAMS its sessions opened, not just the cookies. Composed here
      // rather than inside `domain/admin`/`domain/sessions`: the socket registry is transport state and a
      // domain may not import transport (one-directional flow), so this wrapper is the seam that already
      // exists between them. PER-USER, owner-ruled (F4: "admin REVOKE stays per-user") — including the
      // single-device arm, which reads as narrower but is not: an admin kick is a statement about the
      // account, the human's other devices hold valid cookies and resume in one reconnect through the
      // existing barrier, and per-user is the ONLY arm that also reaches sockets admitted with no session
      // row at all (the owner fallback / forward-header SSO), which a session id cannot name.
      revoke: async (sessionId: SessionId): Promise<void> => {
        const owner = await sessions.revoke(sessionId);
        if (owner !== null) {
          deps.sockets.evictUser(owner);
        }
      },
      revokeAllForUser: async (userId: UserId): Promise<number> => {
        const revoked = await sessions.revokeAllForUser(userId);
        deps.sockets.evictUser(userId);
        return revoked;
      },
      // #1691 — the same kick, SPLIT: the DB half is handed to the caller unexecuted so it can ride the
      // privileged write's batch (a credential rotation must not survive a failed kick), and the live-socket
      // half is called by the verb after that batch commits. The executed wrapper above keeps both halves
      // for `admin.revokeUserSessions`, whose whole action IS the kick.
      revokeAllForUserStatement: sessions.revokeAllForUserStatement,
      evictUserSockets: (userId: UserId): void => {
        deps.sockets.evictUser(userId);
      },
      // B5/#1707 — the bind-once linking capability (domain/sessions), SPLIT the same way the kick is: the
      // identity bind rides the admin verb's audited batch unexecuted, and the settlement read explains a
      // claim that bound nothing. admin gates + audits around both.
      linkExternalIdStatement: sessions.linkExternalIdStatement,
      settleUnclaimedLink: sessions.settleUnclaimedLink,
    },
    embed: {
      embedCharacterCard: async (principal, characterId): Promise<boolean> => {
        const card = await character.getCard({ principal, characterId });
        if (card === null) {
          return false;
        }
        const text = await character.loadCardText(characterId);
        if (text === null || text.length === 0) {
          return false;
        }
        // The card owner IS the acting admin here (`getCard` is Principal-scoped), so their `embed` binding
        // names the space; no binding ⇒ nothing to embed into, reported as `false` like an empty card.
        const space = await (await deps.roleClientsFor(principal.userId)).resolved("embed");
        if (space === null) {
          return false;
        }
        await embeddings.store({
          kind: "card",
          lens: "card-text",
          ownerId: principal.userId,
          characterId,
          content: text,
          model: space.model,
          dim: EMBED_SPACE_DIMS,
        });
        return true;
      },
    },
  });

  // The ONE tool-use registry (process-lifetime; tool-use-design/01 §3) — built here, before its registrants
  // and consumers (chat below reads the same instance). Buddy is the first registrant: its curated tools
  // register ONCE (owner read from the exec context per turn, never a compose-time closure), and its `ask`
  // resolves them per turn through the SAME registry, projecting via toToolDefinitions (T5).
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
