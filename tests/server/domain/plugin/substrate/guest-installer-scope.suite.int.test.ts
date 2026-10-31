// What a real guest can reach is closed over its installer and its own plugin identity: assets, card state, the
// library ingests, document search and a quiet generation's images resolve only under the installer, card state
// keys on the calling plugin's own slug, a quiet generation stops when its invocation ends, and a snippet, which
// has no plugin identity, can neither spend nor egress nor search.
// @subject packages/server/src/domain/plugin/substrate/bridge.ts

import { spawn } from "node:child_process";
import { createCharacterSchema, parsePluginImportedFrom } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import { PLUGIN_CARD_DATA_FIND_MAX, PluginCapabilityError } from "@orb/contracts/plugin";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { AssetId, CharacterId, PluginId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { jsonValueSchema } from "@orb/kit/json";
import { expect, test } from "@orb/testkit/node";
import type { ServerHarnessOptions, ServerTestHarness } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  makeAssetBytes,
  seedAsset,
  seedCorpusActors,
} from "@orb/testkit/node/composed";
import { z } from "zod";
import type { GuestOps, GuestRun } from "./_guest-command.ts";
import { guestRunner, installGuest } from "./_guest-command.ts";

const SCOPE_OPS = {
  readAsset: "(h, room, a) => h.assets.read(a.assetId)",
  setCard: "(h, room, a) => h.character.setCardData(a.characterId, a.data)",
  getCard: "(h, room, a) => h.character.getCardData(a.characterId)",
  findCards: "(h, room, a) => h.character.findCardData(a.values)",
  ingestDocument: "(h, room, a) => h.databank.ingest(a.doc)",
  ingestCharacter: "(h, room, a) => h.character.ingest(a.card)",
  quiet: "(h, room, a) => h.llm.quiet(a.prompt, a.opts)",
  searchDocuments: "async (h, room, a) => (await h.search.documents(a.query)).map((hit) => hit.documentId)",
} as const satisfies GuestOps;
const SCOPE_CAPABILITIES = ["assets.read", "character.card_state", "databank.ingest", "character.ingest", "llm.quiet", "search.query"] as const;
const QUIET_REPLY = "A quiet answer.";

interface Owners extends AsyncDisposable {
  readonly root: ServerTestHarness;
  readonly owner: Principal;
  readonly stranger: Principal;
  /** Install the scope guest for `who` under `slug` and bind its quiet generations to their own text connection. */
  readonly guest: (who: Principal, slug: string) => Promise<{ readonly pluginId: PluginId; readonly run: GuestRun }>;
}

async function owners(providerFetch?: typeof fetch, jobs: Pick<ServerHarnessOptions, "startJobs"> = {}): Promise<Owners> {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: QUIET_REPLY,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const root = await createServerHarness({ pluginSpawn: spawn, providerFetch: providerFetch ?? provider.execute, ...jobs });
  const { owner, secondUserId } = await seedCorpusActors(root);
  const stranger = await root.principalFor(secondUserId);
  const guest = async (who: Principal, slug: string): Promise<{ readonly pluginId: PluginId; readonly run: GuestRun }> => {
    const pluginId = await installGuest(root, who, { slug, capabilities: SCOPE_CAPABILITIES }, SCOPE_OPS);
    const caller = await root.internalCallerFor(who.userId);
    const text = (await caller.connection.list()).find(({ model }) => model === CORPUS_TEXT_MODEL);
    if (text === undefined) {
      throw new Error("the corpus actor has no text connection");
    }
    await caller.connection.setBinding({ task: "summarize", connectionId: text.id, actor: { kind: "plugin-grant", pluginId } });
    return { pluginId, run: guestRunner({ root, caller: who, pluginId, chatId: null }) };
  };
  return { root, owner, stranger, guest, [Symbol.asyncDispose]: () => root[Symbol.asyncDispose]() };
}

async function ownAsset(root: ServerTestHarness, who: Principal): Promise<{ readonly assetId: AssetId; readonly bytes: Uint8Array }> {
  const bytes = makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset));
  const { stored } = await seedAsset(root, { principal: who, kind: "attachment", mime: "image/png", bytes });
  return { assetId: stored.assetId, bytes };
}

