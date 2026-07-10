// domain/chat/verbs/turn — the turn-running FRONT DOORS. Each verb wires the DONE pieces into the lifecycle:
//   gate (`ctx.can` via guard) → resolve the D19 identity TRIPLE → resolve the connection → build the ONE
//   immutable assemble ctx → arbitrate the speaker(s) → drive the round (per-turn-locked) → return the outcome.
// Group-ness is DATA (roster size + arbitration), never a branch — solo is a roster-of-1 through the SAME path
// (`no-if(isGroup)`, D16). The triple is NEVER `callerUserId` (D19 — the `no-caller-user-id` gate): the caller
// is `principal.userId`, `runAsUserId` is the host (read from the roster), `triggeredBy` is the responsible
// human (the caller for a direct send; the chain-starter for an auto-mode turn).
//
// THE BUNDLE (the `verb-naming` gate — ONE `createTurn(ctx, deps)` factory; `deps` is the second arg): the
// round-driving / control verbs `send` (+ the group round + auto-mode chain; solo IS a send — a roster-of-1
// round, D16), `forceCharacterTurn` (host-only), `abort` (the active-turns registry); PLUS the auxiliary
// single-speaker turns the engine MODES (D26) now back: `swipe`/regenerate (append-variant), `continueTurn`
// (+ `undoContinue`/`revertContinue` restore), `impersonate` (a `role:"user"` slot), and the LOCK-FREE
// generate`. Every generating verb threads the active-turns abort signal into the engine (abort propagation).
// D53 step 2: SEND USER_INPUT regex runs in the producer (the
// post-regex row is persisted via the `SendRegexSink`); the host-tier scripts are the union the GATHER computes
// (`gatherAssembleContext` → `resolveHostTierRegexScripts`) onto the assemble ctx (RECEIVE applies AI_OUTPUT/
// REASONING in the pipeline). GUIDED (PD-63 routed): every generating verb threads its `guided`
// steer into the GATHER; the BUILD resolves the action template ONCE (macro-neutralized `{{input}}`) and
// delivers it via EXACTLY ONE placement — the `{{guided_instruction}}` system-marker (the per-action config
// default) or a depth-0 in_chat injection (role per the config/steer — the message-role axis, never pinned).
//
// DEPS NOT ON `ChatContext` (the second factory arg — the `invites.ts`/`roster.ts` precedent; FLAG
// [turn-deps-not-on-ctx], all SHOULD be wired at the composition root):
//   • engine             — the built `TurnEngine` (`engine/createTurnEngine` at the root; locked per turn).
//   • activeTurns        — the in-memory controller registry (`active-turns.ts`; one instance per replica).
//   • emit               — the chat bus (chat's own collaborator; NOT a ctx field — see bus.ts).
//   • prng               — the SEEDED PRNG (`() => number`, D46) the arbitration consumes (never `Math.random`).
//   • delay              — the auto-mode inter-turn delay (D46; tests pass a no-op, prod a real timer).
//   • resolveConnection  — `connection.resolveChat` + the `RoutableChat` derivation from the chat row (the root
//                          binds it; `ctx.resolveChat` needs a `RoutableChat` the chat-row→routable mapping
//                          builds — FLAG[routable-derivation]).
//   • resolveForeignInputs — the FOREIGN half of the assemble ctx (preset `promptConfig`, the resolved personas,
//                          the host-global regex set, the WI scan-depth, the injection budget, the memory
//                          config) — settings/preset/persona reads chat must NOT perform (contract/
//                          foreign.ts; entry.md invariant 1). It takes chat-supplied KEYS (runAsUserId, the
//                          anchor + active persona ids) and returns RESOLVED DATA. The CHAT-INTERNAL half
//                          (canon/injections/variables/metadata/memory/regex-tier union) `gatherAssembleContext`
//                          reads ITSELF via `ChatContext`; the verb fills cast/persona-ids/pending text.

import type {
  AssembleContext,
  ChatBusEvent,
  GroupConfig,
  MessageView,
  SpeakerRef,
} from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG, isAiDriven, speakerKey } from "@orb/contracts/chat";
import type { ResolvedConnection } from "@orb/contracts/connection";
import type { GenerationType } from "@orb/contracts/preset";
import { batchMany, isConstraintViolation } from "@orb/db/kit";
import type { CharacterId, ChatId, MessageId, PersonaId, UserId } from "@orb/kit/ids";
import type { ActiveTurns } from "../contract/active-turns";
import type { ArbiterCandidate, AutoModeResult, CastName } from "../contract/arbitration";
import type { ChatContext } from "../contract/context";
import { CHAT_OP_CODES, ChatNotFoundError, ChatOperationError } from "../contract/errors";
import type { ResolveForeignInputsOp } from "../contract/foreign";
import type { MemoryConfig } from "../contract/memory";
import type {
  AbortParams,
  ContinueTurnParams,
  ForceCharacterTurnParams,
  GenerateParams,
  GuidedSteer,
  ImpersonateParams,
  RevertContinueParams,
  SendParams,
  SwipeParams,
  UndoContinueParams,
} from "../contract/params";
import type { TurnEngine, TurnKind, TurnOutcome, TurnPrep } from "../contract/results";
import type { ChatService } from "../contract/service";
import { requireHost, requireParticipant } from "../guard";
import {
  buildCommittedMessageView,
  combineReasoning,
  insertCanonMessageStatements,
  setVariantContentStatement,
} from "../persistence/canon-write";
import {
  loadCanonHistory,
  loadContinueSnapshot,
  loadMaxMessageSeq,
  loadMessageView,
  loadSlotTarget,
} from "../persistence/queries";
import { loadRoster } from "../persistence/roster";
import { gatherAssembleContext } from "../substrate/assemble-gather";
import { freezeVolatileMacros } from "../substrate/assembly-access";
import { userMessageDelta } from "../substrate/stats-delta";
import {
  driveRoundVia,
  resolveMentionsVia,
  resolveTurnIdentityVia,
  runAutoModeVia,
  selectSpeakersVia,
  smartArbitrateVia,
} from "../substrate/turn-access";

/** The SEND USER_INPUT regex out-param sink — `buildAssembleContext` writes the post-regex user
 *  text here so the verb persists THAT (the haystack + the stored row never diverge). Structural — the local
 *  `SendRegexResult` in `assembly/context.ts` is file-local (the `types-in-contract` gate). */
interface SendRegexSink {
  sendUserText?: string;
}

