// @subject packages/server/src/domain/import/substrate/card.ts
// @subject packages/server/src/domain/import/verbs/import-character.ts
// @subject packages/server/src/domain/import/verbs/import-chat-bundle.ts
// @subject packages/server/src/entry/compose/current-export.ts
// A whole-library backup restored onto the library that wrote it. A card or room the app wrote carries no stored
// import key, so the lookup compares it with what the library exports now (D290): an unchanged library gains no row,
// a row edited since the backup keeps its edit and the backup's version lands beside it, and an imported row still
// matches by its stored key without an export.
import { createCharacterSchema } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import { modelIdSchema } from "@orb/contracts/inference";
import { createPersonaSchema } from "@orb/contracts/persona";
import type { PortableImportOutcome } from "@orb/contracts/portability";
import { exportCharacterPath } from "@orb/contracts/portability";
import { createRegexScriptSchema } from "@orb/contracts/regex";
import {
  assets,
  characters,
  characterTags,
  chats,
  documents,
  galleryItems,
  imageryGenerations,
  messages,
  messageVariants,
  personas,
  presets,
  regexScripts,
  tags,
  themes,
  worldBooks,
  worldEntries,
} from "@orb/db";
import type { CharacterHandle, CharacterId } from "@orb/kit/ids";
import { castId, ID_PREFIX } from "@orb/kit/ids";
import { createSeededIds, finiteReplies } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  exportLibrary,
  makeAssetBytes,
  readLibraryExport,
  restoreBundle,
  restoreBundleTally,
  seedCorpusConnections,
  signedInBox,
} from "@orb/testkit/node/composed";
import { count, eq } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { vi } from "vitest";

const SOURCE_ID_CURSOR = 2 ** 29;
const IMAGE_MODEL = modelIdSchema.parse("bridge-image-v1");
const INTENT = { maxContextTokens: 32_000, maxOutputTokens: 128 };
const REPLIES = ["The warden lifts the lantern.", "The bridge holds tonight.", "The warden shakes his head."];
const WARDEN = castId<CharacterHandle>("bridge-warden");
const WARDEN_DESCRIPTION = "A warden guards the bridge.";
/** The characters the owner writes in the app beside the warden, so the exporter count is per character. */
const PLAIN_CHARACTERS = [
  { handle: "ferry-keeper", name: "Ferry Keeper", description: "Keeps the ferry." },
  { handle: "toll-clerk", name: "Toll Clerk", description: "Counts the tolls." },
] as const;
const AUTHORED_CHARACTERS = 1 + PLAIN_CHARACTERS.length;
const HTTP_OK = 200;

const COUNTED_TABLES = [
  "characters",
  "characterTags",
  "chats",
  "messages",
  "messageVariants",
  "worldBooks",
  "worldEntries",
  "presets",
  "personas",
  "tags",
  "assets",
  "themes",
  "regexScripts",
  "documents",
  "galleryItems",
  "imageryGenerations",
] as const;
type RowCounts = Readonly<Record<(typeof COUNTED_TABLES)[number], number>>;

/** The row count of every table a library backup writes into, box-wide: the box holds only its owner's library. */
async function rowCounts(root: ServerTestHarness): Promise<RowCounts> {
  const rows = async (table: SQLiteTable): Promise<number> => (await root.db.select({ n: count() }).from(table).get())?.n ?? 0;
  return {
    characters: await rows(characters),
    characterTags: await rows(characterTags),
    chats: await rows(chats),
    messages: await rows(messages),
    messageVariants: await rows(messageVariants),
    worldBooks: await rows(worldBooks),
    worldEntries: await rows(worldEntries),
    presets: await rows(presets),
    personas: await rows(personas),
    tags: await rows(tags),
    assets: await rows(assets),
    themes: await rows(themes),
    regexScripts: await rows(regexScripts),
    documents: await rows(documents),
    galleryItems: await rows(galleryItems),
    imageryGenerations: await rows(imageryGenerations),
  };
}

/** The provider a lived-in library talks to: three scripted chat replies and one scripted picture. */
function libraryWire(): Disposable & { readonly execute: typeof fetch; readonly pictures: Uint8Array[] } {
  using construction = new DisposableStack();
  const nextReply = construction.use(finiteReplies("lived-in library", REPLIES)).take;
  const pictures: Uint8Array[] = [];
  const { execute } = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL, IMAGE_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: () => nextReply(),
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: pictures,
  });
  const lifetime = construction.move();
  return { [Symbol.dispose]: () => lifetime.dispose(), execute, pictures };
}

