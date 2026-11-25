// A string crosses the plugin boundary whole in both directions, NUL included: a guest's argument and return value
// reach the host whole, and a host value, a top-level host string, a nested value and an object key reach the guest
// whole. Each case is read on the far side of the crossing it proves. A guest reports what it saw as its own JSON,
// which escapes a NUL, so the report itself never depends on the crossing under test. Card data is stored as JSON
// text, so its round trip also shows that store keeps a NUL; the text stores refuse one instead
// (`tests/server/domain/plugin/persistence/stored-text-nul.int.test.ts`). A host error reaches the guest with its name
// and message, and a promise the guest hands the host is refused unread. A guest's result settles without the guest's
// globals, so a guest that keeps every resolve function it reaches and calls each again leaks nothing at teardown.
// @subject packages/server/src/infra/plugin-host/marshal.ts
import { spawn } from "node:child_process";
import { createCharacterSchema } from "@orb/contracts/character";
import type { PluginStatus } from "@orb/contracts/plugin";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, PluginCapabilityError, pluginManifestSchema } from "@orb/contracts/plugin";
import { expect, test } from "@orb/testkit/node";
import type { GuestOps } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  guestRunner,
  installGuest,
  makePluginBundle,
  seedCorpusActors,
} from "@orb/testkit/node/composed";
import { z } from "zod";
import { HOST_FN_ARGS_MAX_BYTES } from "#server/infra/plugin-host/budgets.ts";

const NUL = "\0";
const WITH_NUL = `head${NUL}tail`;

const OPS = {
  // `a.text` rides the command's JSON arguments, which already cross whole; the call under test is the guest's.
  log: "(h, room, a) => { h.log.info(a.text); return null; }",
  cardKeys: "async (h, room, a) => { await h.character.setCardData(a.card, a.data); return Object.entries(await h.character.getCardData(a.card)); }",
  quiet: "(h) => h.llm.quiet('Answer.')",
  hostError: "async (h) => { try { await h.storage.get('k'); return null; } catch (e) { return [e.name, e.message, e instanceof Error]; } }",
} as const satisfies GuestOps;

test("a host string with a NUL, a quiet generation's reply, reaches the guest whole", { tags: ["slow"] }, async () => {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: WITH_NUL,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using root = await createServerHarness({ pluginSpawn: spawn, providerFetch: provider.execute });
  const { owner } = await seedCorpusActors(root);
  const pluginId = await installGuest(root, owner, { slug: "nul-listener", capabilities: ["llm.quiet"] }, OPS);
  const caller = await root.internalCallerFor(owner.userId);
  const text = (await caller.connection.list()).find(({ model }) => model === CORPUS_TEXT_MODEL);
  if (text === undefined) {
    throw new Error("the corpus actor has no text connection");
  }
  await caller.connection.setBinding({ task: "summarize", connectionId: text.id, actor: { kind: "plugin-grant", pluginId } });

  expect(await guestRunner({ root, caller: owner, pluginId, chatId: null })("quiet")).toEqual({ ok: true, value: WITH_NUL });
});

// Within the inbound cap, so `tokens.count` reads it whole; its JSON escapes each NUL to six bytes.
const CAPPED_NULS = HOST_FN_ARGS_MAX_BYTES / 2;
// Far smaller than that escaped copy, so a heap filled to its limit in these steps has no room for it.
const BALLAST_STEP_CHARS = 65_536;
// The guest fills its heap until an allocation fails, so the same string then meets the realm's own memory failure
// twice: in a host call's read of its argument, and in the guest's own JSON. The snippet frees the ballast and reports
// the name each failure reached it with, as JSON text.
const READ_FAILS = `const h = orb.host(1);
const s = "\\0".repeat(${String(CAPPED_NULS)});
let ballast = [];
try { for (;;) ballast.push("x".repeat(${String(BALLAST_STEP_CHARS)}) + ballast.length); } catch {}
const seen = [];
try { h.tokens.count(s); seen.push("read"); } catch (e) { seen.push(e.name); }
try { JSON.stringify(s); seen.push("read"); } catch (e) { seen.push(e.name); }
ballast = null;
h.log.info(JSON.stringify(seen));`;