/** The shared per-round identity + ctx the driver reuses by reference (the bridge's `base` shape — derived). */
type RoundBase = Parameters<typeof driveRoundVia>[0]["base"];

/** The collaborators not on `ChatContext` (the second factory arg — file header FLAG[turn-deps-not-on-ctx]). */
interface TurnDeps {
  readonly engine: TurnEngine;
  readonly activeTurns: ActiveTurns;
  readonly emit: (event: ChatBusEvent) => Promise<void>;
  readonly prng: () => number;
  readonly delay: (ms: number) => Promise<void>;
  readonly resolveConnection: (args: {
    readonly runAsUserId: UserId;
    readonly chatId: ChatId;
  }) => Promise<ResolvedConnection>;
  /** The FOREIGN half of the assemble ctx (preset/persona/settings) resolved at the composition root from
   *  chat-supplied KEYS (contract/foreign.ts). The CHAT-INTERNAL half is gathered by `gatherAssembleContext`. */
  readonly resolveForeignInputs: ResolveForeignInputsOp;
}

/** The turn-running slice of `ChatService` this grouped file owns (the bundle the root spreads in). */
type TurnVerbs = Pick<
  ChatService,
  | "send"
  | "forceCharacterTurn"
  | "abort"
  | "swipe"
  | "continueTurn"
  | "impersonate"
  | "generate"
  | "undoContinue"
  | "revertContinue"
>;

/** How many trailing canon rows feed the `smart` arbiter's transcript. */
const RECENT_TRANSCRIPT = 10;

/** The synthetic trailing-user nudges: the UNSTEERED continue/impersonate
 *  baseline, riding `appendUserTurn`. A `guided` steer COMPOSES with these (the nudge says WHAT the turn is;
 *  the steer adds the user's one-turn guidance via its placement). No magic strings (one home). */
const CONTINUE_NUDGE =
  "[Continue the previous message from exactly where it left off, without repeating it.]";
const IMPERSONATE_NUDGE = "[Write the next message as the user, in the user's own voice.]";

/** The roster-derived turn substrate: the host (the D19 funding id), the character candidates (arbitration),
 *  their display names (`@mention` + name-stamp), the full present cast (WI cards), and the present personas. */
interface Room {
  readonly hostUserId: UserId;
  readonly candidates: readonly ArbiterCandidate[];
  readonly castNames: readonly CastName[];
  readonly castCharacterIds: readonly CharacterId[];
  readonly personaIds: readonly PersonaId[];
}

/** Load the present roster → the {@link Room}. The host is `role='host'` (D18 — the ONE authority + funding
 *  source); a hostless room is unusable (a leak-free NOT_FOUND). Cards read under the host's ownership (D28). */
async function loadRoom(ctx: ChatContext, chatId: ChatId): Promise<Room> {
  const roster = await loadRoster(ctx.db, chatId);
  const hostUserId = roster.find((r) => r.role === "host" && r.userId !== null)?.userId ?? null;
  if (hostUserId === null) {
    throw new ChatNotFoundError(chatId);
  }
  // Arbiter candidates = the present AI-driven seats (doc 02 §1.1 — `isAiDriven`). v1 seats only characters;
  // agent seats (also AI-driven, userId-backed) join at AP3 when `resolveAgentSpeaker` (doc 04 §5) can name
  // them — the ref plumbing (D60) is already agent-ready here, so this stays byte-identical until then.
  const aiRows = roster.filter((r) => isAiDriven(r.kind));
  const charRows = aiRows.flatMap((r) =>
    r.kind === "character" && r.characterId !== null ? [{ ...r, characterId: r.characterId }] : [],
  );
  const cards = await Promise.all(
    charRows.map((r) => ctx.getCard({ ownerId: hostUserId, characterId: r.characterId })),
  );
  // PD-70 cast-gating: an OFFLINE human's persona drops from the present-cast set for this round — their
  // persona-book world-info stops joining the pool (the "presence → injected WI/persona" spoof surface;
  // `presence.read` is server-derived SSE liveness, never a client-asserted heartbeat). No host/anchor
  // special-case: the anchor {{user}} POV is a SEPARATE pinned field (`chats.anchorPersonaId`), resolved
  // independently, so whoever the host pinned survives regardless of their liveness — gated uniformly here.
  const humanPersonas = roster.flatMap((r) =>
    r.kind === "human" && r.userId !== null && r.activePersonaId !== null
      ? [{ userId: r.userId, personaId: r.activePersonaId }]
      : [],
  );
  const online = await Promise.all(
    humanPersonas.map((h) => ctx.readPresence(h.userId).then((p) => p.online)),
  );
  const personaIds = humanPersonas.filter((_h, i) => online[i]).map((h) => h.personaId);
  return {
    hostUserId,
    candidates: charRows.map((r) => ({
      ref: { kind: "character", characterId: r.characterId },
      talkativeness: r.talkativeness,
      disabled: r.disabled,
      leftSeq: r.leftSeq,
    })),
    castNames: charRows.map((r, i) => ({
      ref: { kind: "character", characterId: r.characterId },
      name: cards[i]?.name ?? "",
    })),
    castCharacterIds: charRows.map((r) => r.characterId),
    personaIds,
  };
}

/** The primary character id (the roster's first cast seat) — the solo/single-speaker default speaker. Null when
 *  the first seat is not a character (v1 cast lists are character-only, so this is null only for an empty cast). */
function primaryCharacterId(room: Room): CharacterId | null {
  const first = room.castNames[0]?.ref;
  return first !== undefined && first.kind === "character" ? first.characterId : null;
}

/** The joined present-cast name (narrator `{{char}}`-as-cast — collapses to the single name at cast=1). */
function joinedCastName(castNames: readonly CastName[]): string {
  return castNames
    .map((c) => c.name)
    .filter((n) => n.length > 0)
    .join(", ");
}

/** The last-assistant speaker (ban-last seed) + a recent transcript (the `smart` arbiter reads it). The seed is
 *  a speaker ref: a character turn keys on its `characterId`, an agent turn on its `authorUserId` (doc 02 §2). */
async function canonFacts(
  ctx: ChatContext,
  chatId: ChatId,
): Promise<{ lastSpeaker: SpeakerRef | null; recentHistory: string }> {
  const canon = await loadCanonHistory(ctx.db, chatId);
  return {
    lastSpeaker: lastSpeakerRef(canon.findLast((m) => m.role === "assistant")),
    recentHistory: canon
      .slice(-RECENT_TRANSCRIPT)
      .map((m) => m.content)
      .join("\n"),
  };
}

