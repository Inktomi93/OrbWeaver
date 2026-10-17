import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Identifier, Node, Project } from "ts-morph";
import { afterEach, beforeEach, vi } from "vitest";
import type { TypeObservationReader } from "../../../../tooling/src/floor/code-facts/type-observations-contract.ts";
import { readTypeObservations } from "../../../../tooling/src/floor/code-facts/type-observations-read.ts";
import { inventoryQueryNode } from "../../../../tooling/src/floor/compiler/drizzle-inventory-extract.ts";
import { captureInvocationEvidence } from "../../../../tooling/src/floor/compiler/invocation-evidence-extract.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import type { NativeTypeRequest } from "../../../../tooling/src/verify/contract/project-context.ts";
import { gate as beltTotal } from "../../../../tooling/src/verify/gates/bus-belt-total.ts";
import { gate as consumerBelt } from "../../../../tooling/src/verify/gates/bus-consumer-belt.ts";
import { gate as definitionBelts } from "../../../../tooling/src/verify/gates/bus-definition-belts.ts";
import { gate as payloadHealth } from "../../../../tooling/src/verify/gates/bus-payload-allowlist-health.ts";
import { gate as producerCoverage } from "../../../../tooling/src/verify/gates/bus-producer-coverage.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { nativeTypeFactOptions, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { typeObservationPlan } from "../../../../tooling/src/verify/lib/type-observation-context.ts";
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

const COMPILER_OPTIONS = { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true, skipLibCheck: true, types: [] };
const NODE_BUS = "packages/contracts/src/chat/bus.ts";
const BROWSER_BUS = "packages/contracts/src/user-bus/index.ts";
const NODE_ARM = "packages/contracts/src/native/node-arm.ts";
const BROWSER_ARM = "packages/contracts/src/native/browser-arm.ts";
const SHARED_ARM = "packages/contracts/src/native/shared.ts";
const SOURCES = [NODE_BUS, BROWSER_BUS, NODE_ARM, BROWSER_ARM, SHARED_ARM];
const POLICIES = [beltTotal, consumerBelt, definitionBelts, payloadHealth, producerCoverage];

function fixture(root: string, repoRoot: string): void {
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write(".gitignore", "node_modules\n.cache\nreports\n");
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  const compilerOptions = COMPILER_OPTIONS;
  write("tsconfig.json", JSON.stringify({ compilerOptions: { ...compilerOptions, lib: ["es2022"] }, files: [NODE_BUS, NODE_ARM, SHARED_ARM] }));
  write(
    "tsconfig.tests-dom.json",
    JSON.stringify({ compilerOptions: { ...compilerOptions, lib: ["es2022", "dom"], customConditions: ["browser"] }, files: [BROWSER_BUS, BROWSER_ARM] }),
  );
  write(
    "package.json",
    JSON.stringify({
      name: "native-bus-fixture",
      type: "module",
      imports: { "#bus-arm": { browser: `./${BROWSER_ARM}`, default: `./${NODE_ARM}` } },
    }),
  );
  write(SHARED_ARM, 'import type {NativeArm} from "#bus-arm"; export interface SharedArm extends NativeArm {}\n');
  write(NODE_ARM, 'export interface NativeArm { type: "node"; apiKey: string; }\n');
  write(BROWSER_ARM, 'export interface NativeArm { type: "stable"; payload: string; }\n');
  write(
    NODE_BUS,
    'import type {SharedArm} from "../native/shared.ts";\ntype ChatBusEvent = SharedArm | {type:"stable";chatId:string};export{ChatBusEvent};\nexport const CHAT_BUS_EVENT_TYPES = ["stable"] as const satisfies readonly ChatBusEvent["type"][];\n',
  );
  write(
    BROWSER_BUS,
    'import type {SharedArm} from "../native/shared.ts";\ntype UserBusEvent = SharedArm | {type:"stable";userId:string};export{UserBusEvent};\nexport const USER_BUS_EVENT_TYPES = ["stable"] as const satisfies readonly UserBusEvent["type"][];\n',
  );
  write("tooling/tsconfig.json", JSON.stringify({ compilerOptions, files: POLICIES.map(({ id }) => `src/verify/gates/${id}.ts`) }));
  for (const { id } of POLICIES) {
    write(
      `tooling/src/verify/gates/${id}.ts`,
      `export {gate} from ${JSON.stringify(new URL(`../../../../tooling/src/verify/gates/${id}.ts`, import.meta.url).href)};`,
    );
  }
  execFixtureGit(root, ["init", "-q"]);
}

