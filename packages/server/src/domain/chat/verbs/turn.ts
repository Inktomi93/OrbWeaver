// Turn-running front doors: gate → resolve the identity triple → resolve the connection → build the one
// immutable assemble ctx → arbitrate the speaker(s) → drive the round (per-turn-locked) → return the outcome.
// Group-ness is data (roster size + arbitration), never a branch — solo is a roster-of-1 through the same path.
// The triple is never callerUserId: caller is principal.userId, runAsUserId is the host, triggeredBy is the
// responsible human (the caller for a direct send; the chain-starter for an auto-mode turn).
//
// One createTurn(ctx, deps) factory bundles: round-driving/control verbs send/forceCharacterTurn/abort, plus
// the auxiliary single-speaker turns swipe/continueTurn(+undo/revert)/impersonate/generate. Every generating
// verb threads the active-turns abort signal into the engine and its `guided` steer into GATHER→BUILD.

import type {
  AssembleContext,
  ChatBusEvent,
  ChatInjection,
  GroupConfig,
  MacroFreezeRecord,
  MessageView,
  SpeakerRef,
  UserMacroDraws,
} from "@orb/contracts/chat";
import { AUTOMATION_DEPTH_HARD_CAP, DEFAULT_GROUP_CONFIG, isAiDriven, speakerKey } from "@orb/contracts/chat";
import type { ResolvedConnection } from "@orb/contracts/connection";
import type { GenerationType, GuidedImpersonatePerson, UserMacroSpec, UserMacroValues } from "@orb/contracts/preset";
import { PRESET_FORMAT_SLOT_IDS, SIDE_GEN_POSTURES } from "@orb/contracts/preset";
import { composeProse, legacyProseOverrides, resolveProseText } from "@orb/contracts/prose";
import { batchMany, isConstraintViolation } from "@orb/db/kit";
import type { AssetId, CharacterId, ChatId, MessageId, PendingTurnId, PersonaId, UserId } from "@orb/kit/ids";
import type { MacroFreeze, MacroRegistry } from "@orb/kit/macro";
import { resolveSideGenSampling } from "@orb/kit/side-gen-posture";
import { foreignLabelStops } from "@orb/kit/speaker-label";
import { toSummarizeOptions } from "@orb/server/kit/side-gen-posture";
import { getLog, withRequestSpan } from "#foundation/observability";
import type { WireTool } from "#infra/providers";
import type { ChatContext } from "../context.ts";
import type { ActiveTurns } from "../contract/active-turns.ts";
import type { ArbiterCandidate, AutoModeResult, CastName } from "../contract/arbitration.ts";
import type { TurnUserMacros } from "../contract/assembly-macros.ts";
import type { ChatRpgGatherResult } from "../contract/context.ts";
import { CHAT_OP_CODES, ChatNotFoundError, ChatOperationError } from "../contract/errors.ts";
import type { ChatBehaviorInputs, ForeignInputs, ResolveForeignInputsOp, TurnTrigger } from "../contract/foreign.ts";
import { DEFAULT_CHAT_BEHAVIOR } from "../contract/foreign.ts";
import type { MemoryConfig, MemoryRecallInputs } from "../contract/memory.ts";
import type {
  AbortParams,
  CommitMessageParams,
  ContinueTurnParams,
  ForceCharacterTurnParams,
  GenerateParams,
  GuidedSteer,
  ImpersonateStreamParams,
  RequestTurnParams,
  RevertContinueParams,
  SendParams,
  SwipeParams,
  UndoContinueParams,
} from "../contract/params.ts";
import type {
  DrainDeferredTurnsScope,
  DrainReport,
  ImpersonateStreamDelta,
  RequestTurnOp,
  TurnEngine,
  TurnKind,
  TurnOutcome,
  TurnPrep,
} from "../contract/results.ts";
import { KIND_TO_INTENT } from "../contract/results.ts";
import type { ChatService } from "../contract/service.ts";
import { requireHost, requireParticipant } from "../guard.ts";
import {
  buildCommittedMessageView,
  combineReasoning,
  freezeVariantContentStatement,
  insertCanonMessageStatements,
  insertMessageAssetStatements,
  setVariantContentStatement,
} from "../persistence/canon-write.ts";
import { claimPendingTurn, insertPendingTurn, loadPendingTurnsForHost, loadPendingTurnsForReclaim } from "../persistence/invites.ts";
import {
  loadCanonHistory,
  loadChatRow,
  loadContinueSnapshot,
  loadIsReplyToLatestUserMessage,
  loadMaxMessageSeq,
  loadMessageView,
  loadSlotTarget,
  loadStoredUserMacroValues,
} from "../persistence/queries.ts";
import { loadPresentRole, loadRoster } from "../persistence/roster.ts";
import { gatherAssembleContext } from "../substrate/assemble-gather.ts";
import { buildTurnUserMacros, freezeVolatileMacros, resolveNudgeText } from "../substrate/assembly-access.ts";
import { projectViewReturnForViewer, stripMessagesForViewer, viewerReadsHidden } from "../substrate/member-visibility.ts";
import { hostUserIdOf } from "../substrate/roster-host.ts";
import { presentHumanUserIdsOf } from "../substrate/roster-humans.ts";
import { userMessageDelta } from "../substrate/stats-delta.ts";
import { driveRoundVia, resolveMentionsVia, resolveTurnIdentityVia, runAutoModeVia, selectSpeakersVia, smartArbitrateVia } from "../substrate/turn-access.ts";

/** SEND USER_INPUT regex out-param sink: `buildAssembleContext` writes the post-regex user text here so the
 *  verb persists that (the haystack and the stored row never diverge). Also receives the round-level recall
 *  inputs (`memoryRecall`) `gatherMemory` stages for the engine's per-speaker witnessed re-run (D6). */
interface SendRegexSink {
  sendUserText?: string;
  /** The SEND bake's VOLATILE-FREEZE record (D129-F): which `{{roll}}`/`{{random}}`/clock occurrences the
   *  freeze resolved out of the composer draft, and to what. Persisted on the user row's variant beside the
   *  pre-freeze draft so the bake stops being lossy. Absent ⇒ nothing froze. */
  sendMacroFreezes?: MacroFreezeRecord;
  memoryRecall?: MemoryRecallInputs | null;
}

/** The shared per-round identity + ctx the driver reuses by reference. */
type RoundBase = Parameters<typeof driveRoundVia>[0]["base"];

/** Collaborators not on `ChatContext` (the second factory arg). */
interface TurnDeps {
  readonly engine: TurnEngine;
  readonly activeTurns: ActiveTurns;
  readonly emit: (event: ChatBusEvent) => Promise<void>;
  readonly prng: () => number;
  readonly delay: (ms: number) => Promise<void>;
  readonly resolveConnection: (args: { readonly runAsUserId: UserId; readonly chatId: ChatId }) => Promise<ResolvedConnection>;
  /** The foreign half of the assemble ctx (preset/persona/settings), resolved at the composition root. The
   *  chat-internal half is gathered by `gatherAssembleContext`. */
  readonly resolveForeignInputs: ResolveForeignInputsOp;
}

/** The turn-running slice of `ChatService` this grouped file owns. */
type TurnVerbs = Pick<
  ChatService,
  | "send"
  | "commitMessage"
  | "forceCharacterTurn"
  | "abort"
  | "swipe"
  | "continueTurn"
  | "impersonateStream"
  | "generate"
  | "undoContinue"
  | "revertContinue"
  | "drainDeferredTurns"
>;

/** How many trailing canon rows feed the `smart` arbiter's transcript. */
const RECENT_TRANSCRIPT = 10;

/** The `TurnPrep` patch carrying the per-chat tool-recurse cap: present only when the chat set one (absent ⇒
 *  the engine's seed default stands). One home so every generating prep threads it identically. */
const recursePatch = (toolRecurseLimit: number | undefined): { toolRecurseLimit?: number } => (toolRecurseLimit !== undefined ? { toolRecurseLimit } : {});

const ATTACHMENT_ALT = "attachment";

/** Composes the persisted body from the (post-regex) user text + one `![](asset:<id>)` ref per attached
 *  asset. Empty text + attachments yields an image-only body; no attachments returns the text unchanged. */
function composeBodyWithAttachments(text: string, attachmentAssetIds: readonly AssetId[]): string {
  if (attachmentAssetIds.length === 0) {
    return text;
  }
  const refs = attachmentAssetIds.map((id) => `![${ATTACHMENT_ALT}](asset:${id})`).join("\n");
  const trimmed = text.trim();
  return trimmed.length > 0 ? `${text}\n\n${refs}` : refs;
}

/** Synthetic trailing-user nudges: the unsteered continue/impersonate/response baseline, riding
 *  `appendUserTurn`. A `guided` steer composes with these. Resolved from the turn's own resolved preset
 *  (`formatStrings`) so an editable/ST-imported nudge actually steers the turn; an absent field falls back to
 *  `DEFAULT_FORMAT_STRINGS`. `responseNudge` rides a `generate` that fires on an ASSISTANT tail (the wand's
 *  Response icon / empty-send-generate) — a reply after the model's own last line, which needs something to
 *  respond to; a Response on a USER tail appends no nudge (the user message is the prompt).
 *
 *  RENDERED through the SAME macro path the steered guided template uses (`resolveNudgeText`), so a nudge's
 *  `{{user}}`/`{{char}}`/`{{person}}` SUBSTITUTE (persona name / character name / the perspective pick) instead
 *  of shipping LITERAL braces to the model — the gap that made the impersonate nudge send `write as {{user}}`
 *  raw and drift back into the character's voice. `person` is the impersonate perspective pick (impersonate
 *  only; continue/response carry no `{{person}}`, so it's a safe no-op there); `registry` is the per-turn
 *  user-macro registry. */
const nudgeOf = (
  assembleContext: AssembleContext,
  key: "continueNudge" | "impersonateNudge" | "responseNudge",
  opts: { readonly person?: GuidedImpersonatePerson | undefined; readonly registry?: MacroRegistry | undefined } = {},
): string => {
  // PROSE-1 §4.6: the override STORAGE is still `formatStrings.<key>`; the two rungs (override else shipped
  // default) funnel through the ONE prose resolver so precedence can't drift from the registry.
  const id = PRESET_FORMAT_SLOT_IDS[key];
  return resolveNudgeText(assembleContext, resolveProseText(id, legacyProseOverrides(id, assembleContext.promptConfig.formatStrings?.[key])), opts);
};

/** The roster-derived turn substrate: the host, the AI-driven candidates (character + agent — arbitration),
 *  their display names, the character cast ids (WI/memory), and the present personas. */
interface Room {
  readonly hostUserId: UserId;
  readonly candidates: readonly ArbiterCandidate[];
  readonly castNames: readonly CastName[];
  readonly castCharacterIds: readonly CharacterId[];
  /** The `speakerKey`s of the present MUTED seats (character + agent) — the `castNotMuted` producer, keyed on
   *  the same seat `disabled` axis arbitration reads. Empty ⇒ nothing muted. */
  readonly mutedSpeakerKeys: ReadonlySet<string>;
  readonly personaIds: readonly PersonaId[];
  /** Every PRESENT human's `userId` — the FOREIGN persona read's CONSENT SET (`ResolveForeignInputsOp`):
   *  a persona resolves for this room iff its owner is one of these. Deliberately NOT presence-filtered like
   *  `personaIds` (an OFFLINE member is still a member, and the anchor's owner is routinely offline —
   *  presence gates which persona BOOKS join the pool, never who the room may resolve an identity for). */
  readonly presentHumanUserIds: readonly UserId[];
}

/** The §3.6 member RETURN projection for a mutation that hands back ONE `MessageView` (undo/revert continue).
 *  Binds this domain's rpg verdict resolver onto the ONE shared seam (`projectViewReturnForViewer`, shared with
 *  every `edit.ts` return site) — the host reads verbatim, a non-host member gets the body hidden-strip PLUS,
 *  on a deception-active game, the reasoning channel withheld. */
async function projectViewReturn(ctx: ChatContext, view: MessageView, membership: { readonly role: string }): Promise<MessageView> {
  return await projectViewReturnForViewer(view, membership, (chatId) => resolveReasoningHostOnlyFor(ctx, chatId));
}

/** The injected rpg deception verdict for one chat: `false` when rpg isn't wired / the chat is not a
 *  deception-active game (so a plain chat is byte-identical to the pre-P3 behavior). */
async function resolveReasoningHostOnlyFor(ctx: ChatContext, chatId: ChatId): Promise<boolean> {
  return (await ctx.rpg?.resolveReasoningHostOnly(chatId)) ?? false;
}

/** The §3.6 deception-active verdict for a mutation OUTCOME return toward a non-host member. `false` for a host
 *  (they read verbatim — the resolve is skipped) / a non-game / non-deception chat. Threaded into
 *  `stripMessagesForViewer` so a member who ran a deception-game turn never receives the reasoning bytes. */
async function reasoningHostOnlyFor(ctx: ChatContext, chatId: ChatId, membership: { readonly role: string }): Promise<boolean> {
  if (viewerReadsHidden(membership)) {
    return false;
  }
  return await resolveReasoningHostOnlyFor(ctx, chatId);
}

/** Loads the present roster → the {@link Room}. Hostless is unusable (leak-free NOT_FOUND). Cards read under
 *  the host's ownership. */
async function loadRoom(ctx: ChatContext, chatId: ChatId): Promise<Room> {
  const roster = await loadRoster(ctx.db, chatId);
  const hostUserId = hostUserIdOf(roster);
  if (hostUserId === null) {
    throw new ChatNotFoundError(chatId);
  }
  const aiRows = roster.filter((r) => isAiDriven(r.kind));
  const charRows = aiRows.flatMap((r) => (r.kind === "character" && r.characterId !== null ? [{ ...r, characterId: r.characterId }] : []));
  const cards = await Promise.all(charRows.map((r) => ctx.getCard({ ownerId: hostUserId, characterId: r.characterId })));

  // An offline human's persona drops from the present-cast set for this round, since presence gates
  // which persona-book world-info joins the pool (a server-derived signal, never client-asserted).
  const humanPersonas = roster.flatMap((r) =>
    r.kind === "human" && r.userId !== null && r.activePersonaId !== null ? [{ userId: r.userId, personaId: r.activePersonaId }] : [],
  );
  const online = await Promise.all(humanPersonas.map((h) => ctx.readPresence(h.userId).then((p) => p.online)));
  const personaIds = humanPersonas.filter((_h, i) => online[i] === true).map((h) => h.personaId);
  // The persona-CONSENT set (not presence-filtered — see `Room.presentHumanUserIds`).
  const presentHumanUserIds = presentHumanUserIdsOf(roster);

  const charCandidates: ArbiterCandidate[] = charRows.map((r) => ({
    ref: { kind: "character", characterId: r.characterId },
    talkativeness: r.talkativeness,
    disabled: r.disabled,
    leftSeq: r.leftSeq,
  }));

  const charCastNames: CastName[] = charRows.map((r, i) => ({ ref: { kind: "character", characterId: r.characterId }, name: cards[i]?.name ?? "" }));
  const candidates: ArbiterCandidate[] = [...charCandidates];
  return {
    hostUserId,
    candidates,
    castNames: [...charCastNames],
    castCharacterIds: charRows.map((r) => r.characterId),
    mutedSpeakerKeys: new Set(candidates.filter((c) => c.disabled).map((c) => speakerKey(c.ref))),
    personaIds,
    presentHumanUserIds,
  };
}

/** The primary character id (roster's first cast seat), the solo/single-speaker default. Null only for an
 *  empty cast. */
function primaryCharacterId(room: Room): CharacterId | null {
  const first = room.castNames[0]?.ref;
  return first !== undefined ? first.characterId : null;
}

/** The present, NON-MUTED character names a NARRATOR turn actually voices — the narrator nudge's `{{names}}`
 *  and its cast-of-one guard. Muted seats are excluded on the same `disabled` axis arbitration reads: a muted
 *  member's card still informs the merged turn, but the nudge must not name them as a voice. */
