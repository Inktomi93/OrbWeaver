// @subject tests/support/node/corpus-plugin-host.ts
// @subject tests/support/node/factories/plugin.ts
import { spawn } from "node:child_process";
import { triggerFactSchema } from "@orb/contracts/automation";
import { assets, characters, documents, imageryGenerations } from "@orb/db";
import { createIdSource, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { jsonValueSchema } from "@orb/kit/json";
import { estimateTokens } from "@orb/kit/tokens";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  CORPUS_PLUGIN_HOST_DRAFT,
  CORPUS_PLUGIN_HOST_IMAGE_MODEL,
  CORPUS_PLUGIN_HOST_IMAGE_URL,
  CORPUS_PLUGIN_HOST_MACRO,
  CORPUS_PLUGIN_HOST_MANIFEST,
  CORPUS_PLUGIN_HOST_REPLY,
  CORPUS_PLUGIN_HOST_URL,
  captureCorpusPluginHost,
  CORPUS_PLUGIN_HOST_KEYS as KEYS,
  seedCorpusPluginHost,
} from "./corpus-plugin-host.ts";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "./corpus-provider.ts";
import { seedCorpusActors, seedCorpusLibraries } from "./corpus-seed.ts";
import { makeAssetBytes } from "./factories/asset.ts";
import { makePluginBundle, seedInstalledPlugin, seedPluginGrant } from "./factories/plugin.ts";
import { expect, test } from "./fixtures.ts";
import { createServerHarness } from "./server.ts";

const observationsSchema = z.record(z.string(), jsonValueSchema);

