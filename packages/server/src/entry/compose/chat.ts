// entry/compose/chat — the chat domain's slice of THE composition root (core/Tier-5-Entry.md §"injection model").
// Split out of `services.ts` (which only CALLS `buildChatService`) because the chat `ChatContext` is the
// widest DI bundle in the system (~30 injected cross-feature ops) + the `ChatServiceDeps` collaborators the
// entry root must CONSTRUCT (the durable-first bus, the active-turns registry, the per-member budget, the
// invite-token hasher, the routable derivation). This file owns NO business logic — every op is wired to a
// real lower-tier verb where the shapes line up, OR is a flagged inert/permissive stub where the backing is
// unbuilt/mismatched (the prompt's inert-stub pattern; see the per-FLAG notes inline + the integration report).
//
// THE IDENTITY IMPEDANCE (systemic): chat's cross-feature ops are keyed by the FROZEN host `UserId` (D19 —
// the host funds the turn, may be offline, so the path never carries the host's `Principal`). The sibling
// front doors (`character.getCard`, `credentials.resolve`, `connection.resolveChat`, `persona.get`) are keyed
// by `Principal`, and there is NO front-door op to resolve a `Principal` from a bare `userId`. TWO bridges:
//   • role-IRRELEVANT ops (getCard/persona/mint — gated on `userId` only): the cheap synthetic `hostPrincipal`.
//   • role-SENSITIVE ops (resolveChat/resolveCredential — the D17 max-pro-sub owner-gate, identity §3): the
//     INJECTED `resolveHostPrincipal` (PD-73 resolved — `entry/auth.createHostPrincipalResolver` over
//     `sessions.loadUserById`, the sanctioned `users` reader; the seam stays the one Principal mint site).

