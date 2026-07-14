// Chat domain's slice of the composition root: wires the widest DI bundle in the system (ChatContext +
// ChatServiceDeps). Owns no business logic.
//
// Identity impedance: chat's cross-feature ops are keyed by the frozen host `UserId` (the host may be
// offline, so no request Principal exists). Two bridges: role-irrelevant ops use the cheap synthetic
// `hostPrincipal`; role-sensitive ops (owner-gates) use the injected `resolveHostPrincipal`.

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { ResolvedConnection, RouteChatAssignment } from "@orb/contracts/connection";
import type { AgentSourceKind, Can, Principal } from "@orb/contracts/identity";
import type { ChoiceBlockSpec, PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { RoleClients } from "@orb/contracts/role-clients";
import type { BatchStmt, Db } from "@orb/db";
import { characterPersonas, chatParticipants, chats, personas, users } from "@orb/db";
import type { AssetId, ChatId, Handle, PersonaId, PresetId, TypeIdOf, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { PersonaDescriptionPlacement } from "@orb/kit/persona";
import { resolvePersonaDescriptionPlacement } from "@orb/kit/persona";
import { and, eq, isNull } from "drizzle-orm";
import type { AssetsService } from "#domain/assets";
import type { CharacterService } from "#domain/character";
import type {
  ChatContext,
  ChatService,
  ChatServiceDeps,
  ChatToolOps,
  ChatToolSet,
  MemoryConfig,
  PresenceReadOp,
  TurnMessage,
  TurnRequest,
  TurnStreamChunk,
} from "#domain/chat";
import {
  backfillGroupCharacters,
  backfillMemory,
  createActiveTurns,
  createChatService,
  getGroupConfig,
  getRoomOverrides,
  parseChatMetadata,
} from "#domain/chat";
import type { ConnectionService } from "#domain/connection";
import type { CredentialsService } from "#domain/credentials";
import type { EmbeddingsService } from "#domain/embeddings";
import type { ImageryService } from "#domain/imagery";
import type { NotificationsService } from "#domain/notifications";
import type { PersonaService } from "#domain/persona";
import type { PresetService } from "#domain/preset";
import type { SearchService } from "#domain/search";
import { createTokenHasher } from "#domain/sessions";
import type { SettingsService } from "#domain/settings";
import { applyStatsDelta } from "#domain/stats";
import type { ResolvedToolSet, ToolUseService } from "#domain/tool-use";
import { env } from "#foundation/env";
import type { AuditEntry } from "#foundation/observability";
import { recordMemoryLog } from "#foundation/observability";
import type { AgentSeedTurn, ChatDeltaEvent, ChatRequest, ChatResult } from "#infra/providers";
import { AGENT_PROMPT_TAIL_JOINER } from "#infra/providers";
import { createRegexApplyReplace } from "#kit/regex";
import { createMemberBudget } from "../../transport/rate-limit";
import { publishNotification } from "../../transport/trpc";
import { createChatChangedEmitter } from "./emit-chat-changed";
import { resolveImageRefToUrl } from "./resolve-image-ref";

/** Per-chat turn-lock TTL (ms) — auto-expires so a crashed holder's lock is takeover-eligible. */
const CHAT_LOCK_TTL_MS = 120_000;
const MEMBER_BUDGET_WINDOW_MS = 86_400_000;

function minter<P extends string>(prefix: P): () => TypeIdOf<P> {
  return (): TypeIdOf<P> => mintTypeId(prefix);
}

// Agent-sdk turn shape: the stateful backend wants a session seed (transcript before this turn) + a prompt
// tail (trailing user rows). With both it resumes its cached session and reseeds on divergence, so history
// rides the session instead of being re-sent flattened every turn. No clean user tail (continue-mode, or a
// tool row) falls back to the pre-existing flatten (one prompt string, fresh throwaway session).

/** One rendered row: image parts become a placeholder (no vision on this path); the wire `name` label is
 *  stamped into the text (agent-sdk seed frames carry no `name` field). */
function agentRowText(m: TurnMessage): string {
  const text = m.content.map((c) => (c.type === "text" ? c.text : "[Image]")).join("");
  return m.name !== undefined && m.name.length > 0 ? `${m.name}: ${text}` : text;
}

/** The legacy flatten (no-seed fallback): the whole history as one role-labeled blob. Exported for bridge
 *  tests only — not a composition surface. */
export function flattenAgentHistory(history: readonly TurnMessage[]): string {
  return history
    .map((m) => {
      const prefix = m.role === "assistant" ? "Assistant" : "User";
      const name = m.name ? ` (${m.name})` : "";
      const text = m.content.map((c) => (c.type === "text" ? c.text : "[Image]")).join("");
      return `${prefix}${name}: ${text}`;
    })
    .join("\n\n");
}

/** Split the shaped history into the session seed + the joined prompt tail; `null` when the history has
 *  no clean user tail (the caller falls back to {@link flattenAgentHistory}). */
export function splitAgentHistory(
  history: readonly TurnMessage[],
): { seed: readonly AgentSeedTurn[]; prompt: string } | null {
  if (history.some((m) => m.role === "tool")) {
    return null;
  }
  let lastAssistant = -1;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === "assistant") {
      lastAssistant = i;
      break;
    }
  }
  const tail = history.slice(lastAssistant + 1);
  if (tail.length === 0) {
    return null;
  }
  const prompt = tail
    .map(agentRowText)
    .filter((t) => t.length > 0)
    .join(AGENT_PROMPT_TAIL_JOINER);
  if (prompt.length === 0) {
    return null;
  }
  const seed = history.slice(0, lastAssistant + 1).map(
    (m): AgentSeedTurn => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: agentRowText(m),
    }),
  );
  return { seed, prompt };
}

