import { createContributorRegistry } from "@orb/client/lib";
import type { ConfigSectionContribution, SettingsViewerView } from "@orb/client/state";
import { configSectionNavParts, resolveConfigSectionAnchor, resolveConfigSectionAnchorPrefix, resolveConfigSections } from "@orb/client/state";
import { expect, test } from "@orb/testkit/node";

const MEMBER: SettingsViewerView = { isAdmin: false, isOwner: false };
const ADMIN: SettingsViewerView = { isAdmin: true, isOwner: false };

test("registered groups sharing a section id receive distinct render and navigation anchors", () => {
  const registry = createContributorRegistry<ConfigSectionContribution>("shared-section-control", [
    { id: "appearance-shared", anchor: "appearance", nav: { id: "shared", label: "Appearance" }, body: (anchor) => anchor },
    { id: "admin-shared", anchor: "admin", nav: { id: "shared", label: "Admin" }, body: (anchor) => anchor },
  ]);
  const appearance = resolveConfigSectionAnchor(registry, "appearance", "shared", ADMIN);
  const admin = resolveConfigSectionAnchor(registry, "admin", "shared", ADMIN);
  expect(appearance).not.toBeNull();
  expect(admin).not.toBeNull();
  expect(appearance).not.toBe(admin);
  expect(resolveConfigSections(registry, "appearance", ADMIN).primary[0]?.node).toBe(appearance);
  expect(resolveConfigSections(registry, "admin", ADMIN).primary[0]?.node).toBe(admin);
});

test("the resolver supplies the same anchor that navigation resolves, independently of the contribution's registry key", () => {
  const registry = createContributorRegistry<ConfigSectionContribution>("anchor-control", [
    {
      id: "registry-key",
      anchor: "appearance",
      nav: { id: "navigation-key", label: "Example" },
      body: (anchorId) => anchorId,
    },
  ]);
  const target = resolveConfigSectionAnchor(registry, "appearance", "navigation-key", MEMBER);
  expect(target).toBe("config-anchor-appearance-navigation-key");
  expect(resolveConfigSections(registry, "appearance", MEMBER).primary[0]?.node).toBe(target);
  expect(resolveConfigSectionAnchor(registry, "appearance", "registry-key", MEMBER)).toBeNull();
  expect(resolveConfigSectionAnchor(registry, "about", "navigation-key", MEMBER)).toBeNull();
  expect(resolveConfigSectionAnchorPrefix(registry, "appearance")).toBe("config-anchor-appearance-");
  expect(resolveConfigSectionAnchorPrefix(registry, "about")).toBeNull();
});

test("viewer-hidden and missing addresses are unavailable rather than synthesized from valid strings", () => {
  const registry = createContributorRegistry<ConfigSectionContribution>("viewer-control", [
    {
      id: "gated",
      anchor: "admin",
      nav: { id: "restricted", label: "Restricted" },
      when: (viewer) => viewer.isAdmin,
      body: (anchorId) => anchorId,
    },
  ]);
  expect(resolveConfigSectionAnchor(registry, "admin", "restricted", MEMBER)).toBeNull();
  expect(resolveConfigSections(registry, "admin", MEMBER)).toEqual({ primary: [], advanced: [] });
  expect(resolveConfigSectionAnchor(registry, "admin", "missing", ADMIN)).toBeNull();
  expect(resolveConfigSections(registry, "admin", ADMIN).primary[0]?.node).toBe(resolveConfigSectionAnchor(registry, "admin", "restricted", ADMIN));
  const empty = createContributorRegistry<ConfigSectionContribution>("empty-control", []);
  expect(resolveConfigSectionAnchor(empty, "admin", "restricted", ADMIN)).toBeNull();
  expect(resolveConfigSectionAnchorPrefix(empty, "admin")).toBeNull();
});

test("anchor injection preserves the shared primary/advanced order and does not render the nav projection", () => {
  const rendered: string[] = [];
  const entries: readonly ConfigSectionContribution[] = [
    {
      id: "advanced",
      anchor: "appearance",
      advanced: true,
      nav: { id: "advanced", label: "Advanced" },
      body: (id) => {
        rendered.push(id);
        return id;
      },
    },
    {
      id: "primary",
      anchor: "appearance",
      nav: { id: "primary", label: "Primary" },
      body: (id) => {
        rendered.push(id);
        return id;
      },
    },
  ];
  const registry = createContributorRegistry("order-control", entries);
  const nav = configSectionNavParts(registry, "appearance", MEMBER);
  expect(rendered).toEqual([]);
  const nodes = resolveConfigSections(registry, "appearance", MEMBER);
  expect(nodes.primary.map((item) => item.nav)).toEqual(nav.primary);
  expect(nodes.advanced.map((item) => item.nav)).toEqual(nav.advanced);
  expect(rendered).toEqual(["config-anchor-appearance-primary", "config-anchor-appearance-advanced"]);
});
