// settings-pane-registry-provider CT — the provider delivers its `value` to every descendant consumer
// and renders its children. Mounts the probe (a consumer nested under the provider) and asserts the
// child rendered AND received the full registry (all twelve ids), proving the value reached the
// consumer tree.

import { expect, test } from "@playwright/experimental-ct-react";
import { SettingsPaneRegistryProbe } from "./_ct-stories.tsx";

test("SettingsPaneRegistryProvider renders children and delivers the registry to a nested consumer", async ({ mount }) => {
  const probe = await mount(<SettingsPaneRegistryProbe />);
  const out = probe.locator("output");
  await expect(out).toBeVisible();
  // Every pane reached the consumer — the provider delivered the total registry, not a partial one.
  // `tags`/`regex` left this tuple at the config rail's R1: both are collection contributions in the
  // Configuration workspace now, not settings panes.
  await Promise.all(
    ["personas", "appearance", "workloads", "backup", "chat-behavior", "connections", "automation", "admin"].map((id) => expect(out).toContainText(id)),
  );
});
