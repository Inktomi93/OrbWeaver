// `resolveConfigSections` + `configSectionNavParts` + `configSectionNavs` (state/config-section-registry.ts)
// — the config-SECTION contribution seam's resolve step (the pain-point §7 cure: a domain contributes an
// anchored section without growing the host), keyed by each contribution's own anchor and `when`-filtered
// ONCE for the LIST, the search and the render (SET-SEAMS §5).
//
// Since #978 F4 the resolve step also owns the ONE ORDER CONTRACT: plain sections in declared registry
// order, then the `advanced: true` fold cohort in declared registry order. Both panes project from that
// single partition, which is what makes the LIST's map and CONTENT's sequence the same fact rather than two
// sorts that drifted (the LIST used to advertise "Sizing & motion" fourth over a pane that paints it ninth,
// behind a collapsed disclosure the map never mentioned).

import { createContributorRegistry } from "@orb/client/lib";
import type { ConfigSectionContribution, SettingsViewerView } from "@orb/client/state";
import { configSectionNavParts, configSectionNavs, resolveConfigSections } from "@orb/client/state";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

/** A section contribution stub — `body` returns a marker string so the resolve output is inspectable. */
function section(id: string, anchor: ConfigSectionContribution["anchor"] = "chat-behavior"): ConfigSectionContribution {
  return { id, anchor, nav: { id, label: id }, body: () => `node:${id}` };
}

/** A stub that lands in the group's advanced fold. */
function advancedSection(id: string, anchor: ConfigSectionContribution["anchor"] = "chat-behavior"): ConfigSectionContribution {
  return { ...section(id, anchor), advanced: true };
}

/** The two viewer projections the `when` predicate sees. */
const PLAIN: SettingsViewerView = { isAdmin: false, isOwner: false };
const ADMIN: SettingsViewerView = { isAdmin: true, isOwner: false };

describe("resolveConfigSections", () => {
  test("empty registry ⇒ two empty sides (byte-identical to the pre-seam pane)", () => {
    const registry = createContributorRegistry<ConfigSectionContribution>("t", []);
    expect(resolveConfigSections(registry, "chat-behavior", PLAIN)).toEqual({ primary: [], advanced: [] });
  });

  test("returns the anchor's contributions in declared registry order, each resolved to {id, nav, node}", () => {
    const registry = createContributorRegistry<ConfigSectionContribution>("t", [section("memory"), section("world-info")]);
    const { primary, advanced } = resolveConfigSections(registry, "chat-behavior", PLAIN);
    expect(primary.map((s) => s.id)).toEqual(["memory", "world-info"]);
    expect(advanced).toEqual([]);
    expect(primary[0]?.nav.label).toBe("memory");
    expect(primary[0]?.node).toBe("node:memory");
  });

  test("navs for an anchor mirror its contributions in declared order (the pane merges these)", () => {
    const registry = createContributorRegistry<ConfigSectionContribution>("t", [section("memory"), section("world-info")]);
    expect(configSectionNavs(registry, "chat-behavior", PLAIN).map((n) => n.id)).toEqual(["memory", "world-info"]);
  });

  // The grouping is keyed by each contribution's own `anchor`, so a registry spanning anchors NEVER leaks a
  // section into a foreign pane (the `library` ⑪ section belongs to appearance, not chat-behavior).
  test("a contribution resolves only at its OWN anchor, never a sibling's", () => {
    const registry = createContributorRegistry<ConfigSectionContribution>("t", [section("memory"), section("library", "appearance")]);
    expect(resolveConfigSections(registry, "appearance", PLAIN).primary.map((s) => s.id)).toEqual(["library"]);
    expect(resolveConfigSections(registry, "chat-behavior", PLAIN).primary.map((s) => s.id)).toEqual(["memory"]);
    expect(configSectionNavs(registry, "appearance", PLAIN).map((n) => n.id)).toEqual(["library"]);
  });

  // P6 (`when` parity): ONE predicate, three consumers — a section hidden from a viewer must be absent from
  // the RENDER and from the NAV (which is also the search index's source), or a fuzzy hit scrolls to nothing.
  test("a `when`-gated section is absent from BOTH the resolve and the navs for a viewer it excludes", () => {
    const gated: ConfigSectionContribution = { ...section("admin-only"), when: (viewer) => viewer.isAdmin };
    const registry = createContributorRegistry<ConfigSectionContribution>("t", [section("memory"), gated]);

    expect(resolveConfigSections(registry, "chat-behavior", PLAIN).primary.map((x) => x.id)).toEqual(["memory"]);
    expect(configSectionNavs(registry, "chat-behavior", PLAIN).map((n) => n.id)).toEqual(["memory"]);
    expect(resolveConfigSections(registry, "chat-behavior", ADMIN).primary.map((x) => x.id)).toEqual(["memory", "admin-only"]);
    expect(configSectionNavs(registry, "chat-behavior", ADMIN).map((n) => n.id)).toEqual(["memory", "admin-only"]);
  });
});

