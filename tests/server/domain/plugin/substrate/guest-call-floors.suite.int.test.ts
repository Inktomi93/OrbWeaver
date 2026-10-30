// The composed root pairs each belted capability with its own production ceiling: a real guest gets exactly that many
// calls per plugin per hour, the refused call never reaches the provider or the network, a second plugin keeps its
// own budget, and the window reopens on the root's clock. Plain and structured quiet generations share one lane.
// @subject packages/server/src/entry/compose/automation-plugin.ts
// @subject packages/server/src/domain/plugin/substrate/bridge.ts

import { spawn } from "node:child_process";
import type { Principal } from "@orb/contracts/identity";
import { AUTOMATION_NOTICE_COOLDOWN_SECONDS } from "@orb/contracts/notifications";
import type { PluginCapability } from "@orb/contracts/plugin";
import type { ChatId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { JsonValue } from "@orb/kit/json";
import { MS_PER_HOUR, MS_PER_SECOND } from "@orb/kit/time";
import { PLUGIN_ASSET_EGRESS_PER_HOUR, PLUGIN_EGRESS_PER_HOUR, PLUGIN_QUIET_LLM_PER_HOUR, PLUGIN_SEARCH_QUERY_PER_HOUR } from "@orb/server/domain/plugin";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  makeAssetBytes,
  seedCorpusActors,
} from "@orb/testkit/node/composed";
import { z } from "zod";
import type { GuestOps, GuestRun } from "./_guest-command.ts";
import { guestRunner, installGuest } from "./_guest-command.ts";

const NET_HOST = "plugin.example.test";
const PAGE_URL = `https://${NET_HOST}/page`;
const IMAGE_URL = `https://${NET_HOST}/cover.png`;
// A structured quiet call names a schema the corpus provider scripts a reply for; its fields do not matter to the lane.
const STRUCTURED: JsonValue = { name: [...CORPUS_STRUCTURED_REPLIES.keys()][0] ?? "", schema: { type: "object", properties: {} } };
const CALL = {
  quiet: "h.llm.quiet('Summarise call ' + i, i % 2 === 0 ? undefined : { schema: a.structured })",
  search: "h.search.documents('query ' + i, { limit: 1 })",
  fetch: "h.net.fetch(a.url + '?' + i)",
  fetchAsset: "h.net.fetchAsset(a.url)",
  notify: "h.notifications.post(room, 'host', 'Notice ' + i)",
} as const;
type Belted = keyof typeof CALL;
// Each op runs one batch of calls numbered from `offset` and reports how many resolved and the first refused number.
const FLOOR_OPS = Object.fromEntries(
  Object.entries(CALL).map(([kind, call]) => [
    kind,
    `async (h, room, a) => { let resolved = 0; let refusedAt = null; for (let i = a.offset; i < a.offset + a.count; i += 1) { try { await ${call}; resolved += 1; } catch (e) { if (refusedAt === null) { refusedAt = i; } } } return { resolved, refusedAt }; }`,
  ]),
) satisfies GuestOps;
// Batches keep each invocation well inside its wall; the floor is per plugin, so batching changes no budget.
const BATCH = 100;
const batchSchema = z.strictObject({ resolved: z.int().nonnegative(), refusedAt: z.int().nonnegative().nullable() });
type Batch = z.infer<typeof batchSchema>;

async function drive(run: GuestRun, kind: Belted, args: Readonly<Record<string, JsonValue>>, total: number): Promise<Batch> {
  let resolved = 0;
  let refusedAt: number | null = null;
  for (let offset = 0; offset < total; offset += BATCH) {
    const outcome = await run(kind, { ...args, offset, count: Math.min(BATCH, total - offset) });
    if (!outcome.ok) {
      throw new Error(`the ${kind} batch at ${offset} failed in the guest`);
    }
    const batch = batchSchema.parse(outcome.value);
    resolved += batch.resolved;
    refusedAt ??= batch.refusedAt;
  }
  return { resolved, refusedAt };
}
const CAPABILITIES = ["chat.read", "llm.quiet", "search.query", "net.fetch", "net.fetch_asset", "notify"] as const satisfies readonly PluginCapability[];

interface FloorRoot extends AsyncDisposable {
  readonly root: ServerTestHarness;
  readonly owner: Principal;
  readonly chatId: ChatId;
  /** Provider POST paths and plugin egress urls, in arrival order. */
  readonly reached: readonly string[];
  readonly guest: (slug: string) => Promise<GuestRun>;
}

