// CT: the settings-SECTION registry context (SET-SEAMS §5.2) — ONE door-assembled registry for every
// anchor, delivered through the `createRegistryContext` mint and read by the settings host (nav + search)
// and by each host pane's surface (render). `useSettingsSections(anchor, viewer)` is the render half: the
// anchor's contributions, in declared order, `when`-filtered by the viewer projection.

import { expect, test } from "@playwright/experimental-ct-react";
import { SettingsSectionRegistryProbe } from "./_ct-stories.tsx";

test("useSettingsSections resolves only the anchor's contributions, in declared registry order", async ({ mount }) => {
  const probe = await mount(<SettingsSectionRegistryProbe isAdmin={true} />);
  const out = probe.locator("output").first();

  // The whole registry spans anchors; the pane gets ONLY its own, never a sibling pane's section.
  await expect(out).toContainText("all=probe-chat,probe-admin,probe-other");
  await expect(out).toContainText("chat-behavior=probe-chat,probe-admin");
  await expect(probe.getByText("other body")).toHaveCount(0);
});

test("a `when`-gated section is absent from the RENDER for a viewer it excludes", async ({ mount }) => {
  const probe = await mount(<SettingsSectionRegistryProbe isAdmin={false} />);
  const out = probe.locator("output").first();

  await expect(out).toContainText("chat-behavior=probe-chat");
  await expect(probe.getByText("admin body")).toHaveCount(0);
  await expect(probe.getByText("chat body")).toBeVisible();
});
