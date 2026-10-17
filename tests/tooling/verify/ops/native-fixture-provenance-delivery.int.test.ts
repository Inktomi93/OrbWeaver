import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Node, Project, SyntaxKind } from "ts-morph";
import { afterEach, beforeEach, vi } from "vitest";
import { captureTypeObservations } from "../../../../tooling/src/floor/code-facts/type-observations.ts";
import type { TypeObservationDemand } from "../../../../tooling/src/floor/code-facts/type-observations-contract.ts";
import { TYPE_OBSERVATION_PROFILE } from "../../../../tooling/src/floor/code-facts/type-observations-contract.ts";
import { assertTypeObservationCoverage } from "../../../../tooling/src/floor/code-facts/type-observations-coverage.ts";
import { readTypeObservations } from "../../../../tooling/src/floor/code-facts/type-observations-read.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { gate } from "../../../../tooling/src/verify/gates/policy-fixture-substrate.ts";
import { nativeFixturePathPass } from "../../../../tooling/src/verify/lib/fixture-path-native.ts";
import { fixtureSymbol } from "../../../../tooling/src/verify/lib/fixture-path-semantic.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { nativeTypeFactOptions, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { nativeInventoryFixture } from "../../floor/compiler/native-inventory-fixture.ts";
import { nativeVerifyFixture } from "../../floor/compiler/native-verify-fixture.ts";

// Local callbacks judge native-child historical facts and consumer leases, not current producer authority.
beforeEach(async () => {
  const inventoryFactory = await import("../../../../tooling/src/floor/code-facts/semantic-inventory.ts");
  vi.spyOn(inventoryFactory, "createSemanticInventory").mockImplementation(nativeInventoryFixture);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const NODE = "tests/tooling/verify/gates/realm.test.ts";
const BROWSER = "tests/tooling/verify/gates/realm.dom.test.ts";
const SUPPORT = "tests/support/node/tool-fixtures.ts";
const IMPORTED = "tests/tooling/verify/gates/imported.test.ts";
const MUTATED = "tests/tooling/verify/gates/mutated.test.ts";

function fixture(root: string, repoRoot: string): void {
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  write(".gitignore", "node_modules\n.cache\nreports\n");
  const options = { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true, skipLibCheck: true, types: [] };
  write(
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: { ...options, lib: ["ES2022"] },
      files: [NODE, IMPORTED, MUTATED, SUPPORT, "tests/support/node/roots.ts", "tests/support/node/mutated.ts"],
    }),
  );
  write(
    "tsconfig.tests-dom.json",
    JSON.stringify({ compilerOptions: { ...options, lib: ["ES2022", "DOM"], customConditions: ["browser"] }, files: [BROWSER, "browser-door.ts"] }),
  );
  write(
    "tooling/tsconfig.json",
    JSON.stringify({ compilerOptions: options, files: [`src/verify/gates/${gate.id}.ts`, "src/verify/gates/policy-soundness.ts"] }),
  );
  write("package.json", JSON.stringify({ type: "module", imports: { "#fixture": { browser: "./browser-door.ts", default: `./${SUPPORT}` } } }));
  const declaration = "export function test(name:string, body:(fixtures:{scratch:string})=>void):void{}\n";
  write(SUPPORT, declaration);
  write("browser-door.ts", declaration);
  const source =
    'import {test} from "#fixture"; import {writeFileSync} from "node:fs"; import {join} from "node:path"; test("x",({scratch})=>{ function plant(root:string):void{writeFileSync(join(root,"x"),"x");} plant(scratch); });\n';
  write(NODE, source);
  write(BROWSER, source);
  write(
    "tests/support/node/roots.ts",
    'import {mkdtempSync} from "node:fs";import {tmpdir} from "node:os";import {join} from "node:path";const first=mkdtempSync(join(tmpdir(),"fixture-"));const second=first;const third=second;const fourth=third;const fifth=fourth;const sixth=fifth;export const root=sixth;\n',
  );
  write(
    IMPORTED,
    'import {root} from "../../../support/node/roots.ts";import {writeFileSync} from "node:fs";import {join} from "node:path";writeFileSync(join(root,"x"),"x");\n',
  );
  write(
    "tests/support/node/mutated.ts",
    'import {mkdtempSync} from "node:fs";import {tmpdir} from "node:os";import {join} from "node:path";export let root=mkdtempSync(join(tmpdir(),"fixture-"));root=process.cwd();\n',
  );
  write(
    MUTATED,
    'import {root} from "../../../support/node/mutated.ts";import {writeFileSync} from "node:fs";import {join} from "node:path";writeFileSync(join(root,"x"),"x");\n',
  );
  write(
    `tooling/src/verify/gates/${gate.id}.ts`,
    `export {gate} from ${JSON.stringify(new URL(`../../../../tooling/src/verify/gates/${gate.id}.ts`, import.meta.url).href)};`,
  );
  write(
    "tooling/src/verify/gates/policy-soundness.ts",
    `export {gate} from ${JSON.stringify(new URL("../../../../tooling/src/verify/gates/policy-soundness.ts", import.meta.url).href)};`,
  );
  execFixtureGit(root, ["init", "-q"]);
}