function narratorMemberNamesOf(room: Room): readonly string[] {
  return room.castNames
    .filter((c) => !room.mutedSpeakerKeys.has(speakerKey(c.ref)))
    .map((c) => c.name)
    .filter((n) => n.length > 0);
}

/** The joined present-cast name (narrator `{{char}}`-as-cast); collapses to the single name at cast=1. */
function joinedCastName(castNames: readonly CastName[]): string {
  return castNames
    .map((c) => c.name)
    .filter((n) => n.length > 0)
    .join(", ");
}

/** The last-assistant speaker (ban-last seed) + a recent transcript the `smart` arbiter reads. */
async function canonFacts(ctx: ChatContext, chatId: ChatId): Promise<{ lastSpeaker: SpeakerRef | null; recentHistory: string }> {
  const canon = await loadCanonHistory(ctx.db, chatId);
  return {
    lastSpeaker: lastSpeakerRef(canon.findLast((m) => m.role === "assistant")),
    recentHistory: canon
      .slice(-RECENT_TRANSCRIPT)
      .map((m) => m.content)
      .join("\n"),
  };
}

/** The ban-last speaker ref for the last assistant row: its characterId or its authorUserId; null when there
 *  is no prior assistant turn. */
function lastSpeakerRef(row: { readonly characterId: CharacterId | null; readonly authorUserId: UserId | null } | undefined): SpeakerRef | null {
  if (row === undefined) {
    return null;
  }
  if (row.characterId !== null) {
    return { kind: "character", characterId: row.characterId };
  }
  return null;
}

/** The built turn context + the resolved host memory config threaded onto every `TurnPrep` — one source of
 *  truth, the same value recall reads. */
interface BuiltTurnContext {
  readonly assembleContext: AssembleContext;
  readonly memoryConfig: MemoryConfig | null | undefined;
  /** The round-level recall inputs staged for the engine's per-speaker witnessed re-run (D6); `null` when
   *  there is no character to key on (memory off / empty cast) ⇒ the engine keeps round-level `memory`. */
  readonly memoryRecall: MemoryRecallInputs | null;
  /** The host's resolved turn-behavior arm (PD-146) — the custom stops the prep threads onto the request
   *  + the auto-continue/auto-swipe knobs the send post-round hook gates on. Defaulted to all-off. */
  readonly chatBehavior: ChatBehaviorInputs;
  /** The tool names a game turn's GATHER contributed (rpg-design/05 §1) — threaded onto the round base →
   *  `TurnPrep.attachedToolNames` (the pipeline resolves them against the tool-use registry). Empty for a
   *  non-game turn (byte-identical); empty until the rpg tool registry lands (R4 #2/#3) even for a game. */
  readonly attachedToolNames: readonly string[];
  /** The TERMINAL wire tools a game turn's GATHER contributed (R1 — the folded state extraction), threaded
   *  onto the PERSISTING lifecycle's prep only. `undefined` for a non-game / non-folded turn (byte-identical). */
  readonly terminalTools: readonly WireTool[] | undefined;
  /** rpg-design/05 §6 slot-adjacency (threaded onto `TurnPrep` → the engine marks the turn dice-eligible after
   *  minting `turnId`). False for a non-game / ineligible turn (byte-identical). */
  readonly respondsToLatestUserTurn: boolean;
  /** The per-turn user-macro registry (WAVE MU) — closures, threaded onto every `TurnPrep.macroRegistry`
   *  (never the serializable `assembleContext`). `null` ⇒ the preset authored no user macros (byte-identical). */
  readonly macroRegistry: MacroRegistry | null;
  /** The per-turn user-macro FREEZE registry (WAVE MU) — the SEND greeting-freeze bakes a greeting-embedded
   *  user macro against it. `null` ⇒ no user macros (byte-identical to the process `VOLATILE_ONLY_REGISTRY`). */
  readonly freezeMacroRegistry: MacroRegistry | null;
  /** The turn's effective user-macro draw record (frozen ∪ fresh) — persisted onto every committed variant.
   *  `null` ⇒ the turn drew nothing. */
  readonly userMacroDraws: UserMacroDraws | null;
  /** The M2 card wire knob a game turn's GATHER contributed (parity-plus §3.5) — threaded onto `TurnPrep` →
   *  `runTurnPipeline.cardKeepLastX`. ABSENT ≠ ZERO: `undefined` for a NON-GAME turn (no window — every stored
   *  card rides the wire whole), `0` for a game whose host kept the rpg default (every card stubs). This used
   *  to floor to `0`, which gave a chat with no game the strictest setting of a feature it never opted into. */
  readonly cardKeepLastX: number | undefined;
}

/** The turn's driving {@link TurnKind} → the `injection_trigger` {@link GenerationType} gate. Exhaustive
 *  Record — a new TurnKind fails tsc here rather than silently defaulting. */
const GENERATION_TYPE_FOR_KIND: Record<TurnKind, GenerationType> = {
  send: "normal",
  generate: "normal",
  force: "normal",
  auto: "normal",
  opening: "normal",
  swipe: "swipe",
  continue: "continue",
  impersonate: "impersonate",
};

/** The per-turn user-macro registry build (WAVE MU delivery) + the D53 loud-degrade for a refused def.
 *  A top-level helper so its branch (rejected-log) stays OUT of `buildTurnContext`'s cognitive-complexity
 *  budget. `null` ⇒ the preset authored no user macros (the byte-identical singleton fast path).
 *
 *  Arm A (owner ruling): user-macro input VALUES live in a per-chat SIBLING typed column
 *  (`chats.user_macro_values`, read via `loadStoredUserMacroValues`) — NOT the flat `chats.variableValues`
 *  (which can't hold the nested-typed `UserMacroValues`). Absent picks ⇒ `{}` ⇒ the defaults posture
 *  (unpicked inputs → per-kind defaults; random-pick pool → ALL options).
 *
 *  TWO DEF HOMES: the resolved preset's macros AND the game's (`ChatRpgOps.resolveUserMacros` — the injected
 *  op, never a sideways rpg import). The game shadows the preset on a name clash; the builder owns that
 *  ruled policy (see `assembly/user-macros.ts`). */
/** The turn's user-macro INPUT sides, both reads in one place (kept out of `buildTurnContext`'s
 *  cognitive-complexity budget): the GAME's declared defs (the second definition home — the injected rpg op,
 *  `[]` for a non-game/unwired chat) and the per-chat picks bag. The picks read is SKIPPED entirely when
 *  neither home declares a macro — no wasted row read on the overwhelming majority of turns. */
async function loadTurnUserMacroInputs(
  ctx: ChatContext,
  chatId: ChatId,
  presetDefs: readonly UserMacroSpec[],
): Promise<{ readonly gameDefs: readonly UserMacroSpec[]; readonly values: UserMacroValues }> {
  const gameDefs = ctx.rpg === null ? [] : await ctx.rpg.resolveUserMacros(chatId);
  if (presetDefs.length === 0 && gameDefs.length === 0) {
    return { gameDefs, values: {} };
  }
  return { gameDefs, values: await loadStoredUserMacroValues(ctx.db, chatId) };
}

function buildTurnUserMacrosForTurn(args: {
  readonly chatId: ChatId;
  readonly foreign: ForeignInputs;
  readonly prng: () => number;
  readonly values: UserMacroValues;
  readonly gameDefs: readonly UserMacroSpec[];
  readonly frozenUserMacroDraws: UserMacroDraws | undefined;
}): TurnUserMacros | null {
  const userMacros = buildTurnUserMacros({
    preset: { id: args.foreign.presetId ?? "default", defs: args.foreign.promptConfig.userMacros },
    // The game group's `MacroSourceRef.id` is the game's CHAT id (kit stays below the branded-id homes).
    ...(args.gameDefs.length > 0 ? { game: { id: args.chatId, defs: args.gameDefs } } : {}),
    values: args.values,
    ...(args.frozenUserMacroDraws !== undefined ? { frozenDraws: args.frozenUserMacroDraws } : {}),
    prng: args.prng,
  });
  if (userMacros !== null && userMacros.rejected.length > 0) {
    getLog().warn({ chatId: args.chatId, rejected: userMacros.rejected }, "chat: user macro(s) rejected at turn build");
  }
  return userMacros;
}

/** The gather-args registry spread (WAVE MU) — the render + freeze registries when user macros were built,
 *  else `{}` (the pure build's singleton fallback). A top-level helper so its branch stays OUT of
 *  `buildTurnContext`'s cognitive-complexity budget. */
function gatherMacroRegistries(userMacros: TurnUserMacros | null): { macroRegistry?: MacroRegistry; freezeMacroRegistry?: MacroRegistry } {
  return userMacros !== null ? { macroRegistry: userMacros.registry, freezeMacroRegistry: userMacros.freezeRegistry } : {};
}

/** The `BuiltTurnContext`/`TurnBase` user-macro fields (WAVE MU): the render + freeze registries + the draw
 *  record, all null when no user macros were built. A top-level helper so the null-coalescing stays out of
 *  `buildTurnContext`'s / `resolveTurnBase`'s cognitive-complexity budget. */
function userMacroFields(userMacros: TurnUserMacros | null): {
  macroRegistry: MacroRegistry | null;
  freezeMacroRegistry: MacroRegistry | null;
  userMacroDraws: UserMacroDraws | null;
} {
  return userMacros !== null
    ? { macroRegistry: userMacros.registry, freezeMacroRegistry: userMacros.freezeRegistry, userMacroDraws: userMacros.draws }
    : { macroRegistry: null, freezeMacroRegistry: null, userMacroDraws: null };
}

/** The `TurnPrep`/`RoundBase` user-macro spread (WAVE MU) — the render registry + the draw record OMITTED
 *  when null (exactOptionalPropertyTypes), so a non-user-macro turn's prep is byte-identical. A top-level
 *  helper so its two branches stay out of the verbs' cognitive-complexity budgets. */
function prepMacroFields(
  macroRegistry: MacroRegistry | null,
  userMacroDraws: UserMacroDraws | null,
): { macroRegistry?: MacroRegistry; userMacroDraws?: UserMacroDraws } {
  return {
    ...(macroRegistry !== null ? { macroRegistry } : {}),
    ...(userMacroDraws !== null ? { userMacroDraws } : {}),
  };
}

/** The rpg gather-args spread — the macro/injection feed + the game turn's `{{expr::…}}` CEL activation
 *  (parity-plus §12), each omitted when absent so a non-game turn's args stay byte-identical. A top-level
 *  helper so these branches stay OUT of `buildTurnContext`'s cognitive-complexity budget. */
function rpgAssembleFields(rpg: ChatRpgGatherResult | null): {
  rpgMacros?: Readonly<Record<string, string>>;
  rpgInjections?: readonly ChatInjection[];
  rpgCelBindings?: Readonly<Record<string, unknown>>;
} {
  if (rpg === null) {
    return {};
  }
  return {
    rpgMacros: rpg.macros,
    rpgInjections: rpg.injections,
    ...(rpg.celBindings !== undefined ? { rpgCelBindings: rpg.celBindings } : {}),
  };
}

/** The {@link TurnTrigger} for a turn a LIVE human drives — their id plus their SEAT's persona, which is
 *  `null` when the seat holds none (an invite-joined member, a user who owns no persona at all). That null
 *  is the honest kit floor ("User"); it must never coalesce into the chat anchor, which would present a
 *  member to the model wearing the HOST's identity (INVITE-JOIN-NULL-PERSONA). */
function humanTrigger(userId: UserId, personaId: PersonaId | null): TurnTrigger {
  return { kind: "human", userId, personaId };
}

/** Builds the one immutable assemble ctx for the round: resolves the foreign half from chat-supplied keys,
 *  then gathers the chat-internal half + builds the pure ctx. Returns the built ctx plus the resolved memory
 *  config so the caller threads the same resolution recall uses. */
