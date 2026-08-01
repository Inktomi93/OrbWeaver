// `settingsAnchorId` + `resolveSettingsSections` (state/settings-pane-registry.ts) — the DOM anchor-id
// derivation every pane surface shares, and the settings-SECTION contribution seam's resolve step (the
// pain-point §7 cure: a domain contributes an anchored section without growing features/settings).

import { appearanceBackgroundSection, appearanceEffectsSection, appearanceReadingSection, appearanceSizingSection } from "@orb/client/features/app-shell";
import { librarySettingsSection } from "@orb/client/features/character";
import {
  appearanceAvatarsSection,
  appearanceMessageDetailsSection,
  appearanceMessageStyleSection,
  chatMessageHandlingSection,
  chatStreamingSection,
  databankSettingsSection,
  imageryTemplatesSection,
  memorySettingsSection,
  proseSettingsSection,
} from "@orb/client/features/chat";
import {
  adminCatalogSection,
  adminEmbeddingsSection,
  adminEnginesSection,
  adminUsersSection,
  computeSection,
  mediaTrustSection,
  memoryTuningSection,
  multiUserSection,
  operationsSection,
  rateLimitsSection,
  sharedAccessSection,
  systemTuningSection,
} from "@orb/client/features/user-admin";
import { workloadsJobsSection, workloadsSchedulesSection, workloadsTuningSection } from "@orb/client/features/workloads";
import { worldInfoSettingsSection } from "@orb/client/features/world-info";
import { createContributorRegistry } from "@orb/client/lib";
import type { SettingsSectionContribution, SettingsViewerView } from "@orb/client/state";
import { assertSettingsKeyPartition, resolveSettingsSections, settingsAnchorId, settingsSectionNavs, UNCLAIMED_SETTINGS_KEYS } from "@orb/client/state";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures";

describe("settingsAnchorId", () => {
  test("stamps settings-anchor-<category>-<sub>", () => {
    expect(settingsAnchorId("personas", "personas")).toBe("settings-anchor-personas-personas");
    expect(settingsAnchorId("workloads", "jobs")).toBe("settings-anchor-workloads-jobs");
  });

  test("distinct categories with the same subcategory id never collide", () => {
    expect(settingsAnchorId("admin", "compute")).not.toBe(settingsAnchorId("workloads", "compute"));
  });
});

/** A section contribution stub — `body` returns a marker string so the resolve output is inspectable. */
function section(id: string, anchor: SettingsSectionContribution["anchor"] = "chat-behavior"): SettingsSectionContribution {
  return { id, anchor, nav: { id, label: id }, body: () => `node:${id}` };
}

/** The two viewer projections the `when` predicate sees. */
const PLAIN: SettingsViewerView = { isAdmin: false };
const ADMIN: SettingsViewerView = { isAdmin: true };