/** The ban-last speaker ref for the last assistant row: its `characterId` (a character/narrator turn) or its
 *  `authorUserId` (an agent's self-attributed turn — doc 02 §2); null when there is no prior assistant turn. */
function lastSpeakerRef(
  row:
    | { readonly characterId: CharacterId | null; readonly authorUserId: UserId | null }
    | undefined,
): SpeakerRef | null {
  if (row === undefined) {
    return null;
  }
  if (row.characterId !== null) {
    return { kind: "character", characterId: row.characterId };
  }
  return row.authorUserId !== null ? { kind: "agent", userId: row.authorUserId } : null;
}

/** The built turn context + the resolved host memory config threaded onto every `TurnPrep`. `memoryConfig` is
 *  the SAME `ForeignInputs.memoryConfig` recall reads (memoryDefaults ⊕ the host D36 opt-out → `mode:"off"`) —
 *  one source of truth: the engine's post-turn build honors the host's memory enable/tuning off THIS value. */
interface BuiltTurnContext {
  readonly assembleContext: AssembleContext;
  readonly memoryConfig: MemoryConfig | null | undefined;
}

/** The turn's driving {@link TurnKind} → the ST `injection_trigger` {@link GenerationType} gate (F1). Exhaustive
 *  Record (§5.5 — a new `TurnKind` fails `tsc` here, never silently defaults). `send`/`generate`/`force`/`auto`/
 *  `opening` are fresh generations ⇒ `"normal"`; the aux kinds carry their own gate so trigger-gated preset
 *  sections (`trigger:["continue"]`, `trigger:["swipe"]`, …) fire on the matching turn kind and NOT on the rest.
 *  (`regenerate`/`quiet` are `GenerationType`s with no `TurnKind`: regenerate is a `swipe` on the tail; quiet has
 *  no live verb — both stay unreachable by construction.) */
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

/** Build the ONE immutable assemble ctx for the round: resolve the FOREIGN half (preset/persona/settings) from
 *  chat-supplied KEYS, then GATHER the chat-internal half + BUILD the pure ctx (`gatherAssembleContext`). The
 *  chat-owned data (canon/injections/variables/metadata/memory/regex-tier) the gather reads ITSELF. Returns the
 *  built ctx PLUS the resolved memory config (`foreign.memoryConfig`) so the caller threads the SAME resolution
 *  recall uses onto the `TurnPrep` (the engine's build side honors the D36 opt-out — one source, no re-derive). */
async function buildTurnContext(
  ctx: ChatContext,
  deps: TurnDeps,
  args: {
    readonly chatId: ChatId;
    readonly runAsUserId: UserId;
    readonly model: string;
    /** The driving turn kind — mapped to the ST `injection_trigger` `GenerationType` gate (F1). */
    readonly kind: TurnKind;
    readonly castCharacterIds: readonly CharacterId[];
    readonly personaIds: readonly PersonaId[];
    readonly anchorPersonaId: PersonaId | null;
    /** The TRIGGERING human's active persona (whose turn drives this assemble) — binds prompt-config
     *  `{{user}}`'s `active` to the speaker, not `personaIds[0]` (the presence-order-arbitrary first human). */
    readonly triggerPersonaId?: PersonaId | null | undefined;
    readonly pendingUserText?: string | undefined;
    readonly guided?: GuidedSteer | undefined;
  },
  /** SEND sink — when present + the round resolves host-tier scripts, the gather's `buildAssembleContext` writes
   *  the post-USER_INPUT-regex user text here for the verb to PERSIST. */
  out?: SendRegexSink,
): Promise<BuiltTurnContext> {
  const foreign = await deps.resolveForeignInputs({
    chatId: args.chatId,
    runAsUserId: args.runAsUserId,
    model: args.model,
    anchorPersonaId: args.anchorPersonaId,
    personaIds: args.personaIds,
    triggerPersonaId: args.triggerPersonaId,
  });
  const assembleContext = await gatherAssembleContext(
    ctx,
    {
      chatId: args.chatId,
      runAsUserId: args.runAsUserId,
      model: args.model,
      castCharacterIds: args.castCharacterIds,
      personaIds: args.personaIds,
      generationType: GENERATION_TYPE_FOR_KIND[args.kind],
      // D46: the seeded turn PRNG drives the config-plane `randomPick` draw (deterministic, replayable).
      prng: deps.prng,
      ...(args.pendingUserText !== undefined ? { pendingUserText: args.pendingUserText } : {}),
      ...(args.guided !== undefined ? { guided: args.guided } : {}),
    },
    foreign,
    out,
  );
  return { assembleContext, memoryConfig: foreign.memoryConfig };
}

/** Persist a user message (a fresh slot + its one variant — D26) and emit `messageCommitted`. FLAG[send-regex]
 *  RESOLVED (D53 step 2): the SEND-context USER_INPUT regex pass runs inside `buildAssembleContext`
 *  and the CALLER passes the post-regex text as `content` (via the `SendRegexSink`) — this fn persists exactly
 *  what it is handed (the host-tier 3-source union is computed by the GATHER — `resolveHostTierRegexScripts`).
 *
 *  U1 (seq TOCTOU): the user-row seq is allocated from `loadMaxMessageSeq` OUTSIDE the engine's per-chat lock
 *  (the lock guards the AI turn, acquired later in the round — engine.ts). Two concurrent same-chat sends
 *  (multi-human D16 / a double-click; transport does NOT serialize per chat) can read the same head and collide
 *  on the `messages (chatId, seq)` UNIQUE. The seq read + insert lives here and retries ONCE on that unique
 *  violation: the loser re-derives the now-higher head and re-mints fresh ids. The first (failed) batch is
 *  atomic and rolls back BEFORE any emit, so the retry double-commits nothing. A second collision on the retry
 *  (a third simultaneous writer) surfaces the raw error — astronomically unlikely, never silently swallowed. */
