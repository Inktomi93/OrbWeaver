import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Node, Project, SyntaxKind } from "ts-morph";
import { vi } from "vitest";
import type { InventoryInvocationPlan } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { typeProjectionFacet } from "../../../../tooling/src/floor/code-facts/type-projection-contract.ts";
import { createSemanticWorkspace } from "../../../../tooling/src/floor/compiler/ts-workspace.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { gate as cap } from "../../../../tooling/src/verify/gates/public-route-body-cap.ts";
import { gate as health } from "../../../../tooling/src/verify/gates/public-route-body-cap-health.ts";
import { isCappedStreamCall, resolvesCapMiddleware } from "../../../../tooling/src/verify/lib/http-route-body.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { nativeTypeFactOptions, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { runScopedCli } from "../../../../tooling/src/verify/ops/scoped.ts";
import { runStructure } from "../../../../tooling/src/verify/ops/structure.ts";
import { scaledBudget } from "../../_load-budget.ts";

const ENTRY = "packages/server/src/entry/http/index.ts";
const POLICIES = [cap, health];

function fixture(root: string, repoRoot: string): void {
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write(".gitignore", "node_modules\n.cache\nreports\n");
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  const compilerOptions = { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true, skipLibCheck: true, types: [] };
  write("tsconfig.json", JSON.stringify({ compilerOptions, files: [ENTRY] }));
  write("package.json", JSON.stringify({ name: "native-body-cap-fixture", type: "module" }));
  write(
    ENTRY,
    `import {Hono} from 'hono';
import {bodyLimit} from 'hono/body-limit';
const app=new Hono();
const cap=bodyLimit({maxSize:1024});
const alias=cap;
app.post('/capped',alias,async c=>c.json(await c.req.json()));
app.post('/uncapped',async c=>c.json(await c.req.json()));
declare function stageCapped(stream:ReadableStream<Uint8Array>|null,path:string,cap:number):Promise<void>;
const IMPORT_MAX_TOTAL_BYTES=1024;
app.post('/stream',async c=>{const body=c.req.raw.body;const alias=body;await stageCapped(alias,'out',IMPORT_MAX_TOTAL_BYTES);return c.body(null);});
`,
  );
  write("tooling/tsconfig.json", JSON.stringify({ compilerOptions, files: POLICIES.map(({ id }) => `src/verify/gates/${id}.ts`) }));
  for (const { id } of POLICIES) {
    write(
      `tooling/src/verify/gates/${id}.ts`,
      `export {gate} from ${JSON.stringify(pathToFileURL(join(repoRoot, `tooling/src/verify/gates/${id}.ts`)).href)};`,
    );
  }
  execFixtureGit(root, ["init", "-q"]);
}

function poisonSyntax(project: Project): Disposable {
  const readType = Node.prototype.getType;
  const readSymbol = Node.prototype.getSymbol;
  const readChecker = project.getTypeChecker;
  const types = vi.spyOn(Node.prototype, "getType").mockImplementation(function (this: Node) {
    if (this.getProject() === project) {
      throw new Error("ordinary body-cap Type read");
    }
    return readType.call(this);
  });
  const symbols = vi.spyOn(Node.prototype, "getSymbol").mockImplementation(function (this: Node) {
    if (this.getProject() === project) {
      throw new Error("ordinary body-cap Symbol read");
    }
    return readSymbol.call(this);
  });
  const checker = vi.spyOn(project, "getTypeChecker").mockImplementation(() => {
    throw new Error("ordinary body-cap checker read");
  });
  return {
    [Symbol.dispose]: (): void => {
      checker.mockRestore();
      symbols.mockRestore();
      types.mockRestore();
      expect(project.getTypeChecker).toBe(readChecker);
    },
  };
}

