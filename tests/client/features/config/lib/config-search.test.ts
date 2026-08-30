// buildSettingsSearchEntries (features/config/lib/config-search.ts) — the keyword wiring for a section
// whose LIST row is abbreviated. A `navLabel` shortens what the LIST column shows; if the index carried
// only `label`, a reader who typed the name they actually READ would miss the section the abbreviation
// hides. DOM-free pure logic → a browser-free unit test (Spine-Testing.md §7); deep-imports the lib module.
// (S1 shape — S2 rebuilds the index over `@orb/ui/fuzzy-search`; this pin follows it there.)

import type { ConfigGroupDefinition, ConfigGroupRegistry, ConfigSubcategory } from "@orb/client/state";
import { Settings } from "@orb/ui/icons";
import { buildSettingsSearchEntries } from "../../../../../packages/client/src/features/config/lib/config-search.ts";
import { expect, test } from "../../../../support/fixtures.ts";

/** A skimmer group; its ONE row comes from the section registry (`subcategoriesFor`), never from the group
 *  itself (config-revamp-design.md §6.8). The row's nav label is deliberately NOT a substring of its heading
 *  — so a match on it can only come from the `navLabel` keyword, never incidentally from `label`. */
const GROUP: ConfigGroupDefinition = {
  id: "appearance",
  shelf: "user",
  label: "Appearance",
  icon: Settings,
  description: "How the app looks.",
  body: { kind: "sections" },
};
const ROWS: readonly ConfigSubcategory[] = [{ id: "message-details", label: "Message details & actions", navLabel: "Chips", keywords: ["metadata"] }];

const REGISTRY: ConfigGroupRegistry = {
  name: "test",
  get: (): ConfigGroupDefinition => GROUP,
  list: (): readonly ConfigGroupDefinition[] => [GROUP],
  has: (): boolean => true,
};

function subcategoryEntry(): { readonly label: string; readonly keywords: readonly string[] } {
  const entries = buildSettingsSearchEntries(
    REGISTRY,
    () => true,
    () => ROWS,
  );
  const entry = entries.find((e) => e.subId === "message-details");
  if (entry === undefined) {
    throw new Error("no subcategory entry built");
  }
  return entry;
}

test("a subcategory's search entry matches on BOTH its heading and its nav label", () => {
  const { keywords } = subcategoryEntry();
  expect(keywords).toContain("Message details & actions");
  expect(keywords).toContain("Chips");
  // The group's own name still rides along (a hit is reachable by group too), as do the sub's keywords.
  expect(keywords).toContain("Appearance");
  expect(keywords).toContain("metadata");
});

test("the entry READS as the heading — the abbreviation is a matcher, never the result's name", () => {
  expect(subcategoryEntry().label).toBe("Message details & actions");
});