function poisonSyntax(project: Project): Disposable {
  const symbolFor = Node.prototype.getSymbol;
  const typeFor = Node.prototype.getType;
  const definitionsFor = Identifier.prototype.getDefinitionNodes;
  const symbols = vi.spyOn(Node.prototype, "getSymbol").mockImplementation(function (this: Node) {
    if (this.getProject() === project) {
      throw new Error("syntax bus Symbol read");
    }
    return symbolFor.call(this);
  });
  const types = vi.spyOn(Node.prototype, "getType").mockImplementation(function (this: Node) {
    if (this.getProject() === project) {
      throw new Error("syntax bus Type read");
    }
    return typeFor.call(this);
  });
  const definitions = vi.spyOn(Identifier.prototype, "getDefinitionNodes").mockImplementation(function (this: Identifier) {
    if (this.getProject() === project) {
      throw new Error("syntax bus definition read");
    }
    return definitionsFor.call(this);
  });
  const checker = vi.spyOn(project, "getTypeChecker").mockImplementation(() => {
    throw new Error("syntax bus checker read");
  });
  return {
    [Symbol.dispose]: (): void => {
      symbols.mockRestore();
      types.mockRestore();
      definitions.mockRestore();
      checker.mockRestore();
    },
  };
}

test(
  "native bus fixture distinguishes Node and browser meanings while a missing tuple member remains compiler-legal",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    for (const [config, expected] of [
      ["tsconfig.json", [beltTotal.id, consumerBelt.id, producerCoverage.id]],
      ["tsconfig.tests-dom.json", [consumerBelt.id, producerCoverage.id]],
    ] as const) {
      const project = new Project({ tsConfigFilePath: join(scratch, config) });
      expect(project.getPreEmitDiagnostics()).toEqual([]);
      const result = runPolicyPass({
        root: scratch,
        project,
        nativeTypeFacts: () => isolatedTypeFacts(project),
        knownPolicies: POLICIES,
        policies: POLICIES,
        reviewedGrants: [],
        failOnWarnings: false,
      });
      expect(result.toolErrors).toEqual([]);
      expect(result.factErrors).toEqual([]);
      expect(result.authority.effectiveFindings.map(({ policyId }) => policyId).toSorted()).toEqual(expected.toSorted());
      expect(
        result.authority.effectiveFindings
          .filter(({ policyId }) => policyId === beltTotal.id)
          .map(({ message }) => message?.includes("missing: node; not in the union: none")),
      ).toEqual(config === "tsconfig.json" ? [true] : []);
    }
  },
  scaledBudget(60_000),
);

test(
  "native bus structure and scoped doors preserve importing-world belts without ordinary typed reads",
  async ({ scratch, repoRoot }) => {
    const nativeSyntaxReads: number[] = [];
    fixture(scratch, repoRoot);
    const contexts = await import("../../../../tooling/src/verify/lib/project-context.ts");
    const context = projectCtx(scratch);
    const getContext = vi.spyOn(contexts, "projectCtx").mockReturnValue(context);
    using _poison = poisonSyntax(context.project);
    try {
      const structure: number[] = [];
      for (const { id } of POLICIES) {
        structure.push(await nativeVerifyFixture(scratch, "structure", [`--check=${id}`], { forbidSyntax: true, syntaxReads: nativeSyntaxReads }));
      }
      const scoped = await nativeVerifyFixture(scratch, "scoped", ["--scope", SOURCES.join(",")], { forbidSyntax: true, syntaxReads: nativeSyntaxReads });
      expect({ structure, scoped }).toEqual({ structure: [1, 1, 0, 0, 1], scoped: 1 });
      const result = runPolicyPass({
        root: scratch,
        project: context.project,
        ...nativeTypeFactOptions(context),
        knownPolicies: POLICIES,
        policies: POLICIES,
        requestedPaths: SOURCES,
        reviewedGrants: [],
        failOnWarnings: false,
      });
      expect(result.toolErrors).toEqual([]);
      expect(result.factErrors).toEqual([]);
      expect(
        result.authority.effectiveFindings
          .filter(({ policyId }) => policyId === beltTotal.id)
          .map(({ file, line, column, token }) => ({ file, line, column, token })),
      ).toEqual([{ file: NODE_BUS, line: 3, column: 14, token: "CHAT_BUS_EVENT_TYPES" }]);
      expect(result.authority.effectiveFindings.map(({ policyId, file }) => ({ policyId, file }))).toEqual([
        { policyId: consumerBelt.id, file: NODE_BUS },
        { policyId: beltTotal.id, file: NODE_BUS },
        { policyId: producerCoverage.id, file: NODE_BUS },
        { policyId: consumerBelt.id, file: BROWSER_BUS },
        { policyId: producerCoverage.id, file: BROWSER_BUS },
      ]);
    } finally {
      getContext.mockRestore();
    }

    expect(nativeSyntaxReads).toEqual([...POLICIES.map(() => 0), 0]);
  },
  scaledBudget(60_000 * (POLICIES.length + 2)),
);

