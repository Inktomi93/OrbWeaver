// Reconciles the executable Appearance manifest with what types cannot prove: the Zod leaves it must cover,
// each editor owner's tuple binding, the armed rows' observables, and the named live consumers. A missing key,
// an owner that does not list its key, an empty carrier list and a carrier/portal mismatch are compile errors
// in the manifest itself.
import { join } from "node:path";
import { appearanceSettingsSchema } from "@orb/contracts/settings";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { Project, SyntaxKind } from "ts-morph";
import {
  APPEARANCE_CARRIER_MANIFEST,
  APPEARANCE_CARRIER_OBSERVABLES,
  APPEARANCE_CARRIER_PLANES,
  APPEARANCE_EDITOR_OWNERS,
  APPEARANCE_OWNER_KEYS,
  appearanceCarrierRowsFor,
} from "#client/lib/appearance-carrier-manifest.ts";

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");
const MANIFEST_ROWS = Object.entries(APPEARANCE_CARRIER_MANIFEST);
// The two axes the first frame replays before React mounts; density is seeded into React's first commit instead.
const PREPAINT_KEYS = ["fontScale", "reducedMotion"];

/** Each editor model exports its key tuple as a view of `APPEARANCE_OWNER_KEYS`, never a second hand list. */
const EDITOR_TUPLES = {
  sizing: ["packages/client/src/features/app-shell/lib/appearance-sizing-model.ts", "APPEARANCE_SIZING_KEYS", ".sizing"],
  effects: ["packages/client/src/features/app-shell/lib/appearance-effects-model.ts", "APPEARANCE_EFFECTS_KEYS", ".effects"],
  background: ["packages/client/src/features/app-shell/lib/appearance-background-model.ts", "APPEARANCE_BACKGROUND_KEYS", ".background"],
  reading: ["packages/client/src/features/app-shell/lib/appearance-reading-model.ts", "APPEARANCE_READING_KEYS", ".reading"],
  avatars: ["packages/client/src/features/chat/lib/appearance-avatars-model.ts", "APPEARANCE_AVATARS_KEYS", ".avatars"],
  "message-style": ["packages/client/src/features/chat/lib/appearance-message-style-model.ts", "APPEARANCE_MESSAGE_STYLE_KEYS", '["message-style"]'],
  "message-details": ["packages/client/src/features/chat/lib/appearance-message-details-model.ts", "APPEARANCE_MESSAGE_DETAILS_KEYS", '["message-details"]'],
} as const satisfies Readonly<Record<(typeof APPEARANCE_EDITOR_OWNERS)[number], readonly [string, string, string]>>;

const BOOT_STAMP = ["packages/client/src/compose/stamp-appearance-boot-hint.ts", "stampAppearanceBootHint"] as const;
const PENDING_ARM = ["packages/client/src/features/app-shell/hooks/use-appearance.ts", "useAppearance"] as const;

const project = new Project({ skipAddingFilesFromTsConfig: true, skipFileDependencyResolution: true });

/** Parse-only read of one function declaration: the identifiers authored directly in its own body. */
function functionIdentifiers(file: string, name: string): ReadonlySet<string> | undefined {
  const declaration = project
    .addSourceFileAtPath(join(REPO_ROOT, file))
    .getFunctions()
    .find((candidate) => candidate.getName() === name);
  if (declaration === undefined) {
    return undefined;
  }
  return new Set(
    declaration
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .filter((identifier) => identifier.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration) === declaration)
      .map((identifier) => identifier.getText()),
  );
}

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

test("each editor model binds its key tuple to the owner list", () => {
  for (const [owner, [file, symbol, suffix]] of Object.entries(EDITOR_TUPLES)) {
    const initializer = project.addSourceFileAtPath(join(REPO_ROOT, file)).getVariableDeclaration(symbol)?.getInitializer()?.getText() ?? "";
    expect(initializer.includes("APPEARANCE_OWNER_KEYS") && initializer.endsWith(suffix), `${symbol} is not bound to APPEARANCE_OWNER_KEYS.${owner}`).toBe(
      true,
    );
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
    expect(appearanceCarrierRowsFor(plane).length, `carrier plane ${plane} reached zero appearance keys`).toBeGreaterThan(0);
  }
});

test("only fontScale and reducedMotion are prepaint; density is hydrated from the prepaint hint", () => {
  const prepaint = MANIFEST_ROWS.filter(([, row]) => row.lifecycle === "prepaint-and-hydrated").map(([key]) => key);
  expect(prepaint.toSorted()).toEqual(PREPAINT_KEYS);
  expect(APPEARANCE_CARRIER_MANIFEST.density.lifecycle).toBe("hydrated-from-prepaint-hint");
});

test("the boot stamp and the pending React arm carry the prepaint axes, and only the pending arm carries density", () => {
  const stamp = functionIdentifiers(...BOOT_STAMP);
  const pending = functionIdentifiers(...PENDING_ARM);
  expect(stamp, `${BOOT_STAMP[1]} is not a function declaration in ${BOOT_STAMP[0]}`).toBeDefined();
  expect(pending, `${PENDING_ARM[1]} is not a function declaration in ${PENDING_ARM[0]}`).toBeDefined();
  for (const key of PREPAINT_KEYS) {
    expect(stamp?.has(key) === true && pending?.has(key) === true, `prepaint/hydrated parity is missing ${key}`).toBe(true);
  }
  expect(stamp?.has("density"), "density was faked onto prepaint").toBe(false);
  expect(pending?.has("density"), "density was dropped from the pending React carrier").toBe(true);
});

test("every row's named live consumer exists and binds the row's key", () => {
  for (const [key, row] of MANIFEST_ROWS) {
    const identifiers = functionIdentifiers(row.consumer.file, row.consumer.symbol);
    expect(identifiers, `live consumer ${row.consumer.file}#${row.consumer.symbol} for ${key} does not exist`).toBeDefined();
    expect(identifiers?.has(key), `live consumer ${row.consumer.file}#${row.consumer.symbol} does not bind ${key}`).toBe(true);
  }
});
