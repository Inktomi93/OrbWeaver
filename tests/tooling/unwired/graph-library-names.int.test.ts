// A library name the scans read counts by the declaration it resolves to (tooling/src/unwired/graph/library-names.ts):
// each case reaches zod or the platform through an alias, beside a same-named member of our own that must not count.
import { expect, test } from "@orb/testkit/tooling";
import type { MemberBucket } from "../../../tooling/src/unwired/index.ts";
import { MEMBER_BUCKETS, unionsGraph } from "../../../tooling/src/unwired/index.ts";
import { GRAPH_SOURCE, graphScan, graphTree, labelsIn, ZOD_MODULE } from "./_planted.ts";

const FILE = `${GRAPH_SOURCE}/names.ts`;
const TIMEOUT = { timeout: 120_000 };
const source = (lines: readonly string[]): Record<string, string> => ({ ...ZOD_MODULE, [FILE]: lines.join("\n") });

const bucketed = (scan: Parameters<typeof labelsIn>[0], buckets: readonly MemberBucket[] = MEMBER_BUCKETS): readonly string[] =>
  buckets.flatMap((bucket) => labelsIn(scan, bucket, FILE).map((label) => `${bucket} ${label.split("  ")[0] ?? ""}`));

test("an aliased zod object builder declares schema keys, and a local builder of the same name declares none", TIMEOUT, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      'import { z as zod } from "zod";',
      "export const cardSchema = zod.object({ name: zod.string() });",
      "const z = { object: <T>(shape: T): T => shape };",
      'export const plain = z.object({ label: "l" });',
    ]),
  );
  expect(labelsIn(scan, "member-validated", FILE)).toEqual(["cardSchema.name"]);
});

test("an aliased Object.values reads every member of its value, and a local values method reads none", TIMEOUT, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "const O = Object;",
      "export interface Listed { readonly a: string }",
      "export interface Kept { readonly b: string }",
      'const listed: Listed = { a: "a" };',
      'const kept: Kept = { b: "b" };',
      "export const values = O.values(listed);",
      "const shelf = { values: (value: Kept): number => Object.keys(value).length };",
      "export const shelved = shelf.values(kept);",
    ]),
  );
  expect(bucketed(scan)).toEqual(["member-sent-only Kept.b"]);
});

test("an aliased z.enum and a platform membership test narrow a tuple, and same-named local methods do not", TIMEOUT, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      ...ZOD_MODULE,
      [FILE]: [
        'import { z as zod } from "zod";',
        'export const TONES = ["warm", "cold"] as const;',
        "export const toneSchema = zod.enum(TONES);",
        'export const MODES = ["on", "off"] as const;',
        "export const isMode = (value: string): boolean => (MODES as readonly string[]).includes(value);",
        'export const SIZES = ["s", "m"] as const;',
        "const local = { enum: (values: readonly string[]): number => values.length };",
        "export const counted = local.enum(SIZES);",
      ].join("\n"),
    }),
  );
  const report = await unionsGraph(root, { deliberate: [], judged: [] }, () => undefined);
  expect(report.parsed.map(({ home, member, sources }) => `${home}.${member} ${sources.join(",")}`)).toEqual([
    `TONES.warm z.enum ${FILE}:3`,
    `TONES.cold z.enum ${FILE}:3`,
    `MODES.on membership test ${FILE}:5`,
    `MODES.off membership test ${FILE}:5`,
  ]);
});
