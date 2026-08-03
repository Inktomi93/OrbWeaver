// modal-registry-context CT — `useModalRegistry` reads the registry delivered by its provider (the
// runtime context ModalHost consumes instead of a #features import). Mounts the probe and asserts the
// hook resolves the total, ordered vocabulary + `get(id)` returns a member's title.

import { expect, test } from "@playwright/experimental-ct-react";
import { ModalRegistryProbe } from "./_ct-stories.tsx";

test("useModalRegistry resolves the ordered modal list + get(id) inside the provider", async ({ mount }) => {
  const probe = await mount(<ModalRegistryProbe />);
  const out = probe.locator("output");
  // list() preserves MODAL_SLOT_IDS order; get("theme") resolves the member's title.
  await expect(out).toContainText("ids=theme,settings,account,command,newChat,you");
  await expect(out).toContainText("theme=Theme");
});
