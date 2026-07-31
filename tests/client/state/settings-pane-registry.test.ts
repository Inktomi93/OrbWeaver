// `settingsAnchorId` + `resolveSettingsSections` (state/settings-pane-registry.ts) — the DOM anchor-id
// derivation every pane surface shares, and the settings-SECTION contribution seam's resolve step (the
// pain-point §7 cure: a domain contributes an anchored section without growing features/settings).

import { createContributorRegistry } from "@orb/client/lib";
import type { SettingsSectionContribution } from "@orb/client/state";
import { resolveSettingsSections, settingsAnchorId, settingsSectionNavs } from "@orb/client/state";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures";

describe("settingsAnchorId", () => {
  test("stamps settings-anchor-<category>-<sub>", () => {
    expect(settingsAnchorId("personas", "personas")).toBe("settings-anchor-personas-personas");
    expect(settingsAnchorId("workloads", "jobs")).toBe("settings-anchor-workloads-jobs");
  });

  test("distinct categories with the same subcategory id never collide", () => {
    expect(settingsAnchorId("admin", "engines")).not.toBe(settingsAnchorId("system", "engines"));
  });
});

/** A section contribution stub — `body` returns a marker string so the resolve output is inspectable. */
function section(id: string, anchor: SettingsSectionContribution["anchor"] = "chat-behavior"): SettingsSectionContribution {
  return { id, anchor, nav: { id, label: id }, body: () => `node:${id}` };
}

describe("resolveSettingsSections", () => {
  test("empty registry ⇒ empty array (byte-identical to the pre-seam pane)", () => {
    const registry = createContributorRegistry<SettingsSectionContribution>("t", []);
    expect(resolveSettingsSections(registry, "chat-behavior")).toEqual([]);
  });

  test("returns the anchor's contributions in declared registry order, each resolved to {id, nav, node}", () => {
    const registry = createContributorRegistry<SettingsSectionContribution>("t", [section("memory"), section("world-info")]);
    const resolved = resolveSettingsSections(registry, "chat-behavior");
    expect(resolved.map((s) => s.id)).toEqual(["memory", "world-info"]);
    expect(resolved[0]?.nav.label).toBe("memory");
    expect(resolved[0]?.node).toBe("node:memory");
  });

  test("navs for an anchor mirror its contributions in declared order (the pane merges these)", () => {
    const registry = createContributorRegistry<SettingsSectionContribution>("t", [section("memory"), section("world-info")]);
    expect(settingsSectionNavs(registry, "chat-behavior").map((n) => n.id)).toEqual(["memory", "world-info"]);
  });

  // The grouping is keyed by each contribution's own `anchor`, so a registry spanning anchors NEVER leaks a
  // section into a foreign pane (the `library` ⑪ section belongs to appearance, not chat-behavior).
  test("a contribution resolves only at its OWN anchor, never a sibling's", () => {
    const registry = createContributorRegistry<SettingsSectionContribution>("t", [section("memory"), section("library", "appearance")]);
    expect(resolveSettingsSections(registry, "appearance").map((s) => s.id)).toEqual(["library"]);
    expect(resolveSettingsSections(registry, "chat-behavior").map((s) => s.id)).toEqual(["memory"]);
    expect(settingsSectionNavs(registry, "appearance").map((n) => n.id)).toEqual(["library"]);
  });
});
