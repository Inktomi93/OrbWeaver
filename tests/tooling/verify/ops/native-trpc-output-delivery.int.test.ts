// Actual installed tRPC types establish the baseline before sealed native delivery is exercised.
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Identifier, Node, Project, SyntaxKind } from "ts-morph";
import { vi } from "vitest";
import { resolveCallableDeclaration } from "../../../../tooling/src/floor/code-facts/reference-fact-call.ts";
import type { TypeObservationReader } from "../../../../tooling/src/floor/code-facts/type-observations-contract.ts";
import { readTypeObservations } from "../../../../tooling/src/floor/code-facts/type-observations-read.ts";
import { nodeTypeSelector } from "../../../../tooling/src/floor/code-facts/type-projection-contract.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { POLICY_PASS_REFUSALS } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { gate } from "../../../../tooling/src/verify/gates/trpc-output-declarations.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { nativeTypeFactOptions, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { isolatedTypeFacts } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { runScopedCli } from "../../../../tooling/src/verify/ops/scoped.ts";
import { runStructure } from "../../../../tooling/src/verify/ops/structure.ts";
import { scaledBudget } from "../../_load-budget.ts";

const TRANSPORT = "packages/server/src/transport/trpc";
const ROOT = `${TRANSPORT}/router.ts`;
const CHILD = `${TRANSPORT}/child.ts`;
const SOURCES = [ROOT, CHILD, `${TRANSPORT}/trpc.ts`, `${TRANSPORT}/service.ts`, `${TRANSPORT}/shape-node.ts`, `${TRANSPORT}/shape-browser.ts`];
const COMPILER_OPTIONS = {
  target: "ES2022",
  module: "ESNext",
  moduleResolution: "Bundler",
  strict: true,
  skipLibCheck: true,
  allowImportingTsExtensions: true,
  noEmit: true,
  types: [],
  lib: ["es2022", "esnext.disposable"],
};

function fixture(root: string, repoRoot: string): void {
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write(".gitignore", "node_modules\n.cache\nreports\n");
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  mkdirSync(join(root, "packages/server"), { recursive: true });
  symlinkSync(join(repoRoot, "packages/server/node_modules"), join(root, "packages/server/node_modules"), "dir");
  write("tsconfig.json", JSON.stringify({ compilerOptions: COMPILER_OPTIONS, files: SOURCES }));
  write(
    "tsconfig.tests-dom.json",
    JSON.stringify({ compilerOptions: { ...COMPILER_OPTIONS, lib: ["es2022", "dom", "esnext.disposable"], customConditions: ["browser"] }, files: SOURCES }),
  );
  write(
    "packages/server/tsconfig.json",
    JSON.stringify({ compilerOptions: COMPILER_OPTIONS, files: SOURCES.map((path) => path.replace("packages/server/", "")) }),
  );
  write(
    "packages/client/tsconfig.json",
    JSON.stringify({
      compilerOptions: { ...COMPILER_OPTIONS, lib: ["es2022", "dom", "esnext.disposable"], customConditions: ["browser"] },
      files: SOURCES.map((path) => path.replace("packages/server/", "../server/")),
    }),
  );
  write(
    "package.json",
    JSON.stringify({
      name: "native-trpc-output-fixture",
      type: "module",
      imports: { "#native-output": { browser: `./${TRANSPORT}/shape-browser.ts`, default: `./${TRANSPORT}/shape-node.ts` } },
    }),
  );
  write(
    `${TRANSPORT}/trpc.ts`,
    'import {initTRPC} from "@trpc/server"; export const t=initTRPC.create(); export const authedProcedure=t.procedure.use(({next})=>next());',
  );
  write(`${TRANSPORT}/shape-node.ts`, "export interface NativeOutput {id:string}");
  write(`${TRANSPORT}/shape-browser.ts`, "export type NativeOutput=void;");
  write(
    `${TRANSPORT}/service.ts`,
    'import type {NativeOutput} from "#native-output"; export declare function service():{id:string}; export declare function conditional():NativeOutput;',
  );
  write(
    CHILD,
    [
      'import * as transport from "./trpc.ts";',
      'import {z} from "zod";',
      'import {service} from "./service.ts";',
      "export const child=transport.t.router({",
      "read:transport.authedProcedure.query(()=>service()),",
      "parsed:transport.authedProcedure.output(z.object({id:z.string()})).query(()=>service()),",
      "sync:transport.authedProcedure.mutation(()=>{}),",
      "async:transport.authedProcedure.mutation(async()=>{}),",
      'feed:transport.authedProcedure.subscription(async function*(){yield {id:"x"};}),',
      'literal:transport.authedProcedure.query(()=>({ok:true,nested:{label:"x"},items:[{id:"x"}]})),',
      "});",
    ].join("\n"),
  );
  write(
    ROOT,
    [
      'import * as transport from "./trpc.ts";',
      'import {child as imported} from "./child.ts";',
      'import {service,conditional} from "./service.ts";',
      "const mounts={spread:imported};",
      "export const appRouter=transport.t.router({",
      "a:imported,b:imported,...mounts,",
      "nested:{direct:transport.authedProcedure.query(()=>service())},",
      "conditional:transport.authedProcedure.query(()=>conditional()),",
      "});",
    ].join("\n"),
  );
  write("tooling/tsconfig.json", JSON.stringify({ compilerOptions: COMPILER_OPTIONS, files: [`src/verify/gates/${gate.id}.ts`] }));
  write(
    `tooling/src/verify/gates/${gate.id}.ts`,
    `export {gate} from ${JSON.stringify(pathToFileURL(join(repoRoot, `tooling/src/verify/gates/${gate.id}.ts`)).href)};`,
  );
  execFixtureGit(root, ["init", "-q"]);
}

function poisonSyntax(project: Project): Disposable {
  const originalType = Node.prototype.getType;
  const originalSymbol = Node.prototype.getSymbol;
  const originalDefinitions = Identifier.prototype.getDefinitionNodes;
  const types = vi.spyOn(Node.prototype, "getType").mockImplementation(function (this: Node) {
    if (this.getProject() === project) {
      throw new Error("ordinary tRPC syntax Type read");
    }
    return originalType.call(this);
  });
  const symbols = vi.spyOn(Node.prototype, "getSymbol").mockImplementation(function (this: Node) {
    if (this.getProject() === project) {
      throw new Error("ordinary tRPC syntax Symbol read");
    }
    return originalSymbol.call(this);
  });
  const definitions = vi.spyOn(Identifier.prototype, "getDefinitionNodes").mockImplementation(function (this: Identifier) {
    if (this.getProject() === project) {
      throw new Error("ordinary tRPC syntax definition read");
    }
    return originalDefinitions.call(this);
  });
  const checker = vi.spyOn(project, "getTypeChecker").mockImplementation(() => {
    throw new Error("ordinary tRPC syntax checker read");
  });
  return {
    [Symbol.dispose]: (): void => {
      types.mockRestore();
      symbols.mockRestore();
      definitions.mockRestore();
      checker.mockRestore();
    },
  };
}

test(
  "installed tRPC record retains nested imported spread mounts and conditional native outputs",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    for (const [config, count] of [
      ["tsconfig.json", 3],
      ["tsconfig.tests-dom.json", 2],
    ] as const) {
      const project = new Project({ tsConfigFilePath: join(scratch, config) });
      expect(project.getPreEmitDiagnostics().map((diagnostic) => diagnostic.getMessageText())).toEqual([]);
      const root = project.getSourceFileOrThrow(join(scratch, ROOT)).getVariableDeclarationOrThrow("appRouter");
      const definition = root.getType().getPropertyOrThrow("_def").getTypeAtLocation(root);
      const record = definition.getPropertyOrThrow("record").getTypeAtLocation(root);
      expect(record.getProperties().map((symbol) => symbol.getName())).toEqual(["nested", "conditional", "spread", "a", "b"]);
      const child = record.getPropertyOrThrow("a");
      const declaration = child.getDeclarations()[0];
      expect(declaration?.getKind()).toBe(SyntaxKind.PropertyAssignment);
      if (declaration === undefined) {
        throw new Error("native mount declaration is missing");
      }
      const read = child.getTypeAtLocation(declaration).getPropertyOrThrow("read");
      const leaf = read.getDeclarations()[0];
      expect(leaf?.getSourceFile().getFilePath()).toBe(join(scratch, CHILD));
      expect(leaf?.getStart()).not.toBe(root.getStart());
      const result = runPolicyPass({
        root: scratch,
        project,
        nativeTypeFacts: () => isolatedTypeFacts(project),
        knownPolicies: [gate],
        policies: [gate],
        reviewedGrants: [],
        failOnWarnings: false,
      });
      expect(result.toolErrors).toEqual([]);
      expect(result.factErrors).toEqual([]);
      expect(result.authority.effectiveFindings).toHaveLength(count);
      expect(result.authority.effectiveFindings.map(({ message }) => message)).toEqual(
        expect.arrayContaining([expect.stringContaining("Mounted: spread.read, a.read, b.read."), expect.stringContaining("Mounted: nested.direct.")]),
      );
      expect(result.authority.effectiveFindings.some(({ message }) => message?.includes("Mounted: conditional.") === true)).toBe(config === "tsconfig.json");
      const missing = runPolicyPass({ root: scratch, project, knownPolicies: [gate], policies: [gate], reviewedGrants: [], failOnWarnings: false });
      expect(missing.toolErrors.some(({ message }) => message.includes(POLICY_PASS_REFUSALS.nativeTypeContextAbsent))).toBe(true);
    }
  },
  scaledBudget(60_000),
);