async function buildTurnContext(
  ctx: ChatContext,
  deps: TurnDeps,
  args: {
    readonly chatId: ChatId;
    readonly runAsUserId: UserId;
    readonly model: string;
    readonly kind: TurnKind;
    readonly castCharacterIds: readonly CharacterId[];
    /** The soul-resolved seated agents (D60) — appended to the assemble cast so an agent speaker rides the
     *  one turn path. Empty ⇒ byte-identical to a character-only room. */

    /** The muted-seat `speakerKey`s (character + agent) — threaded to `castNotMuted` for `{{groupNotMuted}}`. */
    readonly mutedSpeakerKeys: ReadonlySet<string>;
    readonly personaIds: readonly PersonaId[];
    /** The FOREIGN persona read's consent set — see {@link Room.presentHumanUserIds}. */
    readonly presentHumanUserIds: readonly UserId[];
    readonly anchorPersonaId: PersonaId | null;
    /** WHO drives this turn ({@link TurnTrigger}) — binds prompt-config `{{user}}` to the speaker. REQUIRED
     *  (the union's two arms are total; the absent/`personaIds[0]` third state was retired 2026-08-07): a
     *  turn with no live triggering human states `{kind:"none"}` and binds the anchor. */
    readonly trigger: TurnTrigger;
    readonly pendingUserText?: string | undefined;
    /** rpg-design/05 §6 slot-adjacency: is this turn (re)generating the assistant slot that DIRECTLY responds
     *  to the latest user message (send / deferred-drain / swipe-of-that-slot)? Drives the rpg dice feed-forward
     *  flag + eligibility so a later GM/auto round never re-feeds a stale die. Absent ⇒ false (ineligible). */
    readonly respondsToLatestUserTurn?: boolean | undefined;
    /** The assistant slot this turn REGENERATES (a swipe/reroll's `append-variant` target — the slot the canon
     *  context also stops BEFORE). Threaded to the rpg gather so a reroll's tracked state reads as of before
     *  the slot instead of the still-selected abandoned variant's snapshot (VER-1b). Absent for a fresh turn
     *  and for `continue` (whose context INCLUDES the slot, so the head is its honest state). */
    readonly regenSlotMessageId?: MessageId | undefined;
    readonly guided?: GuidedSteer | undefined;
    /** The slot's persisted user-macro draw record (WAVE MU) on a swipe/continue turn — replayed byte-exact
     *  so the re-generation resolves the identical draw. Absent (send/generate/impersonate) ⇒ a fresh draw. */
    readonly frozenUserMacroDraws?: UserMacroDraws | undefined;
    /** The Ruling-B `{{char}}` for a HOST-authored / null-speaker context (Chat-Macro-Resolution.md ruling B):
     *  the JOINED CAST names (multi-character room, == `{{group}}`) / the single character (solo). Chat is the
     *  authority on this identity resolution — threaded into the rpg gather so the host `steeringNote`'s
     *  `{{char}}` follows the SAME value every other human-authored `{{char}}` uses (never a re-derived
     *  protagonist). Empty for an empty cast. */
    readonly castCharForHostRow: string;
  },
  /** SEND sink — when present and host-tier scripts resolve, writes the post-regex user text for the verb to persist. */
  out?: SendRegexSink,
): Promise<BuiltTurnContext> {
  // The GM-voice preset REDIRECT early hop (rpg-design/02 §1.1 #1) — resolved BEFORE the foreign preset read so
  // a game turn assembles the game's gmPresetId instead of the host default. Null op / non-game ⇒ null ⇒ absent
  // ⇒ the host default (byte-identical). It rides the FOREIGN-inputs args (the established turn-knob seam).
  const presetOverride = ctx.rpg !== null ? await ctx.rpg.resolvePresetOverride(args.chatId) : null;
  const foreign = await deps.resolveForeignInputs({
    chatId: args.chatId,
    runAsUserId: args.runAsUserId,
    model: args.model,
    anchorPersonaId: args.anchorPersonaId,
    presentHumanUserIds: args.presentHumanUserIds,
    trigger: args.trigger,
    ...(presetOverride !== null ? { presetOverride } : {}),
  });
  // A game turn's GATHER (rpg-design/05 §1): the 8 rpg macros + the depth-0 reminder injection + the tool
  // names to attach. Null op / non-game ⇒ null ⇒ a byte-identical non-game turn (no macros, no injection, no tools).
  // The host `steeringNote`'s identity-macro binding, both computed CHAT-SIDE (chat owns identity resolution):
  //   `{{user}}` = `foreign.personas.active?.name` — the active/triggering persona (NOT the pinned anchor; a
  //      steeringNote is a current-action steer, exactly like the guided/nudge path).
  //   `{{char}}` = `args.castCharForHostRow` — the Ruling-B host/null-speaker `{{char}}` (the JOINED CAST in a
  //      multi-character room, the single character in solo), so the steeringNote's `{{char}}` matches every
  //      other human-authored `{{char}}` (rpg splices chat's value, never re-derives a protagonist).
  // Threaded so rpg renders the steeringNote's macros (guided-safe) instead of shipping literal braces.
  const rpg =
    ctx.rpg !== null
      ? await ctx.rpg.gatherTurnContext({
          chatId: args.chatId,
          pendingUserText: args.pendingUserText,
          respondsToLatestUserTurn: args.respondsToLatestUserTurn ?? false,
          steerIdentity: { user: foreign.personas.active?.name, char: args.castCharForHostRow },
          // The swipe/reroll target (VER-1b): rpg resolves the turn's tracked state as of BEFORE this slot, the
          // same cut this turn's canon context takes, so a reroll is never told the abandoned variant's beats.
          regenSlotMessageId: args.regenSlotMessageId,
          // PROSE-1 — the reminder's teach/heading overrides, PRESET-homed (owner ruling 2026-08-08). Composed
          // by home for the same no-cascade reason `buildAssembleContext` does it: a key only survives from the
          // storage its slot actually homes in, so a stale key in the blob is inert rather than authoritative.
          // `foreign.promptConfig` is the REDIRECTED preset on a game turn (`presetOverride`, resolved above), so
          // the teaches a table authored on its GM preset are the ones the reminder gets.
          prose: composeProse({ preset: foreign.promptConfig.prose }),
        })
      : null;
  // The chat-crew director's GATHER (chat-crew-design/04 §1): the current guidance as ONE injection. Null op /
  // director off / no pass ⇒ null ⇒ a byte-identical non-crew turn (the byte-identity contract test pins it).
  const crew = ctx.crew !== null ? await ctx.crew.gatherTurnContext(args.chatId) : null;
  // The per-turn user-macro registries (WAVE MU delivery) — resolved ONCE via the top-level helper (kept out
  // of this function's cognitive-complexity budget). `null` when no user macros are authored ⇒ every render
  // seam falls back to the process singletons (byte-identical); the registries ride `TurnPrep` (closures),
  // NEVER the serializable `assembleContext`. The INPUT picks come from the per-chat sibling store
  // (`chats.user_macro_values`); read ONLY when macros are authored (no wasted read on a non-user-macro turn).
  const userMacroInputs = await loadTurnUserMacroInputs(ctx, args.chatId, foreign.promptConfig.userMacros);
  const userMacros = buildTurnUserMacrosForTurn({
    chatId: args.chatId,
    foreign,
    prng: deps.prng,
    values: userMacroInputs.values,
    gameDefs: userMacroInputs.gameDefs,
    frozenUserMacroDraws: args.frozenUserMacroDraws,
  });
  // The gather sink: the caller's SEND sink when present (so `sendUserText` still surfaces), else a private
  // one — either way `gatherMemory` stages `memoryRecall` here for the engine's per-speaker witnessed re-run.
  const sink: SendRegexSink = out ?? {};
  const assembleContext = await gatherAssembleContext(
    ctx,
    {
      chatId: args.chatId,
      runAsUserId: args.runAsUserId,
      model: args.model,
      castCharacterIds: args.castCharacterIds,
      mutedSpeakerKeys: args.mutedSpeakerKeys,
      personaIds: args.personaIds,
      // SHAPE's null-stamp guard needs the identity behind `speakers.user`: a canon row with NO persona stamp
      // may borrow this turn's `{{user}}` only when it is that human's OWN row (see `toShapeCanon`). `none`
      // ⇒ null ⇒ no row borrows it (the union has no third arm since 2026-08-07).
      triggerUserId: args.trigger.kind === "human" ? args.trigger.userId : null,
      generationType: GENERATION_TYPE_FOR_KIND[args.kind],
      prng: deps.prng,
      ...(args.pendingUserText !== undefined ? { pendingUserText: args.pendingUserText } : {}),
      ...(args.guided !== undefined ? { guided: args.guided } : {}),
      // The rpg gather-args: macro/injection feed + the game turn's `{{expr::…}}` CEL activation (parity-plus
      // §12), each omitted when absent so a non-game turn / a lite gather that stages none stays byte-identical
      // (⇒ `{{expr::rpg.…}}` errors-to-""). Extracted to keep this fn under the cognitive-complexity budget.
      ...rpgAssembleFields(rpg),
      ...(crew !== null ? { crewInjections: crew.injections } : {}),
      // The per-turn user-macro RENDER + FREEZE registries (WAVE MU) — absent ⇒ the pure build's singleton fallback.
      ...gatherMacroRegistries(userMacros),
    },
    foreign,
    sink,
  );
  return {
    assembleContext,
    memoryConfig: foreign.memoryConfig,
    memoryRecall: sink.memoryRecall ?? null,
    chatBehavior: foreign.chatBehavior ?? DEFAULT_CHAT_BEHAVIOR,
    attachedToolNames: rpg?.tools ?? [],
    terminalTools: rpg?.terminalTools,
    respondsToLatestUserTurn: args.respondsToLatestUserTurn ?? false,
    // NO `?? 0` — absence is the signal (see `BuiltTurnContext.cardKeepLastX`): only a game's gather contributes
    // this, so a non-game turn must pass `undefined` (no window) rather than inherit the rpg default.
    cardKeepLastX: rpg?.cardKeepLastX,
    ...userMacroFields(userMacros),
  };
}

/** Persists a user message (a fresh slot + its one variant) and emits `messageCommitted`. Persists exactly
 *  the content it's handed — the caller resolves the post-regex text.
 *
 *  Seq TOCTOU: the user-row seq is allocated outside the engine's per-chat lock (acquired later, for the AI
 *  turn). Two concurrent same-chat sends can read the same head and collide on the `messages (chatId, seq)`
 *  unique. This retries once on that violation: the loser re-derives the now-higher head and re-mints ids.
 *  The failed batch rolls back atomically before any emit, so the retry never double-commits. */
async function persistUserMessage(
  ctx: ChatContext,
  emit: TurnDeps["emit"],
  args: {
    readonly chatId: ChatId;
    readonly content: string;
    readonly authorUserId: UserId;
    readonly personaId: PersonaId | null;
    readonly hostUserId: UserId;
    /** Ownership-verified attachment ids (the caller ran the trust boundary). Empty ⇒ a plain message. */
    readonly attachmentAssetIds: readonly AssetId[];
    /** The composer draft as AUTHORED — before the volatile freeze, the `user_input` prompt transform, the
     *  USER_INPUT regex and the attachment-ref compose (D129-F). Passed unconditionally; the writer stores it
     *  only when one of those legs actually changed a byte. */
    readonly rawContent: string;
    /** What the SEND freeze baked out of that draft, in occurrence order. Empty ⇒ nothing froze ⇒ NULL. */
    readonly macroFreezes: MacroFreezeRecord;
  },
): Promise<MessageView> {
  const now = ctx.now();
  const attempt = async (): Promise<MessageView> => {
    const params = {
      messageId: ctx.newMessageId(),
      variantId: ctx.newMessageVariantId(),
      chatId: args.chatId,
      seq: (await loadMaxMessageSeq(ctx.db, args.chatId)) + 1,
      role: "user" as const,
      authorUserId: args.authorUserId,
      personaId: args.personaId,
      now,
      variant: { content: args.content, rawContent: args.rawContent, macroFreezes: args.macroFreezes },
    };
    const statements = insertCanonMessageStatements(ctx.db, params);
    // Attachment rows ride the same atomic batch, keyed on this attempt's messageId so a retry re-links correctly.
    statements.push(
      ...insertMessageAssetStatements(ctx.db, {
        rows: args.attachmentAssetIds.map((assetId) => ({
          id: ctx.newMessageAssetId(),
          messageId: params.messageId,
          assetId,
        })),
        now,
      }),
    );
    // characterId null — the stats rebuild's per-char grain is assistant-only.
    ctx.applyStatsDelta(statements, ctx.db, userMessageDelta({ ownerId: args.hostUserId, characterId: null, content: args.content, now }));
    await ctx.db.batch(batchMany(statements));
    return buildCommittedMessageView(params);
  };
  const view = await attempt().catch((err: unknown) => {
    if (isConstraintViolation(err)?.kind === "unique") {
      return attempt();
    }
    throw err;
  });
  await emit({ type: "messageCommitted", chatId: args.chatId, messageId: view.id, view });
  void ctx.emitChatChanged(args.chatId);
  return view;
}

/** What {@link arbitrate} resolved: the name-mapped speakers, plus whether the turn was CANCELLED mid-
 *  arbitration (the side-LLM call saw the turn's signal fire). File-local — the callers pass it straight to
 *  their own outcome, nothing outside this verb reads it. `aborted:true` ⇒ `speakers: []`. */
interface ArbitrationOutcome {
  readonly speakers: readonly CastName[];
  readonly aborted: boolean;
}

/** Arbitrates who speaks. An `@mention`/forced target hard-overrides any policy; `smart` (no forced) runs
 *  the side-LLM, and a side-LLM that threw / answered off-roster degrades to the deterministic `natural`
 *  arbitration — VISIBLY (the `smart_arbitration_degraded` warning; D41 bans a silent degrade). Maps
 *  resolved ids back to their cast names.
 *
 *  `aborted` is the OTHER outcome and never a degrade: the turn's signal fired during the side-LLM call, so
 *  the round is cancelled — no warning (nothing degraded), no speakers, and the caller must stop rather than
 *  fall back and generate anyway. Only the `smart` arm can report it; the deterministic arm is synchronous. */
async function arbitrate(
  ctx: ChatContext,
  deps: TurnDeps,
  args: {
    readonly chatId: ChatId;
    readonly group: GroupConfig;
    readonly candidates: readonly ArbiterCandidate[];
    readonly castNames: readonly CastName[];
    readonly forcedIds?: readonly CharacterId[] | undefined;
    readonly lastSpeaker: SpeakerRef | null;
    readonly recentHistory: string;
    readonly maxSpeakers?: number | undefined;
    /** The turn's abort signal — threaded into the `smart` side-LLM call so a non-responsive director box
     *  can't hang the turn. Absent on the paths that never reach the side-LLM. */
    readonly signal?: AbortSignal | undefined;
  },
): Promise<ArbitrationOutcome> {
  const forced = args.forcedIds ?? [];
  let refs: readonly SpeakerRef[];
  if (args.group.policy === "smart" && forced.length === 0) {
    // The side-gen sampling ladder: the `arbiter` floor (temp 0.2, 24 out — a deterministic name pick) ← the
    // chat host's default-preset params. A user with no preset params gets byte-identical behavior; a user WITH
    // preset params can now widen/tune it. Mapped to the summarize seam's `{temperature, maxTokens}`.
    const arbiterSampling = toSummarizeOptions(resolveSideGenSampling(SIDE_GEN_POSTURES.arbiter, await ctx.resolveChatPresetParams(args.chatId)));
    const smart = await smartArbitrateVia({
      summarize: ctx.summarize,
      candidates: args.candidates,
      castNames: args.castNames,
      recentHistory: args.recentHistory,
      lastSpeaker: args.lastSpeaker,
      rng: deps.prng,
      sampling: arbiterSampling,
      // PROSE-1 census 75 — the director prompt is the room HOST's slot, resolved beside its sampling.
      prose: await ctx.resolveChatProse(args.chatId),
      ...(args.signal !== undefined ? { signal: args.signal } : {}),
    });
    if (smart.aborted) {
      return { speakers: [], aborted: true };
    }
    if (smart.degraded) {
      await deps.emit({ type: "warning", chatId: args.chatId, code: "smart_arbitration_degraded" });
    }
    refs = smart.speakers;
  } else {
    refs = selectSpeakersVia({
      candidates: args.candidates,
      policy: args.group.policy,
      lastSpeaker: args.lastSpeaker,
      forcedIds: forced,
      rng: deps.prng,
      maxSpeakers: args.maxSpeakers,
    });
  }
  const byKey = new Map(args.castNames.map((c) => [speakerKey(c.ref), c] as const));
  const speakers = refs.flatMap((ref) => {
    const c = byKey.get(speakerKey(ref));
    return c !== undefined ? [c] : [];
  });
  return { speakers, aborted: false };
}

/** Coerces a room config to `per-speaker` for a single forced character, so a narrator room still forces a
 *  per-speaker turn for the named character. */
function asPerSpeaker(group: GroupConfig): GroupConfig {
  if (group.output === "per-speaker") {
    return group;
  }
  return {
    output: "per-speaker",
    policy: group.policy,
    cardScope: "merged",
    speakerTags: group.speakerTags,
    groupNudge: group.groupNudge,
    autoMode: group.autoMode,
    autoModeMaxTurns: group.autoModeMaxTurns,
    autoModeDelayMs: group.autoModeDelayMs,
    allowSelfResponses: group.allowSelfResponses,
    memberCardVisibility: group.memberCardVisibility,
  };
}

/** Runs the auto-mode AI→AI chain after a human-triggered round: re-arbitrates one speaker per iteration
 *  (ban-last unless `allowSelfResponses`), drives a single-speaker round, repeats to the bound/interrupt/
 *  no-eligible/lock. Every chained turn is `triggeredBy` the chain-starter. */
async function runChain(
  ctx: ChatContext,
  deps: TurnDeps,
  args: {
    readonly base: RoundBase;
    readonly group: GroupConfig;
    readonly room: Room;
    readonly groupCharacterId: CharacterId | null;
    readonly castName: string;
    readonly signal: AbortSignal;
    readonly initialLastSpeaker: SpeakerRef | null;
  },
): Promise<AutoModeResult> {
  return await runAutoModeVia({
    maxTurns: args.group.autoModeMaxTurns,
    delayMs: args.group.autoModeDelayMs,
    delay: deps.delay,
    signal: args.signal,
    initialLastSpeaker: args.initialLastSpeaker,
    nextSpeaker: async (last) => {
      // Each chain iteration re-arbitrates the NEXT speaker via the same `smart` side-LLM that can HANG — the
      // very window the primary `turnAccepted` fix opened the slot for. The loop only calls `nextSpeaker` when a
      // turn is genuinely about to be arbitrated (it guards `aborted()` before each step), so this is never a
      // speculative open. Re-open the slot NOW (completed→pending flicker between speakers is honest — the
      // director IS working); `speakerCharacterId` is null until this arbitration resolves it, exactly like the
      // primary emit. Every exit below resolves this slot (turnStarted→terminal on the speaking path via
      // runTurn, turnAborted on a cancelled arbitration, turnCompleted on a no-next-speaker end).
      const chainIntent = KIND_TO_INTENT.auto;
      await deps.emit({ type: "turnAccepted", chatId: args.base.chatId, intent: chainIntent, speakerCharacterId: null, targetMessageId: null });
      const facts = await canonFacts(ctx, args.base.chatId);
      const arbitration = await arbitrate(ctx, deps, {
        chatId: args.base.chatId,
        group: args.group,
        candidates: args.room.candidates,
        castNames: args.room.castNames,
        lastSpeaker: args.group.allowSelfResponses ? null : last,
        recentHistory: facts.recentHistory,
        maxSpeakers: 1,
        signal: args.signal,
      });
      // A cancelled arbitration yields no speaker, which stops the chain — `runAutoMode` reports it as
      // `interrupt` (not `no-eligible`) because the signal it already holds is settled. CLOSE the slot this
      // iteration opened with `turnAborted` (the user's Stop mid-chain-arbitration), mirroring the primary window.
      if (arbitration.aborted) {
        await deps.emit({
          type: "turnAborted",
          chatId: args.base.chatId,
          intent: chainIntent,
          reason: "user",
          automationDepth: args.base.automationDepth ?? 0,
        });
        return null;
      }
      const next = arbitration.speakers[0] ?? null;
      // No-next-speaker end (everyone muted/left): the engine never runs this iteration, so nothing else closes
      // the slot this iteration opened — close it with the honest no-reply terminal (the primary no-eligible pattern).
      if (next === null) {
        await deps.emit({ type: "turnCompleted", chatId: args.base.chatId, intent: chainIntent, messageId: null });
      }
      return next;
    },
    runTurn: async (speaker) =>
      await driveRoundVia({
        engine: deps.engine,
        base: { ...args.base, kind: "auto" },
        group: args.group,
        speakers: [speaker],
        groupCharacterId: args.groupCharacterId,
        castName: args.castName,
        narratorMemberNames: narratorMemberNamesOf(args.room),
      }),
  });
}

