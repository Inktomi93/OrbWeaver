import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import { Node } from "ts-morph";
import ts from "typescript";
import tseslint from "typescript-eslint";
import { vi } from "vitest";

import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";

import { scaledBudget } from "../../_load-budget.ts";
import { NATIVE_ORIGIN_POLICY_PROOFS_A } from "./_fixtures/native-origin-policy-proofs-a.ts";
import { NATIVE_ORIGIN_POLICY_PROOFS_B } from "./_fixtures/native-origin-policy-proofs-b.ts";

const policies = [...NATIVE_ORIGIN_POLICY_PROOFS_A, ...NATIVE_ORIGIN_POLICY_PROOFS_B];

async function lintOriginProof(
  [eslint, repoRoot]: readonly [ESLint, string],
  root: string,
  rule: string,
  proof: GatePolicy["mustFlag"][number],
): Promise<readonly Linter.LintMessage[]> {
  const files = Object.fromEntries(
    Object.entries(proof.files).map(([path, text]) => [
      path,
      text.replace(new RegExp(`// @orb-waive ${rule.slice(4)}\\([^\\n]*?\\): ([^\\n]*)`, "gu"), `// eslint-disable-next-line ${rule} -- $1`),
    ]),
  );
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  const program = ts.createProgram(
    Object.keys(files).map((path) => join(root, path)),
    {
      lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
      types: [],
      strict: true,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.Preserve,
    },
  );
  const project = vi.spyOn(Node.prototype, "getProject").mockImplementation(() => {
    throw new Error("native origin policy acquired a Project");
  });
  const messages: Linter.LintMessage[] = [];
  try {
    for (const [path, text] of Object.entries(files)) {
      if (path.startsWith("node_modules/")) {
        continue;
      }
      const config = await eslint.calculateConfigForFile(join(repoRoot, path));
      if (config?.rules?.[rule] === undefined) {
        continue;
      }
      messages.push(
        ...new Linter({ cwd: root }).verify(
          text,
          {
            files: ["**/*.{ts,tsx}"],
            plugins: config.plugins,
            languageOptions: { parser: tseslint.parser, parserOptions: { programs: [program], projectService: false, ecmaFeatures: { jsx: true } } },
            linterOptions: { reportUnusedDisableDirectives: "error" },
            rules: { [rule]: "error" },
          },
          { filename: join(root, path) },
        ),
      );
    }
    expect(project).not.toHaveBeenCalled();
  } finally {
    project.mockRestore();
  }
  return messages;
}

for (const policy of policies) {
  test(`${policy.id}: native founding, near-miss, scope and positioned-permission corpus`, { timeout: scaledBudget(30_000) }, async ({ scratch, repoRoot }) => {
    const eslint = new ESLint({ cwd: repoRoot });
    let caseNumber = 0;
    for (const [flag, proofs] of [
      [true, policy.mustFlag],
      [false, policy.mustPass],
    ] as const) {
      for (const proof of proofs) {
        const messages = await lintOriginProof([eslint, repoRoot], join(scratch, String(caseNumber++)), `orb/${policy.id}`, proof);
        expect(messages, `${policy.id}: ${proof.why}`).toHaveLength(flag ? (proof.expect?.count ?? 1) : 0);
        const expectedMessage = flag ? proof.expect?.messageIncludes : undefined;
        expect(messages.filter((message) => expectedMessage !== undefined && message.message.includes(expectedMessage))).toHaveLength(
          expectedMessage === undefined ? 0 : 1,
        );
      }
    }
  });
}

