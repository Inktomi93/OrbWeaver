import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { PluginSettingsNavigationProbe } from "./_ct-stories.tsx";

test("plugin settings navigation targets the named installed plugin and replaces a prior landing", async ({ mount }) => {
  const first = mintTypeId(ID_PREFIX.plugin);
  const second = mintTypeId(ID_PREFIX.plugin);
  const probe = await mount(<PluginSettingsNavigationProbe first={first} second={second} />);
  await probe.getByRole("button", { name: "open first plugin" }).click();
  await expect(probe.locator("output")).toHaveText(`config:plugins:installed:${first}`);
  await probe.getByRole("button", { name: "open second plugin" }).click();
  await expect(probe.locator("output")).toHaveText(`config:plugins:installed:${second}`);
});
