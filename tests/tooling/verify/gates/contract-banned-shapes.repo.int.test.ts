import { gate } from "../../../../tooling/src/verify/gates/contract-banned-shapes.ts";
import type { RealCorpusLivenessArm } from "../../../support/real-corpus-liveness.ts";
import { assertArmVerdict, openRealCorpusLiveness } from "../../../support/real-corpus-liveness.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const SETTINGS = "packages/contracts/src/settings/index.ts";
const forbiddenKey = {
  policy: gate,
  overlays: [{ kind: "edit", path: SETTINGS, replace: ["const appSettingsShape = {", "const appSettingsShape = { guidedActions: z.boolean(),"] }],
  messageIncludes: "D33",
} satisfies RealCorpusLivenessArm;
const unreadableShape = {
  policy: gate,
  overlays: [
    {
      kind: "edit",
      path: SETTINGS,
      replace: ["const appSettingsShape = {", "declare function opaqueShape(): Record<string, unknown>;\nconst appSettingsShape = { ...opaqueShape(),"],
    },
  ],
  messageIncludes: "cannot resolve",
} satisfies RealCorpusLivenessArm;

test("the actual settings shape remains readable through output projections, rejects the ledger ban, and fails closed on an opaque spread", ({ repoRoot }) => {
  const runner = openRealCorpusLiveness(repoRoot, [forbiddenKey]);
  expect(runner.assertBaseline()).toEqual([gate.id]);
  const forbidden = assertArmVerdict(forbiddenKey, runner.verdict(forbiddenKey));
  expect(forbidden).toHaveLength(1);
  expect(forbidden[0]).toContain("appSettingsSchema.guidedActions");
  const opaqueVerdict = runner.proveBatch([unreadableShape]).get(gate.id);
  if (opaqueVerdict === undefined) {
    throw new Error("Missing opaque settings shape verdict");
  }
  const unreadable = assertArmVerdict(unreadableShape, opaqueVerdict);
  expect(unreadable).toHaveLength(1);
  expect(unreadable[0]).toContain("shape keys are UNKNOWN");
}, 60_000);