async function floorRoot(): Promise<FloorRoot> {
  const reached: string[] = [];
  const image = makeAssetBytes(mintTypeId(ID_PREFIX.asset));
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "A quiet answer.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  // Provider and plugin egress share the root's one network door, so one function answers both by origin.
  const network: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.hostname !== NET_HOST) {
      if (request.method === "POST") {
        reached.push(url.pathname);
      }
      return await provider.execute(request);
    }
    reached.push(request.url);
    return request.url === IMAGE_URL ? new Response(Uint8Array.from(image), { headers: { "content-type": "image/png" } }) : new Response("A page.");
  };
  const root = await createServerHarness({
    pluginSpawn: spawn,
    providerFetch: network,
    networkExecution: {
      fetch: network,
      resolver: (host) => Promise.resolve([host === NET_HOST ? "93.184.215.14" : "127.0.0.1"]),
    },
  });
  const { owner, connections } = await seedCorpusActors(root);
  const caller = await root.internalCallerFor(owner.userId);
  const text = connections.text;
  const chatId = (await root.services.chat.startChat({ principal: owner, characterIds: [], opening: "none" })).chat.id;
  const guest = async (slug: string): Promise<GuestRun> => {
    const pluginId = await installGuest(root, owner, { slug, capabilities: CAPABILITIES, netHosts: [NET_HOST] }, FLOOR_OPS);
    await caller.connection.setBinding({ task: "summarize", connectionId: text.id, actor: { kind: "plugin-grant", pluginId } });
    return guestRunner({ root, caller: owner, pluginId, chatId });
  };
  return { root, owner, chatId, reached, guest, [Symbol.asyncDispose]: () => root[Symbol.asyncDispose]() };
}

// `boundary` names the external request each admitted call makes. A search over an owner with no indexed documents
// embeds nothing, so its pairing is asserted on the guest's own counts alone.
const PAIRINGS: readonly {
  readonly kind: Exclude<Belted, "notify">;
  readonly limit: number;
  readonly boundary: ((reached: string) => boolean) | null;
}[] = [
  { kind: "quiet", limit: PLUGIN_QUIET_LLM_PER_HOUR, boundary: (reached) => reached.endsWith("/chat/completions") },
  { kind: "search", limit: PLUGIN_SEARCH_QUERY_PER_HOUR, boundary: null },
  { kind: "fetch", limit: PLUGIN_EGRESS_PER_HOUR, boundary: (reached) => reached.startsWith(PAGE_URL) },
  { kind: "fetchAsset", limit: PLUGIN_ASSET_EGRESS_PER_HOUR, boundary: (reached) => reached === IMAGE_URL },
];

for (const { kind, limit, boundary } of PAIRINGS) {
  test(`${kind} admits its production hourly ceiling per plugin and refuses the next call before it leaves the box`, {
    tags: ["slow"],
    timeout: 180_000,
  }, async () => {
    await using floors = await floorRoot();
    const run = await floors.guest("floor-runner");
    const other = await floors.guest("other-floor-runner");
    const args = { url: kind === "fetchAsset" ? IMAGE_URL : PAGE_URL, structured: STRUCTURED };
    const crossed = (): number => (boundary === null ? 0 : floors.reached.filter(boundary).length);
    // Each admitted call crosses the boundary once; a pairing with no observable boundary crosses nothing.
    const perCall = boundary === null ? 0 : 1;
    const before = crossed();

    expect(await drive(run, kind, args, limit + 1)).toEqual({ resolved: limit, refusedAt: limit });
    expect(crossed() - before).toBe(limit * perCall);

    expect(await drive(other, kind, args, 1)).toEqual({ resolved: 1, refusedAt: null });
    floors.root.clock.advance(MS_PER_HOUR);
    expect(await drive(run, kind, args, 1)).toEqual({ resolved: 1, refusedAt: null });
    expect(crossed() - before).toBe((limit + 2) * perCall);
  });
}

test("a notice claims the per-room cooldown, and the room reopens when it passes", { tags: ["slow"] }, async () => {
  await using floors = await floorRoot();
  const run = await floors.guest("floor-runner");
  const other = await floors.guest("other-floor-runner");

  expect(await drive(run, "notify", {}, 2)).toEqual({ resolved: 1, refusedAt: 1 });
  expect(await drive(other, "notify", {}, 1)).toEqual({ resolved: 1, refusedAt: null });
  floors.root.clock.advance(AUTOMATION_NOTICE_COOLDOWN_SECONDS * MS_PER_SECOND - 1);
  expect(await drive(run, "notify", {}, 1)).toEqual({ resolved: 0, refusedAt: 0 });
  floors.root.clock.advance(1);
  expect(await drive(run, "notify", {}, 1)).toEqual({ resolved: 1, refusedAt: null });
});
