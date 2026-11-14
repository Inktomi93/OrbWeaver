// domain/chat/assembly/gather — the chat-internal gather (the impure shell before the pure
// build core). The turn's assemble inputs split by ownership: this gathers the half chat owns and merges
// it with the foreign DTO, then calls the pure `buildAssembleContext`. It reads `persistence/` and the
// substrate directly; the two `memory/` reads arrive as {@link GatherMemoryOps}, bound in
// `domain/chat/context.ts`, because `domain-no-cross-subsystem` keeps `assembly/` from importing `memory/`. Verbs
// reach it as `ctx.gatherAssembleContext`, because `domain-substrate-mediates-subsystems` keeps a flat verb
// from importing `assembly/`.
//
// The chat-internal half (chat owns the data/subsystem, reads it itself via `ChatContext`): recent
// messages/last-message family from committed canon; user injections from `chat_injections`; room
// overrides from chat metadata; WI is emergent (no on/off gate — the 4-scope pool decides); variable
// values (the per-chat ChoiceBlock flush); compact summary; memory (`recallMemory`); host-tier regex
// scripts (host-global ∪ chat-preset ∪ present characters).
//
// The foreign DTO supplies promptConfig/personas/globalRegexScripts/scanDepth/injectionTokenBudget/
// memoryConfig (settings/preset/persona reads chat must not perform).

import type { AssembleContext, ChatInjection, MacroSlice, MemoryRecallSlice, MessageView } from "@orb/contracts/chat";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import type { MacroRegistry } from "@orb/kit/macro";
import { LIVE_WINDOW_FULL_HISTORY_CUTOFF } from "@orb/kit/recall";
import { humanizeDuration } from "@orb/kit/time";
import type { ChatContext } from "../contract/context.ts";
import type { ForeignInputs } from "../contract/foreign.ts";
import type { GatherAssembleArgs, SendRegexSink } from "../contract/gather.ts";
import type { MsgRow, TurnRetrievalWarningEpisode } from "../contract/memory.ts";
import type { loadTranscriptNames } from "../memory/persistence/queries.ts";
import type { recallMemory } from "../memory/recall/recall.ts";
import { loadCanonHistory, loadChatInjections, loadChatRow, loadStoredVariables, loadVariableDeltas } from "../persistence/queries.ts";
import { assemblyTimeZone } from "../substrate/assembly-time-zone.ts";
import { regexAllowOf, resolveHostTierRegexScripts } from "../substrate/regex-tier.ts";
import { foldChain } from "../substrate/runtime-variables.ts";
import { createTurnRetrievalWarningEpisode } from "../substrate/turn-retrieval-warning.ts";
import { resolveChoiceVariables } from "../substrate/variables.ts";
import { buildAssembleContext } from "./context.ts";

/** The `memory/` reads the gather needs: the recall itself and the speaker names its query labels rows with. */
export interface GatherMemoryOps {
  readonly recallMemory: typeof recallMemory;
  readonly loadTranscriptNames: typeof loadTranscriptNames;
}

type GatherDatabankParams = Parameters<NonNullable<ChatContext["gatherDatabank"]>>[0];

// ── the {{databank}} slot GATHER ──────────────────────────────────────────
/** The retrieval query = pending + the last N committed turns. LEAN: code constants
 *  until retrieval complaints trace to query construction. */
const DATABANK_QUERY_RECENT_TURNS = 2;
const DATABANK_QUERY_MAX_CHARS = 1000;
/** The `{{databank}}` slot's share of the turn budget — the baked FALLBACK when the
 *  host's `UserSettings.databank.slotTokenBudget` isn't threaded (a test fake / byte-identity pin). The real
 *  turn supplies it via `foreign.databankSlotTokenBudget`. Sized to seat the default retrieval (k=5 ×
 *  2500-char chunks ≈ 3.1k tokens) while capping a pathological huge-chunk config. */
const DATABANK_SLOT_TOKEN_BUDGET = 4096;

/** Build the retrieval query: the pending user text + the last 2 committed turns, most-recent-first, capped.
 *  The pending message is the strongest signal; the recent turns restore the context a bare "tell me more
 *  about that" loses; the whole window would dilute the embedding toward the conversation average (§4). */