async function ownCharacter(root: ServerTestHarness, who: Principal, handle: string): Promise<CharacterId> {
  return (await root.services.character.create({ principal: who, input: createCharacterSchema.parse({ handle, name: handle, description: "A keeper." }) })).id;
}

const reported = (outcome: Awaited<ReturnType<GuestRun>>): unknown => (outcome.ok ? outcome.value : outcome);

type OwnerCaller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;
// The embed space promotes only when cards, memory and documents all report one generation, so all three sweep.
const LIBRARY_SWEEPS = [
  { kind: "index", params: { source: "text" } },
  { kind: "memory-backfill", params: {} },
  { kind: "databank-reindex", params: { scope: { kind: "owner" }, mode: "chunk-embed" } },
] as const satisfies Parameters<OwnerCaller["workloads"]["start"]>[0]["input"][];

/** Run `who`'s library sweeps to completion through the admitted-workload door, promoting their embed space. */
async function indexLibrary(root: ServerTestHarness, who: Principal): Promise<OwnerCaller> {
  const runAdmittedWorkload = root.runAdmittedWorkload;
  if (runAdmittedWorkload === undefined) {
    throw new Error("the root runs its jobs on its own, so no admitted workload can be driven");
  }
  const caller = await root.internalCallerFor(who.userId);
  await caller.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: true } });
  for (const input of LIBRARY_SWEEPS) {
    const job = await caller.workloads.start({ input, mode: "singular" });
    await runAdmittedWorkload(job.id, new AbortController().signal);
    const settled = await caller.workloads.get({ id: job.id });
    if (settled.status !== "succeeded") {
      throw new Error(`the ${settled.kind} sweep ended ${settled.status}`);
    }
  }
  return caller;
}

test("a guest reads assets only from its installer's own storage", { tags: ["slow"] }, async () => {
  await using o = await owners();
  const mine = await ownAsset(o.root, o.owner);
  const theirs = await ownAsset(o.root, o.stranger);
  const { run } = await o.guest(o.owner, "asset-reader");

  expect(await run("readAsset", { assetId: mine.assetId })).toEqual({
    ok: true,
    value: { mime: "image/png", sizeBytes: mine.bytes.byteLength, dataBase64: Buffer.from(mine.bytes).toString("base64") },
  });
  expect(await run("readAsset", { assetId: theirs.assetId })).toEqual({ ok: true, value: null });
});

test("card state is keyed to the calling plugin's own slug, on its installer's own characters", { tags: ["slow"] }, async () => {
  await using o = await owners();
  const mine = await ownCharacter(o.root, o.owner, "own-keeper");
  const theirs = await ownCharacter(o.root, o.stranger, "foreign-keeper");
  const keeper = await o.guest(o.owner, "card-keeper");
  const sibling = await o.guest(o.owner, "other-keeper");
  const strangersKeeper = await o.guest(o.stranger, "card-keeper");

  expect(await keeper.run("setCard", { characterId: mine, data: { hp: 10 } })).toEqual({ ok: true, value: null });
  expect(await sibling.run("getCard", { characterId: mine })).toEqual({ ok: true, value: null });
  expect(await sibling.run("setCard", { characterId: mine, data: { hp: 1 } })).toEqual({ ok: true, value: null });
  expect(await keeper.run("getCard", { characterId: mine })).toEqual({ ok: true, value: { hp: 10 } });

  expect(await keeper.run("setCard", { characterId: theirs, data: { hp: 99 } })).toMatchObject({ ok: false });
  expect(await strangersKeeper.run("getCard", { characterId: mine })).toMatchObject({ ok: false });
  expect(await strangersKeeper.run("getCard", { characterId: theirs })).toEqual({ ok: true, value: null });
});

