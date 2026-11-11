// The membrane's three mechanisms, each through a real guest's host call: the capability gate, the opaque chat handle
// and the self-bound limits (the argument budget, the deadline, the result cap and the in-flight cap). The dump depth
// guard and the string-argument check are part of the argument intake.
// @subject packages/server/src/infra/plugin-host/membrane.ts
import { spawn } from "node:child_process";
import type { PluginHostV1 } from "@orb/contracts/plugin";
import { PluginCapabilityError, PluginHostDeadlineError } from "@orb/contracts/plugin";
import { PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { GuestOps, ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, guestRunner, installGuest } from "@orb/testkit/node/composed";
import { HOST_CALLS_IN_FLIGHT_MAX, HOST_FN_ARGS_MAX_BYTES, HOST_FN_RESULT_CAP_BYTES } from "#server/infra/plugin-host/budgets.ts";

// Far past the membrane's dump depth guard, so the iterative pre-walk must refuse this argument.
const PAST_DEPTH_GUARD = 1000;

// `ctx.dump` serializes through the guest's JSON.stringify, which calls the root's `toJSON` before it walks
// anything. The guest records that call, so a materialization that ran before the guard refused is visible
// even when the refusal itself looks the same.
const DEEP_ARGUMENT = `
const h = orb.host(1);
(async () => {
  let deep = {};
  for (let i = 0; i < ${PAST_DEPTH_GUARD}; i++) { deep = { n: deep }; }
  let materialized = false;
  deep.toJSON = () => { materialized = true; return {}; };
  try { await h.chat.listMessages(h.chat.current(), deep); h.log.info("accepted"); }
  catch (e) { h.log.info("refused:" + e.name); }
  h.log.info("materialized:" + materialized);
})();`;

const ORDINARY_ARGUMENT = `
const h = orb.host(1);
(async () => {
  const view = { order: { newest: true } };
  let materialized = false;
  view.toJSON = () => { materialized = true; return { order: { newest: true } }; };
  try { const rows = await h.chat.listMessages(h.chat.current(), { limit: 5, view }); h.log.info("listed:" + Array.isArray(rows)); }
  catch (e) { h.log.info("refused:" + e.name); }
  h.log.info("materialized:" + materialized);
})();`;

test("a guest argument past the dump depth guard is refused without ever being materialized, and the runtime keeps serving", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn, random: () => 0 });
  const caller = await root.internalCallerFor(root.ownerId);
  const room = (await caller.chat.startChat({ characterIds: [] })).chat;

  const deep = await caller.plugin.runSnippet({ chatId: room.id, code: DEEP_ARGUMENT });
  expect(deep.error).toBeUndefined();
  expect(deep.logLines).toEqual(["[info] refused:Error", "[info] materialized:false"]);

  // The positive control for the sentinel: an argument the guard admits is materialized through `toJSON`.
  const ordinary = await caller.plugin.runSnippet({ chatId: room.id, code: ORDINARY_ARGUMENT });
  expect(ordinary.error).toBeUndefined();
  expect(ordinary.logLines).toEqual(["[info] listed:true", "[info] materialized:true"]);
});

// `room` is the handle the host minted for this invocation. `keepHandle` holds it in the resident realm, so the next
// command can present a handle from an invocation that has ended; `earlierHandle` refuses on its own when it holds none.
const MEMBRANE_OPS = {
  listMessages: "(h, room) => h.chat.listMessages(room)",
  keepHandle: "(h, room) => { globalThis.kept = room; return null; }",
  earlierHandle:
    "async (h, room) => { if (typeof globalThis.kept !== 'string' || globalThis.kept === room) { throw new RangeError('no earlier handle'); } return await h.chat.listMessages(globalThis.kept); }",
  mintedHandle: "(h) => h.chat.listMessages(h.ids.mint())",
  chatIdHandle: "(h, room, a) => h.chat.listMessages(a.chatId)",
  readKey: "(h, room, a) => h.storage.get('k'.repeat(a.length))",
} as const satisfies GuestOps;

test("a host function whose capability is not granted refuses with the capability error, and a granted guest's same call answers", {
  tags: ["slow"],
}, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const owner = await root.principalFor(root.ownerId);
  const reader = await installGuest(root, owner, { slug: "chat-reader", capabilities: ["chat.read"] }, MEMBRANE_OPS);
  const keeper = await installGuest(root, owner, { slug: "kv-keeper", capabilities: ["chat.read", "storage.kv"] }, MEMBRANE_OPS);

  expect(await guestRunner({ root, caller: owner, pluginId: reader, chatId: null })("readKey", { length: 1 })).toEqual({
    ok: false,
    name: new PluginCapabilityError("storage.kv").name,
  });
  expect(await guestRunner({ root, caller: owner, pluginId: keeper, chatId: null })("readKey", { length: 1 })).toEqual({ ok: true, value: null });
});