test("the native resident guest captures admitted host returns and real prompt/event callbacks without a proxy", { tags: ["slow"] }, async ({ ids }) => {
  const source = createIdSource(ids.next);
  const generatedImage = makeAssetBytes(source.typeId(ID_PREFIX.asset));
  const remoteImage = makeAssetBytes(source.typeId(ID_PREFIX.asset));
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL, CORPUS_PLUGIN_HOST_IMAGE_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: CORPUS_PLUGIN_HOST_REPLY,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [generatedImage],
  });
  const bodies: string[] = [];
  const network: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.url === CORPUS_PLUGIN_HOST_URL && request.method === "GET") {
      return new Response("Native fetched ledger", { status: 206 });
    }
    if (request.url === CORPUS_PLUGIN_HOST_IMAGE_URL && request.method === "GET") {
      return new Response(Uint8Array.from(remoteImage), { headers: { "content-type": "text/plain" } });
    }
    if (request.method === "POST") {
      bodies.push(await request.clone().text());
    }
    return physical.execute(request);
  };
  await using root = await createServerHarness({
    pluginSpawn: spawn,
    providerFetch: network,
    networkExecution: {
      fetch: network,
      resolver: (host) => {
        if (host === new URL(CORPUS_PLUGIN_HOST_URL).hostname) {
          return Promise.resolve(["93.184.215.14"]);
        }
        if (host === new URL(CORPUS_PROVIDER_ENDPOINT).hostname) {
          return Promise.resolve(["127.0.0.1"]);
        }
        throw new Error(`native host fixture refused unconfigured DNS host '${host}'`);
      },
    },
  });
  const actors = await seedCorpusActors(root);
  const library = await seedCorpusLibraries(root);
  const result = await seedCorpusPluginHost(root, actors, library);
  expect(result.plugin.outcome.status).toBe("enabled");
  const reads = observationsSchema.parse(result.observations[KEYS.reads]);
  expect(reads).toMatchObject({
    version: 1,
    grants: CORPUS_PLUGIN_HOST_MANIFEST.capabilities,
    random: 0.5,
    tokens: estimateTokens("native token witness"),
    variables: { nativeHost: "bound" },
    applied: { outcome: "applied" },
    stale: { outcome: "stale", actual: { nativeHost: "bound" } },
    globalValue: "installer value",
    globalAbsent: null,
    stored: "first",
    casApplied: { applied: true, current: "second" },
    casStale: { applied: false, current: "second" },
    keys: ["cell"],
    absent: null,
    cardAbsent: null,
    cardState: { witness: "native card" },
  });
  expect(reads["at"]).toBe(result.readAt);
  expect(reads["ids"]).toEqual([expect.any(String), expect.any(String)]);
  expect(new Set(z.array(z.string()).parse(reads["ids"])).size).toBe(2);
  expect(reads["room"]).toEqual(expect.any(String));
  expect(reads["messages"]).toEqual([expect.objectContaining({ content: "Native host transcript witness.", role: "user" })]);
  expect(reads["characters"]).toEqual([{ id: library.character.id, name: library.character.name, avatarAssetId: null }]);
  expect(reads["books"]).toEqual([{ id: library.world.book.id, name: library.world.book.name }]);
  expect(reads["entries"]).toEqual(expect.arrayContaining([expect.objectContaining({ content: "Native guest lore", enabled: true, keys: ["native"] })]));
  const ownedBytes = await root.app.assets.readOwnedAssetBytes(actors.owner, library.asset.assetId);
  expect(reads["asset"]).toEqual({ mime: "image/png", sizeBytes: ownedBytes.bytes.byteLength, dataBase64: Buffer.from(ownedBytes.bytes).toString("base64") });

  const produced = observationsSchema.parse(result.observations[KEYS.produced]);
  expect(produced).toMatchObject({
    quiet: CORPUS_PLUGIN_HOST_REPLY,
    fetched: { status: 206, body: "Native fetched ledger" },
    ingested: { created: true },
    repeated: { created: false },
    withArt: { created: false },
  });
  const documentId = typeIdSchema(ID_PREFIX.document).parse(observationsSchema.parse(produced["document"])["documentId"]);
  expect(
    await root.db
      .select()
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.ownerId, root.ownerId)))
      .get(),
  ).toMatchObject({ name: "Native guest source" });
  const importedId = typeIdSchema(ID_PREFIX.character).parse(observationsSchema.parse(produced["ingested"])["characterId"]);
  expect(observationsSchema.parse(produced["repeated"])["characterId"]).toBe(importedId);
  expect(
    await root.db
      .select()
      .from(characters)
      .where(and(eq(characters.id, importedId), eq(characters.ownerId, root.ownerId)))
      .get(),
  ).toMatchObject({ name: library.character.name });
  const fetchedId = typeIdSchema(ID_PREFIX.asset).parse(observationsSchema.parse(produced["fetchedAsset"])["assetId"]);
  const fetched = await root.app.assets.readOwnedAssetBytes(actors.owner, fetchedId);
  expect(Uint8Array.from(fetched.bytes)).toEqual(remoteImage);
  expect(await root.db.select().from(assets).where(eq(assets.id, fetchedId)).get()).toMatchObject({ ownerId: root.ownerId, mime: "image/png" });
  const imageId = typeIdSchema(ID_PREFIX.asset).parse(observationsSchema.parse(produced["image"])["assetId"]);
  expect(Uint8Array.from((await root.app.assets.readOwnedAssetBytes(actors.owner, imageId)).bytes)).toEqual(generatedImage);
  expect(await root.db.select().from(imageryGenerations).where(eq(imageryGenerations.assetId, imageId)).get()).toMatchObject({
    chatId: library.room.chat.id,
    connectionId: result.imageConnection.id,
  });
  expect(result.observations[KEYS.search]).toEqual(
    expect.arrayContaining([expect.objectContaining({ documentId, documentName: "Native guest source", content: expect.stringContaining("funded witness") })]),
  );
  expect(result.turn.aborted).toBe(false);
  expect(observationsSchema.parse(result.observations[KEYS.transform])).toMatchObject({
    draft: CORPUS_PLUGIN_HOST_DRAFT,
    env: { chatId: library.room.chat.id, vars: { nativeHost: "bound" } },
  });
  expect(result.observations[KEYS.macro]).toBe(true);
  expect(bodies.join("\n")).toContain(CORPUS_PLUGIN_HOST_MACRO);
  expect(bodies.join("\n")).toContain(`${CORPUS_PLUGIN_HOST_DRAFT} [native transform]`);

  const caller = await root.internalCallerFor(root.ownerId);
  await caller.plugin.invokeUiCommand({ pluginId: result.plugin.plugin.id, name: "emit", args: "", values: { witness: "owner plane" }, chatId: null });
  await root.settleBackground();
  const ownedAsset = await root.app.assets.store({
    principal: actors.owner,
    bytes: makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)),
    kind: "attachment",
    mime: "image/png",
  });
  await root.settleBackground();
  await expect
    .poll(async () => (await captureCorpusPluginHost(root, result.plugin.plugin.id)).observations[KEYS.event], { timeout: 2000 })
    .toMatchObject({
      assetId: ownedAsset.assetId,
    });
  const owned = await captureCorpusPluginHost(root, result.plugin.plugin.id);
  expect(owned.observations[KEYS.pubsub]).toEqual({ name: "ledger", data: { witness: "owner plane" } });
  expect(triggerFactSchema.parse(owned.observations[KEYS.event])).toMatchObject({
    bus: "domain",
    type: "asset.created",
    assetId: ownedAsset.assetId,
    chatId: null,
  });
  const foreign = await root.principalFor(actors.secondUserId);
  const foreignInstall = await seedInstalledPlugin(root, {
    caller: foreign,
    bundle: makePluginBundle(
      CORPUS_PLUGIN_HOST_MANIFEST,
      `const h=orb.host(1); const keys=${JSON.stringify(KEYS)};
      h.events.on("asset.created",async(fact)=>{await h.storage.set(keys.event,JSON.stringify(fact));});
      h.pubsub.on(${JSON.stringify(CORPUS_PLUGIN_HOST_MANIFEST.id)},"ledger",async(event)=>{await h.storage.set(keys.pubsub,JSON.stringify(event));});
      h.ui.registerCommand({name:"emit",describe:"Publish foreign plane",onRun:async()=>{await h.pubsub.emit("ledger",{witness:"foreign plane"});}});`,
      root.clock.now(),
    ),
    grant: [],
  });
  await seedPluginGrant(root, {
    caller: foreign,
    pluginId: foreignInstall.plugin.id,
    grant: CORPUS_PLUGIN_HOST_MANIFEST.capabilities,
    acknowledgedNetHosts: CORPUS_PLUGIN_HOST_MANIFEST.netHosts ?? [],
    enable: true,
  });
  const other = await root.internalCallerFor(foreign.userId);
  await other.plugin.invokeUiCommand({ pluginId: foreignInstall.plugin.id, name: "emit", args: "", chatId: null });
  const foreignAsset = await root.app.assets.store({
    principal: foreign,
    bytes: makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)),
    kind: "attachment",
    mime: "image/png",
  });
  await root.settleBackground();
  await expect
    .poll(async () => (await captureCorpusPluginHost(root, foreignInstall.plugin.id, foreign.userId)).observations, { timeout: 2000 })
    .toMatchObject({
      [KEYS.event]: { assetId: foreignAsset.assetId },
      [KEYS.pubsub]: { name: "ledger", data: { witness: "foreign plane" } },
    });
  const afterForeign = await captureCorpusPluginHost(root, result.plugin.plugin.id);
  expect(afterForeign.observations[KEYS.pubsub]).toEqual(owned.observations[KEYS.pubsub]);
  expect(afterForeign.observations[KEYS.event]).toEqual(owned.observations[KEYS.event]);
  await expect(other.character.get({ characterId: importedId })).rejects.toMatchObject({ code: "NOT_FOUND" });
});
