// The shipped Card Atlas runs under the real plugin host against scripted community hubs. Only the hubs are scripted:
// each badge is the guest's own publication over a `character.findCardData` read of real character rows.
// @subject packages/server/src/domain/character/persistence/plugin-card-data.ts
// @subject packages/showcase-plugins/bundles/card-atlas/main.ts

import { spawn } from "node:child_process";
import type { Principal } from "@orb/contracts/identity";
import { pluginCardStateKey } from "@orb/contracts/plugin";
import type { CharacterId, PluginId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, requireShowcaseBundle, seedCorpusActors } from "@orb/testkit/node/composed";
import { z } from "zod";
import { guestRunner, installGuest } from "./_guest-command.ts";

const ATLAS = "card-atlas";
const HUB_ADDRESS = "93.184.215.14";
const WYVERN = "wyvern";
const BOTBOORU = "botbooru";
const STAMP_KEY = pluginCardStateKey(ATLAS);
const ATLAS_GRANTS = ["storage.kv", "ui.surface", "net.fetch", "character.ingest", "character.card_state"] as const;

type Card = Readonly<Record<string, unknown>>;
type AtlasCaller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;
interface HubListing {
  readonly id: string;
  readonly card: Card;
}
interface EnabledAtlas {
  readonly caller: AtlasCaller;
  readonly pluginId: PluginId;
}
interface AtlasDriver {
  /** Each tile on the hub's page, as `name` or `name: badge`. */
  readonly tiles: (source: string) => Promise<string[]>;
  readonly add: (source: string, tile: number) => Promise<void>;
}
interface Hubs {
  wyvern: readonly HubListing[];
  botbooru: readonly HubListing[];
}

const tilesSchema = z.object({ tiles: z.array(z.object({ title: z.string(), badge: z.string().optional() })) });

function card(name: string, extensions: Readonly<Record<string, unknown>> = {}): Card {
  // Tuple-built: every key is a card wire token.
  const data = Object.fromEntries([
    ["name", name],
    ["description", `${name} waits by the gate.`],
    ["personality", ""],
    ["scenario", ""],
    ["first_mes", "Hello."],
    ["mes_example", ""],
    ["extensions", extensions],
  ]);
  return Object.fromEntries([
    ["spec", "chara_card_v2"],
    ["spec_version", "2.0"],
    // Wyvern's detail reads the root description; the import reads `data`.
    ["description", data["description"]],
    ["data", data],
  ]);
}

function nameOf(listing: HubListing): string {
  return z.object({ data: z.object({ name: z.string() }) }).parse(listing.card).data.name;
}

/** The two JSON hubs the guest can add from without the art plane. Anything else is an unscripted request. */
function hubResponse(hubs: Hubs, url: URL): Response {
  const id = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
  if (url.hostname === "api.wyvern.chat" && url.pathname === "/exploreSearch/characters") {
    return Response.json({ totalPages: 1, results: hubs.wyvern.map((listing) => ({ id: listing.id, name: nameOf(listing), tags: [] })) });
  }
  if (url.hostname === "api.wyvern.chat" && url.pathname.startsWith("/characters/")) {
    return Response.json(hubs.wyvern.find((listing) => listing.id === id)?.card);
  }
  if (url.hostname === "botbooru.com" && url.pathname === "/posts/") {
    return Response.json({
      total: hubs.botbooru.length,
      posts: hubs.botbooru.map((listing) =>
        Object.fromEntries<unknown>([
          ["id", Number(listing.id)],
          ["character_name", nameOf(listing)],
          ["tags", []],
        ]),
      ),
    });
  }
  if (url.hostname === "botbooru.com" && url.pathname.startsWith("/download/json/")) {
    return Response.json(hubs.botbooru.find((listing) => listing.id === id)?.card);
  }
  throw new Error(`Unscripted Atlas request: ${url.href}`);
}

async function atlasRoot(hubs: Hubs): Promise<ServerTestHarness> {
  return await createServerHarness({
    pluginSpawn: spawn,
    networkExecution: {
      fetch: (input, init) => Promise.resolve(hubResponse(hubs, new URL(new Request(input, init).url))),
      resolver: () => Promise.resolve([HUB_ADDRESS]),
    },
  });
}

async function enableAtlas(root: ServerTestHarness, who: Principal): Promise<EnabledAtlas> {
  const caller = await root.internalCallerFor(who.userId);
  const bundleBase64 = Buffer.from(await requireShowcaseBundle(ATLAS)).toString("base64");
  const seeded = (await caller.plugin.list()).find((plugin) => plugin.slug === ATLAS);
  const enabled =
    seeded === undefined ? await caller.plugin.install({ bundleBase64, grant: [] }) : await caller.plugin.upgrade({ pluginId: seeded.id, bundleBase64 });
  await caller.plugin.setGrant({ pluginId: enabled.id, grant: [...ATLAS_GRANTS], acknowledgedNetHosts: [...(enabled.netHosts ?? [])], enable: true });
  await expect.poll(() => caller.plugin.getSurfaceState({ pluginId: enabled.id, surfaceId: "atlas_page" })).toMatchObject({ stage: "browse", loading: false });
  return { caller, pluginId: enabled.id };
}

