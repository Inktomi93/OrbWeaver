// A real guest reads and acts on a room only through its installer's own standing there: an installer who leaves
// while the guest is mid-invocation reads nothing more of the room, lore entries come only from books attached to
// the invoking room, and a guest runs a turn only while its installer holds the host seat: a member's request
// becomes the host's to confirm, and a host who hands the seat off mid-invocation runs no turn.
// @subject packages/server/src/domain/plugin/substrate/bridge.ts

import { spawn } from "node:child_process";
import type { Principal } from "@orb/contracts/identity";
import { PluginSuggestedError } from "@orb/contracts/plugin";
import type { WorldBookId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
  readRoomCanon,
  seedCorpusConnections,
} from "@orb/testkit/node/composed";
import type { GuestOps, GuestRun } from "./_guest-command.ts";
import { guestRunner, installGuest } from "./_guest-command.ts";

const NET_HOST = "plugin.example.test";
const HELD_URL = `https://${NET_HOST}/held`;
const ROOM_OPS = {
  reads:
    "async (h, room) => ({ messages: (await h.chat.listMessages(room)).length, characters: (await h.chat.listCharacters(room)).length, variables: Object.keys(await h.chat.getVariables(room)).length, books: (await h.worldInfo.listBooks(room)).length })",
  heldReads: "async (h, room, a) => { await h.net.fetch(a.url); return await ops.reads(h, room, a); }",
  entries: "async (h, room, a) => (await h.worldInfo.listEntries(room, a.bookId)).map((entry) => entry.content)",
  setVariable: "(h, room, a) => h.chat.applyVariableOps(room, [{ op: 'set', key: a.key, value: a.value }])",
  turn: "(h, room) => h.chat.requestTurn(room, {})",
  heldTurn: "async (h, room, a) => { await h.net.fetch(a.url); await h.chat.requestTurn(room, {}); }",
} as const satisfies GuestOps;

interface Room extends AsyncDisposable {
  readonly h: ChatRoot;
  readonly member: Principal;
  readonly book: WorldBookId;
  /** Resolves when the member's guest is inside its held fetch; `release` lets that fetch answer. */
  readonly held: Promise<void>;
  readonly release: () => void;
  readonly host: GuestRun;
  readonly memberGuest: GuestRun;
}

async function room(): Promise<Room> {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The room answers.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const held = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  // Provider and plugin egress share the root's one network door; only the plugin's host is held.
  const network: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (new URL(request.url).hostname !== NET_HOST) {
      return await provider.execute(request);
    }
    held.resolve();
    await release.promise;
    return new Response("Released.");
  };
  const h = await createChatRoot({
    providerFetch: provider.execute,
    memoryEnabled: false,
    server: {
      pluginSpawn: spawn,
      networkExecution: { fetch: network, resolver: (host) => Promise.resolve([host === NET_HOST ? "93.184.215.14" : "127.0.0.1"]) },
    },
  });
  const member = await h.root.principalFor((await h.root.actor()).id);
  // The member can fund a turn of their own, so a turn that ran past the host gate would be visible in canon.
  await seedCorpusConnections(h.root, member);
  const invitation = await h.root.services.chat.createInvite({ principal: h.owner, chatId: h.chatId, input: { invitedHandle: member.handle } });
  await h.root.services.chat.acceptInvite({ principal: member, inviteId: invitation.invite.id });
  await h.root.services.chat.commitMessage({ principal: h.owner, chatId: h.chatId, content: "The host opens the room." });
  const book = (await h.caller.worldInfo.createBook({ input: { name: "Room lore" } })).id;
  await h.caller.worldInfo.attachToChat({ chatId: h.chatId, bookId: book });
  await h.caller.worldInfo.createEntry({ bookId: book, input: { title: "keeper", content: "The keeper guards the ledger." } });
  const hostPlugin = await installGuest(
    h.root,
    h.owner,
    { slug: "room-keeper", capabilities: ["chat.read", "chat.variables.write", "worldinfo.read", "turn.trigger", "net.fetch"], netHosts: [NET_HOST] },
    ROOM_OPS,
  );
  const memberPlugin = await installGuest(
    h.root,
    member,
    { slug: "room-reader", capabilities: ["chat.read", "worldinfo.read", "turn.trigger", "net.fetch"], netHosts: [NET_HOST] },
    ROOM_OPS,
  );
  return {
    h,
    member,
    book,
    held: held.promise,
    release: (): void => release.resolve(),
    host: guestRunner({ root: h.root, caller: h.owner, pluginId: hostPlugin, chatId: h.chatId }),
    memberGuest: guestRunner({ root: h.root, caller: member, pluginId: memberPlugin, chatId: h.chatId }),
    [Symbol.asyncDispose]: async (): Promise<void> => {
      release.resolve();
      await h[Symbol.asyncDispose]();
    },
  };
}

