// Native browser contracts and mounting must not borrow semantics from the ordinary syntax carrier.
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Project } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { vi } from "vitest";
import type { InventoryInvocationPlan } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { assertInvocationEvidence, typeObservationWireSchema } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { captureTypeObservations } from "../../../../tooling/src/floor/code-facts/type-observations.ts";
import { encodeTypeObservations, mapTypeObservationDemand } from "../../../../tooling/src/floor/code-facts/type-observations-codec.ts";
import type { TypeObservationDemand } from "../../../../tooling/src/floor/code-facts/type-observations-contract.ts";
import { TYPE_OBSERVATION_PROFILE } from "../../../../tooling/src/floor/code-facts/type-observations-contract.ts";
import { readTypeObservations } from "../../../../tooling/src/floor/code-facts/type-observations-read.ts";
import { nodeTypeSelector, typeProjectionFacet } from "../../../../tooling/src/floor/code-facts/type-projection-contract.ts";
import { captureInvocationEvidence, encodeInvocationEvidence } from "../../../../tooling/src/floor/compiler/invocation-evidence-extract.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import type { ProjectContext } from "../../../../tooling/src/verify/contract/project-context.ts";
import { gate as mounting } from "../../../../tooling/src/verify/gates/ct-config-mirror-parity.ts";
import { gate as contracts } from "../../../../tooling/src/verify/gates/test-world-browser-contracts.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { nativeTypeFactOptions, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { runScopedCli } from "../../../../tooling/src/verify/ops/scoped.ts";
import { runStructure } from "../../../../tooling/src/verify/ops/structure.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { ctxFor } from "../../_support.ts";

const NODE_ENTRY = "tests/ui/native-browser.test-d.ts";
const CT_ENTRY = "tests/client/features/probe/probe.ct.tsx";
const POLICIES = [contracts, mounting];

function fixture(root: string, repoRoot: string, additionalFiles: Readonly<Record<string, string>> = {}): void {
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  const mountingProof = mounting.mustPass.find(
    (proof) => proof.why === "native mount aliases and a genuine door imported under another name keep canonical identity",
  );
  if (mountingProof === undefined) {
    throw new Error("native mounting alias proof missing");
  }
  const files = Object.fromEntries(Object.entries(mountingProof.files).filter(([path]) => !path.startsWith("node_modules/")));
  files[NODE_ENTRY] =
    `import type { ComponentProps, ComponentPropsWithRef, ComponentPropsWithoutRef, DOMAttributes, SyntheticEvent, ReactNode, SetStateAction, ProviderProps, Ref } from "react";
import type * as ReactTypes from "react";
interface PlainApplicationType { readonly id: string }
type Tags = "button" | "a";
export type Browser = ComponentProps<"button">;
export type AliasedIntrinsic = ComponentProps<Tags>;
export type WithRef = ComponentPropsWithRef<"button">;
export type WithoutRef = ComponentPropsWithoutRef<"button">;
export type Namespace = ReactTypes.ComponentProps<"button">;
export type Attributes = DOMAttributes<PlainApplicationType>;
export type EventContract = SyntheticEvent<PlainApplicationType>;
export type Fallback = HTMLButtonElement;
export type Pure = ReactNode;
export type State = SetStateAction<"button">;
export type Provider = ProviderProps<"button">;
export type ApplicationRef = Ref<PlainApplicationType>;
export type NodeEvents = Event | EventTarget;
namespace Foreign { export interface ComponentProps<T> { readonly value: T } export interface DOMAttributes<T> { readonly value: T } export interface SyntheticEvent<T> { readonly value: T } }
export type ForeignProps = Foreign.ComponentProps<"button">;
export type ForeignAttributes = Foreign.DOMAttributes<PlainApplicationType>;
export type ForeignEvent = Foreign.SyntheticEvent<PlainApplicationType>;
`;
  files["tests/ui/native-browser.dom.test-d.ts"] = files[NODE_ENTRY];
  Object.assign(files, additionalFiles);
  for (const [path, text] of Object.entries(files)) {
    write(path, text);
  }
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  write(".gitignore", "node_modules\n.cache\nreports\n");
  write("package.json", JSON.stringify({ name: "native-browser-mount-fixture", type: "module" }));
  const compilerOptions = {
    target: "ES2022",
    module: "ESNext",
    moduleResolution: "Bundler",
    jsx: "preserve",
    strict: true,
    skipLibCheck: true,
    types: ["node", "react"],
  };
  const roots = Object.keys(files);
  write("tsconfig.json", JSON.stringify({ compilerOptions: { ...compilerOptions, lib: ["ES2022"] }, files: roots }));
  write("tsconfig.tests-dom.json", JSON.stringify({ compilerOptions: { ...compilerOptions, lib: ["ES2022", "DOM"] }, files: roots }));
  write(
    "packages/client/tsconfig.json",
    JSON.stringify({
      compilerOptions: { ...compilerOptions, lib: ["ES2022", "DOM"] },
      files: roots.filter((path) => path.startsWith("packages/client/")).map((path) => `../../${path}`),
    }),
  );
  const modules = POLICIES.map((policy) => `src/verify/gates/${policy.id}.ts`);
  write("tooling/tsconfig.json", JSON.stringify({ compilerOptions, files: modules }));
  for (const policy of POLICIES) {
    write(
      `tooling/src/verify/gates/${policy.id}.ts`,
      `export {gate} from ${JSON.stringify(pathToFileURL(join(repoRoot, `tooling/src/verify/gates/${policy.id}.ts`)).href)};`,
    );
  }
  execFixtureGit(root, ["init", "-q"]);
}