function buildDatabankQuery(pendingUserText: string | undefined, eligibleContent: readonly string[]): string {
  const lastTurns = eligibleContent.slice(-DATABANK_QUERY_RECENT_TURNS).reverse();
  const parts = [pendingUserText, ...lastTurns].filter((t): t is string => t !== undefined && t.trim().length > 0);
  return parts.join("\n").slice(0, DATABANK_QUERY_MAX_CHARS);
}

/** Resolve the `{{databank}}` slot string for the round. `undefined` when the op is absent OR returns null
 *  (bankless scope / no hits / budget too small) — the `setIf`-skipped byte-identity pin: an absent op and a
 *  null result produce the SAME empty slot resolution. */
async function gatherDatabank(
  ctx: ChatContext,
  args: {
    readonly chatId: ChatId;
    readonly hostUserId: UserId;
    readonly pendingUserText: string | undefined;
    readonly eligibleContent: readonly string[];
    /** The host's databank settings (DB6), from ForeignInputs — retrieval params + the slot budget. */
    readonly foreign: ForeignInputs;
    /** The turn's degrade episode, shared with the MEMORY arm. */
    readonly warningEpisode: TurnRetrievalWarningEpisode;
  },
): Promise<string | undefined> {
  if (ctx.gatherDatabank === undefined) {
    return;
  }
  const queryText = buildDatabankQuery(args.pendingUserText, args.eligibleContent);
  if (queryText.length === 0) {
    return;
  }
  const retrieval = args.foreign.databankRetrieval;
  const result = await ctx.gatherDatabank(
    {
      chatId: args.chatId,
      hostUserId: args.hostUserId,
      queryText,
      tokenBudget: args.foreign.databankSlotTokenBudget ?? DATABANK_SLOT_TOKEN_BUDGET,
      ...(retrieval !== undefined
        ? ({ k: retrieval.k, minScore: retrieval.minScore, rerank: retrieval.rerank } satisfies Pick<GatherDatabankParams, "k" | "minScore" | "rerank">)
        : {}),
    },
    // The binding degrades a SPACE refusal to `null` and reports here; `onRerankUnavailable` is
    // unused on this arm — databank's own rerank degrade is not wired, so the binding never calls it.
    { onRerankUnavailable: args.warningEpisode.reportRerankUnavailable, onIndexUnavailable: args.warningEpisode.reportIndexUnavailable },
  );
  return result === null ? undefined : result.text;
}

/** A committed canon row, prompt-eligible (the slim shape the gather projects from `MessageView`). */
type CanonRow = Readonly<Pick<MessageView, "seq" | "role" | "kind" | "characterId" | "authorUserId" | "personaId" | "content">>;

// The `idle_duration` macro value (parity-plus §12, D6) — time since the last chat activity, EXCLUDING the
// in-flight message (else it always reads ~0, the user just sent). The in-flight turn is either uncommitted
// (`hasPending` ⇒ the newest canon row IS prior activity, exclude nothing) or already committed at send (⇒ the
// newest canon row IS the in-flight, exclude it). Idle = `now` − the newest REMAINING row's timestamp; "" when
// there is no prior activity (a fresh one-message chat, or only the in-flight row). Human text via humanizeDuration.
function computeIdleDuration(canon: readonly MessageView[], now: number, hasPending: boolean): string {
  const priorRows = hasPending ? canon : canon.slice(0, -1);
  const lastActivityAt = priorRows.at(-1)?.createdAt;
  return lastActivityAt !== undefined ? humanizeDuration(now - lastActivityAt) : "";
}

/** The parity-plus P6 build-input fields (§12), each present only when it carries a value so a non-game / no-idle
 *  turn is byte-identical (the honest-empty pin — an omitted field ⇒ the macro / `{{expr}}` resolves ""). Collected
 *  into one partial so the three omit-when-empty branches live OUTSIDE `gatherAssembleContext`'s complexity budget
 *  (the `pickMacroRegistries` precedent). */
function p6Fields(
  rpgMacros: Readonly<Record<string, string>> | undefined,
  celBindings: Readonly<Record<string, unknown>> | undefined,
  idleDuration: string,
): { rpgMacros?: Readonly<Record<string, string>>; celBindings?: Readonly<Record<string, unknown>>; idleDuration?: string } {
  return {
    ...(rpgMacros !== undefined ? { rpgMacros } : {}),
    ...(celBindings !== undefined ? { celBindings } : {}),
    ...(idleDuration !== "" ? { idleDuration } : {}),
  };
}

/** The recall query's speaker names: the room identity producer over the query window's own stamps, the same
 *  source the memory build labels its transcripts with, so a speaker who joined or left still resolves. */
