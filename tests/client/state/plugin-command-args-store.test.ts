// The plugin-COMMAND-ARGS intent store (#791) — the payload channel for the ONE `pluginCommandArgs` modal slot.
// Exercised through the non-hook `__readPluginCommandArgsSubjectForTest` snapshot (the reactive reader needs a
// React render — the `plugin-dialog-store.test.ts` posture). The pins: the store carries the command + its
// declared specs as the subject, a re-open REPLACES, and clear frees the slot.

import { __readPluginCommandArgsSubjectForTest, __resetPluginCommandArgs, clearPluginCommandArgs, openPluginCommandArgs } from "@orb/client/state/pure";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

// TypeIDs are MINTED, never hand-written literals (the branded suffix is validated at runtime).
const PLUGIN_ID = mintTypeId(ID_PREFIX.plugin);
const OTHER_PLUGIN_ID = mintTypeId(ID_PREFIX.plugin);

describe("plugin command-args intent store", () => {
  beforeEach(() => {
    __resetPluginCommandArgs(); // reset the module singleton between tests.
  });

  test("the slot starts empty — nothing to collect before the palette picks a command with args", () => {
    expect(__readPluginCommandArgsSubjectForTest()).toBeUndefined();
  });

  test("openPluginCommandArgs carries the command + its declared specs verbatim", () => {
    openPluginCommandArgs({
      pluginId: PLUGIN_ID,
      slug: "oracle-deck",
      name: "cast",
      describe: "Cast a spell",
      args: [{ name: "suit", type: "enum", required: true, enumValues: ["cups", "wands"] }],
      chatId: null,
    });
    expect(__readPluginCommandArgsSubjectForTest()).toEqual({
      pluginId: PLUGIN_ID,
      slug: "oracle-deck",
      name: "cast",
      describe: "Cast a spell",
      args: [{ name: "suit", type: "enum", required: true, enumValues: ["cups", "wands"] }],
      chatId: null,
    });
  });

  test("a second open REPLACES the first (last write wins — one args form at a time)", () => {
    openPluginCommandArgs({ pluginId: PLUGIN_ID, slug: "a", name: "first", describe: "", args: [], chatId: null });
    openPluginCommandArgs({ pluginId: OTHER_PLUGIN_ID, slug: "b", name: "second", describe: "", args: [], chatId: null });
    expect(__readPluginCommandArgsSubjectForTest()?.name).toBe("second");
  });

  test("clearPluginCommandArgs frees the slot — a re-open never inherits the closed form's subject", () => {
    openPluginCommandArgs({ pluginId: PLUGIN_ID, slug: "a", name: "cast", describe: "", args: [], chatId: null });
    clearPluginCommandArgs();
    expect(__readPluginCommandArgsSubjectForTest()).toBeUndefined();
  });
});