function poisonSyntax(project: Project): Disposable {
  const readType = Node.prototype.getType;
  const readSymbol = Node.prototype.getSymbol;
  const types = vi.spyOn(Node.prototype, "getType").mockImplementation(function (this: Node) {
    if (this.getProject() === project) {
      throw new Error("ordinary browser-mount Type read");
    }
    return readType.call(this);
  });
  const symbols = vi.spyOn(Node.prototype, "getSymbol").mockImplementation(function (this: Node) {
    if (this.getProject() === project) {
      throw new Error("ordinary browser-mount Symbol read");
    }
    return readSymbol.call(this);
  });
  return {
    [Symbol.dispose]: (): void => {
      symbols.mockRestore();
      types.mockRestore();
    },
  };
}

function nativeWorldDeclarations(context: ProjectContext, subjects: readonly Node[]): readonly (readonly string[])[] {
  if (context.nativeTypeFacts === undefined) {
    throw new Error("native world proof context missing");
  }
  using native = context.nativeTypeFacts();
  const owner = "native-browser-world-control";
  const plan: InventoryInvocationPlan = {
    mode: "value",
    facets: ["type-projection"],
    arguments: [],
    typeProjection: { facets: ["type-symbol"], properties: [] },
  };
  native.request(owner, { kind: "invocation-evidence", nodes: subjects, plan });
  native.seal(new Set([owner]));
  const facts = native.invocationEvidence(owner, subjects, plan);
  return subjects.map((subject) => {
    const projection = facts.get(subject)?.typeProjections.get(subject);
    if (projection === undefined) {
      throw new Error("native world declaration projection missing");
    }
    const declarations = typeProjectionFacet(projection, "type-symbol");
    if (declarations === null) {
      throw new Error("native world declaration symbol absent");
    }
    return declarations.map((declaration) => declaration.getSourceFile().getFilePath().replaceAll("\\", "/"));
  });
}