test("native autosave uses the installed form identity in the actual Node/browser owner and keeps line-specific permissions", async ({ scratch, repoRoot }) => {
  const subject = "packages/client/src/features/probe/flush.ts";
  const rule = "orb/no-manual-autosave-flush";
  const config = await new ESLint({ cwd: repoRoot }).calculateConfigForFile(join(repoRoot, subject));
  const source = `import {FormApi} from '@tanstack/react-form';
function vendorForm(){return new FormApi({defaultValues:{items:['value']}});}
interface LocalForm {pushFieldValue(field:string,value:string):void;handleSubmit():Promise<void>}
type Selected=ReturnType<typeof setTimeout> extends number ? ReturnType<typeof vendorForm> : LocalForm;
export function onAdd(form:Selected):void {
  form.pushFieldValue('items','value');
  void form.handleSubmit();
}
`;
  for (const browser of [false, true]) {
    const root = join(scratch, browser ? "browser" : "node");
    const path = join(root, subject);
    mkdirSync(dirname(path), { recursive: true });
    symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
    symlinkSync(join(repoRoot, "packages/client/node_modules"), join(root, "packages/client/node_modules"), "dir");
    const check = (text: string): readonly Linter.LintMessage[] => {
      writeFileSync(path, text);
      const program = ts.createProgram([path], {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        lib: browser ? ["lib.es2022.d.ts", "lib.dom.d.ts"] : ["lib.es2022.d.ts"],
        types: browser ? [] : ["node"],
        strict: true,
        skipLibCheck: true,
      });
      return new Linter({ cwd: root }).verify(
        text,
        {
          files: ["**/*.ts"],
          plugins: config.plugins,
          languageOptions: { parser: tseslint.parser, parserOptions: { programs: [program], projectService: false } },
          linterOptions: { reportUnusedDisableDirectives: "error" },
          rules: { [rule]: "error" },
        },
        { filename: path },
      );
    };
    expect(check(source)).toHaveLength(browser ? 1 : 0);
    if (!browser) {
      continue;
    }
    expect(
      check(source.replace("  form.pushFieldValue", `  // eslint-disable-next-line ${rule} -- Native form seam permission.\n  form.pushFieldValue`)),
    ).toEqual([]);
    expect(
      check(source.replace("  void form.handleSubmit", `  // eslint-disable-next-line ${rule} -- Wrong call position.\n  void form.handleSubmit`)),
    ).toMatchObject([{ ruleId: rule }, { ruleId: null, message: expect.stringContaining("Unused eslint-disable directive") }]);
    expect(check(source.replace("  form.pushFieldValue", `  // eslint-disable-next-line ${rule} -- Stale permission.\n  form.reset`))).toMatchObject([
      { ruleId: null, message: expect.stringContaining("Unused eslint-disable directive") },
    ]);
  }
});

test("store-hook readiness belongs to the client owner while Node worlds retain their own aliases and erasure judgments", async ({ scratch, repoRoot }) => {
  const rule = "orb/zustand-selector-stability";
  const home = "packages/client/src/state/create-gated-store.ts";
  const server = "packages/server/src/near-miss.ts";
  const client = "packages/client/src/near-miss.ts";
  const config = await new ESLint({ cwd: repoRoot }).calculateConfigForFile(join(repoRoot, server));
  const check = (key: string, browser: boolean, source: string, extra: Readonly<Record<string, string>> = {}): readonly Linter.LintMessage[] => {
    const root = join(scratch, key);
    const path = browser ? client : server;
    const files = { [path]: source, ...extra };
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), text);
    }
    const configPath = join(root, browser ? "packages/client/tsconfig.json" : "tsconfig.json");
    const options = {
      noLib: true,
      types: [],
      strict: true,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      configFilePath: configPath,
    };
    writeFileSync(configPath, JSON.stringify({ compilerOptions: { noLib: true, types: [], strict: true }, files: Object.keys(files) }));
    const program = ts.createProgram(
      Object.keys(files).map((file) => join(root, file)),
      options,
    );
    return new Linter({ cwd: root }).verify(
      source,
      {
        files: ["**/*.ts"],
        plugins: config.plugins,
        languageOptions: { parser: tseslint.parser, parserOptions: { programs: [program], projectService: false } },
        rules: { [rule]: "error" },
      },
      { filename: join(root, path) },
    );
  };
  expect(check("node", false, "declare function local<T>(select:(state:string)=>T):T;export const value=local(state=>({state}));")).toEqual([]);
  expect(check("erased", false, "declare const opaque:unknown;export const value=opaque((state:unknown)=>({state}));")).toMatchObject([
    { ruleId: rule, message: expect.stringContaining("CANNOT be established") },
  ]);
  expect(
    check(
      "vendor",
      false,
      'import type {UseBoundStore} from "zustand";declare const read:UseBoundStore<{value:string}>;export const value=read(state=>({value:state.value}));',
      { "node_modules/zustand/index.d.ts": "export type UseBoundStore<T>={<U>(select:(state:T)=>U):U};" },
    ),
  ).toMatchObject([{ ruleId: rule }]);
  expect(() => check("missing-home", true, "export const value=1;")).toThrow("GatedStoreHook home/export");
  expect(() => check("missing-export", true, "export const value=1;", { [home]: "export type Other=string;" })).toThrow("GatedStoreHook home/export");
});

