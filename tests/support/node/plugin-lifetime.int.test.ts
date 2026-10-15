import "@orb/testkit/node/composed-real.ts";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import process from "node:process";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { spawnNicedTranscript } from "@orb/tooling/floor/process/proc";
import { inheritedProcessEnv } from "@orb/tooling/floor/process/process-env";
import { vi } from "vitest";

const SOURCE = "const h = orb.host(1); h.log.info(JSON.stringify({ at: h.clock.nowEpochMs(), random: h.random.next(), id: h.ids.mint() }));";
const CHILD_TIMEOUT_MS = 30_000;

test("standalone native teardown joins a resident guest after the last outer listener closes", async () => {
  const result = await spawnNicedTranscript(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import { spawn } from "node:child_process";
    import { createServerHarness } from "@orb/testkit/node/server.ts";
    import { makePluginBundle } from "@orb/testkit/node/factories/plugin.ts";
    import { pluginManifestSchema, PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY } from "@orb/contracts/plugin";
    const root = await createServerHarness({ pluginSpawn: spawn });
    await root.listen();
    const manifest = pluginManifestSchema.parse({ id: "standalone-lifecycle", name: "Standalone lifecycle", description: "Native teardown lifecycle control", version: "1.0.0", hostVersion: PLUGIN_HOST_VERSIONS[0], entry: PLUGIN_MAIN_ENTRY, capabilities: [] });
    const caller = await root.principalFor(root.ownerId);
    const installed = await root.services.plugin.install({
      caller,
      bundle: makePluginBundle(manifest, "orb.host(1);", root.clock.now()),
      grant: [],
    });
    await root.services.plugin.setGrant({
      caller, pluginId: installed.id, grant: manifest.capabilities, acknowledgedNetHosts: [], enable: true,
    });
    if (!(await root.services.plugin.list({ caller })).some((plugin) => plugin.id === installed.id && plugin.status === "enabled")) {
      throw new Error("native guest never became enabled");
    }
    await root[Symbol.asyncDispose]();
    process.stdout.write("native graph disposal joined\\n");
  `,
    ],
    {
      cwd: process.cwd(),
      env: inheritedProcessEnv(),
      timeoutMs: CHILD_TIMEOUT_MS,
    },
  );
  expect(result.code, result.transcript).toBe(0);
  expect(result.transcript).toContain("native graph disposal joined");
});

test("the real snippet gates ownership before a refused raw spawn and releases admission for the next attempt", async () => {
  const execute = vi.fn((): never => {
    throw new Error("controlled plugin spawn refusal");
  });
  await using harness = await createServerHarness({ pluginSpawn: execute });
  const owner = await harness.internalCallerFor(harness.ownerId);
  const room = (await owner.chat.startChat({ characterIds: [] })).chat;
  const stranger = await harness.actor();
  const foreignCaller = await harness.internalCallerFor(stranger.id);
  await expect(foreignCaller.plugin.runSnippet({ chatId: room.id, code: SOURCE })).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(execute).not.toHaveBeenCalled();
  await expect(owner.plugin.runSnippet({ chatId: room.id, code: SOURCE })).rejects.toThrow("controlled plugin spawn refusal");
  await expect(owner.plugin.runSnippet({ chatId: room.id, code: SOURCE })).rejects.toThrow("controlled plugin spawn refusal");
  expect(execute).toHaveBeenCalledTimes(2);
});

test("identical-ID roots own independent real watchdogs and guest entropy; closing one joins its child without stopping the other", async () => {
  const execute = vi.fn(spawn);
  await using first = await createServerHarness({ pluginSpawn: execute });
  await using second = await createServerHarness({ pluginSpawn: execute });
  const firstCaller = await first.internalCallerFor(first.ownerId);
  const secondCaller = await second.internalCallerFor(second.ownerId);
  const firstRoom = (await firstCaller.chat.startChat({ characterIds: [] })).chat;
  const secondRoom = (await secondCaller.chat.startChat({ characterIds: [] })).chat;
  expect(first.ownerId).toBe(second.ownerId);
  expect(firstRoom.id).toBe(secondRoom.id);
  const firstRun = await firstCaller.plugin.runSnippet({ chatId: firstRoom.id, code: SOURCE });
  const secondRun = await secondCaller.plugin.runSnippet({ chatId: secondRoom.id, code: SOURCE });
  expect(firstRun.error).toBeUndefined();
  expect(secondRun).toEqual(firstRun);
  expect(firstRun.logLines).toHaveLength(1);
  expect(firstRun.logLines[0]).toContain(`"at":${first.clock.now()},"random":0.5,"id":`);
  expect(execute).toHaveBeenCalledTimes(2);
  const [firstChildResult, secondChildResult] = execute.mock.results;
  if (firstChildResult?.type !== "return" || secondChildResult?.type !== "return") {
    throw new Error("the real scoped hosts did not return their owned child processes");
  }
  const firstChild = firstChildResult.value;
  const secondChild = secondChildResult.value;
  const firstClosed = new Promise<void>((resolve) => firstChild.once("close", () => resolve()));
  const secondClosed = new Promise<void>((resolve) => secondChild.once("close", () => resolve()));
  await first[Symbol.asyncDispose]();
  await firstClosed;
  expect(firstChild.exitCode).toBe(0);
  expect(secondChild.signalCode).toBeNull();
  expect(secondChild.exitCode).toBeNull();
  await expect(access(first.modelCacheDir)).rejects.toMatchObject({ code: "ENOENT" });
  const stillLive = await secondCaller.plugin.runSnippet({ chatId: secondRoom.id, code: SOURCE });
  expect(stillLive.error).toBeUndefined();
  expect(stillLive.logLines).toHaveLength(1);
  expect(execute).toHaveBeenCalledTimes(2);
  await second[Symbol.asyncDispose]();
  await secondClosed;
  expect(secondChild.exitCode).toBe(0);
});
