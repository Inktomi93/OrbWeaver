// `fieldTypesAgree` judges two declarations' fields by the checker. Lenient mode relaxes `readonly` and `?` at every
// depth, so a copy that differs from its contract only there is still the contract's field.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Node, Type } from "ts-morph";
import { Project } from "ts-morph";
import type { AgreementContext } from "../../../../tooling/src/floor/code-facts/assignability.ts";
import {
  fieldTypesAgree,
  mutuallyAssignableAcross,
  readAssignabilityChecker,
  typeRelationAcross,
} from "../../../../tooling/src/floor/code-facts/assignability.ts";
import { createSemanticWorkspace } from "../../../../tooling/src/floor/compiler/ts-workspace.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";

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

function contextFor(project: Project): AgreementContext {
  const checker = readAssignabilityChecker(project.getTypeChecker());
  if (checker === undefined) {
    throw new Error("this TypeScript build exposes no isTypeAssignableTo");
  }
  return {
    checker,
    refuse: (kind): never => {
      throw new Error(`refused: ${kind}`);
    },
  };
}

function readTypes(left: Node, right: Node): readonly [Type, Type] {
  return [left.getType(), right.getType()];
}

test("directional relation separates narrowing, structural equality and actual divergence", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile(
    "/repo/relation.ts",
    `
interface Owner { mode: "fast" | "slow"; meta: { tags: string[] }; }
interface Narrow { mode: "fast"; meta: { tags: string[] }; }
interface Twin { mode: "fast" | "slow"; meta: { tags: string[] }; }
interface Divergent { mode: "fast" | "slow"; meta: { tags: number[] }; }
declare const raw: any;
`,
  );
  const context = contextFor(project);
  const owner = file.getInterfaceOrThrow("Owner");
  const relation = (name: string): ReturnType<typeof typeRelationAcross> => typeRelationAcross(context, file.getInterfaceOrThrow(name), owner, readTypes);
  expect(relation("Narrow")).toEqual({ leftToRight: true, rightToLeft: false, leftIsAny: false, rightIsAny: false });
  expect(relation("Twin")).toEqual({ leftToRight: true, rightToLeft: true, leftIsAny: false, rightIsAny: false });
  expect(relation("Divergent")).toEqual({ leftToRight: false, rightToLeft: false, leftIsAny: false, rightIsAny: false });
  expect(typeRelationAcross(context, file.getVariableDeclarationOrThrow("raw"), owner, readTypes)).toEqual({
    leftToRight: true,
    rightToLeft: true,
    leftIsAny: true,
    rightIsAny: false,
  });
  expect(typeRelationAcross(context, owner, owner, () => undefined)).toBeUndefined();
});

test("relations refuse nodes from unrelated Projects instead of comparing compiler types across checkers", () => {
  const leftProject = new Project({ useInMemoryFileSystem: true });
  const rightProject = new Project({ useInMemoryFileSystem: true });
  const left = leftProject.createSourceFile("/repo/left.ts", "type Left = string;").getTypeAliasOrThrow("Left");
  const right = rightProject.createSourceFile("/repo/right.ts", "type Right = string;").getTypeAliasOrThrow("Right");
  expect(typeRelationAcross(contextFor(leftProject), left, left, readTypes)?.leftToRight).toBe(true);
  expect(() => typeRelationAcross(contextFor(leftProject), left, right, readTypes)).toThrow("refused: no-shared-program");
});

function nativeRelationFixture(root: string, strictClient: boolean): ReturnType<typeof createSemanticWorkspace> {
  const write = (path: string, source: string): void => {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, source);
  };
  for (const [name, strict] of [
    ["server", true],
    ["client", strictClient],
  ] as const) {
    write(
      `packages/${name}/tsconfig.json`,
      JSON.stringify({
        compilerOptions: { strictNullChecks: strict, target: "ES2022", module: "ESNext", moduleResolution: "Bundler", types: [], lib: ["ES2022"] },
        files: ["src/world.d.ts", "../contracts/src/relation.ts"],
      }),
    );
    const narrow = '"fast"';
    const wide = '"fast" | "slow"';
    write(
      `packages/${name}/src/world.d.ts`,
      `type NativeLeft = ${name === "server" ? narrow : wide};\ntype NativeRight = ${name === "server" ? wide : narrow};\ntype NativeRaw = ${name === "server" ? "string" : "any"};\n`,
    );
  }
  write(
    "packages/contracts/src/relation.ts",
    "export type Left = string | null;\nexport type Right = string;\nexport type DirectionalLeft = NativeLeft;\nexport type DirectionalRight = NativeRight;\nexport type Untyped = NativeRaw;\n",
  );
  execFixtureGit(root, ["init", "-q"]);
  return createSemanticWorkspace({ root });
}

test("native relations preserve agreement and refuse directional disagreement or unreadable views", ({ scratch }) => {
  const workspace = nativeRelationFixture(scratch, false);
  const program = workspace.program("packages/server/tsconfig.json");
  if (program === undefined) {
    throw new Error("server native program was not discovered");
  }
  const file = program.sourceFile("packages/contracts/src/relation.ts");
  if (file === undefined) {
    throw new Error("native relation source was not discovered");
  }
  const left = file.getTypeAliasOrThrow("Left");
  const right = file.getTypeAliasOrThrow("Right");
  const context = contextFor(program.project());
  expect(typeRelationAcross(context, right, right, readTypes)?.leftToRight).toBe(true);
  expect(() => typeRelationAcross(context, left, right, readTypes)).toThrow("refused: programs-disagree");
  const directionalLeft = file.getTypeAliasOrThrow("DirectionalLeft");
  const directionalRight = file.getTypeAliasOrThrow("DirectionalRight");
  expect(mutuallyAssignableAcross(context, directionalLeft, directionalRight, readTypes)).toBe(false);
  expect(() => typeRelationAcross(context, directionalLeft, directionalRight, readTypes)).toThrow("refused: programs-disagree");
  const untyped = file.getTypeAliasOrThrow("Untyped");
  expect(mutuallyAssignableAcross(context, untyped, right, readTypes)).toBe(true);
  expect(() => typeRelationAcross(context, untyped, right, readTypes)).toThrow("refused: programs-disagree");
  expect(() => typeRelationAcross(context, right, right, (a, b) => (a.getProject() === program.project() ? readTypes(a, b) : undefined))).toThrow(
    "refused: programs-disagree",
  );
});

test("a missing native checker primitive refuses even when a caller still holds a working checker", ({ scratch }) => {
  const workspace = nativeRelationFixture(scratch, true);
  const program = workspace.program("packages/server/tsconfig.json");
  if (program === undefined) {
    throw new Error("server native program was not discovered");
  }
  const file = program.sourceFile("packages/contracts/src/relation.ts");
  if (file === undefined) {
    throw new Error("native relation source was not discovered");
  }
  const right = file.getTypeAliasOrThrow("Right");
  const context = contextFor(program.project());
  expect(typeRelationAcross(context, right, right, readTypes)?.leftToRight).toBe(true);
  const compiler = program.project().getTypeChecker().compilerObject;
  const descriptor = Reflect.getOwnPropertyDescriptor(compiler, "isTypeAssignableTo");
  if (descriptor === undefined) {
    throw new Error("the checker primitive has no restorable own descriptor");
  }
  try {
    expect(Reflect.deleteProperty(compiler, "isTypeAssignableTo")).toBe(true);
    expect(() => typeRelationAcross(context, right, right, readTypes)).toThrow("refused: primitive-absent");
  } finally {
    Reflect.defineProperty(compiler, "isTypeAssignableTo", descriptor);
  }
});
