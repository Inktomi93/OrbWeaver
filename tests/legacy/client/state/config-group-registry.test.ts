// Config group body-arm predicates remain public; DOM anchor formatting belongs to its private render owner.

import type { ConfigGroupDefinition } from "@orb/client/state";
import { isCollectionGroup, rendersOwnBody } from "@orb/client/state";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { Settings } from "@orb/ui/icons";
import { describe } from "vitest";

/** A skimmer and a collection group, structurally — the two body arms the narrowings tell apart. */
const skimmer: ConfigGroupDefinition = { id: "appearance", shelf: "user", label: "Appearance", icon: Settings, description: "d", body: { kind: "sections" } };
const library: ConfigGroupDefinition = {
  id: "regex",
  shelf: "collections",
  label: "Regex scripts",
  icon: Settings,
  description: "d",
  body: {
    kind: "collection",
    // The LIVE contract's required arms, structurally (list · detail · context · create · emptyText ·
    // useMemberTitle — required since #1219, because the host's call must not be conditional).
    collection: {
      emptyText: "none yet",
      list: () => null,
      detail: () => null,
      context: { kind: "none", title: "Nothing to attach", description: "d" },
      create: { label: "New tag", useRun: () => () => undefined },
      useMemberTitle: () => undefined,
    },
  },
};
const planned: ConfigGroupDefinition = { id: "automation", shelf: "app", label: "Automation", icon: Settings, description: "d", body: { placeholder: true } };

// `isPushingGroup` SPLIT into `rendersOwnBody` at #1725 (owner ruling 2026-09-05 — a collection's members
// moved into CONTENT). The predicate's SUBJECT is unchanged and so is every value below: it is the CONTENT
// router's question ("has `GroupBody` anything to draw"), which is the half that did NOT move. The half that
// did — "does activating this take over a phone" — is no longer a predicate at all, because after the ruling
// every arm answers yes; `config-section.tsx`'s selection seam asks `getActiveConfigGroup() !== null`
// instead, and that is asserted where the back-stack is, not here.
describe("isCollectionGroup / rendersOwnBody", () => {
  test("a `collection` body is the ONE arm with no body of its own; skimmers and placeholders draw one", () => {
    expect(isCollectionGroup(library)).toBe(true);
    expect(rendersOwnBody(library)).toBe(false);
    expect(isCollectionGroup(skimmer)).toBe(false);
    expect(rendersOwnBody(skimmer)).toBe(true);
    expect(isCollectionGroup(planned)).toBe(false);
    expect(rendersOwnBody(planned)).toBe(true);
  });
});
