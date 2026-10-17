// Native importing worlds own failure classification; syntax carriers only nominate sites.
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Identifier, Node, SyntaxKind } from "ts-morph";
import { vi } from "vitest";
import type { InventoryInvocationPlan, InventorySpan } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { mapTypeObservationDemand } from "../../../../tooling/src/floor/code-facts/type-observations-codec.ts";
import { TYPE_OBSERVATION_PROFILE } from "../../../../tooling/src/floor/code-facts/type-observations-contract.ts";
import { readTypeObservations } from "../../../../tooling/src/floor/code-facts/type-observations-read.ts";
import { nodeTypeSelector } from "../../../../tooling/src/floor/code-facts/type-projection-contract.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { gate as census } from "../../../../tooling/src/verify/gates/caught-failure-census-row.ts";
import { gate as ownership } from "../../../../tooling/src/verify/gates/caught-failure-ownership.ts";
import { gate as ownershipHealth } from "../../../../tooling/src/verify/gates/caught-failure-ownership-health.ts";
import { gate as traced } from "../../../../tooling/src/verify/gates/detached-work-traced.ts";
import { catchClauseSite, promiseAbsorberSite } from "../../../../tooling/src/verify/lib/caught-failure.ts";
import { deriveRootSpanOpeners, TRACING_MODULE, untracedDispatchSite } from "../../../../tooling/src/verify/lib/detached-work.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { nativeTypeFactOptions, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { deriveCaughtFailureSites } from "../../../../tooling/src/verify/ops/gen/caught-failure-population.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { runScopedCli } from "../../../../tooling/src/verify/ops/scoped.ts";
import { runStructure } from "../../../../tooling/src/verify/ops/structure.ts";
import { scaledBudget } from "../../_load-budget.ts";

test(
  "strict reference results close follow-up raw reads in the same native importing owner",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    writeFileSync(join(scratch, SERVER), "declare const p:Promise<void>;export const recovered=p.catch(error=>({status:'failed',error}));");
    writeFileSync(
      join(scratch, DETACHED),
      "import {recovered} from '../../probe.ts';let local=recovered;local=Promise.resolve({status:'ok',error:null});export function read(){return recovered;}",
    );
    const context = projectCtx(scratch);
    const source = context.project.getSourceFileOrThrow(join(scratch, SERVER));
    const name = source
      .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
      .find((node) => node.getName() === "recovered")
      ?.getNameNode();
    const native = context.nativeTypeFacts?.();
    if (name === undefined || native === undefined) {
      throw new Error("native reference fixture is unavailable");
    }
    const plan: InventoryInvocationPlan = {
      mode: "types",
      facets: [],
      arguments: [],
      typeObservations: mapTypeObservationDemand<Node, InventorySpan>(
        {
          profile: TYPE_OBSERVATION_PROFILE,
          sources: [source],
          nodes: [],
          questions: [{ kind: "reference-closure", nodes: [name], properties: ["then", "ok", "kind", "status", "step", "verdict"] }],
        },
        (node) => ({ file: node.getSourceFile().getFilePath(), start: node.getStart(), end: node.getEnd(), kind: node.getKind() }),
      ),
    };
    const owner = "reference-followup-control";
    try {
      native.request(owner, { kind: "references", nodes: [name], importer: source });
      native.request(owner, { kind: "invocation-evidence", nodes: [source], plan });
      native.seal(new Set([owner]));
      const references = native.references(owner, [name], source).get(name);
      const facts = native.invocationEvidence(owner, [source], plan).get(source)?.typeObservations;
      if (references === undefined || facts === undefined) {
        throw new Error("native reference follow-up facts are unavailable");
      }
      const reader = readTypeObservations(facts, (node) => {
        const value = native.references(owner, [node], source).get(node);
        if (value === undefined) {
          throw new Error("native strict reference answer is unavailable");
        }
        return value;
      });
      const baseline = context
        .nativeSourceView?.(join(scratch, SERVER))
        ?.sourceFile.getVariableDeclarationOrThrow("recovered")
        .getNameNode()
        .asKindOrThrow(SyntaxKind.Identifier)
        .findReferencesAsNodes();
      if (baseline === undefined) {
        throw new Error("native imported reference baseline is unavailable");
      }
      const spans = (nodes: readonly import("ts-morph").Node[]): readonly string[] =>
        nodes.map((node) => `${node.getSourceFile().getFilePath()}:${node.getStart()}:${node.getKind()}`);
      expect(spans(references)).toEqual(spans(baseline));
      expect(references.some((node) => node.getSourceFile().getFilePath().endsWith(DETACHED))).toBe(true);
      for (const node of references) {
        expect(reader.defaultDisplay(nodeTypeSelector(node))).toBe(node.getType().getText());
      }
      expect(() => readTypeObservations(facts)).toThrow("strict reference owner");
      expect(() => readTypeObservations(facts, () => [])).toThrow("foreign");
      expect(() => readTypeObservations({ ...facts, definitions: [] }, () => references)).toThrow("definition-node");
      expect(() => native.references(owner, [name], context.project.getSourceFileOrThrow(join(scratch, CLIENT)))).toThrow();
      const foreign = context.project.getSourceFileOrThrow(join(scratch, CLIENT)).getDescendantsOfKind(SyntaxKind.Identifier)[0];
      if (foreign === undefined) {
        throw new Error("foreign reference control is missing");
      }
      expect(() => reader.defaultDisplay(nodeTypeSelector(foreign))).toThrow();
      const consumer = context.project.getSourceFileOrThrow(join(scratch, DETACHED));
      const written = consumer.getDescendantsOfKind(SyntaxKind.BinaryExpression)[0]?.getLeft().asKindOrThrow(SyntaxKind.Identifier);
      if (written === undefined) {
        throw new Error("native imported source write is missing");
      }
      expect(spans(reader.definitions(written))).toEqual(spans(written.getDefinitionNodes()));
      source.replaceWithText(source.getFullText());
      expect(() => reader.defaultDisplay(nodeTypeSelector(name))).toThrow();
    } finally {
      native[Symbol.dispose]();
    }
  },
  scaledBudget(120_000),
);

