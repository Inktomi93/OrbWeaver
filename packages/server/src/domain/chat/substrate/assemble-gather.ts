// domain/chat/substrate/assemble-gather — the chat-internal gather (the impure shell before the pure
// build core). The turn's assemble inputs split by ownership: this gathers the half chat owns and merges
// it with the foreign DTO, then calls the pure `buildAssembleContext`. Homed in `substrate/` because it
// coordinates three named subsystems (`assembly/`, `memory/`, the regex-tier substrate) + `persistence/`
// reads — a verb or an `assembly/` file may not import `memory/` directly.
//
// The chat-internal half (chat owns the data/subsystem, reads it itself via `ChatContext`): recent
// messages/last-message family from committed canon; user injections from `chat_injections`; room
// overrides from chat metadata; WI is emergent (no on/off gate — the 4-scope pool decides); variable
// values (the per-chat ChoiceBlock flush); compact summary; memory (`recallMemory`); host-tier regex
// scripts (host-global ∪ chat-preset ∪ present characters).
//
// The foreign DTO supplies promptConfig/personas/globalRegexScripts/scanDepth/injectionTokenBudget/
// memoryConfig (settings/preset/persona reads chat must not perform).

import type { CharacterCard } from "@orb/contracts/character";
import type { AssembleContext, ChatInjection, MacroFreezeRecord, MemoryRecallSlice, MessageView } from "@orb/contracts/chat";
import type { GenerationType } from "@orb/contracts/preset";
import type { CharacterId, ChatId, PersonaId, UserId } from "@orb/kit/ids";
import type { MacroRegistry } from "@orb/kit/macro";
import { humanizeDuration } from "@orb/kit/time";
import { buildAssembleContext } from "../assembly/context.ts";
import type { ChatContext } from "../context.ts";

import type { ForeignInputs } from "../contract/foreign.ts";
import type { MemoryRecallInputs, MsgRow, TurnRetrievalWarningEpisode } from "../contract/memory.ts";
import type { GuidedSteer } from "../contract/params.ts";
import { recallMemory } from "../memory/recall/recall.ts";
import { LIVE_WINDOW_FULL_HISTORY_CUTOFF } from "../memory/recall/window.ts";
import { loadCanonHistory, loadChatInjections, loadChatRow, loadStoredVariables, loadVariableDeltas } from "../persistence/queries.ts";
import { regexAllowOf, resolveHostTierRegexScripts } from "./regex-tier.ts";
import { foldChain } from "./runtime-variables.ts";
import { createTurnRetrievalWarningEpisode } from "./turn-retrieval-warning.ts";
import { resolveChoiceVariables } from "./variables.ts";

/** The SEND USER_INPUT regex out-param sink — `buildAssembleContext` writes the post-regex user text
 *  here so the verb persists that. Threaded straight through to the pure core. */
interface SendRegexSink {
  sendUserText?: string;
  /** The SEND bake's VOLATILE-FREEZE record (D129-F) — written by the pure core beside `sendUserText` so the
   *  verb persists it on the same variant. Absent ⇒ nothing froze. */
  sendMacroFreezes?: MacroFreezeRecord;
  /** The round-level recall inputs for the engine's per-speaker witnessed re-run (D6) — written by
   *  `gatherMemory` (NOT the pure core, which never touches it). `null` ⇒ no character to key on. */
  memoryRecall?: MemoryRecallInputs | null;
}

type GatherDatabankParams = Parameters<NonNullable<ChatContext["gatherDatabank"]>>[0];

// ── the {{databank}} slot GATHER (DB6, databank-design/07 §4/§6) ──────────────────────────────────────────
/** The retrieval query = pending + the last N committed turns (databank-design/07 §4). LEAN: code constants
 *  until retrieval complaints trace to query construction. */
const DATABANK_QUERY_RECENT_TURNS = 2;
const DATABANK_QUERY_MAX_CHARS = 1000;
/** The `{{databank}}` slot's share of the turn budget (databank-design/07 §6) — the baked FALLBACK when the
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
    /** The turn's degrade episode, shared with the MEMORY arm (#2510). */
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
    // The binding degrades a SPACE refusal to `null` and reports here (#2510); `onRerankUnavailable` is
    // unused on this arm — databank's own rerank degrade is not wired, so the binding never calls it.
    { onRerankUnavailable: args.warningEpisode.reportRerankUnavailable, onIndexUnavailable: args.warningEpisode.reportIndexUnavailable },
  );
  return result === null ? undefined : result.text;
}

/** A committed canon row, prompt-eligible (the slim shape the gather projects from `MessageView`). */
interface CanonRow {
  readonly seq: number;
  readonly role: MsgRow["role"];
  /** The row's declared purpose (D129) — carried because these rows ARE the recall window's `MsgRow`s. */
  readonly kind: MsgRow["kind"];
  readonly characterId: CharacterId | null;
  readonly authorUserId: UserId | null;
  readonly personaId: PersonaId | null;
  readonly content: string;
}

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

/** Resolve the present characters' live cards under the host's ownership — the regex-tier character source + the
 *  recall name map. A gone/mid-delete card (`null`) is skipped, never an error. */
