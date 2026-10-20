// The symbol lenses agree on who consumes: a test-named file is a test consumer, a checked witness is a tool
// consumer wherever it sits, and a namespace member named by a quoted destructure key is spelled.
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import { collectApiSurface, collectSwallowedCandidates, deadEvidenceFor, testOnlyClassOf } from "../../../../tooling/src/ast/index.ts";
import { buildLiveness } from "../../../../tooling/src/floor/code-facts/liveness.ts";

const ROOT = "/repo";

function projectOf(files: Record<string, string>, paths: Record<string, string[]> = {}): Project {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { baseUrl: ROOT, paths } });
  for (const [path, text] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, text);
  }
  return project;
}

test("a test-named file inside package source anchors dead and testonly as a test, never as production", () => {
  const project = projectOf({
    "packages/server/src/probe/thing.ts": "export function probed(): number { return 1; }\n",
    "packages/server/src/probe/thing.test.ts": 'import { probed } from "./thing";\nexport const checked = probed();\n',
  });
  const source = project.getSourceFileOrThrow(`${ROOT}/packages/server/src/probe/thing.ts`);
  const probed = source.getFunctionOrThrow("probed");
  const live = buildLiveness(project);
  const evidence = deadEvidenceFor(project, probed, "probed", live);

  expect(testOnlyClassOf(source, "probed", probed, live)).toBe("hit");
  expect({ verdict: evidence.verdict, prodCount: evidence.prodCount, testCount: evidence.testCount }).toEqual({
    verdict: "TEST-ANCHORED",
    prodCount: 0,
    testCount: 2,
  });
});

test("a checked witness carried in package source is a tool consumer for apisurface", () => {
  const project = projectOf(
    {
      "packages/server/src/external/origin.ts": "export const target = 1;\n",
      "packages/server/src/external/index.ts": 'export { target } from "./origin";\n',
      "packages/server/src/reader/matrix.ts": `
export const MATRIX_CONST = "target" satisfies keyof typeof import("@fixture/external");
export function readMatrixName(): string { return MATRIX_CONST; }
`,
    },
    { "@fixture/external": ["packages/server/src/external/index.ts"] },
  );
  const inOrigin = (filePath: string): boolean => filePath.endsWith("/packages/server/src/external/origin.ts");
  const entry = collectApiSurface(project, inOrigin).find(({ name }) => name === "target");

  expect({ klass: entry?.klass, consumers: entry?.consumers }).toEqual({ klass: "public", consumers: ["scripts/tooling"] });
});

test("a namespace member named by a quoted destructure key is spelled, so swallowed does not report it", () => {
  const project = projectOf({
    "packages/db/src/schema/tables.ts": "export const quoted = { id: 1 };\nexport const unspelled = { id: 2 };\n",
    "packages/db/src/client/index.ts": `
import * as schema from "../schema/tables";
export const db = drizzle(client, { schema });
const { "quoted": local } = schema;
export const primary = local;
`,
  });
  const candidates = collectSwallowedCandidates(project, buildLiveness(project), (filePath) => filePath.includes("/packages/db/"));

  expect(candidates.map(({ name }) => name)).toEqual(["unspelled"]);
});
