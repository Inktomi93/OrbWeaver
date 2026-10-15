// @subject tests/support/node/corpus-plugin-outputs.ts
// @subject tests/support/node/factories/plugin.ts
import "@orb/testkit/node/composed-real.ts";
import { spawn } from "node:child_process";
import { PLUGIN_LOG_LEVELS, pluginCommandViewSchema, pluginUiOutcomeSchema, pluginViewSchema, snippetResultSchema } from "@orb/contracts/plugin";
import { pluginKv } from "@orb/db";
import {
  pluginBundleAssetViewSchema,
  pluginDisplayTransformResultSchema,
  pluginDisplayTransformViewSchema,
  pluginLogViewSchema,
  pluginSurfaceStateSchema,
  pluginSurfaceViewSchema,
  pluginUiHostCallResultSchema,
} from "@orb/server/domain/plugin";
import { LOG_BYTES_PER_INVOCATION, LOG_LINES_PER_INVOCATION, PLUGIN_LOG_RING_CHARS, PLUGIN_LOG_RING_LINES } from "@orb/server/infra/plugin-host";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import {
  CORPUS_PLUGIN_CALLBACK_VALUE,
  CORPUS_PLUGIN_TYPED_VALUES,
  createCorpusPluginCallbackNetwork,
  seedCorpusPluginCallbackLifecycle,
  seedCorpusPluginLogRing,
  seedCorpusPluginOutputs,
} from "./corpus-plugin-outputs.ts";
import { makePluginRow } from "./factories/plugin-view.ts";

test("native callbacks refuse invalid args and stale scopes, revoke grants and retire an in-flight draft before restart", { tags: ["slow"] }, async () => {
  const network = createCorpusPluginCallbackNetwork();
  await using root = await createServerHarness({ pluginSpawn: spawn, networkExecution: network.networkExecution });
  const captured = await seedCorpusPluginCallbackLifecycle(root, network);
  expect(captured.retained.state).toEqual({ calls: 1, retained: true, variables: {} });
  expect(captured.stale.state).toMatchObject({ calls: 2, staleError: "Error", staleMessage: expect.stringContaining("invalid chat handle"), variables: {} });
  expect(captured.beforeRefusals.state).toEqual({ calls: 3, values: CORPUS_PLUGIN_TYPED_VALUES });
  expect(captured.invalid).toHaveLength(10);
  for (const refusal of captured.invalid) {
    expect(refusal).toMatchObject({ status: "rejected", reason: expect.any(Error) });
  }
  expect(captured.invalid.slice(-2)).toEqual([
    expect.objectContaining({ status: "rejected", reason: expect.objectContaining({ code: "NOT_FOUND" }) }),
    expect.objectContaining({ status: "rejected", reason: expect.objectContaining({ code: "NOT_FOUND" }) }),
  ]);
  expect(captured.afterRefusals).toEqual(captured.beforeRefusals);
  expect(captured.failedAction).toEqual([
    expect.objectContaining({
      status: "rejected",
      reason: expect.objectContaining({ code: "BAD_REQUEST", message: expect.stringContaining("Native callback refusal") }),
    }),
  ]);
  expect(captured.afterFailureRows.plugin.consecutiveCrashes).toBe(1);
  expect(captured.clean).toEqual({ toasts: [] });
  expect(captured.afterCleanRows.plugin.consecutiveCrashes).toBe(0);
  expect(captured.storage.state).toMatchObject({ stored: CORPUS_PLUGIN_CALLBACK_VALUE });
  expect(captured.narrowed.outcome).toMatchObject({ status: "enabled", reconsentPending: true });
  expect(captured.narrowed.outcome.grantedCapabilities).not.toContain("storage.kv");
  expect(captured.revokedStorage.state).toEqual({ calls: 1, storageError: "PluginCapabilityError" });
  expect(captured.retiredDraft).toEqual([expect.objectContaining({ status: "rejected" })]);
  expect(captured.disabled.state).toBeNull();
  expect(captured.disabled.surfaces).toEqual([]);
  expect(captured.disabled.commands).toEqual([]);
  for (const refusal of captured.unavailable) {
    expect(refusal).toMatchObject({ status: "rejected" });
  }
  expect(captured.restarted.state).toEqual({ calls: 0 });
  expect(captured.restarted.commands.map(({ name }) => name)).toEqual(["typed", "stale", "storage", "draft"]);
  for (const refusal of captured.uninstalled) {
    expect(refusal).toMatchObject({ status: "rejected", reason: { code: "NOT_FOUND" } });
  }
});