test(
  "public tRPC structure and scoped doors use sealed native ownership without syntax semantics",
  async ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const contexts = await import("../../../../tooling/src/verify/lib/project-context.ts");
    const context = projectCtx(scratch);
    const acquire = context.nativeTypeFacts;
    if (acquire === undefined) {
      throw new Error("native fixture acquisition missing");
    }
    let held: TypeObservationReader | undefined;
    const getContext = vi.spyOn(contexts, "projectCtx").mockReturnValue(context);
    using _poison = poisonSyntax(context.project);
    try {
      const structure = await runStructure(scratch, [`--check=${gate.id}`]);
      const scoped = await runScopedCli(scratch, ["--scope", SOURCES.join(",")]);
      const result = runPolicyPass({
        root: scratch,
        project: context.project,
        ...nativeTypeFactOptions(context),
        nativeTypeFacts: () => {
          const owner = acquire();
          return {
            ...owner,
            invocationEvidence: (...args) => {
              const delivered = owner.invocationEvidence(...args);
              for (const evidence of delivered.values()) {
                if (evidence.typeObservations !== undefined) {
                  held = readTypeObservations(evidence.typeObservations);
                  break;
                }
              }
              return delivered;
            },
          };
        },
        knownPolicies: [gate],
        policies: [gate],
        requestedPaths: SOURCES,
        reviewedGrants: [],
        failOnWarnings: false,
      });
      expect({ structure, scoped }).toEqual({ structure: 1, scoped: 1 });
      expect(result.toolErrors).toEqual([]);
      expect(result.factErrors).toEqual([]);
      expect(result.authority.effectiveFindings).toHaveLength(3);
      expect(result.authority.effectiveFindings.map(({ file, line, token }) => ({ file, line, token }))).toEqual(
        expect.arrayContaining([
          { file: CHILD, line: 5, token: "read" },
          { file: ROOT, line: 7, token: "direct" },
          { file: ROOT, line: 8, token: "conditional" },
        ]),
      );
      const retained = held;
      if (retained === undefined) {
        throw new Error("native tRPC lifetime control was not exercised");
      }
      const root = context.project.getSourceFileOrThrow(join(scratch, ROOT)).getVariableDeclarationOrThrow("appRouter");
      expect(() => retained.select(nodeTypeSelector(root))).toThrow("disposed");
    } finally {
      getContext.mockRestore();
    }
  },
  scaledBudget(60_000),
);