test("a card-state lookup answers only for the calling plugin's own stamps on its installer's own characters", { tags: ["slow"] }, async () => {
  await using o = await owners();
  const mine = await ownCharacter(o.root, o.owner, "own-keeper");
  const unstamped = await ownCharacter(o.root, o.owner, "bare-keeper");
  const theirs = await ownCharacter(o.root, o.stranger, "foreign-keeper");
  const keeper = await o.guest(o.owner, "card-keeper");
  const sibling = await o.guest(o.owner, "other-keeper");
  const strangersKeeper = await o.guest(o.stranger, "card-keeper");
  const data = { deep: { list: ["match-me"] }, count: 7 };
  await keeper.run("setCard", { characterId: mine, data });
  await strangersKeeper.run("setCard", { characterId: theirs, data: { other: "match-me" } });
  await sibling.run("setCard", { characterId: unstamped, data: { other: "match-me" } });

  expect(await keeper.run("findCards", { values: ["match-me", "absent"] })).toEqual({ ok: true, value: [{ characterId: mine, data }] });
  expect(await sibling.run("findCards", { values: ["match-me"] })).toEqual({ ok: true, value: [{ characterId: unstamped, data: { other: "match-me" } }] });
  expect(await strangersKeeper.run("findCards", { values: ["match-me"] })).toEqual({ ok: true, value: [{ characterId: theirs, data: { other: "match-me" } }] });
  // A stored number is not a string, and an empty list asks nothing.
  expect(await keeper.run("findCards", { values: ["7"] })).toEqual({ ok: true, value: [] });
  expect(await keeper.run("findCards", { values: [] })).toEqual({ ok: true, value: [] });
});

test("a card-state lookup is refused without the grant and over its input cap", { tags: ["slow"] }, async () => {
  await using o = await owners();
  const { run } = await o.guest(o.owner, "card-keeper");
  const ungranted = await installGuest(o.root, o.owner, { slug: "no-card-state", capabilities: [] }, SCOPE_OPS);

  expect(await guestRunner({ root: o.root, caller: o.owner, pluginId: ungranted, chatId: null })("findCards", { values: ["any"] })).toEqual({
    ok: false,
    name: new PluginCapabilityError("character.card_state").name,
  });
  expect(await run("findCards", { values: Array.from({ length: PLUGIN_CARD_DATA_FIND_MAX }, (_, index) => `value-${index}`) })).toEqual({
    ok: true,
    value: [],
  });
  expect(await run("findCards", { values: Array.from({ length: PLUGIN_CARD_DATA_FIND_MAX + 1 }, (_, index) => `value-${index}`) })).toMatchObject({
    ok: false,
  });
});

test("library ingests land in the installer's own library, stamped with the calling plugin", { tags: ["slow"] }, async () => {
  await using o = await owners();
  const { pluginId, run } = await o.guest(o.owner, "library-feeder");
  const source = await ownCharacter(o.root, o.owner, "exported-keeper");
  const exported = await o.root.app.exportService.exportCharacter({ principal: o.owner, characterId: source, format: "json" });
  if (exported === null) {
    throw new Error("the owner's own character did not export");
  }
  const card = jsonValueSchema.parse(JSON.parse(new TextDecoder().decode(exported.bytes)));

  const document = z
    .object({ documentId: typeIdSchema(ID_PREFIX.document) })
    .parse(reported(await run("ingestDocument", { doc: { name: "Ledger", text: "A guest wrote this." } })));
  expect((await o.root.services.databank.get({ principal: o.owner, id: document.documentId })).name).toBe("Ledger");
  await expect(o.root.services.databank.get({ principal: o.stranger, id: document.documentId })).rejects.toBeInstanceOf(DomainNotFoundError);

  const character = z.object({ characterId: typeIdSchema(ID_PREFIX.character) }).parse(reported(await run("ingestCharacter", { card })));
  const detail = await o.root.services.character.get({ principal: o.owner, characterId: character.characterId });
  expect(parsePluginImportedFrom(detail.importedFrom)).toEqual({ pluginId });
  await expect(o.root.services.character.get({ principal: o.stranger, characterId: character.characterId })).rejects.toBeInstanceOf(DomainNotFoundError);
});

