// Native DOM ownership must survive the public verifier doors without consulting syntax-carrier semantics.
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Node, Project } from "ts-morph";
import { afterEach, beforeEach, vi } from "vitest";
import { replayInvocationEvidence } from "../../../../tooling/src/floor/code-facts/invocation-evidence-replay.ts";
import type { InventorySpan } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { mapTypeObservationDemand } from "../../../../tooling/src/floor/code-facts/type-observations-codec.ts";
import type { TypeObservationDemand } from "../../../../tooling/src/floor/code-facts/type-observations-contract.ts";
import { TYPE_OBSERVATION_PROFILE } from "../../../../tooling/src/floor/code-facts/type-observations-contract.ts";
import { readTypeObservations } from "../../../../tooling/src/floor/code-facts/type-observations-read.ts";
import { inventoryQueryNode } from "../../../../tooling/src/floor/compiler/drizzle-inventory-extract.ts";
import { captureInvocationEvidence, encodeInvocationEvidence } from "../../../../tooling/src/floor/compiler/invocation-evidence-extract.ts";
import { createSemanticWorkspace } from "../../../../tooling/src/floor/compiler/ts-workspace.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { CLIENT_GLOBALS } from "../../../../tooling/src/verify/contract/css-family.ts";
import { defineFact } from "../../../../tooling/src/verify/contract/fact.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import type { StaticClassNativeContext } from "../../../../tooling/src/verify/contract/static-class-expression.ts";
import { gate as lengths } from "../../../../tooling/src/verify/gates/css-length-tokens-health.ts";
import { gate as selectors } from "../../../../tooling/src/verify/gates/css-selector-has-a-writer.ts";
import { SELECTOR_FIXTURE } from "../../../../tooling/src/verify/lib/css-family-proof-fixtures.ts";
import type { CssHookProvenance } from "../../../../tooling/src/verify/lib/css-family-source-provenance.ts";
import { cssHookProvenanceFact } from "../../../../tooling/src/verify/lib/css-family-source-provenance.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { nativeTypeFactOptions, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { STATIC_CLASS_KINDS, StaticClassCollector } from "../../../../tooling/src/verify/lib/static-class-expression.ts";
import { staticClassSourceIndex } from "../../../../tooling/src/verify/lib/static-class-expression-model.ts";
import { nativeStaticClassRead } from "../../../../tooling/src/verify/lib/static-class-native.ts";
import { StaticClassEvaluator } from "../../../../tooling/src/verify/lib/static-class-value.ts";
import { isolatedTypeFacts } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
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

const ENTRY = "packages/client/src/features/native-css.tsx";
const POLICIES = [lengths, selectors];
const MODULES = [...POLICIES.map(({ id }) => id), "css-length-tokens", "css-family-ownership"];
const SOURCE = `import { IMPORTED } from '#native-css-classes';
import { createLucideIcon } from 'lucide-react';
const iconNodes = [['path', { className: 'probe-lucide' }]];
const iconAlias = iconNodes;
iconAlias.push(['path', { className: 'probe-pushed' }]);
createLucideIcon('Safe', iconNodes);
const escapedNodes = [['path', { className: 'probe-escaped' }]];
declare function mutate(value: typeof escapedNodes): void;
mutate(escapedNodes);
createLucideIcon('Escaped', escapedNodes);
export const importedView = <div className={IMPORTED} />;
declare const element: HTMLElement;
declare const state: 'open' | 'closed';
const classes = ' probe-trim '.trim();
export const view = <div className={classes} />;
element.classList.add('probe-dom');
element.className = 'probe-assignment';
element.setAttribute('data-probe', state);
declare const fake: {classList: {add(value: string): void}; className: string; setAttribute(name: string, value: string): void};
fake.classList.add('probe-fake');
fake.className = 'probe-fake-assignment';
fake.setAttribute('data-fake', state);
`;