describe("resolveSettingsSections", () => {
  test("empty registry ⇒ empty array (byte-identical to the pre-seam pane)", () => {
    const registry = createContributorRegistry<SettingsSectionContribution>("t", []);
    expect(resolveSettingsSections(registry, "chat-behavior", PLAIN)).toEqual([]);
  });

  test("returns the anchor's contributions in declared registry order, each resolved to {id, nav, node}", () => {
    const registry = createContributorRegistry<SettingsSectionContribution>("t", [section("memory"), section("world-info")]);
    const resolved = resolveSettingsSections(registry, "chat-behavior", PLAIN);
    expect(resolved.map((s) => s.id)).toEqual(["memory", "world-info"]);
    expect(resolved[0]?.nav.label).toBe("memory");
    expect(resolved[0]?.node).toBe("node:memory");
  });

  test("navs for an anchor mirror its contributions in declared order (the pane merges these)", () => {
    const registry = createContributorRegistry<SettingsSectionContribution>("t", [section("memory"), section("world-info")]);
    expect(settingsSectionNavs(registry, "chat-behavior", PLAIN).map((n) => n.id)).toEqual(["memory", "world-info"]);
  });

  // The grouping is keyed by each contribution's own `anchor`, so a registry spanning anchors NEVER leaks a
  // section into a foreign pane (the `library` ⑪ section belongs to appearance, not chat-behavior).
  test("a contribution resolves only at its OWN anchor, never a sibling's", () => {
    const registry = createContributorRegistry<SettingsSectionContribution>("t", [section("memory"), section("library", "appearance")]);
    expect(resolveSettingsSections(registry, "appearance", PLAIN).map((s) => s.id)).toEqual(["library"]);
    expect(resolveSettingsSections(registry, "chat-behavior", PLAIN).map((s) => s.id)).toEqual(["memory"]);
    expect(settingsSectionNavs(registry, "appearance", PLAIN).map((n) => n.id)).toEqual(["library"]);
  });

  // P6 (`when` parity): ONE predicate, three consumers — a section hidden from a viewer must be absent from
  // the RENDER and from the NAV (which is also the search index's source), or a fuzzy hit scrolls to nothing.
  test("a `when`-gated section is absent from BOTH the resolve and the navs for a viewer it excludes", () => {
    const gated: SettingsSectionContribution = { ...section("admin-only"), when: (viewer) => viewer.isAdmin };
    const registry = createContributorRegistry<SettingsSectionContribution>("t", [section("memory"), gated]);

    expect(resolveSettingsSections(registry, "chat-behavior", PLAIN).map((x) => x.id)).toEqual(["memory"]);
    expect(settingsSectionNavs(registry, "chat-behavior", PLAIN).map((n) => n.id)).toEqual(["memory"]);
    expect(resolveSettingsSections(registry, "chat-behavior", ADMIN).map((x) => x.id)).toEqual(["memory", "admin-only"]);
    expect(settingsSectionNavs(registry, "chat-behavior", ADMIN).map((n) => n.id)).toEqual(["memory", "admin-only"]);
  });
});

// ── P3: the S2 key partition (SET-SEAMS §2.3) ──────────────────────────────────────────────────────────
// The pin that makes S1 (patch minimality) a proof instead of a convention. Injected defaults, so the arms
// are exercised against a fixture rather than the live contract shape.

// Hoisted throw matchers (biome useTopLevelRegex — a literal re-compiled per call).
const OVERLAP_AB = /claimed by BOTH "a" and "b"/;
const OVERLAP_ONE_TWO = /claimed by BOTH "one" and "two"/;
const NESTED_CLAIM = /NESTS with/;
const GAP_ORPHAN = /"chat.orphan" has no owning section/;
const CITE_NOW_CLAIMED = /section "a" now claims it/;
const CITE_KEY_GONE = /not a key of DEFAULT_USER_SETTINGS/;
const CITE_INERT = /the cite is inert/;

type Defaults = Parameters<typeof assertSettingsKeyPartition>[1];

/** Most arms reason about a FIXTURE namespace, so they inject an empty cite list — the live
 *  `UNCLAIMED_SETTINGS_KEYS` describes the real contract and would fire its own (correct) stale-cite arm. */
const NO_CITES: Parameters<typeof assertSettingsKeyPartition>[2] = [];

/** A stand-in `UserSettings` with just the namespaces these tests reason about — the partition arms are
 *  ABOUT namespace shape, so a fixture is the subject; the real contract shape is covered by the
 *  live-door test at the bottom of this file. */
function defaults(namespaces: Record<string, Record<string, unknown>>): Defaults {
  // These arms are about namespace SHAPE, and a whole real blob would drown the arm under test; the real
  // shape is asserted by the live-door test below.
  // FABRICATION-OK: a deliberately PARTIAL UserSettings fixture.
  return namespaces as unknown as Defaults;
}

function claiming(id: string, sectionName: string, keys: readonly string[]): SettingsSectionContribution {
  return { ...section(id), owns: { tier: "user", section: sectionName as never, keys } };
}