async function persistUserMessage(
  ctx: ChatContext,
  emit: TurnDeps["emit"],
  args: {
    readonly chatId: ChatId;
    readonly content: string;
    readonly authorUserId: UserId;
    readonly personaId: PersonaId | null;
    /** The frozen host (D19) — the stats OWNER (the host's box funds/owns the canon). */
    readonly hostUserId: UserId;
  },
): Promise<MessageView> {
  const now = ctx.now();
  // ONE seq-allocate-and-insert attempt: read the current head, mint fresh ids, commit the atomic 3-step batch.
  // Throws the raw batch error (the `(chatId, seq)` UNIQUE on a raced head) — the caller decides whether to retry.
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
      variant: { content: args.content },
    };
    const statements = insertCanonMessageStatements(ctx.db, params);
    // The canon-mutator stats push: the user turn's rollup delta rides the SAME batch as its
    // canon insert. characterId null — the rebuild's per-char grain is assistant-only.
    ctx.applyStatsDelta(
      statements,
      ctx.db,
      userMessageDelta({ ownerId: args.hostUserId, characterId: null, content: args.content, now }),
    );
    await ctx.db.batch(batchMany(statements));
    return buildCommittedMessageView(params);
  };
  const view = await attempt().catch((err: unknown) => {
    // Retry ONCE, and ONLY on the raced `(chatId, seq)` UNIQUE (a concurrent send won the head; the failed
    // batch rolled back atomically before any emit). Any other constraint (a minted-id PK — impossible; an FK)
    // rethrows — this is not a general swallow. A second collision on the retry surfaces raw.
    if (isConstraintViolation(err)?.kind === "unique") {
      return attempt();
    }
    throw err;
  });
  await emit({ type: "messageCommitted", chatId: args.chatId, messageId: view.id, view });
  // PD user-bus lane: the user row moved chat-list recency → fan `chatsChanged` to every present human member
  // (cross-device + multi-human). List-only (no `detail`) — the per-chat bus drives the OPEN chat's detail.
  void ctx.emitChatChanged(args.chatId);
  return view;
}

/** Arbitrate WHO speaks (7a sync / 7b smart side-LLM). An `@mention`/forced target HARD-overrides any policy
 *  (routed to the sync path, which honors forced first — §6); `smart` (no forced) runs the side-LLM. Maps the
 *  resolved ids back to their cast names (the SHAPE name-stamp + the round driver consume `CastName`). */
async function arbitrate(
  ctx: ChatContext,
  deps: TurnDeps,
  args: {
    readonly group: GroupConfig;
    readonly candidates: readonly ArbiterCandidate[];
    readonly castNames: readonly CastName[];
    readonly forcedIds?: readonly CharacterId[] | undefined;
    readonly lastSpeaker: SpeakerRef | null;
    readonly recentHistory: string;
    readonly maxSpeakers?: number | undefined;
  },
): Promise<CastName[]> {
  const forced = args.forcedIds ?? [];
  let refs: readonly SpeakerRef[];
  if (args.group.policy === "smart" && forced.length === 0) {
    refs = await smartArbitrateVia({
      summarize: ctx.summarize,
      candidates: args.candidates,
      castNames: args.castNames,
      recentHistory: args.recentHistory,
      lastSpeaker: args.lastSpeaker,
      rng: deps.prng,
    });
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
  return refs.flatMap((ref) => {
    const c = byKey.get(speakerKey(ref));
    return c !== undefined ? [c] : [];
  });
}

/** Coerce a room config to `per-speaker` for a single forced character (force targets ONE character, never the
 *  narrator cast collapse — so a narrator room still forces a per-speaker turn for the named character). */
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

/** Run the auto-mode AI→AI chain after a human-triggered round: re-arbitrate ONE speaker
 *  per iteration (ban-last unless `allowSelfResponses`), drive a single-speaker round, repeat to the dual bound
 *  / interrupt / no-eligible / lock. Every chained turn is `triggeredBy` the chain-starter (the `base` carries
 *  it — D19); the abort signal stops it at the next checkpoint (FLAG[abort-into-engine] — engine turns aren't
 *  yet interruptible mid-generation). */
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
      const facts = await canonFacts(ctx, args.base.chatId);
      const speakers = await arbitrate(ctx, deps, {
        group: args.group,
        candidates: args.room.candidates,
        castNames: args.room.castNames,
        lastSpeaker: args.group.allowSelfResponses ? null : last,
        recentHistory: facts.recentHistory,
        maxSpeakers: 1,
      });
      return speakers[0] ?? null;
    },
    runTurn: async (speaker) =>
      await driveRoundVia({
        engine: deps.engine,
        base: { ...args.base, kind: "auto" },
        group: args.group,
        speakers: [speaker],
        groupCharacterId: args.groupCharacterId,
        castName: args.castName,
      }),
  });
}

/**
 * Task #77 / D51 — the GREETING FIRST-USER-TURN volatile freeze. When the first user message locks the
 * conversation in, bake each greeting's nondeterministic macros (`{{roll}}`/`{{time}}`/…) against the turn's
 * pinned clock + seeded PRNG so they stop shipping the literal `{{roll}}` to the model (and every viewer)
 * forever. IDENTITY macros (`{{char}}`/`{{user}}`/`{{persona}}`) pass through RAW — they stay per-view /
 * resolved-at-read (the anchor-addressed greeting, ruling A), so the anchor can still change and re-resolve.
 *
 * OWNER RULING: freeze the SELECTED variant of each pre-first-turn assistant (greeting) row. IDEMPOTENT — a
 * frozen row carries no volatile macros left, so freezing it again produces byte-identical content and emits
 * NO write (the guard skips unchanged rows). That idempotency also makes it safe under the concurrent-send
 * retry (U1): two simultaneous "first" sends both freeze to the same bytes, never a double-mutation.
 *
 * STOP-REPORT (the deferred swipe edge, owner-flagged): only the SELECTED variant freezes at this ONE first
 * turn. A later swipe of a committed greeting to a different (unfrozen) alternate leaves that alternate's
 * volatiles raw — there is no subsequent "first turn" to re-freeze it. And the frozen rows are not re-emitted
 * on the bus here, so a client showing a raw greeting sees the frozen value only on its next refetch (a
 * greeting rarely carries a volatile; #73's names-only render already keeps a raw greeting cache-stable).
 */
async function freezeGreetingVolatiles(
  ctx: ChatContext,
  deps: TurnDeps,
  assembleContext: AssembleContext,
  priorCanon: readonly MessageView[],
): Promise<void> {
  const stmts = priorCanon.flatMap((m) => {
    if (m.role !== "assistant") {
      return [];
    }
    const frozen = freezeVolatileMacros(m.content, assembleContext, { random: deps.prng });
    return frozen === m.content
      ? []
      : [setVariantContentStatement(ctx.db, m.selectedVariantId, frozen, m.reasoning)];
  });
  if (stmts.length > 0) {
    await ctx.db.batch(batchMany(stmts));
  }
}