const POLICIES = [ownership, ownershipHealth, census, traced];

test(
  "native census derivation retains the central waiver's exact site, coordinates and continued reason",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    writeFileSync(
      join(scratch, DETACHED),
      [
        "declare function background(): Promise<void>;export function launch(): void {",
        "// @orb-waive caught-failure-ownership(background): teardown has no user result.",
        "// Ends when teardown gains a retryable result.",
        "void background().catch(() => undefined);}",
      ].join("\n"),
    );
    const sites = deriveCaughtFailureSites(scratch);
    const site = sites.find((row) => row.path === DETACHED);
    expect(site).toMatchObject({
      siteId: `${DETACHED}::launch::background::1`,
      verdict: "deliberate-absorb",
      reason: "teardown has no user result. Ends when teardown gains a retryable result.",
    });
    const context = projectCtx(scratch);
    const result = runPolicyPass({
      root: scratch,
      project: context.project,
      ...nativeTypeFactOptions(context),
      knownPolicies: POLICIES,
      policies: [ownership],
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(result.toolErrors).toEqual([]);
    expect(result.authority.authorityAlarms).toEqual([]);
    expect(result.authority.waivedFindings).toMatchObject([{ finding: { file: DETACHED, line: site?.line, column: site?.column, token: site?.position } }]);
  },
  scaledBudget(120_000),
);

test(
  "the complete failure and tracing proof population retains every verdict and refusal",
  () => {
    expect(verifyPolicyProofs(POLICIES)).toEqual([]);
  },
  scaledBudget(120_000),
);
const SERVER = "packages/server/src/probe.ts";
const CLIENT = "packages/client/src/probe.ts";
const DETACHED = "packages/server/src/domain/probe/detach.ts";
const COMPILER_OPTIONS = { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true, skipLibCheck: true, types: [] };
const ENTRY = `import {terminal, LINK} from "#meaning";
declare function work(): void;
export function cases(p: Promise<void>): void {
  try { work(); } catch (error) { return terminal(error); }
  void p[LINK](() => undefined);
  void p.catch((failure) => Promise.reject(failure));
}`;

function fixture(root: string, repoRoot: string): void {
  const put = (path: string, source: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), source);
  };
  put(".gitignore", "node_modules\n.cache\nreports\n");
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  const files = {
    [SERVER]: ENTRY,
    [CLIENT]: ENTRY,
    [DETACHED]: "declare function background(): Promise<void>;export function launch(): void {void background().catch(() => undefined);}",
    [TRACING_MODULE]: `import {OPENER} from "#trace-key";
declare const tracer: {startActiveSpan(name: string, options: {root: true}, fn: () => Promise<void>): Promise<void>};
function detached(name: string, fn: () => Promise<void>): Promise<void> {return tracer[OPENER](name, {root: true}, fn);}
export {detached as superviseDetached};`,
    "packages/contracts/src/meaning-node.ts": 'export declare function terminal(error: unknown): never;export declare const LINK: "catch";',
    "packages/contracts/src/meaning-browser.ts": 'export declare function terminal(error: unknown): void;export declare const LINK: "finally";',
    "packages/contracts/src/trace-key.ts": 'export declare const OPENER: "startActiveSpan";',
  };
  for (const [path, text] of Object.entries(files)) {
    put(path, text);
  }
  put(
    "package.json",
    JSON.stringify({
      type: "module",
      imports: {
        "#meaning": { browser: "./packages/contracts/src/meaning-browser.ts", default: "./packages/contracts/src/meaning-node.ts" },
        "#trace-key": "./packages/contracts/src/trace-key.ts",
      },
    }),
  );
  put("tsconfig.json", JSON.stringify({ compilerOptions: { ...COMPILER_OPTIONS, lib: ["ES2022", "DOM"] }, files: Object.keys(files) }));
  put(
    "packages/server/tsconfig.json",
    JSON.stringify({
      compilerOptions: { ...COMPILER_OPTIONS, lib: ["ES2022"] },
      files: ["src/probe.ts", "src/domain/probe/detach.ts", "src/foundation/observability/tracing.ts"],
    }),
  );
  put(
    "packages/client/tsconfig.json",
    JSON.stringify({ compilerOptions: { ...COMPILER_OPTIONS, lib: ["ES2022", "DOM"], customConditions: ["browser"] }, files: ["src/probe.ts"] }),
  );
  put(
    "packages/contracts/tsconfig.json",
    JSON.stringify({ compilerOptions: { ...COMPILER_OPTIONS, lib: ["ES2022"] }, files: ["src/meaning-node.ts", "src/meaning-browser.ts", "src/trace-key.ts"] }),
  );
  put("tooling/tsconfig.json", JSON.stringify({ compilerOptions: COMPILER_OPTIONS, files: POLICIES.map(({ id }) => `src/verify/gates/${id}.ts`) }));
  for (const { id } of POLICIES) {
    put(`tooling/src/verify/gates/${id}.ts`, `export {gate} from ${JSON.stringify(pathToFileURL(join(repoRoot, `tooling/src/verify/gates/${id}.ts`)).href)};`);
  }
  put(
    "tooling/src/verify/gates/caught-failure-ownership.population.json",
    JSON.stringify({
      rows: [`${SERVER}::cases::p::1`, `${CLIENT}::cases::error::1`, `${DETACHED}::launch::background::1`].map((siteId) => ({
        siteId,
        verdict: "unproven",
        reason: null,
      })),
    }),
  );
  execFixtureGit(root, ["init", "-q"]);
}