test(
  "shared physical carriers retain browser-only inherited member identities instead of reusing a Node visit",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    writeFileSync(join(scratch, NODE_ARM), 'export interface NativeArm {type:"stable";safe:string}');
    writeFileSync(join(scratch, BROWSER_ARM), 'export interface NativeArm {type:"node";apiKey:string}');
    const context = projectCtx(scratch);
    using _poison = poisonSyntax(context.project);
    const result = runPolicyPass({
      root: scratch,
      project: context.project,
      ...nativeTypeFactOptions(context),
      knownPolicies: POLICIES,
      policies: POLICIES,
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(result.toolErrors).toEqual([]);
    expect(result.factErrors).toEqual([]);
    expect(result.authority.effectiveFindings.filter(({ policyId }) => policyId === beltTotal.id).map(({ file }) => file)).toEqual([BROWSER_BUS]);
  },
  scaledBudget(60_000),
);

test(
  "native instantiated channel parameters and narrowed alias arguments prove producers before their lease closes",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const channel = "packages/server/src/transport/trpc/bus-channel.ts";
    const server = "packages/server/src/domain/native/emit.ts";
    for (const file of [channel, server]) {
      mkdirSync(dirname(join(scratch, file)), { recursive: true });
    }
    writeFileSync(
      join(scratch, channel),
      "export interface BusChannel<Event>{readonly publish:(key:string,event:Event)=>void;} export function defineBusChannel<Event>():BusChannel<Event>{return {publish:()=>undefined};}",
    );
    writeFileSync(
      join(scratch, server),
      'import type{ChatBusEvent}from"../../../../contracts/src/chat/bus.ts";import{defineBusChannel}from"../../transport/trpc/bus-channel.ts";const bus=defineBusChannel<ChatBusEvent>();declare function makeStable():Extract<ChatBusEvent,{type:"stable"}>;export function go():void{const event:ChatBusEvent=makeStable();const publish=bus.publish;publish("u",event);}',
    );
    writeFileSync(
      join(scratch, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { ...COMPILER_OPTIONS, lib: ["es2022"] }, files: [NODE_BUS, NODE_ARM, SHARED_ARM, channel, server] }),
    );
    const context = projectCtx(scratch);
    const acquire = context.nativeTypeFacts;
    if (acquire === undefined) {
      throw new Error("native fixture acquisition missing");
    }
    let retained: TypeObservationReader | undefined;
    using _poison = poisonSyntax(context.project);
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
              const facts = evidence.typeObservations;
              if (facts !== undefined && (facts.callParameters?.length ?? 0) > 0) {
                retained = readTypeObservations(facts);
              }
            }
            return delivered;
          },
        };
      },
      knownPolicies: POLICIES,
      policies: POLICIES,
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(result.toolErrors).toEqual([]);
    expect(result.factErrors).toEqual([]);
    expect(result.policies.find(({ id }) => id === producerCoverage.id)?.findings.map(({ file, token }) => ({ file, token }))).toEqual([
      { file: BROWSER_BUS, token: '"stable"' },
    ]);
    const closed = retained;
    const call = context.project
      .getSourceFileOrThrow(join(scratch, server))
      .getDescendants()
      .find((node) => Node.isCallExpression(node) && node.getExpression().getText() === "publish");
    if (closed === undefined || call === undefined) {
      throw new Error("native parameter lifetime control was not exercised");
    }
    expect(() => closed.callParameters(call)).toThrow("disposed");
  },
  scaledBudget(60_000),
);

