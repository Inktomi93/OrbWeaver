// @subject tests/support/node/corpus-surface-outputs.ts
// @subject tests/support/node/corpus-surface-wire.ts
import { assertReferentialIntegrity } from "@orb/db";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { UNKNOWN_COMMIT } from "@orb/kit/version-identity";
import { CORPUS_EMBED_MODEL, CORPUS_EMBEDDING_VECTOR, CORPUS_STRUCTURED_REPLIES, CORPUS_TEXT_MODEL, createCorpusProviderExecution } from "./corpus-provider.ts";
import {
  SURFACE_GLOBAL_KEY,
  SURFACE_GREETING_CUE,
  SURFACE_GREETING_REPLY,
  SURFACE_TAG_ALPHA,
  SURFACE_TAG_BETA,
  seedCorpusSurfaceOutputs,
} from "./corpus-surface-outputs.ts";
import { createSurfaceOutputWire, SURFACE_BACKGROUND_URL, SURFACE_BAD_BACKGROUND_URL } from "./corpus-surface-wire.ts";
import { expect, test } from "./fixtures.ts";
import { createServerHarness } from "./server.ts";

test("native surface suppliers preserve app override provenance, owner-only globals, character census and independent asset keysets", async () => {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: SURFACE_GREETING_REPLY,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const wire = createSurfaceOutputWire(provider.execute);
  await using root = await createServerHarness({
    providerFetch: provider.execute,
    networkExecution: { fetch: wire.execute, resolver: () => Promise.resolve(["93.184.215.14"]) },
  });
  const output = await seedCorpusSurfaceOutputs(root, wire);
  const { settings, characters, assets } = output;
  const owner = await root.internalCallerFor(root.ownerId);
  const other = await root.internalCallerFor(output.otherUserId);
  expect(settings.version.commit).not.toBe(UNKNOWN_COMMIT);
  expect(await other.settings.getVersion()).toEqual(settings.version);
  expect(settings.updates.map((update) => update.status)).toEqual(["up-to-date", "behind", "unknown", "unknown"]);
  expect(settings.updates[0]?.reason).toBeNull();
  expect(settings.updates[1]?.remote?.channel).toBe(settings.version.channel);
  expect(settings.updates[2]).toMatchObject({ remote: null, reason: expect.stringContaining("payload") });
  expect(settings.updates[3]).toMatchObject({ remote: null, reason: expect.stringContaining("couldn't reach GitHub") });
  expect(wire.remainingUpdates()).toBe(0);
  const upstream = wire.requests.filter((request) => new URL(request.url).hostname === "api.github.com");
  expect(upstream).toHaveLength(4);
  expect(upstream.map((request) => [request.method, request.headers.get("authorization"), request.headers.get("cookie")])).toEqual(
    Array.from({ length: 4 }, () => ["GET", null, null]),
  );
  expect(settings.patched.forbidExternalMedia).toBe(!settings.before.resolved.forbidExternalMedia);
  expect(settings.pinned.resolved).toEqual(settings.patched);
  expect(settings.pinned.overrides.forbidExternalMedia).toBe(settings.patched.forbidExternalMedia);
  expect(settings.after.resolved).toEqual(settings.cleared);
  expect(settings.after.resolved.forbidExternalMedia).toBe(settings.before.resolved.forbidExternalMedia);
  expect(settings.after.overrides.forbidExternalMedia).toBeNull();
  expect(await owner.settings.getAppSettings()).toEqual(settings.after.resolved);
  expect(settings.missing).toBeNull();
  expect(settings.written).toMatchObject({ key: SURFACE_GLOBAL_KEY, value: { enabled: true, labels: ["native surface"] } });
  expect(settings.replaced).toMatchObject({ key: SURFACE_GLOBAL_KEY, value: "replaced native surface" });
  expect(settings.replaced.updatedAt).toBeGreaterThan(settings.written.updatedAt);
  expect(settings.readback).toEqual(settings.replaced);
  const networkBeforeRefusals = wire.requests.length;
  await expect(other.settings.getAppSettings()).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(other.settings.getAppSettingsWithOverrides()).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(other.settings.updateAppSettings({ partial: { localMultiUser: true } })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(other.settings.getGlobalSetting({ key: SURFACE_GLOBAL_KEY })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(other.settings.setGlobalSetting({ key: SURFACE_GLOBAL_KEY, value: "foreign" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(other.settings.checkForUpdate()).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(wire.requests).toHaveLength(networkBeforeRefusals);
  expect(await owner.settings.getAppSettingsWithOverrides()).toEqual(settings.after);
  expect(await owner.settings.getGlobalSetting({ key: SURFACE_GLOBAL_KEY })).toEqual(settings.readback);

  const [first, second, third] = characters.cards;
  if (first === undefined || second === undefined || third === undefined) {
    throw new Error("native surface capture omitted an authored character");
  }
  expect(characters.empty).toEqual({ groups: [], uncategorized: 3 });
  expect(characters.added).toEqual({ applied: [first.id, second.id], failed: [] });
  expect(characters.repeated).toEqual({ applied: [], failed: [] });
  expect(characters.tagged.groups.map((group) => [group.name, group.characters])).toEqual([
    [SURFACE_TAG_ALPHA, 2],
    [SURFACE_TAG_BETA, 1],
  ]);
  expect(characters.tagged.uncategorized).toBe(1);
  expect(characters.capped.items).toHaveLength(1);
  expect(characters.capped.totalCount).toBe(3);
  expect(characters.filtered.groups.map((group) => [group.name, group.characters])).toEqual([[SURFACE_TAG_ALPHA, 1]]);
  expect(characters.filtered.uncategorized).toBe(0);
  expect(characters.filteredPage.items.map((card) => card.id)).toEqual([second.id]);
  expect(characters.filteredPage.totalCount).toBe(1);
  expect(characters.removed).toEqual({ applied: [first.id], failed: [] });
  expect(characters.removedAgain).toEqual({ applied: [], failed: [] });
  expect(await other.character.get({ characterId: characters.foreign.id })).toEqual(characters.foreign);
  expect(characters.generated).toEqual({ text: SURFACE_GREETING_REPLY, costUsd: null });
  expect(characters.rewritten).toEqual(characters.generated);
  expect(characters.afterGreeting).toEqual(characters.beforeGreeting);
  const completionsBeforeRefusal = provider.requests.filter((request) => request === "POST /v1/chat/completions");
  expect(completionsBeforeRefusal).toHaveLength(2);
  await expect(other.character.generateGreeting({ characterId: first.id, steer: SURFACE_GREETING_CUE, timeZone: UTC_TIME_ZONE })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  expect(provider.requests.filter((request) => request === "POST /v1/chat/completions")).toEqual(completionsBeforeRefusal);

  expect(settings.background).toMatchObject({
    assetId: assets.pages[1]?.[0]?.assetId,
    assetHash: assets.pages[1]?.[0]?.hash,
    name: "Orbital loom",
    mime: "image/png",
    provenanceUrl: SURFACE_BACKGROUND_URL,
  });
  expect(assets.pages.map((page) => page.map((asset) => asset.assetId))).toEqual([[assets.stored.assetId], [settings.background.assetId], []]);
  expect(assets.pages[0]?.[0]?.hash).toBe(assets.stored.hash);
  const [firstGallery, secondGallery] = assets.gallery;
  if (firstGallery === undefined || secondGallery === undefined) {
    throw new Error("native surface capture omitted a curated gallery item");
  }
  expect(firstGallery).toMatchObject({ assetId: settings.background.assetId, hash: settings.background.assetHash, subjectCharacterId: first.id });
  expect(secondGallery).toMatchObject({ assetId: assets.stored.assetId, hash: assets.stored.hash, subjectCharacterId: first.id });
  expect(assets.repeated).toEqual(firstGallery);
  expect(assets.oldest).toEqual([firstGallery]);
  expect(assets.newest).toEqual([secondGallery]);
  expect(assets.continued).toEqual([secondGallery]);
  expect(assets.exhausted).toEqual([]);
  expect(assets.candidates).toEqual([]);
  expect(assets.foreignOwned).toEqual([]);
  expect(assets.foreignGallery).toEqual([]);
  const beforeBadImage = await owner.assets.listOwned({ kind: "background", limit: 10 });
  await expect(owner.settings.addExternalBackground({ url: SURFACE_BAD_BACKGROUND_URL })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(await owner.assets.listOwned({ kind: "background", limit: 10 })).toEqual(beforeBadImage);
  await expect(other.assets.addToGallery({ assetId: settings.background.assetId, subjectCharacterId: characters.foreign.id })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(owner.assets.addToGallery({ assetId: settings.background.assetId, subjectCharacterId: characters.foreign.id })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  expect(await owner.assets.listGallery({ subjectCharacterId: first.id, limit: 10, sort: "oldest" })).toEqual(assets.gallery);
  await assertReferentialIntegrity(root.db);
});