/** The shared AI-response body of a human `send` AND a drained deferred turn: arbitrate the responder(s) off
 *  the committed canon, mint the narrator group-character when needed, drive the round, then (if autoMode)
 *  chain AI→AI. Returns the round OUTCOME — the committed rows PLUS whether it aborted mid-round (so `send`
 *  propagates the truth instead of hardcoding `aborted:false`). A mid-round abort STOPS before the auto-mode
 *  chain: the caller cancelled, so we do not start an AI→AI chain on top of the cancelled round. Both callers
 *  owe the same "who speaks next" response — the only difference is the caller persists a user line first
 *  (send) or not (drain). */
async function runAiRound(
  ctx: ChatContext,
  deps: TurnDeps,
  args: {
    readonly base: RoundBase;
    readonly group: GroupConfig;
    readonly room: Room;
    readonly signal: AbortSignal;
    /** Human `@mention` hard-override (send only). A drained turn re-arbitrates naturally — the pending row
     *  carries no message text to parse. */
    readonly forcedIds?: readonly CharacterId[] | undefined;
    /** Whether to run the auto-mode AI→AI chain after the human-triggered round. Absent/true for a human send
     *  or drain (the host's autoMode setting governs). A non-human `requestTurn` passes `false` — an autonomous
     *  trigger is ONE injected beat, never a chain (bounded spend; the room's autoMode is a human affordance). */
    readonly chain?: boolean | undefined;
  },
): Promise<TurnOutcome> {
  // ACCEPT the turn to the room BEFORE arbitration: `turnStarted` fires only once the engine runs — AFTER the
  // `smart` side-LLM arbitration below, which can HANG on a non-responsive director box. Without this emit the
  // client's turn slot stayed idle through that hang, so the user had no Stop affordance while the turn was in
  // fact live and abortable (the abort signal already threads into arbitration). `turnAccepted` opens the slot
  // now; every exit below is TOTAL — it resolves that slot (turnStarted→terminal on the speaking path,
  // turnAborted on a cancelled arbitration, turnCompleted on a no-eligible round). `speakerCharacterId` is null
  // (arbitration has not picked yet); the later `turnStarted` re-opens the slot with the resolved speaker.
  const intent = KIND_TO_INTENT[args.base.kind];
  await deps.emit({ type: "turnAccepted", chatId: args.base.chatId, intent, speakerCharacterId: null, targetMessageId: null });

  const facts = await canonFacts(ctx, args.base.chatId);
  const arbitration = await arbitrate(ctx, deps, {
    chatId: args.base.chatId,
    group: args.group,
    candidates: args.room.candidates,
    castNames: args.room.castNames,
    forcedIds: args.forcedIds,
    lastSpeaker: facts.lastSpeaker,
    recentHistory: facts.recentHistory,
    signal: args.signal,
  });
  // CANCELLED mid-arbitration: the caller stopped the turn while the `smart` side-LLM was deciding. End here
  // — no narrator mint, no round, no generation on a turn nobody is waiting for. Nothing committed, so the
  // outcome is the bare aborted shape ("user": the only pre-engine abort source is `activeTurns`, i.e. the
  // caller's own Stop or the host's room-gone sweep — the heartbeat's "stale" lock abort lives INSIDE the
  // engine and cannot fire before a turn starts). The `turnAborted` bus emit — deliberately WITHHELD before
  // `turnAccepted` existed (the slot was idle, nothing listened) — now CLOSES the slot this abort left open.
  // Depth rides `automationDepth` off the base (0 for a human turn) so an automation cascade gates the same as
  // the engine's own `turnAborted`.
  if (arbitration.aborted) {
    await deps.emit({ type: "turnAborted", chatId: args.base.chatId, intent, reason: "user", automationDepth: args.base.automationDepth ?? 0 });
    return { messages: [], aborted: true, abortReason: "user" };
  }
  const speakers = arbitration.speakers;
  const groupCharacterId =
    args.group.output === "narrator"
      ? (
          await ctx.mintSyntheticGroupCharacter({
            ownerId: args.base.runAsUserId,
            chatId: args.base.chatId,
          })
        ).characterId
      : null;
  const castName = joinedCastName(args.room.castNames);
  // Whether the round will drive ANY engine turn: narrator always voices one synthetic turn; per-speaker
  // drives exactly the arbitration result. When arbitration yields NO eligible per-speaker responder the engine
  // never runs, so it emits neither `turnStarted` nor a terminal — and the `turnAccepted` slot above would
  // strand OPEN (a stuck Stop button, the same bug inverted). Close it here with the honest no-reply terminal.
  const drivesAnyTurn = args.group.output === "narrator" || speakers.length > 0;
  if (!drivesAnyTurn) {
    await deps.emit({ type: "turnCompleted", chatId: args.base.chatId, intent, messageId: null });
    return { messages: [], aborted: false, abortReason: undefined };
  }
  const round = await driveRoundVia({
    engine: deps.engine,
    base: args.base,
    group: args.group,
    speakers,
    groupCharacterId,
    castName,
    narratorMemberNames: narratorMemberNamesOf(args.room),
  });
  const committed: MessageView[] = [...round.messages];
  if (round.aborted && round.abortReason !== undefined) {
    return { messages: committed, aborted: true, abortReason: round.abortReason };
  }
  if (args.group.autoMode && (args.chain ?? true)) {
    const auto = await runChain(ctx, deps, {
      base: args.base,
      group: args.group,
      room: args.room,
      groupCharacterId,
      castName,
      signal: args.signal,
      initialLastSpeaker: lastSpeakerRef(round.messages.findLast((m) => m.role === "assistant")),
    });
    committed.push(...auto.messages);
  }
  return { messages: committed, aborted: false, abortReason: undefined };
}

/** Host-offline defer decision (Part III §5): a NON-host member's send while the funding host is dark queues
 *  the owed AI turn as a durable, NOT-lock-held `pending_turns` row (the frozen identity triple) instead of
 *  running it — the 5-min turn-lock would stale-takeover into a double-run. A host's OWN send never defers
 *  (they are present by definition, making the request). Returns true iff the turn was deferred. */
async function deferIfHostOffline(
  ctx: ChatContext,
  args: {
    readonly principalUserId: UserId;
    readonly triggeredBy: UserId;
    readonly runAsUserId: UserId;
    readonly chatId: ChatId;
  },
): Promise<boolean> {
  if (args.principalUserId === args.runAsUserId || (await ctx.readPresence(args.runAsUserId)).online) {
    return false;
  }
  await insertPendingTurn(ctx.db, {
    id: ctx.newPendingTurnId(),
    chatId: args.chatId,
    triggeredBy: args.triggeredBy,
    runAsUserId: args.runAsUserId,
    createdAt: ctx.now(),
  });
  return true;
}

/**
 * The greeting first-user-turn volatile freeze. When the first user message locks the conversation in, bakes
 * each greeting's nondeterministic macros against the turn's pinned clock + seeded PRNG so they stop shipping
 * the literal `{{roll}}` forever. Identity macros stay raw/per-view so the anchor can still re-resolve.
 *
 * Freezes the selected variant of each pre-first-turn greeting row; idempotent (a frozen row emits no write
 * on a repeat pass), so it's also safe under the concurrent-send retry. A later swipe to an unfrozen
 * alternate is not re-frozen — there is no subsequent "first turn" to catch it.
 *
 * D129-F: the bake now carries its provenance. Each rewritten variant stores the PRE-freeze greeting body in
 * `raw_content` and the occurrences it resolved in `macro_freezes`, so the destroyed bytes and the drawn
 * values both survive — which is what makes a later freeze-at-selection (the documented greeting-swipe gap)
 * and a swipe re-resolution possible at all.
 */
async function freezeGreetingVolatiles(
  ctx: ChatContext,
  deps: TurnDeps,
  args: { readonly assembleContext: AssembleContext; readonly priorCanon: readonly MessageView[]; readonly freezeRegistry: MacroRegistry | null },
): Promise<void> {
  const { assembleContext, priorCanon, freezeRegistry } = args;
  const stmts = priorCanon.flatMap((m) => {
    if (m.role !== "assistant") {
      return [];
    }
    // WAVE MU: pass the turn's freeze registry so a greeting embedding a user macro bakes with the turn's
    // bindings/draws; null ⇒ the process `VOLATILE_ONLY_REGISTRY` (byte-identical — user tokens pass through).
    // The sink is per-ROW (never per-registry): the per-turn freeze registry is shared by every greeting here
    // and by the send bake, so one pooled sink would attribute another row's draws to this variant.
    const freezes: MacroFreeze[] = [];
    const frozen = freezeVolatileMacros(m.content, assembleContext, {
      random: deps.prng,
      freezes,
      ...(freezeRegistry !== null ? { registry: freezeRegistry } : {}),
    });
    return frozen === m.content
      ? []
      : [freezeVariantContentStatement(ctx.db, { variantId: m.selectedVariantId, content: frozen, rawContent: m.content, macroFreezes: freezes })];
  });
  if (stmts.length > 0) {
    await ctx.db.batch(batchMany(stmts));
  }
}

/** Trust boundary: every claimed attachment id must be owned by the actor. A foreign/gone id is absent from
 *  the owned subset → a leak-free `attachment_not_owned` refusal. No-op for an attachment-free send. */
async function assertAttachmentsOwned(ctx: ChatContext, principalUserId: UserId, chatId: ChatId, attachments: readonly AssetId[]): Promise<void> {
  if (attachments.length === 0) {
    return;
  }
  const owned = new Set(await ctx.filterOwnedAssetIds(principalUserId, attachments));
  const foreign = attachments.find((id) => !owned.has(id));
  if (foreign !== undefined) {
    throw new ChatOperationError(CHAT_OP_CODES.attachmentNotOwned, `chat ${chatId}: attachment ${foreign} is not owned by the sender`);
  }
}

/** Trust boundary for a caller-supplied authoring persona (send/impersonate): an EXPLICIT personaId stamped
 *  onto a role:"user" row must be owned by the acting caller, else the message-stamped persona name/avatar
 *  producers would leak a foreign persona's chrome into this chat (cross-tenant identity read). Undefined ⇒
 *  the caller's own active persona is used (server-derived, trusted) — no-op. An explicit null clears the
 *  slot — no persona to own, no-op. Mirrors reattributePersona's ownership belt (`verifyPersonaOwned`), and
 *  returns the same `not_persona_owner` code as the re-stamp path. */
async function assertPersonaOwnedIfExplicit(ctx: ChatContext, principalUserId: UserId, chatId: ChatId, personaId: PersonaId | null | undefined): Promise<void> {
  if (personaId === undefined || personaId === null) {
    return;
  }
  const owned = await ctx.verifyPersonaOwned({ ownerId: principalUserId, personaId });
  if (!owned) {
    throw new ChatOperationError(CHAT_OP_CODES.notPersonaOwner, `chat ${chatId}: the authoring persona must be owned by the caller`);
  }
}

// ── PD-146 post-round auto-behaviors (server home for the schema-real UserSettings.chat auto-* knobs) ──
// neo honors these CLIENT-side (use-chat-verbs) by re-issuing continue/swipe after the send resolves; orb is
// server-authoritative, so the send verb runs them in-band and joins the follow-up rows onto its outcome.
// continueOnSend has NO arm here — it is a purely CLIENT behavior (the composer calls chat.continueTurn on an
// empty send; verified against neo, whose continueOnSend lives only in use-pref-sections/the composer). Its
// server-read field stays inert BY DESIGN.

// The bound on each auto-behavior is now the host's PD-146 knob (`UserSettings.chat.autoContinueRounds` /
// `autoSwipe.maxRetries`, default 1 — the neo-parity ONE-follow-up floor, byte-identical), threaded via
// `ChatBehaviorInputs` and read in the loops below. A model that keeps hitting the length cap wants a bigger
// `maxOutputTokens`, and one that keeps producing rejects wants a different prompt — the ceiling (5) caps a
// pathological spend.

/** The auxiliary verbs the send's post-round auto-behaviors re-enter (built once at {@link createTurn}). Each
 *  re-runs the full member gate under the SAME principal + registers its OWN abort handle, so a user abort
 *  during a follow-up is caught through the normal `abort(chatId, userId)` path. */
interface AutoBehaviorDeps {
  readonly swipe: ChatService["swipe"];
  readonly continueTurn: ChatService["continueTurn"];
}

/** The tail assistant reply of a committed set — the row the auto-behaviors inspect (neo reads `.at(-1)`). */
function tailAssistant(messages: readonly MessageView[]): MessageView | undefined {
  return messages.findLast((m) => m.role === "assistant");
}

/** The auto-swipe rejection predicate (neo parity): the reply is too short (fewer than `minLength` chars) OR
 *  contains a blacklisted phrase (case-insensitive substring; empty phrases ignored). */
function isAutoSwipeRejected(content: string, cfg: ChatBehaviorInputs["autoSwipe"]): boolean {
  const tooShort = content.length < cfg.minLength;
  const blacklisted = cfg.blacklist.some((phrase) => phrase.length > 0 && content.toLowerCase().includes(phrase.toLowerCase()));
  return tooShort || blacklisted;
}

/** Runs ONE auto-behavior follow-up (swipe/continue) and returns its committed tip, or null on any failure —
 *  non-fatal, mirroring neo: the already-committed reply stands and the loop stops. */
async function runAutoFollowUp(run: () => Promise<TurnOutcome>): Promise<MessageView | null> {
  try {
    const outcome = await run();
    return outcome.messages.at(-1) ?? null;
  } catch {
    return null;
  }
}

/** The resolved auto-behavior frame: the acting principal + chat + the abort signal that short-circuits a
 *  follow-up loop, shared by the swipe/continue loops. */
interface AutoFrame {
  readonly principal: SendParams["principal"];
  readonly chatId: ChatId;
  readonly signal: AbortSignal;
}

/** The bounded auto-swipe loop: regenerate the rejected reply, re-checking each fresh variant, up to the
 *  bound. `tip` enters rejected (the caller's precedence gate proved it); stops when a variant passes, the
 *  bound is hit, a swipe fails, or abort fires. */
async function runAutoSwipe(auto: AutoBehaviorDeps, frame: AutoFrame, tip: MessageView, cfg: ChatBehaviorInputs["autoSwipe"]): Promise<MessageView[]> {
  const rows: MessageView[] = [];
  let current = tip;
  for (let i = 0; i < cfg.maxRetries && !frame.signal.aborted; i += 1) {
    const target = current;
    // biome-ignore lint/performance/noAwaitInLoops: each swipe re-checks the prior variant + takes the per-chat lock — inherently sequential (bound 1).
    const next = await runAutoFollowUp(() => auto.swipe({ principal: frame.principal, chatId: frame.chatId, messageId: target.id }));
    if (next === null) {
      break;
    }
    rows.push(next);
    current = next;
    if (!isAutoSwipeRejected(next.content, cfg)) {
      break;
    }
  }
  return rows;
}

/** The bounded auto-continue loop: extend a length-capped reply via one continue, up to the bound. Stops
 *  when the tip no longer finished at the length cap, the bound is hit, a continue fails, or abort fires. */