test(
  "body-cap structure and scoped doors preserve native const aliases without ordinary semantic access",
  async ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const workspace = createSemanticWorkspace({ root: scratch });
    const source = workspace.program("tsconfig.json")?.sourceFile(ENTRY);
    if (source === undefined) {
      throw new Error("native body-cap source is unavailable");
    }
    expect(source.getPreEmitDiagnostics()).toEqual([]);
    const nativeCalls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const middleware = nativeCalls.find((call) => call.getExpression().getText() === "app.post")?.getArguments()[1];
    const stream = nativeCalls.find((call) => call.getExpression().getText() === "stageCapped");
    if (middleware === undefined || stream === undefined) {
      throw new Error("native body-cap origins are unavailable");
    }
    expect(resolvesCapMiddleware(middleware)).toBe(true);
    expect(isCappedStreamCall(stream)).toBe(true);
    const context = projectCtx(scratch);
    const run = (): ReturnType<typeof runPolicyPass> =>
      runPolicyPass({
        root: scratch,
        project: context.project,
        ...nativeTypeFactOptions(context),
        policies: POLICIES,
        knownPolicies: POLICIES,
        reviewedGrants: [],
        failOnWarnings: false,
      });
    const baseline = run();
    expect(baseline.toolErrors).toEqual([]);
    expect(baseline.authority.effectiveFindings).toMatchObject([{ policyId: cap.id, file: ENTRY, line: 7, token: "post" }]);
    const contexts = await import("../../../../tooling/src/verify/lib/project-context.ts");
    const useContext = vi.spyOn(contexts, "projectCtx").mockReturnValue(context);
    using _poison = poisonSyntax(context.project);
    try {
      expect(await runStructure(scratch, [`--check=${cap.id}`])).toBe(1);
      expect(await runStructure(scratch, [`--check=${health.id}`])).toBe(0);
      expect(await runScopedCli(scratch, ["--scope", ENTRY])).toBe(1);
      const result = run();
      expect(result.toolErrors).toEqual([]);
      expect(result.authority.withheldPolicyIds).toEqual([]);
      expect(result.authority.effectiveFindings).toEqual(baseline.authority.effectiveFindings);
    } finally {
      useContext.mockRestore();
    }
  },
  scaledBudget(60_000),
);

test("body-cap retains every declared finding, near miss, health and waiver control", () => {
  expect(verifyPolicyProofs(POLICIES)).toEqual([]);
});

test("body-cap aliases require a current exact native owner and reject foreign, stale and disposed reads", ({ scratch, repoRoot }) => {
  fixture(scratch, repoRoot);
  const context = projectCtx(scratch);
  const source = context.project.getSourceFileOrThrow(join(scratch, ENTRY));
  const node = source.getDescendantsOfKind(SyntaxKind.Identifier).find((identifier) => identifier.getText() === "alias");
  if (node === undefined || context.nativeTypeFacts === undefined) {
    throw new Error("native body-cap lifecycle control is unavailable");
  }
  const plan: InventoryInvocationPlan = { mode: "value", facets: ["type-projection"], arguments: [], typeProjection: { facets: ["lexical"], properties: [] } };
  const facts = context.nativeTypeFacts();
  try {
    facts.request(cap.id, { kind: "invocation-evidence", nodes: [node], plan });
    facts.seal(new Set([cap.id]));
    const evidence = facts.invocationEvidence(cap.id, [node], plan).get(node)?.typeProjections.get(node);
    if (evidence === undefined) {
      throw new Error("native body-cap lexical answer is missing");
    }
    expect(typeProjectionFacet(evidence, "lexical").declarations?.map((declaration) => declaration.getText())).toEqual(["alias=cap"]);
    const foreign = new Project({ useInMemoryFileSystem: true })
      .createSourceFile("/foreign.ts", "const alias=0;")
      .getDescendantsOfKind(SyntaxKind.Identifier)[0];
    if (foreign === undefined) {
      throw new Error("foreign alias control is missing");
    }
    expect(() => facts.invocationEvidence(cap.id, [foreign], plan)).toThrow();
    source.insertText(0, "\n");
    expect(() => facts.invocationEvidence(cap.id, [node], plan)).toThrow();
  } finally {
    facts[Symbol.dispose]();
  }
  expect(() => facts.invocationEvidence(cap.id, [node], plan)).toThrow();
});

test("body-cap native absence withholds the policy instead of asking the ordinary checker", ({ scratch, repoRoot }) => {
  fixture(scratch, repoRoot);
  const context = projectCtx(scratch);
  using _poison = poisonSyntax(context.project);
  const result = runPolicyPass({
    root: scratch,
    project: context.project,
    policies: [cap],
    knownPolicies: POLICIES,
    reviewedGrants: [],
    failOnWarnings: false,
  });
  expect(result.authority.withheldPolicyIds).toEqual([cap.id]);
  expect(result.toolErrors).toMatchObject([{ policyId: cap.id, message: expect.stringContaining("native type fact context is unavailable") }]);
});
