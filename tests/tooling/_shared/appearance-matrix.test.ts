import type { RuntimeAppearanceContract } from "../../../tooling/src/_shared/appearance-matrix.ts";
import { appearancePatchForAssignment, appearanceReachReceipt } from "../../../tooling/src/_shared/appearance-matrix.ts";
import { expect, test } from "../../support/tool-fixtures.ts";

function runtimeContract(overrides: Partial<RuntimeAppearanceContract> = {}): RuntimeAppearanceContract {
  return {
    declared: 1,
    dependencies: 0,
    executable: 1,
    historicalRows: [],
    messageRegistry: { mounted: 1, registered: 1, matched: 1, missingIds: [], staleIds: [] },
    rows: [
      {
        arms: ["sm", "lg"],
        dependsOn: [],
        incompatibleWith: [],
        key: "avatarSize",
        observable: { kind: "message-prop", selector: '[data-slot="message-row"]', signal: "avatarSize" },
        reached: 1,
        samples: ["sm"],
      },
    ],
    themeObservables: {},
    ...overrides,
  };
}

test("Appearance reach reconciles mounted registry instances and actual samples", () => {
  expect(appearanceReachReceipt(runtimeContract())).toEqual({ rows: 1, subjects: 1 });
});

test("Appearance reach refuses stale, unregistered, and same-count sample substitution plants", () => {
  expect(() =>
    appearanceReachReceipt(runtimeContract({ messageRegistry: { mounted: 0, registered: 1, matched: 0, missingIds: [], staleIds: ["message-a"] } })),
  ).toThrow("stale=message-a");
  expect(() =>
    appearanceReachReceipt(runtimeContract({ messageRegistry: { mounted: 1, registered: 0, matched: 0, missingIds: ["message-a"], staleIds: [] } })),
  ).toThrow("missing=message-a");
  const baseRow = runtimeContract().rows[0];
  if (baseRow === undefined) {
    throw new Error("appearance reach fixture lost its subject row");
  }
  expect(() => appearanceReachReceipt(runtimeContract({ rows: [{ ...baseRow, samples: [] }] }))).toThrow("samples do not reconcile");
});

test("seeded background arm receives a real catalog id without promoting its dependency to an axis", () => {
  const axes = [
    {
      id: "appearance.backgroundImageKind",
      values: [
        { id: '"none"', payload: "none" },
        { id: '"seeded"', payload: "seeded" },
      ],
    },
  ];

  expect(appearancePatchForAssignment(axes, { "appearance.backgroundImageKind": '"seeded"' })).toMatchObject({
    backgroundImageKind: "seeded",
    backgroundSeededId: expect.any(String),
  });
  expect(appearancePatchForAssignment(axes, { "appearance.backgroundImageKind": '"none"' })).toEqual({ backgroundImageKind: "none" });
});
