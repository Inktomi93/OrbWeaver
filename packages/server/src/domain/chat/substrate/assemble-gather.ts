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
import type { AssembleContext, ChatInjection } from "@orb/contracts/chat";
import type { GenerationType } from "@orb/contracts/preset";
import type { CharacterId, ChatId, PersonaId, UserId } from "@orb/kit/ids";
import { buildAssembleContext } from "../assembly/context";
import type { ChatContext } from "../context";
import type { ForeignInputs } from "../contract/foreign";
import type { MsgRow } from "../contract/memory";
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

/** Map a persisted `chat_injections` row → the `ChatInjection` wire shape (omit `order` when null). */
function toChatInjection(row: Awaited<ReturnType<typeof loadChatInjections>>[number]): ChatInjection {
  return {
    position: row.position,
    depth: row.depth,
    role: row.role,
    content: row.content,
    ...(row.order !== null ? { order: row.order } : {}),
  };
}

/** Resolve the `{{memory}}` string for the round. Round-level recall uses the shared/merged bucket (the
 *  synthetic group-as-character, or the primary cast char when none is minted). Returns "" when there is
 *  no character to key on. */
async function gatherMemory(
  ctx: ChatContext,
  args: {
    readonly chatId: ChatId;
    readonly runAsUserId: UserId;
    readonly castCharacterIds: readonly CharacterId[];
    readonly foreign: ForeignInputs;
    readonly recent: readonly MsgRow[];
    readonly names: ReadonlyMap<CharacterId, string>;
  },
): Promise<string> {
  const group = await ctx.findSyntheticGroupCharacter({
    ownerId: args.runAsUserId,
    chatId: args.chatId,
  });
  const sharedCharId = group?.characterId ?? args.castCharacterIds[0] ?? null;
  if (sharedCharId === null) {
    return "";
  }
  return await recallMemory(ctx, {
    scope: {
      chatId: args.chatId,
      scopedCharacterId: sharedCharId,
      isGroup: args.castCharacterIds.length > 1,
    },
    groupCharacterId: sharedCharId,
    // FLAG[recall-livewindow-cutoff]: the exact per-speaker liveWindowCutoffSeq comes from the engine's
    // post-assemble history-budget fit — unavailable here. Left undefined (no live-window trim this round).
    ...(args.foreign.memoryConfig !== undefined && args.foreign.memoryConfig !== null ? { config: args.foreign.memoryConfig } : {}),
    recent: args.recent,
    names: args.names,
  });
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

  const memory = await gatherMemory(ctx, {
    chatId,
    runAsUserId,
    castCharacterIds,
    foreign,
    recent: recentRows,
    names: cast.names,
  });

  // The host-tier regex union (host-global ∪ chat-preset ∪ present cast), deterministically ordered/deduped.
  const hostTierRegexScripts = resolveHostTierRegexScripts({
    hostGlobal: foreign.globalRegexScripts,
    preset: foreign.promptConfig.regexScripts,
    cast: cast.cards,
  });

  // WI activation is emergent (no master toggle): the 4-scope pool yields whatever is attached +
  // entry-enabled + present, and an empty pool ⇒ no lore. There is no `worldInfoEnabled` input.
  const roomOverrides = chatRow?.metadata.roomOverrides;

  return await buildAssembleContext(
    ctx,
    {
      chatId,
      ownerId: runAsUserId,
      castCharacterIds,
      personaIds,
      promptConfig: foreign.promptConfig,
      personas: foreign.personas,
      recentMessages,
      userInjections: injectionRows.map(toChatInjection),
      memory,
      compactSummary: chatRow?.compactSummary ?? null,
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
    },
    out,
  );
}