test("a guest's document search ranks only its installer's library while both libraries share an active space", { tags: ["slow"] }, async () => {
  await using o = await owners(undefined, { startJobs: false });
  const mine = await o.guest(o.owner, "library-search");
  const theirs = await o.guest(o.stranger, "library-search");
  const ingest = async (run: GuestRun, text: string): Promise<string> =>
    z.object({ documentId: typeIdSchema(ID_PREFIX.document) }).parse(reported(await run("ingestDocument", { doc: { name: "Ledger", text } }))).documentId;
  const ownDocument = await ingest(mine.run, "The owner's ledger lists the copper keys.");
  const foreignDocument = await ingest(theirs.run, "The stranger's ledger lists the silver keys.");
  for (const who of [o.owner, o.stranger]) {
    // Both owners embed on the same encoder, so a widened scope would rank the other library in the same geometry.
    expect(await (await indexLibrary(o.root, who)).search.spaceStatus()).toMatchObject({ paused: false, embed: false });
  }

  expect(await mine.run("searchDocuments", { query: "Which keys does the ledger list?" })).toEqual({ ok: true, value: [ownDocument] });
  expect(await theirs.run("searchDocuments", { query: "Which keys does the ledger list?" })).toEqual({ ok: true, value: [foreignDocument] });
});

test("a quiet generation attaches only the installer's own images, and a foreign image spends nothing", { tags: ["slow"] }, async () => {
  const posts: string[] = [];
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: QUIET_REPLY,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using o = await owners(async (input, init) => {
    const request = new Request(input, init);
    if (request.method === "POST") {
      posts.push(new URL(request.url).pathname);
    }
    return await provider.execute(request);
  });
  const mine = await ownAsset(o.root, o.owner);
  const theirs = await ownAsset(o.root, o.stranger);
  const { run } = await o.guest(o.owner, "quiet-captioner");
  const before = posts.length;

  expect(await run("quiet", { prompt: "Caption this.", opts: { imageAssetIds: [theirs.assetId] } })).toMatchObject({ ok: false });
  expect(posts).toHaveLength(before);
  expect(await run("quiet", { prompt: "Caption this.", opts: { imageAssetIds: [mine.assetId] } })).toEqual({ ok: true, value: QUIET_REPLY });
  expect(posts).toHaveLength(before + 1);
});

test("a quiet generation's provider call is aborted when its invocation is cancelled", { tags: ["slow"] }, async () => {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: QUIET_REPLY,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const reached = Promise.withResolvers<AbortSignal>();
  await using o = await owners(async (input, init) => {
    const request = new Request(input, init);
    if (request.method !== "POST" || !new URL(request.url).pathname.endsWith("/chat/completions")) {
      return await provider.execute(request);
    }
    reached.resolve(request.signal);
    return await new Promise<Response>((_resolve, reject) => {
      request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true });
    });
  });
  const { pluginId, run } = await o.guest(o.owner, "quiet-captioner");

  const pending = run("quiet", { prompt: "Wait for me." });
  const signal = await reached.promise;
  expect(signal.aborted).toBe(false);
  await o.root.services.plugin.setEnabled({ caller: o.owner, pluginId, enabled: false });
  await pending.catch(() => undefined);
  expect(signal.aborted).toBe(true);
});

test("a snippet has no plugin identity, so it cannot spend, egress or search, while its own grant still reads", { tags: ["slow"] }, async () => {
  const posts: string[] = [];
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: QUIET_REPLY,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using o = await owners(async (input, init) => {
    const request = new Request(input, init);
    if (request.method === "POST") {
      posts.push(new URL(request.url).pathname);
    }
    return await provider.execute(request);
  });
  const chatId = (await o.root.services.chat.startChat({ principal: o.owner, characterIds: [], opening: "none" })).chat.id;
  await o.root.services.chat.commitMessage({ principal: o.owner, chatId, content: "A line the snippet may read." });
  const before = posts.length;
  const code = `const h = orb.host(1);
(async () => {
  const attempt = async (call) => { try { await call(); return "admitted"; } catch (e) { return e.name; } };
  h.log.info(JSON.stringify({
    quiet: await attempt(() => h.llm.quiet("spend")),
    fetch: await attempt(() => h.net.fetch("https://example.test/")),
    search: await attempt(() => h.search.documents("anything")),
    read: (await h.chat.listMessages(h.chat.current())).length,
  }));
})();`;
  const result = await o.root.services.plugin.runSnippet({ caller: o.owner, chatId, code });
  expect(result.error).toBeUndefined();
  const refused = new PluginCapabilityError("llm.quiet").name;
  expect(result.logLines.map((line) => line.slice(line.indexOf("{")))).toEqual([JSON.stringify({ quiet: refused, fetch: refused, search: refused, read: 1 })]);
  expect(posts).toHaveLength(before);
});