function atlasDriver({ caller, pluginId }: EnabledAtlas): AtlasDriver {
  const address = { pluginId, surfaceId: "atlas_page" };
  const act = (actionId: string, values: Record<string, string> = {}): Promise<unknown> => caller.plugin.invokeUiAction({ ...address, actionId, values });
  const state = (): Promise<unknown> => caller.plugin.getSurfaceState(address);
  const search = async (source: string): Promise<void> => {
    await act("search", { q: "", source, sort: "relevance", sfw: "false" });
    await expect.poll(state).toMatchObject({ stage: "browse", loading: false });
  };
  return {
    tiles: async (source): Promise<string[]> => {
      await search(source);
      return tilesSchema.parse(await state()).tiles.map((tile) => (tile.badge === undefined ? tile.title : `${tile.title}: ${tile.badge}`));
    },
    add: async (source, tile): Promise<void> => {
      await search(source);
      await act("open_result", { tile: `r${tile}` });
      await expect.poll(state).toMatchObject({ stage: "card", status: "", detail: { blurb: expect.stringContaining("waits by the gate") } });
      await act("add_to_library");
      await expect.poll(state).toMatchObject({ stage: "card", detail: { owned: expect.stringContaining("ibrary") } });
    },
  };
}

async function libraryId(caller: AtlasCaller, name: string): Promise<CharacterId> {
  const found = (await caller.character.list({})).items.find((item) => item.name === name);
  if (found === undefined) {
    throw new Error(`${name} is not in the library`);
  }
  return found.id;
}

/** Bring a card into the owner's library through another plugin's import, so nothing Atlas wrote is on it. */
async function ingestThroughStranger(root: ServerTestHarness, who: Principal, cards: readonly Card[]): Promise<void> {
  const pluginId = await installGuest(
    root,
    who,
    { slug: "card-courier", capabilities: ["character.ingest"] },
    { ingest: "(h, room, a) => h.character.ingest(a.card)" },
  );
  const run = guestRunner({ root, caller: who, pluginId, chatId: null });
  for (const carried of cards) {
    expect(await run("ingest", { card: z.json().parse(carried) })).toMatchObject({ ok: true });
  }
}

test("an added card badges, deleting the character clears the badge, and another owner never sees it", { tags: ["slow"] }, async () => {
  await using root = await atlasRoot({ wyvern: [{ id: "w1", card: card("Illyria") }], botbooru: [] });
  const { owner, secondUserId } = await seedCorpusActors(root);
  const ownerAtlas = await enableAtlas(root, owner);
  const strangerAtlas = await enableAtlas(root, await root.principalFor(secondUserId));
  const atlas = atlasDriver(ownerAtlas);

  expect(await atlas.tiles(WYVERN)).toEqual(["Illyria"]);
  await atlas.add(WYVERN, 0);
  expect(await atlas.tiles(WYVERN)).toEqual(["Illyria: in your library"]);
  expect(await atlasDriver(strangerAtlas).tiles(WYVERN)).toEqual(["Illyria"]);

  await ownerAtlas.caller.character.remove({ characterId: await libraryId(ownerAtlas.caller, "Illyria") });
  expect(await atlas.tiles(WYVERN)).toEqual(["Illyria"]);
});

test("one card added from two hubs badges on both", { tags: ["slow"] }, async () => {
  const shared = card("Sorrel");
  await using root = await atlasRoot({ wyvern: [{ id: "w1", card: shared }], botbooru: [{ id: "7", card: shared }] });
  const { owner } = await seedCorpusActors(root);
  const enabled = await enableAtlas(root, owner);
  const atlas = atlasDriver(enabled);

  await atlas.add(WYVERN, 0);
  expect(await atlas.tiles(BOTBOORU)).toEqual(["Sorrel"]);
  await atlas.add(BOTBOORU, 0);

  expect(await atlas.tiles(WYVERN)).toEqual(["Sorrel: in your library"]);
  expect(await atlas.tiles(BOTBOORU)).toEqual(["Sorrel: in your library"]);
  expect((await enabled.caller.character.list({})).items.filter((item) => item.name === "Sorrel")).toHaveLength(1);
});

test("an older single-ref stamp badges only its own hub and keeps that badge through a second-hub add", { tags: ["slow"] }, async () => {
  // One numeric id on two hubs: a ref match alone would badge the wrong hub's card.
  const stamped = card("Thistle", { [STAMP_KEY]: { source: "BotBooru", ref: "7", importedAtMs: 1 } });
  const wyvernTwin = card("Wren");
  await using root = await atlasRoot({
    wyvern: [
      { id: "7", card: wyvernTwin },
      { id: "w2", card: stamped },
    ],
    botbooru: [{ id: "7", card: stamped }],
  });
  const { owner } = await seedCorpusActors(root);
  await ingestThroughStranger(root, owner, [stamped]);
  const atlas = atlasDriver(await enableAtlas(root, owner));

  expect(await atlas.tiles(BOTBOORU)).toEqual(["Thistle: in your library"]);
  expect(await atlas.tiles(WYVERN)).toEqual(["Wren", "Thistle"]);

  await atlas.add(WYVERN, 1);
  expect(await atlas.tiles(WYVERN)).toEqual(["Wren", "Thistle: in your library"]);
  expect(await atlas.tiles(BOTBOORU)).toEqual(["Thistle: in your library"]);
});

test("a forged non-object stamp on an imported card reads as no stamp, and the lookup still answers", { tags: ["slow"] }, async () => {
  await using root = await atlasRoot({ wyvern: [{ id: "w1", card: card("Bramble") }], botbooru: [] });
  const { owner } = await seedCorpusActors(root);
  await ingestThroughStranger(root, owner, [card("Forged scalar", { [STAMP_KEY]: "wyvern:w1" }), card("Forged list", { [STAMP_KEY]: ["wyvern:w1", "w1"] })]);
  const enabled = await enableAtlas(root, owner);

  expect(await atlasDriver(enabled).tiles(WYVERN)).toEqual(["Bramble"]);
  const log = await enabled.caller.plugin.getLog({ pluginId: enabled.pluginId });
  expect(log.filter(({ message }) => message.includes("library lookup failed"))).toEqual([]);
});
