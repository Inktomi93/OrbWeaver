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

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { ResolvedConnection, RoutableChat } from "@orb/contracts/connection";
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

// ── The agent-sdk turn shape (the PD-7 wiring) ────────────────────────────────────────────────────────
// The stateful backend wants (a) the SESSION SEED — the model-visible transcript BEFORE this turn — and
// (b) the PROMPT TAIL — the trailing user rows this turn asks the model to answer. With both, it resumes
// its cached session while the session transcript still matches the seed and reseeds deterministically on
// divergence (edit/swipe/window-slide), so history rides the session (prompt-cache survival) instead of
// being re-sent flattened every turn. When the history has NO clean user tail (continue-mode assistant-
// final history, or a D48 tool row that can't ride this arm), fall back to the pre-PD-7 flatten — one
// prompt string, NO chatId/seed (a fresh throwaway session) — never resume a session that already holds
// the text being continued.

/** One rendered row: image parts become a placeholder (no vision on this path); the wire `name` label is
 *  stamped into the text (agent-sdk seed frames carry no `name` field). */
function agentRowText(m: TurnMessage): string {
  const text = m.content.map((c) => (c.type === "text" ? c.text : "[Image]")).join("");
  return m.name !== undefined && m.name.length > 0 ? `${m.name}: ${text}` : text;
}

/** The legacy flatten (the no-seed fallback): the WHOLE history as one role-labeled blob. Exported
 *  for the bridge tests only — not a composition surface. */
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
 *  no clean user tail (the caller falls back to {@link flattenAgentHistory}). Exported for the
 *  bridge tests only — not a composition surface. */
