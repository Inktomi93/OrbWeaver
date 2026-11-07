// `pnpm unwired unions` reports a tuple member no production literal builds into its union, with the branches, checks
// and Record keys that name it, and apart a tuple only a z.enum parse or a membership guard builds. A same-text literal
// in a plain string slot and an enumerated tuple are controls.
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
    'export const TARGETS = ["x64", "arm64"] as const;',
    "export const isTarget = (value: string): boolean => (TARGETS as readonly string[]).includes(value);",
    "export const log = (line: string): string => line;",
    'export const picked: Mode = "off";',
    'export const levels = [level("on"), log("auto")];',
    'export const SIZES = ["s", "m"] as const;',
    "export const all = SIZES.map((size) => size.toUpperCase());",
  ].join("\n"),
  // A model's structured output fills this vocabulary through a parse, so no literal builds `warm` or `cold`.
  "packages/a/src/tone.ts": [
    "const z = { enum: <const T extends readonly string[]>(values: T): T => values };",
    'export const TONES = ["warm", "cold"] as const;',
    "export type Tone = (typeof TONES)[number];",
    "export const toneSchema = z.enum(TONES);",
    'export const isWarm = (tone: Tone): boolean => tone === "warm";',
  ].join("\n"),
};

test("the unions scan reports an unbuilt member with its dead branch, check and key, marks a parsed vocabulary apart, and skips an enumerated tuple", {
  timeout: 120_000,
}, async ({ plantedTree }) => {
  const root = await plantedTree(TREE);
  const report = scanUnions({ root, worlds: [WORLD], testWorlds: [], deliberate: [], log: () => undefined });
  expect(report.unwired.map(({ kind, home, member, cases, checks, keys }) => ({ kind, home, member, cases, checks, keys }))).toEqual([
    {
      kind: "unbuilt",
      home: "MODES",
      member: "auto",
      cases: ["packages/a/src/mode.ts:7"],
      checks: ["packages/a/src/mode.ts:14"],
      keys: ["packages/a/src/mode.ts:13"],
    },
    { kind: "parsed", home: "TARGETS", member: "x64", cases: [], checks: [], keys: [] },
    { kind: "parsed", home: "TARGETS", member: "arm64", cases: [], checks: [], keys: [] },
    { kind: "parsed", home: "TONES", member: "warm", cases: [], checks: ["packages/a/src/tone.ts:5"], keys: [] },
    { kind: "parsed", home: "TONES", member: "cold", cases: [], checks: [], keys: [] },
  ]);
  expect(report.enumerated).toEqual(["packages/a/src/mode.ts:SIZES"]);
  expect(report.disagreements).toEqual([]);
});

// Construction evidence belongs to the vocabulary whose slot it lands in. `KINDS_A` and `KINDS_B` share the text
// `shared`; only `KINDS_B`'s slot is ever built with it. The remaining tuples are controls that must clear: a slot
// that unions two vocabularies builds `dual` in both, and a slot derived from one tuple builds its own member.
const SHARED_TREE = {
  [WORLD]: plantedTsconfig({ lib: LIB }),
  "packages/a/src/shared.ts": [
    'export const KINDS_A = ["alpha", "shared"] as const;',
    "export type KindA = (typeof KINDS_A)[number];",
    'export const KINDS_B = ["beta", "shared"] as const;',
    "export type KindB = (typeof KINDS_B)[number];",
    "export const takeA = (kind: KindA): KindA => kind;",
    "export const takeB = (kind: KindB): KindB => kind;",
    'export const builtA = takeA("alpha");',
    'export const builtB = [takeB("beta"), takeB("shared")];',
  ].join("\n"),
  "packages/a/src/dual.ts": [
    'export const KINDS_P = ["p", "dual"] as const;',
    'export const KINDS_Q = ["q", "dual"] as const;',
    "type Either = (typeof KINDS_P)[number] | (typeof KINDS_Q)[number];",
    "export const takeEither = (kind: Either): Either => kind;",
    'export const builtDual = [takeEither("dual"), takeEither("p"), takeEither("q")];',
  ].join("\n"),
  "packages/a/src/narrow.ts": [
    'export const KINDS_R = ["r", "narrow", "other"] as const;',
    "type Narrow = Exclude<(typeof KINDS_R)[number], 'other'>;",
    "export const takeNarrow = (kind: Narrow): Narrow => kind;",
    "export const takeR = (kind: (typeof KINDS_R)[number]): string => kind;",
    'export const builtR = [takeNarrow("r"), takeNarrow("narrow"), takeR("other")];',
  ].join("\n"),
};

test("the unions scan keeps construction evidence with its own vocabulary: a shared text built only in another tuple's slot stays unbuilt", {
  timeout: 120_000,
}, async ({ plantedTree }) => {
  const root = await plantedTree(SHARED_TREE);
  const report = scanUnions({ root, worlds: [WORLD], testWorlds: [], deliberate: [], log: () => undefined });
  expect(report.unwired.map(({ kind, home, member }) => ({ kind, home, member }))).toEqual([{ kind: "unbuilt", home: "KINDS_A", member: "shared" }]);
  expect(report.disagreements).toEqual([]);
});
