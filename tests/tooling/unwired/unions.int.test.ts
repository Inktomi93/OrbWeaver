// `pnpm unwired unions` reports a tuple member no production literal builds into its union, with the branches, checks
// and Record keys that name it. A same-text literal in a plain string slot and an enumerated tuple are controls.
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import { scanUnions } from "../../../tooling/src/unwired/index.ts";
import { LIB, WORLD } from "./_planted.ts";

const TREE = {
  [WORLD]: plantedTsconfig({ lib: LIB }),
  "packages/a/src/mode.ts": [
    'export const MODES = ["on", "off", "auto"] as const;',
    "export type Mode = (typeof MODES)[number];",
    "export function level(mode: Mode): number {",
    "  switch (mode) {",
    '    case "on":',
    "      return 1;",
    '    case "auto":',
    "      return 3;",
    "    default:",
    "      return 0;",
    "  }",
    "}",
    'export const LABEL: Record<Mode, string> = { on: "On", off: "Off", auto: "Auto" };',
    'export const isAuto = (mode: Mode): boolean => mode === "auto";',
    "export const isMode = (value: string): boolean => (MODES as readonly string[]).includes(value);",
    "export const log = (line: string): string => line;",
    'export const picked: Mode = "off";',
    'export const levels = [level("on"), log("auto")];',
    'export const SIZES = ["s", "m"] as const;',
    "export const all = SIZES.map((size) => size.toUpperCase());",
  ].join("\n"),
};

test("the unions scan reports an unbuilt member with its dead branch, check and key, and skips an enumerated tuple", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const root = await plantedTree(TREE);
  const report = scanUnions({ root, worlds: [WORLD], testWorlds: [], deliberate: [], log: () => undefined });
  expect(report.unwired.map(({ home, member, cases, checks, keys }) => ({ home, member, cases, checks, keys }))).toEqual([
    {
      home: "MODES",
      member: "auto",
      cases: ["packages/a/src/mode.ts:7"],
      checks: ["packages/a/src/mode.ts:14"],
      keys: ["packages/a/src/mode.ts:13"],
    },
  ]);
  expect(report.enumerated).toEqual(["packages/a/src/mode.ts:SIZES"]);
  expect(report.disagreements).toEqual([]);
});