describe("assertSettingsKeyPartition", () => {
  test("disjoint claims covering the namespace pass", () => {
    const registry = createContributorRegistry<SettingsSectionContribution>("t", [claiming("a", "chat", ["one"]), claiming("b", "chat", ["two"])]);
    expect(() => assertSettingsKeyPartition(registry, defaults({ chat: { one: 1, two: 2 } }), NO_CITES)).not.toThrow();
  });

  test("OVERLAP throws — two sections writing one key is a lost update", () => {
    const registry = createContributorRegistry<SettingsSectionContribution>("t", [claiming("a", "chat", ["one"]), claiming("b", "chat", ["one"])]);
    expect(() => assertSettingsKeyPartition(registry, defaults({ chat: { one: 1 } }), NO_CITES)).toThrow(OVERLAP_AB);
  });

  test("GAP inside a CLAIMED namespace throws — a knob with no editor (D107)", () => {
    const registry = createContributorRegistry<SettingsSectionContribution>("t", [claiming("a", "chat", ["one"])]);
    expect(() => assertSettingsKeyPartition(registry, defaults({ chat: { one: 1, orphan: 2 } }), NO_CITES)).toThrow(GAP_ORPHAN);
  });

  test("a namespace NO section claims is not under the partition — still pane-owned (the migration state)", () => {
    const registry = createContributorRegistry<SettingsSectionContribution>("t", [claiming("a", "chat", ["one"])]);
    expect(() => assertSettingsKeyPartition(registry, defaults({ chat: { one: 1 }, appearance: { density: "x" } }), NO_CITES)).not.toThrow();
  });

  test("an APP-tier claim never collides with a same-named USER-tier key", () => {
    const app: SettingsSectionContribution = { ...section("app"), owns: { tier: "app", keys: ["one" as never] } };
    const registry = createContributorRegistry<SettingsSectionContribution>("t", [claiming("a", "chat", ["one"]), app]);
    expect(() => assertSettingsKeyPartition(registry, defaults({ chat: { one: 1 } }), NO_CITES)).not.toThrow();
  });

  test("two APP-tier sections claiming one key throw", () => {
    const one: SettingsSectionContribution = { ...section("one"), owns: { tier: "app", keys: ["rateLimits" as never] } };
    const two: SettingsSectionContribution = { ...section("two"), owns: { tier: "app", keys: ["rateLimits" as never] } };
    const registry = createContributorRegistry<SettingsSectionContribution>("t", [one, two]);
    expect(() => assertSettingsKeyPartition(registry, defaults({}), NO_CITES)).toThrow(OVERLAP_ONE_TWO);
  });

  // The stage-4 LEAF arm (SET-SEAMS §2.3 as amended): the app tier has no namespaces, so two sections may
  // own different LEAVES of one nested key (`engineLaunch`) — but never a leaf AND its parent, in either
  // declaration order, because the parent's owner clears the whole object.
  test("two APP-tier sections claiming disjoint LEAVES of one nested key pass", () => {
    const one: SettingsSectionContribution = { ...section("one"), owns: { tier: "app", keys: ["engineLaunch.genModel", "engineLaunch.genMaxModelLen"] } };
    const two: SettingsSectionContribution = { ...section("two"), owns: { tier: "app", keys: ["engineLaunch.genPresencePenalty"] } };
    const registry = createContributorRegistry<SettingsSectionContribution>("t", [one, two]);
    expect(() => assertSettingsKeyPartition(registry, defaults({}), NO_CITES)).not.toThrow();
  });

  test("a LEAF claim beside its PARENT throws — parent-first", () => {
    const one: SettingsSectionContribution = { ...section("one"), owns: { tier: "app", keys: ["engineLaunch"] } };
    const two: SettingsSectionContribution = { ...section("two"), owns: { tier: "app", keys: ["engineLaunch.genPresencePenalty"] } };
    const registry = createContributorRegistry<SettingsSectionContribution>("t", [one, two]);
    expect(() => assertSettingsKeyPartition(registry, defaults({}), NO_CITES)).toThrow(NESTED_CLAIM);
  });

  test("a LEAF claim beside its PARENT throws — leaf-first (declaration order can't hide it)", () => {
    const one: SettingsSectionContribution = { ...section("one"), owns: { tier: "app", keys: ["engineLaunch.genPresencePenalty"] } };
    const two: SettingsSectionContribution = { ...section("two"), owns: { tier: "app", keys: ["engineLaunch"] } };
    const registry = createContributorRegistry<SettingsSectionContribution>("t", [one, two]);
    expect(() => assertSettingsKeyPartition(registry, defaults({}), NO_CITES)).toThrow(NESTED_CLAIM);
  });

  // A key that merely PREFIXES another is not nested (`engineLaunchExtra` ≠ inside `engineLaunch`) — the
  // check keys on the dot, never on a bare string prefix.
  test("a sibling key sharing a name PREFIX is not a nesting conflict", () => {
    const one: SettingsSectionContribution = { ...section("one"), owns: { tier: "app", keys: ["engineLaunch" as never] } };
    const two: SettingsSectionContribution = { ...section("two"), owns: { tier: "app", keys: ["engineLaunchExtra" as never] } };
    const registry = createContributorRegistry<SettingsSectionContribution>("t", [one, two]);
    expect(() => assertSettingsKeyPartition(registry, defaults({}), NO_CITES)).not.toThrow();
  });

  test("a CITED gap passes — the D107 exemption, with its reason", () => {
    const registry = createContributorRegistry<SettingsSectionContribution>("t", [claiming("a", "chat", ["one"])]);
    const cites = [{ section: "chat" as never, key: "orphan", reason: "ingest-only, set elsewhere" }];
    expect(() => assertSettingsKeyPartition(registry, defaults({ chat: { one: 1, orphan: 2 } }), cites)).not.toThrow();
  });

  // The self-cleaning stale-cite arms (D50 DEFERRED discipline) — an exemption that stops being true REDs
  // instead of rotting green, in BOTH directions.
  test("a cite whose key a section now CLAIMS throws", () => {
    const registry = createContributorRegistry<SettingsSectionContribution>("t", [claiming("a", "chat", ["one", "orphan"])]);
    const cites = [{ section: "chat" as never, key: "orphan", reason: "stale — a section claims it now" }];
    expect(() => assertSettingsKeyPartition(registry, defaults({ chat: { one: 1, orphan: 2 } }), cites)).toThrow(CITE_NOW_CLAIMED);
  });

  test("a cite for a key that no longer EXISTS throws", () => {
    const registry = createContributorRegistry<SettingsSectionContribution>("t", [claiming("a", "chat", ["one"])]);
    const cites = [{ section: "chat" as never, key: "removed", reason: "the key was deleted from the schema" }];
    expect(() => assertSettingsKeyPartition(registry, defaults({ chat: { one: 1 } }), cites)).toThrow(CITE_KEY_GONE);
  });

  test("a cite in a namespace NO section claims throws — an inert cite", () => {
    const registry = createContributorRegistry<SettingsSectionContribution>("t", [claiming("a", "chat", ["one"])]);
    const cites = [{ section: "appearance" as never, key: "density", reason: "still pane-owned" }];
    expect(() => assertSettingsKeyPartition(registry, defaults({ chat: { one: 1 }, appearance: { density: "x" } }), cites)).toThrow(CITE_INERT);
  });

  test("every LIVE cite names a real key of its namespace and carries a reason", () => {
    for (const cite of UNCLAIMED_SETTINGS_KEYS) {
      expect(Object.keys(DEFAULT_USER_SETTINGS[cite.section] as object)).toContain(cite.key);
      expect(cite.reason).not.toBe("");
    }
  });
});