/** What `buildChatService` needs from the composition root — boot primitives + the already-built sibling
 *  services chat's injected ops route through (their front doors only). */
export interface ChatComposeInput {
  /** Optional — absent wires `ChatContext.tools` to null (byte-identical no-op). */
  readonly toolUse?: ToolUseService | undefined;
  readonly db: Db;
  readonly now: () => number;
  /** The one chat bus's durable-first emit, built at the composition root and injected so chat doesn't
   *  construct a second bus. The same wrapper backs persona's active-persona write. */
  readonly emitChatEvent: (event: ChatBusEvent) => Promise<void>;
  /** The lock-holder tag for this replica (also used by the boot lock reclaim). */
  readonly holder: string;
  readonly sessionSecret: string | null;
  /** The frozen-host → `Principal` bridge for role-sensitive ops. */
  readonly resolveHostPrincipal: (userId: UserId) => Promise<Principal>;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  readonly can: Can;
  readonly roleClients: RoleClients;
  readonly connection: ConnectionService;
  readonly credentials: CredentialsService;
  readonly character: CharacterService;
  readonly persona: PersonaService;
  readonly preset: PresetService;
  readonly settings: SettingsService;
  readonly notifications: NotificationsService;
  readonly resolveHandle: (handle: Handle) => Promise<UserId | null>;
  readonly provisionAgentPrincipal: (params: {
    readonly ownerUserId: UserId;
    readonly sourceKind: AgentSourceKind;
  }) => Promise<{ readonly agentUserId: UserId; readonly created: boolean }>;
  readonly search: SearchService;
  readonly embeddings: EmbeddingsService;
  readonly runChatTurn: (req: ChatRequest) => Promise<ChatResult>;
  readonly assets: AssetsService;
  readonly readPresence: PresenceReadOp;
  /** imagery's orchestrator → chat's `generatePicture` op (mapped to the chat-local structural result below). */
  readonly generatePicture: ImageryService["generatePicture"];
}

/** The chat compose product: the service + the bus's durable-first emit, surfaced for other producers that
 *  publish onto the chat bus (e.g. world-info). */
export interface ChatComposeResult {
  readonly service: ChatService;
  readonly emitBusEvent: (event: ChatBusEvent) => Promise<void>;
  /** Chat's corpus sweeps, bound over the chat ctx. */
  readonly backfill: {
    readonly memory: (args: {
      signal: AbortSignal;
      ownerId?: UserId | null;
    }) => ReturnType<typeof backfillMemory>;
    readonly groupCharacters: (args: {
      signal: AbortSignal;
      ownerId?: UserId | null;
    }) => ReturnType<typeof backfillGroupCharacters>;
  };
}

