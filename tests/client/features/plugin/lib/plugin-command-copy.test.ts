// A plugin's argument names and enum values are guest-chosen identifiers; the host shows them as words and keeps
// the identifier itself as the value that is sent.

import type { PluginCommandArgSpec } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { humanizeId, pluginCommandShownName, sharedPluginNames } from "../../../../../packages/client/src/features/plugin/lib/plugin-command-copy.ts";
import { pluginCommandArgOffers } from "../../../../../packages/client/src/features/plugin/lib/plugin-command-dispatch.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("humanizeId reads camelCase, snake_case and kebab-case identifiers as one sentence-case phrase", () => {
  expect(humanizeId("style")).toBe("Style");
  expect(humanizeId("inkSketch")).toBe("Ink sketch");
  expect(humanizeId("ink_sketch")).toBe("Ink sketch");
  expect(humanizeId("ink-sketch")).toBe("Ink sketch");
  expect(humanizeId("page2Layout")).toBe("Page2 layout");
});

test("an enum value is offered under its display name but inserted as its identifier", () => {
  const specs: readonly PluginCommandArgSpec[] = [{ name: "style", type: "enum", enumValues: ["inkSketch", "watercolor"] }];
  const [offer] = pluginCommandArgOffers(specs, "keepsake snapshot", " style=ink");
  expect(offer?.label).toBe("Ink sketch");
  expect(offer?.insert).toBe("keepsake snapshot style=inkSketch");
});

test("a plugin shows its slug only when a different install carries the same display name", () => {
  const shared = sharedPluginNames([
    { pluginId: castId<PluginId>("plugin_a"), pluginName: "Mid Deck" },
    { pluginId: castId<PluginId>("plugin_b"), pluginName: "Mid Deck" },
    // One install registering many commands is still one install.
    { pluginId: castId<PluginId>("plugin_c"), pluginName: "Alpha Deck" },
    { pluginId: castId<PluginId>("plugin_c"), pluginName: "Alpha Deck" },
  ]);
  expect(pluginCommandShownName("Mid Deck", "a-mid", shared)).toBe("Mid Deck (a-mid)");
  expect(pluginCommandShownName("Alpha Deck", "alpha", shared)).toBe("Alpha Deck");
});