test(
  "public browser contract and installed CT mount delivery ignores ordinary semantic answers",
  async ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
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
    expect(baseline.factErrors).toEqual([]);
    const findings = baseline.authority.effectiveFindings;
    expect(
      findings
        .filter(({ policyId }) => policyId === contracts.id)
        .map(({ token }) => token)
        .sort((a, b) => String(a).localeCompare(String(b))),
    ).toEqual(
      [
        'ComponentProps<"button">',
        "ComponentProps<Tags>",
        'ComponentPropsWithRef<"button">',
        'ComponentPropsWithoutRef<"button">',
        'ReactTypes.ComponentProps<"button">',
        "DOMAttributes<PlainApplicationType>",
        "SyntheticEvent<PlainApplicationType>",
        "HTMLButtonElement",
      ].sort((a, b) => a.localeCompare(b)),
    );
    expect(findings.some(({ file }) => file.endsWith("native-browser.dom.test-d.ts"))).toBe(false);
    expect(findings.filter(({ policyId }) => policyId === mounting.id)).toEqual([]);
    expect(context.project.getSourceFileOrThrow(join(scratch, CT_ENTRY)).getFullText()).toContain("mountAlias");
    using _poison = poisonSyntax(context.project);
    const result = run();
    expect(result.toolErrors).toEqual([]);
    expect(result.factErrors).toEqual([]);
    expect(result.authority.withheldPolicyIds).toEqual([]);
    expect(result.authority.effectiveFindings).toEqual(findings);
    const subjects = [NODE_ENTRY, "tests/ui/native-browser.dom.test-d.ts"].map((path) =>
      context.project.getSourceFileOrThrow(join(scratch, path)).getTypeAliasOrThrow("Fallback").getTypeNodeOrThrow(),
    );
    const worldDeclarations = nativeWorldDeclarations(context, subjects);
    expect(worldDeclarations[0]?.some((path) => path.endsWith("/@types/react/global.d.ts"))).toBe(true);
    expect(worldDeclarations[0]?.some((path) => path.endsWith("/lib.dom.d.ts"))).toBe(false);
    expect(worldDeclarations[1]?.some((path) => path.endsWith("/lib.dom.d.ts"))).toBe(true);
    const contexts = await import("../../../../tooling/src/verify/lib/project-context.ts");
    const passes = await import("../../../../tooling/src/verify/lib/policy-pass.ts");
    const getContext = vi.spyOn(contexts, "projectCtx").mockReturnValue(context);
    const observePass = vi.spyOn(passes, "runPolicyPass");
    try {
      for (const policy of POLICIES) {
        observePass.mockClear();
        expect(await runStructure(scratch, [`--check=${policy.id}`])).toBe(policy === contracts ? 1 : 0);
        expect(observePass).toHaveBeenCalledTimes(1);
        const captured = observePass.mock.results[0];
        if (captured?.type !== "return") {
          throw new Error("public structure did not return its policy result");
        }
        const owner = captured.value.policies.find((row) => row.id === policy.id);
        expect(owner?.owner.status).toBe("success");
        expect(owner?.population.effectiveSourcePaths.length).toBeGreaterThan(0);
        expect(owner?.population.effectiveSourcePaths.some((path) => path.endsWith(policy === contracts ? NODE_ENTRY : CT_ENTRY))).toBe(true);
      }
      observePass.mockClear();
      expect(await runScopedCli(scratch, ["--scope", "packages/client,tests"])).toBe(1);
      expect(observePass).toHaveBeenCalledTimes(1);
      const captured = observePass.mock.results[0];
      if (captured?.type !== "return") {
        throw new Error("public scoped door did not return its policy result");
      }
      expect(captured.value.policies.map((row) => [row.id, row.owner.status])).toEqual(
        POLICIES.toSorted((left, right) => left.id.localeCompare(right.id)).map((policy) => [policy.id, "success"]),
      );
      expect(captured.value.policies.every((row) => row.population.effectiveSourcePaths.length > 0)).toBe(true);
    } finally {
      observePass.mockRestore();
      getContext.mockRestore();
    }
  },
  scaledBudget(60_000),
);

