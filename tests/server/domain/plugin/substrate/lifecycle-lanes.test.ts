import type { PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createPluginLifecycleLanes } from "../../../../../packages/server/src/domain/plugin/substrate/lifecycle-lanes.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("serializes one plugin while allowing a different plugin to proceed", async () => {
  const lanes = createPluginLifecycleLanes();
  const firstId = castId<PluginId>("plugin_lifecycle_first");
  const secondId = castId<PluginId>("plugin_lifecycle_second");
  const entered: string[] = [];
  const { promise: releaseFirst, resolve } = Promise.withResolvers<void>();

  const first = lanes.run(firstId, async () => {
    entered.push("first:start");
    await releaseFirst;
    entered.push("first:end");
  });
  const queued = lanes.run(firstId, () => {
    entered.push("queued");
    return Promise.resolve();
  });
  const independent = lanes.run(secondId, () => {
    entered.push("independent");
    return Promise.resolve();
  });

  await independent;
  expect(entered).toEqual(["first:start", "independent"]);
  resolve();
  await Promise.all([first, queued]);
  expect(entered).toEqual(["first:start", "independent", "first:end", "queued"]);
});
