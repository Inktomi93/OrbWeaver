// The EXTENSIONS drill-key seam. The key is minted once and then stays
// opaque: the switcher, content pane, and mobile title resolve pages through exact key equality.

import type { PluginPageKey } from "@orb/client/state";
import { pluginPageKey } from "@orb/client/state";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { describe, expectTypeOf } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

// TypeIDs are MINTED, never hand-written literals (the branded suffix is validated at runtime).
const PLUGIN_ID = mintTypeId(ID_PREFIX.plugin);

describe("plugin page drill key", () => {
  test("the one mint combines a MINTED plugin id and surface id", () => {
    const key = pluginPageKey(PLUGIN_ID, "deck_page");
    expect(key).toBe(`${PLUGIN_ID}:deck_page`);
    expectTypeOf(key).toEqualTypeOf<PluginPageKey>();
    expectTypeOf<string>().not.toExtend<PluginPageKey>();
  });

  test("distinct page registrations have distinct opaque keys", () => {
    expect(pluginPageKey(PLUGIN_ID, "deck_page")).not.toBe(pluginPageKey(PLUGIN_ID, "board_page"));
  });
});