test(
  "native Node contribution assignability reaches the production compose door",
  ({ scratch, repoRoot }) => {
    const consumerPath = "tests/support/node/contributions.ts";
    fixture(scratch, repoRoot, {
      "packages/client/src/lib/registry.ts": readFileSync(join(repoRoot, "packages/client/src/lib/registry.ts"), "utf8"),
      [consumerPath]: `import { createContributorRegistry as mint } from "../../../packages/client/src/lib/registry.ts";
interface LocalTile { readonly id: string; readonly title: string }
interface LocalOnly { readonly id: string; readonly note: number }
export const copied = mint<LocalTile>("node-copy", []);
export const own = mint<LocalOnly>("node-only", []);
`,
    });
    const context = projectCtx(scratch);
    using _poison = poisonSyntax(context.project);
    const result = runPolicyPass({
      root: scratch,
      project: context.project,
      ...nativeTypeFactOptions(context),
      policies: [mounting],
      knownPolicies: [mounting],
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(result.toolErrors).toEqual([]);
    expect(result.factErrors).toEqual([]);
    expect(result.authority.withheldPolicyIds).toEqual([]);
    expect(result.authority.effectiveFindings.map(({ file, token, message }) => ({ file, token, message }))).toEqual([
      {
        file: consumerPath,
        token: "mint",
        message: expect.stringContaining('door contribution type "LocalTile" is minted by hand'),
      },
    ]);
    expect(result.policies[0]?.owner.status).toBe("success");
    expect(result.policies[0]?.population.effectiveSourcePaths.some((path) => path.endsWith(consumerPath))).toBe(true);
    expect(context.nativeSourceView?.(join(scratch, consumerPath))?.program.descriptor.config).toBe("tsconfig.json");
    expect(context.nativeSourceView?.(join(scratch, "packages/client/src/compose/home-tiles.ts"))?.program.descriptor.config).toBe(
      "packages/client/tsconfig.json",
    );
  },
  scaledBudget(60_000),
);

test(
  "every declared browser-contract and CT production-mount proof remains admitted",
  () => {
    expect(verifyPolicyProofs(POLICIES)).toEqual([]);
  },
  scaledBudget(60_000),
);

test("raw browser questions preserve overload declarations, construct declarations, and finite constraints", () => {
  const { project } = ctxFor({
    "tests/ui/raw-browser.test.ts": `function make(value: string): number;
function make(value: number): number;
function make(value: string | number): number { return Number(value); }
class Widget { constructor() {} }
const constructorAlias = Widget;
const callableAlias = make;
export const made = callableAlias(1);
export const constructed = new constructorAlias();
interface Slot<T extends "button" | "a"> { readonly value: T }
type Branded = "button" & { readonly brand: true };
export type Case<T extends "button" | "a"> = Slot<T> | Slot<Branded>;
`,
  });
  const source = project.getSourceFiles()[0];
  if (source === undefined) {
    throw new Error("raw browser source missing");
  }
  const nodes = source.getDescendants().filter((node) => Node.isTypeReference(node) || Node.isIdentifier(node));
  const facts = captureTypeObservations(
    { profile: TYPE_OBSERVATION_PROFILE, sources: [source], nodes: [], questions: [{ kind: "browser-contracts", nodes }] },
    { anchor: source, admit: () => undefined },
  );
  const omitted = captureTypeObservations({ profile: TYPE_OBSERVATION_PROFILE, sources: [source], nodes: [] }, { anchor: source, admit: () => undefined });
  expect({ intersections: omitted.intersections, constraints: omitted.constraints, declarations: omitted.signatureDeclarations }).toEqual({
    intersections: undefined,
    constraints: undefined,
    declarations: undefined,
  });
  const read = readTypeObservations(facts);
  const call = source.getVariableDeclarationOrThrow("made").getInitializerOrThrow();
  const constructed = source.getVariableDeclarationOrThrow("constructed").getInitializerOrThrow();
  if (!(Node.isCallExpression(call) && Node.isNewExpression(constructed))) {
    throw new Error("raw signature subjects missing");
  }
  const callable = read.signatureDeclarations(nodeTypeSelector(call.getExpression()), "call");
  expect(callable).toHaveLength(2);
  expect(callable.every((declaration) => Node.isFunctionDeclaration(declaration) && declaration.getBody() === undefined)).toBe(true);
  expect(read.signatureDeclarations(nodeTypeSelector(constructed.getExpression()), "construct").map((node) => node.getKind())).toEqual([
    SyntaxKind.Constructor,
  ]);
  expect(facts.intersections?.some((row) => row.values.length > 0)).toBe(true);
  expect(facts.constraints?.some((row) => row.value !== null)).toBe(true);
  const span = (node: Node): import("../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts").InventorySpan => ({
    file: node.getSourceFile().getFilePath(),
    start: node.getStart(),
    end: node.getEnd(),
    kind: node.getKind(),
  });
  const wire = encodeTypeObservations(facts, span);
  expect(typeObservationWireSchema.safeParse(wire).success).toBe(true);
  expect(
    typeObservationWireSchema.safeParse({ ...wire, signatureDeclarations: wire.signatureDeclarations?.map((row) => ({ ...row, declarations: [] })) }).success,
  ).toBe(false);
  expect(() => readTypeObservations({ ...facts, signatureDeclarations: undefined })).toThrow(/signature declarations/u);
  const contribution = ctxFor({
    "packages/client/src/lib/registry.ts":
      "export interface Registry<T> { readonly value: T } export declare function createContributorRegistry<T>(name: string, values: readonly T[]): Registry<T>;",
    "tests/support/node/consumer.ts":
      'import { createContributorRegistry as mint } from "../../../packages/client/src/lib/registry.ts"; export const held = mint<string>("probe", []);',
  });
  const consumer = contribution.project.getSourceFileOrThrow(`${contribution.root}/tests/support/node/consumer.ts`);
  const candidate = consumer.getVariableDeclarationOrThrow("held").getInitializerOrThrow();
  if (!Node.isCallExpression(candidate)) {
    throw new Error("native contribution candidate missing");
  }
  let targetLookups = 0;
  const missingTarget = (): Node => {
    targetLookups += 1;
    throw new Error("missing native contribution target context");
  };
  const contributionDemand = (name: string): TypeObservationDemand => ({
    profile: TYPE_OBSERVATION_PROFILE,
    sources: [consumer],
    nodes: [],
    questions: [
      {
        kind: "ct-contributions",
        nodes: [candidate],
        valueFacets: ["module"],
        callableHomes: [{ name, suffix: "/lib/registry.ts" }],
        relationTargets: [{ file: `${contribution.root}/absent-target.ts`, start: 0, end: 1, kind: SyntaxKind.CallExpression }],
      },
    ],
  });
  const closeContribution = (name: string): ReturnType<typeof captureInvocationEvidence> => {
    const demand = contributionDemand(name);
    return captureInvocationEvidence(
      consumer,
      { mode: "types", facets: [], arguments: [], typeObservations: mapTypeObservationDemand(demand, span) },
      undefined,
      { demand, node: missingTarget },
    );
  };
  const unrelated = closeContribution("foreignFactory");
  expect(targetLookups).toBe(0);
  const unrelatedWire = encodeInvocationEvidence(
    consumer,
    { mode: "types", facets: [], arguments: [], typeObservations: mapTypeObservationDemand(contributionDemand("foreignFactory"), span) },
    unrelated,
    span,
  );
  expect(() => assertInvocationEvidence(unrelatedWire)).not.toThrow();
  expect(unrelatedWire.typeObservations?.demand.questions?.[0]?.relationTargets).toEqual(contributionDemand("foreignFactory").questions?.[0]?.relationTargets);
  expect(() => assertInvocationEvidence({ ...unrelatedWire, profiles: unrelatedWire.profiles.map((profile) => ({ ...profile, module: undefined })) })).toThrow(
    /facet coverage/u,
  );
  const unrelatedFacts = unrelated.typeObservations;
  if (unrelatedFacts === undefined) {
    throw new Error("native contribution observations missing");
  }
  expect(() => readTypeObservations(unrelatedFacts)).toThrow(/module context/u);
  expect(() => closeContribution("createContributorRegistry")).toThrow("missing native contribution target context");
  expect(targetLookups).toBe(1);
  const staleDeclaration = source.getVariableDeclarationOrThrow("callableAlias");
  source.replaceWithText(source.getFullText());
  expect(() => read.signatureDeclarations(nodeTypeSelector(staleDeclaration), "call")).toThrow(/stale|forgotten/u);
});