test(
  "computed schema values keep the originating world through a shared physical declaration",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    writeFileSync(join(scratch, NODE_ARM), 'export interface NativeArm {type:"stable";payload:string} export const method="object";');
    writeFileSync(join(scratch, BROWSER_ARM), 'export interface NativeArm {type:"stable";payload:string} export const method="merge";');
    writeFileSync(
      join(scratch, SHARED_ARM),
      'import type{NativeArm}from"#bus-arm";import{method}from"#bus-arm";export interface SharedArm extends NativeArm{};declare const z:{object(value:object):object;merge(value:object):object};export const nativeSchema=z[method]({apiKey:"secret"});',
    );
    for (const file of [NODE_BUS, BROWSER_BUS]) {
      const source = file === NODE_BUS ? "ChatBusEvent" : "UserBusEvent";
      writeFileSync(
        join(scratch, file),
        'import{nativeSchema}from"../native/shared.ts";export const notificationEventSchema=nativeSchema;export type ' +
          source +
          '={type:"stable";payload:string};',
      );
    }
    const context = projectCtx(scratch);
    using _poison = poisonSyntax(context.project);
    const result = runPolicyPass({
      root: scratch,
      project: context.project,
      ...nativeTypeFactOptions(context),
      knownPolicies: POLICIES,
      policies: [payloadHealth],
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(result.toolErrors).toEqual([]);
    expect(result.factErrors).toEqual([]);
    expect(
      result.policies
        .find((row) => row.id === payloadHealth.id)
        ?.findings.some((row) => row.message?.includes("unsupported-shape:ObjectLiteralExpression") === true),
    ).toBe(true);
  },
  scaledBudget(60_000),
);

test(
  "imported tuple spreads use the original root capture rather than the related source primary owner",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    writeFileSync(join(scratch, NODE_ARM), "export const members=[] as const;");
    writeFileSync(join(scratch, BROWSER_ARM), 'export const members=["ready"] as const;');
    writeFileSync(
      join(scratch, SHARED_ARM),
      'import{members}from"#bus-arm";const keys=[...members] as const;export type SharedArm={ [K in (typeof keys)[number]]:{type:K;apiKey:string}}[(typeof keys)[number]];',
    );
    const context = projectCtx(scratch);
    using _poison = poisonSyntax(context.project);
    const result = runPolicyPass({
      root: scratch,
      project: context.project,
      ...nativeTypeFactOptions(context),
      knownPolicies: POLICIES,
      policies: [payloadHealth],
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(result.toolErrors).toEqual([]);
    expect(result.factErrors).toEqual([]);
    expect(
      result.policies.find((row) => row.id === payloadHealth.id)?.findings.some((row) => row.message?.includes("unsupported-shape:MappedType") === true),
    ).toBe(true);
  },
  scaledBudget(60_000),
);

test(
  "isolated bus acquisition accepts an unchanged captured comment-only source without weakening node admission",
  () => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true } });
    const root = "/native-bus-comment-source";
    project.createSourceFile(root + "/packages/contracts/src/index.ts", "// Public barrel intentionally has no declarations.\n");
    project.createSourceFile(root + "/" + NODE_BUS, 'export type ChatBusEvent={type:"stable";chatId:string};');
    const result = runPolicyPass({
      root,
      project,
      nativeTypeFacts: () => isolatedTypeFacts(project),
      knownPolicies: POLICIES,
      policies: [payloadHealth],
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(result.toolErrors).toEqual([]);
    expect(result.factErrors).toEqual([]);
    const source = project.getSourceFileOrThrow(root + "/packages/contracts/src/index.ts");
    using stale = isolatedTypeFacts(project);
    const plan = typeObservationPlan([source], []);
    stale.request("owner", { kind: "invocation-evidence", nodes: [source], plan });
    stale.seal(new Set(["owner"]));
    source.replaceWithText(source.getFullText());
    expect(() => stale.invocationEvidence("owner", [source], plan)).toThrow("captured fixture source/epoch/span");
    const foreign = new Project({ useInMemoryFileSystem: true }).createSourceFile(root + "/foreign.ts", 'import "./other";');
    const door = foreign.getImportDeclarations()[0];
    if (door === undefined) {
      throw new Error("foreign module control missing");
    }
    using refusal = isolatedTypeFacts(project);
    refusal.request("owner", { kind: "module-targets", nodes: [door] });
    refusal.seal(new Set(["owner"]));
    expect(() => refusal.moduleTargets("owner", [door])).toThrow("captured fixture source/epoch/span");
    const leafSource = project.createSourceFile(root + "/leaf.ts", "export const first=1;export const second=2;");
    const first = leafSource.getVariableDeclarationOrThrow("first").getNameNode();
    const second = leafSource.getVariableDeclarationOrThrow("second").getNameNode();
    using spanOwner = isolatedTypeFacts(project);
    const valuePlan = { mode: "value" as const, facets: [], arguments: [] };
    spanOwner.request("owner", { kind: "invocation-evidence", nodes: [first], plan: valuePlan });
    spanOwner.seal(new Set(["owner"]));
    const forged = vi.spyOn(first, "getStart").mockReturnValue(second.getStart());
    try {
      expect(() => spanOwner.invocationEvidence("owner", [first], valuePlan)).toThrow('"leaf":false');
    } finally {
      forged.mockRestore();
    }
  },
  scaledBudget(30_000),
);

