// A room's chat-attached world books and regex scripts across a host handoff, through the owners' own verbs.

import { createCharacterSchema } from "@orb/contracts/character";
import { createRegexScriptSchema } from "@orb/contracts/regex";
import { createBookSchema, createEntrySchema } from "@orb/contracts/world-info";
import type { RegexScriptId, WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { readRoomCanon, seedCorpusConnections } from "@orb/testkit/node/composed";
import { wireOf, wireText } from "./scenario-physical.ts";

type Person = ChatRoot["owner"];

/** One chat-attached book with one always-on entry, and one chat-attached USER_INPUT script, both owned by `owner`. */
export interface RoomAttachments {
  readonly bookId: WorldBookId;
  readonly entryId: WorldEntryId;
  readonly scriptId: RegexScriptId;
}

/** Attach `owner`'s own book and script to the room through the host-gated attach verbs. */
export async function attachRoomAttachments(
  h: ChatRoot,
  owner: Person,
  text: { readonly lore: string; readonly find: string; readonly replace: string },
): Promise<RoomAttachments> {
  const book = await h.root.services.worldInfo.createBook({ principal: owner, input: createBookSchema.parse({ name: `${text.lore} book` }) });
  const entry = await h.root.services.worldInfo.createEntry({
    principal: owner,
    bookId: book.id,
    input: createEntrySchema.parse({ title: "Room", content: text.lore }),
  });
  await h.root.services.worldInfo.attachToChat({ principal: owner, chatId: h.chatId, bookId: book.id });
  const script = await h.root.services.regex.createScript({
    principal: owner,
    input: createRegexScriptSchema.parse({
      name: `${text.replace} script`,
      findRegex: `/${text.find}/g`,
      replaceString: text.replace,
      placement: ["USER_INPUT"],
    }),
  });
  await h.root.services.regex.attachToChat({ principal: owner, chatId: h.chatId, scriptId: script.id });
  return { bookId: book.id, entryId: entry.id, scriptId: script.id };
}

/** The former owner rewrites the entry and the replace string they still own. */
export async function editAttachments(
  h: ChatRoot,
  owner: Person,
  attached: RoomAttachments,
  text: { readonly lore: string; readonly replace: string },
): Promise<void> {
  await h.root.services.worldInfo.updateEntry({ principal: owner, entryId: attached.entryId, input: { content: text.lore } });
  await h.root.services.regex.updateScript({ principal: owner, scriptId: attached.scriptId, input: { replaceString: text.replace } });
}

/** The room owner nominates `nominee`, with or without the copy offer. */
export async function nominate(h: ChatRoot, nominee: Person, copyCharacters: boolean): Promise<void> {
  await h.root.services.chat.nominateHostHandoff({
    principal: h.owner,
    chatId: h.chatId,
    userId: nominee.userId,
    offer: { copyCharacters, copyGmPreset: false },
  });
}

/** Give the nominee a funding connection and run the production accept. */
export async function accept(h: ChatRoot, nominee: Person): Promise<void> {
  await seedCorpusConnections(h.root, nominee);
  await h.root.services.chat.acceptHostHandoff({ principal: nominee, chatId: h.chatId });
}

export async function handOff(h: ChatRoot, nominee: Person, copyCharacters: boolean): Promise<void> {
  await nominate(h, nominee, copyCharacters);
  await accept(h, nominee);
}

/** Seat a card the new host owns, so a room whose former host's seats were dropped can still take a turn. */
export async function seatOwnCard(h: ChatRoot, host: Person): Promise<void> {
  const card = await h.root.services.character.create({
    principal: host,
    input: createCharacterSchema.parse({ handle: "handoff-bea", name: "Bea", description: "The new host's own card." }),
  });
  await h.root.services.chat.addCharacterToChat({ principal: host, chatId: h.chatId, characterId: card.id });
}

/** One sent turn: every string the provider received, and the stored user message the turn committed. */
export interface SentTurn {
  readonly wire: string;
  readonly stored: string;
}

export async function sendTurn(h: ChatRoot, sender: Person, content: string): Promise<SentTurn> {
  const { outcome, newest } = await wireOf(h, () => h.root.services.chat.send({ principal: sender, chatId: h.chatId, content, timeZone: UTC_TIME_ZONE }));
  expect(outcome.aborted).toBe(false);
  await h.root.settleBackground();
  const user = (await readRoomCanon(h.root, sender, h.chatId)).findLast((message) => message.role === "user");
  if (user === undefined) {
    throw new Error("the sent turn committed no user message");
  }
  return { wire: wireText(newest), stored: user.content };
}

/** The room's attached book and script ids, through the member-read rack verbs. */
export async function roomRack(h: ChatRoot, viewer: Person): Promise<{ readonly books: readonly WorldBookId[]; readonly scripts: readonly RegexScriptId[] }> {
  const [books, scripts] = await Promise.all([
    h.root.services.worldInfo.listForChat({ principal: viewer, chatId: h.chatId }),
    h.root.services.regex.listForChat({ principal: viewer, chatId: h.chatId }),
  ]);
  return { books: books.map((book) => book.id), scripts: scripts.map((script) => script.id) };
}
