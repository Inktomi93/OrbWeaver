// A real guest's lore write is a capability, not a back door: its macros are stored inert so a later turn cannot
// turn `worldinfo.write` into a chat variable write, it reaches only books attached to the invoking room, it lives
// in its own per-plugin title namespace, and that namespace has a per-book entry ceiling.
// @subject packages/server/src/domain/plugin/substrate/bridge.ts

import { spawn } from "node:child_process";
import { PLUGIN_LORE_ENTRIES_PER_BOOK_MAX } from "@orb/contracts/plugin";
import type { WorldBookId } from "@orb/kit/ids";
import { neutralizeMacros } from "@orb/kit/macro";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";
import type { GuestRun } from "./_guest-command.ts";
import { guestRunner, installGuest } from "./_guest-command.ts";

const LORE_OPS = {
  lore: "(h, room, a) => h.worldInfo.upsertEntry(room, a.entry)",
  fill: "async (h, room, a) => { for (let i = 0; i < a.count; i += 1) { await h.worldInfo.upsertEntry(room, { ...a.entry, entryKey: a.prefix + i }); } }",
} as const;
const VARIABLE = "tension";
const LIVE_TEMPLATE = `{{setvar::${VARIABLE}::99}}The tension rises.`;

interface LoreRoom {
  readonly h: ChatRoot;
  readonly attached: WorldBookId;
  readonly unattached: WorldBookId;
  readonly guest: (slug: string) => Promise<GuestRun>;
}

async function loreRoom(): Promise<LoreRoom> {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The room answers.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const h = await createChatRoot({ providerFetch: provider.execute, memoryEnabled: false, server: { pluginSpawn: spawn } });
  const attached = (await h.caller.worldInfo.createBook({ input: { name: "Room lore" } })).id;
  const unattached = (await h.caller.worldInfo.createBook({ input: { name: "Another room's lore" } })).id;
  await h.caller.worldInfo.attachToChat({ chatId: h.chatId, bookId: attached });
  const guest = async (slug: string): Promise<GuestRun> => {
    const pluginId = await installGuest(h.root, h.owner, { slug, capabilities: ["chat.read", "worldinfo.write"] }, LORE_OPS);
    return guestRunner({ root: h.root, caller: h.owner, pluginId, chatId: h.chatId });
  };
  return { h, attached, unattached, guest };
}

const entryOf = (bookId: WorldBookId, entryKey: string, contentTemplate: string): Readonly<Record<string, string | string[]>> => ({
  bookId,
  entryKey,
  keys: ["mood"],
  contentTemplate,
  position: "before",
});

async function entriesOf(h: ChatRoot, bookId: WorldBookId): ReturnType<ChatRoot["caller"]["worldInfo"]["listEntries"]> {
  return await h.caller.worldInfo.listEntries({ bookId });
}

async function runtimeVariables(h: ChatRoot): Promise<Record<string, string>> {
  return await h.root.services.chat.getRuntimeVariables({ principal: h.owner, chatId: h.chatId });
}

test("a guest lore write is stored macro-inert, so the turn that renders it changes no chat variable", { tags: ["slow"] }, async () => {
  const room = await loreRoom();
  await using h = room.h;
  // A human entry with a live macro on the same key is the control: it shows the turn renders matched lore.
  await h.caller.worldInfo.createEntry({
    bookId: room.attached,
    input: { title: "control", keys: ["mood"], content: "{{setvar::control::1}}The room is calm." },
  });
  const run = await room.guest("lore-writer");
  expect(neutralizeMacros(LIVE_TEMPLATE)).not.toBe(LIVE_TEMPLATE);

  expect(await run("lore", { entry: entryOf(room.attached, "mood", LIVE_TEMPLATE) })).toEqual({ ok: true, value: null });
  await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "The mood shifts." });
  await h.root.settleBackground();

  expect(await runtimeVariables(h)).toEqual({ control: "1" });
  expect((await entriesOf(h, room.attached)).map(({ content }) => content)).toContain(neutralizeMacros(LIVE_TEMPLATE));
});

test("a guest lore write reaches only a book attached to the invoking room", { tags: ["slow"] }, async () => {
  const room = await loreRoom();
  await using h = room.h;
  const run = await room.guest("lore-writer");

  expect(await run("lore", { entry: entryOf(room.unattached, "mood", "Elsewhere.") })).toMatchObject({ ok: false });
  expect(await entriesOf(h, room.unattached)).toEqual([]);

  expect(await run("lore", { entry: entryOf(room.attached, "mood", "Here.") })).toEqual({ ok: true, value: null });
  expect((await entriesOf(h, room.attached)).map(({ content }) => content)).toEqual(["Here."]);
});

test("each plugin writes its own entry per key: a re-write updates it, and a human's same-named entry is untouched", { tags: ["slow"] }, async () => {
  const room = await loreRoom();
  await using h = room.h;
  const human = await h.caller.worldInfo.createEntry({ bookId: room.attached, input: { title: "mood", keys: ["mood"], content: "Written by hand." } });
  const first = await room.guest("lore-writer");
  const second = await room.guest("other-lore-writer");

  await first("lore", { entry: entryOf(room.attached, "mood", "First draft.") });
  await first("lore", { entry: entryOf(room.attached, "mood", "Second draft.") });
  await second("lore", { entry: entryOf(room.attached, "mood", "Another plugin.") });

  const entries = await entriesOf(h, room.attached);
  expect(entries.find(({ id }) => id === human.id)).toEqual(human);
  expect(entries.map(({ content }) => content).toSorted()).toEqual(["Another plugin.", "Second draft.", "Written by hand."]);
});

test("a plugin's entries in one book stop at the ceiling, while updates and other plugins still write", { tags: ["slow"] }, async () => {
  const room = await loreRoom();
  await using h = room.h;
  await h.caller.worldInfo.createEntry({ bookId: room.attached, input: { title: "human", keys: ["mood"], content: "Written by hand." } });
  const run = await room.guest("lore-writer");
  const other = await room.guest("other-lore-writer");
  const entry = entryOf(room.attached, "unused", "Filled.");

  expect(await run("fill", { entry, prefix: "e", count: PLUGIN_LORE_ENTRIES_PER_BOOK_MAX })).toEqual({ ok: true, value: null });
  expect(await run("lore", { entry: { ...entry, entryKey: "past-the-ceiling" } })).toMatchObject({ ok: false });
  expect(await entriesOf(h, room.attached)).toHaveLength(PLUGIN_LORE_ENTRIES_PER_BOOK_MAX + 1);

  expect(await run("lore", { entry: { ...entry, entryKey: "e3", contentTemplate: "Updated." } })).toEqual({ ok: true, value: null });
  expect(await other("lore", { entry: { ...entry, entryKey: "theirs", contentTemplate: "Another plugin." } })).toEqual({ ok: true, value: null });
  const contents = (await entriesOf(h, room.attached)).map(({ content }) => content);
  expect(contents).toHaveLength(PLUGIN_LORE_ENTRIES_PER_BOOK_MAX + 2);
  expect(contents).toEqual(expect.arrayContaining(["Updated.", "Another plugin."]));
});