/** A library the owner built in the app, one row of each kind a backup carries: a character with art, a primary book,
 *  a tag and a script, and two plain characters; a persona, a preset, a theme, a loose book, a databank document, a
 *  gallery item and a generated picture; and a room with two turns and a swipe. Returns the warden's id. */
async function livedInLibrary(root: ServerTestHarness, pictures: Uint8Array[]): Promise<CharacterId> {
  const owner = await root.principalFor(root.ownerId);
  await root.services.settings.updateAppSettings({ principal: owner, partial: { privateEndpointAllowlist: [new URL(CORPUS_PROVIDER_ENDPOINT).hostname] } });
  await seedCorpusConnections(root, owner);
  const art = await root.services.assets.store({
    principal: owner,
    bytes: makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)),
    mime: "image/png",
    kind: "avatar",
    enforceMagic: true,
  });
  const warden = await root.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({ handle: WARDEN, name: "Warden", description: WARDEN_DESCRIPTION, avatarAssetId: art.assetId }),
  });
  for (const plain of PLAIN_CHARACTERS) {
    await root.services.character.create({ principal: owner, input: createCharacterSchema.parse(plain) });
  }
  const book = await root.services.worldInfo.createBook({ principal: owner, input: { name: "Bridge Lore" } });
  await root.services.worldInfo.createEntry({ principal: owner, bookId: book.id, input: { title: "Bridge", content: "The bridge is old.", keys: ["bridge"] } });
  await root.services.worldInfo.attachToCharacter({ principal: owner, characterId: warden.id, bookId: book.id, role: "primary" });
  await root.services.tag.attachCardTagByName({ ownerId: root.ownerId, characterId: warden.id, tagName: "guardian" });
  const persona = await root.services.persona.create({
    principal: owner,
    input: createPersonaSchema.parse({ name: "Traveller", description: "Crosses bridges." }),
  });
  await root.services.preset.create({ userId: root.ownerId, name: "Bridge Prompt", kind: "prompt" });
  await root.services.settings.createTheme({ principal: owner, input: { name: "Dusk", override: { accent: "#334455" }, css: null } });
  const script = await root.services.regex.createScript({
    principal: owner,
    input: createRegexScriptSchema.parse({ name: "Strip dice", findRegex: "/\\[dice:[^\\]]*\\]/g", replaceString: "", placement: ["USER_INPUT"] }),
  });
  await root.services.regex.attachToCharacter({ principal: owner, characterId: warden.id, scriptId: script.id });
  await root.services.worldInfo.createBook({ principal: owner, input: { name: "Loose Notes" } });
  await root.services.databank.createFromText({ principal: owner, name: "Field Notes", text: "The bridge was built in spring." });
  await root.services.assets.addToGallery({ principal: owner, assetId: art.assetId });
  await generatePicture(root, owner, pictures);
  const { chat } = await root.services.chat.startChat({ principal: owner, characterIds: [warden.id], anchorPersonaId: persona.id, opening: "none" });
  const params = { principal: owner, chatId: chat.id };
  await root.services.chat.send({ ...params, content: "Is the bridge safe?", intent: INTENT });
  const turn = await root.services.chat.send({ ...params, content: "Will it hold?", intent: INTENT });
  const assistant = turn.messages.find((message) => message.role === "assistant");
  if (assistant === undefined) {
    throw new Error("the turn produced no assistant slot");
  }
  expect((await root.services.chat.swipe({ ...params, messageId: assistant.id, intent: INTENT })).aborted).toBe(false);
  await root.settleBackground();
  return warden.id;
}

async function generatePicture(root: ServerTestHarness, owner: Principal, pictures: Uint8Array[]): Promise<void> {
  const connection = await root.services.connection.create({
    principal: owner,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: IMAGE_MODEL,
    allowBackground: true,
    declared: {
      kind: "generation",
      generation: { context: { window: 32_000 }, output: { modalities: ["text", "image"] } },
      features: { images: "images-api", detectServer: false },
    },
  });
  await root.services.connection.setBinding({ principal: owner, task: "generateImage", connectionId: connection.id });
  pictures.push(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)));
  await root.services.imagery.generatePicture({ caller: owner, mode: "free", prompt: "The bridge at dusk.", n: 1 });
}

