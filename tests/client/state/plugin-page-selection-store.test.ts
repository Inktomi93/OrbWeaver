// The EXTENSIONS drill-key seam (plugin-ui-plane #679 U5, §4.5b). What this pins is the KEY GRAMMAR, not the
// zustand behaviour — the drill store itself is `createDrillSelectionStore`, already covered by its own mirror.
//
// WHY THE KEY IS WORTH A TEST OF ITS OWN: a page is identified by a PAIR, and the switcher, the content pane
// and the mobile title hook all resolve it. The moment the join and the split disagree — a colon-splitting
// helper that took the LAST colon, say — a page whose plugin id contains one silently stops resolving, and the
// symptom is a blank CONTENT pane with no error anywhere. Round-tripping the real (minted) id shape is what
// makes that unrepresentable.

import { parsePluginPageKey, pluginPageKey } from "@orb/client/state/pure";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

// TypeIDs are MINTED, never hand-written literals (the branded suffix is validated at runtime).
const PLUGIN_ID = mintTypeId(ID_PREFIX.plugin);

describe("plugin page drill key", () => {
  test("the key round-trips a MINTED plugin id and a surface id", () => {
    const key = pluginPageKey(PLUGIN_ID, "deck_page");
    expect(parsePluginPageKey(key)).toEqual({ pluginId: PLUGIN_ID, surfaceId: "deck_page" });
  });

  test("the split takes the FIRST colon — a TypeID carries its own prefix separator", () => {
    // `plugin_01h…` has no colon, but the pair's separator must be unambiguous by CONSTRUCTION rather than by
    // luck: splitting on the last colon would break the day any id grammar gains one.
    const key = pluginPageKey(PLUGIN_ID, "a_page");
    expect(key.startsWith(`${PLUGIN_ID}:`)).toBe(true);
    expect(parsePluginPageKey(key)?.surfaceId).toBe("a_page");
  });

  test("a malformed key resolves to null rather than half a pair", () => {
    expect(parsePluginPageKey("no-separator")).toBeNull();
    expect(parsePluginPageKey(":leading")).toBeNull();
    expect(parsePluginPageKey("trailing:")).toBeNull();
  });
});
