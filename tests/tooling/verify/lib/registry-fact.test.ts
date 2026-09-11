import { Project, SyntaxKind } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import type { RegistryDefinitionKind, RegistryDefinitionKindFacts } from "../../../../tooling/src/verify/contract/registry-fact.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { readJsxTagFact, registryDefinitionFacts } from "../../../../tooling/src/verify/lib/registry-fact.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

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
  const result = runPolicyPass({
    knownPolicies: [gate],
    policies: [gate],
    root: ROOT,
    project: projectOf(files),
    reviewedGrants: [],
    failOnWarnings: false,
  });
  if (captured === undefined) {
    throw new Error("registry facts were not evaluated");
  }
  return { facts: captured, result };
}

/** Run a kind whose PROVIDER is expected to refuse, so the consumer never evaluates and captures nothing. */
function runWithheldRegistry(kind: RegistryDefinitionKind, files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  let captured: RegistryDefinitionKindFacts | undefined;
  const gate = policyFor(kind, (facts) => {
    captured = facts;
  });
  const result = runPolicyPass({
    knownPolicies: [gate],
    policies: [gate],
    root: ROOT,
    project: projectOf(files),
    reviewedGrants: [],
    failOnWarnings: false,
  });
  if (captured !== undefined) {
    throw new Error("registry facts were evaluated, so this fixture is not the withholding it claims to be");
  }
  return result;
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
  const { facts, result } = runRegistry("modal", {
    "packages/client/src/types.ts": "export interface ModalDefinition { readonly id: string }",
    "packages/client/src/value.ts": 'export const value = { id: "imported" };',
    "packages/client/src/value-barrel.ts": 'export { value as modalValue } from "./value";',
    "packages/client/src/defs.ts": `
      import type { ModalDefinition } from "./types";
      import { modalValue } from "./value-barrel";
      export const imported: ModalDefinition = modalValue;
      const changed = { id: "before" }; changed.id = "after";
      export const written: ModalDefinition = changed;
      export const dynamic: ModalDefinition = buildModal();
      export function notAModalDefinitionFactory(): ModalDefinition { return { id: "not-sanctioned" }; }
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
  const { facts, result } = runRegistry("modal", {
    "packages/client/src/types.ts": "export interface ModalDefinition { readonly id: string }",
    "packages/client/src/icons.ts": "export declare const Icon: unique symbol;",
    "packages/client/src/defs.ts": `
      import type { ModalDefinition } from "./types";
      import { Icon } from "./icons";
      export const iconed: ModalDefinition = { id: "iconed", icon: Icon };
      export const hooked: ModalDefinition = { id: "hooked", body: () => null };
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

test("only section definitions admit factories, and multiple returns refuse as ambiguous", () => {
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

test("missing and empty definition populations stay distinct, and both refuse at the PROVIDER", () => {
  // A renamed registry TYPE is the one thing this provider genuinely cannot resolve, so it is the only
  // `unresolved` in its receipt — the rename tripwire. An empty-but-present type is a different blindness
  // and says so with `zero members` alone. Both withhold every consumer of THIS kind and nothing else.
  const missing = runWithheldRegistry("chrome", { "packages/client/src/other.ts": "export const other = 1;" });
  expect(missing.facts).toMatchObject([
    { id: "registry-definitions-chrome", status: "incomplete", receipts: [{ kind: "population", source: "ChromeEntry", members: 0, unresolved: 1 }] },
  ]);
  expect(missing.facts[0]?.error).toContain('population "ChromeEntry" left 1 unresolved');
  expect(missing.policies[0]?.owner.status).toBe("incomplete");
  expect(missing.authority.withheldPolicyIds).toEqual(["registry-chrome"]);

  const empty = runWithheldRegistry("chrome", {
    "packages/client/src/types.ts": "export interface ChromeEntry { readonly id: string }",
  });
  expect(empty.facts).toMatchObject([
    { id: "registry-definitions-chrome", status: "incomplete", receipts: [{ kind: "population", source: "ChromeEntry", members: 0, unresolved: 0 }] },
  ]);
  expect(empty.facts[0]?.error).toContain('population "ChromeEntry" resolved zero members');
  expect(empty.facts[0]?.error).not.toContain("unresolved");
  expect(empty.authority.withheldPolicyIds).toEqual(["registry-chrome"]);
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
