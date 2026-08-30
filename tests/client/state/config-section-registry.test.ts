// `resolveConfigSections` + `configSectionNavs` (state/config-section-registry.ts) — the config-SECTION
// contribution seam's resolve step (the pain-point §7 cure: a domain contributes an anchored section without
// growing the host), keyed by each contribution's own anchor and `when`-filtered ONCE for the LIST, the
// search and the render (SET-SEAMS §5).

import { createContributorRegistry } from "@orb/client/lib";
import type { ConfigSectionContribution, SettingsViewerView } from "@orb/client/state";
import { configSectionNavs, resolveConfigSections } from "@orb/client/state";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

/** A section contribution stub — `body` returns a marker string so the resolve output is inspectable. */
function section(id: string, anchor: ConfigSectionContribution["anchor"] = "chat-behavior"): ConfigSectionContribution {
  return { id, anchor, nav: { id, label: id }, body: () => `node:${id}` };
}

/** The two viewer projections the `when` predicate sees. */
const PLAIN: SettingsViewerView = { isAdmin: false, isOwner: false };
const ADMIN: SettingsViewerView = { isAdmin: true, isOwner: false };

describe("resolveConfigSections", () => {
  test("empty registry ⇒ empty array (byte-identical to the pre-seam pane)", () => {
    const registry = createContributorRegistry<ConfigSectionContribution>("t", []);
    expect(resolveConfigSections(registry, "chat-behavior", PLAIN)).toEqual([]);
  });

  test("returns the anchor's contributions in declared registry order, each resolved to {id, nav, node}", () => {
    const registry = createContributorRegistry<ConfigSectionContribution>("t", [section("memory"), section("world-info")]);
    const resolved = resolveConfigSections(registry, "chat-behavior", PLAIN);
    expect(resolved.map((s) => s.id)).toEqual(["memory", "world-info"]);
    expect(resolved[0]?.nav.label).toBe("memory");
    expect(resolved[0]?.node).toBe("node:memory");
  });

  test("navs for an anchor mirror its contributions in declared order (the pane merges these)", () => {
    const registry = createContributorRegistry<ConfigSectionContribution>("t", [section("memory"), section("world-info")]);
    expect(configSectionNavs(registry, "chat-behavior", PLAIN).map((n) => n.id)).toEqual(["memory", "world-info"]);
  });

  // The grouping is keyed by each contribution's own `anchor`, so a registry spanning anchors NEVER leaks a
  // section into a foreign pane (the `library` ⑪ section belongs to appearance, not chat-behavior).
  test("a contribution resolves only at its OWN anchor, never a sibling's", () => {
    const registry = createContributorRegistry<ConfigSectionContribution>("t", [section("memory"), section("library", "appearance")]);
    expect(resolveConfigSections(registry, "appearance", PLAIN).map((s) => s.id)).toEqual(["library"]);
    expect(resolveConfigSections(registry, "chat-behavior", PLAIN).map((s) => s.id)).toEqual(["memory"]);
    expect(configSectionNavs(registry, "appearance", PLAIN).map((n) => n.id)).toEqual(["library"]);
  });

  // P6 (`when` parity): ONE predicate, three consumers — a section hidden from a viewer must be absent from
  // the RENDER and from the NAV (which is also the search index's source), or a fuzzy hit scrolls to nothing.
  test("a `when`-gated section is absent from BOTH the resolve and the navs for a viewer it excludes", () => {
    const gated: ConfigSectionContribution = { ...section("admin-only"), when: (viewer) => viewer.isAdmin };
    const registry = createContributorRegistry<ConfigSectionContribution>("t", [section("memory"), gated]);

    expect(resolveConfigSections(registry, "chat-behavior", PLAIN).map((x) => x.id)).toEqual(["memory"]);
    expect(configSectionNavs(registry, "chat-behavior", PLAIN).map((n) => n.id)).toEqual(["memory"]);
    expect(resolveConfigSections(registry, "chat-behavior", ADMIN).map((x) => x.id)).toEqual(["memory", "admin-only"]);
    expect(configSectionNavs(registry, "chat-behavior", ADMIN).map((n) => n.id)).toEqual(["memory", "admin-only"]);
  });
});
