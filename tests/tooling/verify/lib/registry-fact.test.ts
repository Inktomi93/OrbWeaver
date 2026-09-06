import { Project, SyntaxKind } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import type { RegistryDefinitionKind, RegistryDefinitionKindFacts } from "../../../../tooling/src/verify/contract/registry-fact.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { readJsxTagFact, registryDefinitionFact } from "../../../../tooling/src/verify/lib/registry-fact.ts";
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
    facts: [registryDefinitionFact],
    resources: [],
    message: "registry definition fact control",
    create: (ctx) => ({
      evaluate: () => {
        const view = ctx.fact(registryDefinitionFact).forKind(kind);
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

test("imported object provenance resolves, while writes and builders refuse", () => {
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

  expect(facts.definitions).toHaveLength(3);
  expect(facts.members).toBe(1);
  expect(facts.unresolved).toBe(2);
  expect(facts.definitions.map(({ object }) => (object.kind === "unresolved" ? object.reason : "resolved"))).toEqual(["resolved", "write", "dynamic"]);
  expect(result.policies[0]?.owner.status).toBe("incomplete");
  expect(result.toolErrors).toMatchObject([{ phase: "receipt", message: expect.stringContaining("unresolved") }]);
  expect(result.authority.withheldPolicyIds).toEqual(["registry-modal"]);
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
  expect(facts).toMatchObject({ members: 0, unresolved: 1 });
  expect(result.policies[0]?.owner.status).toBe("incomplete");
});

test("missing and empty definition populations stay distinct and receipt-ready", () => {
  const missing = runRegistry("chrome", { "packages/client/src/other.ts": "export const other = 1;" });
  expect(missing.facts.target).toMatchObject({ kind: "unresolved", reason: "missing" });
  expect(missing.facts).toMatchObject({ members: 0, unresolved: 1 });
  expect(missing.result.policies[0]?.owner.status).toBe("incomplete");

  const empty = runRegistry("chrome", {
    "packages/client/src/types.ts": "export interface ChromeEntry { readonly id: string }",
  });
  expect(empty.facts.target.kind).toBe("resolved");
  expect(empty.facts).toMatchObject({ members: 0, unresolved: 0 });
  expect(empty.result.policies[0]?.owner.status).toBe("incomplete");
  expect(empty.result.toolErrors).toMatchObject([{ phase: "receipt", message: expect.stringContaining("zero members") }]);
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
