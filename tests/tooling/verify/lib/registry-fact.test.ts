import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project, SyntaxKind } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import type { RegistryDefinitionKind, RegistryDefinitionKindFacts } from "../../../../tooling/src/verify/contract/registry-fact.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { readJsxTagFact, registryDefinitionFacts } from "../../../../tooling/src/verify/lib/registry-fact.ts";
import { isolatedTypeFacts } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

const ROOT = "/registry-facts";

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function policyFor(kind: RegistryDefinitionKind, capture: (facts: RegistryDefinitionKindFacts) => void): GatePolicy {
  return defineGate({
    id: `registry-${kind}`,
    family: "registry-definition",
    authority: "hard",
    severity: "error",
    population: "@client",
    analysis: "types",
    execution: "entire-population",
    facts: [registryDefinitionFacts[kind]],
    resources: [],
    message: "registry definition fact control",
    create: (ctx) => ({
      evaluate: () => {
        const view = ctx.fact(registryDefinitionFacts[kind]);
        capture(view);
        ctx.receipt({ kind: "population", source: view.source, members: view.members, unresolved: view.unresolved });
      },
    }),
    mustFlag: [{ mode: "types", files: { "packages/client/src/flag.ts": "export const flag = 1;" }, why: "descriptor proof control" }],
    mustPass: [{ mode: "types", files: { "packages/client/src/pass.ts": "export const pass = 1;" }, why: "descriptor proof control" }],
  });
}

function runRegistry(
  kind: RegistryDefinitionKind,
  files: Readonly<Record<string, string>>,
): { readonly facts: RegistryDefinitionKindFacts; readonly result: ReturnType<typeof runPolicyPass> } {
  let captured: RegistryDefinitionKindFacts | undefined;
  const gate = policyFor(kind, (facts) => {
    captured = facts;
  });
  const project = projectOf(files);
  const result = runPolicyPass({
    knownPolicies: [gate],
    policies: [gate],
    root: ROOT,
    project,
    nativeTypeFacts: () => isolatedTypeFacts(project),
    reviewedGrants: [],
    failOnWarnings: false,
  });
  if (captured === undefined) {
    throw new Error("registry facts were not evaluated");
  }
  return { facts: captured, result };
}

test("canonical type origins survive type aliases, re-exports, namespace qualification, and local shadows", () => {
  const { facts, result } = runRegistry("section", {
    "packages/client/src/types.ts": "export type SectionDefinition = { readonly id: string };",
    "packages/client/src/barrel.ts": 'export type { SectionDefinition as SectionDef } from "./types";',
    "packages/client/src/defs.ts": `
      import type { SectionDef as SD } from "./barrel";
      const local = { id: "const", body: () => null };
      export const constSection: SD = local;
      export function makeSection(): SD { return { id: "factory" }; }
    `,
    "packages/client/src/namespace.ts": `
      import type * as Types from "./types";
      export const namespaceSection: Types.SectionDefinition = { id: "namespace" };
    `,
    "packages/client/src/shadow.ts": "type SectionDefinition = { readonly fake: true }; const shadow: SectionDefinition = { fake: true };",
  });

  expect(result.toolErrors).toEqual([]);
  expect(facts.target.kind).toBe("resolved");
  expect(facts.members).toBe(3);
  expect(facts.unresolved).toBe(0);
  expect(facts.definitions.map(({ shape }) => shape)).toEqual(["const", "factory", "const"]);
  expect(facts.definitions.every(({ typeOrigin }) => typeOrigin.declaration.getSourceFile().getBaseName() === "types.ts")).toBe(true);
  expect(facts.definitions[0]?.object).toMatchObject({ kind: "resolved" });
  expect(facts.definitions[0]?.authoredValue).toMatchObject({ kind: "unresolved", reason: "unsupported" });
});

