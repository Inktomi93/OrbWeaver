// `assertSettingsKeyPartition` (state/config-section-partition.ts) — the key partition the door asserts at
// boot (SET-SEAMS §2.3): N sections saving into ONE settings namespace is safe only while their claims are
// DISJOINT, and every claimed namespace's remaining keys are claimed or CITED. The last test is the REAL
// door's registry against the REAL contract defaults — the pre-image of the boot-time throw.

import { appearanceBackgroundSection, appearanceEffectsSection, appearanceReadingSection, appearanceSizingSection } from "@orb/client/features/app-shell";
import { automationBudgetSection, automationLibraryRulesSection } from "@orb/client/features/automation";
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
import { connectionsHostClaudeSection, connectionsKeysSection, connectionsRolesSection } from "@orb/client/features/credentials";
import { personaListSection, personaNotificationsSection, personaThisChatSection } from "@orb/client/features/persona";
import { pluginDistributeSection, pluginsInstalledSection, pluginsInstallSection } from "@orb/client/features/plugin";
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
import {
  backupExportSection,
  backupImportSection,
  workloadsJobsSection,
  workloadsSchedulesSection,
  workloadsTuningSection,
} from "@orb/client/features/workloads";
import { worldInfoSettingsSection } from "@orb/client/features/world-info";
import { createContributorRegistry } from "@orb/client/lib";
import type { ConfigSectionContribution } from "@orb/client/state";
import { assertSettingsKeyPartition, assertTeachHonesty, UNCLAIMED_SETTINGS_KEYS } from "@orb/client/state";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

/** A section contribution stub — `body` returns a marker string so the resolve output is inspectable. */
function section(id: string, anchor: ConfigSectionContribution["anchor"] = "chat-behavior"): ConfigSectionContribution {
  return { id, anchor, nav: { id, label: id }, body: () => `node:${id}` };
}

// ── P3: the S2 key partition (SET-SEAMS §2.3) ──────────────────────────────────────────────────────────
// The pin that makes S1 (patch minimality) a proof instead of a convention. Injected defaults, so the arms
// are exercised against a fixture rather than the live contract shape.

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
  // @orb-waive no-test-fabrication(unknown): a deliberately PARTIAL UserSettings fixture. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  return namespaces as unknown as Defaults;
}

function claiming(id: string, sectionName: string, keys: readonly string[]): ConfigSectionContribution {
  return { ...section(id), owns: { tier: "user", section: sectionName as never, keys } };
}

/** A claiming contribution whose nav carries ONE leaf, optionally key-bound (§3.4 row chrome, #866). */
function claimingWithLeaf(
  id: string,
  claim: { readonly section?: string; readonly keys?: readonly string[] } | null,
  leafKey?: string,
): ConfigSectionContribution {
  const base = claim === null ? section(id) : claiming(id, claim.section ?? "chat", claim.keys ?? ["one"]);
  return {
    ...base,
    nav: { id, label: id, settings: [{ id: "leaf", label: "Leaf", teach: { none: "a fixture leaf" }, ...(leafKey === undefined ? {} : { key: leafKey }) }] },
  };
}

