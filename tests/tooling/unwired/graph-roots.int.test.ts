// Where liveness starts: knip's production entries, consumers and trusted files, each workspace manifest's bin, exports
// and the scripts that ship (an installed application's lifecycle scripts, every build and a published package's prepare,
// with their pnpm-run closure), a script's
// node run of a TypeScript file, and an index.html module script. Each root here reaches one unit, so a broken root turns its unit
// dead, operator-only or consumer-only.
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import type { Bucket, GraphScan } from "../../../tooling/src/unwired/index.ts";
import { GRAPH_SOURCE, graphScan, LIB, labelsIn, plantedKnip } from "./_planted.ts";

const UNITS = `${GRAPH_SOURCE}/units.ts`;
const TRUSTED = `${GRAPH_SOURCE}/trusted.ts`;
const SERVER = "packages/server";
const CLIENT = "packages/client";
const SDK = "packages/sdk";
const KIT = "tests/support";
const labels = (scan: GraphScan, bucket: Bucket): readonly string[] => scan.analysis[bucket].map(({ label }) => label);
const use = (name: string, from: string): string => `import { ${name} } from "${from}";\n${name}();`;
const UNIT_NAMES = [
  "binOnly",
  "setupOnly",
  "devOnly",
  "htmlOnly",
  "operatorOnly",
  "opsOnly",
  "consumerOnly",
  "driveOnly",
  "kitScriptOnly",
  "sdkOnly",
  "unrooted",
] as const;

const KNIP = {
  workspaces: {
    "packages/a": { project: ["src/**/*.ts!"], ignoreIssues: { "src/trusted.ts": ["exports"] } },
    [SERVER]: { project: ["src/**/*.ts!"] },
    [CLIENT]: { project: ["src/**/*.ts!"] },
    [SDK]: { project: ["src/**/*.ts!"], includeEntryExports: false },
    [KIT]: { entry: ["index.ts"], ignore: ["**"] },
    ".": {
      entry: ["scripts/run.ts", "ops/seed.ts", "tests/drive.ts"],
      ignore: ["scripts/**", "ops/**", "tests/**"],
      project: ["scripts/**/*.ts", "ops/**/*.ts", "tests/**/*.ts"],
    },
  },
};
// knip's view ignores every root-workspace file alike; only the operator table tells an operator's run from a consumer
const OPERATORS = { ".": ["scripts/**", "ops/**"] };

const tree = (overrides: Readonly<Record<string, string>> = {}): Record<string, string> => ({
  "tsconfig.json": JSON.stringify({ files: [], references: [{ path: "packages/a" }, { path: "tsconfig.outside.json" }] }),
  "tsconfig.outside.json": plantedTsconfig({ lib: LIB, include: ["scripts", "ops", "tests"] }),
  "knip.ts": plantedKnip(KNIP, OPERATORS),
  "ops/seed.ts": use("opsOnly", "../packages/a/src/units.ts"),
  "tests/drive.ts": use("driveOnly", "../packages/a/src/units.ts"),
  [UNITS]: UNIT_NAMES.map((name) => `export const ${name} = (): number => 1;`).join("\n"),
  [TRUSTED]: "export const trustedOnly = (): number => 1;",
  [`${GRAPH_SOURCE}/untrusted.ts`]: "export const untrustedOnly = (): number => 1;",
  [`${SERVER}/package.json`]: JSON.stringify({
    name: "server",
    bin: "src/cli.ts",
    scripts: { postinstall: "pnpm run prepare-data && echo done", "prepare-data": "node --import tsx/esm src/setup.ts", dev: "node src/dev.ts" },
  }),
  [`${SERVER}/src/cli.ts`]: use("binOnly", "../../a/src/units.ts"),
  [`${SERVER}/src/setup.ts`]: use("setupOnly", "../../a/src/units.ts"),
  [`${SERVER}/src/dev.ts`]: use("devOnly", "../../a/src/units.ts"),
  [`${CLIENT}/index.html`]: '<!doctype html><html><body><script type="module" src="/src/main.ts"></script></body></html>',
  [`${CLIENT}/src/main.ts`]: use("htmlOnly", "../../a/src/units.ts"),
  [`${SDK}/package.json`]: JSON.stringify({ name: "sdk", exports: { ".": { types: "./src/index.ts", import: "./src/index.ts" } } }),
  [`${SDK}/src/index.ts`]: 'export { sdkOnly } from "../../a/src/units.ts";\nexport const sdkDoor = (): number => 2;',
  "scripts/run.ts": use("operatorOnly", "../packages/a/src/units.ts"),
  [`${KIT}/index.ts`]: use("consumerOnly", "../../packages/a/src/units.ts"),
  // a script a consumer workspace's manifest runs consumes production wherever its file sits
  [`${KIT}/package.json`]: JSON.stringify({ name: "kit", scripts: { warm: "node ../../scripts/kit-warm.ts" } }),
  "scripts/kit-warm.ts": use("kitScriptOnly", "../packages/a/src/units.ts"),
  ...overrides,
});