test("native log severity, staging clamps and both resident ring bounds survive reads and reset only with residency", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const captured = await seedCorpusPluginLogRing(root);
  expect(captured.initial).toEqual(PLUGIN_LOG_LEVELS.map((level) => ({ level, message: `Native ${level}`, at: root.clock.frozenAt })));
  const retainedBatches = PLUGIN_LOG_RING_LINES / LOG_LINES_PER_INVOCATION;
  const expected = Array.from({ length: PLUGIN_LOG_RING_LINES }, (_, index) => {
    const batch = captured.lineBatches - retainedBatches + Math.floor(index / LOG_LINES_PER_INVOCATION);
    const line = index % LOG_LINES_PER_INVOCATION;
    return { level: PLUGIN_LOG_LEVELS[line % PLUGIN_LOG_LEVELS.length], message: `batch:${batch}:${line}`, at: root.clock.frozenAt + batch + 1 };
  });
  expect(captured.lines).toEqual(expected);
  expect(captured.limited).toEqual(expected.slice(-5));
  const clampedLength = LOG_BYTES_PER_INVOCATION - "[warn] ".length;
  const retainedChars = Math.floor(PLUGIN_LOG_RING_CHARS / clampedLength);
  expect(captured.chars).toEqual(
    Array.from({ length: retainedChars }, (_, index) => {
      const batch = captured.charBatches - retainedChars + index;
      return { level: "warn", message: `${batch}:`.padEnd(clampedLength, "x"), at: root.clock.frozenAt + captured.lineBatches + batch + 1 };
    }),
  );
  expect(captured.chars.reduce((count, line) => count + line.message.length, 0)).toBeLessThanOrEqual(PLUGIN_LOG_RING_CHARS);
  expect(captured.repeated).toEqual(captured.chars);
  expect(captured.foreignRead).toEqual([expect.objectContaining({ status: "rejected", reason: expect.objectContaining({ code: "NOT_FOUND" }) })]);
  expect(captured.disabled).toEqual([]);
  expect(captured.restarted).toEqual(PLUGIN_LOG_LEVELS.map((level) => ({ level, message: `Native ${level}`, at: root.clock.now() })));
});