function poisonSyntax(project: Project): Disposable {
  const readType = Node.prototype.getType;
  const readSymbol = Node.prototype.getSymbol;
  const spies = [
    vi.spyOn(Node.prototype, "getType").mockImplementation(function (this: Node) {
      if (this.getProject() === project) {
        throw new Error("ordinary fixture provenance Type read");
      }
      return readType.call(this);
    }),
    vi.spyOn(Node.prototype, "getSymbol").mockImplementation(function (this: Node) {
      if (this.getProject() === project) {
        throw new Error("ordinary fixture provenance Symbol read");
      }
      return readSymbol.call(this);
    }),
  ];
  return {
    [Symbol.dispose]: (): void => {
      for (const spy of spies) {
        spy.mockRestore();
      }
    },
  };
}

test(
  "public structure and scoped fixture provenance use native importing worlds without ordinary semantic reads",
  async ({ scratch, repoRoot }) => {
    const nativeSyntaxReads: number[] = [];
    fixture(scratch, repoRoot);
    const contexts = await import("../../../../tooling/src/verify/lib/project-context.ts");
    const context = projectCtx(scratch);
    const getContext = vi.spyOn(contexts, "projectCtx").mockReturnValue(context);
    using _poison = poisonSyntax(context.project);
    try {
      expect([
        await nativeVerifyFixture(scratch, "structure", [`--check=${gate.id}`], { forbidSyntax: true, syntaxReads: nativeSyntaxReads }),
        await nativeVerifyFixture(scratch, "scoped", ["--scope", [NODE, BROWSER, IMPORTED, MUTATED].join(",")], {
          forbidSyntax: true,
          syntaxReads: nativeSyntaxReads,
        }),
      ]).toEqual([1, 1]);
      const result = runPolicyPass({
        root: scratch,
        project: context.project,
        ...nativeTypeFactOptions(context),
        policies: [gate],
        knownPolicies: [gate],
        reviewedGrants: [],
        failOnWarnings: false,
      });
      expect(result.toolErrors).toEqual([]);
      expect(result.authority.withheldPolicyIds).toEqual([]);
      expect(result.authority.authorityAlarms).toEqual([]);
      expect(
        result.policies.flatMap(({ findings }) =>
          findings.map(({ file, line, message }) => ({ file, line, unreadable: message?.includes("UNREADABLE") === true })),
        ),
      ).toEqual([
        { file: MUTATED, line: 1, unreadable: true },
        { file: BROWSER, line: 1, unreadable: true },
      ]);
    } finally {
      getContext.mockRestore();
    }

    expect(nativeSyntaxReads).toEqual([0, 0]);
  },
  scaledBudget(60_000),
);