async function runAutoContinue(auto: AutoBehaviorDeps, frame: AutoFrame, tip: MessageView, rounds: number): Promise<MessageView[]> {
  const rows: MessageView[] = [];
  let current = tip;
  for (let i = 0; i < rounds && !frame.signal.aborted; i += 1) {
    if (current.role !== "assistant" || current.finishReason !== "length") {
      break;
    }
    const target = current;
    // biome-ignore lint/performance/noAwaitInLoops: each continue extends the prior tip + takes the per-chat lock — inherently sequential (bound 1).
    const next = await runAutoFollowUp(() => auto.continueTurn({ principal: frame.principal, chatId: frame.chatId, messageId: target.id }));
    if (next === null) {
      break;
    }
    rows.push(next);
    current = next;
  }
  return rows;
}

/**
 * The PD-146 post-round auto-behaviors, run at the verb level AFTER the engine released its per-chat lock
 * (each follow-up re-acquires it fresh): auto-swipe takes PRECEDENCE over auto-continue — they are mutually
 * exclusive (a too-short reply isn't a length-capped one). Returns the committed follow-up rows oldest-first,
 * so the send joins them onto its outcome. Gated on the host's settings — all-off ⇒ [] ⇒ byte-identical.
 */
async function runAutoBehaviors(
  auto: AutoBehaviorDeps,
  args: {
    readonly principal: SendParams["principal"];
    readonly chatId: ChatId;
    readonly committed: readonly MessageView[];
    readonly behavior: ChatBehaviorInputs;
    readonly signal: AbortSignal;
  },
): Promise<MessageView[]> {
  const tip = tailAssistant(args.committed);
  if (tip === undefined || args.signal.aborted) {
    return [];
  }
  const frame: AutoFrame = { principal: args.principal, chatId: args.chatId, signal: args.signal };
  if (args.behavior.autoSwipe.enabled && isAutoSwipeRejected(tip.content, args.behavior.autoSwipe)) {
    return await runAutoSwipe(auto, frame, tip, args.behavior.autoSwipe);
  }
  if (args.behavior.autoContinue) {
    return await runAutoContinue(auto, frame, tip, args.behavior.autoContinueRounds);
  }
  return [];
}

/** Joins the AI round's outcome to the just-committed user row into the send's `TurnOutcome`. A round that
 *  aborted mid-flight (caller cancel / lock-stale) returns the aborted truth with the rows that landed before
 *  it — NO PD-146 follow-up on a cancelled round (`runAutoBehaviors` short-circuits on the aborted signal
 *  anyway; this makes the intent explicit and carries the abort reason). Otherwise runs the host's post-round
 *  auto-behaviors and joins their rows. */
async function assembleSendResult(
  auto: AutoBehaviorDeps,
  args: {
    readonly principal: SendParams["principal"];
    readonly chatId: ChatId;
    readonly userView: MessageView;
    readonly round: TurnOutcome;
    readonly behavior: ChatBehaviorInputs;
    readonly signal: AbortSignal;
  },
): Promise<TurnOutcome> {
  if (args.round.aborted) {
    return {
      messages: [args.userView, ...args.round.messages],
      aborted: true,
      ...(args.round.abortReason !== undefined ? { abortReason: args.round.abortReason } : {}),
    };
  }
  // PD-146 post-round auto-behaviors: auto-swipe (too-short/blacklisted reply) takes precedence over
  // auto-continue (length-capped reply) — a reply can't be both. Gated on the host's settings (all-off ⇒ no
  // follow-up, byte-identical), bounded, abort-aware; every follow-up row joins the send's result.
  const followUps = await runAutoBehaviors(auto, {
    principal: args.principal,
    chatId: args.chatId,
    committed: args.round.messages,
    behavior: args.behavior,
    signal: args.signal,
  });
  return { messages: [args.userView, ...args.round.messages, ...followUps], aborted: false };
}

/** The rpg send-path commit's own trace root. One name so the debug surface and any future filter agree. */
const RPG_USER_COMMIT_SPAN = "rpg.userCommit";

/** The trace-ring request id the send-path commit is bucketed under — its OWN id, never the HTTP request's:
 *  the dispatch instant still has the `trpc.*` span active, but the commit itself runs after that root has
 *  sealed, so a parented span would be silently dropped as a late orphan. Keyed by the user MESSAGE that
 *  triggered it (there is no turnId on the send path yet). Mirrors `rpgRoundRequestId` in the engine. */
function rpgUserCommitRequestId(messageId: MessageId): string {
  return `rpg-user-commit:${messageId}`;
}

/** Fire-and-forget the rpg SEND-path COMMIT (rpg-design/05 §0): after the user row lands, lock in the prior
 *  assistant turn's snapshot the user was replying to (+ consume queued dice). Null op = non-rpg chat
 *  (byte-identical no-op); fire-and-forget so a background snapshot-commit never blocks or fails the send.
 *  Wrapped in its own DETACHED root (`withRequestSpan`) for the same reason the engine's rpg round is: it
 *  outlives the request, so without a root of its own its cost and its failures are invisible. */
function fireRpgUserCommit(ctx: ChatContext, chatId: ChatId, messageId: MessageId): void {
  if (ctx.rpg !== null) {
    const rpg = ctx.rpg;
    void withRequestSpan(rpgUserCommitRequestId(messageId), RPG_USER_COMMIT_SPAN, { chatId, messageId }, () => rpg.onUserCommit(chatId, messageId)).catch(
      () => undefined,
    );
  }
}

/** The resolved COMMIT half shared by `send` and `commitMessage`: the trust-boundary-cleared, persisted user
 *  row plus every round-input local the send's downstream (defer / round / auto-behavior) reads. Factored so
 *  the persist + first-user-turn greeting freeze + rpg user-commit fire from ONE home (D56's "the commit half
 *  has one home" — `send` and `commitMessage` cannot drift on the trust boundary or the freeze). */
interface CommittedUserTurn {
  readonly membership: Awaited<ReturnType<typeof requireParticipant>>;
  readonly room: Room;
  readonly identity: ReturnType<typeof resolveTurnIdentityVia>;
  readonly connection: ResolvedConnection;
  readonly group: GroupConfig;
  readonly userView: MessageView;
  readonly built: BuiltTurnContext;
}

/** Steps 1-6 of a user-message commit (the front half of `send`; the WHOLE of `commitMessage`): the
 *  membership gate, the attachment + explicit-persona trust boundaries, the room/identity/connection resolve,
 *  the one assemble ctx (`kind:"send"` — a commit runs a send's GATHER even when no round follows, so a
 *  `commitMessage` first-user-turn freeze is byte-identical to `send`'s), the persist, the first-user-turn
 *  greeting-volatile freeze, and the rpg user-commit. Returns the bundle the round path reads next. */
async function commitUserTurn(
  ctx: ChatContext,
  deps: TurnDeps,
  args: {
    readonly principal: SendParams["principal"];
    readonly chatId: ChatId;
    readonly content: string;
    readonly personaId?: PersonaId | null | undefined;
    readonly attachmentAssetIds?: readonly AssetId[] | undefined;
    readonly guided?: GuidedSteer | undefined;
  },
): Promise<CommittedUserTurn> {
  const { principal, chatId, content, personaId, guided } = args;
  const membership = await requireParticipant(ctx, principal, chatId);
  const attachments = args.attachmentAssetIds ?? [];
  await assertAttachmentsOwned(ctx, principal.userId, chatId, attachments);
  // Same trust boundary as impersonate: an EXPLICIT personaId stamped onto the committed user row must be
  // owned by the caller, else the message-stamped persona name/avatar producers leak a foreign persona's
  // chrome. Omitted ⇒ the caller's own active persona (trusted). See assertPersonaOwnedIfExplicit.
  await assertPersonaOwnedIfExplicit(ctx, principal.userId, chatId, personaId);
  const room = await loadRoom(ctx, chatId);
  const identity = resolveTurnIdentityVia({
    principalUserId: principal.userId,
    hostUserId: room.hostUserId,
  });
  const connection = await deps.resolveConnection({
    runAsUserId: identity.runAsUserId,
    chatId,
  });
  const group = membership.chat.metadata.group ?? DEFAULT_GROUP_CONFIG;

  // Built with the pending user text in the WI haystack before the user row commits; the engine reloads
  // canon (including the committed row) for the wire history.
  const sendOut: SendRegexSink = {};
  const built = await buildTurnContext(
    ctx,
    deps,
    {
      chatId,
      runAsUserId: identity.runAsUserId,
      model: connection.model,
      kind: "send",
      castCharacterIds: room.castCharacterIds,

      mutedSpeakerKeys: room.mutedSpeakerKeys,
      personaIds: room.personaIds,
      presentHumanUserIds: room.presentHumanUserIds,
      anchorPersonaId: membership.chat.anchorPersonaId,
      // biome-ignore lint/nursery/useNullishCoalescing: `??` would coalesce an EXPLICIT null into the active persona — only an omitted (undefined) param falls back (mirrors the row-stamp expression below).
      trigger: humanTrigger(principal.userId, personaId !== undefined ? personaId : membership.activePersonaId),
      pendingUserText: content,
      // A send's AI response directly responds to the just-committed user message (rpg-design/05 §6): the
      // player's queued d20 feeds its first skill check. Always true for a send.
      respondsToLatestUserTurn: true,
      guided,
      // The Ruling-B host `{{char}}` (joined cast / solo single) for the rpg steeringNote render (chat owns it).
      castCharForHostRow: joinedCastName(room.castNames),
    },
    sendOut,
  );

  // A greeting's volatile macros freeze at the first user turn; detect it before this send commits (no
  // role:"user" row exists yet), then bake the greetings after the row lands.
  const priorCanon = await loadCanonHistory(ctx.db, chatId);
  const isFirstUserTurn = !priorCanon.some((m) => m.role === "user");

  const userView = await persistUserMessage(ctx, deps.emit, {
    chatId,
    content: composeBodyWithAttachments(sendOut.sendUserText ?? content, attachments),
    // D129-F provenance: `content` above is the draft after the freeze, the `user_input` transform, the
    // USER_INPUT regex and the attachment compose; `rawContent` is what the human actually typed. The writer
    // collapses it to NULL whenever none of those legs changed a byte.
    rawContent: content,
    macroFreezes: sendOut.sendMacroFreezes ?? [],
    authorUserId: principal.userId,
    // An omitted personaId stamps the acting participant's active persona; an explicit id (or null) wins.
    // biome-ignore lint/nursery/useNullishCoalescing: `??` would coalesce an EXPLICIT null into the active persona — only an omitted (undefined) param falls back.
    personaId: personaId !== undefined ? personaId : membership.activePersonaId,
    hostUserId: room.hostUserId,
    attachmentAssetIds: attachments,
  });

  if (isFirstUserTurn) {
    await freezeGreetingVolatiles(ctx, deps, { assembleContext: built.assembleContext, priorCanon, freezeRegistry: built.freezeMacroRegistry });
  }

  fireRpgUserCommit(ctx, chatId, userView.id);

  return { membership, room, identity, connection, group, userView, built };
}

/** `send` — persist the user message, build the one immutable assemble ctx, arbitrate the responders, drive
 *  the round, then (if autoMode) chain AI→AI, then (PD-146) run the host's post-round auto-behaviors.
 *  Member-gated; AI turns run as the host. */
function createSend(ctx: ChatContext, deps: TurnDeps, auto: AutoBehaviorDeps): ChatService["send"] {
  return async ({ principal, chatId, content, personaId, attachmentAssetIds, intent, guided }: SendParams): Promise<TurnOutcome> => {
    const { membership, room, identity, connection, group, userView, built } = await commitUserTurn(ctx, deps, {
      principal,
      chatId,
      content,
      personaId,
      attachmentAssetIds,
      guided,
    });
    const {
      assembleContext,
      memoryConfig,
      memoryRecall,
      chatBehavior,
      attachedToolNames,
      terminalTools,
      respondsToLatestUserTurn,
      macroRegistry,
      userMacroDraws,
      cardKeepLastX,
    } = built;

    // Host-offline → DEFER the AI response (Part III §5): the member's message is durable canon, but the owed
    // AI turn cannot run on the host's dark box, so it queues instead of running. The user row stands alone.
    if (
      await deferIfHostOffline(ctx, {
        principalUserId: principal.userId,
        triggeredBy: identity.triggeredBy,
        runAsUserId: identity.runAsUserId,
        chatId,
      })
    ) {
      // The user's own row carries no model-emitted hidden content OR reasoning, but route it through the ONE
      // §3.6 return projection anyway (host-identity fast-path) so every `send` exit strips uniformly.
      return stripMessagesForViewer({ messages: [userView], aborted: false }, membership, await reasoningHostOnlyFor(ctx, chatId, membership));
    }

    // Registered before base so the abort signal threads into every round turn + the auto-mode chain. SCOPE-OWNED
    // (`using`): the registration is released at every exit of this verb — return, throw, or abort — which is
    // what the hand-written `finally` did, plus the base-construction window it did not cover.
    using handle = deps.activeTurns.register(chatId, identity.triggeredBy);
    const base: RoundBase = {
      chatId,
      assembleContext,
      connection,
      triggeredBy: identity.triggeredBy,
      runAsUserId: identity.runAsUserId,
      kind: "send",
      intent: intent ?? {},
      extraStopSequences: chatBehavior.customStoppingStrings,
      memoryConfig,
      ...(memoryRecall !== null ? { memoryRecall } : {}),
      attachedToolNames,
      terminalTools,
      cardKeepLastX,
      ...recursePatch(membership.chat.metadata.toolRecurseLimit),
      respondsToLatestUserTurn,
      // WAVE MU: the per-turn user-macro registry + the fresh draw record — shared across the round's speakers
      // (buildSpeakerPrep spreads the base), so every committed variant persists the same draws.
      ...prepMacroFields(macroRegistry, userMacroDraws),
      signal: handle.signal,
    };

    const round = await runAiRound(ctx, deps, {
      base,
      group,
      room,
      signal: handle.signal,
      forcedIds: resolveMentionsVia(content, room.castNames),
    });
    // §3.6 RETURN PROJECTION: the assistant reply in `round.messages` carries the model's hidden spans; a
    // NON-HOST member who ran this turn must not receive the truth bytes in the HTTP return (the bus + list
    // reads already strip — this closes the mutation-return sibling). The host reads verbatim.
    const outcome = await assembleSendResult(auto, { principal, chatId, userView, round, behavior: chatBehavior, signal: handle.signal });
    return stripMessagesForViewer(outcome, membership, await reasoningHostOnlyFor(ctx, chatId, membership));
  };
}

/** `commitMessage` — the "Simple Send" / post-without-generate lever (D56): commit the user row WITHOUT firing
 *  the AI turn. It is `send`'s COMMIT half (the shared {@link commitUserTurn}: membership gate + trust
 *  boundaries + persist + first-user-turn greeting freeze + rpg user-commit) and NOTHING more — no
 *  arbitration, no round, no auto-behaviors, and (there being no owed turn) no host-offline defer. Returns the
 *  committed user row through the §3.6 return projection (a member's own row carries no hidden/reasoning bytes,
 *  but strip uniformly). A real user beat: the rpg user-commit locks in the prior assistant's snapshot. */
function createCommitMessage(ctx: ChatContext, deps: TurnDeps): ChatService["commitMessage"] {
  return async ({ principal, chatId, content, personaId, attachmentAssetIds }: CommitMessageParams): Promise<TurnOutcome> => {
    const { membership, userView } = await commitUserTurn(ctx, deps, {
      principal,
      chatId,
      content,
      personaId,
      attachmentAssetIds,
    });
    return stripMessagesForViewer({ messages: [userView], aborted: false }, membership, await reasoningHostOnlyFor(ctx, chatId, membership));
  };
}

/** `forceCharacterTurn` — host-only. Force a present roster character to speak next (per-speaker; no user
 *  row). Eligibility is presence-only (`leftSeq === null`) — a muted member is still force-summonable, since
 *  mute only excludes from natural/smart auto-selection, not an explicit host override. A non-member / left /
 *  unknown target is a leak-free NOT_FOUND. */
