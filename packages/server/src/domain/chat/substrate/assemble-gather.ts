// domain/chat/substrate/assemble-gather — the CHAT-INTERNAL gather (the impure shell BEFORE the pure BUILD
// core). The turn's assemble inputs split by OWNERSHIP (see contract/foreign.ts): this gathers the half CHAT
// owns and merges it with the FOREIGN DTO, then calls the pure `buildAssembleContext`. Homed in `substrate/`
// because it COORDINATES three named subsystems — `assembly/` (buildAssembleContext), `memory/` (recallMemory),
// and the regex-tier substrate — plus `persistence/` reads; cross-subsystem coordination is the substrate seam
// (dep-cruiser `domain-substrate-mediates-subsystems` / `domain-no-cross-subsystem` — a verb or an `assembly/`
// file may NOT import `memory/` directly). `buildAssembleContext` stays PURE (no reads added there); this shell
// does every chat-side read and hands it a fully-resolved input literal.
//
// THE CHAT-INTERNAL HALF (chat owns the data/subsystem — reads it ITSELF via `ChatContext`):
//   • recentMessages / lastMessage / lastUserMessage / lastCharMessage — the committed canon (D26 slot⋈variant),
//     prompt-eligible only (`excludedFromPrompt` filtered); `recentMessages` is scan-depth sliced (the WI haystack).
//   • userInjections — the persisted `chat_injections` rows (mapped to `ChatInjection`).
//   • roomOverrides — the chat metadata `roomOverrides` sub-blob (absent ⇒ no room tier).
//   • WI is EMERGENT — no `worldInfoEnabled` input; the 4-scope pool yields attached+enabled+present (ST parity).
//   • variableValues — the per-chat ChoiceBlock flush (config plane, D46).
//   • compactSummary — the chat row's compaction checkpoint summary.
//   • memory — `recallMemory` (chat's own subsystem) over the shared/merged bucket (the round-level default).
//   • hostTierRegexScripts — the D53 union (host-global ∪ chat-preset ∪ present cast, via `resolveHostTierRegexScripts`).
//
// The FOREIGN DTO supplies promptConfig/personas/globalRegexScripts/scanDepth/injectionTokenBudget/
// memoryConfig (settings/preset/persona reads chat must NOT perform — contract/foreign.ts).

import type { CharacterCard } from "@orb/contracts/character";
import type { AssembleContext, ChatInjection } from "@orb/contracts/chat";
import type { CharacterId, ChatId, PersonaId, UserId } from "@orb/kit/ids";
import { buildAssembleContext } from "../assembly/context";
import type { ChatContext } from "../contract/context";
import type { ForeignInputs } from "../contract/foreign";
import type { MsgRow } from "../contract/memory";
import { recallMemory } from "../memory/recall/recall";
import {
  loadCanonHistory,
  loadChatInjections,
  loadChatRow,
  loadStoredVariables,
} from "../persistence/queries";
import { resolveHostTierRegexScripts } from "./regex-tier";

/** The SEND USER_INPUT regex out-param sink (chat.md §2/§7) — `buildAssembleContext` writes the post-regex user
 *  text here so the verb persists THAT. Structural + file-local (the `types-in-contract` gate; the verb passes a
 *  `{ sendUserText?: string }`). Threaded straight through to the pure core. */
interface SendRegexSink {
  sendUserText?: string;
}

/** A committed canon row, prompt-eligible (the slim shape the gather projects from `MessageView`). */
interface CanonRow {
  readonly seq: number;
  readonly role: MsgRow["role"];
  readonly characterId: CharacterId | null;
  readonly authorUserId: UserId | null;
  readonly content: string;
}

/** Resolve the present cast's live cards (D28) under the host's ownership — the regex-tier cast source + the
 *  recall name map. A gone / mid-delete card (`null`) is skipped (never an error). */
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

/** Map a persisted `chat_injections` row → the `ChatInjection` wire shape (omit `order` when null — exact
 *  optional). */
function toChatInjection(
  row: Awaited<ReturnType<typeof loadChatInjections>>[number],
): ChatInjection {
  return {
    position: row.position,
    depth: row.depth,
    role: row.role,
    content: row.content,
    ...(row.order !== null ? { order: row.order } : {}),
  };
}