/**
 * Construct the chat `ChatService` + its bus, wiring every {@link ChatContext} op + {@link ChatServiceDeps}
 * collaborator. Returns the service AND the bus emit.
 */
// chat's opaque ChatToolSet IS the ResolvedToolSet this seam minted; the exec frame's runAsUserId resolves
// to the live host Principal here (the engine itself stays Principal-blind).
function buildChatToolOps(
  toolUse: ToolUseService,
  resolveHostPrincipal: (userId: UserId) => Promise<Principal>,
): ChatToolOps {
  // biome-ignore lint/suspicious/noExplicitAny: the opaque ChatToolSet round-trip (see the header note).
  const asResolvedSet = (set: ChatToolSet): ResolvedToolSet => set as any as ResolvedToolSet;
  return {
    resolveTools: (names) => toolUse.resolveTools(names),
    toWireTools: (set) => toolUse.toWireTools(asResolvedSet(set)),
    executeToolCalls: async (set, calls, frame) =>
      toolUse.executeToolCalls(asResolvedSet(set), calls, {
        principal: await resolveHostPrincipal(frame.runAsUserId),
        triggeredBy: frame.triggeredBy,
        chatId: frame.chatId,
        roster: frame.roster,
        ...(frame.signal !== undefined ? { signal: frame.signal } : {}),
      }),
  };
}

