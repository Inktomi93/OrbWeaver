// Chat domain's slice of the composition root: wires the widest DI bundle in the system (ChatContext +
// ChatServiceDeps). Owns no business logic.
//
// Identity impedance: chat's cross-feature ops are keyed by the frozen host `UserId` (the host may be
// offline, so no request Principal exists). Two bridges: role-irrelevant ops use the cheap synthetic
// `hostPrincipal`; role-sensitive ops (owner-gates) use the injected `resolveHostPrincipal`.

import { setTimeout as sleep } from "node:timers/promises";
import type { ChatBusEvent } from "@orb/contracts/chat";
import { resolveRenderPolicy } from "@orb/contracts/chat";
import type { ResolvedConnection, RouteChatAssignment } from "@orb/contracts/connection";
import type { Can, Principal } from "@orb/contracts/identity";
import type { ChoiceBlockSpec, PromptConfig, UserIntent, UserMacroSpec } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { ProseOverrides } from "@orb/contracts/prose";
import type { MaterializeBackgroundOp } from "@orb/contracts/theme";
import type { Db } from "@orb/db";
import { characterPersonas, chatParticipants, chats, personas, users } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import type { AssetId, ChatId, Handle, PersonaId, PresetId, TypeIdOf, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import type { PersonaDescriptionPlacement } from "@orb/kit/persona";
import { resolvePersonaDescriptionPlacement } from "@orb/kit/persona";
import { and, eq, isNull } from "drizzle-orm";
import type { AssetsService } from "#domain/assets";
import type { CharacterService } from "#domain/character";
import { createCopyHandoffCards } from "#domain/character";
import type {
  ChatContext,
  ChatService,
  ChatServiceDeps,
  ChatToolOps,
  ChatToolSet,
  GetMembership,
  GetPendingUserText,
  MemoryConfig,
  PostNarratorMessage,
  PresenceReadOp,
  PromptTransformRegistry,
  RequestTurnOp,
  ResolveCanonWindow,
  ResolveRpgCardCorpus,
  ResolveRpgRoster,
  SetRpgPointer,
  TurnMessage,
  TurnRequest,
  TurnStreamChunk,
  TurnTrigger,
} from "#domain/chat";
import {
  applyStandaloneVariableOps,
  backfillGroupCharacters,
  backfillMemory,
  createActiveTurns,
  createChatService,
  createGetMembership,
  createGetPendingUserText,
  createPostNarratorMessage,
  createPromptTransformRegistry,
  createResolveCanonWindow,
  createResolveRpgCardCorpus,
  createResolveRpgRoster,
  createSetRpgPointer,
  getGroupConfig,
  getRoomOverrides,
  parseChatMetadata,
} from "#domain/chat";
import type { ConnectionService } from "#domain/connection";
import type { CredentialsService } from "#domain/credentials";
import type { EmbeddingsService } from "#domain/embeddings";
import { createHandoffRestampStatements } from "#domain/embeddings";
import type { ImageryService } from "#domain/imagery";
import type { NotificationsService } from "#domain/notifications";
import type { PersonaService, ResolvePersonasForRoster } from "#domain/persona";
import type { PresetService } from "#domain/preset";
import type { ResolveRegexSources } from "#domain/regex";
import type { SearchService } from "#domain/search";
import { createTokenHasher } from "#domain/sessions";
import type { SettingsService } from "#domain/settings";
import { applyStatsDelta } from "#domain/stats";
import type { ResolvedToolSet, ToolUseService } from "#domain/tool-use";
import { createCopyHandoffBooks } from "#domain/world-info";
import { env } from "#foundation/env";
import type { AuditEntry } from "#foundation/observability";
import { recordMemoryLog } from "#foundation/observability";
import type { AgentSeedTurn, ChatDeltaEvent, ChatEvent, ChatRequest, ChatResult, RoleClientsWithSignal, WarningCode } from "#infra/providers";
import { AGENT_PROMPT_TAIL_JOINER, createAgentToolServer } from "#infra/providers";
import { createRegexApplyReplace } from "#kit/regex";
import { createMemberBudget } from "../../transport/rate-limit.ts";
import { publishNotification } from "../../transport/trpc/index.ts";
import { createChatChangedEmitter } from "./emit-chat-changed.ts";
import { resolveImageRefToUrl } from "./resolve-image-ref.ts";

/** Per-chat turn-lock TTL (ms) — auto-expires so a crashed holder's lock is takeover-eligible. */
const CHAT_LOCK_TTL_MS = 120_000;

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

/**
 * Lift the capability-kept `system` rows near the tail (depth-0 mid-conversation system injections — SHAPE
 * emits them only when `turns.midConversationSystem`) off the shaped history. On the agent-sdk wire-shape
 * the honest system-authority channel is the dynamic-context hook (`routeDynamicContext` "message-tail"),
 * not a transcript row: the caller joins the extracted text onto `systemPrompt.dynamic`, and the remaining
 * history keeps a clean user prompt — the volatile injection never enters the recorded transcript, so the
 * session↔seed comparator still matches next turn (resume, not reseed).
 *
 * NOT strictly tail-FINAL (F3 fix): SHAPE appends the group/CONTINUATION nudge as a trailing USER row AFTER
 * the depth-0 system row (`shape.ts` `[...named, {role:"user", nudge}]`), so the real shape is
 * `[…canon…, system, user-nudge]` — a system row with a nudge tail AFTER it, not a tail-final run. A pure
 * trailing-run scan misses it and leaves the reminder to fall bare into the prompt tail (unframed system-
 * authority text reaching the model as user content + entering the transcript → reseed churn). So we scan for
 * a contiguous SYSTEM run and lift it even when NON-system (nudge) rows trail it; those trailing rows stay in
 * `rows` (the nudge is a legitimate user turn — only the system row folds into the hook). A system run inside
 * canon (a non-injection system row, if one ever existed) is NOT reachable here — the splice only ever emits
 * depth-0 system at/after the last canon assistant, so the run we find is always the injection band. Exported
 * for bridge tests only — not a composition surface.
 */
/**
 * THE TRIGGER BINDING — which persona id prompt-config `{{user}}` (the assemble ctx's ACTIVE persona)
 * resolves against, dispatched exhaustively over {@link TurnTrigger} (Chat-Macro-Resolution §3–§4; the
 * union's own doc carries the arm semantics). PURE; exported for its unit pin only (the
 * `extractTrailingSystemRows` precedent — not a composition surface).
 *
 *   • `human`  → THAT human's persona ("who's speaking right now", §A.1), and `null` when their seat holds
 *     none — the kit floor, NEVER the anchor. Borrowing the anchor here is INVITE-JOIN-NULL-PERSONA: it
 *     hands a member the host's identity on the wire.
 *   • `none` (deferred drain / auto turn) → the chat ANCHOR. The anchor is the chat-invariant identity (D51
 *     rider); binding to `personaIds[0]` instead would address the prompt to a presence-order-arbitrary
 *     bystander, and falling to the kit floor would address "User" in a room whose `{{user}}` is well-defined.
 *
 * THERE IS NO ABSENT ARM (owner ruling, 2026-08-07 — the `personaIds[0]` fallback is RETIRED). It used to
 * exist for trigger-less contexts (previews, host instruments) and bound `{{user}}` to "whoever joined
 * first" — presence-order-arbitrary, nondeterministic across a join, and on a host instrument a cross-member
 * read. Every caller now states its arm, and `trigger` is REQUIRED rather than loud-at-runtime: a caller that
 * genuinely has no triggering human passes `{kind:"none"}` (⇒ the anchor, the chat-invariant identity), which
 * is what a preview wanted all along. The enforcement ladder prefers unrepresentable over thrown (§2.2).
 *
 * Returning an ID (not a resolved persona) is deliberate: the anchor arm then resolves through the SAME
 * roster read as every other arm, so `active === anchor` is byte-identical to the anchor projection and the
 * `sameProjectedPersona` dedup keeps holding.
 */
export function activePersonaIdFor(args: { readonly trigger: TurnTrigger; readonly anchorPersonaId: PersonaId | null }): PersonaId | null {
  const trigger = args.trigger;
  switch (trigger.kind) {
    case "human":
      return trigger.personaId;
    case "none":
      return args.anchorPersonaId;
    default:
      return assertNeverTrigger(trigger);
  }
}

function assertNeverTrigger(trigger: never): never {
  throw new Error(`activePersonaIdFor: unhandled TurnTrigger ${JSON.stringify(trigger)}`);
}

export function extractTrailingSystemRows(history: readonly TurnMessage[]): { rows: readonly TurnMessage[]; systemText: string | null } {
  // Walk back past a trailing NON-system tail (the appended nudge — at most a short user run) to find the end
  // of the system band, then past the system run to its start. `[…, system, user-nudge]` → sysStart..sysEnd
  // brackets the system rows; everything else (canon head + the nudge tail) stays in `rows`.
  let sysEnd = history.length;
  while (sysEnd > 0 && history[sysEnd - 1]?.role !== "system") {
    sysEnd -= 1; // skip the trailing nudge (non-system) rows
  }
  let sysStart = sysEnd;
  while (sysStart > 0 && history[sysStart - 1]?.role === "system") {
    sysStart -= 1; // the contiguous system run
  }
  if (sysStart === sysEnd) {
    return { rows: history, systemText: null }; // no system rows to lift
  }
  const text = history
    .slice(sysStart, sysEnd)
    .map(agentRowText)
    .filter((t) => t.length > 0)
    .join(AGENT_PROMPT_TAIL_JOINER);
  // Drop the system band; keep the canon head AND the nudge tail (the nudge is a real user turn).
  const rows = [...history.slice(0, sysStart), ...history.slice(sysEnd)];
  return { rows, systemText: text.length > 0 ? text : null };
}

/** The legacy flatten (no-seed fallback): the whole history as one role-labeled blob. Exported for bridge
 *  tests only — not a composition surface. */
export function flattenAgentHistory(history: readonly TurnMessage[]): string {
  const labels: Partial<Record<TurnMessage["role"], string>> = { assistant: "Assistant", system: "System" };
  return history
    .map((m) => {
      const prefix = labels[m.role] ?? "User";
      const name = m.name !== undefined && m.name.length > 0 ? ` (${m.name})` : "";
      const text = m.content.map((c) => (c.type === "text" ? c.text : "[Image]")).join("");
      return `${prefix}${name}: ${text}`;
    })
    .join("\n\n");
}

/** Split the shaped history into the session seed + the joined prompt tail; `null` when the history has
 *  no clean user tail (the caller falls back to {@link flattenAgentHistory}). */
export function splitAgentHistory(history: readonly TurnMessage[]): { seed: readonly AgentSeedTurn[]; prompt: string } | null {
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
  /** D121-E: the regex domain's four-scope resolve op (the host-tier sources a turn assembles against). */
  readonly resolveRegexSources: ResolveRegexSources;
  readonly roleClients: RoleClientsWithSignal;
  readonly connection: ConnectionService;
  readonly credentials: CredentialsService;
  readonly character: CharacterService;
  readonly persona: PersonaService;
  /** The persona domain's PRINCIPAL-LESS roster op (`domain/persona/contract/ops.ts`) — the ONE room-plane
   *  persona read the FOREIGN-inputs resolver uses. Separate from `persona` because `PersonaService` is
   *  Principal-scoped by contract, and a room's assembly has no single Principal to read as (D106). */
  readonly resolvePersonasForRoster: ResolvePersonasForRoster;
  readonly preset: PresetService;
  readonly settings: SettingsService;
  readonly notifications: NotificationsService;
  readonly resolveHandle: (handle: Handle) => Promise<UserId | null>;

  readonly search: SearchService;
  readonly embeddings: EmbeddingsService;
  /** The databank `{{databank}}`-slot GATHER op (DB6) — OPTIONAL; absent wires `ChatContext.gatherDatabank`
   *  to undefined (byte-identical no-op). Bridged from `databank.gatherRetrieval` at the composition root. */
  readonly gatherDatabank?: ChatContext["gatherDatabank"];
  readonly runChatTurn: (req: ChatRequest) => Promise<ChatResult>;
  readonly assets: AssetsService;
  /** Materialize a user-pasted external carried-background URL into an owned CAS asset (side-eye F-P0-2) — the
   *  shared compose-built op the `setChatBackground` verb runs for a `kind:"external"` source. */
  readonly materializeBackground: MaterializeBackgroundOp;
  readonly readPresence: PresenceReadOp;
  /** imagery's orchestrator → chat's `generatePicture` op (mapped to the chat-local structural result below). */
  readonly generatePicture: ImageryService["generatePicture"];
  /** The expressions post-turn classify hook (E3 — expressions-design/02 §0) — OPTIONAL; absent wires
   *  `ChatContext.expressions` to null (byte-identical no-op). Bridged from `expressions.onTurnCompleted`. */
  readonly expressions?: ChatContext["expressions"];
  /** The injected rpg turn ops (rpg-design/05 §0) — OPTIONAL; absent wires `ChatContext.rpg` to null
   *  (byte-identical no-op). Built at the composition root over the rpg service + its standalone gather op. */
  readonly rpg?: ChatContext["rpg"] | undefined;
  /** The injected chat-crew director GATHER op (chat-crew-design/04 §1) — OPTIONAL; absent wires
   *  `ChatContext.crew` to null (byte-identical no-op). A forward-ref delegate over the crew service. */
  readonly crew?: ChatContext["crew"] | undefined;
}

/** The chat compose product: the service + the bus's durable-first emit, surfaced for other producers that
 *  publish onto the chat bus (e.g. world-info). */
export interface ChatComposeResult {
  readonly service: ChatService;
  readonly emitBusEvent: (event: ChatBusEvent) => Promise<void>;
  /** The generic, principal-free chat ops domain/rpg receives by injection (02 §1.1) — built over chat's own
   *  ctx here (chat never learns rpg). Wired onto `RpgContext.chat` at the rpg compose block. */
  readonly rpgChatOps: {
    readonly getMembership: GetMembership;
    readonly postNarratorMessage: PostNarratorMessage;
    readonly getPendingUserText: GetPendingUserText;
    /** The opaque pointer write (rpg-design/05 §3.1) — `createGame` calls it once. */
    readonly setRpgPointer: SetRpgPointer;
    /** The roster projection (rpg-design/05 §4.3) — the tracker view's roster ∪ sheets source. */
    readonly resolveRpgRoster: ResolveRpgRoster;
    /** The chat's PRESENT host userId (role='host', D19) — the human the rpg resync resolves its
     *  connection/creds under + the capability verdict keys on. Resolved by ROLE, never join order (a handoff
     *  swaps roles in place — the first-joined human is NOT the host). `null` = a hostless/stale room. */
    readonly resolveHostUserId: (chatId: ChatId) => Promise<UserId | null>;
    /** The DEEP canon-window read (crunchy-cluster §1.3) — the `resyncFromStory` host verb's story feed, sharing
     *  the engine's transcript projection (chat owns canon reads; rpg reads no chat table). */
    readonly resolveCanonWindow: ResolveCanonWindow;
    /** The BORN-STATE corpus read (the host `populateFromCharacter` round): one roster character's card prose
     *  + the room's opening line (chat owns the card + canon reads; rpg reads no table). */
    readonly resolveCardCorpus: ResolveRpgCardCorpus;
    /** The chat's ACTIVE-preset user macros (WAVE MU) — the same resolution the picks pane reads, so the GM
     *  console's shadow gloss names the exact defs a game macro would shadow (chat owns preset resolution for
     *  a chat; rpg re-deriving it would be a second home for the rule). */
    readonly resolvePromptUserMacros: (chatId: ChatId) => Promise<readonly UserMacroSpec[]>;
  };
  /** The D50 PromptTransform registrar (automation-design/04 §6) — surfaced so automation's rule lifecycle
   *  (A7) + the plugin host `register`/`unregister` their `transform_draft` transforms onto the same list the
   *  turn pipeline applies. Zero registrants today (byte-identical no-op). */
  readonly promptTransforms: PromptTransformRegistry;
  /** The standalone (out-of-turn) runtime-variable write (automation-design/03 §1.1), bound over chat's own
   *  ctx — automation's `set_variable` chat-scope arm injects this at the composition root (chat learns
   *  nothing automation-shaped; principal-free — the author's authority was gated upstream). */
  readonly applyVariableOps: (chatId: ChatId, ops: readonly VarOp[]) => Promise<void>;
  /** The room HOST's app-tier prose overrides for a chat (PROSE-1 §4.3, owner-decision 8 option (a)) —
   *  surfaced so automation's `set_chat_background` quiet pick reads the SAME host prose the room's other
   *  side generations do, instead of re-deriving the host itself. */
  readonly resolveChatProse: (chatId: ChatId) => Promise<ProseOverrides>;
  /** The NON-HUMAN turn seam (automation-design/03 §4 / 05 §AC-B) — automation's `trigger_turn` arm + the
   *  Tier-2 plugin membrane's `turn.trigger` inject this at the composition root. Principal-free: the funding
   *  host is resolved from the room, and the four walls (depth/authority/budget/consent) enforce inside the verb
   *  + the engine belts. See {@link RequestTurnOp}. */
  readonly requestTurn: RequestTurnOp;
  /** Chat's corpus sweeps, bound over the chat ctx. */
  readonly backfill: {
    readonly memory: (args: { signal: AbortSignal; ownerId?: UserId | null }) => ReturnType<typeof backfillMemory>;
    readonly groupCharacters: (args: { signal: AbortSignal; ownerId?: UserId | null }) => ReturnType<typeof backfillGroupCharacters>;
  };
}

/**
 * Construct the chat `ChatService` + its bus, wiring every {@link ChatContext} op + {@link ChatServiceDeps}
 * collaborator. Returns the service AND the bus emit.
 */
// chat's opaque ChatToolSet IS the ResolvedToolSet this seam minted; the exec frame's runAsUserId resolves
// to the live host Principal here (the engine itself stays Principal-blind).
function buildChatToolOps(toolUse: ToolUseService, resolveHostPrincipal: (userId: UserId) => Promise<Principal>): ChatToolOps {
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
        turnId: frame.turnId,
        ...(frame.signal !== undefined ? { signal: frame.signal } : {}),
      }),
    // The stateful-arm projection: the SAME resolved set + exec frame, wrapped as an in-process MCP server
    // (project-mcp funnels every SDK invocation back through executeToolCalls — one execute path, two
    // projections). The D47 SDK factory is injected HERE so tool-use never imports infra.
    toAgentToolServer: async (set, frame, onRecord) =>
      toolUse.toAgentToolServer(
        asResolvedSet(set),
        {
          principal: await resolveHostPrincipal(frame.runAsUserId),
          triggeredBy: frame.triggeredBy,
          chatId: frame.chatId,
          roster: frame.roster,
          turnId: frame.turnId,
          ...(frame.signal !== undefined ? { signal: frame.signal } : {}),
        },
        { createAgentToolServer },
        onRecord,
      ),
  };
}