async function loadCharacterCards(
  ctx: ChatContext,
  ownerId: UserId,
  characterIds: readonly CharacterId[],
): Promise<{ cards: CharacterCard[]; names: Map<CharacterId, string> }> {
  const loaded = await Promise.all(
    characterIds.map(async (characterId) => ({
      characterId,
      card: await ctx.getCard({ ownerId, characterId }),
    })),
  );
  const cards: CharacterCard[] = [];
  const names = new Map<CharacterId, string>();
  for (const { characterId, card } of loaded) {
    if (card !== null) {
      cards.push(card);
      names.set(characterId, card.name);
    }
  }
  return { cards, names };
}

/** Collect the per-turn user-macro registries (WAVE MU) into an omit-when-undefined object — kept a pure
 *  top-level helper so its two branches stay out of `gatherAssembleContext`'s cognitive-complexity budget. */
function pickMacroRegistries(
  render: MacroRegistry | undefined,
  freeze: MacroRegistry | undefined,
): { macroRegistry?: MacroRegistry; freezeMacroRegistry?: MacroRegistry } {
  return {
    ...(render !== undefined ? { macroRegistry: render } : {}),
    ...(freeze !== undefined ? { freezeMacroRegistry: freeze } : {}),
  };
}

/** The recall query window (#330 P2): the committed recent rows PLUS the pending user message as the newest
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

/** Resolve the `{{memory}}` string for the round PLUS its recall trace (#250). Round-level recall uses the
 *  shared/merged bucket (the synthetic group-as-character, or the primary character when none is minted).
 *  Returns `""` with a `null` trace when there is no character to key on — the ONE path where recall did not
 *  run at all, which the assembly trace reports as `memoryRecall: null` rather than as an empty recall. When
 *  `out` is supplied, stages the round-level recall inputs for the engine's per-speaker witnessed re-run (D6). */