function createForceCharacterTurn(ctx: ChatContext, deps: TurnDeps): ChatService["forceCharacterTurn"] {
  return async ({ principal, chatId, characterId, intent, guided }: ForceCharacterTurnParams): Promise<TurnOutcome> => {
    const membership = await requireHost(ctx, principal, chatId);
    const room = await loadRoom(ctx, chatId);
    const identity = resolveTurnIdentityVia({
      principalUserId: principal.userId,
      hostUserId: room.hostUserId,
    });
    const target = room.castNames.find((c) => c.ref.characterId === characterId);
    // Presence-only (leftSeq === null), not the stricter isArbiterEligible: a host can force-turn a muted member.
    const present = room.candidates.some((c) => c.ref.characterId === characterId && c.leftSeq === null);
    if (target === undefined || !present) {
      throw new ChatNotFoundError(chatId);
    }
    const connection = await deps.resolveConnection({ runAsUserId: identity.runAsUserId, chatId });
    const group = asPerSpeaker(membership.chat.metadata.group ?? DEFAULT_GROUP_CONFIG);
    const { assembleContext, memoryConfig, memoryRecall, chatBehavior, attachedToolNames, terminalTools, cardKeepLastX } = await buildTurnContext(ctx, deps, {
      chatId,
      runAsUserId: identity.runAsUserId,
      model: connection.model,
      kind: "force",
      castCharacterIds: room.castCharacterIds,

      mutedSpeakerKeys: room.mutedSpeakerKeys,
      personaIds: room.personaIds,
      presentHumanUserIds: room.presentHumanUserIds,
      anchorPersonaId: membership.chat.anchorPersonaId,
      trigger: humanTrigger(principal.userId, membership.activePersonaId),
      guided,
      // The Ruling-B host `{{char}}` (joined cast / solo single) for the rpg steeringNote render (chat owns it).
      castCharForHostRow: joinedCastName(room.castNames),
    });
    using handle = deps.activeTurns.register(chatId, identity.triggeredBy);
    const base: RoundBase = {
      chatId,
      assembleContext,
      connection,
      triggeredBy: identity.triggeredBy,
      runAsUserId: identity.runAsUserId,
      kind: "force",
      intent: intent ?? {},
      extraStopSequences: chatBehavior.customStoppingStrings,
      memoryConfig,
      ...(memoryRecall !== null ? { memoryRecall } : {}),
      attachedToolNames,
      terminalTools,
      cardKeepLastX,
      ...recursePatch(membership.chat.metadata.toolRecurseLimit),
      signal: handle.signal,
    };
    const round = await driveRoundVia({
      engine: deps.engine,
      base,
      group,
      speakers: [target],
      groupCharacterId: null,
      castName: target.name,
      // A FORCED single speaker rides the `asPerSpeaker`-coerced config — never the narrator arm, so
      // there is no cast to name.
      narratorMemberNames: [],
    });
    return {
      messages: round.messages,
      aborted: round.aborted,
      ...(round.abortReason !== undefined ? { abortReason: round.abortReason } : {}),
    };
  };
}

/** `abort` — cancel the caller's in-flight turn(s) for the chat. Owner-only: a caller who owns none while
 *  another user's turn is in flight is refused `not_turn_owner`. A no-in-flight abort is an idempotent no-op.
 *
 *  TWO REGISTRIES, deliberately. `activeTurns` holds the GENERATION, and its entry is released the moment the
 *  engine turn returns — but the rpg STATE ROUND is fired fire-and-forget from inside that turn body and then
 *  runs for another 0.8-2.9s with a model call of its own. By then `activeTurns.abort` iterates a set the turn
 *  has already left and signals nobody, so a Stop would cancel the generation and let the state round bill on.
 *  `cancelStateRounds` is the second reach that closes it (full timeline: `ChatRpgOps.cancelStateRounds`).
 *
 *  Both are OWNER-SCOPED the same way, and the refusal reads BOTH counts: a caller whose generation already
 *  finished but whose state round is still running owns something abortable, so cancelling it must not be
 *  mistaken for the `not_turn_owner` case. */
function createAbort(ctx: ChatContext, deps: TurnDeps): ChatService["abort"] {
  return async ({ principal, chatId }: AbortParams): Promise<void> => {
    await requireParticipant(ctx, principal, chatId);
    const { aborted, foreignInFlight } = deps.activeTurns.abort(chatId, principal.userId);
    const rpg = ctx.rpg; // narrowed via a local (the engine's `fireRpg*` precedent) — null = rpg is not wired
    const stateRounds = rpg === null ? 0 : rpg.cancelStateRounds(chatId, principal.userId);
    if (aborted === 0 && stateRounds === 0 && foreignInFlight) {
      throw new ChatOperationError(CHAT_OP_CODES.notTurnOwner, `chat ${chatId}: cannot abort a turn you do not own`);
    }
  };
}

// The single-speaker auxiliary turns (swipe / continue / impersonate / generate) target one slot/speaker
// (no arbitration/round) and share a preamble + a registered engine run.

/** The resolved single-turn substrate — assumes `requireParticipant`/`requireHost` already ran. */
interface TurnBase {
  readonly room: Room;
  readonly identity: { readonly triggeredBy: UserId; readonly runAsUserId: UserId };
  readonly connection: ResolvedConnection;
  readonly assembleContext: AssembleContext;
  readonly memoryConfig: MemoryConfig | null | undefined;
  /** The round-level recall inputs for the engine's per-speaker witnessed re-run (D6); threaded onto each
   *  auxiliary prep. `null` ⇒ no per-speaker recall (round-level `memory` stands). */
  readonly memoryRecall: MemoryRecallInputs | null;
  /** The host's resolved turn-behavior arm (PD-146) — the custom stops each auxiliary prep threads onto
   *  the request. Defaulted to all-off. */
  readonly chatBehavior: ChatBehaviorInputs;
  /** A game turn's gather-contributed tool names (rpg-design/05 §1) — threaded onto each auxiliary prep's
   *  `attachedToolNames`. Empty for a non-game turn / until the rpg registry lands (byte-identical). */
  readonly attachedToolNames: readonly string[];
  /** A game turn's gather-contributed TERMINAL tools (R1) — threaded onto each PERSISTING auxiliary prep
   *  (swipe/continue/generate); `undefined` for a non-game / non-folded turn. */
  readonly terminalTools: readonly WireTool[] | undefined;
  /** The M2 card wire knob (parity-plus §3.5) — threaded onto each auxiliary prep. `undefined` for a non-game
   *  turn (no window — every stored card rides whole); a game contributes a number, `0` = every card stubs. */
  readonly cardKeepLastX: number | undefined;
  /** rpg-design/05 §6 slot-adjacency: does this auxiliary turn's slot directly respond to the latest user
   *  message (only `swipe` of the die-response can — the rest are false)? Threaded onto the prep. */
  readonly respondsToLatestUserTurn: boolean;
  /** The per-turn user-macro registry (WAVE MU) — threaded onto the aux prep's `macroRegistry`; `null` ⇒ no
   *  user macros (byte-identical). */
  readonly macroRegistry: MacroRegistry | null;
  /** The per-turn user-macro FREEZE registry (WAVE MU) — currently unused by the aux verbs (no greeting-freeze
   *  path), carried for shape-parity with `BuiltTurnContext`; `null` ⇒ no user macros. */
  readonly freezeMacroRegistry: MacroRegistry | null;
  /** The turn's effective user-macro draw record (frozen ∪ fresh) — persisted on the committed variant;
   *  `null` ⇒ the turn drew nothing. On swipe/continue it is the REPLAYED record (the frozen draws in force). */
  readonly userMacroDraws: UserMacroDraws | null;
}

/** Resolves the {@link TurnBase} for an auxiliary turn. The AI runs as the host. These turns add no new user
 *  line, so there is no `pendingUserText` to fold into the WI haystack. */
async function resolveTurnBase(
  ctx: ChatContext,
  deps: TurnDeps,
  args: {
    readonly principal: SendParams["principal"];
    readonly chatId: ChatId;
    readonly kind: TurnKind;
    readonly anchorPersonaId: PersonaId | null;
    /** WHO drives this turn ({@link TurnTrigger}) — binds prompt-config `{{user}}` to the speaker. REQUIRED;
     *  a turn with no live triggering human states `{kind:"none"}` (the retired absent arm bound
     *  `personaIds[0]`, a presence-order-arbitrary bystander). */
    readonly trigger: TurnTrigger;
    /** rpg-design/05 §6 slot-adjacency verdict (only `swipe` of the die-response passes true). Default false. */
    readonly respondsToLatestUserTurn?: boolean | undefined;
    /** The slot this turn REGENERATES (swipe only — `continue` extends the slot and reads through it). VER-1b. */
    readonly regenSlotMessageId?: MessageId | undefined;
    readonly guided?: GuidedSteer | undefined;
    /** The target slot's persisted user-macro draws (WAVE MU) — swipe/continue replay them byte-exact so the
     *  re-generation resolves the identical draw. Absent (generate) ⇒ a fresh draw. */
    readonly frozenUserMacroDraws?: UserMacroDraws | undefined;
  },
): Promise<TurnBase> {
  const { principal, chatId } = args;
  const room = await loadRoom(ctx, chatId);
  const identity = resolveTurnIdentityVia({
    principalUserId: principal.userId,
    hostUserId: room.hostUserId,
  });
  const connection = await deps.resolveConnection({ runAsUserId: identity.runAsUserId, chatId });
  const {
    assembleContext,
    memoryConfig,
    memoryRecall,
    chatBehavior,
    attachedToolNames,
    terminalTools,
    respondsToLatestUserTurn,
    macroRegistry,
    freezeMacroRegistry,
    userMacroDraws,
    cardKeepLastX,
  } = await buildTurnContext(ctx, deps, {
    chatId,
    runAsUserId: identity.runAsUserId,
    model: connection.model,
    kind: args.kind,
    castCharacterIds: room.castCharacterIds,

    mutedSpeakerKeys: room.mutedSpeakerKeys,
    personaIds: room.personaIds,
    presentHumanUserIds: room.presentHumanUserIds,
    anchorPersonaId: args.anchorPersonaId,
    trigger: args.trigger,
    ...(args.respondsToLatestUserTurn !== undefined ? { respondsToLatestUserTurn: args.respondsToLatestUserTurn } : {}),
    ...(args.regenSlotMessageId !== undefined ? { regenSlotMessageId: args.regenSlotMessageId } : {}),
    guided: args.guided,
    ...(args.frozenUserMacroDraws !== undefined ? { frozenUserMacroDraws: args.frozenUserMacroDraws } : {}),
    // The Ruling-B host `{{char}}` (joined cast / solo single) for the rpg steeringNote render (chat owns it).
    castCharForHostRow: joinedCastName(room.castNames),
  });
  return {
    room,
    identity,
    connection,
    assembleContext,
    memoryConfig,
    memoryRecall,
    chatBehavior,
    attachedToolNames,
    terminalTools,
    respondsToLatestUserTurn,
    macroRegistry,
    freezeMacroRegistry,
    userMacroDraws,
    cardKeepLastX,
  };
}

/** Runs one engine turn under an active-turns registration, threading the abort signal into the engine and
 *  releasing the handle at scope exit (`using`). The outcome is §3.6-projected for the CALLER: a non-host member who
 *  ran the turn (swipe/continue/impersonate/generate) never receives the assistant reply's hidden spans in the
 *  return payload — the ONE tail all four verbs share, so the strip can't be forgotten per-verb. */
async function runRegistered(ctx: ChatContext, deps: TurnDeps, viewer: { readonly role: string }, prep: Omit<TurnPrep, "signal">): Promise<TurnOutcome> {
  using handle = deps.activeTurns.register(prep.chatId, prep.triggeredBy);
  const outcome = await deps.engine.runTurn({ ...prep, signal: handle.signal });
  // P3 (§3.6): a member who ran a DECEPTION-active game turn also loses the reasoning channel in the return
  // (resolved once via the injected rpg op; `false` for a host / non-deception chat).
  return stripMessagesForViewer(outcome, viewer, await reasoningHostOnlyFor(ctx, prep.chatId, viewer));
}

/** The shape for an auxiliary turn voicing a known roster character. Returns undefined (⇒ ctx primary) when
 *  the name can't be resolved (a deleted character). */
function speakerShapeFor(room: Room, characterId: CharacterId | null): TurnPrep["shape"] {
  if (characterId === null) {
    return; // a non-character slot has no per-speaker character shape.
  }
  const name = room.castNames.find((c) => c.ref.characterId === characterId)?.name;
  if (name === undefined || name.length === 0) {
    return;
  }
  return {
    output: "per-speaker",
    cardScope: "merged",
    scopedTargetId: null,
    speakerName: name,
    speakerRef: { kind: "character", characterId },
  };
}

/** `swipe` — reroll an assistant slot: regenerate from the context before the slot and append the result as
 *  a new selected variant. `regenerate` is swipe on the last assistant message. A non-assistant / missing
 *  target is NOT_FOUND. */
function createSwipe(ctx: ChatContext, deps: TurnDeps): ChatService["swipe"] {
  return async ({ principal, chatId, messageId, intent, guided }: SwipeParams): Promise<TurnOutcome> => {
    const membership = await requireParticipant(ctx, principal, chatId);
    // Chat-scoped load: a messageId from another chat matches nothing, so a member can't swipe-append another room's canon.
    const target = await loadSlotTarget(ctx.db, chatId, messageId);
    if (target === undefined || target.role !== "assistant") {
      throw new ChatNotFoundError(chatId);
    }
    // rpg-design/05 §6: a swipe re-feeds the SAME queued d20 ONLY when it regenerates the slot that directly
    // responds to the die-bearing latest user message (no swipe-fishing for a better roll; a swipe of an older
    // slot, or after a later reply landed, is ineligible).
    const respondsToLatestUserTurn = await loadIsReplyToLatestUserMessage(ctx.db, chatId, messageId);
    const {
      room,
      identity,
      connection,
      assembleContext,
      memoryConfig,
      memoryRecall,
      chatBehavior,
      attachedToolNames,
      terminalTools,
      macroRegistry,
      userMacroDraws,
      cardKeepLastX,
    } = await resolveTurnBase(ctx, deps, {
      principal,
      chatId,
      kind: "swipe",
      anchorPersonaId: membership.chat.anchorPersonaId,
      trigger: humanTrigger(principal.userId, membership.activePersonaId),
      respondsToLatestUserTurn,
      // VER-1b: this turn REGENERATES `messageId` — the slot whose currently-selected variant is the one being
      // abandoned. The gather cuts the tracked state before it, exactly as the canon context is cut here.
      regenSlotMessageId: messageId,
      guided,
      // WAVE MU: replay the slot's persisted draw record so this swipe resolves the IDENTICAL random-pick draw.
      ...(target.macroDraws !== null ? { frozenUserMacroDraws: target.macroDraws } : {}),
    });
    const shape = speakerShapeFor(room, target.characterId);
    return await runRegistered(ctx, deps, membership, {
      chatId,
      assembleContext,
      connection,
      triggeredBy: identity.triggeredBy,
      runAsUserId: identity.runAsUserId,
      kind: "swipe",
      intent: intent ?? {},
      extraStopSequences: chatBehavior.customStoppingStrings,
      memoryConfig,
      ...(memoryRecall !== null ? { memoryRecall } : {}),
      attachedToolNames,
      terminalTools,
      cardKeepLastX,
      ...recursePatch(membership.chat.metadata.toolRecurseLimit),
      respondsToLatestUserTurn,
      ...prepMacroFields(macroRegistry, userMacroDraws),
      speakerCharacterId: target.characterId,
      persist: { mode: "append-variant", targetMessageId: messageId },
      ...(shape !== undefined ? { shape } : {}),
    });
  };
}

// continueTurn: extend the tail assistant message in place, snapshotting for undo.
/** `continueTurn` — extend an assistant slot's selected variant in place: the model sees the canon THROUGH the
 *  slot (+ a continue nudge) and the generated text is APPENDED to the variant, snapshotting `preContinue*` so
 *  `undoContinue` can restore it (D26). A non-assistant / missing target is a leak-free NOT_FOUND. */