function fixture(root: string, repoRoot: string): void {
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write(".gitignore", "node_modules\n.cache\nreports\n");
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  const compilerOptions = { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", jsx: "preserve", strict: true, skipLibCheck: true, types: [] };
  const sources = [
    ENTRY,
    "packages/ui/src/native-css-classes.ts",
    ...Object.keys(SELECTOR_FIXTURE).filter((path) => path.endsWith(".tsx") || (path.endsWith(".ts") && !path.includes("node_modules"))),
  ];
  write("tsconfig.json", JSON.stringify({ compilerOptions: { ...compilerOptions, lib: ["ES2022"] }, files: [...sources, "node-globals.d.ts"] }));
  write("tsconfig.tests-dom.json", JSON.stringify({ compilerOptions: { ...compilerOptions, lib: ["ES2022", "DOM"] }, files: sources }));
  for (const name of ["client", "ui"]) {
    write(
      `packages/${name}/tsconfig.json`,
      JSON.stringify({
        compilerOptions: { ...compilerOptions, lib: ["ES2022", "DOM"] },
        files: sources.filter((path) => path.startsWith(`packages/${name}/`)).map((path) => `../../${path}`),
      }),
    );
  }
  write(
    "package.json",
    JSON.stringify({ name: "native-css-fixture", type: "module", imports: { "#native-css-classes": "./packages/ui/src/native-css-classes.ts" } }),
  );
  write(
    "node-globals.d.ts",
    "interface DOMTokenList {add(value:string):void} interface HTMLElement {classList:DOMTokenList;className:string;setAttribute(name:string,value:string):void}\ndeclare namespace JSX {interface IntrinsicElements {div: {className:string}}}\n",
  );
  for (const [path, text] of Object.entries(SELECTOR_FIXTURE)) {
    write(path, text);
  }
  write(CLIENT_GLOBALS, ".probe-dom {}\n.probe-assignment {}\n[data-probe=open] {}\n");
  write(ENTRY, SOURCE);
  write("packages/ui/src/native-css-classes.ts", "export const IMPORTED = 'probe-imported';\n");
  write("tooling/tsconfig.json", JSON.stringify({ compilerOptions, files: MODULES.map((id) => `src/verify/gates/${id}.ts`) }));
  for (const id of MODULES) {
    write(
      `tooling/src/verify/gates/${id}.ts`,
      `export {gate} from ${JSON.stringify(new URL(`../../../../tooling/src/verify/gates/${id}.ts`, import.meta.url).href)};`,
    );
  }
  execFixtureGit(root, ["init", "-q"]);
}

function capturePolicy(capture: (value: CssHookProvenance) => void): GatePolicy {
  return defineGate({
    id: "native-css-capture",
    family: "native-css-capture",
    authority: "hard",
    severity: "error",
    population: "@frontend",
    analysis: "types",
    execution: "entire-population",
    facts: [cssHookProvenanceFact],
    resources: [],
    message: "capture native CSS evidence",
    create: (ctx) => ({
      evaluate: () => {
        capture(ctx.fact(cssHookProvenanceFact));
        ctx.receipt({ kind: "population", source: "native-css-capture", members: 1 });
      },
    }),
    mustFlag: [{ mode: "types", files: { [ENTRY]: SOURCE }, expect: { count: 1 }, why: "unexecuted descriptor shape; the test observes provider delivery" }],
    mustPass: [{ mode: "types", files: { [ENTRY]: SOURCE }, why: "unexecuted descriptor shape; the test observes provider delivery" }],
  });
}

function poisonSyntax(project: Project): Disposable {
  const readType = Node.prototype.getType;
  const readSymbol = Node.prototype.getSymbol;
  const types = vi.spyOn(Node.prototype, "getType").mockImplementation(function (this: Node) {
    if (this.getProject() === project) {
      throw new Error("ordinary CSS Type read");
    }
    return readType.call(this);
  });
  const symbols = vi.spyOn(Node.prototype, "getSymbol").mockImplementation(function (this: Node) {
    if (this.getProject() === project) {
      throw new Error("ordinary CSS Symbol read");
    }
    return readSymbol.call(this);
  });
  const definitions = project
    .getSourceFiles()
    .flatMap((source) => source.getDescendants().filter(Node.isIdentifier))
    .flatMap((node) => [
      vi.spyOn(node, "getDefinitions").mockImplementation(() => {
        throw new Error("ordinary CSS definitions read");
      }),
      vi.spyOn(node, "getDefinitionNodes").mockImplementation(() => {
        throw new Error("ordinary CSS definition nodes read");
      }),
      vi.spyOn(node, "findReferencesAsNodes").mockImplementation(() => {
        throw new Error("ordinary CSS references read");
      }),
    ]);
  const checker = vi.spyOn(project, "getTypeChecker").mockImplementation(() => {
    throw new Error("ordinary CSS checker read");
  });
  return {
    [Symbol.dispose]: (): void => {
      checker.mockRestore();
      for (const spy of definitions) {
        spy.mockRestore();
      }
      symbols.mockRestore();
      types.mockRestore();
    },
  };
}

test(
  "native CSS baseline separates actual browser DOM declarations from Node and local lookalikes",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const workspace = createSemanticWorkspace({ root: scratch });
    for (const config of ["tsconfig.json", "tsconfig.tests-dom.json"]) {
      const source = workspace.program(config)?.sourceFile(ENTRY);
      if (source === undefined) {
        throw new Error(`missing native CSS source for ${config}`);
      }
      let captured: CssHookProvenance | undefined;
      const policy = capturePolicy((value) => {
        captured = value;
      });
      const result = runPolicyPass({
        root: scratch,
        project: source.getProject(),
        nativeTypeFacts: () => isolatedTypeFacts(source.getProject()),
        policies: [policy],
        knownPolicies: [policy],
        reviewedGrants: [],
        failOnWarnings: false,
      });
      expect(result.toolErrors).toEqual([]);
      expect(result.factErrors).toEqual([]);
      expect(captured?.owners.has("class:probe-trim")).toBe(true);
      expect(captured?.owners.has("class:probe-imported")).toBe(true);
      expect(captured?.owners.has("class:probe-lucide")).toBe(true);
      expect(captured?.owners.has("class:probe-pushed")).toBe(true);
      expect(captured?.owners.has("class:probe-escaped")).toBe(false);

      expect(captured?.owners.has("class:probe-dom")).toBe(config === "tsconfig.tests-dom.json");
      expect(captured?.owners.has("class:probe-assignment")).toBe(config === "tsconfig.tests-dom.json");
      expect(captured?.owners.has("class:probe-fake")).toBe(false);
      expect(captured?.owners.has("class:probe-fake-assignment")).toBe(false);
      expect([...(captured?.writers.data.get("data-probe")?.values ?? [])].sort()).toEqual(config === "tsconfig.tests-dom.json" ? ["closed", "open"] : []);
      expect(captured?.writers.data.has("data-fake")).toBe(false);
    }
  },
  scaledBudget(60_000),
);