function nativeFailureBaseline(context: ReturnType<typeof projectCtx>, scratch: string, path: string, browser: boolean): void {
  const native = context.nativeSourceView?.(join(scratch, path));
  if (native === undefined) {
    throw new Error("actual native failure source is missing");
  }
  const clause = native.sourceFile.getDescendantsOfKind(SyntaxKind.CatchClause)[0];
  if (clause === undefined) {
    throw new Error("native catch clause is missing");
  }
  expect(catchClauseSite(clause)?.anchor?.token).toBe(browser ? "error" : undefined);
  const calls = native.sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
  const link = calls.find((call) => call.getExpression().getText() === "p[LINK]");
  const propagated = calls.find((call) => call.getExpression().getText() === "p.catch");
  if (link === undefined || propagated === undefined) {
    throw new Error("native rejection calls are missing");
  }
  expect(promiseAbsorberSite(link)?.anchor?.token).toBe(browser ? undefined : "p");
  expect(untracedDispatchSite(link.getFirstAncestorByKindOrThrow(SyntaxKind.ExpressionStatement), new Set())?.anchor?.token).toBe(browser ? undefined : "p");
  expect(promiseAbsorberSite(propagated)).toBeUndefined();
}

function nativeBaseline(context: ReturnType<typeof projectCtx>, scratch: string): void {
  nativeFailureBaseline(context, scratch, SERVER, false);
  nativeFailureBaseline(context, scratch, CLIENT, true);
  const tracing = context.nativeSourceView?.(join(scratch, TRACING_MODULE));
  const detached = context.nativeSourceView?.(join(scratch, DETACHED));
  if (tracing === undefined || detached === undefined) {
    throw new Error("actual native tracing sources are missing");
  }
  const openers = deriveRootSpanOpeners([tracing.sourceFile]);
  expect([...openers]).toEqual(["detached"]);
  const statement = detached.sourceFile.getDescendantsOfKind(SyntaxKind.ExpressionStatement)[0];
  if (statement === undefined) {
    throw new Error("native detached statement is missing");
  }
  expect(untracedDispatchSite(statement, openers)?.anchor?.token).toBe("background");
}

