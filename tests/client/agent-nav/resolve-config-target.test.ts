// Unit: `resolveConfigTarget` (agent-nav/resolve-config-target.ts) — #1638's registry-backed validation of
// an `openConfig` `sub`/`setting` address. Pure over a fixture registry (no store, no bridge); the wiring
// through the real `__orb.nav.openConfig` handle is `tests/client/agent-nav/index.test.ts`.

import { resolveConfigTarget } from "@orb/client/agent-nav";
import { createContributorRegistry } from "@orb/client/lib";
import type { ConfigGroupId, ConfigSectionContribution } from "@orb/client/state";
import { expect, test } from "../../support/fixtures.ts";

const GROUP = "appearance" as ConfigGroupId;
const OTHER_GROUP = "chat-behavior" as ConfigGroupId;

const SIZING_SECTION: ConfigSectionContribution = {
  id: "appearance-sizing",
  anchor: GROUP,
  nav: {
    id: "sizing",
    label: "Sizing",
    settings: [{ id: "chat-width", label: "Chat width", teach: { none: "test fixture" } }],
  },
  body: () => null,
};
const AVATARS_SECTION: ConfigSectionContribution = {
  id: "appearance-avatars",
  anchor: GROUP,
  // No `settings` at all — the leaf-less arm.
  nav: { id: "avatars", label: "Avatars" },
  body: () => null,
};

const registry = createContributorRegistry<ConfigSectionContribution>("test-config-sections", [SIZING_SECTION, AVATARS_SECTION]);

test("resolveConfigTarget: no sub always resolves — a group-only address needs no lookup", () => {
  expect(resolveConfigTarget(GROUP, undefined, undefined, registry)).toEqual({ ok: true });
});

test("resolveConfigTarget: a real sub with no setting resolves", () => {
  expect(resolveConfigTarget(GROUP, "sizing", undefined, registry)).toEqual({ ok: true });
});

test("resolveConfigTarget: a real sub + a real setting resolves", () => {
  expect(resolveConfigTarget(GROUP, "sizing", "chat-width", registry)).toEqual({ ok: true });
});

test("resolveConfigTarget: an unknown sub refuses loudly, naming the group's real sections", () => {
  const result = resolveConfigTarget(GROUP, "bogus-sub", undefined, registry);
  expect(result.ok).toBe(false);
  expect(result.ok ? "" : result.reason).toContain("bogus-sub");
  expect(result.ok ? "" : result.reason).toContain("sizing");
  expect(result.ok ? "" : result.reason).toContain("avatars");
});

test("resolveConfigTarget: an unknown setting on a real sub refuses, naming the sub's real leaves", () => {
  const result = resolveConfigTarget(GROUP, "sizing", "bogus-setting", registry);
  expect(result.ok).toBe(false);
  expect(result.ok ? "" : result.reason).toContain("bogus-setting");
  expect(result.ok ? "" : result.reason).toContain("chat-width");
});

test("resolveConfigTarget: a setting on a sub that declares NO settings refuses, saying so", () => {
  const result = resolveConfigTarget(GROUP, "avatars", "bogus-setting", registry);
  expect(result.ok).toBe(false);
  expect(result.ok ? "" : result.reason).toContain("declares no settings");
});

test("resolveConfigTarget: a group with no sections at all refuses, saying so", () => {
  const result = resolveConfigTarget(OTHER_GROUP, "anything", undefined, registry);
  expect(result.ok).toBe(false);
  expect(result.ok ? "" : result.reason).toContain("no sections");
});
