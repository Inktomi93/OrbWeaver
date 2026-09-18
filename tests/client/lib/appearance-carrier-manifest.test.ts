// The non-rendered half of #935: exact schema/owner equality is enforced by the structural gate; these
// assertions keep the executable manifest's populations and pair generator honest for focused CT/Snap use.

import { appearanceSettingsSchema } from "@orb/contracts/settings";
import { describe } from "vitest";
import {
  APPEARANCE_CARRIER_MANIFEST,
  APPEARANCE_CARRIER_OBSERVABLES,
  APPEARANCE_CARRIER_PLANES,
  APPEARANCE_EDITOR_OWNERS,
  APPEARANCE_OWNER_KEYS,
  appearanceCarrierRowsFor,
  appearanceMatrixContract,
  THEME_CARRIER_OBSERVABLES,
} from "../../../packages/client/src/lib/appearance-carrier-manifest.ts";
import { expect, test } from "../../support/fixtures.ts";
import type { AppearanceCarrierSnapshot } from "./appearance-carrier-matrix.ts";
import { appearanceSettingsForCarrierArm, compareAppearanceCarrierArms } from "./appearance-carrier-matrix.ts";

describe("Appearance carrier manifest", () => {
  // 41 → 40 and background 9 → 8 on 2026-09-18: `backgroundSeededId` left `AppearanceSettings` with the
  // retired `kind:"seeded"` source. The counts are the PARTITION's receipt, not a target — what they assert
  // is that the owner lists and the manifest keys stay the same set.
  test("declares 40 unique keys across seven non-empty editor owners", () => {
    const keys = Object.keys(APPEARANCE_CARRIER_MANIFEST);
    const owned = APPEARANCE_EDITOR_OWNERS.flatMap((owner) => [...APPEARANCE_OWNER_KEYS[owner]]);

    expect(keys).toHaveLength(40);
    expect(new Set(keys).size).toBe(40);
    expect(new Set(owned)).toEqual(new Set(keys));
    expect(APPEARANCE_EDITOR_OWNERS.map((owner) => APPEARANCE_OWNER_KEYS[owner].length)).toEqual([5, 5, 8, 6, 5, 3, 8]);
  });

  test("every real carrier plane has a nonzero generated family", () => {
    const populations = Object.fromEntries(APPEARANCE_CARRIER_PLANES.map((plane) => [plane, appearanceCarrierRowsFor(plane).length]));

    expect(populations).toEqual({
      "root-html": 13,
      "theme-scope": 1,
      "shell-grid": 2,
      "background-layer": 7,
      "message-props": 16,
      "source-catalog": 1,
    });
  });

  test("every declared two-arm row has one executable browser observable", () => {
    const rows = Object.entries(APPEARANCE_CARRIER_MANIFEST);
    const armed = rows.filter(([, row]) => "requiredDistinctArms" in row).map(([key]) => key);
    expect(new Set(Object.keys(APPEARANCE_CARRIER_OBSERVABLES))).toEqual(new Set(armed));
    expect(armed).toHaveLength(36);
    expect(APPEARANCE_CARRIER_MANIFEST.backgroundAssetHash.dependsOn).toContain("backgroundImageKind");
    expect(APPEARANCE_CARRIER_MANIFEST.backgroundLibrary.carriers).toEqual(["source-catalog"]);
  });

  test("the generated executor applies schema-valid values on both arms", () => {
    const armA = appearanceSettingsForCarrierArm(0);
    const armB = appearanceSettingsForCarrierArm(1);
    // `asset` is the painted arm since `kind:"seeded"` retired — the executor completes its three dependent
    // carriers from the library, which is what the arm needs and a slug no longer supplies.
    expect(armA.backgroundImageKind).toBe("asset");
    expect(armB.backgroundImageKind).toBe("asset");
    expect(appearanceSettingsSchema.safeParse(armA).success).toBe(true);
    expect(appearanceSettingsSchema.safeParse(armB).success).toBe(true);
    expect(armA).not.toEqual(armB);
  });

  test("the matrix fails loud for a missing observation on either arm and for equal rendered outcomes", () => {
    const keys = Object.keys(APPEARANCE_CARRIER_OBSERVABLES) as (keyof AppearanceCarrierSnapshot)[];
    const armA: Partial<AppearanceCarrierSnapshot> = Object.fromEntries(keys.map((key) => [key, `a:${key}`]));
    const armB: Partial<AppearanceCarrierSnapshot> = Object.fromEntries(keys.map((key) => [key, `b:${key}`]));
    expect(compareAppearanceCarrierArms(armA, armB)).toEqual({ compared: 36, expected: 36, findings: [] });

    const missingA = { ...armA };
    const missingB = { ...armB };
    const first = keys[0];
    if (first === undefined) {
      throw new Error("appearance carrier observable population reached zero");
    }
    delete missingA[first];
    delete missingB[first];
    expect(compareAppearanceCarrierArms(missingA, armB).findings).toEqual([`${first}: missing arm A observation`]);
    expect(compareAppearanceCarrierArms(armA, missingB).findings).toEqual([`${first}: missing arm B observation`]);
    expect(compareAppearanceCarrierArms(armA, { ...armB, [first]: armA[first] }).findings).toEqual([
      `${first}: both arms resolved to ${JSON.stringify(armA[first])}`,
    ]);
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

  test("serializes the one live matrix contract without a second hand-maintained appearance roster", () => {
    const contract = appearanceMatrixContract();

    expect(contract.declared).toBe(40);
    // Unchanged: the key that left was a DEPENDENCY row (no arms), so only declared + dependencies move.
    expect(contract.executable).toBe(36);
    expect(contract.dependencies).toBe(4);
    expect(contract.rows.map((row) => row.key)).toEqual(Object.keys(APPEARANCE_CARRIER_MANIFEST));
    expect(contract.rows.filter((row) => row.arms !== null)).toHaveLength(36);
    expect(contract.rows.find((row) => row.key === "density")).toMatchObject({
      arms: ["comfortable", "compact"],
      observable: APPEARANCE_CARRIER_OBSERVABLES.density,
      portal: "shared-theme-scope-sibling",
    });
    expect(contract.rows.find((row) => row.key === "backgroundAssetHash")).toMatchObject({
      arms: null,
      observable: null,
      dependsOn: ["backgroundImageKind"],
    });
    expect(contract.themeObservables).toEqual(THEME_CARRIER_OBSERVABLES);
    expect(contract.historicalRows.map((row) => row.id)).toEqual([
      "compact-portal-carried",
      "dark-name-time-short-bubble",
      "light-art-scrim-glass-elevation",
      "mobile-compact-large-document",
      "hover-pointer",
      "density-preview",
      "opposite-os-app-prepaint",
    ]);
    expect(
      contract.rows.filter((row) => row.observable?.kind === "message-prop").every((row) => row.observable?.selector === '[data-slot="message-row"]'),
    ).toBe(true);
    const compactPortal = contract.historicalRows.find((row) => row.id === "compact-portal-carried");
    expect(compactPortal?.cascade.filter((query) => query.property.startsWith("--spacing-")).every((query) => query.sources.includes("client-global"))).toBe(
      true,
    );
    expect(compactPortal?.cascade.find((query) => query.property === "--color-background")?.sources).not.toContain("client-global");
    expect(compactPortal?.subjects.find((subject) => subject.id === "carried-scope")?.population).toBe("many");
    expect(compactPortal?.merge).toMatchObject({ mechanism: "merge-not-applicable", reason: "direct-carrier" });
    const shortHeader = contract.historicalRows.find((row) => row.id === "dark-name-time-short-bubble");
    expect(shortHeader?.cascade.map((query) => query.property)).not.toContain("background-color");
    expect(shortHeader?.cascade.filter((query) => query.property === "color")).toHaveLength(2);
  });

  test("relates message header subjects to the row instead of falsely nesting them inside the bubble", () => {
    const rows = appearanceMatrixContract().historicalRows;
    for (const id of ["dark-name-time-short-bubble", "hover-pointer"] as const) {
      const row = rows.find((candidate) => candidate.id === id);
      const bubble = row?.subjects.find((subject) => subject.id === "bubble")?.selector;
      const headerSubjects = row?.subjects.filter((subject) => ["name-row", "attribution", "timestamp", "actions-slot"].includes(subject.id)) ?? [];

      expect(bubble).toContain('[data-slot="message-bubble"]');
      expect(headerSubjects.length).toBeGreaterThan(0);
      expect(headerSubjects.every((subject) => !subject.selector.includes('[data-slot="message-bubble"]'))).toBe(true);
    }
  });
});