/** How many times `run` asks the exporter for a character card and for a room. */
async function exporterCalls(root: ServerTestHarness, run: () => Promise<unknown>): Promise<{ readonly cards: number; readonly rooms: number }> {
  const cards = vi.spyOn(root.app.exportService, "exportCharacter");
  const rooms = vi.spyOn(root.app.exportService, "exportChatBundle");
  try {
    await run();
    return { cards: cards.mock.calls.length, rooms: rooms.mock.calls.length };
  } finally {
    cards.mockRestore();
    rooms.mockRestore();
  }
}

async function wardensByHandle(root: ServerTestHarness): Promise<readonly { readonly handle: string; readonly description: string | null }[]> {
  const rows = await root.db.select({ handle: characters.handle, description: characters.description }).from(characters).orderBy(characters.handle);
  return rows.filter((row) => row.handle.startsWith(WARDEN));
}

test("a whole-library backup restored onto its own library adds no row, once or twice, at one card export per character the app wrote", {
  tags: ["slow"],
}, async () => {
  using wire = libraryWire();
  await using root = await signedInBox({ ids: createSeededIds(SOURCE_ID_CURSOR), providerFetch: wire.execute });
  await livedInLibrary(root, wire.pictures);
  const before = await rowCounts(root);
  const bundle = await exportLibrary(root);
  const { files } = await readLibraryExport(root);
  // Every file is one the library holds, and the summary says so instead of counting it imported.
  const held = { status: "succeeded", imported: 0, inLibrary: files.size, skipped: 0, failed: 0 };

  const first = await exporterCalls(root, async () => expect(await restoreBundleTally(root, bundle)).toEqual(held));
  expect(await rowCounts(root)).toEqual(before);
  const second = await exporterCalls(root, async () => expect(await restoreBundleTally(root, bundle)).toEqual(held));
  expect(await rowCounts(root)).toEqual(before);
  // The seeded starter cards were imported, so their stored keys match; only the rows the app wrote are exported.
  expect({ first, second }).toEqual({ first: { cards: AUTHORED_CHARACTERS, rooms: 1 }, second: { cards: AUTHORED_CHARACTERS, rooms: 1 } });
});

test("a character edited after the backup keeps the edit, and the backup's version lands beside it under the next handle", { tags: ["slow"] }, async () => {
  using wire = libraryWire();
  await using root = await signedInBox({ ids: createSeededIds(SOURCE_ID_CURSOR), providerFetch: wire.execute });
  const wardenId = await livedInLibrary(root, wire.pictures);
  const bundle = await exportLibrary(root);
  const { files } = await readLibraryExport(root);
  const edited = "A warden who has seen the bridge fall.";
  await root.services.character.update({ principal: await root.principalFor(root.ownerId), characterId: wardenId, input: { description: edited } });
  const before = await rowCounts(root);

  // The edited card and the room it seats are the two files that write; every other file is already held.
  expect(await restoreBundleTally(root, bundle)).toEqual({ status: "succeeded", imported: 2, inLibrary: files.size - 2, skipped: 0, failed: 0 });
  expect(await wardensByHandle(root)).toEqual([
    { handle: WARDEN, description: edited },
    { handle: `${WARDEN}-2`, description: WARDEN_DESCRIPTION },
  ]);
  // The room's seat card changed with the edit, so the backup's room lands with the backup's card.
  expect((await rowCounts(root)).characters).toBe(before.characters + 1);
  expect((await rowCounts(root)).chats).toBe(before.chats + 1);
});

/** Restore one card file through the production character descriptor the bundle loader routes it to. */
async function restoreCard(root: ServerTestHarness, filename: string, bytes: Uint8Array): Promise<PortableImportOutcome> {
  const descriptor = root.app.portability.find((entity) => entity.kind === "character");
  if (descriptor === undefined) {
    throw new Error("production composition has no character portability descriptor");
  }
  return await descriptor.importFile(root.ownerId, { filename, bytes });
}

