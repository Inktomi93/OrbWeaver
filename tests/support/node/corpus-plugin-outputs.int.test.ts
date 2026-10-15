// @subject tests/support/node/corpus-plugin-outputs.ts
// @subject tests/support/node/factories/plugin.ts
import "@orb/testkit/node/composed-real.ts";
import { spawn } from "node:child_process";
import { pluginCommandViewSchema, pluginUiOutcomeSchema, pluginViewSchema, snippetResultSchema } from "@orb/contracts/plugin";
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
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { seedCorpusPluginOutputs } from "./corpus-plugin-outputs.ts";
import { makePluginRow } from "./factories/plugin-view.ts";

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
