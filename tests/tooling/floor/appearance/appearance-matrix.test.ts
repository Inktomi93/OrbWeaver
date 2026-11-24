import { ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/tooling";
import { appearanceMatrixContract } from "#client/lib/appearance-carrier-manifest.ts";
import type { RuntimeAppearanceContract } from "../../../../tooling/src/floor/appearance/appearance-matrix.ts";
import { appearancePatchForAssignment, appearanceReachReceipt, deriveAppearanceContract } from "../../../../tooling/src/floor/appearance/appearance-matrix.ts";

function avatarSizeRow(): RuntimeAppearanceContract["rows"][number] {
  const row = appearanceMatrixContract().rows.find((candidate) => candidate.key === "avatarSize");
  if (row === undefined) {
    throw new Error("the Appearance manifest no longer declares avatarSize");
  }
  return { ...row, reached: 1, samples: ["sm"] };
}

function runtimeContract(overrides: Partial<RuntimeAppearanceContract> = {}): RuntimeAppearanceContract {
  return {
    declared: 1,
    dependencies: 0,
    executable: 1,
    historicalRows: [],
    messageRegistry: { mounted: 1, registered: 1, matched: 1, missingIds: [], staleIds: [] },
    rows: [avatarSizeRow()],
    themeObservables: {},
    ...overrides,
  };
}

// A bundle that reports a population other than the checked-in manifest's, with its own counts kept consistent.
function reportedWithRows(rows: RuntimeAppearanceContract["rows"]): RuntimeAppearanceContract {
  const executable = rows.filter((row) => row.arms !== null).length;
  return { ...appearanceMatrixContract(), declared: rows.length, executable, dependencies: rows.length - executable, rows };
}

test("the Appearance population check follows the manifest: the manifest passes, a lost or foreign row and a lost historical row refuse", () => {
  const manifest = appearanceMatrixContract();
  const derived = deriveAppearanceContract(manifest);
  expect(derived.axes).toHaveLength(manifest.executable);
  expect(derived.dependencies).toHaveLength(manifest.dependencies);

  const [first, ...rest] = manifest.rows;
  if (first === undefined) {
    throw new Error("the Appearance manifest declares no rows");
  }
  expect(() => deriveAppearanceContract(reportedWithRows(rest))).toThrow("Appearance contract population drift");
  // A renamed row keeps every count, so only the key comparison sees it.
  expect(() => deriveAppearanceContract(reportedWithRows([{ ...first, key: "notInTheManifest" }, ...rest]))).toThrow("Appearance contract population drift");
  expect(() => deriveAppearanceContract({ ...manifest, historicalRows: manifest.historicalRows.slice(1) })).toThrow("historical-row population drift");
});

test("Appearance reach reconciles mounted registry instances and actual samples", () => {
  expect(appearanceReachReceipt(runtimeContract())).toEqual({ rows: 1, subjects: 1 });
});

test("Appearance reach refuses stale and unregistered messages and a row whose samples are short, undefined or omitted", ({ ids }) => {
  const messageId = ids.typeId(ID_PREFIX.message);
  expect(() =>
    appearanceReachReceipt(runtimeContract({ messageRegistry: { mounted: 0, registered: 1, matched: 0, missingIds: [], staleIds: [messageId] } })),
  ).toThrow(`stale=${messageId}`);
  expect(() =>
    appearanceReachReceipt(runtimeContract({ messageRegistry: { mounted: 1, registered: 0, matched: 0, missingIds: [messageId], staleIds: [] } })),
  ).toThrow(`missing=${messageId}`);
  const baseRow = runtimeContract().rows[0];
  if (baseRow === undefined) {
    throw new Error("appearance reach fixture lost its subject row");
  }
  expect(() => appearanceReachReceipt(runtimeContract({ rows: [{ ...baseRow, samples: [] }] }))).toThrow("samples do not reconcile");
  expect(() => appearanceReachReceipt(runtimeContract({ rows: [{ ...baseRow, samples: [undefined] }] }))).toThrow("samples do not reconcile");
  const { samples: _omitted, ...rowWithoutSamples } = baseRow;
  expect(() => appearanceReachReceipt(runtimeContract({ rows: [rowWithoutSamples] }))).toThrow("samples do not reconcile");
});

test("seeded background arm receives a real catalog id without promoting its dependency to an axis", ({ ids }) => {
  const axes = [
    {
      id: "appearance.backgroundImageKind",
      values: [
        { id: '"none"', payload: "none" },
        { id: '"asset"', payload: "asset" },
      ],
    },
  ];

  // The LIVE background capability — one entry of the authenticated account's own `backgroundLibrary`. The
  // `asset` arm cannot be completed from a constant the way the retired `seeded` catalog slug could, which
  // is why the projection takes it as an argument instead of reading a static list.
  const background = { assetId: ids.typeId(ID_PREFIX.asset), assetHash: "hash_matrix", mime: "image/jpeg" };

  expect(appearancePatchForAssignment(axes, { "appearance.backgroundImageKind": '"asset"' }, background)).toMatchObject({
    backgroundImageKind: "asset",
    backgroundAssetId: background.assetId,
    backgroundAssetHash: "hash_matrix",
    backgroundAssetMime: "image/jpeg",
  });
  expect(appearancePatchForAssignment(axes, { "appearance.backgroundImageKind": '"none"' }, background)).toEqual({ backgroundImageKind: "none" });
  // THE PLANTED NEGATIVE CONTROL. An account with no background asset must make the arm REFUSE loudly — a
  // silent fall-through would have the plan claim `asset` while the cell rendered the `none` arm, and
  // `data-has-bg-image` would read false against a receipt that says otherwise.
  expect(() => appearancePatchForAssignment(axes, { "appearance.backgroundImageKind": '"asset"' }, null)).toThrow("INSTRUMENT ERROR");
});
