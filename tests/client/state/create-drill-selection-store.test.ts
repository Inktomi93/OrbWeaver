// The drill-selection factory (create-drill-selection-store): the shared shape behind the five per-section
// selection stores (corpus/analytics/character/preset/world-info). The reactive read hooks need a React
// render (the create-gated-store.test.ts / message-selection-store.test.ts posture — state transitions are
// exercised end-to-end by the five *-selection-store.ct.tsx), so this node lane pins the FACTORY contract:
// the primary-only vs secondary-drill surface, callable actions, and the createGatedStore duplicate-name
// guard propagating through the mint (two stores can never share a devtools connection label).

import { createDrillSelectionStore } from "@orb/client/state";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const DUPLICATE_NAME_RE = /duplicate store name/u;
const PROBE = castId<CharacterId>("char_drillfactory_probe");

describe("createDrillSelectionStore", () => {
  test("a primary-only store exposes the primary drill surface as callable actions", () => {
    const drill = createDrillSelectionStore<CharacterId>("t-drill-primary");
    for (const fn of [drill.usePrimaryId, drill.select, drill.clear, drill.selectFromList]) {
      expect(typeof fn).toBe("function");
    }
    // The actions run without throwing (select drills, clear/selectFromList reset — selectFromList also
    // pokes the shell overlay). The rendered read-back lives in the per-section CTs.
    expect(() => {
      drill.select(PROBE);
      drill.selectFromList(PROBE);
      drill.clear();
    }).not.toThrow();
  });

  test("a secondary-drill store adds the sub-drill + dismiss surface", () => {
    const drill = createDrillSelectionStore<CharacterId, string>("t-drill-secondary", { secondary: true });
    for (const fn of [drill.useSecondaryId, drill.selectSecondary, drill.clearSecondary, drill.dismissSecondary]) {
      expect(typeof fn).toBe("function");
    }
    expect(() => {
      drill.select(PROBE);
      drill.selectSecondary("facet_probe");
      drill.clearSecondary();
      drill.dismissSecondary();
    }).not.toThrow();
  });

  test("a duplicate store name throws at creation (the createGatedStore label guard propagates)", () => {
    createDrillSelectionStore<CharacterId>("t-drill-dupe");
    expect(() => createDrillSelectionStore<CharacterId>("t-drill-dupe")).toThrow(DUPLICATE_NAME_RE);
  });
});