test("native guest publications preserve callback inputs, private storage, draft mode and disable cleanup", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const captured = await seedCorpusPluginOutputs(root);
  const pluginId = captured.installed.outcome.id;
  expect(captured.pending.plugins).toEqual([captured.installed.outcome]);
  expect(captured.pending.surfaces).toEqual([]);
  expect(captured.pending.state).toBeNull();
  expect(captured.granted.outcome.status).toBe("enabled");
  expect(makePluginRow(captured.granted.outcome)).toEqual(captured.granted.outcome);
  expect(captured.active.surfaces.map(({ id, anchor }) => [id, anchor])).toEqual([
    ["ledger", "page"],
    ["detail", "dialog"],
  ]);
  expect(captured.active.commands.map(({ name, args, composerDraft }) => [name, args, composerDraft])).toEqual([
    ["record", [{ name: "entry", type: "string", required: true }], undefined],
    ["revise", [], true],
  ]);
  expect(captured.active.displayTransforms).toEqual([{ pluginId, name: "annotate" }]);
  expect(captured.active.assets).toEqual(captured.installed.assets.map(({ bundlePath, assetId }) => ({ path: bundlePath, assetId })));
  expect(captured.active.log).toEqual([{ level: "info", message: "ledger activated", at: root.clock.now() }]);
  expect(captured.active.state).toEqual({ entry: "Initial ledger entry" });
  expect(captured.action).toEqual({ toasts: [{ level: "success", message: "Output ledger: Entry recorded" }], openDialog: "detail" });
  expect(captured.roomState).toEqual({ actionId: "record", values: { entry: "Room entry" }, inRoom: true });
  expect(captured.command).toEqual({ toasts: [] });
  expect(captured.commandState).toEqual({ args: "entry=Native", values: { entry: "Native" } });
  expect(captured.draft).toEqual({ toasts: [], composerDraft: "Native draft revised" });
  expect(captured.draftState).toEqual({ args: "", values: {}, draft: "Native draft" });
  expect(captured.hostResult).toEqual({ resultJson: JSON.stringify("private ledger value") });
  expect(captured.display).toEqual({ text: "Native row [ledger]" });
  expect(captured.skippedDisplay).toEqual({ text: "skip failed transform" });
  expect(captured.snippet.error).toBeUndefined();
  expect(captured.snippet.logLines).toEqual([expect.stringContaining("Native snippet")]);
  expect(captured.parseFailure).toMatchObject({ errorKind: "parse", error: expect.any(String) });
  expect(captured.runtimeFailure).toMatchObject({ errorKind: "runtime", error: expect.stringContaining("Native runtime refusal") });
  expect(captured.disabled.plugins[0]?.status).toBe("disabled");
  expect(captured.disabled.surfaces).toEqual([]);
  expect(captured.disabled.commands).toEqual([]);
  expect(captured.disabled.displayTransforms).toEqual([]);
  expect(captured.disabled.log).toEqual([]);
  expect(captured.disabled.state).toBeNull();
  expect(captured.disabled.assets).toEqual(captured.active.assets);

  for (const view of captured.active.plugins) {
    expect(pluginViewSchema.parse(JSON.parse(JSON.stringify(view)))).toEqual(view);
  }
  for (const view of captured.active.surfaces) {
    expect(pluginSurfaceViewSchema.parse(JSON.parse(JSON.stringify(view)))).toEqual(view);
  }
  for (const view of captured.active.commands) {
    expect(pluginCommandViewSchema.parse(JSON.parse(JSON.stringify(view)))).toEqual(view);
  }
  for (const view of captured.active.displayTransforms) {
    expect(pluginDisplayTransformViewSchema.parse(JSON.parse(JSON.stringify(view)))).toEqual(view);
  }
  for (const view of captured.active.assets) {
    expect(pluginBundleAssetViewSchema.parse(JSON.parse(JSON.stringify(view)))).toEqual(view);
  }
  for (const view of captured.active.log) {
    expect(pluginLogViewSchema.parse(JSON.parse(JSON.stringify(view)))).toEqual(view);
  }
  expect(pluginSurfaceStateSchema.parse(captured.roomState)).toEqual(captured.roomState);
  expect(pluginUiOutcomeSchema.parse(captured.action)).toEqual(captured.action);
  expect(pluginUiHostCallResultSchema.parse(captured.hostResult)).toEqual(captured.hostResult);
  expect(pluginDisplayTransformResultSchema.parse(captured.display)).toEqual(captured.display);
  for (const value of [captured.snippet, captured.parseFailure, captured.runtimeFailure]) {
    expect(snippetResultSchema.parse(value)).toEqual(value);
  }

  const stranger = await root.actor();
  const foreign = await root.internalCallerFor(stranger.id);
  await root.services.plugin.setEnabled({ caller: captured.caller, pluginId, enabled: true });
  const owner = await root.internalCallerFor(root.ownerId);
  expect(await owner.plugin.uiHostCall({ pluginId, fn: "storage.get", argsJson: '["entry"]' })).toEqual(captured.hostResult);
  const before = await root.db.select().from(pluginKv);
  await expect(foreign.plugin.getSurfaceState({ pluginId, surfaceId: "ledger" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(foreign.plugin.uiHostCall({ pluginId, fn: "storage.get", argsJson: '["entry"]' })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(foreign.plugin.invokeUiCommand({ pluginId, name: "record", args: "", values: { entry: "Foreign" }, chatId: null })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  expect(await root.db.select().from(pluginKv)).toEqual(before);
});

test("the browser-safe plugin default refuses non-finite override timestamps at the canonical contract", () => {
  expect(makePluginRow({ status: "disabled", grantedCapabilities: [] }).status).toBe("disabled");
  expect(() => makePluginRow({ installedAt: Number.NaN })).toThrow();
});