test("a host call whose read of the guest's argument fails hands the guest the realm's own failure, not a host error", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const caller = await root.internalCallerFor(root.ownerId);
  const room = (await caller.chat.startChat({ characterIds: [] })).chat;

  const result = await caller.plugin.runSnippet({ chatId: room.id, code: READ_FAILS });
  expect(result.error).toBeUndefined();
  const report = result.logLines.at(-1) ?? "";
  const [hostRead, ownRead] = z.tuple([z.string(), z.string()]).parse(JSON.parse(report.slice(report.indexOf(" ") + 1)));
  expect(ownRead).not.toBe("read");
  expect(hostRead).toBe(ownRead);
});

test("a host error reaches the guest as an Error with the host error's name and message", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const owner = await root.principalFor(root.ownerId);
  const pluginId = await installGuest(root, owner, { slug: "ungranted", capabilities: [] }, OPS);
  const refusal = new PluginCapabilityError("storage.kv");

  expect(await guestRunner({ root, caller: owner, pluginId, chatId: null })("hostError")).toEqual({ ok: true, value: [refusal.name, refusal.message, true] });
});

// A snippet whose one host call takes `value` as its options, reporting whether the host refused it.
const passedAs = (value: string): string => `const h = orb.host(1);
(async () => {
  try { await h.chat.listMessages(h.chat.current(), ${value}); h.log.info("accepted"); }
  catch (e) { h.log.info("refused:" + e.name); }
})();`;

// The binding's read of an engine promise disposes a handle the host still holds; reading one would end the run in a
// host fault, and the teardown in an engine abort. A run that resolves to its ordinary outcome, its context torn down,
// shows neither happened. A thenable is ordinary data: its function crosses as nothing.
const PROMISES = [
  { name: "a settled promise passed as an argument", code: passedAs("Promise.resolve(1)"), outcome: { logLines: ["[info] refused:Error"] } },
  { name: "a rejected promise passed as an argument", code: passedAs("Promise.reject(new Error('no'))"), outcome: { logLines: ["[info] refused:Error"] } },
  { name: "a pending promise passed as an argument", code: passedAs("new Promise(() => {})"), outcome: { logLines: ["[info] refused:Error"] } },
  { name: "a thenable passed as an argument", code: passedAs("{ then: (resolve) => resolve(1) }"), outcome: { logLines: ["[info] accepted"] } },
  { name: "a thrown promise", code: "throw Promise.resolve(1);", outcome: { errorKind: "runtime" } },
  { name: "a rejection with a promise", code: "Promise.reject(Promise.resolve(1));", outcome: { errorKind: "runtime" } },
  { name: "a thrown thenable", code: "throw { then: (resolve) => resolve(1) };", outcome: { errorKind: "runtime" } },
] as const;

test.for(PROMISES)("$name ends the snippet with its ordinary outcome, and the next snippet runs", { tags: ["slow"] }, async ({ code, outcome }) => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const caller = await root.internalCallerFor(root.ownerId);
  const room = (await caller.chat.startChat({ characterIds: [] })).chat;

  expect(await caller.plugin.runSnippet({ chatId: room.id, code })).toMatchObject(outcome);
  expect(await caller.plugin.runSnippet({ chatId: room.id, code: passedAs("{}") })).toEqual({ logLines: ["[info] accepted"] });
});

// A guest that swaps its global `Promise` for one whose `resolve` keeps every function it is handed, and returns a
// thenable that keeps its own. A host that settled the guest's result through the guest's `Promise` would hand it a
// host function that copies a handle on every call; called again, each copy leaks, and the runtime's teardown aborts the
// engine. `again` calls every kept function twice more and answers how many it holds.
const KEEPERS = {
  keep: `() => {
    const Native = Promise;
    globalThis.kept = [];
    globalThis.Promise = { resolve: (value) => ({ then: (onFulfilled, onRejected) => {
      globalThis.kept.push(onFulfilled, onRejected);
      return Native.prototype.then.call(Native.resolve(value), onFulfilled, onRejected);
    } }) };
    return { then: (resolve, reject) => { globalThis.kept.push(resolve, reject); resolve(1); } };
  }`,
  again: "() => { for (const kept of globalThis.kept) { kept({ again: true }); kept({ again: true }); } return globalThis.kept.length; }",
} as const satisfies GuestOps;
// The functions `keep` holds when its result settles without the guest's globals: the resolvers the engine hands the
// runner's own `await` of the thenable, which a second call leaves alone.
const ENGINE_RESOLVERS = 2;
const DISABLED = "disabled" satisfies PluginStatus;

