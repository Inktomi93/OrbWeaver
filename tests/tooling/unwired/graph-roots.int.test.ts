// Where liveness starts: knip's production entries, consumers and trusted files, each workspace manifest's bin, exports
// and the scripts an installed application runs (its lifecycle scripts and their pnpm-run closure), a script's
// `node x.ts` run, and an index.html module script. Each root here reaches one unit, so a broken root turns its unit
// dead, operator-only or consumer-only.
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import type { Bucket, GraphScan } from "../../../tooling/src/unwired/index.ts";
import { GRAPH_SOURCE, graphScan, LIB } from "./_planted.ts";

const UNITS = `${GRAPH_SOURCE}/units.ts`;
const TRUSTED = `${GRAPH_SOURCE}/trusted.ts`;
const SERVER = "packages/server";
const CLIENT = "packages/client";
const SDK = "packages/sdk";
const KIT = "tests/support";
const labels = (scan: GraphScan, bucket: Bucket): readonly string[] => scan.analysis[bucket].map(({ label }) => label);
const use = (name: string, from: string): string => `import { ${name} } from "${from}";\n${name}();`;
const UNIT_NAMES = ["binOnly", "setupOnly", "devOnly", "htmlOnly", "operatorOnly", "consumerOnly", "kitScriptOnly", "sdkOnly", "unrooted"] as const;

const KNIP = {
  workspaces: {
    "packages/a": { project: ["src/**/*.ts!"], ignoreIssues: { "src/trusted.ts": ["exports"] } },
    [SERVER]: { project: ["src/**/*.ts!"] },
    [CLIENT]: { project: ["src/**/*.ts!"] },
    [SDK]: { project: ["src/**/*.ts!"], includeEntryExports: false },
    [KIT]: { entry: ["index.ts"], ignore: ["**"] },
    ".": { entry: ["scripts/run.ts"], ignore: ["scripts/**"], project: ["scripts/**/*.ts", "tests/**/*.ts"] },
  },
};

const tree = (overrides: Readonly<Record<string, string>> = {}): Record<string, string> => ({
  "tsconfig.json": JSON.stringify({ files: [], references: [{ path: "packages/a" }, { path: "tsconfig.outside.json" }] }),
  "tsconfig.outside.json": plantedTsconfig({ lib: LIB, include: ["scripts", "tests"] }),
  "knip.ts": [`const config = ${JSON.stringify(KNIP)};`, "export default (_flags: { readonly production: boolean }) => config;", "export { config };"].join(
    "\n",
  ),
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
    operator: [`${UNITS}:devOnly`, `${UNITS}:operatorOnly`],
    consumer: [`${UNITS}:consumerOnly`, `${UNITS}:kitScriptOnly`],
  });
});