async function loadRecallNames(ctx: ChatContext, memoryOps: GatherMemoryOps, rows: readonly MsgRow[]): Promise<ReadonlyMap<CharacterId, string>> {
  const { characterNamesById } = await memoryOps.loadTranscriptNames(ctx.db, rows);
  return new Map([...characterNamesById].map(([id, entry]) => [id, entry.name]));
}

/** Collect the per-turn user-macro registries (WAVE MU) into an omit-when-undefined object — kept a pure
 *  top-level helper so its two branches stay out of `gatherAssembleContext`'s cognitive-complexity budget. */
function pickMacroRegistries(
  render: MacroRegistry | undefined,
  freeze: MacroRegistry | undefined,
  trace: MacroSlice | undefined,
): { macroRegistry?: MacroRegistry; freezeMacroRegistry?: MacroRegistry; macroTrace?: MacroSlice } {
  return {
    ...(render !== undefined ? { macroRegistry: render } : {}),
    ...(freeze !== undefined ? { freezeMacroRegistry: freeze } : {}),
    ...(trace !== undefined ? { macroTrace: trace } : {}),
  };
}

/** The recall query window: the committed recent rows PLUS the pending user message as the newest
 *  `user` row. Recall runs pre-persist, so without this the mixB/mixC query is the PREVIOUS turn's tail and the
 *  turn's own most-relevant text never contributes. A top-level pure helper so its branch stays OUTSIDE
 *  `gatherAssembleContext`'s cognitive-complexity budget (the `p6Fields` precedent). Absent pending text (a
 *  preview / aux turn) ⇒ the committed rows unchanged. */
function recallRecentWindow(recentRows: readonly MsgRow[], pendingUserText: string | undefined, triggerUserId: UserId | null | undefined): readonly MsgRow[] {
  if (pendingUserText === undefined) {
    return recentRows;
  }
  const newestSeq = recentRows.at(-1)?.seq ?? 0;
  return [
    ...recentRows,
    { seq: newestSeq + 1, role: "user", kind: "standard", characterId: null, authorUserId: triggerUserId ?? null, personaId: null, content: pendingUserText },
  ];
}

/** Map a persisted `chat_injections` row → the `ChatInjection` wire shape (omit `order` when null). */
function toChatInjection(row: Awaited<ReturnType<typeof loadChatInjections>>[number]): ChatInjection {
  return {
    position: row.position,
    depth: row.depth,
    role: row.role,
    content: row.content,
    ...(row.order !== null ? { order: row.order } : {}),
    // Provenance for the host preview's per-source accounting — a persisted row is ALWAYS host-authored
    // (`user` origin); a client never authors this field (it is deliberately off `chatInjectionInputSchema`).
    origin: "user",
  };
}

/** Resolve the `{{memory}}` string for the round PLUS its recall trace. Round-level recall uses the
 *  shared/merged bucket (the synthetic group-as-character, or the primary character when none is minted).
 *  Returns `""` with a `null` trace when there is no character to key on — the ONE path where recall did not
 *  run at all, which the assembly trace reports as `memoryRecall: null` rather than as an empty recall. When
 *  `out` is supplied, stages the round-level recall inputs for the engine's per-speaker witnessed re-run (D6). */
