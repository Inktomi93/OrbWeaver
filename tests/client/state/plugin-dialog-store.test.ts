// The plugin-DIALOG intent store — the payload channel for the ONE
// `pluginDialog` modal slot. Exercised through the non-hook `__readPluginDialogSubjectForTest` snapshot (the
// reactive reader needs a React render — the `imagery-store.test.ts` posture).
//
// WHAT MATTERS HERE: the store carries the PAIR and nothing else. A subject that carried a spec would let a
// dialog paint a tree the client snapshotted before the plugin was disabled; carrying only `(pluginId,
// surfaceId)` is what forces the body to resolve off the live cache and show the honest "gone" arm instead.
// The other pin is that a re-open REPLACES — an outcome that opens a second dialog must never render the first.

import { __readPluginDialogSubjectForTest, __resetPluginDialog, clearPluginDialog, openPluginDialog } from "@orb/client/state";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

// TypeIDs are MINTED, never hand-written literals (the branded suffix is validated at runtime).
const PLUGIN_ID = mintTypeId(ID_PREFIX.plugin);
const OTHER_PLUGIN_ID = mintTypeId(ID_PREFIX.plugin);

describe("plugin dialog intent store", () => {
  beforeEach(() => {
    __resetPluginDialog(); // reset the module singleton between tests.
  });

  test("the slot starts empty — nothing to render before a round-trip outcome opens one", () => {
    expect(__readPluginDialogSubjectForTest()).toBeUndefined();
  });

  test("openPluginDialog carries the (plugin, surface) PAIR verbatim, and nothing else", () => {
    openPluginDialog({ pluginId: PLUGIN_ID, surfaceId: "reveal_dialog" });
    // Exactly two fields: a spec carried here would be a client-side snapshot the body could paint after the
    // plugin was gone. The body resolves the surface off the live `listSurfaces` cache instead.
    expect(__readPluginDialogSubjectForTest()).toEqual({ pluginId: PLUGIN_ID, surfaceId: "reveal_dialog" });
  });

  test("a second open REPLACES the first (last write wins — two modals at once is not a state the shell has)", () => {
    openPluginDialog({ pluginId: PLUGIN_ID, surfaceId: "first" });
    openPluginDialog({ pluginId: OTHER_PLUGIN_ID, surfaceId: "second" });
    expect(__readPluginDialogSubjectForTest()).toEqual({ pluginId: OTHER_PLUGIN_ID, surfaceId: "second" });
  });

  test("clearPluginDialog frees the slot — a re-open never inherits the closed dialog's subject", () => {
    openPluginDialog({ pluginId: PLUGIN_ID, surfaceId: "reveal_dialog" });
    clearPluginDialog();
    expect(__readPluginDialogSubjectForTest()).toBeUndefined();
  });
});
