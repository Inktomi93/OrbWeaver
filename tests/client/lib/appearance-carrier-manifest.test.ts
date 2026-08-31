// The non-rendered half of #935: exact schema/owner equality is enforced by the structural gate; these
// assertions keep the executable manifest's populations and pair generator honest for focused CT/Snap use.

import { describe } from "vitest";
import {
  APPEARANCE_CARRIER_MANIFEST,
  APPEARANCE_CARRIER_PLANES,
  APPEARANCE_EDITOR_OWNERS,
  APPEARANCE_OWNER_KEYS,
  appearanceCarrierRowsFor,
  THEME_CARRIER_OBSERVABLES,
} from "../../../packages/client/src/lib/appearance-carrier-manifest.ts";
import { expect, test } from "../../support/fixtures.ts";

describe("Appearance carrier manifest", () => {
  test("declares 41 unique keys across seven non-empty editor owners", () => {
    const keys = Object.keys(APPEARANCE_CARRIER_MANIFEST);
    const owned = APPEARANCE_EDITOR_OWNERS.flatMap((owner) => [...APPEARANCE_OWNER_KEYS[owner]]);

    expect(keys).toHaveLength(41);
    expect(new Set(keys).size).toBe(41);
    expect(new Set(owned)).toEqual(new Set(keys));
    expect(APPEARANCE_EDITOR_OWNERS.map((owner) => APPEARANCE_OWNER_KEYS[owner].length)).toEqual([5, 5, 9, 6, 5, 3, 8]);
  });

  test("every real carrier plane has a nonzero generated family", () => {
    const populations = Object.fromEntries(APPEARANCE_CARRIER_PLANES.map((plane) => [plane, appearanceCarrierRowsFor(plane).length]));

    expect(populations).toEqual({
      "root-html": 13,
      "theme-scope": 1,
      "shell-grid": 2,
      "background-layer": 8,
      "message-props": 16,
      "source-catalog": 1,
    });
  });

  test("declared distinct arms are actually different and dependent source fields stay explicit", () => {
    const rows = Object.entries(APPEARANCE_CARRIER_MANIFEST);
    let armed = 0;
    for (const [key, row] of rows) {
      if (!("requiredDistinctArms" in row)) {
        continue;
      }
      armed += 1;
      const [first, second] = row.requiredDistinctArms;
      expect(first, `${key} first arm`).not.toEqual(second);
    }
    expect(armed).toBe(36);
    expect(APPEARANCE_CARRIER_MANIFEST.backgroundAssetHash.dependsOn).toContain("backgroundImageKind");
    expect(APPEARANCE_CARRIER_MANIFEST.backgroundLibrary.carriers).toEqual(["source-catalog"]);
  });

  test("first-frame lifecycle is honest: two root stamps and density's React-first hinted arm", () => {
    const prepaint = Object.entries(APPEARANCE_CARRIER_MANIFEST)
      .filter(([, row]) => row.lifecycle === "prepaint-and-hydrated")
      .map(([key]) => key)
      .sort();

    expect(prepaint).toEqual(["fontScale", "reducedMotion"]);
    expect(APPEARANCE_CARRIER_MANIFEST.density.lifecycle).toBe("hydrated-from-prepaint-hint");
    expect(APPEARANCE_CARRIER_MANIFEST.density.portal).toBe("shared-theme-scope-sibling");
  });

  test("theme requests owe rendered palette, polarity, carried-scope, portal, and owner-CSS observables", () => {
    expect(Object.keys(THEME_CARRIER_OBSERVABLES)).toEqual(["seedRoot", "activeScope", "portalRoot", "carriedScope", "ownerCustomCss"]);
    expect(THEME_CARRIER_OBSERVABLES.seedRoot).toMatchObject({ signals: ["data-theme"], lifecycle: "prepaint-and-hydrated" });
    expect(THEME_CARRIER_OBSERVABLES.activeScope.signals).toEqual(["--color-background", "color-scheme"]);
    expect(THEME_CARRIER_OBSERVABLES.portalRoot.signals).toEqual(THEME_CARRIER_OBSERVABLES.activeScope.signals);
    expect(THEME_CARRIER_OBSERVABLES.carriedScope.selector).not.toBe(THEME_CARRIER_OBSERVABLES.activeScope.selector);
    expect(THEME_CARRIER_OBSERVABLES.ownerCustomCss.signals).toEqual(["textContent"]);
  });
});