async function gatherMemory(
  ctx: ChatContext,
  memoryOps: GatherMemoryOps,
  args: {
    readonly chatId: ChatId;
    readonly runAsUserId: UserId;
    readonly characterIds: readonly CharacterId[];
    readonly foreign: ForeignInputs;
    readonly recent: readonly MsgRow[];
    readonly names: ReadonlyMap<CharacterId, string>;
    /** The live-window cutoff seq (the seq below which messages aren't in the prompt) — the PREVIOUS turn's
     *  canon fit boundary. `undefined` ⇒ no prior boundary stamp ⇒ no live-window trim this round. */
    readonly liveWindowCutoffSeq: number | undefined;
    /** The turn's degrade episode, constructed by {@link gatherAssembleContext} and shared with the DATABANK
     *  arm — one unqueryable vector space losing both retrieval slots owes the user ONE notice. */
    readonly warningEpisode: TurnRetrievalWarningEpisode;
  },
  out?: SendRegexSink,
): Promise<{ readonly text: string; readonly trace: MemoryRecallSlice | null }> {
  const group = await ctx.findSyntheticGroupCharacter({
    ownerId: args.runAsUserId,
    chatId: args.chatId,
  });
  const sharedCharId = group?.characterId ?? args.characterIds[0] ?? null;
  if (sharedCharId === null) {
    if (out !== undefined) {
      out.memoryRecall = null;
    }
    return { text: "", trace: null };
  }
  const config = args.foreign.memoryConfig ?? null;
  const { warningEpisode } = args;
  if (out !== undefined) {
    out.memoryRecall = {
      groupCharacterId: sharedCharId,
      recent: args.recent,
      names: args.names,
      config,
      warningEpisode,
      ...(args.liveWindowCutoffSeq !== undefined ? { liveWindowCutoffSeq: args.liveWindowCutoffSeq } : {}),
    };
  }
  return await memoryOps.recallMemory(ctx, {
    scope: {
      chatId: args.chatId,
      scopedCharacterId: sharedCharId,
      isGroup: args.characterIds.length > 1,
    },
    groupCharacterId: sharedCharId,
    // The recall live-window cutoff = the PREVIOUS turn's canon fit boundary (the newest assistant row's
    // stored `contextBoundaryMessageId` → its seq). Recall can't see THIS turn's fit (it runs pre-fit), so
    // the last turn's authoritative boundary is the honest live-window edge — digests whose scene is still
    // verbatim in the window aren't re-injected. Absent (no prior boundary stamp) ⇒ no trim (byte-identical).
    ...(args.liveWindowCutoffSeq !== undefined ? { liveWindowCutoffSeq: args.liveWindowCutoffSeq } : {}),
    ...(config !== null ? { config } : {}),
    recent: args.recent,
    names: args.names,
    warningEpisode,
  });
}

/** The recall live-window cutoff seq = the PREVIOUS turn's canon fit boundary: the newest ASSISTANT row's
 *  stored `contextBoundaryMessageId` resolved to its seq. Three outcomes (the inversion this fixes):
 *   • NO completed assistant turn (a fresh chat) → `undefined`: there is no fit boundary yet AND no aged-out
 *     digest exists to trim, so recall applies no live-window filter (moot).
 *   • A completed turn whose boundary stamp is NULL → {@link LIVE_WINDOW_FULL_HISTORY_CUTOFF}: `null` means the
 *     fit trimmed NOTHING — `fitHistoryToWindow` returns `earliestKeptMessageId: null` when the WHOLE history is
 *     kept (`keepFrom === 0`) or when there is no window ceiling. In BOTH the entire history was sent, so every
 *     digest's scene is verbatim and EVERY digest must drop. This is the owner's live bug: a 20k chat inside a
 *     32k window trimmed nothing, and the old `undefined` here made `filterPool` recall EVERY scene the model
 *     already reads in full.
 *   • A resolvable boundary → its seq (the partial-trim case: recall only digests strictly below it).
 *  A stamped boundary whose target isn't in canon anymore (edited/deleted since) fails toward DROP-ALL
 *  (conservative — never re-inject a scene that might still be verbatim), not pass-all. */
function resolveLiveWindowCutoffSeq(canon: readonly MessageView[]): number | undefined {
  // Every assistant canon row is a real generation carrying a fit-pass stamp (D124 retired the rpg
  // state-anchor slot, which was an assistant ROW with no stamp — letting it answer here silently disabled
  // the recall live-window trim for the rest of the game).
  const lastAssistant = canon.findLast((m) => m.role === "assistant");
  if (lastAssistant === undefined) {
    return; // no completed generation → no boundary and no aged digests → no live-window trim
  }
  const boundaryId = lastAssistant.contextBoundaryMessageId ?? null;
  if (boundaryId === null) {
    return LIVE_WINDOW_FULL_HISTORY_CUTOFF; // the whole history was sent → every digest is in-window → drop all
  }
  return canon.find((m) => m.id === boundaryId)?.seq ?? LIVE_WINDOW_FULL_HISTORY_CUTOFF; // stale boundary → conservative drop-all
}

/**
 * Gather the chat-internal assemble inputs, merge with the foreign DTO, and produce the immutable per-turn
 * `AssembleContext` via the pure `buildAssembleContext`. `out`, when supplied with a SEND turn, receives
 * the post-USER_INPUT-regex text for the verb to persist.
 */