function createContinueTurn(ctx: ChatContext, deps: TurnDeps): ChatService["continueTurn"] {
  return async ({ principal, chatId, messageId, intent, guided }: ContinueTurnParams): Promise<TurnOutcome> => {
    const membership = await requireParticipant(ctx, principal, chatId);
    // Chat-scoped load: a messageId from another chat matches nothing, so a member can't continue-append another room's canon.
    const target = await loadSlotTarget(ctx.db, chatId, messageId);
    if (target === undefined || target.role !== "assistant") {
      throw new ChatNotFoundError(chatId);
    }
    const {
      room,
      identity,
      connection,
      assembleContext,
      memoryConfig,
      memoryRecall,
      chatBehavior,
      attachedToolNames,
      terminalTools,
      macroRegistry,
      userMacroDraws,
      cardKeepLastX,
    } = await resolveTurnBase(ctx, deps, {
      principal,
      chatId,
      kind: "continue",
      anchorPersonaId: membership.chat.anchorPersonaId,
      trigger: humanTrigger(principal.userId, membership.activePersonaId),
      guided,
      // WAVE MU: a continue replays the slot's draw record so its extension prompt carries the same drawn values.
      ...(target.macroDraws !== null ? { frozenUserMacroDraws: target.macroDraws } : {}),
    });
    const shape = speakerShapeFor(room, target.characterId);
    return await runRegistered(ctx, deps, membership, {
      chatId,
      assembleContext,
      connection,
      triggeredBy: identity.triggeredBy,
      runAsUserId: identity.runAsUserId,
      kind: "continue",
      intent: intent ?? {},
      extraStopSequences: chatBehavior.customStoppingStrings,
      memoryConfig,
      ...(memoryRecall !== null ? { memoryRecall } : {}),
      attachedToolNames,
      terminalTools,
      cardKeepLastX,
      ...recursePatch(membership.chat.metadata.toolRecurseLimit),
      ...prepMacroFields(macroRegistry, userMacroDraws),
      speakerCharacterId: target.characterId,
      // RENDERED (macro path parity): continue carries no `{{person}}` today; the registry render is a safe no-op
      // that substitutes any `{{user}}/{{char}}` an edited/ST-imported continue nudge holds.
      appendUserTurn: nudgeOf(assembleContext, "continueNudge", macroRegistry !== null ? { registry: macroRegistry } : {}),
      persist: { mode: "continue", targetMessageId: messageId },
      ...(shape !== undefined ? { shape } : {}),
    });
  };
}

/** A single-producer/single-consumer bridge from the engine's `onText` CALLBACK to an async generator: the
 *  generation pushes text deltas via `push`, the generator drains them in order, and `close()` ends the drain.
 *  Backpressure-free (chat deltas are tiny + bounded); a LOCAL queue, NOT the transport bus channel — this is a
 *  one-shot, single-consumer stream with no durability/replay/fan-out (so it never rides the shared EventEmitter
 *  home). The consumer parks on `arrival` (re-armed after each wake), so a yield fires per delta, not batched. */
interface DeltaBridge {
  readonly push: (delta: string) => void;
  readonly close: () => void;
  readonly drain: () => AsyncGenerator<string>;
}

function createDeltaBridge(): DeltaBridge {
  const queue: string[] = [];
  let done = false;
  let wake: (() => void) | null = null;
  // The "next arrival" promise — resolved by push/close, then re-armed. Single-slot: one consumer only.
  let arrival = new Promise<void>((resolve) => {
    wake = resolve;
  });
  const signalArrival = (): void => {
    const w = wake;
    if (w !== null) {
      wake = null;
      arrival = new Promise<void>((resolve) => {
        wake = resolve;
      });
      w();
    }
  };
  async function* drain(): AsyncGenerator<string> {
    let draining = true;
    while (draining) {
      const next = queue.shift();
      if (next !== undefined) {
        yield next;
      } else if (done) {
        draining = false;
      } else {
        // biome-ignore lint/performance/noAwaitInLoops: a stream drain is inherently sequential — park until the next push/close.
        await arrival;
      }
    }
  }
  return {
    push: (delta): void => {
      queue.push(delta);
      signalArrival();
    },
    close: (): void => {
      done = true;
      signalArrival();
    },
    drain,
  };
}

/** `impersonateStream` — STREAM the user's next line (active persona's voice) into the composer as it
 *  generates, yielding text deltas. Persists NOTHING: no user slot, no canon, no bus event — the user reviews
 *  the drafted line in the composer and commits it with a normal send. Replaced the persisting `impersonate`
 *  turn (flash-and-vanish on the post-commit refetch race) + its one-shot draft predecessor (text plopped in
 *  all at once). The signal (transport-supplied) cancels the in-flight generation on teardown; the partial
 *  text already yielded stays in the composer. */
function createImpersonateStream(ctx: ChatContext, deps: TurnDeps): ChatService["impersonateStream"] {
  return async function* ({ principal, chatId, personaId, intent, guided, signal }: ImpersonateStreamParams): AsyncGenerator<ImpersonateStreamDelta> {
    const membership = await requireParticipant(ctx, principal, chatId);
    // An EXPLICIT personaId must be owned by the acting caller — even for a non-persisting draft, the persona
    // binds the assembled prompt's `{{user}}`/name, so a foreign id would read another user's private persona
    // name into the generation = a cross-tenant identity read. Mirrors the send/impersonate ownership belt; an
    // omitted id falls back to the caller's OWN active persona (server-derived, trusted — no check).
    await assertPersonaOwnedIfExplicit(ctx, principal.userId, chatId, personaId);
    const {
      room,
      identity,
      connection,
      assembleContext,
      memoryConfig,
      memoryRecall,
      chatBehavior,
      attachedToolNames,
      macroRegistry,
      userMacroDraws,
      cardKeepLastX,
    } = await resolveTurnBase(ctx, deps, {
      principal,
      chatId,
      kind: "impersonate",
      anchorPersonaId: membership.chat.anchorPersonaId,
      // biome-ignore lint/nursery/useNullishCoalescing: `??` would coalesce an EXPLICIT null into the active persona — only an omitted (undefined) param falls back.
      trigger: humanTrigger(principal.userId, personaId !== undefined ? personaId : membership.activePersonaId),
      guided,
    });
    // The non-persisting generation: same assemble ctx + impersonateNudge + steer a real turn builds, run
    // through the engine's generate-only path (no lock, no canon write, no bus emit). Each text delta is pushed
    // onto the bridge and yielded to the transport AS IT ARRIVES (progressive composer fill). The engine pays
    // the consent + GPU-budget belts; the caller's `signal` (subscription teardown) aborts the in-flight run.
    const bridge = createDeltaBridge();
    const run = deps.engine
      .generateText(
        {
          chatId,
          assembleContext,
          connection,
          triggeredBy: identity.triggeredBy,
          runAsUserId: identity.runAsUserId,
          kind: "impersonate",
          intent: intent ?? {},
          // IMP-1 layer 2a — the CHAR-NAME STOP set. An impersonate draft is the USER's line, so a `\nSeren:`
          // is the model rolling on into the cast's lines; cut it at the wire (ST's `getStoppingStrings`
          // group arm, script.js:3010-3029 — one stop per present member). Measured need: the voice-lock
          // nudge alone leaves 28% character bleed on the local 8B (scripts/probes/impersonate). Rides the
          // host's own custom stops; a stop-less model drops them capability-gated + loud (resolveChat).
          extraStopSequences: [...chatBehavior.customStoppingStrings, ...foreignLabelStops(room.castNames.map((c) => c.name))],
          memoryConfig,
          ...(memoryRecall !== null ? { memoryRecall } : {}),
          attachedToolNames,
          cardKeepLastX,
          ...recursePatch(membership.chat.metadata.toolRecurseLimit),
          ...prepMacroFields(macroRegistry, userMacroDraws),
          speakerCharacterId: null,
          // The unsteered impersonate voice-lock nudge, RENDERED: `{{user}}`→persona, `{{char}}`→character,
          // `{{person}}`→the picked perspective (guided-only). Threads the same macro registry a steered turn uses.
          appendUserTurn: nudgeOf(assembleContext, "impersonateNudge", {
            person: guided?.person,
            ...(macroRegistry !== null ? { registry: macroRegistry } : {}),
          }),
          // new-slot user shape — a draft reads the full canon as context; nothing is written.
          persist: { mode: "new-slot", role: "user" },
          ...(signal !== undefined ? { signal } : {}),
        },
        (text) => bridge.push(text),
      )
      // Close the drain on completion OR failure so the consumer never hangs; a real fault re-throws below.
      .then(() => undefined)
      .finally(() => bridge.close());
    for await (const delta of bridge.drain()) {
      yield { delta };
    }
    // Surface a provider/DB fault (generateText returns cleanly on abort, so this only rethrows a real error).
    await run;
  };
}

/** `generate` — a lock-free auxiliary assistant generation: runs concurrent with a locked `send`. Commits a
 *  new assistant slot for the named speaker (or the primary character). */
function createGenerate(ctx: ChatContext, deps: TurnDeps): ChatService["generate"] {
  return async ({ principal, chatId, speakerCharacterId, intent, guided, afterAssistant }: GenerateParams): Promise<TurnOutcome> => {
    const membership = await requireParticipant(ctx, principal, chatId);
    const {
      room,
      identity,
      connection,
      assembleContext,
      memoryConfig,
      memoryRecall,
      chatBehavior,
      attachedToolNames,
      terminalTools,
      macroRegistry,
      userMacroDraws,
      cardKeepLastX,
    } = await resolveTurnBase(ctx, deps, {
      principal,
      chatId,
      kind: "generate",
      anchorPersonaId: membership.chat.anchorPersonaId,
      trigger: humanTrigger(principal.userId, membership.activePersonaId),
      guided,
    });
    // An EXPLICIT speaker must be a PRESENT cast member of THIS chat — never trust the branded id from the
    // wire to name any character (a bare `speakerShapeFor` silently returns an undefined shape for an unknown
    // id, so an unvalidated foreign CharacterId would commit an assistant canon row attributed to it and leak
    // that character's name+portrait through the message-stamped roster-avatar/name producers = attribution
    // forgery + a cross-tenant identity read). Presence-only (`leftSeq === null`), the forceCharacterTurn
    // sibling (see createForceCharacterTurn) — mute (`disabled`) is NOT respected here: mute governs
    // arbitration SCHEDULING (`isArbiterEligible`) + `{{groupNotMuted}}`, not manual speaker targeting, so a
    // member explicitly generating for a muted seat is legitimate (it does not inherit any host bypass — the
    // host-only bypass is presence of a LEFT member, which this refuses). A non-present / unknown / foreign id
    // is a leak-free NOT_FOUND (never reveals whether the character exists elsewhere), mirroring selectVariant's
    // foreign-variantId refusal.
    let speaker: CharacterId | null;
    if (speakerCharacterId === undefined || speakerCharacterId === null) {
      speaker = primaryCharacterId(room);
    } else {
      const present = room.candidates.some((c) => c.ref.characterId === speakerCharacterId && c.leftSeq === null);
      if (!present) {
        throw new ChatNotFoundError(chatId);
      }
      speaker = speakerCharacterId;
    }
    const shape = speakerShapeFor(room, speaker);
    return await runRegistered(ctx, deps, membership, {
      chatId,
      assembleContext,
      connection,
      triggeredBy: identity.triggeredBy,
      runAsUserId: identity.runAsUserId,
      kind: "generate",
      intent: intent ?? {},
      extraStopSequences: chatBehavior.customStoppingStrings,
      memoryConfig,
      ...(memoryRecall !== null ? { memoryRecall } : {}),
      attachedToolNames,
      terminalTools,
      cardKeepLastX,
      ...recursePatch(membership.chat.metadata.toolRecurseLimit),
      ...prepMacroFields(macroRegistry, userMacroDraws),
      speakerCharacterId: speaker,
      lockFree: true,
      // A Response fired on an ASSISTANT tail (the wand icon on the model's own last line) rides the
      // `responseNudge` trailing-user turn so the reply has something to respond to (rudderless otherwise).
      // A guided steer composes with it (the `guided` injection + this appendUserTurn are independent
      // channels, exactly like continue/impersonate). A USER-tail Response omits it — the user row is the prompt.
      // RENDERED (macro path parity): response carries no `{{person}}` today; the registry render substitutes any
      // `{{user}}/{{char}}` an edited/ST-imported response nudge holds (a safe no-op for the default string).
      ...(afterAssistant === true
        ? { appendUserTurn: nudgeOf(assembleContext, "responseNudge", macroRegistry !== null ? { registry: macroRegistry } : {}) }
        : {}),
      ...(shape !== undefined ? { shape } : {}),
    });
  };
}

/** Restores an assistant slot's selected variant from its continue snapshot: undo drops the last
 *  continuation, revert re-applies it. A never-continued variant is refused `no_continuation`. */
async function restoreContinue(
  ctx: ChatContext,
  emit: TurnDeps["emit"],
  args: {
    readonly chatId: ChatId;
    readonly messageId: MessageId;
    readonly direction: "undo" | "revert";
  },
): Promise<MessageView> {
  const { chatId, messageId, direction } = args;
  // Chat-scoped load: a messageId from another chat matches nothing, so undo/revert can't mutate another room's canon.
  const snap = await loadContinueSnapshot(ctx.db, chatId, messageId);
  if (snap === undefined || snap.preContinueContent === null || snap.lastContinuationContent === null) {
    throw new ChatOperationError(CHAT_OP_CODES.noContinuation, `message ${messageId}: no continuation to ${direction}`);
  }
  const content = direction === "undo" ? snap.preContinueContent : snap.preContinueContent + snap.lastContinuationContent;
  const reasoning = direction === "undo" ? snap.preContinueReasoning : combineReasoning(snap.preContinueReasoning, snap.lastContinuationReasoning);
  await ctx.db.batch(batchMany([setVariantContentStatement(ctx.db, snap.variantId, content, reasoning)]));
  const view = await loadMessageView(ctx.db, messageId);
  if (view === undefined) {
    throw new ChatNotFoundError(chatId);
  }
  await emit({ type: "messageCommitted", chatId, messageId: view.id, view });
  void ctx.emitChatChanged(chatId);
  return view;
}

/** `undoContinue` — revert the last continuation on a slot's variant. The restored slot is an ASSISTANT reply
 *  that may carry hidden spans, so a NON-HOST member's returned view is §3.6-stripped (the bus/list already
 *  strip; this closes the mutation-return sibling). */
function createUndoContinue(ctx: ChatContext, deps: TurnDeps): ChatService["undoContinue"] {
  return async ({ principal, chatId, messageId }: UndoContinueParams): Promise<MessageView> => {
    const membership = await requireParticipant(ctx, principal, chatId);
    const view = await restoreContinue(ctx, deps.emit, { chatId, messageId, direction: "undo" });
    return projectViewReturn(ctx, view, membership);
  };
}

/** `revertContinue` — re-apply the last reverted continuation. §3.6-stripped for a non-host member (same
 *  reason as `undoContinue`: the restored assistant slot may carry hidden spans). */
function createRevertContinue(ctx: ChatContext, deps: TurnDeps): ChatService["revertContinue"] {
  return async ({ principal, chatId, messageId }: RevertContinueParams): Promise<MessageView> => {
    const membership = await requireParticipant(ctx, principal, chatId);
    const view = await restoreContinue(ctx, deps.emit, { chatId, messageId, direction: "revert" });
    return projectViewReturn(ctx, view, membership);
  };
}

// ── pending_turns drain — the host-offline deferred-turn reclaim (Part III §5) ──

/** A drain VERDICT drop — a PERMANENT refusal, so the claimed row stays deleted (never re-queued):
 *   • `consent_required` — the host's D17 consent belt refused a by-proxy hosted turn (an authority verdict).
 *   • `ChatNotFoundError` — the chat/host is gone (nothing left to run).
 *  Everything else RE-QUEUES: `budget_exceeded` is TEMPORAL (a spent window means "not now", not "never" — the
 *  member's owed reply waits for the next drain edge), and a transient fault (provider outage) is a retry.
 *  Drains fire only at boot + host-return edges, so a re-queued row can't hot-loop. */