test("imported object provenance resolves, while writes and builders refuse AS DATA the consumer judges", () => {
  const { facts, result } = runRegistry("section", {
    "packages/client/src/types.ts": "export interface SectionDefinition { readonly id: string }",
    "packages/client/src/value.ts": 'export const value = { id: "imported" };',
    "packages/client/src/value-barrel.ts": 'export { value as sectionValue } from "./value";',
    "packages/client/src/defs.ts": `
      import type { SectionDefinition } from "./types";
      import { sectionValue } from "./value-barrel";
      export const imported: SectionDefinition = sectionValue;
      const changed = { id: "before" }; changed.id = "after";
      export const written: SectionDefinition = changed;
      export const dynamic: SectionDefinition = buildSection();
    `,
  });

  // A write and a builder are UNREADABLE VALUES, not missing subjects: both stay members of the census and
  // arrive with their refusal reason on `object`, which is what every consumer's fail-closed arm accuses.
  // Scoring them as receipt `unresolved` withheld the provider over exactly that population (#1953).
  expect(facts.definitions).toHaveLength(3);
  expect(facts.members).toBe(3);
  expect(facts.unresolved).toBe(0);
  expect(facts.definitions.map(({ object }) => (object.kind === "unresolved" ? object.reason : "resolved"))).toEqual(["resolved", "write", "dynamic"]);
  expect(result.factErrors).toEqual([]);
  expect(result.policies[0]?.owner.status).toBe("success");
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([]);
});

test("a field the value reader cannot read never revokes the definition's own provenance", () => {
  const { facts, result } = runRegistry("section", {
    "packages/client/src/types.ts": "export interface SectionDefinition { readonly id: string }",
    "packages/client/src/icons.ts": "export declare const Icon: unique symbol;",
    "packages/client/src/defs.ts": `
      import type { SectionDefinition } from "./types";
      import { Icon } from "./icons";
      export const iconed: SectionDefinition = { id: "iconed", icon: Icon };
      export const hooked: SectionDefinition = { id: "hooked", body: () => null };
    `,
  });

  expect(result.toolErrors).toEqual([]);
  expect(facts).toMatchObject({ members: 2, unresolved: 0 });
  expect(facts.definitions.map(({ object }) => object.kind)).toEqual(["resolved", "resolved"]);
  expect(facts.definitions.map(({ authoredValue }) => (authoredValue.kind === "unresolved" ? authoredValue.reason : "resolved"))).toEqual([
    "missing",
    "unsupported",
  ]);
});

test("section factories with multiple returns refuse as ambiguous", () => {
  const { facts, result } = runRegistry("section", {
    "packages/client/src/types.ts": "export type SectionDefinition = { readonly id: string };",
    "packages/client/src/defs.ts": `
      import type { SectionDefinition } from "./types";
      export function ambiguous(flag: boolean): SectionDefinition {
        if (flag) return { id: "a" };
        return { id: "b" };
      }
    `,
  });

  expect(facts.definitions).toHaveLength(1);
  expect(facts.definitions[0]?.object).toMatchObject({ kind: "unresolved", reason: "ambiguous" });
  expect(facts).toMatchObject({ members: 1, unresolved: 0 });
  expect(result.policies[0]?.owner.status).toBe("success");
});

test("missing and empty definition populations stay distinct, are DELIVERED, and refuse at the CONSUMER", () => {
  // A renamed registry TYPE is the one thing this provider genuinely cannot resolve, and an empty-but-present
  // type is a different blindness; the fact carries both distinctly on `target`/`members`/`unresolved`.
  //
  // THE PHASE MOVED IN #1962, THE SIGNAL DID NOT. Until 2026-09-11 the provider RECEIPTED that census, so
  // `factReceiptFailures` refused it and `withholdFactDependents` dropped every consumer of this kind before
  // `evaluate` — a provider receipt must state the denominator it WALKED, never what it FOUND (§12.3), and
  // #1953's per-kind split fixed only the cross-kind half. The receipt is now the walked sources, the census
  // is DELIVERED, and the rename tripwire fires one phase later at the consumer's own
  // `members: <view>.definitions.length` receipt — the sanctioned blindness door every production registry
  // consumer already files. Still nothing reported, still only
  // THIS kind's consumers withheld.
  const missing = runRegistry("section", { "packages/client/src/other.ts": "export const other = 1;" });
  expect(missing.result.facts).toMatchObject([
    { id: "registry-definitions-section", status: "success", receipts: [{ kind: "population", source: "SectionDefinition-sources", members: 1 }] },
  ]);
  expect(missing.facts.target).toMatchObject({ kind: "unresolved", reason: "missing" });
  expect(missing.facts).toMatchObject({ members: 0, unresolved: 1 });
  expect(missing.result.toolErrors).toMatchObject([
    { policyId: "registry-section", phase: "receipt", message: expect.stringContaining('population "SectionDefinition" left 1 unresolved') },
  ]);
  expect(missing.result.policies[0]?.owner.status).toBe("incomplete");
  expect(missing.result.authority.withheldPolicyIds).toEqual(["registry-section"]);
  expect(missing.result.authority.effectiveFindings).toEqual([]);

  const empty = runRegistry("section", {
    "packages/client/src/types.ts": "export interface SectionDefinition { readonly id: string }",
  });
  expect(empty.result.facts).toMatchObject([{ id: "registry-definitions-section", status: "success" }]);
  expect(empty.facts.target.kind).toBe("resolved");
  expect(empty.facts).toMatchObject({ members: 0, unresolved: 0 });
  expect(empty.result.toolErrors).toMatchObject([
    { policyId: "registry-section", phase: "receipt", message: expect.stringContaining('population "SectionDefinition" resolved zero members') },
  ]);
  expect(empty.result.toolErrors[0]?.message).not.toContain("left 1 unresolved");
  expect(empty.result.authority.withheldPolicyIds).toEqual(["registry-section"]);
});

