// Chat domain's slice of the composition root: wires the widest DI bundle in the system (ChatContext +
// ChatServiceDeps). Owns no business logic.
//
// Identity impedance: chat's cross-feature ops are keyed by the frozen host `UserId` (the host may be
// offline, so no request Principal exists). Two bridges: role-irrelevant ops use the cheap synthetic
// `hostPrincipal`; role-sensitive ops (owner-gates) use the injected `resolveHostPrincipal`.

import { setTimeout as sleep } from "node:timers/promises";
import type { DurableChatBusEvent, LiveOnlyChatBusEvent, VariablePrecondition, VariableWriteResult } from "@orb/contracts/chat";
import { resolveRenderPolicy } from "@orb/contracts/chat";
import type { Can, Principal } from "@orb/contracts/identity";
import { EMBED_SPACE_DIMS } from "@orb/contracts/inference";
import type { ChoiceBlockSpec, PromptConfig, UserIntent, UserMacroSpec } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { ProseOverrides } from "@orb/contracts/prose";
import { composeProse } from "@orb/contracts/prose";
import type { MaterializeBackgroundOp } from "@orb/contracts/theme";
import type { Db } from "@orb/db";
import { characterPersonas, chatParticipants, personas, users } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import type { AgentSeedBlock, AgentSeedTurn, ChatDeltaEvent, ChatEvent, ChatRequest, ChatResult, Resolved, RoleClientsWithSignal } from "@orb/inference";
import { AGENT_CONTINUATION_PROMPT_STUB, AGENT_PROMPT_TAIL_JOINER, createAgentToolServer, NoConnectionError, ProviderError } from "@orb/inference";
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
  MemoryRecallRecorder,
  PostNarratorMessage,
  PresenceReadOp,
  PromptTransformRegistry,
  RequestTurnOp,
  ResolveCanonWindow,
  ResolveRpgCardCorpus,
  ResolveRpgParticipants,
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
  createChatTeachingContributions,
  createClaimChat,
  createGetMembership,
  createGetPendingUserText,
  createPostNarratorMessage,
  createPromptTransformRegistry,
  createReactAsCharacter,
  createResolveCanonWindow,
  createResolveRpgCardCorpus,
  createResolveRpgParticipants,
  createSetRpgPointer,
  getGroupConfig,
  getRoomOverrides,
} from "#domain/chat";
import type { ConnectionService } from "#domain/connection";
import type { EmbeddingsService } from "#domain/embeddings";
import { createHandoffRestampStatements } from "#domain/embeddings";
import type { ImageryService } from "#domain/imagery";
import type { NotificationsService } from "#domain/notifications";
import type { PersonaService, ResolvePersonasForParticipants } from "#domain/persona";
import { PersonaNotFoundError } from "#domain/persona";
import type { PresetService } from "#domain/preset";
import { PresetNotFoundError } from "#domain/preset";
import type { ResolveRegexSources } from "#domain/regex";
import { createCopyHandoffRegexScripts, createCountHandoffRegexScripts } from "#domain/regex";
import type { SearchService } from "#domain/search";
import { createTokenHasher } from "#domain/sessions";
import type { SettingsService } from "#domain/settings";
import { applyStatsDelta, bumpStatsCanonVersion } from "#domain/stats";
import type { ResolvedToolSet, ToolUseService } from "#domain/tool-use";
import { createCopyHandoffBooks, createCountHandoffBooks } from "#domain/world-info";
import type { AuditEntry } from "#foundation/observability";
import { buildAuditStatement, recordMemoryLog } from "#foundation/observability";
import { createRegexApplyReplace, createRegexTest } from "#kit/regex";
import { publishNotification } from "../../transport/trpc/index.ts";
import { createReactToolDefinition } from "./chat-tools.ts";
import { createChatChangedEmitter } from "./emit-chat-changed.ts";
import { resolveImageRefToUrl } from "./resolve-image-ref.ts";

/** Per-chat turn-lock TTL (ms) — auto-expires so a crashed holder's lock is takeover-eligible. */
const CHAT_LOCK_TTL_MS = 120_000;

function minter<P extends string>(prefix: P): () => TypeIdOf<P> {
  return (): TypeIdOf<P> => mintTypeId(prefix);
}

// Agent-sdk turn shape: the stateful backend wants a session seed (transcript before this turn) + a prompt
// tail (trailing user rows). With both it resumes its cached session and reseeds on divergence, so history
// rides the session instead of being re-sent flattened every turn. Tool and system rows ride the seed as
// their own frames (#1593), and a history with NO trailing user row seeds everything and asks the
// host-authored continuation stub (#1607) — there is no flattened-transcript prompt string on this wire at all.

/**
 * What a NON-TEXT content part leaves behind in a seed frame's text — TOTAL over `ChatContentPart`, because the
 * honest answer is per-KIND (#1606). It used to be one literal `[Image]` for every part, so a real `tool` row —
 * which carries a `tool-result` part and no text (`domain/chat/engine/pipeline.ts::toolExchangeMessages` is the
 * only producer) — announced itself to the model as `Tool result: [Image]`: a false statement about the
 * transcript, and one that hides the drop (the model cannot tell that bytes it was told about are missing).
 *
 * NAMES THE KIND, NEVER THE PAYLOAD. Emitting a tool result's bytes here would widen what the agent-sdk request
 * carries — the separate structural arm (#1605), not a rendering decision. The wording follows the house drop
 * vocabulary already used at the engine's own media seam (`droppedMediaPlaceholder`, `[<kind> omitted]`).
 *
 * A MAPPED RECORD, not a switch (§5.5 admits both, and only one of them lints): a `switch` over a value typed
 * `Exclude<TurnContentPart, {type:"text"}>` makes biome's type service call EVERY case unreachable
 * (`lint/suspicious/noUnnecessaryConditions` — the computed-type sibling of the cross-module-union and
 * intersection cases). The Record keeps the enforcement identical: a new content-part member is a missing
 * property here and fails `tsc` (verified by planting one — `TS2741` at this site).
 */
/**
 * One part of a row compose was handed — DERIVED from the domain message, never re-spelled and deliberately
 * not the D51 seam symbol: compose does not PRODUCE content parts (the engine request seam does) and does not
 * put them on a wire (the sealed runners do). It maps the message it is given onto the provider request, and
 * this alias is the type of what is already in its hand.
 */
type TurnContentPart = TurnMessage["content"][number];

const DROPPED_PART_TEXT: Record<Exclude<TurnContentPart, { type: "text" }>["type"], string> = {
  image: "[image omitted]",
  video: "[video omitted]",
  // The agent-sdk wire is a subprocess with no reasoning-replay channel, so a replayed thinking part cannot
  // ride here. Named rather than blank for the same reason as the rest: a silent drop tells the model the
  // turn had no reasoning, which is a false statement about the transcript.
  reasoning: "[reasoning omitted]",
  "tool-call": "[tool call omitted]",
  "tool-result": "[tool result omitted]",
};

/**
 * One rendered row: a non-text part leaves the marker naming its own kind ({@link DROPPED_PART_TEXT}); the wire
 * `name` label is stamped into the text (agent-sdk seed frames carry no `name` field).
 *
 * `parts` defaults to the whole row and is narrowed by the seed builder, which lifts the parts that ride as
 * REAL SDK blocks (#1605) out first and renders only what is left. An EMPTY render takes no name stamp: an
 * empty row is not a turn, and `Alice: ` is not a truer statement of that than an empty string is.
 */
