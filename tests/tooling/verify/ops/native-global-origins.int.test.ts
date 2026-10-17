import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import { Node } from "ts-morph";
import ts from "typescript";
import tseslint from "typescript-eslint";
import { vi } from "vitest";

const NODE_SOURCE = "packages/server/src/domain/feature/ambient.ts";
const BROWSER_SOURCE = "packages/client/src/ambient.ts";
const SHADOW_SOURCE = "packages/server/src/domain/feature/shadow.ts";
const CLOCK = "orb/no-raw-clock";
const RANDOM = "orb/no-raw-random";
const SOURCE = `import {NOW,RANDOM} from '#keys';
const D=Date; const CTOR=D;
export const stamp=Date[NOW]();
export const draw=Math[RANDOM]();
export const date=new CTOR();
`;

function fixture(root: string): void {
  const files = {
    "package.json": JSON.stringify({ name: "native-global-fixture", type: "module", imports: { "#keys": { browser: "./browser.ts", default: "./node.ts" } } }),
    "node.ts": "export const NOW='now';export const RANDOM='random';",
    "browser.ts": "export const NOW='absent';export const RANDOM='absent';",
    "augment.d.ts": "export {};declare global {interface Math {inspectionOnly:boolean}}",
    [NODE_SOURCE]: SOURCE,
    [BROWSER_SOURCE]: SOURCE.replace("new CTOR()", "new CTOR(0)"),
    [SHADOW_SOURCE]:
      // eslint-disable-next-line orb/test-ambient-source-string -- This native policy input is parsed, never executed; remove with its identity control.
      "const Math={random:()=>0};class Date{static now(){return 0;}}export const stamp=Date.now();export const draw=Math.random();export const date=new Date();",
  };
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
}

function program(root: string, browser: boolean): ts.Program {
  return ts.createProgram([join(root, browser ? BROWSER_SOURCE : NODE_SOURCE), join(root, SHADOW_SOURCE), join(root, "augment.d.ts")], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    types: [],
    lib: browser ? ["lib.es2022.d.ts", "lib.dom.d.ts"] : ["lib.es2022.d.ts"],
    customConditions: browser ? ["browser"] : [],
  });
}

function lint(config: Linter.Config, native: ts.Program, path: string, source: string): readonly Linter.LintMessage[] {
  return new Linter({ cwd: dirname(path) }).verify(
    source,
    {
      files: ["**/*.ts"],
      ...(config.plugins === undefined ? {} : { plugins: config.plugins }),
      languageOptions: { parser: tseslint.parser, parserOptions: { programs: [native], projectService: false } },
      linterOptions: { reportUnusedDisableDirectives: "error" },
      rules: { [CLOCK]: "error", [RANDOM]: "error" },
    },
    { filename: path },
  );
}

test("native ambient rules retain owning-world conditional keys, aliases, merged globals and shadows without a secondary Project", async ({
  scratch,
  repoRoot,
}) => {
  fixture(scratch);
  const config = await new ESLint({ cwd: repoRoot }).calculateConfigForFile(join(repoRoot, NODE_SOURCE));
  const node = program(scratch, false);
  const browser = program(scratch, true);
  const project = vi.spyOn(Node.prototype, "getProject").mockImplementation(() => {
    throw new Error("ambient rule acquired a secondary Project");
  });
  try {
    expect(lint(config, node, join(scratch, NODE_SOURCE), SOURCE)).toMatchObject([{ ruleId: CLOCK }, { ruleId: RANDOM }]);
    expect(lint(config, browser, join(scratch, BROWSER_SOURCE), SOURCE.replace("new CTOR()", "new CTOR(0)"))).toEqual([]);
    const shadow = node.getSourceFile(join(scratch, SHADOW_SOURCE));
    if (shadow === undefined) {
      throw new Error("native shadow source missing");
    }
    expect(lint(config, node, shadow.fileName, shadow.text)).toEqual([]);
    expect(project).not.toHaveBeenCalled();
  } finally {
    project.mockRestore();
  }
});

test("native ambient authority remains operation-specific, line-local and stale-sensitive", async ({ scratch, repoRoot }) => {
  fixture(scratch);
  const config = await new ESLint({ cwd: repoRoot }).calculateConfigForFile(join(repoRoot, NODE_SOURCE));
  const path = join(scratch, NODE_SOURCE);
  // eslint-disable-next-line orb/test-ambient-source-string -- This native policy input is parsed, never executed; remove with its identity control.
  const source = "export const stamp=Date.now();\nexport const draw=Math.random();";
  const check = (text: string): readonly Linter.LintMessage[] => {
    writeFileSync(path, text);
    return lint(config, program(scratch, false), path, text);
  };
  expect(check(`// eslint-disable-next-line ${CLOCK} -- Intentional clock seam.\n${source}`)).toMatchObject([{ ruleId: RANDOM }]);
  expect(check(`// eslint-disable-next-line ${RANDOM} -- Wrong operation.\n${source}`)).toMatchObject([
    { ruleId: null, message: expect.stringContaining("Unused eslint-disable directive") },
    { ruleId: CLOCK },
    { ruleId: RANDOM },
  ]);
  expect(check(`// eslint-disable-next-line ${CLOCK} -- Retired seam.\nexport const stamp=0;`)).toMatchObject([
    { ruleId: null, message: expect.stringContaining("Unused eslint-disable directive") },
  ]);
  // eslint-disable-next-line orb/test-ambient-source-string -- This native policy input is parsed, never executed; remove with its identity control.
  expect(check(`// eslint-disable-next-line ${CLOCK} -- Only this read.\nexport const stamp=Date.now();\nexport const draw=Math.random();`)).toMatchObject([
    { ruleId: RANDOM },
  ]);
  // eslint-disable-next-line orb/test-ambient-source-string -- This native policy input is parsed, never executed; remove with its identity control.
  expect(check(`export const stamp=Date.now();\n// eslint-disable-next-line ${CLOCK} -- Wrong position.\nexport const other=0;`)).toMatchObject([
    { ruleId: CLOCK },
    { ruleId: null, message: expect.stringContaining("Unused eslint-disable directive") },
  ]);
});

test("native ambient judgments refuse absent or null owning parser Programs", async ({ scratch, repoRoot }) => {
  const config = await new ESLint({ cwd: repoRoot }).calculateConfigForFile(join(repoRoot, NODE_SOURCE));
  for (const rule of [CLOCK, RANDOM]) {
    expect(() =>
      new Linter({ cwd: scratch }).verify(
        "export const value=0;",
        {
          files: ["**/*.ts"],
          ...(config.plugins === undefined ? {} : { plugins: config.plugins }),
          languageOptions: { parser: tseslint.parser, parserOptions: { projectService: false } },
          rules: { [rule]: "error" },
        },
        { filename: join(scratch, "absent.ts") },
      ),
    ).toThrow("owning TypeScript Program");
  }
});
