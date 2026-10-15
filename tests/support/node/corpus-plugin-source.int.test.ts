// @subject tests/support/node/corpus-plugin-source.ts
import "@orb/testkit/node/composed-real.ts";
import { pluginManifestSchema } from "@orb/contracts/plugin";
import { pluginGitPreviewSchema, pluginUpdateCheckSchema, pluginUrlPreviewSchema } from "@orb/server/domain/plugin";
import { readShowcaseManifest, SHOWCASE_PLUGIN_SLUGS } from "@orb/showcase-plugins";
import { makePluginBundle } from "@orb/testkit/node/factories/plugin.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { strToU8 } from "fflate";
import { CORPUS_PLUGIN_GIT_URL, createCorpusPluginGit } from "./corpus-plugin-git.ts";
import { CORPUS_PLUGIN_SOURCE_URL, createCorpusPluginDownloads, seedCorpusPluginSource } from "./corpus-plugin-source.ts";

test("native URL output suppliers bind consent to bytes and preserve leak-free update failures", async () => {
  const downloads = createCorpusPluginDownloads();
  await using root = await createServerHarness({ networkExecution: downloads.networkExecution });
  const result = await seedCorpusPluginSource(root, downloads);
  const pluginId = result.installed.id;
  expect(result.installed).toMatchObject({ sourceUrl: CORPUS_PLUGIN_SOURCE_URL, origin: "url", status: "disabled", grantedCapabilities: [] });
  expect(result.current).toEqual([{ pluginId, status: "up-to-date" }]);
  expect(result.offered).toEqual([{ pluginId, status: "update-available", source: "url", newVersion: "2.0.0", bundleHash: result.changedPreview.bundleHash }]);
  expect(result.preview.bundleHash).not.toBe(result.changedPreview.bundleHash);
  expect(result.unavailable).toEqual([{ pluginId, status: "unreachable" }]);
  expect(result.malformed).toEqual(result.unavailable);
  for (const value of [result.preview, result.changedPreview]) {
    expect(pluginUrlPreviewSchema.parse(JSON.parse(JSON.stringify(value)))).toEqual(value);
  }
  for (const checks of [result.current, result.offered, result.unavailable, result.malformed]) {
    for (const value of checks) {
      expect(pluginUpdateCheckSchema.parse(JSON.parse(JSON.stringify(value)))).toEqual(value);
    }
  }
  const stranger = await root.actor();
  const foreign = await root.internalCallerFor(stranger.id);
  expect(await foreign.plugin.checkForUpdates()).toEqual([]);
  expect(downloads.remaining()).toBe(0);
  expect(downloads.requested).toEqual(Array.from({ length: 7 }, () => CORPUS_PLUGIN_SOURCE_URL));
});

test("native Git previews and HEAD changes retain exact revision consent through smart HTTP", { tags: ["slow"] }, async ({ importStagingDir, clock }) => {
  const remote = await createCorpusPluginGit(importStagingDir, clock.now());
  await using root = await createServerHarness({ networkExecution: remote.networkExecution });
  const rpc = await root.internalCallerFor(root.ownerId);
  const preview = await rpc.plugin.previewFromGit({ url: CORPUS_PLUGIN_GIT_URL });
  expect(pluginGitPreviewSchema.parse(JSON.parse(JSON.stringify(preview)))).toEqual(preview);
  const installed = await rpc.plugin.installFromGit({ url: CORPUS_PLUGIN_GIT_URL, expectedCommit: preview.sourceCommit, grant: [] });
  expect(installed).toMatchObject({ sourceCommit: preview.sourceCommit, sourceUrl: CORPUS_PLUGIN_GIT_URL, origin: "git", status: "disabled" });
  expect(await rpc.plugin.checkForUpdates()).toEqual([{ pluginId: installed.id, status: "up-to-date" }]);
  const changed = await remote.advance();
  const checks = await rpc.plugin.checkForUpdates();
  expect(checks).toEqual([{ pluginId: installed.id, status: "source-changed", sourceCommit: changed }]);
  for (const check of checks) {
    expect(pluginUpdateCheckSchema.parse(JSON.parse(JSON.stringify(check)))).toEqual(check);
  }
  const before = await rpc.plugin.list();
  await expect(rpc.plugin.upgradeFromStoredGit({ pluginId: installed.id, expectedCommit: preview.sourceCommit })).rejects.toMatchObject({ code: "CONFLICT" });
  expect(await rpc.plugin.list()).toEqual(before);
  expect(remote.requests).toContain("POST /ledger.git/git-upload-pack");
});

test("the showcase update variant derives its version from the native shipped bundle, never the uploaded source", async () => {
  const shipped = await readShowcaseManifest(SHOWCASE_PLUGIN_SLUGS[0]);
  if (shipped === null) {
    throw new Error("the released showcase bundle is required for native update qualification");
  }
  await using root = await createServerHarness();
  const caller = await root.principalFor(root.ownerId);
  const rpc = await root.internalCallerFor(root.ownerId);
  const older = pluginManifestSchema.parse({ ...shipped, version: "0.0.0" });
  const installed = await root.services.plugin.install({
    caller,
    bundle: makePluginBundle(older, "orb.host(1);", root.clock.now(), older.uiEntry === undefined ? {} : { [older.uiEntry]: strToU8("orb.ui(1);") }),
    grant: [],
  });
  const checks = await rpc.plugin.checkForUpdates();
  expect(checks).toEqual([{ pluginId: installed.id, status: "update-available", source: "showcase", newVersion: shipped.version }]);
  for (const check of checks) {
    expect(pluginUpdateCheckSchema.parse(JSON.parse(JSON.stringify(check)))).toEqual(check);
  }
});