test("a provider that could not LOOK still refuses at its own POPULATION phase, and withholds only its kind", () => {
  // THE PLANTED CONTROL for the row above: moving the census out of the receipt must not disarm blindness.
  // It does not — it moves the refusal one phase EARLIER for the one case that is genuinely unmeasurable.
  // A corpus admitting zero `@client` paths gives the section provider nothing to walk, so it refuses at
  // POPULATION rather than reporting an empty census.
  let captured: RegistryDefinitionKindFacts | undefined;
  // The POLICY's population is wider than the FACT's on purpose: a corpus holding only a server file gives
  // the policy something to run over and the `@client` provider nothing to walk, which is the one shape that
  // isolates a provider-population refusal from a policy-population refusal.
  const wide: GatePolicy = defineGate({
    id: "registry-section-wide-probe",
    family: "registry-definition",
    authority: "hard",
    severity: "error",
    population: { in: ["@client", "@server"], ext: ["ts", "tsx"] },
    analysis: "types",
    execution: "entire-population",
    facts: [registryDefinitionFacts.section],
    resources: [],
    message: "registry definition population control",
    create: (ctx) => ({
      evaluate: () => {
        captured = ctx.fact(registryDefinitionFacts.section);
        ctx.receipt({ kind: "population", source: "registry-section-wide-probe", members: 1 });
      },
    }),
    mustFlag: [{ mode: "types", files: { "packages/client/src/flag.ts": "export const flag = 1;" }, why: "descriptor proof control" }],
    mustPass: [{ mode: "types", files: { "packages/client/src/pass.ts": "export const pass = 1;" }, why: "descriptor proof control" }],
  });
  const result = runPolicyPass({
    knownPolicies: [wide],
    policies: [wide],
    root: ROOT,
    project: projectOf({ "packages/server/src/x.ts": "export const outsideTheClientPopulation = 1;" }),
    reviewedGrants: [],
    failOnWarnings: false,
  });

  expect(captured).toBeUndefined();
  expect(result.factErrors.map(({ factId, phase }) => `${factId}/${phase}`)).toEqual(["registry-definitions-section/population"]);
  expect(result.facts.map(({ id, status }) => `${id}/${status}`)).toEqual(["registry-definitions-section/incomplete"]);
  expect(result.toolErrors[0]?.message).toContain("declared fact failed: registry-definitions-section");
  expect(result.authority.withheldPolicyIds).toEqual(["registry-section-wide-probe"]);
});

test("JSX tags normalize opening/self-closing forms through canonical module origin", () => {
  const project = projectOf({
    "packages/client/src/component.tsx": "export const Thing = () => null; export const Other = () => null;",
    "packages/client/src/barrel.ts": 'export { Thing as Renamed, Other } from "./component";',
    "packages/client/src/use.tsx": `
      import { Renamed as Alias } from "./barrel";
      import * as UI from "./barrel";
      export const Use = () => <><Alias /><UI.Other></UI.Other></>;
    `,
  });
  const source = project.getSourceFileOrThrow(`${ROOT}/packages/client/src/use.tsx`);
  const elements = [...source.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement), ...source.getDescendantsOfKind(SyntaxKind.JsxOpeningElement)];
  const facts = elements.map(readJsxTagFact);

  expect(facts).toHaveLength(2);
  expect(facts.map((fact) => (fact.kind === "resolved" ? fact.value.origin.canonical.exportedName : fact.reason))).toEqual(["Thing", "Other"]);
});