export async function gatherAssembleContext(
  bound: { readonly ctx: ChatContext; readonly memoryOps: GatherMemoryOps },
  args: GatherAssembleArgs,
  foreign: ForeignInputs,
  out?: SendRegexSink,
): Promise<AssembleContext> {
  const { ctx, memoryOps } = bound;
  const { chatId, runAsUserId, model, characterIds, personaIds } = args;

  const [chatRow, canon, injectionRows, storedVariables, variableDeltas] = await Promise.all([
    loadChatRow(ctx.db, chatId),
    loadCanonHistory(ctx.db, chatId),
    loadChatInjections(ctx.db, chatId),
    loadStoredVariables(ctx.db, chatId),
    loadVariableDeltas(ctx.db, chatId),
  ]);

  // Two-plane env seed: resolve the config plane (ChoiceBlock picks → concrete map), then overlay the
  // runtime fold cache so a played `{{setvar}}` wins over the config default. Handed to the macro env by
  // reference — within-turn setvars mutate it in place; the turn flushes the delta at commit.
  const resolvedConfig = resolveChoiceVariables(foreign.promptConfig.variables, storedVariables ?? {}, args.prng, args.choicePicks);
  const runtimeCache = foldChain(variableDeltas);
  const mergedVariables: Record<string, string> = { ...resolvedConfig, ...runtimeCache };

  // Hidden rows excluded — the WI haystack + the {{lastMessage}}-family inputs.
  const eligible: CanonRow[] = canon
    .filter((m) => !m.excludedFromPrompt)
    .map((m) => ({
      seq: m.seq,
      role: m.role,
      // The declared purpose rides into the recall window's rows (D129) — same `MsgRow` the memory build uses.
      kind: m.kind,
      characterId: m.characterId,
      authorUserId: m.authorUserId,
      personaId: m.personaId,
      content: m.content,
    }));
  const recentRows = eligible.slice(Math.max(0, eligible.length - foreign.scanDepth));
  const recentMessages = recentRows.map((m) => m.content);
  const lastMessage = eligible.at(-1)?.content;
  const lastUserMessage = eligible.findLast((m) => m.role === "user")?.content;
  const lastCharMessage = eligible.findLast((m) => m.role === "assistant")?.content;

  // The recall query INCLUDES the current user message (recall runs pre-persist). See
  // `recallRecentWindow`; absent pending text ⇒ the committed rows unchanged.
  const recallRecent = recallRecentWindow(recentRows, args.pendingUserText, args.triggerUserId);

  // ONE episode for the whole gathered turn, constructed HERE rather than inside either arm: both
  // retrieval slots read the same owner's vector space, so one unqueryable space owes the user one notice.
  // The engine drains it after `turnStarted` through the staged `MemoryRecallInputs`. THE ONE GAP, stated
  // rather than hidden: a room with no character to key on stages `memoryRecall: null` (below), so a databank
  // degrade in a character-less room reports into an episode no engine drains — the same "preview/aux gathers
  // hold an episode with no engine consumer" limit the rerank degrade already carries, and such a room has no
  // speaker to run a turn for.
  const warningEpisode = createTurnRetrievalWarningEpisode();
  const [memory, databank] = await Promise.all([
    gatherMemory(
      ctx,
      memoryOps,
      {
        chatId,
        runAsUserId,
        characterIds,
        foreign,
        recent: recallRecent,
        names: await loadRecallNames(ctx, memoryOps, recallRecent),
        liveWindowCutoffSeq: resolveLiveWindowCutoffSeq(canon),
        warningEpisode,
      },
      out,
    ),
    gatherDatabank(ctx, {
      chatId,
      hostUserId: runAsUserId,
      pendingUserText: args.pendingUserText,
      eligibleContent: eligible.map((m) => m.content),
      foreign,
      warningEpisode,
    }),
  ]);

  // The host-tier regex union (global ∪ preset ∪ character ∪ room), deterministically ordered/deduped. D121-E:
  // the four slices are LIBRARY ROWS dereferenced from their scope junctions by the injected regex op; no
  // embed-by-value copy (settings blob / preset blob / card column) is read.
  // Resolved under `runAsUserId` (the frozen host, D19), so a member never widens the room's set.
  const hostTierRegexScripts = resolveHostTierRegexScripts({
    ...(await ctx.resolveRegexSources({
      ownerId: runAsUserId,
      presetId: foreign.presetId ?? null,
      characterIds,
      chatId,
    })),
    // What THIS room permits. Absent ⇒ everything runs, so a room that never touched the Regex
    // section assembles byte-identically; a switched-off tier drops out of the union here, before the dedup.
    allow: regexAllowOf(chatRow?.metadata),
  });

  // {{idle_duration}} (§12, D6) — time-since-last-activity as human text; "" when there is no prior activity.
  const idleDuration = computeIdleDuration(canon, ctx.now(), args.pendingUserText !== undefined);

  // WI activation is emergent (no master toggle): the 4-scope pool yields whatever is attached +
  // entry-enabled + present, and an empty pool ⇒ no lore. There is no `worldInfoEnabled` input.
  const roomOverrides = chatRow?.metadata.roomOverrides;

  // The per-turn user-macro registries (WAVE MU), collected by a pure top-level helper so the two
  // omit-when-undefined branches live OUTSIDE this function's cognitive-complexity budget.
  const macroRegistries = pickMacroRegistries(args.macroRegistry, args.freezeMacroRegistry, args.macroTrace);

  return await buildAssembleContext(
    ctx,
    {
      chatId,
      ownerId: runAsUserId,
      characterIds,

      mutedSpeakerKeys: args.mutedSpeakerKeys,
      personaIds,
      memberPersonaLore: chatRow?.metadata.memberPersonaLore,
      promptConfig: foreign.promptConfig,
      personas: foreign.personas,
      multiHuman: args.multiHuman,
      recentMessages,
      // The chat's own injection ROWS + the S2 teaching collection's injections; nothing teaching ⇒ unchanged.
      // The teaching half arrives PRE-STAMPED (each contribution owns its `origin`, e.g. chat's rpg projection
      // stamps `game-state` — `domain/chat/teaching-contribution.ts`) so the BUILD walk accounts each source
      // under its own budget row. The stamp is NOT applied HERE: a merge-site stamp would relabel every
      // later contributor as game state. The rows are NOT deduped against the teaching half — a host may
      // legitimately author an injection identical to a machine one, and this seam does not edit their canon.
      userInjections: [...injectionRows.map(toChatInjection), ...(args.teachingInjections ?? [])],
      memory: memory.text,
      // The recall EXPLANATION rides beside the text it explains — the trace's memory row. Absent only
      // when recall never ran (no character to key on).
      ...(memory.trace === null ? {} : { memoryTrace: memory.trace }),
      // Absent (op unwired / null result) ⇒ omitted ⇒ byte-identical to a non-databank turn (DB6 null-op pin).
      ...(databank !== undefined ? { databank } : {}),
      // The parity-plus P6 feed (§12): rpg macro map + `{{expr}}` CEL activation + `{{idle_duration}}`. Each field
      // is omitted when empty/absent ⇒ byte-identical to a non-game / no-idle build (the honest-empty pin).
      ...p6Fields(args.rpgMacros, args.rpgCelBindings, idleDuration),
      compactSummary: chatRow?.compactSummary ?? null,
      // The coverage stamp so covered turns fall out of the shaped prompt history (full-reset). toShapeCanon gates
      // on a present summary (a stale seq never trims); null/absent ⇒ no exclusion.
      compactedThroughSeq: chatRow?.compactedAtSeq,
      variableValues: mergedVariables,
      injectionTokenBudget: foreign.injectionTokenBudget,
      hostTierRegexScripts,
      model,
      generationType: args.generationType ?? "normal",
      nowMs: ctx.now(),
      // The render PRNG: drives the SEND volatile-macro freeze ({{roll}}/{{random}}/{{pick}} bake deterministically
      // at commit), every build-stage render and the turn-stage macro context. `choicePicks` alone selects the
      // ChoiceBlock pick mode above.
      prng: args.prng,
      ...(roomOverrides !== undefined ? { roomOverrides } : {}),
      timezone: assemblyTimeZone(args.timeZone),
      ...(lastMessage !== undefined ? { lastMessage } : {}),
      ...(lastUserMessage !== undefined ? { lastUserMessage } : {}),
      ...(lastCharMessage !== undefined ? { lastCharMessage } : {}),
      ...(args.pendingUserText !== undefined ? { pendingUserText: args.pendingUserText, currentInput: args.pendingUserText } : {}),
      ...(args.sendDraft !== undefined ? { sendDraft: args.sendDraft } : {}),
      ...(args.guided !== undefined ? { guided: args.guided } : {}),
      // The per-turn user-macro registries (WAVE MU) — absent ⇒ the pure build's singleton fallback (byte-identical).
      ...macroRegistries,
    },
    out,
  );
}