test(
  "native failure and tracing commands preserve conditional-world meanings without syntax Type, Symbol, or definitions",
  async ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const context = projectCtx(scratch);
    nativeBaseline(context, scratch);
    const getType = Node.prototype.getType;
    const getSymbol = Node.prototype.getSymbol;
    const getDefinitions = Identifier.prototype.getDefinitions;
    const getDefinitionNodes = Identifier.prototype.getDefinitionNodes;
    const findReferences = Identifier.prototype.findReferencesAsNodes;
    const types = vi.spyOn(Node.prototype, "getType").mockImplementation(function (this: Node) {
      if (this.getProject() === context.project) {
        throw new Error("ordinary syntax failure Type read");
      }
      return getType.call(this);
    });
    const symbols = vi.spyOn(Node.prototype, "getSymbol").mockImplementation(function (this: Node) {
      if (this.getProject() === context.project) {
        throw new Error("ordinary syntax failure Symbol read");
      }
      return getSymbol.call(this);
    });
    const definitions = vi.spyOn(Identifier.prototype, "getDefinitions").mockImplementation(function (this: Identifier) {
      if (this.getProject() === context.project) {
        throw new Error("ordinary syntax failure definition read");
      }
      return getDefinitions.call(this);
    });
    const definitionNodes = vi.spyOn(Identifier.prototype, "getDefinitionNodes").mockImplementation(function (this: Identifier) {
      if (this.getProject() === context.project) {
        throw new Error("ordinary syntax failure definition-node read");
      }
      return getDefinitionNodes.call(this);
    });
    const references = vi.spyOn(Identifier.prototype, "findReferencesAsNodes").mockImplementation(function (this: Identifier) {
      if (this.getProject() === context.project) {
        throw new Error("ordinary syntax failure reference read");
      }
      return findReferences.call(this);
    });
    const contexts = await import("../../../../tooling/src/verify/lib/project-context.ts");
    const useContext = vi.spyOn(contexts, "projectCtx").mockReturnValue(context);
    try {
      expect
        .soft(
          await runStructure(
            scratch,
            POLICIES.map(({ id }) => `--check=${id}`),
          ),
        )
        .toBe(1);
      expect.soft(await runScopedCli(scratch, ["--scope", "packages/**"])).toBe(1);
      const result = runPolicyPass({
        root: scratch,
        project: context.project,
        ...nativeTypeFactOptions(context),
        knownPolicies: POLICIES,
        policies: POLICIES,
        reviewedGrants: [],
        failOnWarnings: false,
      });
      expect.soft(result.toolErrors).toEqual([]);
      expect.soft(result.policies.find(({ id }) => id === ownership.id)?.findings).toMatchObject([
        { file: CLIENT, token: "error" },
        { file: DETACHED, token: "background" },
        { file: SERVER, token: "p" },
      ]);
      expect.soft(result.policies.find(({ id }) => id === traced.id)?.findings).toMatchObject([
        { file: DETACHED, token: "background" },
        { file: SERVER, token: "p" },
      ]);
      for (const id of [ownershipHealth.id, census.id]) {
        expect.soft(result.policies.find((policy) => policy.id === id)?.findings).toEqual([]);
      }
      expect(deriveCaughtFailureSites(scratch).map(({ siteId, verdict, reason }) => ({ siteId, verdict, reason }))).toEqual([
        { siteId: `${CLIENT}::cases::error::1`, verdict: "unproven", reason: null },
        { siteId: `${DETACHED}::launch::background::1`, verdict: "unproven", reason: null },
        { siteId: `${SERVER}::cases::p::1`, verdict: "unproven", reason: null },
      ]);
    } finally {
      useContext.mockRestore();
      references.mockRestore();
      definitionNodes.mockRestore();
      definitions.mockRestore();
      symbols.mockRestore();
      types.mockRestore();
    }
  },
  scaledBudget(120_000),
);