// ── send (the human turn → arbitration → round → optional auto-mode chain) ──────────────────────────────────
/** `send` — persist the user message, build the ONE immutable assemble ctx, arbitrate the responders, drive the
 *  round, then (if `autoMode`) chain AI→AI. Member-gated (anyone present posts); the AI turns run as the host. */
function createSend(ctx: ChatContext, deps: TurnDeps): ChatService["send"] {
  return async ({
    principal,
    chatId,
    content,
    personaId,
    intent,
    guided,
  }: SendParams): Promise<TurnOutcome> => {
    const membership = await requireParticipant(ctx, principal, chatId);
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

    // The ONE immutable assemble ctx — built with the pending user text in the WI haystack (two-phase, §3.4)
    // BEFORE the user row commits; the engine reloads canon (incl. the committed row) for the wire history. The
    // SEND USER_INPUT regex runs INSIDE the producer and writes the post-regex text to `sendOut`.
    const sendOut: SendRegexSink = {};
    const { assembleContext, memoryConfig } = await buildTurnContext(
      ctx,
      deps,
      {
        chatId,
        runAsUserId: identity.runAsUserId,
        model: connection.model,
        kind: "send",
        castCharacterIds: room.castCharacterIds,
        personaIds: room.personaIds,
        anchorPersonaId: membership.chat.anchorPersonaId,
        // Prompt-config `{{user}}` = the TRIGGERING human's persona (this send's author) — the SAME id the
        // user row is stamped with below (an explicit param wins, else the sender's active persona), never
        // `personaIds[0]`.
        // biome-ignore lint/nursery/useNullishCoalescing: `??` would coalesce an EXPLICIT null into the active persona — only an omitted (undefined) param falls back (mirrors the row-stamp expression below).
        triggerPersonaId: personaId !== undefined ? personaId : membership.activePersonaId,
        pendingUserText: content,
        guided,
      },
      sendOut,
    );

    // Task #77 / D51: a greeting's VOLATILE macros ({{roll}}/{{time}}/…) freeze at the FIRST USER TURN (the
    // send that locks the conversation in — the greeting is malleable/swipeable until then). Detect it BEFORE
    // this send commits (no `role:"user"` row exists yet), then bake the greetings after the row lands.
    const priorCanon = await loadCanonHistory(ctx.db, chatId);
    const isFirstUserTurn = !priorCanon.some((m) => m.role === "user");

    const userView = await persistUserMessage(ctx, deps.emit, {
      chatId,
      // The POST-USER_INPUT-regex text (canon-mutating at write — §7); raw `content` when no host script fired.
      content: sendOut.sendUserText ?? content,
      authorUserId: principal.userId,
      // PD-100 attribution fallback: an OMITTED personaId stamps the acting participant's active persona
      // (the membership row assembly already reads); an explicit id — or an explicit null — wins.
      // biome-ignore lint/nursery/useNullishCoalescing: `??` would coalesce an EXPLICIT null into the active persona — only an omitted (undefined) param falls back.
      personaId: personaId !== undefined ? personaId : membership.activePersonaId,
      hostUserId: room.hostUserId,
    });

    if (isFirstUserTurn) {
      await freezeGreetingVolatiles(ctx, deps, assembleContext, priorCanon);
    }

    const facts = await canonFacts(ctx, chatId);
    const speakers = await arbitrate(ctx, deps, {
      group,
      candidates: room.candidates,
      castNames: room.castNames,
      // Only HUMAN trigger text drives @mention (§12 inv 6) — `content` is the human post.
      forcedIds: resolveMentionsVia(content, room.castNames),
      lastSpeaker: facts.lastSpeaker,
      recentHistory: facts.recentHistory,
    });

    const groupCharacterId =
      group.output === "narrator"
        ? (await ctx.mintSyntheticGroupCharacter({ ownerId: identity.runAsUserId, chatId }))
            .characterId
        : null;
    const castName = joinedCastName(room.castNames);
    // Register the handle BEFORE the base so the abort signal threads into EVERY round turn (FLAG[abort-into-
    // engine] resolved): a `base.signal` rides each per-speaker prep + the auto-mode chain.
    const handle = deps.activeTurns.register(chatId, identity.triggeredBy);
    const base: RoundBase = {
      chatId,
      assembleContext,
      connection,
      triggeredBy: identity.triggeredBy,
      runAsUserId: identity.runAsUserId,
      kind: "send",
      intent: intent ?? {},
      memoryConfig,
      signal: handle.signal,
    };

    try {
      const round = await driveRoundVia({
        engine: deps.engine,
        base,
        group,
        speakers,
        groupCharacterId,
        castName,
      });
      const committed: MessageView[] = [userView, ...round.messages];
      if (group.autoMode) {
        const auto = await runChain(ctx, deps, {
          base,
          group,
          room,
          groupCharacterId,
          castName,
          signal: handle.signal,
          initialLastSpeaker: lastSpeakerRef(
            round.messages.findLast((m) => m.role === "assistant"),
          ),
        });
        committed.push(...auto.messages);
      }
      return { messages: committed, aborted: false };
    } finally {
      handle.release();
    }
  };
}

// ── forceCharacterTurn (host-only — force a specific roster character to speak) ──────────────────────────────
/** `forceCharacterTurn` — host-only. Force a PRESENT roster character to speak next (per-speaker; no user row).
 *  Eligibility here is PRESENCE ONLY (`leftSeq === null`) — a MUTED (`disabled`) member is STILL force-summonable
 *  (D16/#29: mute is passive arbitration exclusion — it holds a member out of `natural`/`smart` auto-selection —
 *  NOT a block on an explicit host override; `isArbiterEligible` stays the stricter present-AND-not-muted predicate
 *  for auto-selection, and this presence check is the deliberately-distinct force-turn predicate, NOT a dedup miss).
 *  A non-member / left / unknown target is a leak-free NOT_FOUND. */
