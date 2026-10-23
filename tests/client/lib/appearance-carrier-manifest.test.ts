// Reconcile the Appearance manifest with settings leaves, editor ownership and observable carrier arms.
import { appearanceSettingsSchema } from "@orb/contracts/settings";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import {
  APPEARANCE_CARRIER_MANIFEST,
  APPEARANCE_CARRIER_OBSERVABLES,
  APPEARANCE_CARRIER_PLANES,
  APPEARANCE_EDITOR_OWNERS,
  APPEARANCE_OWNER_KEYS,
} from "#client/lib/appearance-carrier-manifest.ts";

const MANIFEST_ROWS = Object.entries(APPEARANCE_CARRIER_MANIFEST);
// The two axes the first frame replays before React mounts; density is seeded into React's first commit instead.
const PREPAINT_KEYS = ["fontScale", "reducedMotion"];

test("the manifest, the editor owners and the settings schema name the same keys, each owned once", () => {
  // The declared shape, not a parsed default: an optional leaf with no default is absent from a parse of `{}`.
  const leaves = Object.keys(appearanceSettingsSchema.unwrap().shape).toSorted();
  expect(leaves.length, "the appearance schema resolved to zero leaves").toBeGreaterThan(0);
  expect(Object.keys(APPEARANCE_CARRIER_MANIFEST).toSorted()).toEqual(leaves);
  expect(APPEARANCE_EDITOR_OWNERS.flatMap((owner) => [...APPEARANCE_OWNER_KEYS[owner]]).toSorted()).toEqual(leaves);
  for (const [key, row] of MANIFEST_ROWS) {
    expect(APPEARANCE_OWNER_KEYS[row.owner] as readonly string[], `${key} names an owner that does not list it`).toContain(key);
  }
});

test("every armed row has exactly one observable and two distinct arms", () => {
  const armed = MANIFEST_ROWS.filter(([, row]) => "requiredDistinctArms" in row);
  expect(Object.keys(APPEARANCE_CARRIER_OBSERVABLES).toSorted()).toEqual(armed.map(([key]) => key).toSorted());
  for (const [key, row] of armed) {
    const arms = "requiredDistinctArms" in row ? row.requiredDistinctArms : undefined;
    expect(arms?.length, `${key} arms are malformed`).toBe(2);
    expect(JSON.stringify(arms?.[0]), `${key} arms are equal`).not.toBe(JSON.stringify(arms?.[1]));
  }
});

test("every carrier plane carries at least one appearance key", () => {
  for (const plane of APPEARANCE_CARRIER_PLANES) {
    expect(
      MANIFEST_ROWS.some(([, row]) => row.carriers.some((carrier) => carrier === plane)),
      `carrier plane ${plane} reached zero appearance keys`,
    ).toBe(true);
  }
});

test("only fontScale and reducedMotion are prepaint; density is hydrated from the prepaint hint", () => {
  const prepaint = MANIFEST_ROWS.filter(([, row]) => row.lifecycle === "prepaint-and-hydrated").map(([key]) => key);
  expect(prepaint.toSorted()).toEqual(PREPAINT_KEYS);
  expect(APPEARANCE_CARRIER_MANIFEST.density.lifecycle).toBe("hydrated-from-prepaint-hint");
});
