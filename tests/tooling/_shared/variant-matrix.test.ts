import type { VariantMatrixSpec } from "@orb/tooling/_shared/variant-matrix";
import { planVariantMatrix, variantArtifactId, variantCellId } from "@orb/tooling/_shared/variant-matrix";
import { expect, test } from "../../support/tool-fixtures.ts";

const AXES = [
  {
    id: "density",
    values: [
      { id: "comfortable", payload: 0 },
      { id: "compact", payload: 1 },
    ],
  },
  {
    id: "surface",
    values: [
      { id: "shell", payload: 0 },
      { id: "portal", payload: 1 },
    ],
  },
  {
    id: "pointer",
    values: [
      { id: "fine", payload: 0 },
      { id: "coarse", payload: 1 },
    ],
  },
] as const;

function spec(overrides: Partial<VariantMatrixSpec> = {}): VariantMatrixSpec {
  return {
    axes: AXES,
    isLegal: () => true,
    requiredRows: [{ id: "compact-portal", assignment: { density: "compact", surface: "portal" } }],
    requiredTwins: [
      {
        id: "pointer-polarity",
        axis: "pointer",
        left: "fine",
        right: "coarse",
        where: { density: "comfortable", surface: "shell" },
      },
    ],
    ...overrides,
  };
}

test("plans a deterministic pairwise matrix while preserving required rows and same-neighbour twins", () => {
  const first = planVariantMatrix(spec());
  const second = planVariantMatrix(spec());

  expect(first).toEqual(second);
  expect(first.receipt.uncoveredPairs).toEqual([]);
  expect(first.receipt.coveredPairs).toEqual(first.receipt.reachablePairs);
  expect(first.cells).toHaveLength(5);
  expect(first.cells).toContainEqual({
    id: "density=comfortable__surface=shell__pointer=fine",
    assignment: { density: "comfortable", surface: "shell", pointer: "fine" },
  });
  expect(first.cells).toContainEqual({
    id: "density=comfortable__surface=shell__pointer=coarse",
    assignment: { density: "comfortable", surface: "shell", pointer: "coarse" },
  });
  expect(first.receipt.requiredRows).toEqual([{ id: "compact-portal", cellId: expect.any(String) }]);
  expect(first.receipt.requiredTwins).toEqual([
    {
      id: "pointer-polarity",
      leftCellId: "density=comfortable__surface=shell__pointer=fine",
      rightCellId: "density=comfortable__surface=shell__pointer=coarse",
    },
  ]);
});

test("derives stable cell identity from every axis so a same-count replacement is observable", () => {
  const original = planVariantMatrix(spec());
  const replacementAxes = [
    AXES[0],
    {
      id: "surface",
      values: [
        { id: "shell", payload: 0 },
        { id: "overlay", payload: 1 },
      ],
    },
    AXES[2],
  ] as const;
  const replacement = planVariantMatrix({
    ...spec(),
    axes: replacementAxes,
    requiredRows: [{ id: "compact-overlay", assignment: { density: "compact", surface: "overlay" } }],
  });

  expect(replacement.cells).toHaveLength(original.cells.length);
  expect(replacement.receipt.cellIds).not.toEqual(original.receipt.cellIds);
  expect(variantCellId(replacementAxes, replacement.cells[0]?.assignment ?? {})).toBe(replacement.cells[0]?.id);
  expect(variantArtifactId(replacement.cells[0]?.id ?? "", 0)).toMatch(/^v01-[a-f0-9]{12}$/u);
  expect(variantArtifactId(replacement.cells[0]?.id ?? "", 0)).not.toBe(variantArtifactId(original.cells[0]?.id ?? "", 0));
});

test("covers only legally reachable pairs and records impossible partial obligations loudly", () => {
  const legal = planVariantMatrix(
    spec({
      isLegal: (assignment) => !(assignment["density"] === "compact" && assignment["pointer"] === "fine"),
      requiredRows: [],
      requiredTwins: [],
    }),
  );

  expect(legal.receipt.reachablePairs).not.toContain("density=compact|pointer=fine");
  expect(legal.receipt.uncoveredPairs).toEqual([]);
  expect(() =>
    planVariantMatrix(
      spec({
        isLegal: (assignment) => !(assignment["density"] === "compact" && assignment["pointer"] === "fine"),
        requiredRows: [{ id: "impossible", assignment: { density: "compact", pointer: "fine" } }],
        requiredTwins: [],
      }),
    ),
  ).toThrow("INSTRUMENT ERROR: required row impossible");
});

test("refuses blind or ambiguous contracts instead of emitting a vacuous matrix", () => {
  expect(() => planVariantMatrix(spec({ axes: [] }))).toThrow("INSTRUMENT ERROR: variant matrix has no axes");
  expect(() => planVariantMatrix(spec({ axes: [{ id: "blind", values: [] }] }))).toThrow("INSTRUMENT ERROR: axis blind has no values");
  expect(() =>
    planVariantMatrix(
      spec({
        axes: [
          { id: "same", values: [{ id: "a", payload: null }] },
          { id: "same", values: [{ id: "b", payload: null }] },
        ],
      }),
    ),
  ).toThrow("INSTRUMENT ERROR: duplicate axis same");
  expect(() =>
    planVariantMatrix(
      spec({
        axes: [
          {
            id: "duplicate",
            values: [
              { id: "x", payload: 1 },
              { id: "x", payload: 2 },
            ],
          },
        ],
      }),
    ),
  ).toThrow("INSTRUMENT ERROR: duplicate value duplicate=x");
});

test("does not expand to the Cartesian product when pairwise coverage needs fewer cells", () => {
  const planned = planVariantMatrix(
    spec({
      axes: [
        ...AXES,
        {
          id: "motion",
          values: [
            { id: "full", payload: 0 },
            { id: "reduced", payload: 1 },
          ],
        },
      ],
      requiredRows: [],
      requiredTwins: [],
    }),
  );

  expect(planned.cells.length).toBeLessThan(16);
  expect(planned.receipt.uncoveredPairs).toEqual([]);
});
