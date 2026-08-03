// preset-editor-view store CT — the preset editor's VIEW axis (preset-surface-redesign.md §7 mechanics,
// §16 row 10). A CT rather than a unit test because the store's only read surface is the reactive
// `usePresetEditorView` hook (useSyncExternalStore needs a real browser render — the
// preset-selection-store.ct.tsx posture; no non-reactive snapshot escape hatch exists and adding one would
// be API surface no consumer needs).
//
// The two invariants that are the POINT of moving the view out of local `Tabs` state:
//  • UNSET reads as `null` — the vocabulary (and therefore the default view) lives with the feature's
//    `PRESET_EDITOR_VIEWS` tuple, never as a re-spelled literal in the state tier;
//  • the setter is the ONE writer and each write is observable — CONTEXT projects this read per-view, so a
//    silently-stuck value would strand the eye on the wrong hand.

import { expect, test } from "@playwright/experimental-ct-react";
import { PresetEditorViewProbe } from "./_ct-stories.tsx";

test("unset reads as null; the writer moves it, and every write is observable", async ({ mount }) => {
  const probe = await mount(<PresetEditorViewProbe />);
  const state = probe.locator("output");

  // Fresh page → nothing picked this session (the tab strip resolves this to the tuple's first view).
  await expect(state).toHaveText("view=unset");

  await probe.getByRole("button", { name: "set actions view" }).click();
  await expect(state).toHaveText("view=actions");

  await probe.getByRole("button", { name: "set params view" }).click();
  await expect(state).toHaveText("view=params");
});