for (const policy of POLICIES) {
  test(
    `${policy.id} public structure requires native CSS evidence with ordinary semantics poisoned`,
    async ({ scratch, repoRoot }) => {
      const nativeSyntaxReads: number[] = [];
      fixture(scratch, repoRoot);
      const contexts = await import("../../../../tooling/src/verify/lib/project-context.ts");
      const context = projectCtx(scratch);
      const run = (): ReturnType<typeof runPolicyPass> =>
        runPolicyPass({
          root: scratch,
          project: context.project,
          ...nativeTypeFactOptions(context),
          policies: [policy],
          knownPolicies: POLICIES,
          reviewedGrants: [],
          failOnWarnings: false,
        });
      const baseline = run();
      expect(baseline.toolErrors).toEqual([]);
      expect(baseline.factErrors).toEqual([]);
      const getContext = vi.spyOn(contexts, "projectCtx").mockReturnValue(context);
      using _poison = poisonSyntax(context.project);
      try {
        const exits = [
          await nativeVerifyFixture(scratch, "structure", [`--check=${policy.id}`], { forbidSyntax: true, syntaxReads: nativeSyntaxReads }),
          await nativeVerifyFixture(scratch, "scoped", ["--scope", "packages/client,packages/ui"], { forbidSyntax: true, syntaxReads: nativeSyntaxReads }),
        ];
        const result = run();
        expect({ exits, errors: result.factErrors, withheld: result.authority.withheldPolicyIds }).toEqual({ exits: [0, 0], errors: [], withheld: [] });
        expect(result.authority.effectiveFindings).toEqual([]);
      } finally {
        getContext.mockRestore();
      }

      expect(nativeSyntaxReads).toEqual([0, 0]);
    },
    scaledBudget(60_000 * 4),
  );
}

