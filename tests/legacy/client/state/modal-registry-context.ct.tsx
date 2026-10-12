// modal-registry-context CT — `useModalRegistry` reads the registry delivered by its provider (the
// runtime context ModalHost consumes instead of a #features import). Mounts the probe and asserts the
// hook resolves the total, ordered vocabulary + `get(id)` returns a member's title.

import { expect, test } from "@playwright/experimental-ct-react";
import { ModalRegistryProbe } from "./_ct-stories.tsx";

test("useModalRegistry resolves the ordered modal list + get(id) inside the provider", async ({ mount }) => {
  const probe = await mount(<ModalRegistryProbe />);
  const out = probe.locator("output");
  // list() preserves MODAL_SLOT_IDS order; get("newChat") resolves the member's title.
  // No `settings` slot since #866 S1 (retired into the `config` SECTION) and no `account` since S4
  // (its facts live in the persona switcher's foot, owner-ruled F-3).
  await expect(out).toContainText("ids=command,newChat,you");
  await expect(out).toContainText("newChat=New chat");
});
