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
// scripts (host-global ∪ chat-preset ∪ present cast).
//
// The foreign DTO supplies promptConfig/personas/globalRegexScripts/scanDepth/injectionTokenBudget/
// memoryConfig (settings/preset/persona reads chat must not perform).

import type { CharacterCard } from "@orb/contracts/character";
import type { AssembleContext, ChatInjection, MessageView } from "@orb/contracts/chat";
import { lastVisibleAssistant } from "@orb/contracts/chat";
import type { GenerationType } from "@orb/contracts/preset";
import type { CharacterId, ChatId, PersonaId, UserId } from "@orb/kit/ids";
import type { MacroRegistry } from "@orb/kit/macro";
import { humanizeDuration } from "@orb/kit/time";
import { buildAssembleContext } from "../assembly/context";
import type { ChatContext } from "../context";

import type { ForeignInputs } from "../contract/foreign";
import type { MemoryRecallInputs, MsgRow } from "../contract/memory";
import type { GuidedSteer } from "../contract/params";
import { recallMemory } from "../memory/recall/recall";
import { loadCanonHistory, loadChatInjections, loadChatRow, loadStoredVariables, loadVariableDeltas } from "../persistence/queries";
import { resolveHostTierRegexScripts } from "./regex-tier";
import { foldChain } from "./runtime-variables";
import { resolveChoiceVariables } from "./variables";

/** The SEND USER_INPUT regex out-param sink — `buildAssembleContext` writes the post-regex user text
 *  here so the verb persists that. Threaded straight through to the pure core. */
interface SendRegexSink {
  sendUserText?: string;
  /** The round-level recall inputs for the engine's per-speaker witnessed re-run (D6) — written by
   *  `gatherMemory` (NOT the pure core, which never touches it). `null` ⇒ no character to key on. */
  memoryRecall?: MemoryRecallInputs | null;
}

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
    readonly pendingUserText: string | undefined;
    readonly eligibleContent: readonly string[];
    /** The host's databank settings (DB6), from ForeignInputs — retrieval params + the slot budget. */
    readonly foreign: ForeignInputs;
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
  const result = await ctx.gatherDatabank({
    chatId: args.chatId,
    queryText,
    tokenBudget: args.foreign.databankSlotTokenBudget ?? DATABANK_SLOT_TOKEN_BUDGET,
    ...(retrieval !== undefined ? { k: retrieval.k, minScore: retrieval.minScore, rerank: retrieval.rerank } : {}),
  });
  return result === null ? undefined : result.text;
}