import type { ResolvedConnection, RoutableChat } from "@orb/contracts/connection";
import type { Can, Principal } from "@orb/contracts/identity";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { RoleClients } from "@orb/contracts/role-clients";
import type { BatchStmt, Db } from "@orb/db";
import { chats, personas, users } from "@orb/db";
import type { Handle, PresetId, TypeIdOf, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import type { AssetsService } from "#domain/assets";
import type { CharacterService } from "#domain/character";
import type {
  ChatContext,
  ChatService,
  ChatServiceDeps,
  TurnRequest,
  TurnStreamChunk,
} from "#domain/chat";
import {
  createActiveTurns,
  createChatBus,
  createChatService,
  getGroupConfig,
  getRoomOverrides,
  parseChatMetadata,
} from "#domain/chat";
import type { ConnectionService } from "#domain/connection";
import type { CredentialsService } from "#domain/credentials";
import type { EmbeddingsService } from "#domain/embeddings";
import type { NotificationsService } from "#domain/notifications";
import type { PersonaService } from "#domain/persona";
import type { PresetService } from "#domain/preset";
import type { SearchService } from "#domain/search";
import { createTokenHasher } from "#domain/sessions";
import type { SettingsService } from "#domain/settings";
import { applyStatsDelta } from "#domain/stats";
import { env } from "#foundation/env";
import type { AuditEntry } from "#foundation/observability";
import { getLog } from "#foundation/observability";
import type { ChatDeltaEvent, ChatRequest, ChatResult } from "#infra/providers";
import { createRegexApplyReplace } from "#kit/regex";
import { createMemberBudget } from "../../transport/rate-limit";

/** Per-chat turn-lock TTL (ms), sized for one turn — the lock auto-expires so a crashed holder's lock is
 *  takeover-eligible (the steady-state recovery; boot reclaim handles this replica's own orphans). */
const CHAT_LOCK_TTL_MS = 120_000;
/** The per-member COUNT-budget window (fixed-window). A day: the cap (`nonOwnerLocalComputeBudget`) is the
 *  per-day turn allotment a non-owner member may drive on the host's box (D17). */
const MEMBER_BUDGET_WINDOW_MS = 86_400_000;

/** Build a production id minter for a TypeID prefix (mirrors `services.ts` — the composition root is the
 *  sanctioned mint site). */
function minter<P extends string>(prefix: P): () => TypeIdOf<P> {
  return (): TypeIdOf<P> => mintTypeId(prefix);
}

/** What `buildChatService` needs from the composition root — the boot primitives + the already-built sibling
 *  services chat's injected ops route through (their FRONT DOORS only; chat never sideways-imports them). */
export interface ChatComposeInput {
  readonly db: Db;
  readonly now: () => number;
  /** The lock-holder tag for this replica (also used by the boot lock reclaim — one source of truth). */
  readonly holder: string;
  /** The invite-token pepper (mirrors sessions). */
  readonly sessionSecret: string | null;
  /** The frozen-host → `Principal` bridge for the ROLE-SENSITIVE ops (PD-73 —
   *  `entry/auth.createHostPrincipalResolver`: the host's real `users.role` via `sessions.loadUserById`). */
  readonly resolveHostPrincipal: (userId: UserId) => Promise<Principal>;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  /** The PD-1 privilege-decision seam (admin's `can`, injected DOWN). */
  readonly can: Can;
  readonly roleClients: RoleClients;
  readonly connection: ConnectionService;
  readonly credentials: CredentialsService;
  readonly character: CharacterService;
  readonly persona: PersonaService;
  readonly preset: PresetService;
  readonly settings: SettingsService;
  readonly notifications: NotificationsService;
  readonly search: SearchService;
  readonly embeddings: EmbeddingsService;
  readonly runChatTurn: (req: ChatRequest) => Promise<ChatResult>;
  readonly assets: AssetsService;
}

/**
 * Construct the chat `ChatService` + its bus, wiring every {@link ChatContext} op + {@link ChatServiceDeps}
 * collaborator. Returns the service; the bus is held internally (the transport SSE fan-out, PD-46, will need
 * the bus replay-ring handle surfaced — see the integration report's hand-off).
 */
export function buildChatService(input: ChatComposeInput): ChatService {
  const { db, now } = input;

  // The frozen-host → `Principal` bridge (see the file header). For the ROLE-IRRELEVANT ops (getCard /
  // persona.get / mint — gated on `userId` only) the cheap synthetic principal is correct + avoids a per-call
  // read. `role:"user"` here is never consulted by those ops.
  const hostPrincipal = (userId: UserId): Principal => ({
    userId,
    role: "user",
    handle: castId<Handle>(userId),
    externalId: null,
    via: "fallback",
  });

  // The ROLE-SENSITIVE bridge: the D17 `max-pro-sub` owner-gate keys on the host's REAL role (identity §3 —
  // an authoritative role read on `runAsUserId`), so a fabricated `role:"user"` would fail-closed-DENY the
  // OWNER's own Max-sub turn. PD-73 resolved: the read is INJECTED (`entry/auth.createHostPrincipalResolver`
  // over `sessions.loadUserById`) — no entry-local `users` table reach for the principal fields.
  const realHostPrincipal = input.resolveHostPrincipal;

  // The per-turn connection resolution funnel (the chat row's routing BEATS the host's UserSettings defaults,
  // which `connection.resolveChat` overlays internally). The row carries only `metadata.providerRouting`
  // (no api/source/model columns exist — they fall through to the host's `roleDefaults.chat`) — FLAG[routable-derivation].
  const resolveChatVia = async (
    userId: UserId,
    routable: RoutableChat,
  ): Promise<ResolvedConnection> =>
    input.connection.resolveChat({
      principal: await realHostPrincipal(userId),
      routableChat: routable,
    });

  const chatCtx: ChatContext = {
    db,
    now,
    can: input.can,
    // ── id minters (the in-scope chat tables this slice's verbs create) ──
    newChatId: minter(ID_PREFIX.chat),
    newMessageId: minter(ID_PREFIX.message),
    newMessageVariantId: minter(ID_PREFIX.messageVariant),
    newParticipantId: minter(ID_PREFIX.chatParticipant),
    newInjectionId: minter(ID_PREFIX.chatInjection),
    newEventId: minter(ID_PREFIX.chatEvent),
    newStreamEventId: minter(ID_PREFIX.chatStreamEvent),
    newInviteId: minter(ID_PREFIX.chatInvite),
    // The invite-token pepper hasher (the sessions discipline; PD-61 — a ctx crypto op).
    hashToken: createTokenHasher(input.sessionSecret),
    audit: input.audit,
    applyRegexReplace: createRegexApplyReplace(),
    // The chat ROLE expects a STREAMING `(TurnRequest) => AsyncIterable<TurnStreamChunk>`,
    // but `infra/providers` exposes only `(ChatRequest) => Promise<ChatResult>` (different request shape + a
    // non-streaming Promise + a callback `onDelta` stream). The bridging slice maps the shapes and yields the stream.
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

      const chatReq: ChatRequest =
        req.connection.api === "agent-sdk"
          ? {
              api: "agent-sdk",
              model: req.connection.model,
              credential: req.connection.credential,
              capability: req.connection.capability,
              params: req.intent,
              systemPrompt: { static: req.prompt.static, dynamic: req.prompt.dynamic },
              prompt: req.history
                .map((m) => {
                  const prefix = m.role === "assistant" ? "Assistant" : "User";
                  const name = m.name ? ` (${m.name})` : "";
                  const text = m.content
                    .map((c) => (c.type === "text" ? c.text : "[Image]"))
                    .join("");
                  return `${prefix}${name}: ${text}`;
                })
                .join("\n\n"),
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
              // biome-ignore lint/suspicious/noExplicitAny: interface mismatch
              history: req.history as any,
              historyCacheBreakpointFromEnd: req.cacheBreakpointFromEnd ?? undefined,
              onDelta,
              signal: req.signal,
            };

      // Ensure that we don't accidentally swallow the promise
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
              ttftMs: result.ttftMs,
              finishReason: result.finishReason,
              stopReason: result.stopReason,
              terminalReason: result.terminalReason,
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
      // The D17 max-pro-sub owner-gate reads the host's REAL role (the injected resolveHostPrincipal —
      // PD-73), so the owner's own max-pro-sub turn is no longer fail-closed-denied.
      input.credentials.resolve({ principal: await realHostPrincipal(runAsUserId), source }),
    // Chat hands `{runAsUserId, source, status}`. We resolve the credential here
    // to get the `credentialId` and pass it to `credentials.maybeRevokeOnAuthFailed`.
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
        // Best effort post-turn (the contract says NEVER throw into the turn) → no-op.
      }
    },
    getCard: ({ ownerId, characterId }) =>
      input.character.getCard({ principal: hostPrincipal(ownerId), characterId }),
    mintSyntheticGroupCharacter: (params) => input.character.mintSyntheticGroupCharacter(params),
    findSyntheticGroupCharacter: (params) => input.character.findSyntheticGroupCharacter(params),
    // Human publics. We fetch handle from `users` and `avatarAssetId` from `UserSettings`. If an active persona is provided, we fetch its name and avatar instead.
    resolveUserPublics: async (userId, personaId) => {
      const rows = await db
        .select({ handle: users.handle })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const handle = rows[0]?.handle ?? null;

      let avatarAssetId: string | null = null;
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

      // If no persona avatar, fallback to user settings avatar
      if (avatarAssetId === null) {
        try {
          const userSettings = await input.settings.loadUserSettings(userId);
          avatarAssetId = userSettings.profile.avatarAssetId ?? null;
        } catch {
          // Ignore settings load failures for user publics
        }
      }

      return {
        displayName,
        handle,
        avatarAssetId,
      };
    },
    // D45 asset→URL resolution using CAS bytes and data-URI.
    resolveImageUrl: async ({ ownerId, ref }) => {
      if (ref.kind === "external") {
        return ref.url;
      }
      if (ref.kind === "asset") {
        const meta = await input.assets.getMetadata({
          principal: await realHostPrincipal(ownerId),
          hash: ref.assetId,
        });
        if (!meta) {
          return null;
        }
        const bytes = await input.assets.loadAssetBytes(castId(ref.assetId));
        if (!bytes) {
          return null;
        }
        const base64 = Buffer.from(bytes).toString("base64");
        return `data:${meta.mime};base64,${base64}`;
      }
      return null;
    },
    // The producer (chat) passes the canon `BatchStmt[]` + the db + the delta; the chat op type erases the
    // batch to `unknown` (the contract keeps Batch generic), so the wrapper restores the concrete type.
    applyStatsDelta: (batch, opDb, delta) => {
      applyStatsDelta(batch as BatchStmt[], opDb, delta);
    },
    summarize: input.roleClients.summarize,
    summarizerContextTokens: input.roleClients.summarizerContextTokens,
    // emit = the durable INSERT (`record`) only; the after-commit per-user bus fan-out is TRANSPORT's
    // (PD-23, not built) — FLAG[notifications-busfanout]. The row is deliverable from `list` regardless.
    emitNotification: async (event) => {
      await input.notifications.record({ event });
    },
    // FLAG[PD-70]: presence is not built (the transport SSE ref-count is its source). Report
    // everyone present / never-dropped so cast-gating never silently mutes a participant.
    readPresence: (userId) => Promise.resolve({ userId, online: true, lastSeenAt: null }),
    // The memory write path: chat's `{lens, key|chatId, …}` → embeddings' flat `chat-block` store params.
    // model/dim are the embed space tag (the indexer uses the same `env.VLLM_EMBED_DIM`); embeddings embeds
    // the `text` and tripwires the produced vector against `dim`.
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
    // FLAG[PD-71]: `search.corpus` needs a resolved owner that `MemoryQueryOptions` can't
    // carry (the op-shape mismatch the search slice flagged). Recall does NOT call this yet → permissive [].
    searchCorpus: () => Promise.resolve([]),
    // FLAG[PD-72]: no dedicated MemoryLog sink in foundation/observability — a thin structured-log
    // closure over the pino logger (greppable on `memory.build`/`memory.recall`).
    log: (entry) => {
      getLog().debug({ memory: entry }, entry.event);
    },
    getGroupConfig: (rawMetadata) => getGroupConfig(rawMetadata),
    getRoomOverrides: (rawMetadata) => getRoomOverrides(rawMetadata),
  };

  const bus = createChatBus({ db, now, newEventId: chatCtx.newEventId });
  const memberBudget = createMemberBudget(db, { windowMs: MEMBER_BUDGET_WINDOW_MS, now });

  const chatDeps: ChatServiceDeps = {
    emit: bus.emit,
    activeTurns: createActiveTurns(),
    // The PROD seed (D46): the eval path injects a seeded PRNG; at the entry root the real entropy source is
    // sanctioned (this is the composition root, not determinism-gated domain code).
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
      const routable: RoutableChat =
        meta.providerRouting !== undefined ? { providerRouting: meta.providerRouting } : {};
      return resolveChatVia(runAsUserId, routable);
    },
    resolveForeignInputs: async ({ runAsUserId, anchorPersonaId, personaIds }) => {
      const us = await input.settings.loadUserSettings(runAsUserId);
      const principal = hostPrincipal(runAsUserId);

      // The chat's active preset under the host's settings; a stale/unowned/missing id degrades to the
      // system-default config (settings/index.ts:317 — "stale id degrades to system-default").
      let promptConfig = DEFAULT_PROMPT_CONFIG;
      if (us.seeds.defaultPresetId !== null) {
        try {
          const detail = await input.preset.get({
            userId: runAsUserId,
            id: castId<PresetId>(us.seeds.defaultPresetId),
          });
          promptConfig = detail.config;
        } catch {
          // stale/unowned preset id → keep the system default.
        }
      }

      // anchor = the chat-open `{{user}}`; active = the speaking participant's persona (first present).
      const loadPersona = async (
        personaId: typeof anchorPersonaId,
      ): Promise<{ name: string; description: string } | null> => {
        if (personaId === null) {
          return null;
        }
        try {
          const p = await input.persona.get({ principal, personaId });
          return { name: p.name, description: p.description };
        } catch {
          return null; // deleted/unowned → degrade to null (no persona section).
        }
      };
      const anchor = await loadPersona(anchorPersonaId);
      const active = await loadPersona(personaIds.at(0) ?? null);

      // memoryConfig = the admin-resolved defaults, forced OFF when the host disabled memory (D36 user opt-out).
      const cfg = input.settings.getEffectiveConfig();
      const memoryConfig =
        us.memory.enabled === false
          ? { ...cfg.memoryDefaults, mode: "off" as const }
          : cfg.memoryDefaults;

      return {
        promptConfig,
        personas: { anchor, active },
        // timezone is NOT a foreign/host input — `{{time}}`/`{{date}}` use the caller's PER-REQUEST browser
        // zone (client.md epoch-UTC pipeline); the macro engine falls back to server-local until the turn
        // request carries it (FLAG[timezone-per-request] in assemble-gather). A host setting is the wrong home.
        globalRegexScripts: us.regexScripts,
        scanDepth: us.worldInfo.scanDepth,
        injectionTokenBudget: us.worldInfo.tokenBudget,
        memoryConfig,
      };
    },
    debitBudget: memberBudget.debit,
    // The per-turn host policy (engine §9 belt). These D17 governance facts live on the admin-resolved
    // EffectiveAppConfig (NOT UserSettings, which carries neither field — the dictated `loadUserSettings`
    // source was wrong): the per-member COUNT cap + the max-pro-sub owner-consent toggle.
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

  return createChatService(chatCtx, chatDeps);
}