test(
  "destructuring holes do not become bus value questions",
  () => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true } });
    const root = "/native-bus-omitted-source";
    project.createSourceFile(root + "/" + NODE_BUS, 'export type ChatBusEvent={type:"stable";chatId:string};');
    project.createSourceFile(
      root + "/packages/contracts/src/helper.ts",
      'const entries=[["key","card"]];export const selected=entries.filter(([, reach])=>reach==="card").map(([key])=>key);',
    );
    const result = runPolicyPass({
      root,
      project,
      nativeTypeFacts: () => isolatedTypeFacts(project),
      knownPolicies: POLICIES,
      policies: [payloadHealth],
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(result.toolErrors).toEqual([]);
    expect(result.factErrors).toEqual([]);
    const helper = project.getSourceFileOrThrow(root + "/packages/contracts/src/helper.ts");
    const omitted = helper.getDescendants().find(Node.isOmittedExpression);
    if (omitted === undefined) {
      throw new Error("destructuring omission control missing");
    }
    expect(() => inventoryQueryNode(helper, { file: helper.getFilePath(), start: omitted.getStart(), end: omitted.getEnd(), kind: omitted.getKind() })).toThrow(
      "native query span is unavailable",
    );
    const sparse = project
      .createSourceFile(root + "/sparse.ts", 'const sparse=[,"literal"];')
      .getVariableDeclarationOrThrow("sparse")
      .getInitializerOrThrow();
    expect(captureInvocationEvidence(sparse, { mode: "value", facets: ["authored-value"], arguments: [] }).authoredValues.get(sparse)?.value.kind).toBe(
      "unresolved",
    );
  },
  scaledBudget(30_000),
);

test(
  "payload demand follows only existing roots while retaining its full roster and nested imported carriers",
  () => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true } });
    const root = "/native-bus-demand-source";
    project.createSourceFile(root + "/" + NODE_BUS, 'import type{Outer}from"../carrier.ts";export type ChatBusEvent=Outer;');
    const carrier = "packages/contracts/src/carrier.ts";
    project.createSourceFile(root + "/" + carrier, 'export interface Nested{type:"stable";apiKey:string}export interface Outer extends Nested{}');
    const unrelated = "packages/contracts/src/unrelated.ts";
    project.createSourceFile(root + "/" + unrelated, 'export const irrelevant={secret:"not a bus field"};export interface Unrelated{password:string}');
    const requests: NativeTypeRequest[] = [];
    const result = runPolicyPass({
      root,
      project,
      nativeTypeFacts: () => {
        const owner = isolatedTypeFacts(project);
        return {
          ...owner,
          request: (id, query): void => {
            requests.push(query);
            owner.request(id, query);
          },
        };
      },
      knownPolicies: POLICIES,
      policies: [payloadHealth],
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(result.toolErrors).toEqual([]);
    expect(result.factErrors).toEqual([]);
    const demands = requests.flatMap((query) =>
      query.kind === "invocation-evidence" && query.plan.typeObservations !== undefined ? [query.plan.typeObservations] : [],
    );
    expect(demands).toHaveLength(1);
    expect(
      demands.flatMap((demand) => demand.questions?.flatMap((question) => question.nodes) ?? []).some((node) => node.file === root + "/" + unrelated),
    ).toBe(false);
    expect(
      demands
        .flatMap((demand) => demand.questions?.filter((question) => question.kind === "definition-closure").flatMap((question) => question.files ?? []) ?? [])
        .toSorted(),
    ).toEqual([root + "/" + NODE_BUS, root + "/" + carrier, root + "/" + unrelated].toSorted());
  },
  scaledBudget(30_000),
);