function isDrainVerdictDrop(err: unknown): boolean {
  return err instanceof ChatNotFoundError || (err instanceof ChatOperationError && err.code === CHAT_OP_CODES.consentRequired);
}

/** Reconstruct + run ONE deferred AI round from a durable `pending_turns` row — no principal, no new user
 *  line: the row's frozen triple (`triggeredBy`/`runAsUserId`) funds it and the engine's in-lock belts
 *  re-validate consent + budget. Throws a coded refusal (→ the drain drops the row) or completes (→ the drain
 *  deletes it). Cards + assemble resolve under the row's frozen host; a mid-defer host-handoff funds the
 *  frozen host per D19. */
async function runDeferredRound(
  ctx: ChatContext,
  deps: TurnDeps,
  row: { readonly chatId: ChatId; readonly triggeredBy: UserId; readonly runAsUserId: UserId },
): Promise<void> {
  const chat = await loadChatRow(ctx.db, row.chatId);
  if (chat === undefined) {
    throw new ChatNotFoundError(row.chatId);
  }
  const room = await loadRoom(ctx, row.chatId); // hostless/gone → ChatNotFoundError (a drop)
  const connection = await deps.resolveConnection({
    runAsUserId: row.runAsUserId,
    chatId: row.chatId,
  });
  const group = chat.metadata.group ?? DEFAULT_GROUP_CONFIG;
  const { assembleContext, memoryConfig, memoryRecall, chatBehavior, attachedToolNames, terminalTools, respondsToLatestUserTurn, cardKeepLastX } =
    await buildTurnContext(ctx, deps, {
      chatId: row.chatId,
      runAsUserId: row.runAsUserId,
      model: connection.model,
      kind: "send",
      castCharacterIds: room.castCharacterIds,

      mutedSpeakerKeys: room.mutedSpeakerKeys,
      personaIds: room.personaIds,
      presentHumanUserIds: room.presentHumanUserIds,
      anchorPersonaId: chat.anchorPersonaId,
      // No live triggering human at drain — {{user}} binds to the chat anchor, not a presence-order human.
      trigger: { kind: "none" },
      // A deferred drain is the FIRST AI response to the offline-host's committed user send (rpg-design/05 §6) —
      // it directly responds to that user message, so its queued d20 still feeds (the die wasn't lost to the defer).
      respondsToLatestUserTurn: true,
      // The Ruling-B host `{{char}}` (joined cast / solo single) for the rpg steeringNote render (chat owns it).
      castCharForHostRow: joinedCastName(room.castNames),
    });
  using handle = deps.activeTurns.register(row.chatId, row.triggeredBy);
  const base: RoundBase = {
    chatId: row.chatId,
    assembleContext,
    connection,
    triggeredBy: row.triggeredBy,
    runAsUserId: row.runAsUserId,
    kind: "send",
    intent: {},
    extraStopSequences: chatBehavior.customStoppingStrings,
    memoryConfig,
    ...(memoryRecall !== null ? { memoryRecall } : {}),
    attachedToolNames,
    terminalTools,
    cardKeepLastX,
    ...recursePatch(chat.metadata.toolRecurseLimit),
    respondsToLatestUserTurn,
    signal: handle.signal,
  };
  await runAiRound(ctx, deps, { base, group, room, signal: handle.signal });
}

/** Process ONE queued row: CLAIM it atomically (the exactly-once serializer), then RUN it · DROP it on a
 *  permanent verdict (the claim already deleted it) · or RE-QUEUE it (re-insert) on `budget_exceeded`/a
 *  transient fault. A lost claim ("skipped") means a concurrent drain owns the row. Isolated — the fault
 *  never escapes the sweep. */
async function drainOne(ctx: ChatContext, deps: TurnDeps, row: { readonly id: PendingTurnId }): Promise<"ran" | "dropped" | "requeued" | "skipped"> {
  // Atomic claim-before-run: the `DELETE … RETURNING` is the ONLY serializer (a drained turn is not
  // lock-held), so the boot reclaim ∥ host-return overlap can't double-run or double-spend a row.
  const claimed = await claimPendingTurn(ctx.db, row.id);
  if (claimed === undefined) {
    return "skipped"; // a concurrent drain already claimed this row.
  }
  try {
    await runDeferredRound(ctx, deps, claimed);
    return "ran";
  } catch (err) {
    if (isDrainVerdictDrop(err)) {
      const reason = err instanceof ChatNotFoundError ? "chat-gone" : "consent";
      await notifyDeferredTurnDropped(ctx, claimed, reason);
      getLog().info({ pendingTurnId: claimed.id, chatId: claimed.chatId, reason, dropped: true }, "chat: deferred turn DROPPED at drain (permanent verdict)");
      return "dropped";
    }
    // budget_exceeded (temporal) or a transient fault → RE-QUEUE (re-insert the claimed row, same frozen
    // triple + createdAt) to retry on the next drain edge. A crash between claim and re-insert loses the row
    // (the member can resend) — cheaper than a double-run.
    await insertPendingTurn(ctx.db, {
      id: claimed.id,
      chatId: claimed.chatId,
      triggeredBy: claimed.triggeredBy,
      runAsUserId: claimed.runAsUserId,
      createdAt: claimed.createdAt,
    });
    getLog().warn(
      { pendingTurnId: claimed.id, chatId: claimed.chatId, err, requeued: true },
      "chat: deferred turn RE-QUEUED at drain (budget window / transient fault)",
    );
    return "requeued";
  }
}

/** Notify the frozen `triggeredBy` member that their host-offline deferred reply was PERMANENTLY dropped
 *  (Part III §5) — mirrors the kick/handoff durable-inbox precedent (verbs/roster.ts). Best-effort: a
 *  cascade-gone recipient/chat can FK-fail the insert, which is logged, not fatal (the drain still consumed
 *  the row). No co-statements — the claim already deleted the row. */
async function notifyDeferredTurnDropped(
  ctx: ChatContext,
  row: { readonly chatId: ChatId; readonly triggeredBy: UserId },
  reason: "consent" | "chat-gone",
): Promise<void> {
  await ctx
    .emitNotification({
      type: "deferred-turn-dropped",
      recipientUserId: row.triggeredBy,
      chatId: row.chatId,
      reason,
    })
    .catch((err: unknown) =>
      getLog().warn({ chatId: row.chatId, triggeredBy: row.triggeredBy, reason, err }, "chat: deferred-turn-dropped notification emit failed (best-effort)"),
    );
}

/** `drainDeferredTurns` — the boot reclaim (`{all:true}`) + host-return (`{hostUserId}`) drain of the durable
 *  `pending_turns` queue. Each row runs through the engine (consent/budget re-validated in-lock) or is
 *  dropped on a re-validation refusal — both consume the row; a transient fault leaves it queued. Rows drain
 *  oldest-first + SEQUENTIALLY (each takes the per-chat lock + spends the host budget). */
function createDrainDeferredTurns(ctx: ChatContext, deps: TurnDeps): ChatService["drainDeferredTurns"] {
  return async (scope: DrainDeferredTurnsScope): Promise<DrainReport> => {
    const rows = "all" in scope ? await loadPendingTurnsForReclaim(ctx.db) : await loadPendingTurnsForHost(ctx.db, scope.hostUserId);
    let ran = 0;
    let dropped = 0;
    for (const row of rows) {
      // biome-ignore lint/performance/noAwaitInLoops: deferred turns drain SEQUENTIALLY — each acquires the per-chat lock + spends the host's count budget; a parallel sweep would race the lock + the limiter.
      const outcome = await drainOne(ctx, deps, row);
      if (outcome === "ran") {
        ran += 1;
      } else if (outcome === "dropped") {
        dropped += 1;
      }
    }
    return { ran, dropped };
  };
}

// ── requestTurn — the NON-HUMAN turn seam (automation-design/03 §4 / 05 §AC-B) ──

/**
 * `requestTurn` — run an autonomous chat turn on behalf of a NON-HUMAN initiator (an automation rule / a
 * plugin). The FOUR WALLS, none optional:
 *   1. DEPTH (loop-prevention) — refuse a stamp DEEPER than {@link AUTOMATION_DEPTH_HARD_CAP} (the write-side
 *      belt for a non-dispatch caller; automation's dispatch already bounds its own path), and thread
 *      `initiator`/`automationDepth` onto the reply slot so the reply's events resolve their cascade depth.
 *   2. AUTHORITY (cross-tenant) — the funder must be a PRESENT participant of the chat, else a leak-free
 *      NOT_FOUND (a user with no membership cannot fund a turn on it). The funding host is resolved from the
 *      ROOM, never a caller-supplied id.
 *   3. BUDGET — the engine's per-member `debitTurnBudget(triggeredBy)` runs unchanged inside the round (no free
 *      turn); automation's own §3 spend gate runs in the arm ABOVE this.
 *   4. CONSENT (D17) — the engine's `assertMaxProSubConsent` belt refuses a by-proxy hosted (`max-pro-sub`) turn
 *      without explicit owner consent (fail-closed). requestTurn re-implements NEITHER belt — it routes the
 *      triple (`triggeredBy` = funder, `runAsUserId` = host) through the engine so both fire.
 * Drives ONE round (no auto-mode AI→AI chain — an autonomous trigger is a single injected beat), forcing the
 * named speaker (coerced per-speaker) or arbitrating. A coded refusal (consent/budget/lock/depth) propagates to
 * the caller; the automation arm maps it to a typed refusal.
 */
/** The resolved substrate a `requestTurn` round runs on — produced only after WALLS 1+2 pass. */
interface RequestTurnResolved {
  readonly chat: NonNullable<Awaited<ReturnType<typeof loadChatRow>>>;
  readonly room: Room;
  readonly connection: ResolvedConnection;
  readonly identity: { readonly triggeredBy: UserId; readonly runAsUserId: UserId };
}

/** requestTurn WALLS 1+2 + room/host/connection resolution. Throws the coded refusal on any wall breach; else
 *  returns the resolved substrate. Split out so the round-driver closure stays under the complexity bar. */
async function resolveRequestTurn(ctx: ChatContext, deps: TurnDeps, params: RequestTurnParams): Promise<RequestTurnResolved> {
  const { chatId, initiator, funderUserId, automationDepth } = params;
  // WALL 1 (write side). `"human"` is never a requestTurn origin (it would forge a human turn); refuse it.
  if (initiator === "human") {
    throw new ChatOperationError(CHAT_OP_CODES.forbiddenOverride, `chat ${chatId}: requestTurn cannot stamp a 'human' initiator`);
  }
  if (automationDepth > AUTOMATION_DEPTH_HARD_CAP) {
    throw new ChatOperationError(
      CHAT_OP_CODES.cascadeDepthExceeded,
      `chat ${chatId}: turn depth ${automationDepth} exceeds the cascade cap ${AUTOMATION_DEPTH_HARD_CAP}`,
    );
  }
  const chat = await loadChatRow(ctx.db, chatId);
  if (chat === undefined) {
    throw new ChatNotFoundError(chatId);
  }
  // Resolves the FUNDING host from canon (never a caller-supplied id); hostless is unusable (leak-free).
  const room = await loadRoom(ctx, chatId);
  // WALL 2 — the funder must be a PRESENT participant (leak-free NOT_FOUND). The upstream callers additionally
  // require HOST (automation's holdsAuthority; the membrane's canWrite); this is the defense-in-depth backstop.
  if ((await loadPresentRole(ctx.db, chatId, funderUserId)) === null) {
    throw new ChatNotFoundError(chatId);
  }
  // The identity triple: runAsUserId = the host box (funds), triggeredBy = the funder (attribution/abort/the
  // D17 by-proxy subject). WALL 3 (budget) + WALL 4 (consent) enforce on this triple inside `engine.runTurn`.
  const identity = { triggeredBy: funderUserId, runAsUserId: room.hostUserId };
  const connection = await deps.resolveConnection({ runAsUserId: identity.runAsUserId, chatId });
  return { chat, room, connection, identity };
}

export function createRequestTurn(ctx: ChatContext, deps: TurnDeps): RequestTurnOp {
  return async (params: RequestTurnParams): Promise<TurnOutcome> => {
    const { chatId, initiator, automationDepth, speakerCharacterId, guided } = params;
    const { chat, room, connection, identity } = await resolveRequestTurn(ctx, deps, params);
    // A forced speaker coerces the round to per-speaker so a narrator room still voices the named character.
    const baseGroup = chat.metadata.group ?? DEFAULT_GROUP_CONFIG;
    const group = speakerCharacterId !== undefined ? asPerSpeaker(baseGroup) : baseGroup;
    const { assembleContext, memoryConfig, memoryRecall, chatBehavior, attachedToolNames, terminalTools, respondsToLatestUserTurn, cardKeepLastX } =
      await buildTurnContext(ctx, deps, {
        chatId,
        runAsUserId: identity.runAsUserId,
        model: connection.model,
        kind: "auto",
        castCharacterIds: room.castCharacterIds,

        mutedSpeakerKeys: room.mutedSpeakerKeys,
        personaIds: room.personaIds,
        presentHumanUserIds: room.presentHumanUserIds,
        anchorPersonaId: chat.anchorPersonaId,
        // No live triggering human — {{user}} binds to the chat anchor, not a presence-order human.
        trigger: { kind: "none" },
        ...(guided !== undefined ? { guided } : {}),
        // The Ruling-B host `{{char}}` (joined cast / solo single) for the rpg steeringNote render (chat owns it).
        castCharForHostRow: joinedCastName(room.castNames),
      });
    using handle = deps.activeTurns.register(chatId, identity.triggeredBy);
    const base: RoundBase = {
      chatId,
      assembleContext,
      connection,
      triggeredBy: identity.triggeredBy,
      runAsUserId: identity.runAsUserId,
      kind: "auto",
      // The turn origin (03 §4) — the engine stamps both onto the new-slot reply; `getTurnOrigin` reads them
      // back for the cascade guard. NEVER a bus-event field (the D19/D50 allowlist).
      initiator,
      automationDepth,
      intent: {},
      extraStopSequences: chatBehavior.customStoppingStrings,
      memoryConfig,
      ...(memoryRecall !== null ? { memoryRecall } : {}),
      attachedToolNames,
      terminalTools,
      cardKeepLastX,
      ...recursePatch(chat.metadata.toolRecurseLimit),
      respondsToLatestUserTurn,
      signal: handle.signal,
    };
    return await runAiRound(ctx, deps, {
      base,
      group,
      room,
      signal: handle.signal,
      chain: false,
      ...(speakerCharacterId !== undefined ? { forcedIds: [speakerCharacterId] } : {}),
    });
  };
}

/** The turn-running verb bundle the root spreads into the full service. `opening`/`generateOpening` stays
 *  internal (injected into `startChat`, not on `ChatService`); the engine path is a `kind:"opening"` runTurn
 *  with the opening instruction on `appendUserTurn`. */
export function createTurn(ctx: ChatContext, deps: TurnDeps): TurnVerbs {
  // Built once so `send`'s PD-146 post-round auto-behaviors re-enter the SAME swipe/continue verbs the
  // service exposes (one home; the follow-ups clear every belt exactly like a manual swipe/continue).
  const swipe = createSwipe(ctx, deps);
  const continueTurn = createContinueTurn(ctx, deps);
  return {
    send: createSend(ctx, deps, { swipe, continueTurn }),
    commitMessage: createCommitMessage(ctx, deps),
    forceCharacterTurn: createForceCharacterTurn(ctx, deps),
    abort: createAbort(ctx, deps),
    swipe,
    continueTurn,
    impersonateStream: createImpersonateStream(ctx, deps),
    generate: createGenerate(ctx, deps),
    undoContinue: createUndoContinue(ctx, deps),
    revertContinue: createRevertContinue(ctx, deps),
    drainDeferredTurns: createDrainDeferredTurns(ctx, deps),
  };
}