// ── The ORDER CONTRACT (#978 F4) ──────────────────────────────────────────────────────────────────────
//
// The plant is INTERLEAVED on purpose — plain A, advanced X, plain B, advanced Y — because that is the
// shape the live Appearance registry has and the shape a "preserve declaration order" implementation gets
// wrong: it is the only arrangement where "declared order" and "canonical order" differ.
describe("the canonical section order", () => {
  const interleaved = (): ReturnType<typeof createContributorRegistry<ConfigSectionContribution>> =>
    createContributorRegistry<ConfigSectionContribution>("t", [section("plain-a"), advancedSection("adv-x"), section("plain-b"), advancedSection("adv-y")]);

  test("partitions an interleaved registry into plain-then-advanced, each side in declaration order", () => {
    const parts = configSectionNavParts(interleaved(), "chat-behavior", PLAIN);
    expect(parts.primary.map((n) => n.id)).toEqual(["plain-a", "plain-b"]);
    expect(parts.advanced.map((n) => n.id)).toEqual(["adv-x", "adv-y"]);
  });

  test("the NODE and NAV projections partition identically — the two panes cannot disagree", () => {
    const registry = interleaved();
    const nodes = resolveConfigSections(registry, "chat-behavior", PLAIN);
    const navs = configSectionNavParts(registry, "chat-behavior", PLAIN);
    expect(nodes.primary.map((s) => s.id)).toEqual(navs.primary.map((n) => n.id));
    expect(nodes.advanced.map((s) => s.id)).toEqual(navs.advanced.map((n) => n.id));
  });

  // Viewer gating runs ONCE, before the split — so removing a section never reorders the survivors, and a
  // gated ADVANCED section stays on the advanced side for the viewer who can see it.
  test("`when` removal is applied before the split and leaves both sides' order intact", () => {
    const registry = createContributorRegistry<ConfigSectionContribution>("t", [
      section("plain-a"),
      { ...advancedSection("adv-admin"), when: (viewer) => viewer.isAdmin },
      { ...section("plain-admin"), when: (viewer) => viewer.isAdmin },
      section("plain-b"),
      advancedSection("adv-y"),
    ]);

    const plain = configSectionNavParts(registry, "chat-behavior", PLAIN);
    expect(plain.primary.map((n) => n.id)).toEqual(["plain-a", "plain-b"]);
    expect(plain.advanced.map((n) => n.id)).toEqual(["adv-y"]);

    const admin = configSectionNavParts(registry, "chat-behavior", ADMIN);
    expect(admin.primary.map((n) => n.id)).toEqual(["plain-a", "plain-admin", "plain-b"]);
    expect(admin.advanced.map((n) => n.id)).toEqual(["adv-admin", "adv-y"]);
  });

  // A group with NO declared fold still gets the canonical order: the partition is the wall, so the LIST
  // and CONTENT agree even where there is no disclosure to name.
  test("a foldless group's advanced sections still sort last (the partition is the wall, not the fold)", () => {
    expect(configSectionNavs(interleaved(), "chat-behavior", PLAIN).map((n) => n.id)).toEqual(["plain-a", "plain-b", "adv-x", "adv-y"]);
  });
});