test("a guest that keeps every resolve function it reaches and calls each again retires its plugin, and the host closes cleanly", {
  tags: ["slow"],
}, async () => {
  // The block's end closes the root, which retires every runtime and the Worker pool; a leaked handle fails that close.
  {
    await using root = await createServerHarness({ pluginSpawn: spawn });
    const owner = await root.principalFor(root.ownerId);
    const pluginId = await installGuest(root, owner, { slug: "resolver-keeper", capabilities: [] }, KEEPERS);
    const run = guestRunner({ root, caller: owner, pluginId, chatId: null });

    expect(await run("keep")).toEqual({ ok: true, value: 1 });
    expect(await run("again")).toEqual({ ok: true, value: ENGINE_RESOLVERS });
    await root.services.plugin.setEnabled({ caller: owner, pluginId, enabled: false });
    expect((await root.services.plugin.list({ caller: owner })).find(({ id }) => id === pluginId)?.status).toBe(DISABLED);
  }
});

test("a guest's string argument reaches the host whole", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const owner = await root.principalFor(root.ownerId);
  const pluginId = await installGuest(root, owner, { slug: "nul-logger", capabilities: [] }, OPS);

  await guestRunner({ root, caller: owner, pluginId, chatId: null })("log", { text: WITH_NUL });
  // Oldest first: the guest's call, then the runner's own outcome report.
  const [line] = await root.services.plugin.getLog({ caller: owner, pluginId, limit: 2 });
  expect(line?.message).toBe(WITH_NUL);
});

test("an object key and a nested value with a NUL reach the guest whole", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const owner = await root.principalFor(root.ownerId);
  const card = (
    await root.services.character.create({
      principal: owner,
      input: createCharacterSchema.parse({ handle: "keeper", name: "keeper", description: "A keeper." }),
    })
  ).id;
  const pluginId = await installGuest(root, owner, { slug: "nul-card", capabilities: ["character.card_state"] }, OPS);

  expect(await guestRunner({ root, caller: owner, pluginId, chatId: null })("cardKeys", { card, data: { [WITH_NUL]: { nested: WITH_NUL } } })).toEqual({
    ok: true,
    value: [[WITH_NUL, { nested: WITH_NUL }]],
  });
});

test("a guest's string return value reaches the host whole", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const owner = await root.principalFor(root.ownerId);
  const room = (await (await root.internalCallerFor(root.ownerId)).chat.startChat({ characterIds: [] })).chat;
  const manifest = pluginManifestSchema.parse({
    id: "nul-drafter",
    name: "nul-drafter",
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    description: "Returns a draft with a NUL in it.",
    capabilities: ["ui.surface"],
  });
  const source = `orb.host(1).ui.registerCommand({ name: "draft", describe: "Return the draft with a tail", composerDraft: true, placements: [{ target: "composer-action", label: "Tail", icon: "sparkles" }], onRun: ({ draft }) => draft + ${JSON.stringify(`${NUL}more`)} });`;
  const installed = await root.services.plugin.install({ caller: owner, bundle: makePluginBundle(manifest, source, root.clock.now()), grant: [] });
  await root.services.plugin.setGrant({ caller: owner, pluginId: installed.id, grant: manifest.capabilities, acknowledgedNetHosts: [], enable: true });

  const outcome = await root.services.plugin.invokeUiCommand({
    signal: new AbortController().signal,
    caller: owner,
    pluginId: installed.id,
    name: "draft",
    args: "",
    chatId: room.id,
    composerDraft: WITH_NUL,
  });
  expect(outcome.composerDraft).toBe(`${WITH_NUL}${NUL}more`);
});