/** Resolve the `{{memory}}` string for the round (the GATHER input). Round-level recall uses the SHARED/merged
 *  bucket (the synthetic group-as-character, or the primary cast char when none is minted — solo keys with the
 *  cast char); `witnessing` is the shared/merged default (undefined). Per-speaker egocentric recall +
 *  `liveWindowCutoffSeq` are post-assemble refinements (FLAG[recall-livewindow-cutoff]). Returns "" when there
 *  is no character to key on (`recallMemory` early-returns on off / empty-pool — inv 10, no embed). */
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
    // FLAG[recall-livewindow-cutoff]: the exact per-speaker `liveWindowCutoffSeq` comes from the engine's §8
    // history-budget fit, which runs AFTER assemble — unavailable here. Left undefined (no live-window redundancy
    // trim this round); the FIXED build-protect verbatimWindow still prevents recall/verbatim gaps. The precise
    // engine-supplied per-speaker fit is the refinement.
    ...(args.foreign.memoryConfig !== undefined && args.foreign.memoryConfig !== null
      ? { config: args.foreign.memoryConfig }
      : {}),
    recent: args.recent,
    names: args.names,
  });
}

/**
 * Gather the CHAT-INTERNAL assemble inputs, merge with the FOREIGN DTO, and produce the IMMUTABLE per-turn
 * `AssembleContext` via the PURE `buildAssembleContext`. `out`, when supplied with a SEND turn (`pendingUserText`
 * + host-tier scripts), receives the post-USER_INPUT-regex text for the verb to PERSIST (chat.md §2/§7).
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
  },
  foreign: ForeignInputs,
  out?: SendRegexSink,
): Promise<AssembleContext> {
  const { chatId, runAsUserId, model, castCharacterIds, personaIds } = args;

  const [chatRow, canon, injectionRows, storedVariables, cast] = await Promise.all([
    loadChatRow(ctx.db, chatId),
    loadCanonHistory(ctx.db, chatId),
    loadChatInjections(ctx.db, chatId),
    loadStoredVariables(ctx.db, chatId),
    loadCastCards(ctx, runAsUserId, castCharacterIds),
  ]);

  // The prompt-eligible canon (hidden rows excluded) — the WI haystack + the {{lastMessage}}-family inputs.
  const eligible: CanonRow[] = canon
    .filter((m) => !m.excludedFromPrompt)
    .map((m) => ({
      seq: m.seq,
      role: m.role,
      characterId: m.characterId,
      authorUserId: m.authorUserId,
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

  // The D53 host-tier regex union (host-global ∪ chat-preset ∪ present cast), deterministically ordered/deduped.
  const hostTierRegexScripts = resolveHostTierRegexScripts({
    hostGlobal: foreign.globalRegexScripts,
    preset: foreign.promptConfig.regexScripts,
    cast: cast.cards,
  });

  // WI activation is EMERGENT (ST parity — no master toggle): the 4-scope pool yields whatever is attached +
  // entry-enabled + present, and an empty pool ⇒ no lore. The `world_info_before/_after` anchors only POSITION
  // the always-scope bucket (DEFAULT_PROMPT_CONFIG now ships them); they are NOT an on/off gate. So there is no
  // `worldInfoEnabled` input — the pool decides.
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
      variableValues: storedVariables ?? {},
      injectionTokenBudget: foreign.injectionTokenBudget,
      hostTierRegexScripts,
      model,
      generationType: "normal",
      nowMs: ctx.now(),
      ...(roomOverrides !== undefined ? { roomOverrides } : {}),
      // FLAG[timezone-per-request]: `{{time}}`/`{{date}}` render server-side into the prompt, but the time
      // zone is the CALLER's browser zone, supplied PER-REQUEST (client.md: epoch-UTC on the wire, the browser
      // localizes; `@orb/kit/macro` honors a per-request `ctx.timezone` → server-local fallback). It is NOT a
      // host setting (removed from `ForeignInputs` — a host-frozen DTO is the wrong home, D19). Until the turn
      // request carries the client zone (a Phase-6 client send), `timezone` is unset ⇒ the macro engine falls
      // back to server-local — never a stored/foreign value.
      ...(lastMessage !== undefined ? { lastMessage } : {}),
      ...(lastUserMessage !== undefined ? { lastUserMessage } : {}),
      ...(lastCharMessage !== undefined ? { lastCharMessage } : {}),
      ...(args.pendingUserText !== undefined
        ? { pendingUserText: args.pendingUserText, currentInput: args.pendingUserText }
        : {}),
    },
    out,
  );
}
