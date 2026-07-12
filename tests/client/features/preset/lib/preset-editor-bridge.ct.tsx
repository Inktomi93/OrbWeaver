// CT: THE FORM BRIDGE's useSyncExternalStore subscription (features/preset/lib/preset-editor-bridge). The
// browser half of the bridge's test coverage (the node sibling pins lifecycle + guards headlessly). A CT
// because `useAssemblyForm` is a useSyncExternalStore hook — its subscription notification needs a real
// render, and the whole point is that a SIBLING (not a descendant) re-renders when the module handle
// publishes/clears (BUILD-SPEC §2.3).

import { expect, test } from "@playwright/experimental-ct-react";
import { BridgeStory } from "./_ct-stories";

test("a sibling subscriber re-renders when the bridge publishes then clears", async ({ mount }) => {
  const probe = await mount(<BridgeStory />);
  const state = probe.locator("output");

  // Nothing published yet — the subscriber sees a null handle.
  await expect(state).toHaveText("handle=none");

  // Publishing from the sibling publisher fires the subscription across the tree.
  await probe.getByRole("button", { name: "publish form" }).click();
  await expect(state).toHaveText("handle=preset_bridgestoryaa");

  // Clearing tears it back to null — the inspector would fall to its EmptyState.
  await probe.getByRole("button", { name: "clear form" }).click();
  await expect(state).toHaveText("handle=none");
});
