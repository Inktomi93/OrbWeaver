// `configAnchorId` + the group-body narrowings (state/config-group-registry.ts) — the DOM anchor-id
// derivation every config section shares (the LIST's scroll-spy prefix and the deep-link jump read the same
// function), and the `collection` narrowing the host's welcome, mobile teaching, context routing and
// selection title all read (config-revamp-design.md §3.1 / §6.8).

import type { ConfigGroupDefinition } from "@orb/client/state";
import { configAnchorId, isCollectionGroup, isPushingGroup } from "@orb/client/state";
import { Settings } from "@orb/ui/icons";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

describe("configAnchorId", () => {
  test("stamps config-anchor-<category>-<sub>", () => {
    expect(configAnchorId("personas", "personas")).toBe("config-anchor-personas-personas");
    expect(configAnchorId("workloads", "jobs")).toBe("config-anchor-workloads-jobs");
  });

  test("distinct categories with the same subcategory id never collide", () => {
    expect(configAnchorId("admin", "compute")).not.toBe(configAnchorId("workloads", "compute"));
  });
});

/** A skimmer and a collection group, structurally — the two body arms the narrowings tell apart. */
const skimmer: ConfigGroupDefinition = { id: "appearance", shelf: "user", label: "Appearance", icon: Settings, description: "d", body: { kind: "sections" } };
const library: ConfigGroupDefinition = {
  id: "tags",
  shelf: "collections",
  label: "Tags",
  icon: Settings,
  description: "d",
  body: {
    kind: "collection",
    collection: {
      emptyText: "No tags yet.",
      list: () => null,
      detail: () => null,
      context: { kind: "none", title: "t", description: "d" },
      create: { label: "New tag", useRun: () => () => undefined },
    },
  },
};
const planned: ConfigGroupDefinition = { id: "automation", shelf: "app", label: "Automation", icon: Settings, description: "d", body: { placeholder: true } };

describe("isCollectionGroup / isPushingGroup", () => {
  test("a `collection` body is the ONE non-pushing arm; skimmers and placeholders push CONTENT", () => {
    expect(isCollectionGroup(library)).toBe(true);
    expect(isPushingGroup(library)).toBe(false);
    expect(isCollectionGroup(skimmer)).toBe(false);
    expect(isPushingGroup(skimmer)).toBe(true);
    expect(isCollectionGroup(planned)).toBe(false);
    expect(isPushingGroup(planned)).toBe(true);
  });
});