test("native callable-holder exports preserve export lists, multi-declarations and exact coverage", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true } });
  const source = project.createSourceFile(
    "/holders.ts",
    "const listed=(root:string)=>root;export {listed};export const first=(root:string)=>root, second=(root:string)=>root;const local=(root:string)=>root;function named(root:string){return root;}export {named};",
  );
  const holders = [...source.getVariableStatements(), ...source.getFunctions()];
  const demand: TypeObservationDemand = {
    profile: TYPE_OBSERVATION_PROFILE,
    sources: [source],
    nodes: [],
    questions: [{ kind: "function-exports", nodes: holders }],
  };
  const facts = captureTypeObservations(demand, { anchor: source, admit: () => undefined });
  const reader = readTypeObservations(facts);
  expect(holders.map((holder) => reader.functionExport(holder))).toEqual(holders.map((holder) => holder.isExported()));
  expect(holders.map((holder) => reader.functionExport(holder))).toEqual([false, true, false, true]);
  const key = (node: Node): string => `${node.getSourceFile().getFilePath()}:${node.getStart()}:${node.getEnd()}`;
  expect(() => assertTypeObservationCoverage({ ...facts, functionExports: facts.functionExports?.slice(1) }, key, (node) => node.getKind())).toThrow(
    "function export coverage",
  );
  expect(() =>
    assertTypeObservationCoverage({ ...facts, functionExports: [...(facts.functionExports ?? []), { node: source, value: false }] }, key, (node) =>
      node.getKind(),
    ),
  ).toThrow("function export coverage");
});

test(
  "fixture provenance retains every original declared proof",
  () => {
    expect(verifyPolicyProofs([gate])).toEqual([]);
  },
  scaledBudget(120_000),
);

test("missing native fixture ownership withholds rather than consulting ordinary bindings", ({ scratch, repoRoot }) => {
  fixture(scratch, repoRoot);
  const context = projectCtx(scratch);
  using _poison = poisonSyntax(context.project);
  const result = runPolicyPass({ root: scratch, project: context.project, policies: [gate], knownPolicies: [gate], reviewedGrants: [], failOnWarnings: false });
  expect(result.authority.withheldPolicyIds).toEqual([gate.id]);
  expect(result.toolErrors).toMatchObject([{ policyId: gate.id, message: expect.stringContaining("native type fact context is unavailable") }]);
});

test(
  "fixture raw readers reject missing, foreign, stale and disposed importing ownership",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const context = projectCtx(scratch);
    const source = context.project.getSourceFileOrThrow(join(scratch, NODE));
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const identifiers = source.getDescendantsOfKind(SyntaxKind.Identifier);
    const name = identifiers.find((identifier) => identifier.getText() === "plant");
    const facts = context.nativeTypeFacts?.();
    if (name === undefined || facts === undefined) {
      throw new Error("native fixture lifecycle control has no owner");
    }
    const pass = nativeFixturePathPass(
      {
        files: [source],
        nativeTypes: {
          request: (query): void => facts.request(gate.id, query),
          invocationEvidence: (nodes, plan) => facts.invocationEvidence(gate.id, nodes, plan),
        },
      },
      calls,
      identifiers,
    );
    expect(() => pass.at(source)).toThrow("was not prepared");
    pass.prepare();
    facts.seal(new Set([gate.id]));
    const read = pass.at(source);
    try {
      expect(fixtureSymbol(name, read)).toBeDefined();
      const foreign = new Project({ useInMemoryFileSystem: true })
        .createSourceFile("/foreign.ts", "const plant=0;")
        .getDescendantsOfKind(SyntaxKind.Identifier)[0];
      if (foreign === undefined) {
        throw new Error("foreign fixture control is missing");
      }
      expect(() => fixtureSymbol(foreign, read)).toThrow();
      source.insertText(0, "\n");
      expect(() => fixtureSymbol(name, read)).toThrow();
    } finally {
      facts[Symbol.dispose]();
    }
    expect(() => fixtureSymbol(name, read)).toThrow();
  },
  scaledBudget(60_000),
);