/** The runner's `ChatResult.events` → the domain stream's `warning` chunks (D41 no-silent-degrade, the READ
 *  end). The bridge CARRIES the infra codes; it does not translate them — chat owns its bus vocabulary, so the
 *  infra→`ChatWarningCode` narrowing lives in the domain (`engine.ts` `toChatWarningCode`), the mirror of the
 *  IMAGE role's hop where compose hands the domain a narrowed infra code and
 *  `domain/chat/verbs/generate-image.ts` does the re-map. Deduped here because one runner can repeat a code
 *  within a single result; the pipeline dedupes again across recursion depths.
 *  Extracted so the bridge body stays under the cognitive-complexity cap. */
function warningChunks(events: readonly ChatEvent[]): TurnStreamChunk[] {
  const seen = new Set<WarningCode>();
  for (const event of events) {
    if (event.kind === "warning") {
      seen.add(event.code);
    }
  }
  return [...seen].map((code) => ({ kind: "warning", code }));
}

/** The domain→infra turn bridge: maps a domain {@link TurnRequest} to the infra {@link ChatRequest} (the
 *  agent-sdk split + the chat-completions/responses passthrough spreads — customParameters/tools/toolChoice/
 *  responseFormat/cacheBreakpoint), runs it through the injected infra `runChatTurn`, and adapts its
 *  Promise+onDelta shape back onto the chat role's streaming AsyncIterable. Extracted so the four-layer
 *  fidelity harness drives THIS real mapping (injecting only the leaf infra surface), not a facsimile. */