test("an imported card restored onto its own library matches by its stored key and never runs the exporter", { tags: ["slow"] }, async () => {
  await using source = await signedInBox({ ids: createSeededIds(SOURCE_ID_CURSOR) });
  const made = await source.services.character.create({
    principal: await source.principalFor(source.ownerId),
    input: createCharacterSchema.parse({ handle: WARDEN, name: "Warden", description: WARDEN_DESCRIPTION }),
  });
  const card = await source.http.request(exportCharacterPath(made.id));
  expect(card.status).toBe(HTTP_OK);
  await using root = await signedInBox();
  expect(await restoreCard(root, "warden.png", new Uint8Array(await card.arrayBuffer()))).toEqual({ ok: true, created: true });
  const before = await rowCounts(root);
  const bundle = await exportLibrary(root, ["character"]);

  const calls = await exporterCalls(root, async () => expect(await restoreBundle(root, bundle)).toMatchObject({ status: "succeeded", failed: 0 }));
  expect({ calls, counts: await rowCounts(root) }).toEqual({ calls: { cards: 0, rooms: 0 }, counts: before });
});

test("a lived-in library restored into an empty one reproduces every row", { tags: ["slow"] }, async () => {
  using wire = libraryWire();
  await using source = await signedInBox({ ids: createSeededIds(SOURCE_ID_CURSOR), providerFetch: wire.execute });
  await livedInLibrary(source, wire.pictures);
  const bundle = await exportLibrary(source);
  const { files } = await readLibraryExport(source);

  await using target = await signedInBox();
  // A new box already holds the starter content the source began with, so those files count as held and the rest write.
  const first = await restoreBundleTally(target, bundle);
  expect(first).toMatchObject({ status: "succeeded", skipped: 0, failed: 0 });
  expect((first.imported ?? 0) + (first.inLibrary ?? 0)).toBe(files.size);
  expect(first.imported).toBeGreaterThanOrEqual(AUTHORED_CHARACTERS);
  // Once restored, the target holds every file of the backup.
  expect(await restoreBundleTally(target, bundle)).toEqual({ status: "succeeded", imported: 0, inLibrary: files.size, skipped: 0, failed: 0 });
  const held = await rowCounts(source);
  // A restored card keeps its whole PNG as its avatar, so each character the source wrote adds that one blob.
  expect(await rowCounts(target)).toEqual({ ...held, assets: held.assets + AUTHORED_CHARACTERS });
});

test("a room the backup carries is not matched to a different room of a deleted and re-created primary created at the same time", async () => {
  await using root = await signedInBox({ ids: createSeededIds(SOURCE_ID_CURSOR) });
  const owner = await root.principalFor(root.ownerId);
  // A room commits a turn only under a bound chat connection; no turn here reaches the provider.
  await root.services.settings.updateAppSettings({ principal: owner, partial: { privateEndpointAllowlist: [new URL(CORPUS_PROVIDER_ENDPOINT).hostname] } });
  await seedCorpusConnections(root, owner);
  const input = createCharacterSchema.parse({ handle: WARDEN, name: "Warden", description: WARDEN_DESCRIPTION });
  const first = await root.services.character.create({ principal: owner, input });
  const room = await root.services.chat.startChat({ principal: owner, characterIds: [first.id], opening: "none" });
  await root.services.chat.commitMessage({ principal: owner, chatId: room.chat.id, content: "Is the bridge safe?" });
  const bundle = await exportLibrary(root, ["character", "chat"]);
  await root.services.character.remove({ principal: owner, characterId: first.id });
  // The same card again, and on the frozen clock a room created at the same instant as the backup's.
  const again = await root.services.character.create({ principal: owner, input });
  const other = await root.services.chat.startChat({ principal: owner, characterIds: [again.id], opening: "none" });
  await root.services.chat.commitMessage({ principal: owner, chatId: other.chat.id, content: "A different question." });
  const created = async (): Promise<readonly number[]> =>
    (await root.db.select({ at: chats.createdAt }).from(chats).where(eq(chats.id, other.chat.id))).map((row) => row.at);
  expect(await created()).toEqual([room.chat.createdAt]);
  const before = await rowCounts(root);

  expect(await restoreBundle(root, bundle)).toMatchObject({ status: "succeeded", failed: 0 });
  const after = await rowCounts(root);
  expect({ characters: after.characters, chats: after.chats }).toEqual({ characters: before.characters, chats: before.chats + 1 });
  expect((await root.services.chat.listMessages({ principal: owner, chatId: other.chat.id })).messages.map((m) => m.content)).toEqual([
    "A different question.",
  ]);
});