export function buildChatService(input: ChatComposeInput): ChatComposeResult {
  const { db, now, emitChatEvent } = input;

  // Role-irrelevant ops (getCard/persona.get/mint) use this cheap synthetic principal to avoid a per-call read.
  const hostPrincipal = (userId: UserId): Principal => ({
    userId,
    role: "user",
    handle: castId<Handle>(userId),
    externalId: null,
    via: "fallback",
  });

  // Role-sensitive ops need the host's REAL role — a fabricated `role:"user"` would fail-closed-deny an
  // owner's own privileged turn, so this read is injected rather than faked.
  const realHostPrincipal = input.resolveHostPrincipal;

  const resolveChatVia = async (
    userId: UserId,
    routable: RouteChatAssignment,
  ): Promise<ResolvedConnection> =>
    input.connection.resolveChat({
      principal: await realHostPrincipal(userId),
      routableChat: routable,
    });

  // The host's active preset config, given its already-loaded default preset id. A stale/unowned/missing id
  // degrades to the system default. Shared by resolveForeignInputs + resolvePromptVariables so resolution
  // can't drift; takes the id (not the whole settings read) so a caller that already loaded it doesn't double-read.
  const resolvePromptConfigFor = async (
    runAsUserId: UserId,
    defaultPresetId: string | null,
  ): Promise<PromptConfig> => {
    if (defaultPresetId === null) {
      return DEFAULT_PROMPT_CONFIG;
    }
    try {
      const detail = await input.preset.get({
        userId: runAsUserId,
        id: castId<PresetId>(defaultPresetId),
      });
      return detail.config;
    } catch {
      return DEFAULT_PROMPT_CONFIG;
    }
  };

  // The chat's PRESENT host (role='host', leftSeq NULL) — the room authority whose settings/library the
  // room draws from (D19; every roster character is host-owned per PD-21). `null` ⇒ a hostless/stale room.
  const resolveChatHostUserId = async (chatId: ChatId): Promise<UserId | null> => {
    const hostRows = await db
      .select({ userId: chatParticipants.userId })
      .from(chatParticipants)
      .where(
        and(
          eq(chatParticipants.chatId, chatId),
          eq(chatParticipants.role, "host"),
          isNull(chatParticipants.leftSeq),
        ),
      )
      .limit(1);
    return hostRows.at(0)?.userId ?? null;
  };

  // The chat's active preset's ChoiceBlock variables, resolved under the chat's host. Hostless/stale room
  // ⇒ no declared variables.
  const resolvePromptVariables = async (chatId: ChatId): Promise<readonly ChoiceBlockSpec[]> => {
    const hostUserId = await resolveChatHostUserId(chatId);
    if (hostUserId === null) {
      return [];
    }
    const us = await input.settings.loadUserSettings(hostUserId);
    const config = await resolvePromptConfigFor(hostUserId, us.seeds.defaultPresetId);
    return config.variables;
  };

  // The one memory-config merge: the admin-set defaults, forced to `mode:"off"` when the host disabled
  // memory. Kept pure so both the live turn path and the sweep resolver funnel through it without
  // re-reading settings — the opt-out can't be honored on the turn and dropped on the sweep.
  const withMemoryOptOut = (disabled: boolean, defaults: MemoryConfig): MemoryConfig =>
    disabled ? { ...defaults, mode: "off" } : defaults;

  const resolveMemoryConfig = async (hostUserId: UserId): Promise<MemoryConfig> => {
    const us = await input.settings.loadUserSettings(hostUserId);
    const defaults = input.settings.getEffectiveConfig().memoryDefaults;
    return withMemoryOptOut(us.memory.enabled === false, defaults);
  };

  const chatCtx: ChatContext = {
    db,
    now,
    can: input.can,
    newChatId: minter(ID_PREFIX.chat),
    newMessageId: minter(ID_PREFIX.message),
    newMessageVariantId: minter(ID_PREFIX.messageVariant),
    newMessageAssetId: minter(ID_PREFIX.messageAsset),
    newParticipantId: minter(ID_PREFIX.chatParticipant),
    newInjectionId: minter(ID_PREFIX.chatInjection),
    newEventId: minter(ID_PREFIX.chatEvent),
    newStreamEventId: minter(ID_PREFIX.chatStreamEvent),
    newInviteId: minter(ID_PREFIX.chatInvite),
    newPendingTurnId: minter(ID_PREFIX.pendingTurn),
    hashToken: createTokenHasher(input.sessionSecret),
    audit: input.audit,
    // Fans chatsChanged to every present human member's channel; the engine passes a bare chatId
    // (principal-blind) — this composition-root helper enumerates membership.
    emitChatChanged: createChatChangedEmitter(db),
    applyRegexReplace: createRegexApplyReplace(),
    tools:
      input.toolUse === undefined
        ? null
        : buildChatToolOps(input.toolUse, input.resolveHostPrincipal),
    // Bridges the chat role's streaming AsyncIterable interface onto infra/providers' Promise+onDelta shape.
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: adapter logic
    async *runChatTurn(req: TurnRequest): AsyncIterable<TurnStreamChunk> {
      const queue: TurnStreamChunk[] = [];
      let done = false;
      let error: unknown = null;
      let notify: (() => void) | null = null;

      const onDelta = (delta: ChatDeltaEvent) => {
        queue.push({ kind: delta.kind, text: delta.text });
        if (notify) {
          notify();
          notify = null;
        }
      };

      const agentSplit = req.connection.api === "agent-sdk" ? splitAgentHistory(req.history) : null;
      // The OR-skin tier→slug map the mode-2 firewall needs, derived from connection's live catalogs
      // (never throws — cold catalog degrades to a curated shortlist).
      const orSkinTierModels =
        req.connection.api === "agent-sdk"
          ? await input.connection.getOrSkinTierModels()
          : undefined;
      const chatReq: ChatRequest =
        req.connection.api === "agent-sdk" && orSkinTierModels !== undefined
          ? {
              api: "agent-sdk",
              model: req.connection.model,
              credential: req.connection.credential,
              capability: req.connection.capability,
              params: req.intent,
              systemPrompt: { static: req.prompt.static, dynamic: req.prompt.dynamic },
              orSkinTierModels,
              ownerConsented: req.ownerConsented,
              ...(agentSplit !== null
                ? { chatId: req.chatId, seed: agentSplit.seed, prompt: agentSplit.prompt }
                : { prompt: flattenAgentHistory(req.history) }),
              onDelta,
              signal: req.signal,
            }
          : {
              api: req.connection.api as "chat-completions" | "responses",
              model: req.connection.model,
              credential: req.connection.credential,
              capability: req.connection.capability,
              params: req.intent,
              systemPrompt: { static: req.prompt.static, dynamic: req.prompt.dynamic },
              ownerConsented: req.ownerConsented,
              // biome-ignore lint/suspicious/noExplicitAny: interface mismatch
              history: req.history as any,
              historyCacheBreakpointFromEnd: req.cacheBreakpointFromEnd ?? undefined,
              ...(req.tools !== undefined ? { tools: req.tools } : {}),
              ...(req.toolChoice !== undefined ? { toolChoice: req.toolChoice } : {}),
              onDelta,
              signal: req.signal,
            };

      void input
        .runChatTurn(chatReq)
        .then((result) => {
          queue.push({
            kind: "final",
            economics: {
              content: result.reply,
              reasoning: result.reasoning || null,
              model: req.connection.model,
              tokensIn: result.usage.tokensIn,
              tokensOut: result.usage.tokensOut,
              cacheReadTokens: result.usage.cacheReadTokens,
              cacheWriteTokens: result.usage.cacheWriteTokens,
              contextWindow: result.usage.contextWindow,
              costUsd: result.usage.costUsd,
              maxOutputTokens: result.usage.maxOutputTokens,
              reasoningEffort: req.intent.effort ?? null,
              ttftMs: result.ttftMs,
              finishReason: result.finishReason,
              stopReason: result.stopReason,
              terminalReason: result.terminalReason,
              generationId: result.generationId ?? null,
              ...(result.toolCalls !== undefined ? { toolCalls: result.toolCalls } : {}),
            },
          });
          done = true;
          if (notify) {
            notify();
            notify = null;
          }
        })
        .catch((err) => {
          error = err;
          done = true;
          if (notify) {
            notify();
            notify = null;
          }
        });

      // biome-ignore lint/suspicious/noUnnecessaryConditions: intentional infinite loop
      while (true) {
        if (queue.length > 0) {
          // biome-ignore lint/style/noNonNullAssertion: safe since queue.length > 0
          yield queue.shift()!;
        } else if (done) {
          if (error) {
            throw error;
          }
          break;
        } else {
          // biome-ignore lint/performance/noAwaitInLoops: waiting for next chunk
          // biome-ignore lint/nursery/noLoopFunc: simple promise
          await new Promise<void>((resolve) => {
            notify = resolve;
          });
        }
      }
    },
    resolveChat: (params) => resolveChatVia(params.runAsUserId, params.routable),
    resolveCredential: async ({ runAsUserId, source }) =>
      input.credentials.resolve({ principal: await realHostPrincipal(runAsUserId), source }),
    maybeRevokeOnAuthFailed: async ({ runAsUserId, source, status }) => {
      try {
        // biome-ignore lint/style/noMagicNumbers: HTTP status codes
        if (status === 401 || status === 403) {
          const cred = await input.credentials.resolve({
            principal: await realHostPrincipal(runAsUserId),
            source,
          });
          await input.credentials.maybeRevokeOnAuthFailed({
            credentialId: cred.credentialId,
            // biome-ignore lint/style/noMagicNumbers: HTTP status code 401
            errorKind: status === 401 ? "unauthorized" : "forbidden",
            errorMessage: `Automatic revocation from chat API auth failure (HTTP ${status})`,
          });
        }
      } catch {
        // Best-effort post-turn — never throw into the turn.
      }
    },
    getCard: ({ ownerId, characterId }) =>
      input.character.getCard({ principal: hostPrincipal(ownerId), characterId }),
    // Layers the character's tri-state overrides over the deployment floor; a human seat or an
    // unreadable card resolves to the global floor alone (fail-closed, never a throw into roster assembly).
    resolveRenderPolicy: async ({ ownerId, characterId }) => {
      const cfg = input.settings.getEffectiveConfig();
      const global = { trustHtml: cfg.trustHtml, forbidExternalMedia: cfg.forbidExternalMedia };
      if (characterId === null || ownerId === null) {
        return global;
      }
      try {
        const detail = await input.character.get({
          principal: hostPrincipal(ownerId),
          characterId,
        });
        return {
          trustHtml: detail.trustHtml ?? global.trustHtml,
          forbidExternalMedia: detail.forbidExternalMedia ?? global.forbidExternalMedia,
        };
      } catch {
        return global;
      }
    },
    // The character's raw theme column, unmerged (client-side ThemeScope nesting decides the merge).
    resolveThemeOverride: async ({ ownerId, characterId }) => {
      if (characterId === null || ownerId === null) {
        return null;
      }
      try {
        const detail = await input.character.get({
          principal: hostPrincipal(ownerId),
          characterId,
        });
        return detail.themeOverride;
      } catch {
        return null;
      }
    },
    mintSyntheticGroupCharacter: (params) => input.character.mintSyntheticGroupCharacter(params),
    findSyntheticGroupCharacter: (params) => input.character.findSyntheticGroupCharacter(params),
    resolveUserPublics: async (userId, personaId) => {
      const rows = await db
        .select({ handle: users.handle })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const handle = rows[0]?.handle ?? null;

      let avatarAssetId: AssetId | null = null;
      let displayName: string | null = handle;

      if (personaId !== null) {
        const p = (
          await db
            .select({ name: personas.name, avatarAssetId: personas.avatarAssetId })
            .from(personas)
            .where(and(eq(personas.id, personaId), eq(personas.ownerId, userId)))
            .limit(1)
        )[0];

        if (p) {
          displayName = p.name;
          avatarAssetId = p.avatarAssetId;
        }
      }

      if (avatarAssetId === null) {
        try {
          const userSettings = await input.settings.loadUserSettings(userId);
          const raw = userSettings.profile.avatarAssetId ?? null;
          avatarAssetId = raw === null ? null : castId<AssetId>(raw);
        } catch {
          // ignore
        }
      }

      return {
        displayName,
        handle,
        avatarAssetId,
      };
    },
    // The gate reader answers "is this asset's owner a present member of the referencing chat?" — a
    // scoped chat_participants read.
    resolveImageUrl: (params) =>
      resolveImageRefToUrl(
        input.assets,
        async (userId, forChatId) => {
          const rows = await db
            .select({ id: chatParticipants.id })
            .from(chatParticipants)
            .where(
              and(
                eq(chatParticipants.userId, userId),
                eq(chatParticipants.chatId, forChatId),
                isNull(chatParticipants.leftSeq),
              ),
            )
            .limit(1);
          return rows.length > 0;
        },
        input.settings.getEffectiveConfig().forbidExternalMedia,
        params,
      ),
    // A hash is not a secret; the owner-gate lives on the blob route's byte read, not here.
    resolveAssetHash: async (assetId) => {
      if (assetId === null) {
        return null;
      }
      const ref = await input.assets.assetCasRefById(assetId);
      return ref?.hash ?? null;
    },
    // Owner-scoped: a foreign/gone id is simply absent from the result.
    filterOwnedAssetIds: async (userId, assetIds) =>
      (await input.assets.resolveOwnedAssetRefs(userId, assetIds)).map((r) => r.assetId),
    // The chat op type erases the batch to `unknown`; this wrapper restores the concrete type.
    applyStatsDelta: (batch, opDb, delta) => {
      applyStatsDelta(batch as BatchStmt[], opDb, delta);
    },
    summarize: input.roleClients.summarize,
    summarizerContextTokens: input.roleClients.summarizerContextTokens,
    // record INSERTs the row (assigning seq) THEN the persisted view is published onto the live bus —
    // a dead bus path never loses an event (subscriptions replay from the table by seq).
    resolveHandle: (handle) => input.resolveHandle(handle),
    // A missing row → disabled (fail-closed containment).
    provisionAgentPrincipal: (params) => input.provisionAgentPrincipal(params),
    resolveAgentEnabled: async (agentUserId) => {
      const rows = await db
        .select({ enabled: users.enabled })
        .from(users)
        .where(eq(users.id, agentUserId))
        .limit(1);
      return rows[0]?.enabled ?? false;
    },
    // A solo-character founding with exactly ONE character_personas connection auto-anchors that persona;
    // 0 or 2+ connections (ambiguity) or a group founding falls through to the default seed.
    resolveConnectedPersona: async (userId, characterIds) => {
      const [characterId] = characterIds;
      if (characterId === undefined || characterIds.length !== 1) {
        return null;
      }
      const rows = await db
        .select({ personaId: characterPersonas.personaId })
        .from(characterPersonas)
        .innerJoin(personas, eq(personas.id, characterPersonas.personaId))
        .where(and(eq(characterPersonas.characterId, characterId), eq(personas.ownerId, userId)))
        .limit(2);
      const [only] = rows;
      return rows.length === 1 && only !== undefined ? only.personaId : null;
    },
    resolveDefaultPersona: async (userId) => {
      const us = await input.settings.loadUserSettings(userId);
      const raw = us.seeds.defaultPersonaId;
      if (raw === null) {
        return null;
      }
      try {
        const persona = await input.persona.get({
          principal: hostPrincipal(userId),
          personaId: castId<PersonaId>(raw),
        });
        return persona.id;
      } catch {
        return null;
      }
    },
    resolveCurrentPersona: async (userId) => {
      const us = await input.settings.loadUserSettings(userId);
      const raw = us.seeds.currentPersonaId;
      if (raw === null) {
        return null;
      }
      try {
        const persona = await input.persona.get({
          principal: hostPrincipal(userId),
          personaId: castId<PersonaId>(raw),
        });
        return persona.id;
      } catch {
        return null;
      }
    },
    // Absent/foreign ⇒ false (leak-free).
    verifyPersonaOwned: async ({ ownerId, personaId }) => {
      const rows = await db
        .select({ ownerId: personas.ownerId })
        .from(personas)
        .where(eq(personas.id, personaId))
        .limit(1);
      return rows[0]?.ownerId === ownerId;
    },
    emitNotification: async (event, coStatements) => {
      const view = await input.notifications.record({
        event,
        ...(coStatements !== undefined ? { coStatements } : {}),
      });
      publishNotification(view);
    },
    // Server-derived — never a client-asserted (spoofable) heartbeat.
    readPresence: input.readPresence,
    // Maps imagery's GeneratedPicture → chat's chat-local structural result (chat can't import
    // domain/imagery's types).
    generatePicture: async (p) => {
      const picture = await input.generatePicture({
        caller: p.caller,
        chatId: p.chatId,
        mode: p.mode,
        ...(p.prompt !== undefined ? { prompt: p.prompt } : {}),
        ...(p.n !== undefined ? { n: p.n } : {}),
      });
      return {
        images: picture.images.map((img) => ({ assetId: img.assetId })),
        warnings: picture.warnings.map((w) => ({ code: w.code, detail: w.detail })),
      };
    },
    embeddingsStore: async (params) => {
      if (params.lens === "digest") {
        await input.embeddings.store({
          kind: "chat-block",
          lens: "digest",
          chatId: params.key.chatId,
          scopedCharacterId: params.key.scopedCharacterId,
          isGroup: params.isGroup,
          tier: params.key.tier,
          blockIdx: params.key.blockIdx,
          text: params.text,
          topicAnchor: params.topicAnchor,
          keywords: params.keywords,
          speakerCharacterIds: params.speakerCharacterIds,
          contentHash: params.contentHash,
          model: input.roleClients.embedModel,
          dim: env.VLLM_EMBED_DIM,
        });
        return;
      }
      await input.embeddings.store({
        kind: "chat-block",
        lens: "segment",
        chatId: params.chatId,
        blockIdx: params.blockIdx,
        seqStart: params.seqStart,
        seqEnd: params.seqEnd,
        text: params.text,
        contentHash: params.contentHash,
        model: input.roleClients.embedModel,
        dim: env.VLLM_EMBED_DIM,
      });
    },
    searchDigests: (query) =>
      input.search.digests(query).then((hits) => hits.map((h) => h.blockKey)),
    // The owner-wide corpus lens. MemoryQueryOptions deliberately carries no owner, so the owner is
    // resolved FROM CONTEXT here: the chat's present host (D19 — the room authority; every roster character
    // is host-owned per PD-21, so the host's corpus IS this room's corpus). Hostless/stale room ⇒ empty
    // (leak-free unknown-owner, the resolvePromptVariables posture); an empty queryText propagates the
    // corpus verb's own SEARCH_EMPTY_QUERY refusal (flag-don't-fake).
    searchCorpus: async (query) => {
      const hostUserId = await resolveChatHostUserId(query.scope.chat);
      if (hostUserId === null) {
        return [];
      }
      const hits = await input.search.corpus({
        ownerId: hostUserId,
        queryText: query.queryText ?? "",
        mode: query.mode,
        minScore: query.minScore,
      });
      return hits.map((h) => h.blockKey);
    },
    log: (entry) => recordMemoryLog(entry),
    getGroupConfig: (rawMetadata) => getGroupConfig(rawMetadata),
    getRoomOverrides: (rawMetadata) => getRoomOverrides(rawMetadata),
    resolvePromptVariables,
  };

  const memberBudget = createMemberBudget(db, { windowMs: MEMBER_BUDGET_WINDOW_MS, now });

  const chatDeps: ChatServiceDeps = {
    emit: emitChatEvent,
    activeTurns: createActiveTurns(),
    prng: () => Math.random(),
    delay: (ms) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      }),
    resolveConnection: async ({ runAsUserId, chatId }) => {
      const rows = await db
        .select({ metadata: chats.metadata })
        .from(chats)
        .where(eq(chats.id, chatId))
        .limit(1);
      const meta = parseChatMetadata(rows.at(0)?.metadata ?? null);
      const routable: RouteChatAssignment =
        meta.providerRouting !== undefined ? { providerRouting: meta.providerRouting } : {};
      return resolveChatVia(runAsUserId, routable);
    },
    resolveForeignInputs: async ({
      runAsUserId,
      anchorPersonaId,
      personaIds,
      triggerPersonaId,
    }) => {
      const us = await input.settings.loadUserSettings(runAsUserId);
      const principal = hostPrincipal(runAsUserId);

      const promptConfig = await resolvePromptConfigFor(runAsUserId, us.seeds.defaultPresetId);

      // anchor = the chat-open {{user}}; active = the speaking participant's persona (first present).
      const loadPersona = async (
        personaId: typeof anchorPersonaId,
      ): Promise<{
        name: string;
        description: string;
        placement: PersonaDescriptionPlacement;
      } | null> => {
        if (personaId === null) {
          return null;
        }
        try {
          const p = await input.persona.get({ principal, personaId });
          return {
            name: p.name,
            description: p.description,
            placement: resolvePersonaDescriptionPlacement(p.metadata),
          };
        } catch {
          return null;
        }
      };
      const anchor = await loadPersona(anchorPersonaId);
      // The triggering human's persona (not personaIds[0], the presence-order-arbitrary first present
      // human) — so prompt-config {{user}} is the speaker's own persona in a multi-human room.
      const active = await loadPersona(triggerPersonaId ?? personaIds.at(0) ?? null);

      const memoryConfig = withMemoryOptOut(
        us.memory.enabled === false,
        input.settings.getEffectiveConfig().memoryDefaults,
      );

      return {
        promptConfig,
        personas: { anchor, active },
        // FLAG[timezone-per-request]: {{time}}/{{date}} use the caller's per-request browser zone; the
        // macro engine falls back to server-local until the turn request carries it.
        globalRegexScripts: us.regex.scripts,
        scanDepth: us.worldInfo.scanDepth,
        injectionTokenBudget: us.worldInfo.tokenBudget,
        memoryConfig,
      };
    },
    debitBudget: memberBudget.debit,
    resolveTurnPolicy: () => {
      const cfg = input.settings.getEffectiveConfig();
      return Promise.resolve({
        budget: cfg.nonOwnerLocalComputeBudget,
        allowNonOwnerMaxProSub: cfg.allowNonOwnerMaxProSub,
      });
    },
    holder: input.holder,
    lockTtlMs: CHAT_LOCK_TTL_MS,
  };

  return {
    service: createChatService(chatCtx, chatDeps),
    emitBusEvent: emitChatEvent,
    backfill: {
      memory: (args) => backfillMemory(chatCtx, args, resolveMemoryConfig),
      groupCharacters: (args) => backfillGroupCharacters(chatCtx, args),
    },
  };
}