test(
  "native tRPC resolver bodies retain named and imported literal exemptions",
  async ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    writeFileSync(
      join(scratch, CHILD),
      [
        'import {service} from "./service.ts";',
        "export function importedLiteral(){return {ok:true};}",
        "export function importedValued(){return service();}",
      ].join("\n"),
    );
    writeFileSync(
      join(scratch, ROOT),
      [
        'import {t,authedProcedure} from "./trpc.ts";',
        'import {importedLiteral as imported,importedValued} from "./child.ts";',
        'import {service} from "./service.ts";',
        "function literal(){return {ok:true};}",
        "function valued(){return service();}",
        "const alias=literal;const importedAlias=imported;",
        "const expression=function named(){return {ok:true};};",
        "const methods={method(){return {ok:true};}};",
        "export const appRouter=t.router({local:authedProcedure.query(literal),alias:authedProcedure.query(alias),imported:authedProcedure.query(importedAlias),expression:authedProcedure.query(expression),valued:authedProcedure.query(valued),importedValued:authedProcedure.query(importedValued),method:authedProcedure.query(methods.method)});",
      ].join("\n"),
    );
    const baseline = new Project({ tsConfigFilePath: join(scratch, "tsconfig.json") });
    expect(baseline.getPreEmitDiagnostics().map((diagnostic) => diagnostic.getMessageText())).toEqual([]);
    const source = baseline.getSourceFileOrThrow(join(scratch, ROOT));
    const literal = source.getFunctionOrThrow("literal").getNameNodeOrThrow();
    expect(resolveCallableDeclaration(literal).kind).toBe("resolved");
    const expression = source.getVariableDeclarationOrThrow("expression").getInitializerOrThrow();
    expect(resolveCallableDeclaration(expression).kind).toBe("resolved");
    expect(Node.isFunctionLikeDeclaration(expression)).toBe(false);
    const method = source.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression).find((node) => node.getText() === "methods.method");
    if (method === undefined) {
      throw new Error("method resolver control missing");
    }
    expect(resolveCallableDeclaration(method).kind).toBe("unresolved");
    const contexts = await import("../../../../tooling/src/verify/lib/project-context.ts");
    const context = projectCtx(scratch);
    const getContext = vi.spyOn(contexts, "projectCtx").mockReturnValue(context);
    using _poison = poisonSyntax(context.project);
    try {
      const structure = await runStructure(scratch, [`--check=${gate.id}`]);
      const scoped = await runScopedCli(scratch, ["--scope", SOURCES.join(",")]);
      const result = runPolicyPass({
        root: scratch,
        project: context.project,
        ...nativeTypeFactOptions(context),
        knownPolicies: [gate],
        policies: [gate],
        requestedPaths: SOURCES,
        reviewedGrants: [],
        failOnWarnings: false,
      });
      expect(result.toolErrors).toEqual([]);
      expect({ structure, scoped }).toEqual({ structure: 1, scoped: 1 });
      expect(result.authority.effectiveFindings.map(({ token }) => token).toSorted((left, right) => (left ?? "").localeCompare(right ?? ""))).toEqual([
        "expression",
        "importedValued",
        "method",
        "valued",
      ]);
    } finally {
      getContext.mockRestore();
    }
  },
  scaledBudget(60_000),
);