test("native list rows preserve callback ownership, lexical aliases, root interactivity and ordinary line authority", async ({ scratch, repoRoot }) => {
  const rule = "orb/list-row-adoption";
  const subject = "packages/client/src/features/demo/rows.tsx";
  const eslint = new ESLint({ cwd: repoRoot });
  const config = await eslint.calculateConfigForFile(join(repoRoot, subject));
  const prefix = 'import {LibraryListLayout as Layout} from "#components";\n';
  const cases = [
    [`${prefix}export const X=items.map(function(item){return <div onClick={()=>select(item)}/>;});`, 1],
    [`${prefix}const A=(item)=><div onClick={()=>select(item)}/>;const B=A,C=B,D=C,E=D,F=E;export const X=<VirtualList renderItem={F}/>;`, 1],
    [`${prefix}const renderRow=(item)=><div onClick={()=>select(item)}/>;export const X=(renderRow:unknown)=><VirtualList renderItem={renderRow}/>;`, 0],
    [`${prefix}import {renderRow} from "./other";export const X=<VirtualList renderItem={renderRow}/>;`, 0],
    [`${prefix}let renderRow=(item)=><div onClick={()=>select(item)}/>;renderRow=()=>null;export const X=<VirtualList renderItem={renderRow}/>;`, 0],
    [`${prefix}export const X=items.map(item=><div><button onClick={()=>select(item)}/></div>);`, 0],
    [`${prefix}const renderRow=(item)=><div onClick={()=>select(item)}/>;export const X=items.map(renderRow);`, 0],
  ] as const;
  let sequence = 0;
  const check = (text: string): readonly Linter.LintMessage[] => {
    const root = join(scratch, String(sequence++));
    const path = join(root, subject);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
    const other = join(dirname(path), "other.tsx");
    writeFileSync(other, "export const renderRow=(item)=><div onClick={()=>select(item)}/>;");
    const program = ts.createProgram([path, other], {
      noLib: true,
      types: [],
      strict: true,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.Preserve,
    });
    return new Linter({ cwd: root }).verify(
      text,
      {
        files: ["**/*.tsx"],
        plugins: config.plugins,
        languageOptions: { parser: tseslint.parser, parserOptions: { programs: [program], projectService: false, ecmaFeatures: { jsx: true } } },
        linterOptions: { reportUnusedDisableDirectives: "error" },
        rules: { [rule]: "error" },
      },
      { filename: path },
    );
  };
  for (const [source, count] of cases) {
    expect(check(source), source).toHaveLength(count);
  }
  const source = `${prefix}export const X=items.map(item=>(\n<div onClick={()=>select(item)}/>));`;
  expect(check(source)).toMatchObject([{ ruleId: rule, line: 3, column: 2 }]);
  expect(check(source.replace("<div", `// eslint-disable-next-line ${rule} -- Intentional row root.\n<div`))).toEqual([]);
  expect(check(source.replace("export const X", `// eslint-disable-next-line ${rule} -- Wrong source line.\nexport const X`))).toMatchObject([
    { ruleId: null, message: expect.stringContaining("Unused eslint-disable directive") },
    { ruleId: rule },
  ]);
  expect((await eslint.calculateConfigForFile(join(repoRoot, "packages/ui/src/rows.tsx"))).rules[rule]).toBeUndefined();
});