test("a chat call refuses a fabricated handle, the raw chat id and a handle from an ended invocation, and answers the admitted one", {
  tags: ["slow"],
}, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const owner = await root.principalFor(root.ownerId);
  const room = (await (await root.internalCallerFor(root.ownerId)).chat.startChat({ characterIds: [] })).chat;
  const pluginId = await installGuest(root, owner, { slug: "handle-holder", capabilities: ["chat.read"] }, MEMBRANE_OPS);
  const run = guestRunner({ root, caller: owner, pluginId, chatId: room.id });
  const refused = { ok: false, name: Error.name };

  expect(await run("listMessages")).toMatchObject({ ok: true });
  expect(await run("keepHandle")).toEqual({ ok: true, value: null });
  expect(await run("earlierHandle")).toEqual(refused);
  expect(await run("mintedHandle")).toEqual(refused);
  expect(await run("chatIdHandle", { chatId: room.id })).toEqual(refused);
});

test("a host call whose arguments pass the inbound byte budget is refused before it reaches the host, and one under it answers", {
  tags: ["slow"],
}, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const owner = await root.principalFor(root.ownerId);
  const pluginId = await installGuest(root, owner, { slug: "kv-keeper", capabilities: ["storage.kv"] }, MEMBRANE_OPS);
  const run = guestRunner({ root, caller: owner, pluginId, chatId: null });

  expect(await run("readKey", { length: HOST_FN_ARGS_MAX_BYTES / 2 })).toEqual({ ok: true, value: null });
  expect(await run("readKey", { length: HOST_FN_ARGS_MAX_BYTES + 1 })).toEqual({ ok: false, name: Error.name });
});

// Every place the storage and variables functions take a string, called once with an array there and once with the
// string itself. `written` reads back both stores, so a refused write is seen to leave them empty.
const STRING_ARGUMENTS = [
  { site: "storage.get key", refused: "(h) => h.storage.get(['k'])", accepted: "(h) => h.storage.get('k')" },
  { site: "storage.set key", refused: "(h) => h.storage.set(['k'], 'v')", accepted: "(h) => h.storage.set('k', 'v')" },
  { site: "storage.set value", refused: "(h) => h.storage.set('k', ['v'])", accepted: "(h) => h.storage.set('k', 'v')" },
  {
    site: "storage.compareAndSet key",
    refused: "(h) => h.storage.compareAndSet(['k'], null, 'v')",
    accepted: "(h) => h.storage.compareAndSet('k', null, 'v')",
  },
  {
    site: "storage.compareAndSet expected value",
    refused: "(h) => h.storage.compareAndSet('k', ['x'], 'v')",
    // An omitted precondition is the contract's create, the same as `null`.
    accepted: "(h) => h.storage.compareAndSet('k', undefined, 'v')",
  },
  {
    site: "storage.compareAndSet next value",
    refused: "(h) => h.storage.compareAndSet('k', null, ['v'])",
    accepted: "(h) => h.storage.compareAndSet('k', null, 'v')",
  },
  { site: "storage.delete key", refused: "(h) => h.storage.delete(['k'])", accepted: "(h) => h.storage.delete('k')" },
  { site: "variables.get key", refused: "(h) => h.variables.get(['k'])", accepted: "(h) => h.variables.get('k')" },
  { site: "variables.set key", refused: "(h) => h.variables.set(['k'], 'v')", accepted: "(h) => h.variables.set('k', 'v')" },
  { site: "variables.set value", refused: "(h) => h.variables.set('k', ['v'])", accepted: "(h) => h.variables.set('k', 'v')" },
  { site: "variables.delete key", refused: "(h) => h.variables.delete(['k'])", accepted: "(h) => h.variables.delete('k')" },
] as const;

test.for(STRING_ARGUMENTS)(
  "the $site refuses a non-string at the door and writes nothing; the string answers",
  { tags: ["slow"] },
  async ({ refused, accepted }) => {
    await using root = await createServerHarness({ pluginSpawn: spawn });
    const owner = await root.principalFor(root.ownerId);
    const ops = { refused, accepted, written: "async (h) => [(await h.storage.list()).length, await h.variables.get('k')]" } satisfies GuestOps;
    const pluginId = await installGuest(root, owner, { slug: "string-taker", capabilities: ["storage.kv", "global_vars"] }, ops);
    const run = guestRunner({ root, caller: owner, pluginId, chatId: null });

    expect(await run("refused")).toEqual({ ok: false, name: Error.name });
    expect(await run("written")).toEqual({ ok: true, value: [0, null] });
    expect(await run("accepted")).toMatchObject({ ok: true });
  },
);

