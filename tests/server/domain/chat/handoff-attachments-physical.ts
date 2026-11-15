// A room's chat-attached world books, regex scripts and documents across a host handoff, through the owners' own verbs.

import { createCharacterSchema } from "@orb/contracts/character";
import type { PromptConfig } from "@orb/contracts/preset";
import { createRegexScriptSchema } from "@orb/contracts/regex";
import { createBookSchema, createEntrySchema } from "@orb/contracts/world-info";
import type { DocumentId, RegexScriptId, WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { finiteReplies } from "@orb/testkit/iso";
import { expect } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
  readRoomCanon,
  SUMMARIZE_TRANSCRIPT_MARKER,
  seedCorpusConnections,
  summaryReply,
} from "@orb/testkit/node/composed";
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

/** What the memory build's summarizer answers, and the room's preset when the room needs its own. */
interface DocumentRoomOptions {
  readonly summary?: Parameters<typeof summaryReply>[0];
  readonly promptConfig?: PromptConfig;
}

const WITNESS_SUMMARY = { anchor: "An indexed witness scene", facts: "Two witnesses were recorded.", keywords: ["witness"] } as const;

/** A room whose provider answers the memory build's summary requests as well as the finite turn replies, so
 *  {@link embedDocuments} can run the host's real memory sweep. */
export async function documentRoom(replies: readonly string[], options: DocumentRoomOptions = {}): Promise<ChatRoot> {
  await using construction = new AsyncDisposableStack();
  const nextReply = construction.use(finiteReplies("document room", replies)).take;
  const summary = summaryReply(options.summary ?? WITNESS_SUMMARY);
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    chatText: (body): string => (body.includes(SUMMARIZE_TRANSCRIPT_MARKER) ? summary : nextReply()),
  });
  const h = construction.use(
    await createChatRoot({
      providerFetch: provider.execute,
      memoryEnabled: false,
      ...(options.promptConfig === undefined ? {} : { promptConfig: options.promptConfig }),
    }),
  );
  const lifetime = construction.move();
  return { ...h, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

/** A text document `owner` attaches to the room through the host-gated databank verb, ingested by the production
 *  ingest product. Retrieval also needs the owner's embedding sweep: {@link embedDocuments}. */
export async function attachRoomDocument(h: ChatRoot, owner: Person, document: { readonly name: string; readonly text: string }): Promise<DocumentId> {
  const created = await h.root.services.databank.createFromText({
    signal: new AbortController().signal,
    principal: owner,
    name: document.name,
    text: document.text,
  });
  await h.root.services.databank.attachToChat({ principal: owner, chatId: h.chatId, documentId: created.document.id });
  await ingest(h, created.document.id);
  return created.document.id;
}

export async function ingest(h: ChatRoot, documentId: DocumentId): Promise<void> {
  const ingested = await h.root.app.databankIngest.ingestDocument({ documentId, signal: new AbortController().signal });
  expect(ingested.failed).toEqual([]);
}

/** Each owner's production index, memory and databank sweeps, so every owner's chunks sit in one promoted embedding
 *  space. A space promotes only when cards, memory and documents all report the same generation, and the room
 *  host's memory scope reports only after a real build over canon, so the host first commits a short history. */
export async function embedDocuments(h: ChatRoot, host: Person, owners: readonly Person[]): Promise<void> {
  const runAdmittedWorkload = h.root.runAdmittedWorkload;
  if (runAdmittedWorkload === undefined) {
    throw new Error("the composed root has no admitted-workload driver");
  }
  await h.caller.settings.updateAppSettings({ partial: { memoryDefaults: { mode: "mixB", blockSize: 2, verbatimWindow: 0, maxTier: 0 } } });
  for (const content of ["The first indexed witness.", "The second indexed witness."]) {
    await h.root.services.chat.commitMessage({ principal: host, chatId: h.chatId, content, timeZone: UTC_TIME_ZONE });
  }
  const lifetime = new AbortController();
  try {
    for (const owner of owners) {
      const caller = await h.root.internalCallerFor(owner.userId);
      // A backfill refuses an owner whose memory is off, and the memory scope reports only through one.
      await caller.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: true } });
      for (const input of [
        { kind: "index", params: { source: "text" } },
        { kind: "memory-backfill", params: {} },
        { kind: "databank-reindex", params: { scope: { kind: "owner" }, mode: "chunk-embed" } },
      ] as const) {
        const job = await caller.workloads.start({ input, mode: "singular" });
        await runAdmittedWorkload(job.id, lifetime.signal);
        expect(await caller.workloads.get({ id: job.id })).toMatchObject({ status: "succeeded" });
      }
      expect(await h.root.services.search.spaceStatus({ ownerId: owner.userId })).toMatchObject({ embed: false });
    }
  } finally {
    lifetime.abort();
  }
}

/** The documents the room's panel lists to `viewer`, the same scope its retrieval reads. */
export async function roomDocuments(h: ChatRoot, viewer: Person): Promise<readonly DocumentId[]> {
  return (await h.root.services.databank.listActiveForChat({ signal: new AbortController().signal, principal: viewer, chatId: h.chatId })).map(
    (view) => view.id,
  );
}

/** The room's attached book and script ids, through the member-read rack verbs. */
export async function roomRack(h: ChatRoot, viewer: Person): Promise<{ readonly books: readonly WorldBookId[]; readonly scripts: readonly RegexScriptId[] }> {
  const [books, scripts] = await Promise.all([
    h.root.services.worldInfo.listForChat({ principal: viewer, chatId: h.chatId }),
    h.root.services.regex.listForChat({ principal: viewer, chatId: h.chatId }),
  ]);
  return { books: books.map((book) => book.id), scripts: scripts.map((script) => script.id) };
}
