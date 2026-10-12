import type { CharacterCard } from "@orb/contracts/character";
import type { ChatInjection, RoomOverrides } from "@orb/contracts/chat";
import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { RegexScriptRow } from "@orb/contracts/regex";
import { regexScriptSchema } from "@orb/contracts/regex";
import type { Db } from "@orb/db";
import { characterBooks, chatBooks, worldBooks, worldEntries } from "@orb/db";
import type { CharacterId, ChatId, UserId, WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { FROZEN_AT_MS } from "@orb/testkit/iso/clock.ts";
import { freshDb } from "@orb/testkit/node/db.ts";
import { beforeEach } from "vitest";
import type { buildAssembleContext } from "#server/domain/chat/assembly/context.ts";
import type { ChatContext } from "#server/domain/chat/context.ts";
import { makeChatContext } from "../_support.ts";

export { buildAssembleContext } from "#server/domain/chat/assembly/context.ts";
export type { ChatContext } from "#server/domain/chat/context.ts";

export let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

export function cardOf(name: string): CharacterCard {
  return {
    name,
    description: `${name} the knight`,
    personality: null,
    scenario: null,
    greetings: [],
    exampleMessages: null,
    systemPrompt: null,
    postHistoryInstructions: null,
    depthPrompt: null,
    creatorNotes: null,
    creator: null,
    cardVersion: null,
    nickname: null,
    source: null,
    creationDate: null,
    modificationDate: null,
    regexScripts: [],
    extensions: null,
    residualData: null,
    avatarAssetId: null,
    refinery: null,
  };
}

/** A ChatContext whose getCard returns `card` for any id (the injected live-card read — D28). */
export function ctxWithCard(card: CharacterCard): ChatContext {
  return makeChatContext(db, { getCard: () => Promise.resolve(card) });
}

/** Attach a chat-scope book with one entry to `chatId`. `keys` ⇒ keyword scope; `inject` ⇒ depth-inject;
 *  else always-scope. */
export async function attachChatEntry(
  owner: UserId,
  chatId: ChatId,
  key: string,
  entry: { content: string; keys?: string[]; priority?: number; inject?: { depth: number } },
): Promise<void> {
  const bookId = castId<WorldBookId>(`world_book_${key}`);
  await db.insert(worldBooks).values({ id: bookId, ownerId: owner, name: key, createdAt: FROZEN_AT_MS });
  await db.insert(worldEntries).values({
    id: castId<WorldEntryId>(`world_entry_${key}`),
    worldBookId: bookId,
    title: key,
    content: entry.content,
    keys: entry.keys ?? null,
    enabled: true,
    priority: entry.priority ?? 0,
    ignoreBudget: false,
    metadata: entry.inject ? { inject: { depth: entry.inject.depth } } : null,
    createdAt: FROZEN_AT_MS,
  });
  await db.insert(chatBooks).values({ chatId: castId(chatId), worldBookId: bookId, createdAt: FROZEN_AT_MS });
}

/** Attach a CHARACTER-scope book with one always-scope entry to `characterId`, the book owned by `owner`. */
export async function attachCharacterEntry(owner: UserId, characterId: CharacterId, key: string, content: string): Promise<void> {
  const bookId = castId<WorldBookId>(`world_book_${key}`);
  await db.insert(worldBooks).values({ id: bookId, ownerId: owner, name: key, createdAt: FROZEN_AT_MS });
  await db.insert(worldEntries).values({
    id: castId<WorldEntryId>(`world_entry_${key}`),
    worldBookId: bookId,
    title: key,
    content,
    keys: null,
    enabled: true,
    priority: 0,
    ignoreBudget: false,
    metadata: null,
    createdAt: FROZEN_AT_MS,
  });
  await db.insert(characterBooks).values({ characterId, worldBookId: bookId, role: "auxiliary", createdAt: FROZEN_AT_MS });
}

export interface InputOver {
  pendingUserText?: string;
  recentMessages?: string[];
  userInjections?: ChatInjection[];
  injectionTokenBudget?: number;
  hostTierRegexScripts?: RegexScriptRow[];
  roomOverrides?: RoomOverrides;
  mutedSpeakerKeys?: ReadonlySet<string>;
  promptConfig?: PromptConfig;
}
export function inputOf(chatId: ChatId, ownerId: UserId, castIds: CharacterId[], over: InputOver = {}): Parameters<typeof buildAssembleContext>[1] {
  return {
    timezone: UTC_TIME_ZONE,
    chatId: castId(chatId),
    ownerId,
    characterIds: castIds,
    personaIds: [],
    promptConfig: over.promptConfig ?? DEFAULT_PROMPT_CONFIG,
    personas: { anchor: null, active: null },
    recentMessages: over.recentMessages ?? [],
    userInjections: over.userInjections ?? [],
    variableValues: {},
    model: "test-model",
    injectionTokenBudget: over.injectionTokenBudget ?? 0,
    ...(over.pendingUserText !== undefined ? { pendingUserText: over.pendingUserText } : {}),
    ...(over.hostTierRegexScripts !== undefined ? { hostTierRegexScripts: over.hostTierRegexScripts } : {}),
    ...(over.roomOverrides !== undefined ? { roomOverrides: over.roomOverrides } : {}),
    ...(over.mutedSpeakerKeys !== undefined ? { mutedSpeakerKeys: over.mutedSpeakerKeys } : {}),
  };
}

/** The two `preset.rewriteToggle.*` shipped defaults the ARM B parity proofs quote — the EXACT bytes the
 *  browser used to join before the templating fork moved the composition server-side (owner 2026-08-09).
 *  Spelled as literals, never read from the catalog: a proof that sources its expectation from the thing
 *  under test cannot catch the thing changing. */
export const PARITY_CONCISE = "Make it more concise and tighter — cut filler while keeping the substance";
export const PARITY_PAST = "Rewrite entirely in the past tense";

/** A fully-defaulted host-tier `RegexScript` (via the parse seam) for the given placement. */
export function regexScript(label: string, find: string, replace: string, placement: "USER_INPUT" | "WORLD_INFO"): RegexScriptRow {
  return regexScriptSchema.parse({
    // D121-E: a row id is a real `regex_script_…` TypeID; the readable label rides on `name`.
    id: mintTypeId(ID_PREFIX.regexScript),
    name: label,
    // X-16: `updatedAt` is REQUIRED on the row (the edited stamp) — a fixed instant keeps the double honest.
    updatedAt: 1_700_000_000_000,
    findRegex: find,
    replaceString: replace,
    placement: [placement],
  });
}

/** The turn's injections minus the new-chat marker, which rides every turn (G9). */
export function besidesMarker(injections: readonly ChatInjection[] | undefined): readonly ChatInjection[] {
  return (injections ?? []).filter((i) => i.origin !== "new-chat-marker");
}