// The remote end of a guest's `net.fetch`, the external edge. `/held` answers only once released and gives up when its
// request is aborted; `/body` answers `quotes` double quotes then `tail` letters, a body whose JSON doubles per quote.
const NET_HOST = "peer.test";
const HELD_URL = `https://${NET_HOST}/held`;
const NOW_URL = `https://${NET_HOST}/now`;
const bodyUrl = (quotes: number, tail: number): string => `https://${NET_HOST}/body?quotes=${String(quotes)}&tail=${String(tail)}`;

interface ScriptedRemote {
  readonly fetch: typeof fetch;
  readonly release: () => void;
}

function scriptedRemote(): ScriptedRemote {
  const gate = Promise.withResolvers<void>();
  return {
    release: () => gate.resolve(),
    fetch: (input, init): Promise<Response> => {
      const url = new URL(new Request(input, init).url);
      if (url.pathname === new URL(HELD_URL).pathname) {
        const signal = init?.signal;
        const aborted = new Promise<never>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new Error("the held request was aborted", { cause: signal.reason })), { once: true });
        });
        return Promise.race([gate.promise.then(() => new Response("held")), aborted]);
      }
      if (url.pathname === new URL(NOW_URL).pathname) {
        return Promise.resolve(new Response("now"));
      }
      const quotes = Number(url.searchParams.get("quotes"));
      const tail = Number(url.searchParams.get("tail"));
      return Promise.resolve(new Response(`${'"'.repeat(quotes)}${"a".repeat(tail)}`, { headers: { "content-type": "text/plain" } }));
    },
  };
}

const NET_OPS = {
  status: "async (h, room, a) => (await h.net.fetch(a.url)).status",
  bodyLength: "async (h, room, a) => (await h.net.fetch(a.url)).body.length",
  flood:
    "async (h, room, a) => { globalThis.held = Array.from({ length: a.max }, () => h.net.fetch(a.url).then((r) => r.status, (e) => e.name)); return (await h.net.fetch(a.url)).status; }",
  drain: "() => Promise.all(globalThis.held)",
} as const satisfies GuestOps;

async function netGuest(root: ServerTestHarness): Promise<ReturnType<typeof guestRunner>> {
  const owner = await root.principalFor(root.ownerId);
  const pluginId = await installGuest(root, owner, { slug: "net-caller", capabilities: ["net.fetch"], netHosts: [NET_HOST] }, NET_OPS);
  return guestRunner({ root, caller: owner, pluginId, chatId: null });
}

test("a host call still running at the deadline rejects with the deadline error, and one that answers sooner resolves", { tags: ["slow"] }, async () => {
  const remote = scriptedRemote();
  await using root = await createServerHarness({
    pluginSpawn: spawn,
    networkExecution: { resolver: () => Promise.resolve([PUBLIC_PEER_ADDRESS]), fetch: remote.fetch },
  });
  using _released = { [Symbol.dispose]: remote.release };
  const run = await netGuest(root);

  // No door shortens `HOST_FN_DEADLINE_MS`: this call waits the production deadline in real time.
  expect(await run("status", { url: HELD_URL })).toEqual({ ok: false, name: PluginHostDeadlineError.name });
  expect(await run("status", { url: NOW_URL })).toEqual({ ok: true, value: 200 });
});

test("a host result exactly at the result cap crosses, and one byte more is refused", { tags: ["slow"] }, async () => {
  const remote = scriptedRemote();
  await using root = await createServerHarness({
    pluginSpawn: spawn,
    networkExecution: { resolver: () => Promise.resolve([PUBLIC_PEER_ADDRESS]), fetch: remote.fetch },
  });
  const run = await netGuest(root);
  // Each quote serializes to two bytes, so the body fills what the `{status, body}` wrapper leaves of the cap.
  const emptyResult: Awaited<ReturnType<PluginHostV1["net"]["fetch"]>> = { status: 200, body: "" };
  const room = HOST_FN_RESULT_CAP_BYTES - Buffer.byteLength(JSON.stringify(emptyResult), "utf8");
  const quotes = Math.floor(room / 2);
  const tail = room - quotes * 2;

  expect(await run("bodyLength", { url: bodyUrl(quotes, tail) })).toEqual({ ok: true, value: quotes + tail });
  expect(await run("bodyLength", { url: bodyUrl(quotes, tail + 1) })).toEqual({ ok: false, name: Error.name });
});

test("the in-flight cap admits its number of concurrent host calls and refuses one more", { tags: ["slow"] }, async () => {
  const remote = scriptedRemote();
  await using root = await createServerHarness({
    pluginSpawn: spawn,
    networkExecution: { resolver: () => Promise.resolve([PUBLIC_PEER_ADDRESS]), fetch: remote.fetch },
  });
  const run = await netGuest(root);

  expect(await run("flood", { url: HELD_URL, max: HOST_CALLS_IN_FLIGHT_MAX })).toEqual({ ok: false, name: Error.name });
  remote.release();
  expect(await run("drain")).toEqual({ ok: true, value: Array.from({ length: HOST_CALLS_IN_FLIGHT_MAX }, () => 200) });
});