const verdicts = (scan: GraphScan): Readonly<Record<string, readonly string[]>> => ({
  dead: labels(scan, "dead"),
  operator: labels(scan, "operator-only"),
  consumer: labels(scan, "consumer-only"),
});

test("each manifest, knip and index.html root reaches its unit, and only a shipped root makes it product-live", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const scan = await graphScan(plantedTree, tree());
  // a bin, a lifecycle script's pnpm-run closure, an index.html module script and a published door ship; a script
  // nothing installed runs and a scripts/ entry are an operator's; the testkit only consumes; a trusted file keeps
  // its exports, an untrusted one does not
  expect(verdicts(scan)).toEqual({
    dead: [`${UNITS}:unrooted`, `${GRAPH_SOURCE}/untrusted.ts:untrustedOnly`],
    operator: [`${UNITS}:devOnly`, `${UNITS}:operatorOnly`, `${UNITS}:opsOnly`],
    consumer: [`${UNITS}:consumerOnly`, `${UNITS}:driveOnly`, `${UNITS}:kitScriptOnly`],
  });
});

const UI = "packages/ui";
const PUB = "packages/pub";
const PRIV = "packages/priv";
const PALETTE = `${GRAPH_SOURCE}/palette.ts`;
const read = (member: string, from: string): string => `import { palette } from "${from}";\nexport const shown = (): string => palette.${member};\nshown();`;

// A script whose output ships is the product's (D357): every manifest's build and a published package's prepare, through
// the scripts they call by pnpm, `--filter` across workspaces included, and the files those scripts import. knip lists
// the build file as an entry first, so the product reason must outrank its operator one. A private root's prepare readies
// a checkout and ships nothing, so a member only a private prepare reads stays unread, as one only an operator's
// script reads does.
test("a file a build or a published prepare runs reads as the product does; a private prepare's run does not", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const scan = await graphScan(plantedTree, {
    "tsconfig.json": JSON.stringify({ files: [], references: [{ path: "packages/a" }, { path: "tsconfig.outside.json" }] }),
    "tsconfig.outside.json": plantedTsconfig({ lib: LIB, include: ["scripts", "packages/ui/*.ts", "packages/pub/*.ts", "packages/priv/*.ts"] }),
    "knip.ts": plantedKnip(
      {
        workspaces: {
          "packages/a": { entry: ["src/palette.ts!"], project: ["src/**/*.ts!"] },
          [UI]: { entry: ["tokens.build.ts"], project: ["*.ts"] },
          [PUB]: { project: ["*.ts"] },
          [PRIV]: { project: ["*.ts"] },
          ".": { entry: ["scripts/prepare.ts"], ignore: ["scripts/**"], project: ["scripts/**/*.ts"] },
        },
      },
      { ".": ["scripts/**"] },
    ),
    "package.json": JSON.stringify({
      name: "root",
      private: true,
      scripts: { prepare: "node scripts/prepare.ts", build: "pnpm --filter @orb/ui tokens:build" },
    }),
    [`${UI}/package.json`]: JSON.stringify({ name: "@orb/ui", private: true, scripts: { "tokens:build": "node tokens.build.ts" } }),
    [`${UI}/tokens.build.ts`]: 'import { shown } from "./tokens.tones.ts";\nshown();',
    [`${UI}/tokens.tones.ts`]: read("tone", "../a/src/palette.ts"),
    [`${PUB}/package.json`]: JSON.stringify({ name: "pub", scripts: { prepare: "node gen.ts" } }),
    [`${PUB}/gen.ts`]: read("pub", "../a/src/palette.ts"),
    [`${PRIV}/package.json`]: JSON.stringify({ name: "priv", private: true, scripts: { prepare: "node setup.ts" } }),
    [`${PRIV}/setup.ts`]: read("priv", "../a/src/palette.ts"),
    "scripts/prepare.ts": read("prep", "../packages/a/src/palette.ts"),
    [PALETTE]: [
      "export interface Palette { readonly tone: string; readonly pub: string; readonly priv: string; readonly prep: string; readonly none: string }",
      'export const palette: Palette = { tone: "t", pub: "u", priv: "v", prep: "p", none: "n" };',
    ].join("\n"),
  });
  expect(labelsIn(scan, "member-write-only", PALETTE)).toEqual(["Palette.priv", "Palette.prep", "Palette.none"]);
});