export function splitAgentHistory(
  history: readonly TurnMessage[],
): { seed: readonly AgentSeedTurn[]; prompt: string } | null {
  // A tool row can only mean a mid-migration mixed history (tools never attach on the agent-sdk arm) —
  // fall back rather than mistranslate a tool exchange into prose.
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
    return null; // continue-mode: assistant-final history has no user turn to send.
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

/** What `buildChatService` needs from the composition root — the boot primitives + the already-built sibling
 *  services chat's injected ops route through (their FRONT DOORS only; chat never sideways-imports them). */
export interface ChatComposeInput {
  /** The D48 tool-use service (optional — absent wires `ChatContext.tools` to null, the byte-identical
   *  no-op; tool-use-design/03 §1). Present from services.ts once ANY registrant/consumer exists. */
  readonly toolUse?: ToolUseService | undefined;
  readonly db: Db;
  readonly now: () => number;
  /** PD-128: the ONE chat bus's durable-first emit (`bus.emit` → transport `publishChatEvent`), built at the
   *  composition root (`services.ts`) and injected so chat does NOT construct a second `createChatBus`. The
   *  SAME wrapper backs persona's active-persona write, so persona/chat/world-info all share one bus + ring. */
  readonly emitChatEvent: (event: ChatBusEvent) => Promise<void>;
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
  /** sessions' EXACT handle→userId (PD-66 targeted invites) — the sanctioned users reader, injected DOWN. */
  readonly resolveHandle: (handle: Handle) => Promise<UserId | null>;
  /** sessions' lazy agent-principal mint (D60, seatAgent — doc 04 §3); the sanctioned users writer, injected DOWN. */
  readonly provisionAgentPrincipal: (params: {
    readonly ownerUserId: UserId;
    readonly sourceKind: AgentSourceKind;
  }) => Promise<{ readonly agentUserId: UserId; readonly created: boolean }>;
  readonly search: SearchService;
  readonly embeddings: EmbeddingsService;
  readonly runChatTurn: (req: ChatRequest) => Promise<ChatResult>;
  readonly assets: AssetsService;
  /** PD-70: the transport presence registry's read side → chat's `presence.read` op (cast-gating). Built at
   *  `services.ts` over the injected clock; supersedes the fail-open stub. */
  readonly readPresence: PresenceReadOp;
  /** imagery's orchestrator → chat's `generatePicture` op (mapped to the chat-local structural result below). */
  readonly generatePicture: ImageryService["generatePicture"];
}

/** The chat compose product: the service + the bus's durable-first emit, surfaced for the OTHER producers
 *  that publish onto the chat bus (world-info's `WiBusEvent`, PD-30). The replay-ring read handle stays
 *  internal until the transport SSE fan-out needs it (B2-1). */
export interface ChatComposeResult {
  readonly service: ChatService;
  readonly emitBusEvent: (event: ChatBusEvent) => Promise<void>;
  /** Chat's PD-41 corpus sweeps, BOUND over the chat ctx — the workloads runner-env's memory/character
   *  backfill ops (the env is built AFTER chat at the root so these can be handed straight in). */
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
 * collaborator. Returns the service AND the bus emit (see {@link ChatComposeResult} — world-info publishes
 * its `WiBusEvent` through the SAME durable-first bus so WI attachment changes land in `chat_events`).
 */
// The ChatToolOps adapter (tool-use-design/03 §1): chat's opaque `ChatToolSet` IS the `ResolvedToolSet`
// this seam minted via `resolveTools` (chat never constructs one — the AgentToolServer opacity pattern);
// the exec frame's `runAsUserId` resolves to the LIVE host `Principal` here (PD-73 — the engine stays
// Principal-blind; D19: the host funds and authorizes the tool run).
function buildChatToolOps(
  toolUse: ToolUseService,
  resolveHostPrincipal: (userId: UserId) => Promise<Principal>,
): ChatToolOps {
  // Entry re-narrows what it minted — the ONE contained narrow for the opaque seam.
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

  // The host's active preset config (its `promptConfig`), given the host's already-loaded default preset id. A
  // stale/unowned/missing id degrades to the system default (settings/index.ts:317). Shared by
  // `resolveForeignInputs` (the turn assemble) + `resolvePromptVariables` (the D46 `getVariables` merge) so the
  // resolution can't drift. Takes the id (not the whole settings read) so a caller that already loaded settings
  // doesn't double-read.
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
      return DEFAULT_PROMPT_CONFIG; // stale/unowned preset id → the system default.
    }
  };

  // D46 config plane: the chat's active preset's ChoiceBlock variables, resolved under the chat's HOST (read off
  // the roster). `getVariables` merges the stored picks over these. Hostless/stale room ⇒ no declared variables.
  const resolvePromptVariables = async (chatId: ChatId): Promise<readonly ChoiceBlockSpec[]> => {
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
    const hostUserId = hostRows.at(0)?.userId ?? null;
    if (hostUserId === null) {
      return [];
    }
    const us = await input.settings.loadUserSettings(hostUserId);
    const config = await resolvePromptConfigFor(hostUserId, us.seeds.defaultPresetId);
    return config.variables;
  };

  // The ONE memory-config MERGE (D36 user opt-out): the admin-set `AppSettings.memoryDefaults`, forced to
  // `mode:"off"` when the host disabled memory. Kept PURE + synchronous so the live turn path (which already
  // holds the host's `us`) and the sweep resolver below both funnel through it WITHOUT either re-reading
  // settings — the opt-out can't be honored on the turn and dropped on the corpus sweep (#54 — the sweep bug).
  const withMemoryOptOut = (disabled: boolean, defaults: MemoryConfig): MemoryConfig =>
    disabled ? { ...defaults, mode: "off" } : defaults;

  // The PD-41 sweep's injected resolver (`resolveMemoryConfig(hostUserId) => Promise<MemoryConfig>`): load the
  // host's settings + the admin floor, then the shared merge. Keyed by the FROZEN host `UserId` (D19); the
  // sweep skips a `mode:"off"` host's chats entirely.
  const resolveMemoryConfig = async (hostUserId: UserId): Promise<MemoryConfig> => {
    const us = await input.settings.loadUserSettings(hostUserId);
    const defaults = input.settings.getEffectiveConfig().memoryDefaults;
    return withMemoryOptOut(us.memory.enabled === false, defaults);
  };

  const chatCtx: ChatContext = {
    db,
    now,
    can: input.can,
    // ── id minters (the in-scope chat tables this slice's verbs create) ──
    newChatId: minter(ID_PREFIX.chat),
    newMessageId: minter(ID_PREFIX.message),
    newMessageVariantId: minter(ID_PREFIX.messageVariant),
    newMessageAssetId: minter(ID_PREFIX.messageAsset),
    newParticipantId: minter(ID_PREFIX.chatParticipant),
    newInjectionId: minter(ID_PREFIX.chatInjection),
    newEventId: minter(ID_PREFIX.chatEvent),
    newStreamEventId: minter(ID_PREFIX.chatStreamEvent),
    newInviteId: minter(ID_PREFIX.chatInvite),
    // The invite-token pepper hasher (the sessions discipline; PD-61 — a ctx crypto op).
    hashToken: createTokenHasher(input.sessionSecret),
    audit: input.audit,
    // PD user-bus lane: the message-commit terminal path + the chat LIST-level ops fan `chatsChanged` to EVERY
    // present human member's channel (cross-device + multi-human list recency). The engine passes a bare
    // `chatId` (PRINCIPAL-BLIND); this composition-root helper enumerates membership — see emit-chat-changed.ts.
    emitChatChanged: createChatChangedEmitter(db),
    applyRegexReplace: createRegexApplyReplace(),
    // D48: the injected tool ops — null until a registrant/consumer wires the service in services.ts.
    tools:
      input.toolUse === undefined
        ? null
        : buildChatToolOps(input.toolUse, input.resolveHostPrincipal),
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

      // PD-7: seed + tail when the history splits cleanly (the backend resumes/reseeds its session);
      // the flatten fallback keeps continue-mode byte-identical to the pre-PD-7 turn (no chatId ⇒ no
      // resume — a fresh throwaway session for the one-off shape).
      const agentSplit = req.connection.api === "agent-sdk" ? splitAgentHistory(req.history) : null;
      // The OR-skin tier→slug map the mode-2 firewall needs (killing the old hardcoded map in env.ts).
      // DERIVED by connection from its two live catalogs; never throws (cold catalog ⇒ curated shortlist).
      // Computed for EVERY agent-sdk turn (mode-1/3 ignore it) — the firewall requires it on the request.
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
              // D17: the engine's enforced owner-consent verdict → the firewall's `ownerConsented` re-verify.
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
              // D17: the engine's enforced owner-consent verdict → the firewall's `ownerConsented` re-verify.
              ownerConsented: req.ownerConsented,
              // biome-ignore lint/suspicious/noExplicitAny: interface mismatch
              history: req.history as any,
              historyCacheBreakpointFromEnd: req.cacheBreakpointFromEnd ?? undefined,
              // D48: absent stays ABSENT (byte-identical pre-D48 request without tools).
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
              // D26 provenance: the output cap the backend echoed + the requested reasoning effort (F10 —
              // previously dropped, so both columns stayed NULL despite the runner knowing them).
              maxOutputTokens: result.usage.maxOutputTokens,
              reasoningEffort: req.intent.effort ?? null,
              ttftMs: result.ttftMs,
              finishReason: result.finishReason,
              stopReason: result.stopReason,
              terminalReason: result.terminalReason,
              // D48: the reducer-assembled calls ride the final chunk (the loop's pivot input).
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
      // The D17 max-pro-sub owner-gate reads the host's REAL role (the injected resolveHostPrincipal —
      // PD-73), so the owner's own max-pro-sub turn is no longer fail-closed-denied.
      input.credentials.resolve({ principal: await realHostPrincipal(runAsUserId), source }),
    // Re-resolve the credential to get its `credentialId` for `credentials.maybeRevokeOnAuthFailed`.
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
    // D44 §12.0 — resolve a roster member's render policy: the deployment floor (`getEffectiveConfig`) with
    // the character's tri-state overrides layered per `override ?? global`. A human seat (`characterId:
    // null`) or a card that's gone/unreadable resolves to the global floor alone (fail-closed to the
    // deployment default, never a throw into roster assembly — mirrors `getCard`'s null-tolerance).
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
    // D44 §12.1/§12.5 — resolve a roster member's RAW theme override: the character's own column, unmerged
    // (NOT `override ?? global` like `resolveRenderPolicy` above — themes-design.md §1: chat assembly never
    // reads the `themes` table; `character > global > default` is a client `<ThemeScope>` nesting concern).
    // A human seat or a card that's gone/unreadable resolves to `null` (mirrors `getCard`'s null-tolerance).
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
          // The settings blob is the deliberately-LENIENT tier (its avatarAssetId is plain by design —
          // contracts/settings profile precedent); this compose seam is the sanctioned brand mint.
          const raw = userSettings.profile.avatarAssetId ?? null;
          avatarAssetId = raw === null ? null : castId<AssetId>(raw);
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
    // D45 asset→URL resolution → CAS bytes as a data-URI (see `resolve-image-ref` for the by-id resolve +
    // the D21 chat-scoped reference gate). The gate reader answers "is this asset's owner a PRESENT member of
    // the referencing chat?" — a scoped `chat_participants` read (never `loadCoParticipantOwner`'s cross-chat
    // hash→owner oracle, PD-107). Extracted so the gate wiring is unit-tested apart from the compose root.
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
        // D44 §12.3 send-path gate: an external media ref is dropped when the deployment floor forbids it
        // (the effective config resolves the born-in-DB `true` floor + any admin override).
        input.settings.getEffectiveConfig().forbidExternalMedia,
        params,
      ),
    // The `ParticipantView`/`MemberCardView`/persona-avatar-producer bridge — a bare id→hash lookup over
    // the SAME un-principal `assetCasRefById` `resolveImageUrl` above uses for its by-id half (D20 posture:
    // a hash is not a secret, the D21 owner-gate lives on the blob route's byte read, not here).
    resolveAssetHash: async (assetId) => {
      if (assetId === null) {
        return null;
      }
      const ref = await input.assets.assetCasRefById(assetId);
      return ref?.hash ?? null;
    },
    // #67 send-attach TRUST BOUNDARY: the owned-id subset among the claimed attachments (owner-scoped off the
    // acting principal's userId — the assets verb's `ownerId` predicate; a foreign/gone id is simply absent).
    filterOwnedAssetIds: async (userId, assetIds) =>
      (await input.assets.resolveOwnedAssetRefs(userId, assetIds)).map((r) => r.assetId),
    // The producer (chat) passes the canon `BatchStmt[]` + the db + the delta; the chat op type erases the
    // batch to `unknown` (the contract keeps Batch generic), so the wrapper restores the concrete type.
    applyStatsDelta: (batch, opDb, delta) => {
      applyStatsDelta(batch as BatchStmt[], opDb, delta);
    },
    summarize: input.roleClients.summarize,
    summarizerContextTokens: input.roleClients.summarizerContextTokens,
    // emit = durable-FIRST then fan-out (PD-23): `record` INSERTs the row (assigning `seq`), THEN the
    // persisted view is published onto transport's per-user live bus — a dead bus path never loses an
    // event (the subscription replays from the table by `seq`; the row is on `list` regardless).
    // `coStatements` (PD-24): the producer's membership-transition statements commit in ONE batch WITH the
    // INSERT (record owns the commit); the publish still runs strictly AFTER that commit.
    resolveHandle: (handle) => input.resolveHandle(handle),
    // D60 agent-principal seam (seatAgent): the mint is sessions' (injected DOWN); the enabled kill-switch read
    // is inline here (the entry root is the sanctioned `users` reader, exempt from `no-direct-users-read`), the
    // `resolveUserPublics` precedent. A missing row → disabled (fail-closed containment).
    provisionAgentPrincipal: (params) => input.provisionAgentPrincipal(params),
    resolveAgentEnabled: async (agentUserId) => {
      const rows = await db
        .select({ enabled: users.enabled })
        .from(users)
        .where(eq(users.id, agentUserId))
        .limit(1);
      return rows[0]?.enabled ?? false;
    },
    // The startChat anchor default-seed: the starter's user-level active persona (settings
    // `seeds.defaultPersonaId`), VALIDATED as an owned live persona (persona.get under the synthetic
    // host principal) -- a stale/unowned id collapses to null so a dead id never lands in the
    // `chats.anchorPersonaId` FK.
    // The character-lock hop (D62 — ST/neo parity): a solo-character founding with EXACTLY ONE
    // `character_personas` connection auto-anchors that persona; 0 or 2+ connections (ambiguity) or a
    // group founding falls through to the default seed. Owner-scoped via `personas.ownerId` so a
    // foreign persona can never leak in (the neo `connected-persona.ts` semantics, carried).
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
        return null; // stale/unowned default -> no seed (the anchor stays unset).
      }
    },
    // The startChat anchor seed, pointer #2 (FINAL-Persona §A.0/§A.3): the starter's GLOBAL "Current
    // persona" (settings `seeds.currentPersonaId`), validated owned/alive exactly like
    // `resolveDefaultPersona` above -- a stale/unowned id collapses to null so a dead id never lands in
    // the `chats.anchorPersonaId` FK.
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
        return null; // stale/unowned current -> no seed (falls through to Default).
      }
    },
    // The `reattributePersona` ownership belt (Chat-Macro-Resolution §5): may a line authored by `ownerId` be
    // re-stamped to `personaId`? A sanctioned one-column `personas` read (the `resolveUserPublics`/world-info
    // precedent — mirrors persona's `ensurePersonaOwned` shape without a cross-domain persistence import),
    // returned as a boolean so the chat verb owns its coded refusal. Absent/foreign ⇒ false (leak-free).
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
    // PD-70: presence is the transport SSE connection ref-count (`presence-registry`, built at `services.ts`
    // over the injected clock, threaded in here). An offline human's persona drops from the present cast for
    // the next round; the read is server-derived — never a client-asserted (spoofable) heartbeat.
    readPresence: input.readPresence,
    // The imagery op: call imagery's orchestrator, then map its `GeneratedPicture` → chat's chat-local
    // structural result (`{images:[{assetId}], warnings}` — chat can't import domain/imagery's types).
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
    // PD-72: the dedicated MemoryLog sink (foundation/observability/memory-log.ts) — a thin `memory: true`-
    // tagged `getLog().debug` closure, mirroring recordClientError/securityEvent; greppable on the `event`
    // string (`memory.build`/`memory.recall`). The concrete `MemoryLogEntry` flows into the foundation-local
    // record shape (the cake forbids foundation importing the domain type).
    log: (entry) => recordMemoryLog(entry),
    getGroupConfig: (rawMetadata) => getGroupConfig(rawMetadata),
    getRoomOverrides: (rawMetadata) => getRoomOverrides(rawMetadata),
    resolvePromptVariables,
  };

  // PD-128: the durable-first emit is the injected `emitChatEvent` (the ONE bus built at services.ts) — chat
  // no longer constructs its own `createChatBus`. It wraps `bus.emit` → transport `publishChatEvent`: the
  // domain bus assigns the per-chat `seq` (the `chat_events` INSERT commits first), THEN the cursor-stamped
  // event goes to the transport per-chat live channel (a dead live path never loses an event — the
  // subscription replays by `seq`). The SAME wrapper backs the verbs, the world-info ride-along, AND persona.
  const memberBudget = createMemberBudget(db, { windowMs: MEMBER_BUDGET_WINDOW_MS, now });

  const chatDeps: ChatServiceDeps = {
    emit: emitChatEvent,
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
    resolveForeignInputs: async ({
      runAsUserId,
      anchorPersonaId,
      personaIds,
      triggerPersonaId,
    }) => {
      const us = await input.settings.loadUserSettings(runAsUserId);
      const principal = hostPrincipal(runAsUserId);

      // The chat's active preset under the host's settings (shared with `resolvePromptVariables` — the D46
      // config-plane merge); a stale/unowned/missing id degrades to the system-default config.
      const promptConfig = await resolvePromptConfigFor(runAsUserId, us.seeds.defaultPresetId);

      // anchor = the chat-open `{{user}}`; active = the speaking participant's persona (first present).
      // `placement` (FINAL-Persona §A.6b gap #1) is resolved ONCE here off the persona's OWN metadata —
      // `assembly/context.ts` reads `active.placement` to decide the `at_depth` injection; `in_prompt`/
      // `none` need no further wiring (the `{{persona}}` macro already works either way).
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
          return null; // deleted/unowned → degrade to null (no persona section).
        }
      };
      const anchor = await loadPersona(anchorPersonaId);
      // active = the TRIGGERING human's persona (whose turn drives this assemble), NOT `personaIds[0]` (the
      // presence-order-arbitrary first present human) — so prompt-config `{{user}}` is the speaker's own
      // persona in a multi-human room. Falls back to the first present persona only when the trigger has none.
      const active = await loadPersona(triggerPersonaId ?? personaIds.at(0) ?? null);

      // memoryConfig = the admin-resolved defaults, forced OFF when the host disabled memory (D36 user opt-out).
      // The SAME `withMemoryOptOut` merge the PD-41 sweep resolver uses (one home — #54), fed the already-loaded
      // `us` so the hot turn path takes no second settings read.
      const memoryConfig = withMemoryOptOut(
        us.memory.enabled === false,
        input.settings.getEffectiveConfig().memoryDefaults,
      );

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

  return {
    service: createChatService(chatCtx, chatDeps),
    emitBusEvent: emitChatEvent,
    backfill: {
      memory: (args) => backfillMemory(chatCtx, args, resolveMemoryConfig),
      groupCharacters: (args) => backfillGroupCharacters(chatCtx, args),
    },
  };
}
