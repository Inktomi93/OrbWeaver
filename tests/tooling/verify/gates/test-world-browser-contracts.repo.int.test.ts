import { join } from "node:path";
import process from "node:process";
import { Project } from "ts-morph";
import { getWorkspace } from "../../../../tooling/src/_shared/ts-workspace.ts";
import type { Finding } from "../../../../tooling/src/verify/contract/gate.ts";
import { gate } from "../../../../tooling/src/verify/gates/test-world-browser-contracts.ts";
import { isNodeTestContractRoot } from "../../../../tooling/src/verify/lib/browser-contract-reader.ts";
import { repoRel, runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { verifyGateProofs } from "../../../../tooling/src/verify/ops/conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { ctxFor } from "../../_support.ts";

interface Verdict {
  readonly findings: readonly Finding[];
  readonly toolErrors: readonly { readonly message: string }[];
}

function verdict(project: Project, root: string, files = project.getSourceFiles()): Verdict {
  const result = runPass([gate], {
    root,
    project,
    scope: { kind: "project" },
    files,
    checker: () => project.getTypeChecker(),
  });
  return { findings: result.gates[0]?.findings ?? [], toolErrors: result.toolErrors };
}

function virtualVerdict(files: Readonly<Record<string, string>>): Verdict {
  const { project, root } = ctxFor({ ...files });
  return verdict(project, root);
}

function nativeVerdict(source: string, suffix = ".test-d.ts", extraFiles: Readonly<Record<string, string>> = {}): Verdict {
  const root = process.cwd();
  const project = new Project({ tsConfigFilePath: join(root, "tsconfig.json"), skipAddingFilesFromTsConfig: true });
  for (const [path, text] of Object.entries(extraFiles)) {
    project.createSourceFile(join(root, path), text);
  }
  const file = project.createSourceFile(join(root, `tests/__browser-contract-proof__/subject${suffix}`), source);
  return verdict(project, root, [file]);
}

test("the scan scope is derived from authored test kinds and helper worlds", () => {
  expect(
    [
      "tests/x.test.ts",
      "tests/x.test-d.ts",
      "tests/support/iso/x.ts",
      "tests/support/node/x.ts",
      "tests/support/fixtures.ts",
      "tests/client/feature/_fixture.ts",
      "tests/x.dom.test.ts",
      "tests/x.dom.test-d.ts",
      "tests/x.ct.tsx",
      "tests/x.stories.tsx",
      "tests/support/browser/x.ts",
    ].map(isNodeTestContractRoot),
  ).toEqual([true, true, true, true, true, true, false, false, false, false, false]);
});

test("follows a browser-authored type through a single file, renamed barrel export, and namespace import", () => {
  const single = virtualVerdict({
    "packages/ui/src/input.tsx": "export interface InputProps { readonly value?: string }\n",
    "tests/ui/input.test-d.ts": 'import type { InputProps as Props } from "../../packages/ui/src/input.tsx";\nexport type Subject = Props;\n',
  });
  const namespace = virtualVerdict({
    "packages/ui/src/input.tsx": "export interface InputProps { readonly value?: string }\n",
    "packages/ui/src/index.ts": 'export type { InputProps as PublicProps } from "./input.tsx";\n',
    "tests/ui/input.test-d.ts": 'import type * as UI from "../../packages/ui/src/index.ts";\nexport type Subject = UI.PublicProps;\n',
  });
  expect(single.toolErrors).toEqual([]);
  expect(single.findings).toHaveLength(1);
  expect(namespace.toolErrors).toEqual([]);
  expect(namespace.findings).toHaveLength(1);
});

test("follows a consumed runtime binding through a renamed barrel export", () => {
  const result = virtualVerdict({
    "packages/ui/src/button.tsx": "export function Button(): string { return 'button' }\n",
    "packages/ui/src/index.ts": 'export { Button as Action } from "./button.tsx";\n',
    "tests/ui/button.test.ts": 'import { Action as renderAction } from "../../packages/ui/src/index.ts";\nexport const subject = renderAction();\n',
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.findings).toHaveLength(1);
});

test("callable signatures preserve browser ownership through const and object facades", () => {
  for (const [facade, subject] of [
    ["export const Action = Button;", "import { Action } from '../../packages/ui/src/index.ts'; export const subject = Action();"],
    ["export const API = { Button };", "import { API } from '../../packages/ui/src/index.ts'; export const subject = API.Button();"],
    ["export const API = { Button };", "import { API } from '../../packages/ui/src/index.ts'; const local = API; export const subject = local.Button();"],
  ] as const) {
    const result = virtualVerdict({
      "packages/ui/src/button.tsx": "export function Button(): string { return 'button'; }",
      "packages/ui/src/index.ts": `import { Button } from './button.tsx'; ${facade}`,
      "tests/ui/button.test.ts": subject,
    });
    expect(result.toolErrors).toEqual([]);
    expect(result.findings.length).toBeGreaterThan(0);
  }
});

test("keeps DOM-free .ts contracts and browser test kinds available", () => {
  const files = {
    "packages/ui/src/collection-contracts.ts": "export interface CollectionContract { readonly id: string }\n",
    "tests/ui/collection.test-d.ts":
      'import type { CollectionContract } from "../../packages/ui/src/collection-contracts.ts";\nexport type Subject = CollectionContract;\n',
    "packages/ui/src/button.tsx": "export interface ButtonProps { readonly label?: string }\n",
    "tests/ui/button.dom.test-d.ts": 'import type { ButtonProps } from "../../packages/ui/src/button.tsx";\nexport type Subject = ButtonProps;\n',
  };
  expect(virtualVerdict(files)).toMatchObject({ findings: [], toolErrors: [] });
});

test("rejects the canonical React DOM shapes that compile in the Node program", () => {
  const result = nativeVerdict(
    'import type { ButtonHTMLAttributes, ComponentProps, ComponentPropsWithRef, ComponentPropsWithoutRef, KeyboardEvent, Ref } from "react";\n' +
      'type A = ComponentProps<"button">;\n' +
      'type B = ComponentPropsWithRef<"button">;\n' +
      'type C = ComponentPropsWithoutRef<"button">;\n' +
      "type D = ButtonHTMLAttributes<HTMLButtonElement>;\n" +
      "type E = Ref<HTMLButtonElement>;\n" +
      "type F = KeyboardEvent<HTMLButtonElement>;\n",
  );
  expect(result.toolErrors).toEqual([]);
  expect(result.findings.map(({ token }) => token)).toEqual(
    expect.arrayContaining(['ComponentProps<"button">', 'ComponentPropsWithRef<"button">', 'ComponentPropsWithoutRef<"button">']),
  );
  expect(result.findings.length).toBeGreaterThanOrEqual(6);
});

test("canonical React identity survives a namespace door", () => {
  const result = nativeVerdict('import type * as ReactTypes from "react";\ntype Subject = ReactTypes.ComponentProps<"button">;\n');
  expect(result.toolErrors).toEqual([]);
  expect(result.findings).toHaveLength(1);
});

test("intrinsic-constrained React arguments retain string identity through aliases and unions", () => {
  const result = nativeVerdict(
    'import type { ComponentProps } from "react";\n' +
      'type Tag = "button"; type Tags = "button" | "a";\n' +
      'export type A = ComponentProps<Tag>; export type B = ComponentProps<"button" | "a">; export type C = ComponentProps<Tags>;\n',
  );
  expect(result.toolErrors).toEqual([]);
  expect(result.findings.map(({ token }) => token)).toEqual(
    expect.arrayContaining(["ComponentProps<Tag>", 'ComponentProps<"button" | "a">', "ComponentProps<Tags>"]),
  );
});

test("DOM-bearing unions remain visible across a .ts contract boundary", () => {
  for (const anchor of ["DOMAttributes", "SyntheticEvent"]) {
    const result = nativeVerdict('import type { Mixed } from "../../packages/ui/src/__browser-contract-proof.ts"; export type Subject = Mixed;', ".test-d.ts", {
      "packages/ui/src/__browser-contract-proof.ts": `import type { ${anchor} } from 'react'; export type Mixed = (${anchor}<HTMLElement> | { readonly id: string });`,
    });
    expect(result.toolErrors).toEqual([]);
    expect(result.findings.map(({ token }) => token)).toContain("Mixed");
  }
});

test("does not treat arbitrary React generics, ReactNode, or application ref targets as DOM contracts", () => {
  const result = nativeVerdict(
    'import type { ProviderProps, ReactNode, Ref, SetStateAction } from "react";\n' +
      "interface PlainApplicationType { readonly id: string }\n" +
      'type A = SetStateAction<"button">;\n' +
      'type B = ProviderProps<"button">;\n' +
      "type C = Ref<PlainApplicationType>;\n" +
      "type D = ReactNode;\n",
  );
  expect(result).toMatchObject({ findings: [], toolErrors: [] });
});

test("permits Event and EventTarget when Node contributes real merged declarations", () => {
  const result = nativeVerdict("export type Subject = Event | EventTarget;\n", ".test.ts");
  expect(result).toMatchObject({ findings: [], toolErrors: [] });
});

test("a relevant canonical-origin refusal is a tool error rather than clean absence", () => {
  const result = virtualVerdict({
    "tests/ui/missing.test.ts": 'import { missing } from "@orb/ui/not-a-real-door";\nexport const subject = missing;\n',
  });
  expect(result.findings).toEqual([]);
  expect(result.toolErrors).toHaveLength(1);
  expect(result.toolErrors[0]?.message).toContain("no canonical authored target");
});

test("a relevant re-export cycle refuses instead of passing through an intermediate .ts barrel", () => {
  const result = virtualVerdict({
    "packages/ui/src/a.ts": 'export { Subject } from "./b.ts";\n',
    "packages/ui/src/b.ts": 'export { Subject } from "./a.ts";\n',
    "tests/ui/cycle.test-d.ts": 'import type { Subject } from "../../packages/ui/src/a.ts";\nexport type Seen = Subject;\n',
  });
  expect(result.findings).toEqual([]);
  expect(result.toolErrors.some(({ message }) => message.includes("cycle"))).toBe(true);
});

test("the descriptor's own founding and negative proofs run through the production dispatcher", () => {
  expect(verifyGateProofs([gate])).toEqual([]);
});

test("the current full Node-intent test census has no browser-contract findings or unresolved relevant origins", { timeout: 120_000 }, () => {
  const root = process.cwd();
  const project = getWorkspace({ root });
  const files = project.getSourceFiles().filter((file) => gate.scanRoot?.(repoRel(root, file.getFilePath())) === true);
  // This proves the guard over the roots its shared world vocabulary selects. Imported modules remain
  // identity evidence for consumed bindings; they are not recursively reclassified as test roots.
  expect(files.length).toBeGreaterThan(0);
  expect(verdict(project, root, files)).toMatchObject({ findings: [], toolErrors: [] });
});
