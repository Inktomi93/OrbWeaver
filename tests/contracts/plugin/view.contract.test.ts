import {
  distributedPluginViewSchema,
  PLUGIN_FANOUT_SKIP_REASONS,
  PLUGIN_LOG_LEVELS,
  pluginBundleAssetViewSchema,
  pluginDisplayTransformViewSchema,
  pluginFanoutResultSchema,
  pluginLogViewSchema,
  pluginSurfaceStateSchema,
  pluginSurfaceViewSchema,
} from "@orb/contracts/plugin";
import type { UserId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { makePluginScriptedPage } from "@orb/testkit/node/factories/plugin-view.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("public plugin registration parsers retain native metadata refinements and refuse private handler or row fields", ({ ids }) => {
  const pluginId = typeIdSchema(ID_PREFIX.plugin).parse(ids.next(ID_PREFIX.plugin));
  const page = makePluginScriptedPage(pluginId);
  expect(pluginSurfaceViewSchema.parse(JSON.parse(JSON.stringify(page)))).toEqual(page);
  expect(pluginSurfaceViewSchema.safeParse({ ...page, onAction: "private-handler" }).success).toBe(false);
  expect(pluginSurfaceViewSchema.safeParse({ ...page, anchor: "message-footer" }).success).toBe(false);
  const asset = { path: "ui/assets/ledger.png", assetId: ids.next(ID_PREFIX.asset) };
  expect(pluginBundleAssetViewSchema.parse(asset)).toEqual(asset);
  expect(pluginBundleAssetViewSchema.safeParse({ ...asset, ownerId: "private-owner" }).success).toBe(false);
  expect(pluginBundleAssetViewSchema.safeParse({ ...asset, assetId: null }).success).toBe(false);
  const transform = { pluginId, name: "annotate" };
  expect(pluginDisplayTransformViewSchema.parse(transform)).toEqual(transform);
  expect(pluginDisplayTransformViewSchema.safeParse({ ...transform, apply: "private-handler" }).success).toBe(false);
  const state = { entry: "Published ledger", nested: { count: 2, enabled: true }, rows: ["one", null] };
  expect(pluginSurfaceStateSchema.parse(JSON.parse(JSON.stringify(state)))).toEqual(state);
  expect(pluginSurfaceStateSchema.safeParse([state]).success).toBe(false);
});

test("public log and distribution outputs preserve their closed vocabularies without admitting private install state", ({ ids, clock }) => {
  for (const level of PLUGIN_LOG_LEVELS) {
    const line = { level, message: "Native ledger", at: clock.now() };
    expect(pluginLogViewSchema.parse(line)).toEqual(line);
    expect(pluginLogViewSchema.safeParse({ ...line, level: "trace" }).success).toBe(false);
  }
  const published = { slug: "ledger", name: "Ledger", version: "1.0.0", distributedAt: clock.now(), updatedAt: clock.now() };
  expect(distributedPluginViewSchema.parse(published)).toEqual(published);
  expect(distributedPluginViewSchema.safeParse({ ...published, grantedCapabilities: [] }).success).toBe(false);
  const userId = brandedId<UserId>().parse(ids.uuid());
  for (const reason of PLUGIN_FANOUT_SKIP_REASONS) {
    const result = {
      slug: published.slug,
      name: published.name,
      version: published.version,
      applied: 0,
      skipped: [{ userId, userHandle: "recipient", reason }],
    };
    expect(pluginFanoutResultSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(result);
    expect(pluginFanoutResultSchema.safeParse({ ...result, skipped: [{ ...result.skipped[0], reason: "force-enabled" }] }).success).toBe(false);
    expect(pluginFanoutResultSchema.safeParse({ ...result, applied: -1 }).success).toBe(false);
  }
});