export function createRunChatTurnBridge(deps: {
  readonly runChatTurn: (req: ChatRequest) => Promise<ChatResult>;
  readonly getOrSkinTierModels: ConnectionService["getOrSkinTierModels"];
}): (req: TurnRequest) => AsyncIterable<TurnStreamChunk> {
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: adapter logic
  return async function* runChatTurn(req: TurnRequest): AsyncIterable<TurnStreamChunk> {
    const queue: TurnStreamChunk[] = [];
    let done = false;
    let error: unknown = null;
    let notify: (() => void) | null = null;

    const onDelta = (delta: ChatDeltaEvent): void => {
      queue.push({ kind: delta.kind, text: delta.text });
      if (notify) {
        notify();
        notify = null;
      }
    };

    // agent-sdk only: capability-kept trailing system rows (depth-0 mid-conversation system injections)
    // leave the transcript and ride the dynamic-context hook channel instead — joined onto the dynamic
    // system half below. Array-shaped wires deliver them as real `system` history rows and skip this.
    const agentExtract = req.connection.api === "agent-sdk" ? extractTrailingSystemRows(req.history) : null;
    const agentSplit = agentExtract !== null ? splitAgentHistory(agentExtract.rows) : null;
    const extractedSystem = agentExtract !== null ? agentExtract.systemText : null;
    const agentDynamic =
      extractedSystem !== null ? [req.prompt.dynamic, extractedSystem].filter((s) => s.trim().length > 0).join(AGENT_PROMPT_TAIL_JOINER) : req.prompt.dynamic;
    // The OR-skin tier→slug map the mode-2 firewall needs, derived from connection's live catalogs
    // (never throws — cold catalog degrades to a curated shortlist).
    const orSkinTierModels = req.connection.api === "agent-sdk" ? await deps.getOrSkinTierModels() : undefined;
    const chatReq: ChatRequest =
      req.connection.api === "agent-sdk" && orSkinTierModels !== undefined
        ? {
            api: "agent-sdk",
            model: req.connection.model,
            credential: req.connection.credential,
            capability: req.connection.capability,
            params: req.intent,
            // `dynamic` carries the extracted trailing system injections — they ride the resolved
            // dynamic-context channel (the hook on a midConversationSystem model) as real system authority.
            systemPrompt: { static: req.prompt.static, dynamic: agentDynamic },
            orSkinTierModels,
            ownerConsented: req.ownerConsented,
            // The stateful tool + structured-output channels (the array wires spread tools/responseFormat
            // on their own arm below): the MCP server mounts the domain's resolved set; responseFormat
            // rides the SDK's own outputFormat (json_schema) — never silently dropped.
            ...(req.agentToolServer !== undefined ? { toolServer: req.agentToolServer, toolTurnLimit: req.agentToolTurnLimit } : {}),
            ...(req.responseFormat !== undefined ? { responseFormat: req.responseFormat } : {}),
            // The TERMINAL channel (D112 R1): the backend mounts these as its own deny-on-use MCP server and
            // hands the co-emitted calls back on `result.toolCalls` — the SAME field the array wires report,
            // so the pipeline's fold reads one shape.
            ...(req.agentTerminalTools !== undefined ? { terminalTools: req.agentTerminalTools } : {}),
            ...(agentSplit !== null
              ? { chatId: req.chatId, seed: agentSplit.seed, prompt: agentSplit.prompt }
              : { prompt: flattenAgentHistory(agentExtract?.rows ?? req.history) }),
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
            // Carried so the wire-capture sink keys the recorded body by chat (the debug endpoint's `chatId`
            // filter); the agent-sdk arm sets it on the seeded spread above.
            chatId: req.chatId,
            // biome-ignore lint/suspicious/noExplicitAny: interface mismatch
            history: req.history as any,
            historyCacheBreakpointFromEnd: req.cacheBreakpointFromEnd ?? undefined,
            // The preset's provider-passthrough blob (PD-148) rides the shared chat-completions/responses arm,
            // but is BYOK-ONLY at the wire: only the custom-byo runner honors it. OpenRouter drops it (its knobs
            // are the modeled sampling surface — the anti-sprawl design); the agent-sdk arm carries none by charter.
            ...(req.customParameters !== undefined ? { customParameters: req.customParameters } : {}),
            ...(req.tools !== undefined ? { tools: req.tools } : {}),
            ...(req.toolChoice !== undefined ? { toolChoice: req.toolChoice } : {}),
            ...(req.responseFormat !== undefined ? { responseFormat: req.responseFormat } : {}),
            onDelta,
            signal: req.signal,
          };

    void deps
      .runChatTurn(chatReq)
      .then((result) => {
        // BEFORE the terminal `final` (which ends the drain): the turn's honest-degrade warnings. Without this
        // the runner's `events` died at this seam and D41 held only in the logs, never in the product.
        queue.push(...warningChunks(result.events));
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

    for (;;) {
      if (queue.length > 0) {
        // biome-ignore lint/style/noNonNullAssertion: safe since queue.length > 0
        yield queue.shift()!;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- `done` is mutated by the onDelta/.then/.catch closures above; tsc's narrowing can't see across those async callback boundaries
      } else if (done) {
        if (error !== null && error !== undefined) {
          throw error;
        }
        break;
      } else {
        const arrival = Promise.withResolvers<void>();
        notify = arrival.resolve;
        // biome-ignore lint/performance/noAwaitInLoops: waiting for next chunk
        await arrival.promise;
      }
    }
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

  const resolveChatVia = async (userId: UserId, routable: RouteChatAssignment): Promise<ResolvedConnection> =>
    input.connection.resolveChat({
      principal: await realHostPrincipal(userId),
      routableChat: routable,
    });

  // The host's active preset config, given its already-loaded default preset id. A stale/unowned/missing id
  // degrades to the system default. Shared by resolveForeignInputs + resolvePromptVariables so resolution
  // can't drift; takes the id (not the whole settings read) so a caller that already loaded it doesn't double-read.
  const resolvePromptConfigFor = async (runAsUserId: UserId, defaultPresetId: string | null): Promise<PromptConfig> => {
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

  // The GM-voice preset REDIRECT (rpg-design/02 §1.1 #1): a present override that resolves owned/system under
  // the host wins; a stale/unowned override (or absent) degrades to the host's normal default — the lenient-id
  // rule (never a broken turn). One home with `resolvePromptConfigFor` so the fallback can't drift. Returns the
  // RESOLVED preset id alongside the config (WAVE MU user-macro source attribution) — the override id when it
  // resolved, else the host default id, else null when the system `DEFAULT_PROMPT_CONFIG` stood in.
  const resolvePromptConfigWithOverride = async (
    runAsUserId: UserId,
    presetOverride: PresetId | undefined,
    defaultPresetId: string | null,
  ): Promise<{ config: PromptConfig; presetId: PresetId | null }> => {
    if (presetOverride !== undefined) {
      try {
        return { config: (await input.preset.get({ userId: runAsUserId, id: presetOverride })).config, presetId: presetOverride };
      } catch {
        // A bad/unowned override falls through to the host's normal default (the lenient-id rule).
      }
    }
    const config = await resolvePromptConfigFor(runAsUserId, defaultPresetId);
    // The effective id is the host default only when it actually resolved a preset (not the DEFAULT fallback).
    return { config, presetId: config === DEFAULT_PROMPT_CONFIG ? null : (defaultPresetId as PresetId | null) };
  };

  // The chat's PRESENT host (role='host', leftSeq NULL) — the room authority whose settings/library the
  // room draws from (D19; every roster character is host-owned per PD-21). `null` ⇒ a hostless/stale room.
  const resolveChatHostUserId = async (chatId: ChatId): Promise<UserId | null> => {
    const hostRows = await db
      .select({ userId: chatParticipants.userId })
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.role, "host"), isNull(chatParticipants.leftSeq)))
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

  // The chat's active preset's authored USER MACROS (#24) — the picks pane's declaration half, resolved
  // under the chat's host exactly like `resolvePromptVariables` (its ChoiceBlock sibling). A feature preset
  // OVERRIDE is deliberately not applied: it is a per-turn redirect (the rpg GM voice) no pane read can
  // anticipate. Hostless/stale room ⇒ no declared macros.
  const resolvePromptUserMacros = async (chatId: ChatId): Promise<readonly UserMacroSpec[]> => {
    const hostUserId = await resolveChatHostUserId(chatId);
    if (hostUserId === null) {
      return [];
    }
    const us = await input.settings.loadUserSettings(hostUserId);
    const config = await resolvePromptConfigFor(hostUserId, us.seeds.defaultPresetId);
    return config.userMacros;
  };

  // The side-gen sampling ladder's MIDDLE rung for chat-scoped side-gen (quiet-generate/compaction + arbiter):
  // the chat HOST's active-preset generation params. One home with `resolvePromptVariables` (same host + config
  // resolution — a hostless/stale room degrades to the system-default params, never a throw).
  const resolveChatPresetParams = async (chatId: ChatId): Promise<UserIntent> => {
    const hostUserId = await resolveChatHostUserId(chatId);
    if (hostUserId === null) {
      return DEFAULT_PROMPT_CONFIG.params;
    }
    const us = await input.settings.loadUserSettings(hostUserId);
    const config = await resolvePromptConfigFor(hostUserId, us.seeds.defaultPresetId);
    return config.params;
  };

  // The chat's app-tier PROSE overrides, resolved under the chat's HOST (PROSE-1 owner-decision 8, option
  // (a) — the room's side generations read one stable voice, not the speaker-of-the-moment's). One home with
  // `resolvePromptVariables`/`resolveChatPresetParams`: same host resolution, same hostless degrade — an
  // empty record, which resolves every slot to its shipped default (byte-identical to pre-PROSE-1).
  const resolveChatProse = async (chatId: ChatId): Promise<ProseOverrides> => {
    const hostUserId = await resolveChatHostUserId(chatId);
    if (hostUserId === null) {
      return {};
    }
    return (await input.settings.loadUserSettings(hostUserId)).prose;
  };

  // The one memory-config merge: the admin-set defaults, forced to `mode:"off"` when the host disabled
  // memory. Kept pure so both the live turn path and the sweep resolver funnel through it without
  // re-reading settings — the opt-out can't be honored on the turn and dropped on the sweep.
  const withMemoryOptOut = (disabled: boolean, defaults: MemoryConfig): MemoryConfig => (disabled ? { ...defaults, mode: "off" } : defaults);

  const resolveMemoryConfig = async (hostUserId: UserId): Promise<MemoryConfig> => {
    const us = await input.settings.loadUserSettings(hostUserId);
    const defaults = input.settings.getEffectiveConfig().memoryDefaults;
    return withMemoryOptOut(us.memory.enabled === false, defaults);
  };

  // The D50 PromptTransform registrar (automation-design/04 §6) — one per deploy. Zero registrants today
  // (automation A7 + the plugin host register onto it later); its `apply` is the `ChatContext.promptTransforms`
  // op, so a chat with no transforms assembles + streams byte-identically.
  // Item 2: the per-transform deadline is a live admin knob (promptTransformDeadlineMs) — read per apply.
  const promptTransformRegistry = createPromptTransformRegistry(emitChatEvent, () => input.settings.getEffectiveConfig().promptTransformDeadlineMs);

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
    newChatTurnId: minter(ID_PREFIX.chatTurn),
    hashToken: createTokenHasher(input.sessionSecret),
    audit: input.audit,
    // Fans chatsChanged to every present human member's channel; the engine passes a bare chatId
    // (principal-blind) — this composition-root helper enumerates membership.
    emitChatChanged: createChatChangedEmitter(db),
    applyRegexReplace: createRegexApplyReplace(),
    // D121-E: the four-scope junction dereference (global/preset/cast/room). Chat owns the UNION
    // (`substrate/regex-tier`), the regex domain owns the STORAGE — one seam, no blob copies.
    resolveRegexSources: input.resolveRegexSources,
    tools: input.toolUse === undefined ? null : buildChatToolOps(input.toolUse, input.resolveHostPrincipal),
    // Bridges the chat role's streaming AsyncIterable onto infra's Promise+onDelta shape — the extracted
    // domain→infra turn bridge (createRunChatTurnBridge), injecting the leaf infra runChatTurn + OR-skin map.
    runChatTurn: createRunChatTurnBridge({
      runChatTurn: input.runChatTurn,
      getOrSkinTierModels: () => input.connection.getOrSkinTierModels(),
    }),
    resolveChatPresetParams,
    resolveChatProse,
    resolveChat: (params) => resolveChatVia(params.runAsUserId, params.routable),

    resolveCredential: async ({ runAsUserId, source }) => input.credentials.resolve({ principal: await realHostPrincipal(runAsUserId), source }),
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
    getCard: ({ ownerId, characterId }) => input.character.getCard({ principal: hostPrincipal(ownerId), characterId }),
    // ── HOST-HANDOFF COPY (stickler 2026-08-03 §5) — the three OWNING-domain write factories the accepted
    // property offer executes. Each lives in the domain that owns its tables and is injected here, so chat
    // never writes a `characters`, `world_books` or `chat_digests` row (`own-tables-only`). All three are
    // unreachable without a stored offer, so an offer-less handoff never calls any of them.
    copyHandoffCards: createCopyHandoffCards({
      db: input.db,
      now: input.now,
      newCharacterId: minter(ID_PREFIX.character),
      // The avatar RE-OWN: `assets` is per-owner with an `(owner_id, hash)` dedup (D21), so the copy cannot
      // carry the source's `avatarAssetId` verbatim — that would be a pointer into a library the nominee
      // cannot read AND a GC root holding the departed host's blob alive. Content-addressing makes this cheap
      // and idempotent (`created:false` when the recipient already has those bytes). Ownership is PROVEN here:
      // an asset that is not the departing host's yields `null` and the copy lands faceless rather than
      // borrowing a stranger's blob.
      copyAvatar: async ({ fromOwnerId, toOwnerId, assetId }) => {
        const ref = await input.assets.assetCasRefById(assetId);
        if (ref === undefined || ref.ownerId !== fromOwnerId) {
          return null;
        }
        const bytes = await input.assets.loadAssetBytes(assetId);
        if (bytes === null) {
          return null;
        }
        const stored = await input.assets.store({
          principal: await input.resolveHostPrincipal(toOwnerId),
          bytes,
          kind: "avatar",
          mime: ref.mime,
        });
        return stored.assetId;
      },
    }),
    copyHandoffBooks: createCopyHandoffBooks({
      db: input.db,
      now: input.now,
      newBookId: minter(ID_PREFIX.worldBook),
      newEntryId: minter(ID_PREFIX.worldEntry),
    }),
    restampHandoffDigests: createHandoffRestampStatements({ db: input.db }),
    // D22 member card — the character's ACCEPTED tag NAMES under the host's ownership (chip display). Resolved
    // through the character domain (chat stays character-table-blind, the getCard precedent); a gone card
    // fail-closes to [] rather than throwing into the member-card read.
    resolveCharacterTags: async ({ ownerId, characterId }) => {
      try {
        const detail = await input.character.get({ principal: hostPrincipal(ownerId), characterId });
        return detail.tags.map((t) => t.name);
      } catch {
        return [];
      }
    },
    // ONE character read → the whole per-seat decoration (render policy layered over the deployment floor,
    // the raw theme + background override columns, and the card name/avatar). A human/agent seat, no host,
    // or an unreadable card resolves to the bare global floor + a null card (fail-closed, never a throw into
    // roster assembly). Collapses what were four separate reads of the same `characters` row per participant.
    // The tier combine is the ONE contracts resolver (`resolveRenderPolicy`) — external media is
    // TIGHTEN-ONLY there, so a card's `forbidExternalMedia: false` can never widen past a blocking
    // deployment (which the app-document CSP enforces independently).
    resolveSeatDeco: async ({ ownerId, characterId }) => {
      const cfg = input.settings.getEffectiveConfig();
      const floor = { trustHtml: cfg.trustHtml, forbidExternalMedia: cfg.forbidExternalMedia };
      if (characterId === null || ownerId === null) {
        return { renderPolicy: floor, themeOverride: null, backgroundOverride: null, card: null };
      }
      try {
        const detail = await input.character.get({ principal: hostPrincipal(ownerId), characterId });
        return {
          renderPolicy: resolveRenderPolicy(floor, detail),
          themeOverride: detail.themeOverride,
          backgroundOverride: detail.backgroundOverride,
          card: { name: detail.name, avatarAssetId: detail.avatarAssetId },
        };
      } catch {
        return { renderPolicy: floor, themeOverride: null, backgroundOverride: null, card: null };
      }
    },
    mintSyntheticGroupCharacter: (params) => input.character.mintSyntheticGroupCharacter(params),
    findSyntheticGroupCharacter: (params) => input.character.findSyntheticGroupCharacter(params),
    resolveUserPublics: async (userId, personaId) => {
      const rows = await db.select({ handle: users.handle }).from(users).where(eq(users.id, userId)).limit(1);
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
            .where(and(eq(chatParticipants.userId, userId), eq(chatParticipants.chatId, forChatId), isNull(chatParticipants.leftSeq)))
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
    filterOwnedAssetIds: async (userId, assetIds) => (await input.assets.resolveOwnedAssetRefs(userId, assetIds)).map((r) => r.assetId),
    materializeBackground: input.materializeBackground,
    // The chat op type erases the batch to `unknown`; this wrapper restores the concrete type.
    applyStatsDelta: (batch, opDb, delta) => {
      applyStatsDelta(batch as BatchStmt[], opDb, delta);
    },
    summarize: input.roleClients.summarize,
    summarizerContextTokens: input.roleClients.summarizerContextTokens,
    memorySummarizer: input.settings.getEffectiveConfig().memorySummarizer,
    // record INSERTs the row (assigning seq) THEN the persisted view is published onto the live bus —
    // a dead bus path never loses an event (subscriptions replay from the table by seq).
    resolveHandle: (handle) => input.resolveHandle(handle),

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
      const rows = await db.select({ ownerId: personas.ownerId }).from(personas).where(eq(personas.id, personaId)).limit(1);
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
    // The SHRINK half of the same seam: memory stores every block that exists, then reclaims the ones that
    // stopped existing. Straight pass-through of the two lens arms — the DELETE itself lives in embeddings
    // (the one vector write path, D20), and chat never touches `chat_digests`/`chat_segments` directly.
    embeddingsPruneBlocks: async (params) => {
      if (params.lens === "digest") {
        await input.embeddings.pruneMemoryBlocks({
          lens: "digest",
          chatId: params.chatId,
          scopedCharacterId: params.scopedCharacterId,
          keepPerTier: params.keepPerTier,
        });
        return;
      }
      await input.embeddings.pruneMemoryBlocks({ lens: "segment", chatId: params.chatId, keepBlockCount: params.keepBlockCount });
    },
    // DB6: absent ⇒ the field stays unset ⇒ GATHER skips the databank branch (byte-identical no-op).
    ...(input.gatherDatabank !== undefined ? { gatherDatabank: input.gatherDatabank } : {}),
    searchDigests: (query) => input.search.digests(query).then((hits) => hits.map((h) => h.blockKey)),
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
    // ⑧(a) — the caller's temporary-chat reap TTL (hours), from the settings domain via the FOREIGN op.
    resolveTempChatTtlHours: async (userId) => (await input.settings.loadUserSettings(userId)).chat.tempChatTtlHours,
    resolvePromptVariables,
    resolvePromptUserMacros,
    // Null ⇒ expressions not wired (byte-identical no-op — the `tools` precedent). The E3 classify hook fires
    // fire-and-forget after a variant commits (expressions-design/02 §0).
    expressions: input.expressions ?? null,
    // Null ⇒ rpg not wired (byte-identical no-op — the `expressions`/`tools` precedent). The 5 injected rpg
    // turn ops (rpg-design/05 §0) fire at GATHER / preset-resolve / send-commit / turn-end.
    rpg: input.rpg ?? null,
    // Null ⇒ the crew's director isn't wired (byte-identical no-op). The GATHER op adds the director's guidance
    // injection per turn (chat-crew-design/04 §1); a forward-ref delegate over the crew service (built after chat).
    crew: input.crew ?? null,
    // The D50 PromptTransform apply op (04 §6) — the registry's `apply`. Zero registrants ⇒ byte-identical.
    promptTransforms: promptTransformRegistry.apply,
  };

  // The budget WINDOW is a live admin knob (nonOwnerLocalComputeBudgetWindowMs) — read per debit so a retune
  // applies without a restart, matching the per-debit-live cap (item 4).
  const memberBudget = createMemberBudget(db, { windowMs: () => input.settings.getEffectiveConfig().nonOwnerLocalComputeBudgetWindowMs, now });

  const chatDeps: ChatServiceDeps = {
    emit: emitChatEvent,
    activeTurns: createActiveTurns(),
    prng: () => Math.random(),
    delay: sleep,
    resolveConnection: async ({ runAsUserId, chatId }) => {
      const rows = await db.select({ metadata: chats.metadata }).from(chats).where(eq(chats.id, chatId)).limit(1);
      const meta = parseChatMetadata(rows.at(0)?.metadata ?? null);
      const routable: RouteChatAssignment = meta.providerRouting !== undefined ? { providerRouting: meta.providerRouting } : {};
      return resolveChatVia(runAsUserId, routable);
    },
    // The honest-refusal pre-send gate (#54): read the SAME chat-row routing overlay `resolveConnection` reads,
    // then ask the connection domain the deterministic serveability question (no turn, no API call).
    checkSendAvailability: async ({ runAsUserId, chatId }) => {
      const rows = await db.select({ metadata: chats.metadata }).from(chats).where(eq(chats.id, chatId)).limit(1);
      const meta = parseChatMetadata(rows.at(0)?.metadata ?? null);
      const routable: RouteChatAssignment = meta.providerRouting !== undefined ? { providerRouting: meta.providerRouting } : {};
      return input.connection.checkChatAvailability({ principal: await realHostPrincipal(runAsUserId), routableChat: routable });
    },
    resolveCreatorGroupDefaults: async (userId) => (await input.settings.loadUserSettings(userId)).groupDefaults,
    resolveForeignInputs: async ({ runAsUserId, anchorPersonaId, presentHumanUserIds, trigger, presetOverride }) => {
      const us = await input.settings.loadUserSettings(runAsUserId);

      // A feature-supplied GM-voice preset REDIRECT (rpg-design/02 §1.1 #1) wins over the host's default when it
      // resolves owned-or-system under the host; a stale/unowned override degrades to the host's normal default
      // (the lenient-id rule — never a broken turn). Absent ⇒ the host default (byte-identical to today).
      const { config: promptConfig, presetId } = await resolvePromptConfigWithOverride(runAsUserId, presetOverride, us.seeds.defaultPresetId);

      // THE ROOM-PLANE PERSONA READ (the multi-human widening). NOT `persona.get` under a host Principal:
      // that owner-scoped keyhole silently nulled every NON-HOST member's persona, so a member's own turn
      // rendered `{{user}}` as the kit floor "User" and a host-pinned member-owned anchor was a dead pin —
      // both violating FINAL-Persona §A.1 in exactly the multi-human room the D16/D18 spine exists for. The
      // persona domain's principal-less roster op resolves the room's ids in ONE gated read; chat supplies
      // the consent set (its PRESENT humans), so a departed member's persona resolves to nothing.
      const activePersonaId = activePersonaIdFor({ trigger, anchorPersonaId });
      const roster = await input.resolvePersonasForRoster({
        personaIds: [anchorPersonaId, activePersonaId].flatMap((id) => (id === null ? [] : [id])),
        allowedOwnerIds: presentHumanUserIds,
      });
      const projectPersona = (
        personaId: PersonaId | null,
      ): {
        name: string;
        description: string;
        placement: PersonaDescriptionPlacement;
      } | null => {
        const p = personaId === null ? undefined : roster.get(personaId);
        return p === undefined
          ? null
          : {
              name: p.name,
              description: p.description,
              placement: resolvePersonaDescriptionPlacement(p.metadata),
            };
      };
      // anchor = the chat-open {{user}} (card-derived sections); active = prompt-config {{user}}, bound by
      // the three-state trigger contract above.
      const anchor = projectPersona(anchorPersonaId);
      const active = projectPersona(activePersonaId);

      const memoryConfig = withMemoryOptOut(us.memory.enabled === false, input.settings.getEffectiveConfig().memoryDefaults);

      return {
        promptConfig,
        // WAVE MU — the resolved preset id for user-macro source attribution (override id / host default / null).
        presetId,
        personas: { anchor, active },
        // FLAG[timezone-per-request]: {{time}}/{{date}} use the caller's per-request browser zone; the
        // macro engine falls back to server-local until the turn request carries it.
        scanDepth: us.worldInfo.scanDepth,
        injectionTokenBudget: us.worldInfo.tokenBudget,
        memoryConfig,
        // PD-146: the host's turn-behavior arm the engine honors (custom stops + auto-continue/auto-swipe).
        chatBehavior: {
          autoContinue: us.chat.autoContinue,
          autoContinueRounds: us.chat.autoContinueRounds,
          autoSwipe: us.chat.autoSwipe,
          customStoppingStrings: us.chat.customStoppingStrings,
        },
        // DB6: the host's databank retrieval params (k/minScore/rerank) the gather passes to search.documents,
        // plus the {{databank}} slot budget — the FOREIGN-inputs seam (settings read chat delegates).
        databankRetrieval: us.databank.retrieval,
        databankSlotTokenBudget: us.databank.slotTokenBudget,
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

  const chatBundle = createChatService(chatCtx, chatDeps);
  return {
    service: chatBundle.service,
    emitBusEvent: emitChatEvent,
    rpgChatOps: {
      getMembership: createGetMembership(chatCtx),
      postNarratorMessage: createPostNarratorMessage(chatCtx, { emit: emitChatEvent }),
      getPendingUserText: createGetPendingUserText(chatCtx),
      setRpgPointer: createSetRpgPointer(chatCtx),
      resolveRpgRoster: createResolveRpgRoster(chatCtx),
      resolveHostUserId: resolveChatHostUserId,
      resolveCanonWindow: createResolveCanonWindow(chatCtx),
      resolveCardCorpus: createResolveRpgCardCorpus(chatCtx),
      resolvePromptUserMacros,
    },
    promptTransforms: promptTransformRegistry,
    applyVariableOps: (chatId, ops) => applyStandaloneVariableOps(chatCtx, chatId, ops),
    resolveChatProse,
    requestTurn: chatBundle.requestTurn,
    backfill: {
      memory: (args) => backfillMemory(chatCtx, args, resolveMemoryConfig),
      groupCharacters: (args) => backfillGroupCharacters(chatCtx, args),
    },
  };
}