async function gatherMemory(
  ctx: ChatContext,
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
     *  arm (#2510) — one unqueryable vector space losing both retrieval slots owes the user ONE notice. */
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
  return await recallMemory(ctx, {
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
 *  stored `contextBoundaryMessageId` resolved to its seq. Three outcomes (#333 — the inversion this fixes):
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
  ctx: ChatContext,
  args: {
    readonly chatId: ChatId;
    readonly runAsUserId: UserId;
    readonly model: string;
    readonly characterIds: readonly CharacterId[];
    /** Present seated agents (D60), soul-resolved by `loadRoom`; threaded straight to the pure build core. */

    /** The muted-seat `speakerKey`s from `loadRoom` (character + agent) — the `unmutedCharacters` producer. */
    readonly mutedSpeakerKeys?: ReadonlySet<string> | undefined;
    readonly personaIds: readonly PersonaId[];
    /** The live human driving this turn — the author of the pending row the recall query folds in. Absent/null
     *  ⇒ a turn with no triggering human (drain/auto). */
    readonly triggerUserId?: UserId | null | undefined;
    /** The room seats more than one present human — carried onto the built ctx for SHAPE's name-stamp. */
    readonly multiHuman?: boolean | undefined;
    readonly pendingUserText?: string | undefined;
    /** The one-turn typed steer — threaded to the BUILD, which resolves the action template once and
     *  delivers it via its placement. */
    readonly guided?: GuidedSteer | undefined;
    /** The seeded turn PRNG (never ambient `Math.random`) — deterministic + replayable `randomPick`.
     *  Absent (preview/opening) ⇒ stable resolution, so a preview never varies per poll. */
    readonly prng?: (() => number) | undefined;
    /** The `injection_trigger` gate — maps the driving `TurnKind` → `GenerationType` at the verb so
     *  trigger-gated preset sections fire on the right turn kind. Absent ⇒ "normal". */
    readonly generationType?: GenerationType | undefined;
    /** A game turn's GATHER macros (rpg-design/06 §1), keyed by the RpgGatherMacros field names — fed to the
     *  pure build as `rpgMacros`; absent ⇒ every rpg macro resolves empty (byte-identical non-game turn). */
    readonly rpgMacros?: Readonly<Record<string, string>> | undefined;
    /** A game turn's `{{expr::…}}` CEL activation (parity-plus §12) — the data-only `{ rpg: <tracker view tree> }`,
     *  threaded verbatim onto the AssembleContext's `celBindings`. Absent ⇒ `{{expr::rpg.…}}` errors-to-"". */
    readonly rpgCelBindings?: Readonly<Record<string, unknown>> | undefined;
    /** The S2 teaching collection's injections (`substrate/teaching.ts`) — every registered contribution's
     *  prose steering for THIS turn, ALREADY origin-stamped by its producer, merged into the chat injection
     *  list (a game turn's depth-0 reminder is recency-biased nearest generation via its `depth:0`). Absent /
     *  empty ⇒ only the chat's own `chat_injections` rows (byte-identical to a turn with nothing teaching). */
    readonly teachingInjections?: readonly ChatInjection[] | undefined;
    /** The per-turn user-macro RENDER + FREEZE registries (WAVE MU) — threaded verbatim to the pure build.
     *  Absent ⇒ the pure build falls back to the process singletons (byte-identical non-user-macro turn). */
    readonly macroRegistry?: MacroRegistry | undefined;
    readonly freezeMacroRegistry?: MacroRegistry | undefined;
  },
  foreign: ForeignInputs,
  out?: SendRegexSink,
): Promise<AssembleContext> {
  const { chatId, runAsUserId, model, characterIds, personaIds } = args;

  const [chatRow, canon, injectionRows, storedVariables, variableDeltas, characterCards] = await Promise.all([
    loadChatRow(ctx.db, chatId),
    loadCanonHistory(ctx.db, chatId),
    loadChatInjections(ctx.db, chatId),
    loadStoredVariables(ctx.db, chatId),
    loadVariableDeltas(ctx.db, chatId),
    loadCharacterCards(ctx, runAsUserId, characterIds),
  ]);

  // Two-plane env seed: resolve the config plane (ChoiceBlock picks → concrete map), then overlay the
  // runtime fold cache so a played `{{setvar}}` wins over the config default. Handed to the macro env by
  // reference — within-turn setvars mutate it in place; the turn flushes the delta at commit.
  const resolvedConfig = resolveChoiceVariables(foreign.promptConfig.variables, storedVariables ?? {}, args.prng ?? ((): number => 0), {
    withRandomPick: args.prng !== undefined,
  });
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

  // #330 P2 — the recall query INCLUDES the current user message (recall runs pre-persist). See
  // `recallRecentWindow`; absent pending text ⇒ the committed rows unchanged.
  const recallRecent = recallRecentWindow(recentRows, args.pendingUserText, args.triggerUserId);

  // ONE episode for the whole gathered turn, constructed HERE rather than inside either arm (#2510): both
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
      {
        chatId,
        runAsUserId,
        characterIds,
        foreign,
        recent: recallRecent,
        names: characterCards.names,
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
  // the four slices are LIBRARY ROWS dereferenced from their scope junctions by the injected regex op — the
  // three embed-by-value carriers this used to read (settings blob / preset blob / card column) are gone.
  // Resolved under `runAsUserId` (the frozen host, D19), so a member never widens the room's set.
  const hostTierRegexScripts = resolveHostTierRegexScripts({
    ...(await ctx.resolveRegexSources({
      ownerId: runAsUserId,
      presetId: foreign.presetId ?? null,
      characterIds,
      chatId,
    })),
    // #1742 — what THIS room permits. Absent ⇒ everything runs, so a room that never touched the Regex
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
  const macroRegistries = pickMacroRegistries(args.macroRegistry, args.freezeMacroRegistry);

  return await buildAssembleContext(
    ctx,
    {
      chatId,
      ownerId: runAsUserId,
      characterIds,

      mutedSpeakerKeys: args.mutedSpeakerKeys,
      personaIds,
      promptConfig: foreign.promptConfig,
      personas: foreign.personas,
      multiHuman: args.multiHuman,
      recentMessages,
      // The chat's own injection ROWS + the S2 teaching collection's injections; nothing teaching ⇒ unchanged.
      // The teaching half arrives PRE-STAMPED (each contribution owns its `origin`, e.g. chat's rpg projection
      // stamps `game-state` — `domain/chat/teaching-contribution.ts`) so the BUILD walk accounts each source
      // under its own budget row. The stamp used to live HERE, which was right while rpg was the only
      // contributor and became wrong the moment the merge went generic: a merge-site stamp would relabel every
      // later contributor as game state. The rows are NOT deduped against the teaching half — a host may
      // legitimately author an injection identical to a machine one, and this seam does not edit their canon.
      userInjections: [...injectionRows.map(toChatInjection), ...(args.teachingInjections ?? [])],
      memory: memory.text,
      // The recall EXPLANATION rides beside the text it explains (#250) — the trace's memory row. Absent only
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
      // Drives the SEND volatile-macro freeze ({{roll}}/{{random}}/{{pick}} bake deterministically at
      // commit). Absent on preview/aux turns (no pending composer text to freeze there).
      ...(args.prng !== undefined ? { prng: args.prng } : {}),
      ...(roomOverrides !== undefined ? { roomOverrides } : {}),
      // FLAG[timezone-per-request]: {{time}}/{{date}} render server-side, but the timezone is the
      // caller's browser zone, supplied per-request — not a host setting. Unset ⇒ macro engine falls
      // back to server-local.
      ...(lastMessage !== undefined ? { lastMessage } : {}),
      ...(lastUserMessage !== undefined ? { lastUserMessage } : {}),
      ...(lastCharMessage !== undefined ? { lastCharMessage } : {}),
      ...(args.pendingUserText !== undefined ? { pendingUserText: args.pendingUserText, currentInput: args.pendingUserText } : {}),
      ...(args.guided !== undefined ? { guided: args.guided } : {}),
      // The per-turn user-macro registries (WAVE MU) — absent ⇒ the pure build's singleton fallback (byte-identical).
      ...macroRegistries,
    },
    out,
  );
}
