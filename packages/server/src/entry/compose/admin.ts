// Composition seam for the admin surfaces + two sibling singletons built alongside it: the ONE process-lifetime
// tool-use registry (buddy/imagery/rpg/plugin all register into this same instance) and the export service.
// Owns no business logic — it wires admin's session/vllm/embed sub-bundles onto the already-built sessions
// service, the provider backend registry's engine handle, and character/embeddings front doors.

import type { SessionView } from "@orb/contracts/session";
import type { Db } from "@orb/db";
import type { SessionId, UserId } from "@orb/kit/ids";
import type { AdminEngineStatus, AdminService } from "#domain/admin";
import { can, createAdminService } from "#domain/admin";
import type { CharacterService } from "#domain/character";
import type { EmbeddingsService } from "#domain/embeddings";
import type { ExportService } from "#domain/export";
import { createExportService } from "#domain/export";
import type { SessionsService } from "#domain/sessions";
import type { ToolUseService } from "#domain/tool-use";
import { createToolUseService } from "#domain/tool-use";
import { env } from "#foundation/env";
import type { AuditEntry } from "#foundation/observability";
import type { EngineDeploymentFacts, RoleClientsWithSignal, VllmEngineHandle } from "#infra/providers";
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
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  readonly sessions: Pick<SessionsService, "listForUser" | "revoke" | "revokeAllForUser" | "linkExternalId">;
  /** W7a — the live-socket eviction edge for every admin revoke (see the wrapper below for the granularity
   *  ruling). Transport state, injected as a port: `domain/admin` may not import transport. */
  readonly sockets: SessionSocketEviction;
  readonly vllmEngine: VllmEngineHandle | null;
  readonly character: Pick<CharacterService, "getCard" | "loadCardText">;
  readonly embeddings: Pick<EmbeddingsService, "store">;
  /** The ACTIVE embed-space model tag, read per call — a thunk, never a captured string, because
   *  `roleClients.embedModel` is now a live getter that follows a role re-point (`role-clients.ts` header).
   *  Capturing it here would re-freeze at compose exactly what that binder stopped freezing. */
  readonly embedModel: () => RoleClientsWithSignal["embedModel"];
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
  const { db, now, audit, sessions, vllmEngine, character, embeddings } = deps;

  const admin = createAdminService({
    db,
    now,
    newUserId: deps.newUserId,
    hashPassword: deps.hashPassword,
    audit,
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
      // B5 — the bind-once linking capability (domain/sessions); admin gates + audits around it.
      linkExternalId: (userId, externalId) => sessions.linkExternalId(userId, externalId),
    },
    vllm: {
      // Merge the live lifecycle record with each engine's env-only DEPLOYMENT facts (port + store path)
      // into the AdminEngineStatus read-model the panel renders read-only. Both maps are keyed by engine.
      allEngineStatuses: (): Record<string, AdminEngineStatus> => {
        if (vllmEngine === null) {
          return {};
        }
        const statuses = vllmEngine.status();
        // Widen to a string index so a status key with no matching deployment fact resolves to `undefined`
        // (honest guard) rather than being asserted present by the branded engine key.
        const facts: Record<string, EngineDeploymentFacts | undefined> = vllmEngine.deployment();
        return Object.fromEntries(
          Object.entries(statuses).map(([engine, record]) => {
            const deployment = facts[engine];
            return [engine, { ...record, port: deployment?.port ?? 0, storePath: deployment?.storePath ?? "" }];
          }),
        );
      },
      restartEngine: (name: string): Promise<string> =>
        vllmEngine === null ? Promise.resolve("vllm supervisor not running") : vllmEngine.restart(name as Parameters<VllmEngineHandle["restart"]>[0]),
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
        await embeddings.store({
          kind: "card",
          lens: "card-text",
          characterId,
          content: text,
          model: deps.embedModel(),
          dim: env.VLLM_EMBED_DIM,
        });
        return true;
      },
    },
  });

  // The ONE tool-use registry (process-lifetime; tool-use-design/01 §3) — built here, before its registrants
  // and consumers (chat below reads the same instance). Buddy is the first registrant: its curated tools
  // register ONCE (owner read from the exec context per turn, never a compose-time closure), and its `ask`
  // resolves them per turn through the SAME registry, projecting via toAgentToolServer (T5).
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