test(
  "native CSS repeated resolution refuses a changed related source and retained callbacks refuse disposal",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    writeFileSync(
      join(scratch, "packages/ui/src/native-css-classes.ts"),
      'import{clsx}from"clsx";export const IMPORTED="probe-imported";export const compose=(value:string)=>clsx(value);',
    );
    writeFileSync(
      join(scratch, ENTRY),
      `${SOURCE}\nimport{compose}from"../../../ui/src/native-css-classes.ts";export const composed=compose("probe-composed");`,
    );
    const context = projectCtx(scratch);
    let initial: string | undefined;
    let stale: string | undefined;
    let repeated: string | undefined;
    let retained: (() => string | undefined) | undefined;
    const provider = defineFact({
      id: "native-css-lifetime",
      population: "@frontend",
      analysis: "types",
      resources: [],
      create: (ctx) => {
        const nodes: Node[] = [];
        const native = nativeStaticClassRead(ctx, () => nodes);
        const collector = new StaticClassCollector(ctx.files, native);
        return {
          prepare: native.prepare,
          visitors: [
            {
              kinds: STATIC_CLASS_KINDS,
              visit: (node): void => {
                nodes.push(node);
              },
            },
          ],
          finish: (): boolean => {
            for (const node of nodes) {
              collector.index(node);
            }
            const call = ctx.sourceFile(ENTRY).getVariableDeclarationOrThrow("composed").getInitializerOrThrow();
            if (!Node.isCallExpression(call)) {
              throw new Error("CSS lifetime call missing");
            }
            retained = () => collector.composerOf(call);
            initial = retained();
            const related = ctx.sourceFile("packages/ui/src/native-css-classes.ts");
            related.replaceWithText(related.getFullText());
            try {
              repeated = retained();
            } catch (error) {
              stale = error instanceof Error ? error.message : String(error);
            }
            ctx.receipt({ kind: "population", source: "native-css-lifetime", members: ctx.files.length });
            return true;
          },
        };
      },
    });
    const policy = defineGate({
      id: "native-css-lifetime",
      family: "native-css-lifetime",
      authority: "hard",
      severity: "error",
      population: "@frontend",
      analysis: "types",
      execution: "entire-population",
      facts: [provider],
      resources: [],
      message: "observe native CSS lifetime",
      create: (ctx) => ({
        evaluate: (): void => {
          ctx.fact(provider);
          ctx.receipt({ kind: "population", source: "native-css-lifetime", members: 1 });
        },
      }),
      mustFlag: [
        { mode: "types", files: { [ENTRY]: SOURCE }, expect: { count: 1 }, why: "descriptor-only shape; actual assertions exercise the public dispatcher" },
      ],
      mustPass: [{ mode: "types", files: { [ENTRY]: SOURCE }, why: "descriptor-only shape; actual assertions exercise the public dispatcher" }],
    });
    const result = runPolicyPass({
      root: scratch,
      project: context.project,
      ...nativeTypeFactOptions(context),
      policies: [policy],
      knownPolicies: [policy],
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(result.factErrors).toEqual([]);
    expect(result.toolErrors).toEqual([]);
    expect({ initial, repeated, refused: stale !== undefined }).toEqual({ initial: "join", repeated: undefined, refused: true });
    expect(stale).toMatch(/epoch|stale|captured/u);
    expect(retained).toBeDefined();
    expect(() => retained?.()).toThrow(/disposed/u);
  },
  scaledBudget(60_000),
);

test(
  "one CSS evaluator retains distinct conditional-import meanings for the same physical carrier",
  ({ scratch }) => {
    const write = (path: string, text: string): void => {
      mkdirSync(dirname(join(scratch, path)), { recursive: true });
      writeFileSync(join(scratch, path), text);
    };
    const files = {
      "shared.ts": 'import{classes}from"#classes";export const held=classes;',
      "node.ts": 'export const classes="probe-node";',
      "browser.ts": 'export const classes="probe-browser";',
    };
    for (const [path, text] of Object.entries(files)) {
      write(path, text);
    }
    const options = { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", types: [], strict: true };
    write("tsconfig.json", JSON.stringify({ compilerOptions: { ...options, lib: ["ES2022"] }, files: ["shared.ts", "node.ts", "browser.ts"] }));
    write(
      "tsconfig.tests-dom.json",
      JSON.stringify({ compilerOptions: { ...options, lib: ["ES2022", "DOM"], customConditions: ["browser"] }, files: ["shared.ts", "node.ts", "browser.ts"] }),
    );
    write("package.json", JSON.stringify({ type: "module", imports: { "#classes": { browser: "./browser.ts", default: "./node.ts" } } }));
    execFixtureGit(scratch, ["init", "-q"]);
    const workspace = createSemanticWorkspace({ root: scratch });
    const carrier = new Project({
      useInMemoryFileSystem: true,
      skipLoadingLibFiles: true,
      skipFileDependencyResolution: true,
      skipAddingFilesFromTsConfig: true,
    });
    const syntax = Object.entries(files).map(([path, text]) => carrier.createSourceFile(join(scratch, path), text));
    const root = carrier.getSourceFileOrThrow(join(scratch, "shared.ts")).getVariableDeclarationOrThrow("held").getInitializerOrThrow();
    const span = (node: Node): InventorySpan => ({
      file: node.getSourceFile().getFilePath(),
      start: node.getStart(),
      end: node.getEnd(),
      kind: node.getKind(),
    });
    const contexts = ["tsconfig.json", "tsconfig.tests-dom.json"].map((config): StaticClassNativeContext => {
      const source = workspace.program(config)?.sourceFile("shared.ts");
      if (source === undefined) {
        throw new Error("conditional native CSS source missing");
      }
      const node = source.getVariableDeclarationOrThrow("held").getInitializerOrThrow();
      const demand: TypeObservationDemand = {
        profile: TYPE_OBSERVATION_PROFILE,
        sources: [source],
        nodes: [],
        questions: [{ kind: "declaration-closure", nodes: [node], files: syntax.map((file) => file.getFilePath()) }],
      };
      const plan = { mode: "types" as const, facets: [], arguments: [], typeObservations: mapTypeObservationDemand(demand, span) };
      const captured = captureInvocationEvidence(source, plan, undefined, demand);
      const wire = encodeInvocationEvidence(source, plan, captured, span);
      const evidence = replayInvocationEvidence(wire, (value) => inventoryQueryNode(carrier.getSourceFile(value.file), value), {
        globals: new Map(),
        declarations: () => {
          throw new Error("unrequested conditional CSS binding");
        },
        computedName: () => {
          throw new Error("unrequested conditional CSS computed name");
        },
      });
      if (evidence.typeObservations === undefined) {
        throw new Error("conditional CSS type evidence missing");
      }
      return {
        evidence,
        types: readTypeObservations(evidence.typeObservations),
        references: () => {
          throw new Error("unrequested conditional CSS references");
        },
      };
    });
    let current = contexts[0];
    using _poison = poisonSyntax(carrier);
    const evaluator = new StaticClassEvaluator(staticClassSourceIndex(syntax), syntax, undefined, () => current);
    const values: string[][] = [];
    for (const context of [contexts[0], contexts[1], contexts[0]]) {
      if (context === undefined) {
        throw new Error("conditional CSS context missing");
      }
      current = context;
      values.push(evaluator.evalClass(root, new Set()).map((value) => value.value));
    }
    expect(values).toEqual([["probe-node"], ["probe-browser"], ["probe-node"]]);
    expect(evaluator.unresolved).toEqual([]);
    expect(evaluator.opaque).toEqual([]);
  },
  scaledBudget(60_000),
);