describe("assertSettingsKeyPartition", () => {
  test("disjoint claims covering the namespace pass", () => {
    const registry = createContributorRegistry<ConfigSectionContribution>("t", [claiming("a", "chat", ["one"]), claiming("b", "chat", ["two"])]);
    expect(() => assertSettingsKeyPartition(registry, defaults({ chat: { one: 1, two: 2 } }), NO_CITES)).not.toThrow();
  });

  test("OVERLAP throws — two sections writing one key is a lost update", () => {
    const registry = createContributorRegistry<ConfigSectionContribution>("t", [claiming("a", "chat", ["one"]), claiming("b", "chat", ["one"])]);
    expect(() => assertSettingsKeyPartition(registry, defaults({ chat: { one: 1 } }), NO_CITES)).toThrow(OVERLAP_AB);
  });

  test("GAP inside a CLAIMED namespace throws — a knob with no editor (D107)", () => {
    const registry = createContributorRegistry<ConfigSectionContribution>("t", [claiming("a", "chat", ["one"])]);
    expect(() => assertSettingsKeyPartition(registry, defaults({ chat: { one: 1, orphan: 2 } }), NO_CITES)).toThrow(GAP_ORPHAN);
  });

  test("a namespace NO section claims is not under the partition — still pane-owned (the migration state)", () => {
    const registry = createContributorRegistry<ConfigSectionContribution>("t", [claiming("a", "chat", ["one"])]);
    expect(() => assertSettingsKeyPartition(registry, defaults({ chat: { one: 1 }, appearance: { density: "x" } }), NO_CITES)).not.toThrow();
  });

  // ── The LEAF-KEY honesty arm (§3.4 row chrome, #866): a `ConfigSettingLeaf.key` outside its section's
  // claim would let the row read and RESET a value the section does not own — planted RED both ways.
  test("a leaf key that IS a member of its section's user-tier claim passes", () => {
    const registry = createContributorRegistry<ConfigSectionContribution>("t", [claimingWithLeaf("a", { keys: ["one"] }, "one")]);
    expect(() => assertSettingsKeyPartition(registry, defaults({ chat: { one: 1 } }), NO_CITES)).not.toThrow();
  });

  test("a leaf key OUTSIDE its section's claim throws — the row would reset a value it does not own", () => {
    const registry = createContributorRegistry<ConfigSectionContribution>("t", [claimingWithLeaf("a", { keys: ["one"] }, "stolen")]);
    expect(() => assertSettingsKeyPartition(registry, defaults({ chat: { one: 1 } }), NO_CITES)).toThrow(/NOT in the section's claim/);
  });

  test("a leaf key on a CLAIM-LESS contribution throws — a binding needs an owned per-user key", () => {
    const registry = createContributorRegistry<ConfigSectionContribution>("t", [claimingWithLeaf("a", null, "one")]);
    expect(() => assertSettingsKeyPartition(registry, defaults({}), NO_CITES)).toThrow(/no user-tier claim/);
  });

  test("a leaf with NO key on any contribution stays exempt — partial adoption is honest", () => {
    const registry = createContributorRegistry<ConfigSectionContribution>("t", [claimingWithLeaf("a", { keys: ["one"] })]);
    expect(() => assertSettingsKeyPartition(registry, defaults({ chat: { one: 1 } }), NO_CITES)).not.toThrow();
  });

  test("a bound key whose DEFAULT does not resolve from the one home throws — derived, never mirrored (owner rider)", () => {
    // The claim covers the key but the contract defaults have no value at it: the stripe would read
    // permanently modified and Reset would write a hole. The gap arm can't see this (`one` IS claimed);
    // only the resolvability arm does — the planted control the rider asked for.
    const registry = createContributorRegistry<ConfigSectionContribution>("t", [claimingWithLeaf("a", { keys: ["one"] }, "one")]);
    expect(() => assertSettingsKeyPartition(registry, defaults({ chat: {} }), NO_CITES)).toThrow(/DEFAULT does not resolve/);
  });

  test("an APP-tier claim never collides with a same-named USER-tier key", () => {
    const app: ConfigSectionContribution = { ...section("app"), owns: { tier: "app", keys: ["one" as never] } };
    const registry = createContributorRegistry<ConfigSectionContribution>("t", [claiming("a", "chat", ["one"]), app]);
    expect(() => assertSettingsKeyPartition(registry, defaults({ chat: { one: 1 } }), NO_CITES)).not.toThrow();
  });

  test("two APP-tier sections claiming one key throw", () => {
    const one: ConfigSectionContribution = { ...section("one"), owns: { tier: "app", keys: ["rateLimits" as never] } };
    const two: ConfigSectionContribution = { ...section("two"), owns: { tier: "app", keys: ["rateLimits" as never] } };
    const registry = createContributorRegistry<ConfigSectionContribution>("t", [one, two]);
    expect(() => assertSettingsKeyPartition(registry, defaults({}), NO_CITES)).toThrow(OVERLAP_ONE_TWO);
  });

  // The stage-4 LEAF arm (SET-SEAMS §2.3 as amended): the app tier has no namespaces, so two sections may
  // own different LEAVES of one nested key (`engineLaunch`) — but never a leaf AND its parent, in either
  // declaration order, because the parent's owner clears the whole object.
  test("two APP-tier sections claiming disjoint LEAVES of one nested key pass", () => {
    const one: ConfigSectionContribution = { ...section("one"), owns: { tier: "app", keys: ["engineLaunch.genModel", "engineLaunch.genMaxModelLen"] } };
    const two: ConfigSectionContribution = { ...section("two"), owns: { tier: "app", keys: ["engineLaunch.genPresencePenalty"] } };
    const registry = createContributorRegistry<ConfigSectionContribution>("t", [one, two]);
    expect(() => assertSettingsKeyPartition(registry, defaults({}), NO_CITES)).not.toThrow();
  });

  test("a LEAF claim beside its PARENT throws — parent-first", () => {
    const one: ConfigSectionContribution = { ...section("one"), owns: { tier: "app", keys: ["engineLaunch"] } };
    const two: ConfigSectionContribution = { ...section("two"), owns: { tier: "app", keys: ["engineLaunch.genPresencePenalty"] } };
    const registry = createContributorRegistry<ConfigSectionContribution>("t", [one, two]);
    expect(() => assertSettingsKeyPartition(registry, defaults({}), NO_CITES)).toThrow(NESTED_CLAIM);
  });

  test("a LEAF claim beside its PARENT throws — leaf-first (declaration order can't hide it)", () => {
    const one: ConfigSectionContribution = { ...section("one"), owns: { tier: "app", keys: ["engineLaunch.genPresencePenalty"] } };
    const two: ConfigSectionContribution = { ...section("two"), owns: { tier: "app", keys: ["engineLaunch"] } };
    const registry = createContributorRegistry<ConfigSectionContribution>("t", [one, two]);
    expect(() => assertSettingsKeyPartition(registry, defaults({}), NO_CITES)).toThrow(NESTED_CLAIM);
  });

  // A key that merely PREFIXES another is not nested (`engineLaunchExtra` ≠ inside `engineLaunch`) — the
  // check keys on the dot, never on a bare string prefix.
  test("a sibling key sharing a name PREFIX is not a nesting conflict", () => {
    const one: ConfigSectionContribution = { ...section("one"), owns: { tier: "app", keys: ["engineLaunch" as never] } };
    const two: ConfigSectionContribution = { ...section("two"), owns: { tier: "app", keys: ["engineLaunchExtra" as never] } };
    const registry = createContributorRegistry<ConfigSectionContribution>("t", [one, two]);
    expect(() => assertSettingsKeyPartition(registry, defaults({}), NO_CITES)).not.toThrow();
  });

  test("a CITED gap passes — the D107 exemption, with its reason", () => {
    const registry = createContributorRegistry<ConfigSectionContribution>("t", [claiming("a", "chat", ["one"])]);
    const cites = [{ section: "chat" as never, key: "orphan", reason: "ingest-only, set elsewhere" }];
    expect(() => assertSettingsKeyPartition(registry, defaults({ chat: { one: 1, orphan: 2 } }), cites)).not.toThrow();
  });

  // The self-cleaning stale-cite arms (D50 DEFERRED discipline) — an exemption that stops being true REDs
  // instead of rotting green, in BOTH directions.
  test("a cite whose key a section now CLAIMS throws", () => {
    const registry = createContributorRegistry<ConfigSectionContribution>("t", [claiming("a", "chat", ["one", "orphan"])]);
    const cites = [{ section: "chat" as never, key: "orphan", reason: "stale — a section claims it now" }];
    expect(() => assertSettingsKeyPartition(registry, defaults({ chat: { one: 1, orphan: 2 } }), cites)).toThrow(CITE_NOW_CLAIMED);
  });

  test("a cite for a key that no longer EXISTS throws", () => {
    const registry = createContributorRegistry<ConfigSectionContribution>("t", [claiming("a", "chat", ["one"])]);
    const cites = [{ section: "chat" as never, key: "removed", reason: "the key was deleted from the schema" }];
    expect(() => assertSettingsKeyPartition(registry, defaults({ chat: { one: 1 } }), cites)).toThrow(CITE_KEY_GONE);
  });

  test("a cite in a namespace NO section claims throws — an inert cite", () => {
    const registry = createContributorRegistry<ConfigSectionContribution>("t", [claiming("a", "chat", ["one"])]);
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

// The DOOR's own assertions, run against the REAL contributions + the REAL contract defaults. main.tsx
// calls them at module init, so a violation is a white-screen at boot — these tests are the pre-image of
// that crash, and they fail HERE (with the offending key/leaf named) instead of in the browser. ONE
// mirror list serves both (`test-presence-mirror-not-suite`: the mirror is the accepted live-door lens).
function realDoorSections(): ReturnType<typeof createContributorRegistry<ConfigSectionContribution>> {
  return createContributorRegistry<ConfigSectionContribution>("config-sections", [
    // The §6.8 conversions — persona claims `persona.showNotifications`, connections claims `routing.roleDefaults`.
    personaNotificationsSection,
    personaListSection,
    personaThisChatSection,
    backupExportSection,
    backupImportSection,
    connectionsRolesSection,
    connectionsHostClaudeSection,
    connectionsKeysSection,
    automationLibraryRulesSection,
    automationBudgetSection,
    pluginsInstalledSection,
    pluginsInstallSection,
    pluginDistributeSection,
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
}

test("the real door's settings-section claims partition cleanly against DEFAULT_USER_SETTINGS", () => {
  expect(() => assertSettingsKeyPartition(realDoorSections(), DEFAULT_USER_SETTINGS)).not.toThrow();
});

// R-TEACH's DERIVED-POPULATION arm (#866 S3, config-revamp-design.md §7.0): iterate the REAL registry's
// leaves — never a hand list — and prove every one resolves an honest teach or a stated opt-out. The
// planted per-arm RED fixtures live in `config-teach.test.ts`; this is the sweep over the population.
test("every declared leaf of the real door carries an honest teach or a stated opt-out", () => {
  const registry = realDoorSections();
  expect(() => assertTeachHonesty(registry)).not.toThrow();
  const leaves = registry.list().flatMap((c) => (c.nav.settings ?? []).map((leaf) => ({ at: `${c.anchor}/${c.nav.id}`, leaf })));
  // The population floor: a refactor that silently empties the leaf set must be loud, not a vacuous pass.
  expect(leaves.length).toBeGreaterThan(50);
});
