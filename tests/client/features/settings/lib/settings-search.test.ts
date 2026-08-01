// buildSettingsSearchEntries (features/settings/lib/settings-search.ts) — the keyword wiring for a section
// whose NAV row is abbreviated. A `navLabel` shortens what the 220px nav column shows; if the index carried
// only `label`, a reader who typed the name they actually READ would miss the section the abbreviation
// hides. DOM-free pure logic → a browser-free unit test (Spine-Testing.md §7); deep-imports the lib module.

import type { SettingsPaneDefinition, SettingsPaneRegistry } from "@orb/client/state";
import { Settings } from "@orb/ui/icons";
import { buildSettingsSearchEntries } from "../../../../../packages/client/src/features/settings/lib/settings-search";
import { expect, test } from "../../../../support/fixtures";

/** A pane holding ONE subcategory whose nav label is deliberately NOT a substring of its heading — so a
 *  match on it can only come from the `navLabel` keyword, never incidentally from `label`. */
const PANE: SettingsPaneDefinition = {
  id: "appearance",
  group: "user",
  label: "Appearance",
  icon: Settings,
  description: "How the app looks.",
  subcategories: [{ id: "message-details", label: "Message details & actions", navLabel: "Chips", keywords: ["metadata"] }],
  body: { kind: "sections" },
};

const REGISTRY: SettingsPaneRegistry = {
  name: "test",
  get: (): SettingsPaneDefinition => PANE,
  list: (): readonly SettingsPaneDefinition[] => [PANE],
  has: (): boolean => true,
};

function subcategoryEntry(): { readonly label: string; readonly keywords: readonly string[] } {
  const entries = buildSettingsSearchEntries(
    REGISTRY,
    () => true,
    (pane) => pane.subcategories ?? [],
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
  // The pane's own name still rides along (a hit is reachable by category too), as do the sub's keywords.
  expect(keywords).toContain("Appearance");
  expect(keywords).toContain("metadata");
});

test("the entry READS as the heading — the abbreviation is a matcher, never the result's name", () => {
  expect(subcategoryEntry().label).toBe("Message details & actions");
});