/** A committed canon row, prompt-eligible (the slim shape the gather projects from `MessageView`). */
interface CanonRow {
  readonly seq: number;
  readonly role: MsgRow["role"];
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

/** Resolve the present cast's live cards under the host's ownership — the regex-tier cast source + the
 *  recall name map. A gone/mid-delete card (`null`) is skipped, never an error. */
async function loadCastCards(
  ctx: ChatContext,
  ownerId: UserId,
  castCharacterIds: readonly CharacterId[],
): Promise<{ cards: CharacterCard[]; names: Map<CharacterId, string> }> {
  const loaded = await Promise.all(
    castCharacterIds.map(async (characterId) => ({
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

/** Resolve the `{{memory}}` string for the round. Round-level recall uses the shared/merged bucket (the
 *  synthetic group-as-character, or the primary cast char when none is minted). Returns "" when there is
 *  no character to key on. When `out` is supplied, stages the round-level recall inputs for the engine's
 *  per-speaker witnessed re-run (D6). */
async function gatherMemory(
  ctx: ChatContext,
  args: {
    readonly chatId: ChatId;
    readonly runAsUserId: UserId;
    readonly castCharacterIds: readonly CharacterId[];
    readonly foreign: ForeignInputs;
    readonly recent: readonly MsgRow[];
    readonly names: ReadonlyMap<CharacterId, string>;
    /** The live-window cutoff seq (the seq below which messages aren't in the prompt) — the PREVIOUS turn's
     *  canon fit boundary. `undefined` ⇒ no prior boundary stamp ⇒ no live-window trim this round. */
    readonly liveWindowCutoffSeq: number | undefined;
  },
  out?: SendRegexSink,
): Promise<string> {
  const group = await ctx.findSyntheticGroupCharacter({
    ownerId: args.runAsUserId,
    chatId: args.chatId,
  });
  const sharedCharId = group?.characterId ?? args.castCharacterIds[0] ?? null;
  if (sharedCharId === null) {
    if (out !== undefined) {
      out.memoryRecall = null;
    }
    return "";
  }
  const config = args.foreign.memoryConfig ?? null;
  if (out !== undefined) {
    out.memoryRecall = {
      groupCharacterId: sharedCharId,
      recent: args.recent,
      names: args.names,
      config,
      ...(args.liveWindowCutoffSeq !== undefined ? { liveWindowCutoffSeq: args.liveWindowCutoffSeq } : {}),
    };
  }
  return await recallMemory(ctx, {
    scope: {
      chatId: args.chatId,
      scopedCharacterId: sharedCharId,
      isGroup: args.castCharacterIds.length > 1,
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
  });
}

/** The recall live-window cutoff seq = the PREVIOUS turn's canon fit boundary: the newest ASSISTANT row's
 *  stored `contextBoundaryMessageId` resolved to its seq. `undefined` when no assistant row carries a boundary
 *  stamp (a fresh chat, or the last turn dropped nothing → null stamp) — then recall applies no live-window
 *  trim. A stamped boundary id whose target isn't in canon (edited/deleted since) also yields `undefined`. */
function resolveLiveWindowCutoffSeq(canon: readonly MessageView[]): number | undefined {
  // `lastVisibleAssistant`: an rpg state anchor (the empty-body snapshot key a host resync/hand-edit
  // appends) is an assistant ROW but never a generation — it carries no fit-pass stamp, so letting it
  // answer here silently disabled the recall live-window trim for the rest of the game.
  const lastAssistant = lastVisibleAssistant(canon);
  const boundaryId = lastAssistant?.contextBoundaryMessageId ?? null;
  if (boundaryId === null) {
    return;
  }
  return canon.find((m) => m.id === boundaryId)?.seq;
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
    readonly castCharacterIds: readonly CharacterId[];
    /** Present seated agents (D60), soul-resolved by `loadRoom`; threaded straight to the pure build core. */

    /** The muted-seat `speakerKey`s from `loadRoom` (character + agent) — the `castNotMuted` producer. */
    readonly mutedSpeakerKeys?: ReadonlySet<string> | undefined;
    readonly personaIds: readonly PersonaId[];
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
    /** A game turn's depth-0 format-reminder injection(s) (rpg-design/05 §1) — merged into the chat injection
     *  list (recency-biased, nearest generation via their `depth:0`). Absent ⇒ no rpg injection. */
    readonly rpgInjections?: readonly ChatInjection[] | undefined;
    /** The chat-crew director's guidance injection(s) (chat-crew-design/04 §1) — merged into the chat injection
     *  list at the author's-note depth. Absent ⇒ director off / no pass ⇒ byte-identical non-crew turn. */
    readonly crewInjections?: readonly ChatInjection[] | undefined;
    /** The per-turn user-macro RENDER + FREEZE registries (WAVE MU) — threaded verbatim to the pure build.
     *  Absent ⇒ the pure build falls back to the process singletons (byte-identical non-user-macro turn). */
    readonly macroRegistry?: MacroRegistry | undefined;
    readonly freezeMacroRegistry?: MacroRegistry | undefined;
  },
  foreign: ForeignInputs,
  out?: SendRegexSink,
): Promise<AssembleContext> {
  const { chatId, runAsUserId, model, castCharacterIds, personaIds } = args;

  const [chatRow, canon, injectionRows, storedVariables, variableDeltas, cast] = await Promise.all([
    loadChatRow(ctx.db, chatId),
    loadCanonHistory(ctx.db, chatId),
    loadChatInjections(ctx.db, chatId),
    loadStoredVariables(ctx.db, chatId),
    loadVariableDeltas(ctx.db, chatId),
    loadCastCards(ctx, runAsUserId, castCharacterIds),
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

  const [memory, databank] = await Promise.all([
    gatherMemory(
      ctx,
      {
        chatId,
        runAsUserId,
        castCharacterIds,
        foreign,
        recent: recentRows,
        names: cast.names,
        liveWindowCutoffSeq: resolveLiveWindowCutoffSeq(canon),
      },
      out,
    ),
    gatherDatabank(ctx, { chatId, pendingUserText: args.pendingUserText, eligibleContent: eligible.map((m) => m.content), foreign }),
  ]);

  // The host-tier regex union (global ∪ preset ∪ cast ∪ room), deterministically ordered/deduped. D121-E:
  // the four slices are LIBRARY ROWS dereferenced from their scope junctions by the injected regex op — the
  // three embed-by-value carriers this used to read (settings blob / preset blob / card column) are gone.
  // Resolved under `runAsUserId` (the frozen host, D19), so a member never widens the room's set.
  const hostTierRegexScripts = resolveHostTierRegexScripts(
    await ctx.resolveRegexSources({
      ownerId: runAsUserId,
      presetId: foreign.presetId ?? null,
      characterIds: castCharacterIds,
      chatId,
    }),
  );

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
      castCharacterIds,

      mutedSpeakerKeys: args.mutedSpeakerKeys,
      personaIds,
      promptConfig: foreign.promptConfig,
      personas: foreign.personas,
      recentMessages,
      // The user/WI injections + a game turn's depth-0 reminder injection(s) (05 §1) + the crew director's
      // guidance injection (chat-crew-design/04 §1); absent rpg/crew ⇒ unchanged.
      // The rpg reminder is stamped `game-state` HERE (the ONE merge site) so the BUILD walk can account the
      // state block as its own budget source without chat ever reading an rpg type.
      userInjections: [
        ...injectionRows.map(toChatInjection),
        ...(args.rpgInjections ?? []).map((i): ChatInjection => ({ ...i, origin: "game-state" })),
        ...(args.crewInjections ?? []),
      ],
      memory,
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