function agentRowText(m: TurnMessage, parts: readonly TurnContentPart[] = m.content): string {
  const text = parts.map((c) => (c.type === "text" ? c.text : DROPPED_PART_TEXT[c.type])).join("");
  if (text.length === 0) {
    return "";
  }
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
 *
 * THAT LAST CLAIM IS NOW CAPABILITY-CONDITIONAL, and the condition holds on this wire (2026-08-18, #201).
 * SHAPE can also emit a MID-ARRAY system row — a depth \> 0 system injection — gated on
 * `turns.historySystemRows`, which is declared ONLY by the vLLM arm (`VLLM_TURNS`) and by no
 * agent-sdk arm (every anthropic cell is `false`, and only a live probe may flip one). (A D129(B) narrator
 * row was briefly a second producer on that same bit; owner-ruled out 2026-08-18 — narrator delivers
 * assistant on every wire, so canon contributes no system row here at all.) This walk-back would
 * lift a mid-array run out of position if one ever reached it, so a future arm declaring `historySystemRows`
 * on the agent-sdk wire-shape MUST come here first — the enforcer is the capability cell, and this is the
 * coupling it protects.
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
 * participants read as every other arm, so `active === anchor` is byte-identical to the anchor projection and the
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
    .map((m) => agentRowText(m))
    .filter((t) => t.length > 0)
    .join(AGENT_PROMPT_TAIL_JOINER);
  // Drop the system band; keep the canon head AND the nudge tail (the nudge is a real user turn).
  const rows = [...history.slice(0, sysStart), ...history.slice(sysEnd)];
  return { rows, systemText: text.length > 0 ? text : null };
}

/**
 * The turn label a history row announces itself with on the agent-sdk arm. TOTAL over `HistoryRole`, and that
 * is the security property, not a tidiness one (#1457): it used to be a `Partial<Record<…>>` with a
 * `?? "User"` default, so every tool RESULT rendered as `User: <tool output>` — promoting attacker-influenced
 * bytes (a fetched page, a databank row, a search hit) from DATA the model may reason about to an INSTRUCTION
 * apparently authored by the human, which is the confusion role separation exists to prevent. TOTAL, not
 * defaulted, so the recurrence is a COMPILE error: a new `HISTORY_ROLES` member with no label here fails `tsc`
 * instead of silently inheriting the user's voice (the §5.5 mapped-Record dispatch shape).
 *
 * The labels now announce a SEED FRAME rather than a line in a flattened blob (#1607 deleted the blob), so a
 * label is no longer a boundary anything could forge — but it is still the only thing that says whose voice a
 * `user`-framed row speaks in, which is the whole of #1457.
 */
const AGENT_ROW_LABELS: Record<TurnMessage["role"], string> = { user: "User", assistant: "Assistant", system: "System", tool: "Tool result" };

/**
 * How each history role rides the SESSION SEED. TOTAL, and both facts are load-bearing: `frame` is the SDK
 * frame role (the seed vocabulary has exactly two — {@link AgentSeedTurn}), and `announce` says whether the
 * frame's text must carry its own label. A role with no native frame (`tool`, `system`) can only ride as a
 * `user` frame, so it MUST announce itself or it wears the human's voice — #1457's confusion, relocated. A new
 * `HISTORY_ROLES` member fails `tsc` here instead of silently inheriting `user`.
 *
 * `announce` governs the TEXT half only. A tool exchange that rides as real `tool_use`/`tool_result` blocks
 * (#1605) needs no label at all — the wire carries the role — and {@link seedBlocksFor} stamps one only on what
 * is left as prose. The `tool` row's `user` frame is therefore the CARRIER of the blocks, not a claim about who
 * spoke.
 */
const AGENT_SEED_FRAMES: Record<TurnMessage["role"], { readonly frame: AgentSeedTurn["role"]; readonly announce: boolean }> = {
  user: { frame: "user", announce: false },
  assistant: { frame: "assistant", announce: false },
  system: { frame: "user", announce: true },
  tool: { frame: "user", announce: true },
};

/**
 * Split the shaped history into the session seed + the prompt this turn queries with. TOTAL — every history
 * reaches the SDK as frames plus one prompt, and there is no other agent-sdk turn shape (#1607).
 *
 * THIS IS THE STRUCTURAL ARM (#1593, completed by #1607). The seed is not a nicety —
 * `session/frames.ts::buildSeedFrames` emits ONE `SessionStoreEntry` per seed turn, so a turn boundary here is a
 * JSON frame and content inside a frame cannot create another frame. A `tool` row therefore never forces a flat
 * string: it rides as an ANNOUNCED `user` frame instead.
 *
 * THE TAIL IS THE TRAILING RUN OF `user` ROWS, never "everything after the last assistant". The two rules agree
 * on every tool-free history (system rows near the tail are lifted by {@link extractTrailingSystemRows} first),
 * and they differ exactly where it matters: a `tool` row after the last assistant would otherwise become the
 * QUERY PROMPT — tool output handed to the model as the human's own message, #1457 arriving by the other door.
 * The tail carries NO host labels, so there is nothing in it for content to imitate.
 *
 * NO TAIL ⇒ THE HOST-AUTHORED {@link AGENT_CONTINUATION_PROMPT_STUB}, and the WHOLE history seeds. That case is
 * live, not theoretical: a tool exchange leaves `[…, assistant, tool]` on the recursion's next request, and a
 * turn whose verb appends no user row ends on an assistant. It used to flatten the entire transcript into one
 * prompt string with a text turn boundary; the stub deletes that string, so the paragraph-collapse fence #1593
 * had to install is gone too (rows keep their bytes — they are separate frames).
 *
 * AN EMPTY-TEXT ROW IS NOT A TURN and never becomes a frame: `message.content: [{type:"text", text:""}]` is a
 * body the Anthropic wire rejects, which would fail every later turn on that lineage rather than this one.
 */
export function splitAgentHistory(history: readonly TurnMessage[]): { seed: readonly AgentSeedTurn[]; prompt: string } {
  let tailStart = history.length;
  while (tailStart > 0 && history[tailStart - 1]?.role === "user") {
    tailStart -= 1;
  }
  const tail = history
    .slice(tailStart)
    .map((m) => agentRowText(m))
    .filter((t) => t.length > 0)
    .join(AGENT_PROMPT_TAIL_JOINER);
  // An empty tail means the trailing user run said nothing (or there was none): the whole history seeds and the
  // stub is the query. Never a blank prompt, and never a bare tool row promoted to one.
  const seedRows = tail.length > 0 ? history.slice(0, tailStart) : history;
  return { seed: seedTurnsFor(seedRows), prompt: tail.length > 0 ? tail : AGENT_CONTINUATION_PROMPT_STUB };
}

/**
 * The tool-call ids whose exchange may ride the seed STRUCTURALLY — both halves present AND ADJACENT: a
 * `tool-call` part on an assistant row, answered by a `tool-result` with the same id in the tool run that
 * immediately follows it.
 *
 * THE ADJACENCY IS A FAIL-CLOSED RULE, not tidiness. The Anthropic wire requires every `tool_use` to be
 * answered by a `tool_result` in the very next message and refuses an orphan in either direction, so a seed
 * that emits half a pair is not a degraded turn — it is a 400 on EVERY later turn of that lineage. A history
 * can arrive half-paired for ordinary reasons (a context-window slide cuts between the call and its result,
 * an assembly materializes a recorded-but-unexecuted call), so the unpaired half degrades to the announced
 * text it rode as before #1605 and the turn still runs.
 *
 * PARSEABILITY IS PART OF THE SAME QUESTION. The wire's `tool_use.input` is an OBJECT and `arguments` is the
 * RAW model-emitted string, so a blob that is not a JSON object cannot become a valid `tool_use` — and the
 * decision has to be made HERE, with the pair, or the frame builder would drop one half of a pair this
 * function had already blessed and mint the orphan itself.
 */
function pairedToolCallIds(history: readonly TurnMessage[]): ReadonlySet<string> {
  const paired = new Set<string>();
  history.forEach((row, index) => {
    if (row.role !== "assistant") {
      return;
    }
    const answered = answeredIdsAfter(history, index);
    for (const part of row.content) {
      if (part.type === "tool-call" && answered.has(part.toolCallId) && isJsonObject(part.arguments)) {
        paired.add(part.toolCallId);
      }
    }
  });
  return paired;
}

/** The tool-call ids answered by the run of `tool` rows IMMEDIATELY following `index` — the only place the wire
 *  accepts an answer, so a result further down the transcript does not count as one. */
function answeredIdsAfter(history: readonly TurnMessage[], index: number): ReadonlySet<string> {
  const answered = new Set<string>();
  for (let j = index + 1; j < history.length && history[j]?.role === "tool"; j += 1) {
    for (const part of history[j]?.content ?? []) {
      if (part.type === "tool-result") {
        answered.add(part.toolCallId);
      }
    }
  }
  return answered;
}

/** Does this raw model-emitted argument blob parse to a JSON OBJECT — the only thing the wire's `tool_use.input`
 *  may be? `JSON.parse`, never an object literal: `parse` defines a `__proto__` key as an OWN property where a
 *  literal would set the prototype. */
function isJsonObject(raw: string): boolean {
  let parsed: unknown;
  // @orb-waive caught-failure-ownership(catch): CLASSIFIER, not a failure — "does this model-emitted blob parse to an object" is the question, and `false` IS the answer (the pair degrades to announced text, which the caller renders). Reporting it would raise a user-facing error for a turn that runs correctly. Ends if this ever gates something other than the structural-vs-text choice.
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
}

/** Is this part riding as a REAL SDK block rather than as announced text? Only a tool part, and only when its
 *  other half is present and adjacent ({@link pairedToolCallIds}). */
function ridesAsBlock(part: TurnContentPart, paired: ReadonlySet<string>): boolean {
  return (part.type === "tool-call" || part.type === "tool-result") && paired.has(part.toolCallId);
}

/**
 * One history row's seed blocks: the rendered text (label- and name-stamped) FIRST, then the structural tool
 * blocks in their own order — the shape the engine actually produces (`[text?, tool-call…]` on the assistant
 * row, `[tool-result]` on each tool row).
 *
 * A STRUCTURAL BLOCK TAKES NO LABEL, and that is the point of the arm: `Tool result:` is a host claim the
 * model has to believe, where a `tool_result` block is a role the wire itself carries. The label survives for
 * everything that still rides as text — a degraded pair, a system row — so nothing ever wears the human's
 * voice by default (#1457).
 */
function seedBlocksFor(m: TurnMessage, paired: ReadonlySet<string>): AgentSeedBlock[] {
  const structural: AgentSeedBlock[] = [];
  const rendered: TurnContentPart[] = [];
  for (const part of m.content) {
    if (ridesAsBlock(part, paired)) {
      structural.push(part as AgentSeedBlock);
    } else {
      rendered.push(part);
    }
  }
  const text = agentRowText(m, rendered);
  const labelled = text.length > 0 && AGENT_SEED_FRAMES[m.role].announce ? `${AGENT_ROW_LABELS[m.role]}: ${text}` : text;
  return [...(labelled.length > 0 ? [{ type: "text", text: labelled } as const] : []), ...structural];
}

/**
 * The seed: one turn per history row, EXCEPT that a contiguous run of `tool` rows folds into ONE `user` turn.
 * The fold is required by the same wire rule the pairing check serves — every `tool_result` answering one
 * assistant message must ride in a SINGLE following user message, and the engine emits one `tool` row per
 * executed call, so a row-per-turn seed would split a two-call batch across two user messages and 400.
 *
 * A row that renders to nothing contributes NO frame: `content: [{type:"text", text:""}]` is a body the
 * Anthropic wire rejects, and an empty frame is not a turn anyone took.
 */
function seedTurnsFor(rows: readonly TurnMessage[]): AgentSeedTurn[] {
  const paired = pairedToolCallIds(rows);
  const seed: AgentSeedTurn[] = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    if (row === undefined) {
      i += 1;
      continue;
    }
    if (row.role === "tool") {
      const run = foldToolRun(rows, i, paired);
      if (run.content.length > 0) {
        seed.push({ role: AGENT_SEED_FRAMES.tool.frame, content: run.content });
      }
      i = run.next;
      continue;
    }
    const content = seedBlocksFor(row, paired);
    if (content.length > 0) {
      seed.push({ role: AGENT_SEED_FRAMES[row.role].frame, content });
    }
    i += 1;
  }
  return seed;
}