// The DOOR's own assertion, run against the REAL contributions + the REAL contract defaults. main.tsx calls
// this at module init, so a violated partition is a white-screen at boot — this test is the pre-image of
// that crash, and it fails HERE (with the offending key named) instead of in the browser.
test("the real door's settings-section claims partition cleanly against DEFAULT_USER_SETTINGS", () => {
  const registry = createContributorRegistry<SettingsSectionContribution>("settings-sections", [
    chatMessageHandlingSection,
    chatStreamingSection,
    memorySettingsSection,
    worldInfoSettingsSection,
    databankSettingsSection,
    imageryTemplatesSection,
    proseSettingsSection,
    mediaTrustSection,
    computeSection,
    sharedAccessSection,
    multiUserSection,
    operationsSection,
    adminUsersSection,
    adminEnginesSection,
    adminCatalogSection,
    adminEmbeddingsSection,
    memoryTuningSection,
    rateLimitsSection,
    systemTuningSection,
    workloadsJobsSection,
    workloadsSchedulesSection,
    workloadsTuningSection,
    appearanceMessageStyleSection,
    appearanceAvatarsSection,
    appearanceSizingSection,
    appearanceMessageDetailsSection,
    appearanceBackgroundSection,
    appearanceReadingSection,
    appearanceEffectsSection,
    librarySettingsSection,
  ]);
  expect(() => assertSettingsKeyPartition(registry, DEFAULT_USER_SETTINGS)).not.toThrow();
});