function createForceCharacterTurn(
  ctx: ChatContext,
  deps: TurnDeps,
): ChatService["forceCharacterTurn"] {
  return async ({
    principal,
    chatId,
    characterId,
    intent,
    guided,
  }: ForceCharacterTurnParams): Promise<TurnOutcome> => {
    const membership = await requireHost(ctx, principal, chatId);
    const room = await loadRoom(ctx, chatId);
    const identity = resolveTurnIdentityVia({
      principalUserId: principal.userId,
      hostUserId: room.hostUserId,
    });
    const target = room.castNames.find(
      (c) => c.ref.kind === "character" && c.ref.characterId === characterId,
    );
    // PRESENCE-only (leftSeq === null) — NOT `isArbiterEligible` (which also excludes muted): a host CAN
    // force-turn a muted member (#29). The distinct predicate is intentional, not a dedup candidate.
    const present = room.candidates.some(
      (c) => c.ref.kind === "character" && c.ref.characterId === characterId && c.leftSeq === null,
    );
    if (target === undefined || !present) {
      throw new ChatNotFoundError(chatId);
    }
    const connection = await deps.resolveConnection({ runAsUserId: identity.runAsUserId, chatId });
    const group = asPerSpeaker(membership.chat.metadata.group ?? DEFAULT_GROUP_CONFIG);
    const { assembleContext, memoryConfig } = await buildTurnContext(ctx, deps, {
      chatId,
      runAsUserId: identity.runAsUserId,
      model: connection.model,
      kind: "force",
      castCharacterIds: room.castCharacterIds,
      personaIds: room.personaIds,
      anchorPersonaId: membership.chat.anchorPersonaId,
      // The host triggers a forced character turn → prompt-config `{{user}}` = the host's active persona.
      triggerPersonaId: membership.activePersonaId,
      guided,
    });
    const handle = deps.activeTurns.register(chatId, identity.triggeredBy);
    const base: RoundBase = {
      chatId,
      assembleContext,
      connection,
      triggeredBy: identity.triggeredBy,
      runAsUserId: identity.runAsUserId,
      kind: "force",
      intent: intent ?? {},
      memoryConfig,
      signal: handle.signal,
    };
    try {
      const round = await driveRoundVia({
        engine: deps.engine,
        base,
        group,
        speakers: [target],
        groupCharacterId: null,
        castName: target.name,
      });
      return {
        messages: round.messages,
        aborted: round.aborted,
        ...(round.abortReason !== undefined ? { abortReason: round.abortReason } : {}),
      };
    } finally {
      handle.release();
    }
  };
}

// ── abort (lock-free; turn-owner only — the rollback-theft defense) ─────────────────────────────────────────
/** `abort` — cancel the caller's in-flight turn(s) for the chat (the active-turns registry). Owner-only: a
 *  member-gated caller who owns NONE while another user's turn is in flight is refused `not_turn_owner` (a host
 *  cannot abort a member's turn). A no-in-flight abort is an idempotent no-op. */
function createAbort(ctx: ChatContext, deps: TurnDeps): ChatService["abort"] {
  return async ({ principal, chatId }: AbortParams): Promise<void> => {
    await requireParticipant(ctx, principal, chatId);
    const { aborted, foreignInFlight } = deps.activeTurns.abort(chatId, principal.userId);
    if (aborted === 0 && foreignInFlight) {
      throw new ChatOperationError(
        CHAT_OP_CODES.notTurnOwner,
        `chat ${chatId}: cannot abort a turn you do not own`,
      );
    }
  };
}

// ── The single-speaker auxiliary turns (swipe / continue / impersonate / generate) ──────────────────────────
// These four target ONE slot/speaker (no arbitration / round) and share a preamble + a registered engine run.

/** The resolved single-turn substrate: the room, the D19 triple, the connection, and the ONE immutable
 *  assemble ctx (the gate is the CALLER's — these helpers assume `requireParticipant`/`requireHost` ran). */
interface TurnBase {
  readonly room: Room;
  readonly identity: { readonly triggeredBy: UserId; readonly runAsUserId: UserId };
  readonly connection: ResolvedConnection;
  readonly assembleContext: AssembleContext;
  /** The resolved host memory config threaded onto the aux turn's `TurnPrep` (the SAME `foreign.memoryConfig`
   *  recall reads — the engine's build honors the D36 opt-out off it). */
  readonly memoryConfig: MemoryConfig | null | undefined;
}

/** Resolve the {@link TurnBase} for an auxiliary turn (loadRoom → D19 triple → connection → assemble ctx). The
 *  AI runs as the host (D19). These turns add no new user line (the regen/continue/impersonate context is the
 *  existing canon ± a synthetic nudge), so there is no `pendingUserText` to fold into the WI haystack. */
async function resolveTurnBase(
  ctx: ChatContext,
  deps: TurnDeps,
  args: {
    readonly principal: SendParams["principal"];
    readonly chatId: ChatId;
    /** The driving turn kind (swipe/continue/impersonate/generate) — carries the F1 `injection_trigger` gate. */
    readonly kind: TurnKind;
    readonly anchorPersonaId: PersonaId | null;
    /** The TRIGGERING human's active persona (the caller of this aux turn) — binds prompt-config `{{user}}`
     *  to the speaker, not `personaIds[0]`. */
    readonly triggerPersonaId?: PersonaId | null | undefined;
    /** The one-turn typed steer (PD-63) — threaded into the assemble ctx (GATHER → BUILD). */
    readonly guided?: GuidedSteer | undefined;
  },
): Promise<TurnBase> {
  const { principal, chatId } = args;
  const room = await loadRoom(ctx, chatId);
  const identity = resolveTurnIdentityVia({
    principalUserId: principal.userId,
    hostUserId: room.hostUserId,
  });
  const connection = await deps.resolveConnection({ runAsUserId: identity.runAsUserId, chatId });
  const { assembleContext, memoryConfig } = await buildTurnContext(ctx, deps, {
    chatId,
    runAsUserId: identity.runAsUserId,
    model: connection.model,
    kind: args.kind,
    castCharacterIds: room.castCharacterIds,
    personaIds: room.personaIds,
    anchorPersonaId: args.anchorPersonaId,
    triggerPersonaId: args.triggerPersonaId,
    guided: args.guided,
  });
  return { room, identity, connection, assembleContext, memoryConfig };
}

/** Run ONE engine turn under an active-turns registration, threading the abort signal into the engine (FLAG
 *  [abort-into-engine] resolved at the verb seam) and releasing the handle in a `finally`. */
async function runRegistered(
  deps: TurnDeps,
  chatId: ChatId,
  triggeredBy: UserId,
  prep: Omit<TurnPrep, "signal">,
): Promise<TurnOutcome> {
  const handle = deps.activeTurns.register(chatId, triggeredBy);
  try {
    return await deps.engine.runTurn({ ...prep, signal: handle.signal });
  } finally {
    handle.release();
  }
}

/** The two-axis SHAPE for an auxiliary turn voicing a KNOWN roster character (swipe/continue keep the target
 *  slot's speaker — D26 slot attribution unchanged). Returns undefined (⇒ the ctx primary) when the name can't
 *  be resolved (a deleted character — the stamp falls back, never stamps an empty label). */
