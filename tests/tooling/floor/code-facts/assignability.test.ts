// `fieldTypesAgree` judges two declarations' fields by the checker. Lenient mode relaxes `readonly` and `?` at every
// depth, so a copy that differs from its contract only there is still the contract's field.

import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import { fieldTypesAgree, readAssignabilityChecker } from "../../../../tooling/src/floor/code-facts/assignability.ts";

const CONTRACT = `export interface Contract {
  readonly flat: readonly string[];
  readonly meta: { readonly tags: readonly string[] };
  readonly label?: string;
  readonly deep: { readonly inner: { readonly ids: readonly number[] } };
}`;

const COPY = `export interface Copy {
  flat: string[];
  meta: { tags: string[] };
  label: string;
  deep: { inner: { ids: number[] } };
  retyped: { tags: number[] };
}`;

const CONTRACT_RETYPED = `export interface Retyped {
  readonly meta: { readonly tags: readonly string[] };
}`;

function agree(field: string, lenient: boolean, copy = COPY, copyName = "Copy"): boolean {
  const project = new Project({ useInMemoryFileSystem: true });
  const contract = project
    .createSourceFile("/repo/contract.ts", `${CONTRACT}\n${CONTRACT_RETYPED}`)
    .getInterfaceOrThrow(field === "retyped" ? "Retyped" : "Contract");
  const hand = project.createSourceFile("/repo/copy.ts", copy).getInterfaceOrThrow(copyName);
  const checker = readAssignabilityChecker(project.getTypeChecker());
  if (checker === undefined) {
    throw new Error("this TypeScript build exposes no isTypeAssignableTo");
  }
  const refuse = (kind: string): never => {
    throw new Error(`refused: ${kind}`);
  };
  return fieldTypesAgree(
    { checker, refuse, lenient },
    { decl: hand, name: field === "retyped" ? "retyped" : field },
    { decl: contract, name: field === "retyped" ? "meta" : field },
  );
}

test("strict comparison sees readonly and optionality as type differences", () => {
  expect(agree("flat", false)).toBe(false);
  expect(agree("meta", false)).toBe(false);
});

test("lenient comparison relaxes a readonly array", () => {
  expect(agree("flat", true)).toBe(true);
});

test("lenient comparison relaxes readonly inside an object field, at any depth", () => {
  expect(agree("meta", true)).toBe(true);
  expect(agree("deep", true)).toBe(true);
});

test("lenient comparison treats an optional field as its required twin", () => {
  expect(agree("label", true)).toBe(true);
});

test("lenient comparison still sees a real retype inside an object field", () => {
  expect(agree("retyped", true)).toBe(false);
});