/** The blocks of the whole contiguous `tool` run starting at `start`, plus the index after it. */
function foldToolRun(rows: readonly TurnMessage[], start: number, paired: ReadonlySet<string>): { content: AgentSeedBlock[]; next: number } {
  const content: AgentSeedBlock[] = [];
  let i = start;
  while (i < rows.length) {
    const row = rows[i];
    if (row === undefined || row.role !== "tool") {
      break;
    }
    content.push(...seedBlocksFor(row, paired));
    i += 1;
  }
  return { content, next: i };
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
  readonly emitChatEvent: (event: DurableChatBusEvent) => Promise<void>;
  /** The same emit with the durable append verdict retained for resumable host-handoff completion. */
  readonly emitChatEventChecked: ChatServiceDeps["emitChecked"];
  /** The chat bus's prepared birth-event seam: statement joins room creation; callback fans after commit. */
  readonly prepareChatCreationEvent: ChatServiceDeps["prepareCreationEvent"];
  /** The same bus's LIVE-ONLY fan (no `chat_events` append). Chat's one consumer is `chatDeleted`, whose
   *  durable row cascades away with the chat it announces — see the lifecycle verbs' DELETE-FIRST header. */
  readonly emitChatEventLive: (event: LiveOnlyChatBusEvent) => void;
  /** The lock-holder tag for this replica (also used by the boot lock reclaim). */
  readonly holder: string;
  readonly sessionSecret: string | null;
  /** The frozen-host → `Principal` bridge for role-sensitive ops. */
  readonly resolveHostPrincipal: (userId: UserId) => Promise<Principal>;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  readonly can: Can;
  /** D121-E: the regex domain's four-scope resolve op (the host-tier sources a turn assembles against). */
  readonly resolveRegexSources: ResolveRegexSources;
  /** The per-FUNDER role-client binder (§8.5b): every chat-side side call — arbiter, digests, extract-quiet —
   *  spends the TRIGGER's rows; the vector writes and reads use the room HOST's (vector tasks are owner-scoped). */
  readonly roleClientsFor: (funderUserId: UserId) => Promise<RoleClientsWithSignal>;
  readonly connection: Pick<ConnectionService, "resolve" | "availability">;
  /** The post-generation credential STRIKE-OUT (#1373) — the credentials domain's verb, wired DIRECT. */
  readonly maybeRevokeOnAuthFailed: ChatContext["maybeRevokeOnAuthFailed"];
  readonly character: CharacterService;
  readonly persona: PersonaService;
  /** The persona domain's PRINCIPAL-LESS participants op (`domain/persona/contract/ops.ts`) — the ONE room-plane
   *  persona read the FOREIGN-inputs resolver uses. Separate from `persona` because `PersonaService` is
   *  Principal-scoped by contract, and a room's assembly has no single Principal to read as (D106). */
  readonly resolvePersonasForParticipants: ResolvePersonasForParticipants;
  readonly preset: PresetService;
  readonly settings: SettingsService;
  readonly notifications: NotificationsService;
  readonly resolveHandle: (handle: Handle) => Promise<UserId | null>;

  readonly search: SearchService;
  readonly embeddings: EmbeddingsService;
  /** #250 — the memory-recall flight recorder built at the composition root; its `sink` becomes
   *  `ChatContext.recordRecall` so every `{{memory}}` recall lands in the ring `/api/_debug/memory/recalls`
   *  tails. OPTIONAL: absent ⇒ nothing records (an int test that builds chat without the recorder), and recall
   *  is byte-identical either way. */
  readonly recallRecorder?: MemoryRecallRecorder | undefined;
  /** The databank `{{databank}}`-slot GATHER op (DB6) — OPTIONAL; absent wires `ChatContext.gatherDatabank`
   *  to undefined (byte-identical no-op). Bridged from `databank.gatherRetrieval` at the composition root. */
  readonly gatherDatabank?: ChatContext["gatherDatabank"];
  /** The compose-tier executor FENCE (§7.5-1a): chat receives exactly the bound `runChatTurn`. */
  readonly runChatTurn: (req: ChatRequest) => Promise<ChatResult>;
  /** The deployment's Anthropic prompt-cache depth FLOOR, read per turn off the resolved AppSettings tier
   *  (`EffectiveAppConfig.promptCacheMinDepth`, Settings › Admin › System tuning). A thunk, not a value, so an
   *  admin flip reaches the next turn without a restart. Absent ⇒ the floor 0 (byte-identical no-op). */
  readonly promptCacheMinDepth?: () => number;
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
  /** FOREIGN S2 teaching contributions (interaction-direction-spec §3-S2) — OPTIONAL; absent wires the
   *  registry to chat's own contribution alone (byte-identical no-op, the `rpg`/`expressions` precedent).
   *  Chat's own contributor is ALWAYS present, which is why the ctx field itself is not nullable. */
  readonly teaching?: ChatContext["teaching"] | undefined;
  /** The per-turn PLUGIN-MACRO resolve (plugin-ui-plane §5.15, U6) — OPTIONAL; absent wires
   *  `ChatContext.pluginMacros` to null (byte-identical no-op, the `rpg`/`expressions` precedent). Minted at the
   *  composition root as the plugin-macro registry's `resolveForTurn`, so chat and the plugin plane share ONE
   *  registry without either importing the other. */
  readonly pluginMacros?: ChatContext["pluginMacros"] | undefined;
}

/** The chat compose product: the service + the bus's durable-first emit, surfaced for other producers that
 *  publish onto the chat bus (e.g. world-info). */
export interface ChatComposeResult {
  readonly service: ChatService;
  readonly emitBusEvent: (event: DurableChatBusEvent) => Promise<void>;
  /** The generic, principal-free chat ops domain/rpg receives by injection — built over chat's own
   *  ctx here (chat never learns rpg). Wired onto `RpgContext.chat` at the rpg compose block. */
  readonly rpgChatOps: {
    readonly getMembership: GetMembership;
    readonly postNarratorMessage: PostNarratorMessage;
    readonly getPendingUserText: GetPendingUserText;
    /** The opaque pointer write — `createGame` calls it once. */
    readonly setRpgPointer: SetRpgPointer;
    /** The roster projection — the tracker view's roster ∪ sheets source. */
    readonly resolveRpgParticipants: ResolveRpgParticipants;
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
    /** The chat's GM-PRESET prose overrides (PROSE-1 S4) — what the two rpg HOST DOORS (`resyncFromStory`,
     *  `populateFromCharacter`) resolve their extraction prose through. Chat owns preset resolution AND the
     *  GM-voice redirect; rpg reads no preset table, and re-deriving either here would be a second home for
     *  both rules.
     *
     *  TWO ARMS, TWO INVOCATION CLASSES — that difference is why this is not a duplicate of the turn path and
     *  must not be "unified" with it. A post-commit state ROUND rides the CAPTURED view its own turn already
     *  resolved (`RpgTurnContext.prose`): it runs AFTER that turn's prompt was assembled, so a second
     *  resolution moment there could disagree with the very prompt it is extracting from — a divergence by
     *  construction, ruled out. A VERB DOOR has no first resolution to diverge from; the consenting human
     *  clicked a button and this IS the moment, exactly as `resolvePromptUserMacros` is for the picks pane. */
    readonly resolveChatPresetProse: (chatId: ChatId) => Promise<ProseOverrides>;
  };
  /** The D50 PromptTransform registrar — surfaced so automation's rule lifecycle
   *  + the plugin host `register`/`unregister` their `transform_draft` transforms onto the same list the
   *  turn pipeline applies. Zero registrants today (byte-identical no-op). */
  readonly promptTransforms: PromptTransformRegistry;
  /** The standalone (out-of-turn) runtime-variable write, bound over chat's own
   *  ctx — automation's `set_variable` chat-scope arm injects this at the composition root (chat learns
   *  nothing automation-shaped; principal-free — the author's authority was gated upstream). */
  readonly applyVariableOps: (chatId: ChatId, ops: readonly VarOp[], expect?: readonly VariablePrecondition[]) => Promise<VariableWriteResult>;
  /** The room HOST's app-tier prose overrides for a chat (PROSE-1 §4.3, owner-decision 8 option (a)) —
   *  surfaced so automation's `set_chat_background` quiet pick reads the SAME host prose the room's other
   *  side generations do, instead of re-deriving the host itself. */
  readonly resolveChatProse: (chatId: ChatId) => Promise<ProseOverrides>;
  /** The NON-HUMAN turn seam (automation-design/03 §4 / 05 §AC-B) — automation's `trigger_turn` arm + the
   *  Tier-2 plugin membrane's `turn.trigger` inject this at the composition root. Principal-free: the funding
   *  host is resolved from the room, and the four walls (depth/authority/budget/consent) enforce inside the verb
   *  + the engine belts. See {@link RequestTurnOp}. */
  readonly requestTurn: RequestTurnOp;
  /** Is memory ON for this host (#156)? The admission gate's read, resolved through the SAME
   *  `resolveMemoryConfig` merge the live turn and the corpus sweep use, so the gate cannot drift from the
   *  per-host skip it exists to pre-empt. */
  readonly isMemoryEnabled: (hostUserId: UserId) => Promise<boolean>;
  /** Chat's corpus sweeps, bound over the chat ctx. */
  readonly backfill: {
    readonly memory: (args: { signal: AbortSignal; ownerId?: UserId | null; funderUserId: UserId }) => ReturnType<typeof backfillMemory>;
    readonly groupCharacters: (args: { signal: AbortSignal; ownerId?: UserId | null; funderUserId: UserId }) => ReturnType<typeof backfillGroupCharacters>;
  };
}