function speakerShapeFor(room: Room, characterId: CharacterId | null): TurnPrep["shape"] {
  if (characterId === null) {
    return; // a non-character slot (D26 swipe/continue of an agent row) has no per-speaker character shape.
  }
  const name = room.castNames.find(
    (c) => c.ref.kind === "character" && c.ref.characterId === characterId,
  )?.name;
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

// ── swipe / regenerate (append a NEW variant to an EXISTING assistant slot — D26) ────────────────────────────
/** `swipe` — reroll an assistant slot: regenerate from the context BEFORE the slot and APPEND the result as a
 *  new variant (selected). Slot attribution is unchanged (D26). `regenerate` is `swipe` on the last assistant
 *  message — the same mode, the client passes that messageId. A non-assistant / missing target is NOT_FOUND. */
function createSwipe(ctx: ChatContext, deps: TurnDeps): ChatService["swipe"] {
  return async ({
    principal,
    chatId,
    messageId,
    intent,
    guided,
  }: SwipeParams): Promise<TurnOutcome> => {
    const membership = await requireParticipant(ctx, principal, chatId);
    // CHAT-SCOPED load (the IDOR fix): a `messageId` from another chat matches nothing → the same leak-free
    // NOT_FOUND a nonexistent id yields, so a member can neither read nor swipe-append another room's canon.
    const target = await loadSlotTarget(ctx.db, chatId, messageId);
    if (target === undefined || target.role !== "assistant") {
      throw new ChatNotFoundError(chatId);
    }
    const { room, identity, connection, assembleContext, memoryConfig } = await resolveTurnBase(
      ctx,
      deps,
      {
        principal,
        chatId,
        kind: "swipe",
        anchorPersonaId: membership.chat.anchorPersonaId,
        triggerPersonaId: membership.activePersonaId,
        guided,
      },
    );
    const shape = speakerShapeFor(room, target.characterId);
    return await runRegistered(deps, chatId, identity.triggeredBy, {
      chatId,
      assembleContext,
      connection,
      triggeredBy: identity.triggeredBy,
      runAsUserId: identity.runAsUserId,
      kind: "swipe",
      intent: intent ?? {},
      memoryConfig,
      speakerCharacterId: target.characterId,
      persist: { mode: "append-variant", targetMessageId: messageId },
      ...(shape !== undefined ? { shape } : {}),
    });
  };
}

// ── continueTurn (extend the tail assistant message in place + the D26 continue snapshot) ────────────────────
/** `continueTurn` — extend an assistant slot's selected variant in place: the model sees the canon THROUGH the
 *  slot (+ a continue nudge) and the generated text is APPENDED to the variant, snapshotting `preContinue*` so
 *  `undoContinue` can restore it (D26). A non-assistant / missing target is a leak-free NOT_FOUND. */
function createContinueTurn(ctx: ChatContext, deps: TurnDeps): ChatService["continueTurn"] {
  return async ({
    principal,
    chatId,
    messageId,
    intent,
    guided,
  }: ContinueTurnParams): Promise<TurnOutcome> => {
    const membership = await requireParticipant(ctx, principal, chatId);
    // CHAT-SCOPED load (the IDOR fix): a `messageId` from another chat matches nothing → the same leak-free
    // NOT_FOUND a nonexistent id yields, so a member can neither read nor continue-append another room's canon.
    const target = await loadSlotTarget(ctx.db, chatId, messageId);
    if (target === undefined || target.role !== "assistant") {
      throw new ChatNotFoundError(chatId);
    }
    const { room, identity, connection, assembleContext, memoryConfig } = await resolveTurnBase(
      ctx,
      deps,
      {
        principal,
        chatId,
        kind: "continue",
        anchorPersonaId: membership.chat.anchorPersonaId,
        triggerPersonaId: membership.activePersonaId,
        guided,
      },
    );
    const shape = speakerShapeFor(room, target.characterId);
    return await runRegistered(deps, chatId, identity.triggeredBy, {
      chatId,
      assembleContext,
      connection,
      triggeredBy: identity.triggeredBy,
      runAsUserId: identity.runAsUserId,
      kind: "continue",
      intent: intent ?? {},
      memoryConfig,
      speakerCharacterId: target.characterId,
      appendUserTurn: CONTINUE_NUDGE,
      persist: { mode: "continue", targetMessageId: messageId },
      ...(shape !== undefined ? { shape } : {}),
    });
  };
}

// ── impersonate (the model writes the USER's next message — a role:"user" slot, D26) ─────────────────────────
/** `impersonate` — generate the user's next line in the active persona's voice and persist it as a `role:"user"`
 *  slot (human-voiced, model-generated — D26). The steer reaches the model ONLY via `appendUserTurn`; the slot
 *  is authored by the responsible human (`triggeredBy`) + the chosen persona. */
function createImpersonate(ctx: ChatContext, deps: TurnDeps): ChatService["impersonate"] {
  return async ({
    principal,
    chatId,
    personaId,
    intent,
    guided,
  }: ImpersonateParams): Promise<TurnOutcome> => {
    const membership = await requireParticipant(ctx, principal, chatId);
    const { identity, connection, assembleContext, memoryConfig } = await resolveTurnBase(
      ctx,
      deps,
      {
        principal,
        chatId,
        kind: "impersonate",
        anchorPersonaId: membership.chat.anchorPersonaId,
        // The model writes THIS persona's voice → prompt-config `{{user}}` is the impersonated persona (the
        // SAME id the persisted user slot is stamped with — an explicit param wins, else the active persona).
        // biome-ignore lint/nursery/useNullishCoalescing: `??` would coalesce an EXPLICIT null into the active persona — only an omitted (undefined) param falls back (mirrors the slot stamp below).
        triggerPersonaId: personaId !== undefined ? personaId : membership.activePersonaId,
        guided,
      },
    );
    return await runRegistered(deps, chatId, identity.triggeredBy, {
      chatId,
      assembleContext,
      connection,
      triggeredBy: identity.triggeredBy,
      runAsUserId: identity.runAsUserId,
      kind: "impersonate",
      intent: intent ?? {},
      memoryConfig,
      speakerCharacterId: null,
      appendUserTurn: IMPERSONATE_NUDGE,
      persist: {
        mode: "new-slot",
        role: "user",
        authorUserId: identity.triggeredBy,
        // PD-100 attribution fallback: omitted → the acting participant's active persona; explicit wins.
        // biome-ignore lint/nursery/useNullishCoalescing: `??` would coalesce an EXPLICIT null into the active persona — only an omitted (undefined) param falls back.
        personaId: personaId !== undefined ? personaId : membership.activePersonaId,
      },
    });
  };
}

// ── generate (a LOCK-FREE auxiliary generation — runs CONCURRENT with a locked send) ─────────────────────────
/** `generate` — a lock-free auxiliary assistant generation: it does NOT acquire the
 *  per-chat send lock, so it runs concurrent with a locked `send` (the active-turns registry is its only
 *  concurrency control). Commits a new assistant slot for the named speaker (or the primary character). */
function createGenerate(ctx: ChatContext, deps: TurnDeps): ChatService["generate"] {
  return async ({
    principal,
    chatId,
    speakerCharacterId,
    intent,
    guided,
  }: GenerateParams): Promise<TurnOutcome> => {
    const membership = await requireParticipant(ctx, principal, chatId);
    const { room, identity, connection, assembleContext, memoryConfig } = await resolveTurnBase(
      ctx,
      deps,
      {
        principal,
        chatId,
        kind: "generate",
        anchorPersonaId: membership.chat.anchorPersonaId,
        triggerPersonaId: membership.activePersonaId,
        guided,
      },
    );
    const speaker = speakerCharacterId ?? primaryCharacterId(room);
    const shape = speakerShapeFor(room, speaker);
    return await runRegistered(deps, chatId, identity.triggeredBy, {
      chatId,
      assembleContext,
      connection,
      triggeredBy: identity.triggeredBy,
      runAsUserId: identity.runAsUserId,
      kind: "generate",
      intent: intent ?? {},
      memoryConfig,
      speakerCharacterId: speaker,
      lockFree: true,
      ...(shape !== undefined ? { shape } : {}),
    });
  };
}

// ── undoContinue / revertContinue (restore from the D26 snapshot columns — no generation) ────────────────────
/** Restore an assistant slot's selected variant from its continue snapshot (D26): `undo` → `preContinue*`
 *  (drop the last continuation); `revert` → `preContinue* + lastContinuation*` (re-apply it). A variant that
 *  was never continued (the snapshot columns are empty) is refused `no_continuation`. Emits `messageCommitted`. */
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
  // CHAT-SCOPED load (the IDOR fix): a `messageId` from another chat matches nothing → the same
  // `no_continuation` refusal a nonexistent id yields, so undo/revert cannot restore/mutate another room's canon.
  const snap = await loadContinueSnapshot(ctx.db, chatId, messageId);
  if (
    snap === undefined ||
    snap.preContinueContent === null ||
    snap.lastContinuationContent === null
  ) {
    throw new ChatOperationError(
      CHAT_OP_CODES.noContinuation,
      `message ${messageId}: no continuation to ${direction}`,
    );
  }
  const content =
    direction === "undo"
      ? snap.preContinueContent
      : snap.preContinueContent + snap.lastContinuationContent;
  const reasoning =
    direction === "undo"
      ? snap.preContinueReasoning
      : combineReasoning(snap.preContinueReasoning, snap.lastContinuationReasoning);
  await ctx.db.batch(
    batchMany([setVariantContentStatement(ctx.db, snap.variantId, content, reasoning)]),
  );
  const view = await loadMessageView(ctx.db, messageId);
  if (view === undefined) {
    throw new ChatNotFoundError(chatId);
  }
  await emit({ type: "messageCommitted", chatId, messageId: view.id, view });
  // PD user-bus lane: the restored content changed the chat-list preview → fan `chatsChanged` (list-only) to
  // every present human member (cross-device + multi-human).
  void ctx.emitChatChanged(chatId);
  return view;
}