test("an installer who leaves while their guest is mid-invocation reads nothing more of the room", { tags: ["slow"] }, async () => {
  await using r = await room();
  expect(await r.host("setVariable", { key: "mood", value: "wary" })).toMatchObject({ ok: true });
  const whileMember = await r.memberGuest("reads");
  expect(whileMember).toEqual({ ok: true, value: { messages: 1, characters: 1, variables: 1, books: 1 } });

  const pending = r.memberGuest("heldReads", { url: HELD_URL });
  await r.held;
  await r.h.root.services.chat.kick({ principal: r.h.owner, chatId: r.h.chatId, userId: r.member.userId });
  r.release();
  expect(await pending).toEqual({ ok: true, value: { messages: 0, characters: 0, variables: 0, books: 0 } });
});

test("a guest reads lore entries only from a book attached to the invoking room", { tags: ["slow"] }, async () => {
  await using r = await room();
  const unattached = (await r.h.caller.worldInfo.createBook({ input: { name: "Another room's lore" } })).id;
  await r.h.caller.worldInfo.createEntry({ bookId: unattached, input: { title: "elsewhere", content: "Lore from another room." } });

  expect(await r.host("entries", { bookId: r.book })).toEqual({ ok: true, value: ["The keeper guards the ledger."] });
  expect(await r.host("entries", { bookId: unattached })).toEqual({ ok: true, value: [] });
});

test("a member's guest cannot run a turn: the request becomes the host's to confirm, while the host's guest runs one", { tags: ["slow"] }, async () => {
  await using r = await room();
  const assistantTurns = async (): Promise<number> => (await readRoomCanon(r.h.root, r.h.owner, r.h.chatId)).filter(({ role }) => role === "assistant").length;

  expect(await r.memberGuest("turn")).toEqual({ ok: false, name: new PluginSuggestedError("requestTurn").name });
  await r.h.root.settleBackground();
  expect(await assistantTurns()).toBe(0);

  expect(await r.host("turn")).toEqual({ ok: true, value: null });
  await r.h.root.settleBackground();
  expect(await assistantTurns()).toBe(1);
});

test("a host who hands the seat off while their guest is mid-invocation runs no further turn", { tags: ["slow"] }, async () => {
  await using r = await room();
  const assistantTurns = async (): Promise<number> => (await readRoomCanon(r.h.root, r.h.owner, r.h.chatId)).filter(({ role }) => role === "assistant").length;
  expect(await r.host("turn")).toEqual({ ok: true, value: null });
  await r.h.root.settleBackground();
  expect(await assistantTurns()).toBe(1);

  const pending = r.host("heldTurn", { url: HELD_URL });
  await r.held;
  await r.h.root.services.chat.nominateHostHandoff({ principal: r.h.owner, chatId: r.h.chatId, userId: r.member.userId });
  await r.h.root.services.chat.acceptHostHandoff({ principal: r.member, chatId: r.h.chatId });
  r.release();
  expect(await pending).toMatchObject({ ok: false });
  await r.h.root.settleBackground();
  expect(await assistantTurns()).toBe(1);
});
