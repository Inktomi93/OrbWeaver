// section-registry-context CT — `useSectionRegistry` reads the registry delivered by its provider (the
// runtime context the shell consumes instead of a #features import). Mounts the probe and asserts the
// hook resolves the total, ordered vocabulary + `get(id)` returns a member.

import { expect, test } from "@playwright/experimental-ct-react";
import { SectionRegistryProbe } from "./_ct-stories";

test("useSectionRegistry resolves the ordered section list + get(id) inside the provider", async ({ mount }) => {
  const probe = await mount(<SectionRegistryProbe />);
  const out = probe.locator("output");
  // list() preserves SECTION_IDS order; get("chats") resolves the member's rail label.
  await expect(out).toContainText("ids=home,chats,characters,corpus,worldInfo,presets,refinery,analytics");
  await expect(out).toContainText("chats=Chats");
});