/**
 * Adapt {@link ToolUseService} into the `ChatToolOps` seam. Chat's opaque `ChatToolSet` IS the
 * `ResolvedToolSet` this seam minted; the exec frame's `runAsUserId` resolves to the live host
 * {@link Principal} here (the engine itself stays Principal-blind).
 *
 * D152: an in-turn tool therefore executes under the HOST Principal — there is no per-speaker authority
 * swap at this seam, so attaching a mutating tool to a non-human speak turn is zero-human host authority.
 */
function buildChatToolOps(toolUse: ToolUseService, resolveHostPrincipal: (userId: UserId) => Promise<Principal>): ChatToolOps {
  // biome-ignore lint/suspicious/noExplicitAny: the opaque ChatToolSet round-trip (see the header note).
  const asResolvedSet = (set: ChatToolSet): ResolvedToolSet => set as any as ResolvedToolSet;
  return {
    resolveTools: (driverUserId, names) => toolUse.resolveTools(driverUserId, names),
    toWireTools: (set) => toolUse.toWireTools(asResolvedSet(set)),
    executeToolCalls: async (set, calls, frame) =>
      toolUse.executeToolCalls(asResolvedSet(set), calls, {
        principal: await resolveHostPrincipal(frame.runAsUserId),
        triggeredBy: frame.triggeredBy,
        chatId: frame.chatId,
        membership: frame.membership,
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
          membership: frame.membership,
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
 *  infra→`ChatWarningCode` narrowing lives in the domain (`engine.ts` `toChatWarning`), the mirror of the
 *  IMAGE role's hop where compose hands the domain a narrowed infra code and
 *  `domain/chat/verbs/generate-image.ts` does the re-map. Deduped here because one runner can repeat a code
 *  within a single result; the pipeline dedupes again across recursion depths.
 *  Extracted so the bridge body stays under the cognitive-complexity cap. */
function warningChunks(events: readonly ChatEvent[]): TurnStreamChunk[] {
  const seen = new Map<string, TurnStreamChunk>();
  for (const event of events) {
    if (event.kind === "warning") {
      const { kind: _kind, at: _at, ...warning } = event;
      // KEYED ON THE WHOLE WARNING, not on the code alone (#1440): with the drop's structured half carried
      // through, two DIFFERENT dropped knobs share the `sampling_knob_dropped` code and are two distinct
      // degrades — a code-keyed dedupe would silently pick one and lie about the other. Identical repeats
      // (the same runner re-raising the same drop) still collapse to one.
      seen.set(JSON.stringify(warning), { kind: "warning", ...warning });
    }
  }
  return [...seen.values()];
}

/** The AGENT-SDK arm of the turn mapping: the stateful wire. Trailing depth-0 system rows have already been
 *  lifted out of the transcript by {@link extractTrailingSystemRows} and joined onto `dynamic`, because the SDK
 *  delivers mid-conversation system authority through the dynamic-context hook channel rather than as history
 *  rows. The shape is ONE (#1607): chatId + seed frames + a prompt, which is the trailing user run when there is
 *  one and the host-authored continuation stub when there is not. */
function agentSdkChatRequest(args: { readonly req: TurnRequest; readonly onDelta: (delta: ChatDeltaEvent) => void }): ChatRequest {
  const { req, onDelta } = args;
  const extract = extractTrailingSystemRows(req.history);
  const split = splitAgentHistory(extract.rows);
  const dynamic =
    extract.systemText === null
      ? req.prompt.dynamic
      : [req.prompt.dynamic, extract.systemText].filter((s) => s.trim().length > 0).join(AGENT_PROMPT_TAIL_JOINER);
  return {
    api: "agent-sdk",
    // The WHOLE resolved connection rides the request (§8.4-3): provider row, credential, folded features,
    // extras and capability — the runtime picks the wire off it; nothing here re-derives a routing fact.
    connection: req.connection,
    params: req.intent,
    // `dynamic` carries the extracted trailing system injections — they ride the resolved
    // dynamic-context channel (the hook on a midConversationSystem model) as real system authority.
    systemPrompt: { static: req.prompt.static, dynamic },
    // The stateful tool + structured-output channels (the array wires spread tools/responseFormat
    // on their own arm below): the MCP server mounts the domain's resolved set; responseFormat
    // rides the SDK's own outputFormat (json_schema) — never silently dropped.
    ...(req.agentToolServer !== undefined ? { toolServer: req.agentToolServer, toolTurnLimit: req.agentToolTurnLimit } : {}),
    ...(req.responseFormat !== undefined ? { responseFormat: req.responseFormat } : {}),
    // The TERMINAL channel (D112 R1): the backend mounts these as its own deny-on-use MCP server and
    // hands the co-emitted calls back on `result.toolCalls` — the SAME field the array wires report,
    // so the pipeline's fold reads one shape.
    ...(req.agentTerminalTools !== undefined ? { terminalTools: req.agentTerminalTools } : {}),
    chatId: req.chatId,
    seed: split.seed,
    prompt: split.prompt,
    onDelta,
    signal: req.signal,
  };
}

/** The ARRAY-WIRE arm of the turn mapping (chat-completions / responses / anthropic-messages): the transcript
 *  travels as real history rows and the preset's passthrough channels ride the request as-is. The three apis
 *  share one shape (`HistoryChatRequest`); the discriminant is the connection's own `api`. */
function arrayWireChatRequest(args: {
  readonly req: TurnRequest;
  readonly api: "chat-completions" | "responses" | "anthropic-messages";
  readonly onDelta: (delta: ChatDeltaEvent) => void;
  readonly promptCacheMinDepth: number;
}): ChatRequest {
  const { req, onDelta } = args;
  return {
    api: args.api,
    connection: req.connection,
    params: req.intent,
    systemPrompt: { static: req.prompt.static, dynamic: req.prompt.dynamic },
    // Carried so the wire-capture sink keys the recorded body by chat (the debug endpoint's `chatId`
    // filter); the agent-sdk arm sets it on the seeded spread above.
    chatId: req.chatId,
    history: req.history,
    // The cache breakpoint DEPTH (role switches from the end — `backends/kit/cache-control.ts` owns
    // the axis). SHAPE computes the turn's MINIMUM SAFE depth and returns nothing at all when the
    // stable prefix is disrupted; the admin knob is a FLOOR layered on top, so it can only push the
    // breakpoint DEEPER (more of the tail kept volatile), never shallower — a shallower breakpoint
    // pins bytes that change every turn, which is a guaranteed wasted cache write, not a preference.
    // SHAPE's abort therefore stays absolute: no safe depth ⇒ no breakpoint, whatever the knob says.
    cacheBreakpointDepth: req.cacheBreakpointFromEnd === null ? undefined : Math.max(req.cacheBreakpointFromEnd, args.promptCacheMinDepth),
    // Endpoint body extras ride the CONNECTION (`connection.extras`, §8.1c) — the preset carries none.
    ...(req.tools !== undefined ? { tools: req.tools } : {}),
    ...(req.toolChoice !== undefined ? { toolChoice: req.toolChoice } : {}),
    ...(req.responseFormat !== undefined ? { responseFormat: req.responseFormat } : {}),
    onDelta,
    signal: req.signal,
  };
}

/** The terminal `final` chunk: the infra {@link ChatResult} folded onto the domain's committed economics. */
function finalTurnChunk(req: TurnRequest, result: ChatResult): TurnStreamChunk {
  return {
    kind: "final",
    economics: {
      content: result.reply,
      reasoning: result.reasoning || null,
      model: req.connection.model,
      // ATTRIBUTION (§5.3b): the provider REGISTRY id and the connection row that generated this swipe —
      // denormalised on purpose so a read outlives an edited or deleted connection.
      provider: req.connection.provider.id,
      connectionId: req.connection.connectionId,
      tokensIn: result.usage.tokensIn,
      tokensOut: result.usage.tokensOut,
      cacheReadTokens: result.usage.cacheReadTokens,
      cacheWriteTokens: result.usage.cacheWriteTokens,
      reasoningTokens: result.usage.reasoningTokens,
      contextWindow: result.usage.contextWindow,
      costUsd: result.usage.costUsd,
      costProvenance: result.usage.costProvenance,
      costDetails: result.usage.costDetails,
      // The replayable reasoning blocks (A1) — stored on the variant; the assembly reads them back.
      reasoningParts: result.reasoningParts ?? null,
      maxOutputTokens: result.usage.maxOutputTokens,
      // The provider's per-turn MODEL-CALL count, renamed across the seam (`numTurns` → `modelCalls`)
      // because "turn" already means a CHAT turn on this side. It is what makes `tokensOut` (a sum
      // over the calls) legible against `maxOutputTokens` (a per-call ceiling).
      modelCalls: result.numTurns,
      // The APPLIED effort the wire reported (inference audit B1) — never `req.intent.effort`, which a transport may
      // have dropped or a mandatory clamp raised; the requested value already rides `params`.
      reasoningEffort: result.appliedEffort,
      ttftMs: result.ttftMs,
      finishReason: result.finishReason,
      stopReason: result.stopReason,
      terminalReason: result.terminalReason,
      generationId: result.generationId ?? null,
      ...(result.toolCalls !== undefined ? { toolCalls: result.toolCalls } : {}),
    },
  };
}

/** A PUSH→PULL adapter: the infra runner reports progress by callback (`onDelta`) and completion by promise,
 *  while the chat role consumes an AsyncIterable. The pump buffers pushed chunks and parks the consumer on a
 *  one-shot arrival promise while the buffer is empty, so no delta is dropped between two `next()` calls and a
 *  slow consumer never blocks the producer. `fail` is terminal and rethrows into the consumer AFTER the
 *  already-buffered chunks drain (a mid-stream failure must not swallow the text the user already saw). */
function createChunkPump<T>(): {
  readonly push: (...chunks: readonly T[]) => void;
  readonly close: () => void;
  readonly fail: (err: unknown) => void;
  readonly drain: () => AsyncGenerator<T>;
} {
  const queue: T[] = [];
  let done = false;
  // BOXED, not a bare `unknown`: a rejection value is compared for PRESENCE, and `null`/`undefined` are
  // legal rejection values. The box makes "a failure was recorded" a different question from "the failure
  // is truthy" — the pre-extraction inline pump answered the second and silently ended the stream instead
  // of rethrowing when a runner rejected with a nullish value.
  let failure: { readonly err: unknown } | null = null;
  let notify: (() => void) | null = null;
  const wake = (): void => {
    notify?.();
    notify = null;
  };
  const push = (...chunks: readonly T[]): void => {
    queue.push(...chunks);
    wake();
  };
  const close = (): void => {
    done = true;
    wake();
  };
  const fail = (err: unknown): void => {
    failure = { err };
    done = true;
    wake();
  };
  async function* drain(): AsyncGenerator<T> {
    for (;;) {
      if (queue.length > 0) {
        yield queue.shift() as T;
        continue;
      }
      if (done) {
        if (failure !== null) {
          throw failure.err;
        }
        return;
      }
      const arrival = Promise.withResolvers<void>();
      notify = arrival.resolve;
      await arrival.promise;
    }
  }
  return { push, close, fail, drain };
}

/** The domain→infra turn bridge: maps a domain {@link TurnRequest} to the infra {@link ChatRequest} (the
 *  agent-sdk split + the chat-completions/responses passthrough spreads — customParameters/tools/toolChoice/
 *  responseFormat/cacheBreakpoint), runs it through the injected infra `runChatTurn`, and adapts its
 *  Promise+onDelta shape back onto the chat role's streaming AsyncIterable. Extracted so the four-layer
 *  fidelity harness drives THIS real mapping (injecting only the leaf infra surface), not a facsimile. */
export function createRunChatTurnBridge(deps: {
  readonly runChatTurn: (req: ChatRequest) => Promise<ChatResult>;
  /** The deployment's prompt-cache depth FLOOR (`AppSettings.promptCacheMinDepth`, Settings › Admin › System
   *  tuning) — read PER TURN so an admin flip governs the next request with no restart (the D126 thunk
   *  precedent). Optional: absent reads as the born-in-DB floor 0, which is `Math.max`'s identity, so a
   *  harness that omits it produces byte-identical wire bodies. */
  readonly promptCacheMinDepth?: () => number;
}): (req: TurnRequest) => AsyncIterable<TurnStreamChunk> {
  return async function* runChatTurn(req: TurnRequest): AsyncIterable<TurnStreamChunk> {
    const pump = createChunkPump<TurnStreamChunk>();
    const onDelta = (delta: ChatDeltaEvent): void => {
      pump.push({ kind: delta.kind, text: delta.text });
    };

    // The wire SHAPE is the connection's own `api` (validated ∈ the provider's `apis` on write and at resolve,
    // §7.3): the stateful agent-sdk seed+prompt split, or one of the three history-array wires.
    const api = req.connection.api;
    if (api === null) {
      // A chat task resolved to a row with no chat api (an embedding-kind connection bound to `chat`) — the
      // resolver's `requirementMet` refuses this upstream; here it is an invariant, not a branch.
      throw new ProviderError({ kind: "invalid", retryable: false, message: `connection ${req.connection.connectionId} carries no chat api` });
    }
    const chatReq =
      api === "agent-sdk"
        ? agentSdkChatRequest({ req, onDelta })
        : arrayWireChatRequest({ req, api, onDelta, promptCacheMinDepth: deps.promptCacheMinDepth?.() ?? 0 });

    // @orb-waive caught-failure-ownership(runChatTurn): propagated — the rejection reaches
    // `pump.fail(err)` in the `.catch` below, which the consuming `yield* pump.drain()` surfaces to the
    // caller; never swallowed. Ends if `pump.fail` stops being read by the drain.
    void deps
      .runChatTurn(chatReq)
      .then((result) => {
        // BEFORE the terminal `final` (which ends the drain): the turn's honest-degrade warnings. Without this
        // the runner's `events` died at this seam and D41 held only in the logs, never in the product.
        pump.push(...warningChunks(result.events), finalTurnChunk(req, result));
        pump.close();
      })
      .catch((err: unknown) => {
        pump.fail(err);
      });

    yield* pump.drain();
  };
}

/**
 * Construct the chat `ChatService` + its bus, wiring every {@link ChatContext} op + {@link ChatServiceDeps}
 * collaborator. Returns the service AND the bus emit.
 */
export function buildChatService(input: ChatComposeInput): ChatComposeResult {
  const { db, now, emitChatEvent } = input;

  // Role-irrelevant ops (getCard/persona.get/mint) use this cheap synthetic principal to avoid a per-call read.
  // @orb-waive one-principal-mint-population(Principal): synthetic role-irrelevant principal for frozen-host reads; ends when a shared factory replaces it
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

  // THE FUNDER'S connection (§8.4-3): `funderUserId` selects the WHOLE connection — provider, model, credential,
  // declared capability — through the runtime's user-binding fold. There is no per-chat routing overlay
  // (`chats.metadata.providerRouting` was deleted with `RouteChatAssignment`, §7.1: a routing preference is a
  // property of the connection you picked, never of the room).
  const resolveChatFor = async (funderUserId: UserId, signal?: AbortSignal): Promise<Resolved<"chat">> => {
    const { resolved } = await input.connection.resolve({
      task: "chat",
      principal: await realHostPrincipal(funderUserId),
      ...(signal === undefined ? {} : { signal }),
    });
    return resolved as Resolved<"chat">;
  };
  // The funder's role-client bundle, with the two summarize-slot FACTS memory reads off it (§7.5-1b): the
  // model's window sizes the digest token guard; the embed model's input cap bounds a segment. A funder with
  // no binding for the task is `NoConnectionError` — the honest refusal, never a default window.
  const summarizeWindowFor = async (funderUserId: UserId): Promise<number> => {
    const resolved = await (await input.roleClientsFor(funderUserId)).resolved("summarize");
    const window = resolved?.capability.kind === "generation" ? resolved.capability.generation.context.window : null;
    if (window === null) {
      throw new NoConnectionError("no summarize connection is bound for this user — bind one in Connections");
    }
    return window;
  };
  const embedWindowFor = async (funderUserId: UserId): Promise<number> => {
    const resolved = await (await input.roleClientsFor(funderUserId)).resolved("embed");
    const window = resolved?.capability.kind === "embedding" ? resolved.capability.embedding.maxInputTokens : null;
    if (window === null) {
      throw new NoConnectionError("no embed connection is bound for this user — bind one in Connections");
    }
    return window;
  };

  // The host's active preset config, given its already-loaded default preset id. A stale/unowned/missing id
  // degrades to the system default. Shared by resolveForeignInputs + resolvePromptVariables so resolution
  // can't drift; takes the id (not the whole settings read) so a caller that already loaded it doesn't double-read.
  //
  // It returns the resolved row's NAME beside its config (#1754), and the two travel together by
  // construction: the name comes off the very `PresetDetail` the config did, so nothing downstream can
  // name one preset while assembling another. `null` = the system default stood in (there is no row to name).
  const resolvePromptConfigFor = async (runAsUserId: UserId, defaultPresetId: string | null): Promise<{ config: PromptConfig; name: string | null }> => {
    if (defaultPresetId === null) {
      return { config: DEFAULT_PROMPT_CONFIG, name: null };
    }
    try {
      const detail = await input.preset.get({
        userId: runAsUserId,
        id: castId<PresetId>(defaultPresetId),
      });
      return { config: detail.config, name: detail.name };
    } catch (err) {
      // Only a genuinely stale/unowned/missing preset id degrades to the system default — a database,
      // I/O, or program failure must surface, never run the turn with the wrong prompt (#759).
      if (err instanceof PresetNotFoundError) {
        return { config: DEFAULT_PROMPT_CONFIG, name: null };
      }
      throw err;
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
  ): Promise<{ config: PromptConfig; presetId: PresetId | null; presetName: string | null }> => {
    if (presetOverride !== undefined) {
      // @orb-waive caught-failure-ownership(err): narrow rethrow — documented below: only a
      // genuinely stale/unowned/missing override falls through to the host's default (the lenient-id rule,
      // #759); a database/I/O/program failure rethrows below unhandled. Ends if #759's ruling changes.
      try {
        const detail = await input.preset.get({ userId: runAsUserId, id: presetOverride });
        return { config: detail.config, presetId: presetOverride, presetName: detail.name };
      } catch (err) {
        // Only a genuinely stale/unowned/missing override falls through to the host's normal default (the
        // lenient-id rule) — a database, I/O, or program failure must surface (#759).
        if (!(err instanceof PresetNotFoundError)) {
          throw err;
        }
      }
    }
    const { config, name } = await resolvePromptConfigFor(runAsUserId, defaultPresetId);
    // The effective id is the host default only when it actually resolved a preset (not the DEFAULT fallback).
    return { config, presetId: config === DEFAULT_PROMPT_CONFIG ? null : (defaultPresetId as PresetId | null), presetName: name };
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

  // The host's EMBED model tag — the space a chat's digests/segments are written into (§7.5/§10). No binding
  // is the honest `NoConnectionError`: memory's vector build needs a space, and a default would silently write
  // into a space nobody reads.
  const hostEmbedModel = async (hostUserId: UserId): Promise<string> => {
    const resolved = await (await input.roleClientsFor(hostUserId)).resolved("embed");
    if (resolved === null) {
      throw new NoConnectionError("no embed connection is bound for this user — bind one in Connections");
    }
    return resolved.model;
  };

  // The chat's active preset's ChoiceBlock variables, resolved under the chat's host. Hostless/stale room
  // ⇒ no declared variables.
  const resolvePromptVariables = async (chatId: ChatId): Promise<readonly ChoiceBlockSpec[]> => {
    const hostUserId = await resolveChatHostUserId(chatId);
    if (hostUserId === null) {
      return [];
    }
    const us = await input.settings.loadUserSettings(hostUserId);
    const { config } = await resolvePromptConfigFor(hostUserId, us.seeds.defaultPresetId);
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
    const { config } = await resolvePromptConfigFor(hostUserId, us.seeds.defaultPresetId);
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
    const { config } = await resolvePromptConfigFor(hostUserId, us.seeds.defaultPresetId);
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

  // The chat's PRESET-tier prose (PROSE-1 S4) — the rpg host doors' own resolution moment (see the field's
  // doc on `ChatComposeResult.rpgChatOps`). It walks the SAME ladder a game TURN walks, in the same order:
  // the GM-voice preset REDIRECT first (`input.rpg.resolvePresetOverride`, the early hop `buildTurnContext`
  // runs before its foreign read), then `resolvePromptConfigWithOverride`'s lenient resolve, then
  // `composeProse` by home. That sameness IS the inherited-preview rule: a host who edits a plane teach on
  // the table's GM preset sees the SAME bytes on a resync/populate that they see on a turn. Diverging here —
  // e.g. reading the host's default preset — is precisely the defect the `resolvePreviewInputs` GM redirect
  // was landed to fix, in a different jacket.
  const resolveChatPresetProse = async (chatId: ChatId): Promise<ProseOverrides> => {
    const hostUserId = await resolveChatHostUserId(chatId);
    if (hostUserId === null) {
      return {};
    }
    const presetOverride = (await input.rpg?.resolvePresetOverride(chatId)) ?? null;
    const us = await input.settings.loadUserSettings(hostUserId);
    const { config } = await resolvePromptConfigWithOverride(hostUserId, presetOverride ?? undefined, us.seeds.defaultPresetId);
    return composeProse({ preset: config.prose });
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
    newMessageReactionId: minter(ID_PREFIX.messageReaction),
    newParticipantId: minter(ID_PREFIX.chatParticipant),
    newInjectionId: minter(ID_PREFIX.chatInjection),
    newEventId: minter(ID_PREFIX.chatEvent),
    newStreamEventId: minter(ID_PREFIX.chatStreamEvent),
    newInviteId: minter(ID_PREFIX.chatInvite),
    newPendingTurnId: minter(ID_PREFIX.pendingTurn),
    newChatTurnId: minter(ID_PREFIX.chatTurn),
    hashToken: createTokenHasher(input.sessionSecret),
    audit: input.audit,
    auditStatement: (entry, at) => buildAuditStatement(db, entry, at),
    // Fans chatsChanged to every present human member's channel; the engine passes a bare chatId
    // (principal-blind) — this composition-root helper enumerates membership.
    emitChatChanged: createChatChangedEmitter(db),
    applyRegexReplace: createRegexApplyReplace(),
    testRegexKey: createRegexTest(),
    // D121-E: the four-scope junction dereference (global/preset/cast/room). Chat owns the UNION
    // (`substrate/regex-tier`), the regex domain owns the STORAGE — one seam, no blob copies.
    resolveRegexSources: input.resolveRegexSources,
    tools: input.toolUse === undefined ? null : buildChatToolOps(input.toolUse, input.resolveHostPrincipal),
    // Bridges the chat role's streaming AsyncIterable onto the runtime's Promise+onDelta shape — the extracted
    // domain→runtime turn bridge (createRunChatTurnBridge), injecting the leaf `runChatTurn` (the §7.5-1a fence).
    runChatTurn: createRunChatTurnBridge({
      runChatTurn: input.runChatTurn,
      ...(input.promptCacheMinDepth === undefined ? {} : { promptCacheMinDepth: input.promptCacheMinDepth }),
    }),
    resolveChatPresetParams,
    resolveChatProse,
    resolveChat: (params) => resolveChatFor(params.funderUserId, params.signal),
    // THE POST-GENERATION CREDENTIAL STRIKE-OUT (#1373) — a DIRECT wire, deliberately not an adapter. The
    // adapter that used to sit here was the whole defect: it re-derived the classification from the HTTP
    // status (`401 → "unauthorized"`, `403 → "forbidden"`) against a verb that gates on `auth_failed`, so the
    // two vocabularies could never meet, and it RE-RESOLVED the credential after the failure — which under a
    // rotate/set-active race revokes the user's replacement key instead of the rejected one. The engine now
    // carries the provider's own `ProviderErrorKind` plus the credentialId the generation authenticated with,
    // which is exactly `MaybeRevokeParams`; anything else this seam could do would be re-deriving a fact it
    // was handed. A shape drift on either side is now a `tsc` error rather than a silent no-op.
    maybeRevokeOnAuthFailed: input.maybeRevokeOnAuthFailed,
    getCard: ({ ownerId, characterId }) => input.character.getCard({ principal: hostPrincipal(ownerId), characterId }),
    // ── HOST-HANDOFF COPY (stickler 2026-08-03 §5; the regex arm is #1739) — the four OWNING-domain write
    // factories the accepted property offer executes. Each lives in the domain that owns its tables and is
    // injected here, so chat never writes a `characters`, `world_books`, `regex_scripts` or `chat_digests`
    // row (`own-tables-only`). All four are unreachable without a stored offer, so an offer-less handoff
    // never calls any of them.
    copyHandoffCards: createCopyHandoffCards({
      db: input.db,
      bumpStatsCanonVersion,
      now: input.now,
      newCharacterId: minter(ID_PREFIX.character),
      // The picture RE-OWN, avatar AND carried background (#1426): `assets` is per-owner with an
      // `(owner_id, hash)` dedup (D21), so the copy cannot carry a source asset id verbatim — that would be a
      // pointer into a library the nominee cannot read AND a GC root holding the departed host's blob alive.
      // Content-addressing makes this cheap and idempotent (`created:false` when the recipient already has
      // those bytes). Ownership is PROVEN here: an asset that is not the departing host's yields `null` and
      // the copy lands without that picture rather than borrowing a stranger's blob. `kind` comes from the
      // CALLER because the CAS index is per-kind and the two carried pictures are genuinely different kinds.
      copyAsset: async ({ fromOwnerId, toOwnerId, assetId, kind }) => {
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
          kind,
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
    copyHandoffRegexScripts: createCopyHandoffRegexScripts({
      db: input.db,
      now: input.now,
      newScriptId: minter(ID_PREFIX.regexScript),
    }),
    // …and their NOMINATE-side disclosure twins (#1762), each from the SAME domain file as its copy so the
    // number the nominee is shown comes out of the plan the accept executes. `db` only: these run before
    // the nominee has consented to anything, so they are structurally unable to mint (no clock, no minter).
    countHandoffBooks: createCountHandoffBooks(input.db),
    countHandoffRegexScripts: createCountHandoffRegexScripts(input.db),
    restampHandoffDigests: createHandoffRestampStatements({ db: input.db }),
    // D22 member card — the character's ACCEPTED tag NAMES under the host's ownership (chip display). Resolved
    // through the character domain (chat stays character-table-blind, the getCard precedent); a gone card
    // fail-closes to [] rather than throwing into the member-card read.
    resolveCharacterTags: async ({ ownerId, characterId }) => {
      // @orb-waive caught-failure-ownership(catch): FAIL-CLOSED — documented above: a gone card fail-closes to `[]` rather than throwing into the member-card read. Ends if a gone card needs to surface distinctly from an infra failure.
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
    // deployment (which the app-document CSP enforces independently), and the ladder's top rung needs the
    // `allowInteractiveCards` ceiling as well as the card's own opt-in (#111 leg 3).
    resolveSeatDeco: async ({ ownerId, characterId }) => {
      const cfg = input.settings.getEffectiveConfig();
      const floor = { trustHtml: cfg.trustHtml, forbidExternalMedia: cfg.forbidExternalMedia, allowInteractiveCards: cfg.allowInteractiveCards };
      // The deployment floor AS A RESOLVED policy — what a seat with no readable card gets. Produced by the
      // SAME resolver with no override rather than hand-built, so the no-card arm can never spell a step
      // the resolver would not (#111: the html-trust ladder is folded in exactly one place).
      const resolvedFloor = resolveRenderPolicy(floor, null);
      if (characterId === null || ownerId === null) {
        return { renderPolicy: resolvedFloor, themeOverride: null, backgroundOverride: null, card: null };
      }
      // @orb-waive caught-failure-ownership(catch): FAIL-CLOSED — the comment block above states
      // the contract: a no-host/unreadable-card seat resolves to the bare global floor + a null card, never
      // a throw into roster assembly. Ends if an unreadable card needs to surface distinctly from absence.
      try {
        const detail = await input.character.get({ principal: hostPrincipal(ownerId), characterId });
        return {
          renderPolicy: resolveRenderPolicy(floor, detail),
          themeOverride: detail.themeOverride,
          backgroundOverride: detail.backgroundOverride,
          card: { name: detail.name, avatarAssetId: detail.avatarAssetId },
        };
      } catch {
        return { renderPolicy: resolvedFloor, themeOverride: null, backgroundOverride: null, card: null };
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
        // @orb-waive caught-failure-ownership(catch): optional-read-as-absent — a persona/handle
        // display fact was already resolved above; this is the LAST-resort avatar enrichment, and a failed
        // read just leaves `avatarAssetId` at its already-established `null`. Ends if this read becomes the
        // only source of `displayName`/`handle`.
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
    bumpStatsCanonVersion: (batch, opDb, ownerId) => {
      bumpStatsCanonVersion(batch as BatchStmt[], opDb, ownerId);
    },
    // Every summarize call names its FUNDER (§8.5b): the arbiter and extract-quiet spend the round's trigger,
    // the digests the trigger under `allowBackground` — never a box owner's bundle.
    summarize: async (funderUserId, ...args) => (await input.roleClientsFor(funderUserId)).summarize(...args),
    summarizerContextTokens: summarizeWindowFor,
    // The embed model's input cap off the resolved EMBEDDING capability (was the vLLM launch window) — the
    // SAME fact the transport's belt clamp reads, so the segment build's skip boundary and the wire's
    // last-resort cut can't disagree.
    embedContextTokens: embedWindowFor,
    memorySummarizer: input.settings.getEffectiveConfig().memorySummarizer,
    // record INSERTs the row (assigning seq) THEN the persisted view is published onto the live bus —
    // a dead bus path never loses an event (subscriptions replay from the table by seq).
    resolveHandle: (handle) => input.resolveHandle(handle),
    // The disabled-account containment gate (owner-ruled 2026-08-15): read fresh per call (no caching), the
    // SAME raw-read discipline `resolveUserPublics` above already uses — a gone userId (should never happen,
    // FK-enforced) fails closed to `false` rather than throwing into roster assembly.
    resolveUserEnabled: async (userId) => {
      const rows = await db.select({ enabled: users.enabled }).from(users).where(eq(users.id, userId)).limit(1);
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
      } catch (err) {
        // Only a genuinely stale/deleted persona id is optional — a database, I/O, or program failure
        // must surface, never silently seat the room with no active persona (#760).
        if (err instanceof PersonaNotFoundError) {
          return null;
        }
        throw err;
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
      } catch (err) {
        // Only a genuinely stale/deleted persona id is optional — a database, I/O, or program failure
        // must surface, never silently seat the room with no active persona (#760).
        if (err instanceof PersonaNotFoundError) {
          return null;
        }
        throw err;
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
    // A chat's digest/segment SPACE is its HOST's (`chatParticipants` role='host' — vector tasks are owner-scoped,
    // §7.5; D18 chats have no owner column, so the host is resolved per write). A hostless/stale room has no
    // space to write into and the write is a logged no-op — the content-hash self-heal retries next pass.
    embeddingsStore: async (params) => {
      const hostUserId = await resolveChatHostUserId(params.key.chatId);
      if (hostUserId === null) {
        return;
      }
      await input.embeddings.store({
        kind: "chat-block",
        lens: "digest",
        ownerId: hostUserId,
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
        model: await hostEmbedModel(hostUserId),
        dim: EMBED_SPACE_DIMS,
      });
    },
    // The SEGMENT half is a BATCH op (#172): memory hands over every pending chunk — one chat's on the live
    // path, the whole corpus's on the sweep — and embeddings submits them to the engine as ONE flood. The
    // space tag (`model`/`dim`) is stamped here, the same single home the digest arm above reads.
    embeddingsStoreSegments: async (params) => {
      // One host + one space per chat in the flood (the corpus sweep hands over many chats at once).
      const byChat = new Map<ChatId, { readonly ownerId: UserId; readonly model: string }>();
      const rows: Parameters<EmbeddingsService["storeSegments"]>[0][number][] = [];
      for (const p of params) {
        let space = byChat.get(p.chatId);
        if (space === undefined) {
          const hostUserId = await resolveChatHostUserId(p.chatId);
          if (hostUserId === null) {
            continue;
          }
          space = { ownerId: hostUserId, model: await hostEmbedModel(hostUserId) };
          byChat.set(p.chatId, space);
        }
        rows.push({
          kind: "chat-block" as const,
          lens: "segment" as const,
          ownerId: space.ownerId,
          chatId: p.chatId,
          blockIdx: p.blockIdx,
          chunkIdx: p.chunkIdx,
          seqStart: p.seqStart,
          seqEnd: p.seqEnd,
          text: p.text,
          contentHash: p.contentHash,
          model: space.model,
          dim: EMBED_SPACE_DIMS,
        });
      }
      if (rows.length > 0) {
        await input.embeddings.storeSegments(rows);
      }
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
      // #1395 — the KNOWN-stale invalidation arm (a proven-stale row whose replacement came back empty).
      if (params.lens === "digest-stale") {
        await input.embeddings.pruneMemoryBlocks({
          lens: "digest-stale",
          chatId: params.chatId,
          scopedCharacterId: params.scopedCharacterId,
          keys: params.keys,
        });
        return;
      }
      await input.embeddings.pruneMemoryBlocks({
        lens: "segment",
        chatId: params.chatId,
        keepBlockCount: params.keepBlockCount,
        chunkCounts: params.chunkCounts,
      });
    },
    // DB6: absent ⇒ the field stays unset ⇒ GATHER skips the databank branch (byte-identical no-op).
    ...(input.gatherDatabank !== undefined ? { gatherDatabank: input.gatherDatabank } : {}),
    // The scored projection: identity + BOTH ranking numbers, and deliberately NOT the hit's `text` (memory
    // resolves its own digest bodies from the pool it already loaded — the seam carries what recall must
    // EXPLAIN, never a second copy of the content).
    // The digest SPACE is the host's (their `embed`/`rerank` bindings wrote it — vector tasks are owner-scoped,
    // inference program §7.5); `MemoryQueryOptions` carries no owner by D20, so the host is resolved from the
    // chat FK here, exactly as `searchCorpus` below does. Hostless room ⇒ nothing to recall (leak-free).
    searchDigests: async (query, onRerankUnavailable) => {
      const hostUserId = await resolveChatHostUserId(query.scope.chat);
      if (hostUserId === null) {
        return [];
      }
      const hits = await input.search.digests({ ...query, ownerId: hostUserId }, onRerankUnavailable === undefined ? undefined : { onRerankUnavailable });
      return hits.map((h) => ({ blockKey: h.blockKey, score: h.score, relevance: h.relevance }));
    },
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
    // #250 — absent recorder ⇒ the field stays unset ⇒ recall's `ctx.recordRecall?.()` is a no-op.
    ...(input.recallRecorder !== undefined ? { recordRecall: input.recallRecorder.sink } : {}),
    // #313 — the header brain-icon's live feed: recall (`recall/recall.ts`) BUILDS the `memoryRecall` event
    // (the domain owns its bus literal, the `turnStarted` precedent); this only fans it on the LIVE-ONLY lane
    // (ephemeral per-turn state, never persisted). The room-public payload carries only the count — the digest
    // detail stays host-only (the popover reads the assembly preview for it).
    emitRecallPhase: input.emitChatEventLive,
    getGroupConfig: (rawMetadata) => getGroupConfig(rawMetadata),
    getRoomOverrides: (rawMetadata) => getRoomOverrides(rawMetadata),
    // ⑧(a) — the caller's temporary-chat reap TTL (hours), from the settings domain via the FOREIGN op.
    resolveTempChatTtlHours: async (userId) => (await input.settings.loadUserSettings(userId)).chat.tempChatTtlHours,
    // B7 — the VERB-TIME half of the reaction-posture resolve (the reaction verbs gate on the PRESENT
    // host's per-user defaults; the turn path reads the same two fields off `chatBehavior` below). The
    // same settings FOREIGN op as its TTL neighbour — chat never imports settings.
    readReactionDefaults: async (userId) => {
      const us = await input.settings.loadUserSettings(userId);
      return { charactersCanReact: us.chat.charactersCanReact, reactionsEnabled: us.chat.reactionsEnabled };
    },
    resolvePromptVariables,
    resolvePromptUserMacros,
    // Null ⇒ expressions not wired (byte-identical no-op — the `tools` precedent). The classify hook fires
    // fire-and-forget after a variant commits.
    expressions: input.expressions ?? null,
    // Null ⇒ rpg not wired (byte-identical no-op — the `expressions`/`tools` precedent). The 5 injected rpg
    // turn ops fire at GATHER / preset-resolve / send-commit / turn-end.
    rpg: input.rpg ?? null,
    // The S2 teaching registry (interaction-direction-spec §3-S2): chat's OWN contribution (the rpg-gather
    // projection, order 0) plus whatever later rows wire in (C1's automation guidance is the next one).
    // Absent input ⇒ chat's alone ⇒ byte-identical, and the registry is never null so a game turn's state
    // block can never be silently dropped by a forgotten wiring.
    teaching: [...createChatTeachingContributions({ db }), ...(input.teaching ?? [])],
    // The D50 PromptTransform apply op — the registry's `apply`. Zero registrants ⇒ byte-identical.
    promptTransforms: promptTransformRegistry.apply,
    // The per-turn plugin-macro resolve (U6). Null ⇒ no plugin host wired (byte-identical no-op).
    pluginMacros: input.pluginMacros ?? null,
  };

  const chatDeps: ChatServiceDeps = {
    emit: emitChatEvent,
    emitChecked: input.emitChatEventChecked,
    prepareCreationEvent: input.prepareChatCreationEvent,
    emitLive: input.emitChatEventLive,
    activeTurns: createActiveTurns(),
    prng: () => Math.random(),
    delay: sleep,
    // THE TURN'S OWN RESOLVE and the #54 pre-send gate, both keyed on the FUNDER (§8.4-3): the composer says
    // AVAILABLE against the member's own connection and the turn spends that same connection — a host-keyed
    // gate here was exactly the failure verify8 H1 named.
    resolveConnection: ({ funderUserId }) => resolveChatFor(funderUserId),
    checkSendAvailability: async ({ funderUserId }) => input.connection.availability({ task: "chat", principal: await realHostPrincipal(funderUserId) }),
    resolveForeignInputs: async ({ runAsUserId, anchorPersonaId, presentHumanUserIds, trigger, presetOverride }) => {
      const us = await input.settings.loadUserSettings(runAsUserId);

      // A feature-supplied GM-voice preset REDIRECT (rpg-design/02 §1.1 #1) wins over the host's default when it
      // resolves owned-or-system under the host; a stale/unowned override degrades to the host's normal default
      // (the lenient-id rule — never a broken turn). Absent ⇒ the host default (byte-identical to today).
      const { config: promptConfig, presetId, presetName } = await resolvePromptConfigWithOverride(runAsUserId, presetOverride, us.seeds.defaultPresetId);

      // THE ROOM-PLANE PERSONA READ (the multi-human widening). NOT `persona.get` under a host Principal:
      // that owner-scoped keyhole silently nulled every NON-HOST member's persona, so a member's own turn
      // rendered `{{user}}` as the kit floor "User" and a host-pinned member-owned anchor was a dead pin —
      // both violating FINAL-Persona §A.1 in exactly the multi-human room the D16/D18 spine exists for. The
      // persona domain's principal-less roster op resolves the room's ids in ONE gated read; chat supplies
      // the consent set (its PRESENT humans), so a departed member's persona resolves to nothing.
      const activePersonaId = activePersonaIdFor({ trigger, anchorPersonaId });
      const resolvedPersonas = await input.resolvePersonasForParticipants({
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
        const p = personaId === null ? undefined : resolvedPersonas.get(personaId);
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
        // #1754 — the SAME resolution's NAME, so the room's Regex section can say WHICH preset it is showing
        // (the GM redirect's on a game chat) instead of falling back to the viewer's own active preset.
        presetName,
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
          // B1 — the host's per-user offer-choices DEFAULT; the room's own `chatMetadata.offerChoices`
          // overrides it at `resolveTeachingKnobs`. Under the frozen host (D19), like every other field here.
          offerChoices: us.chat.offerChoices,
          // B7 — the two reaction defaults, the same seam + meeting point (their room halves override at
          // `resolveTeachingKnobs`; the verb-time gates read them via `readReactionDefaults` above).
          charactersCanReact: us.chat.charactersCanReact,
          reactionsEnabled: us.chat.reactionsEnabled,
        },
        // DB6: the host's databank retrieval params (k/minScore/rerank) the gather passes to search.documents,
        // plus the {{databank}} slot budget — the FOREIGN-inputs seam (settings read chat delegates).
        databankRetrieval: us.databank.retrieval,
        databankSlotTokenBudget: us.databank.slotTokenBudget,
      };
    },
    holder: input.holder,
    lockTtlMs: CHAT_LOCK_TTL_MS,
  };

  const chatBundle = createChatService(chatCtx, chatDeps);
  // B7 — the `react` tool: chat's standalone write op closed into the ONE tool-use registry (the
  // definition is compose-homed, `./chat-tools.ts` — a domain-side file would close a `no-circular` loop
  // through tool-use's teaching contribution). Registered only when tool-use is wired, matching
  // `ChatContext.tools`'s null arm — an unwired deploy is byte-identical.
  if (input.toolUse !== undefined) {
    input.toolUse.register(createReactToolDefinition({ reactAsCharacter: createReactAsCharacter(chatCtx, { emit: emitChatEvent }) }));
  }
  return {
    service: chatBundle.service,
    emitBusEvent: emitChatEvent,
    rpgChatOps: {
      getMembership: createGetMembership(chatCtx),
      // The narrator op is built OUTSIDE createChatService (an injected rpg op, not a routed verb), so it gets
      // its own claim chokepoint from the same factory — one behavior, two construction sites.
      postNarratorMessage: createPostNarratorMessage(chatCtx, { emit: emitChatEvent, claimChat: createClaimChat(chatCtx) }),
      getPendingUserText: createGetPendingUserText(chatCtx),
      setRpgPointer: createSetRpgPointer(chatCtx),
      resolveRpgParticipants: createResolveRpgParticipants(chatCtx),
      resolveHostUserId: resolveChatHostUserId,
      resolveCanonWindow: createResolveCanonWindow(chatCtx),
      resolveCardCorpus: createResolveRpgCardCorpus(chatCtx),
      resolvePromptUserMacros,
      resolveChatPresetProse,
    },
    promptTransforms: promptTransformRegistry,
    applyVariableOps: (chatId, ops, expect) => applyStandaloneVariableOps(chatCtx, chatId, ops, expect),
    resolveChatProse,
    requestTurn: chatBundle.requestTurn,
    isMemoryEnabled: async (hostUserId): Promise<boolean> => (await resolveMemoryConfig(hostUserId)).mode !== "off",
    backfill: {
      memory: (args) => backfillMemory(chatCtx, args, resolveMemoryConfig),
      groupCharacters: (args) => backfillGroupCharacters(chatCtx, args),
    },
  };
}