/** `undoContinue` — revert the last continuation on a slot's variant (restores `preContinue*` — D26). */
function createUndoContinue(ctx: ChatContext, deps: TurnDeps): ChatService["undoContinue"] {
  return async ({ principal, chatId, messageId }: UndoContinueParams): Promise<MessageView> => {
    await requireParticipant(ctx, principal, chatId);
    return await restoreContinue(ctx, deps.emit, { chatId, messageId, direction: "undo" });
  };
}

/** `revertContinue` — re-apply the last reverted continuation (the redo twin — D26). */
function createRevertContinue(ctx: ChatContext, deps: TurnDeps): ChatService["revertContinue"] {
  return async ({ principal, chatId, messageId }: RevertContinueParams): Promise<MessageView> => {
    await requireParticipant(ctx, principal, chatId);
    return await restoreContinue(ctx, deps.emit, { chatId, messageId, direction: "revert" });
  };
}

/**
 * The turn-running verb BUNDLE (the grouped-file `create<File>` convention — `verb-naming` gate). The root
 * spreads it into the full service. The single-speaker engine MODES (D26) the engine now exposes back the
 * auxiliary turns: `swipe`/regenerate (append-variant), `continueTurn` (+ `undoContinue`/`revertContinue`
 * restore), `impersonate` (a `role:"user"` slot), and the LOCK-FREE `generate`. `send`/
 * `forceCharacterTurn`/`abort` are the round-driving / control verbs (solo is a `send` — a roster-of-1
 * round, D16; the deleted arbitration-skipping `simpleSend` was byte-identical to it, PD-95).
 *
 * `opening`/`generateOpening` stays INTERNAL (injected into `startChat`, not on `ChatService`) — its home is
 * the `start-chat.ts` chunk; the engine path is a `kind:"opening"` `runTurn` with the opening instruction on
 * `appendUserTurn`. The `guided` steer is ROUTED (PD-63): every generating verb threads it into
 * the GATHER→BUILD, which resolves the action template once and delivers it via its one placement (the file
 * header). The SEND/RECEIVE regex pass is wired
 * (D53 step 2): aux turns (swipe/continue/generate/force) carry the host-tier scripts onto the assemble ctx, so
 * their generated output runs the RECEIVE AI_OUTPUT/REASONING regex + post-process in the pipeline.
 */
export function createTurn(ctx: ChatContext, deps: TurnDeps): TurnVerbs {
  return {
    send: createSend(ctx, deps),
    forceCharacterTurn: createForceCharacterTurn(ctx, deps),
    abort: createAbort(ctx, deps),
    swipe: createSwipe(ctx, deps),
    continueTurn: createContinueTurn(ctx, deps),
    impersonate: createImpersonate(ctx, deps),
    generate: createGenerate(ctx, deps),
    undoContinue: createUndoContinue(ctx, deps),
    revertContinue: createRevertContinue(ctx, deps),
  };
}
