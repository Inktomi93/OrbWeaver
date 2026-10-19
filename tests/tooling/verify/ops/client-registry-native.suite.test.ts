import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";

const SECTION = "orb/section-route-registry-map";
const MODAL = "orb/modal-route-registry-map";
const MODAL_HOME = "orb/modal-definition-home";
const MODAL_LITERAL = "orb/modal-definition-literal";
const MODAL_BODY = "orb/modal-body-not-placeholder";
const MODAL_SPELLING = "orb/modal-definition-spelling";
const MODAL_RULES = [MODAL_HOME, MODAL_LITERAL, MODAL_BODY, MODAL_SPELLING];
const MODAL_FILE = "packages/client/src/features/settings/lib/theme-modal.tsx";
const MODAL_IMPORT = 'import type { ModalDefinition } from "../../../state/modal-registry.ts";\n';

async function messages(eslint: ESLint, filename: string, source: string, rules: readonly string[] = [SECTION, MODAL]): Promise<readonly Linter.LintMessage[]> {
  const config = await eslint.calculateConfigForFile(filename);
  expect(config, filename).toBeDefined();
  return new Linter().verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config.plugins,
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
      rules: Object.fromEntries(rules.map((rule) => [rule, config.rules[rule] ?? "off"])),
    },
    { filename },
  );
}

for (const [name, rule] of [
  ["sections", SECTION],
  ["modals", MODAL],
] as const) {
  // The first test of the file pays the cold load of the whole ESLint config, which outruns the default budget.
  test(`actual native route restriction rejects the ${name} override map`, async ({ repoRoot }) => {
    const eslint = new ESLint({ cwd: repoRoot });
    expect(await messages(eslint, join(repoRoot, "packages/client/src/routes/probe.tsx"), `const view = <Shell ${name}={{ x: 1 }} />;`)).toMatchObject([
      { ruleId: rule },
    ]);
    expect(await messages(eslint, join(repoRoot, "packages/client/src/routes/probe.tsx"), `const view = <Shell ${name}={({ x: 1 })} />;`)).toMatchObject([
      { ruleId: rule },
    ]);
  }, 120_000);
}

test("registry forwarding and unrelated route props retain the old exact syntax boundary", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  const filename = join(repoRoot, "packages/client/src/routes/probe.tsx");
  for (const source of [
    "const view = <Shell sections={registry} modals={modals} />;",
    "const view = <Shell overrides={{ x: 1 }} />;",
    "const view = <Shell sections={({ x: 1 } as const)} />;",
    "const view = <Shell modals={({ x: 1 } satisfies Record<string, number>)} />;",
    "const view = <Shell sections={(registry)} modals={(lookup())} />;",
  ]) {
    expect(await messages(eslint, filename, source), source).toEqual([]);
  }
});

test("the same object props outside routes are not registry override maps", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  for (const filename of [
    "packages/client/src/features/probe/components/probe.tsx",
    "packages/client/src/compose/probe.tsx",
    "tests/client/features/probe/probe.ct.tsx",
    "packages/server/src/probe.tsx",
  ]) {
    expect(await messages(eslint, join(repoRoot, filename), "const view = <Shell sections={{ x: 1 }} modals={{ y: 2 }} />;"), filename).toEqual([]);
  }
});

async function modalRules(eslint: ESLint, repoRoot: string, filename: string, source: string): Promise<readonly (string | null)[]> {
  return (await messages(eslint, join(repoRoot, filename), source, MODAL_RULES)).map(({ ruleId }) => ruleId);
}

test("a ModalDefinition declaration outside features/<owner>/lib/<id>-modal is refused", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  const source = `${MODAL_IMPORT}export const xModal: ModalDefinition = { id: "x" };\n`;
  expect(await modalRules(eslint, repoRoot, "packages/client/src/features/x/lib/not-a-modal-file.ts", source)).toEqual([MODAL_HOME]);
  expect(await modalRules(eslint, repoRoot, "packages/client/src/state/modal-defs.ts", source)).toEqual([MODAL_HOME]);
  for (const sanctioned of [MODAL_FILE, "packages/client/src/features/x/lib/x-modal.ts"]) {
    expect(await modalRules(eslint, repoRoot, sanctioned, source), sanctioned).toEqual([]);
  }
  expect(await modalRules(eslint, repoRoot, "tests/client/features/probe/probe.tsx", source)).toEqual([]);
  const factories = [
    `${MODAL_IMPORT}export function makeModal(): ModalDefinition {\n  return { id: "x" } as ModalDefinition;\n}\n`,
    `${MODAL_IMPORT}export const makeModal = (): ModalDefinition => ({ id: "x" }) as ModalDefinition;\n`,
  ];
  for (const factory of factories) {
    expect(await modalRules(eslint, repoRoot, "packages/client/src/features/x/lib/not-a-modal-file.ts", factory), factory).toEqual([MODAL_HOME]);
    expect(await modalRules(eslint, repoRoot, MODAL_FILE, factory), factory).toEqual([]);
  }
  const consumer = `${MODAL_IMPORT}export function open(def: ModalDefinition): string {\n  return def.id;\n}\n`;
  expect(await modalRules(eslint, repoRoot, "packages/client/src/features/x/lib/not-a-modal-file.ts", consumer)).toEqual([]);
});

test("a modal home writes its definition as an inline object literal, not an import, alias or builder", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  const inline = '{ id: "theme", trigger: { placement: "rail.end" }, body: () => null }';
  for (const initializer of [
    'uiModal;\nimport { uiModal } from "../../../../../ui/src/modal-defs.ts"',
    'xDef;\nimport { xDef } from "./x-definition.ts"',
    "buildModal();\ndeclare function buildModal(): ModalDefinition",
    `themeModalDef;\nconst themeModalDef = ${inline}`,
    `${inline} as ModalDefinition`,
  ]) {
    const source = `${MODAL_IMPORT}export const themeModal: ModalDefinition = ${initializer};\n`;
    expect(await modalRules(eslint, repoRoot, MODAL_FILE, source), initializer).toEqual([MODAL_LITERAL]);
  }
  for (const initializer of [
    inline,
    `${inline} satisfies ModalDefinition`,
    '{ id: "draft", trigger: { placement: "surface" }, body: { planned: "build pending" } }',
  ]) {
    const source = `${MODAL_IMPORT}export const themeModal: ModalDefinition = ${initializer};\n`;
    expect(await modalRules(eslint, repoRoot, MODAL_FILE, source), initializer).toEqual([]);
  }
  expect(await modalRules(eslint, repoRoot, MODAL_FILE, `${MODAL_IMPORT}export const open = (def: ModalDefinition): string => def.id;\n`)).toEqual([]);
});

test("a modal body never renders SectionPlaceholder, under any import spelling", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  const body = 'export const themeModal: ModalDefinition = { id: "theme", body: () => <Empty /> };\n';
  for (const imports of [
    'import { SectionPlaceholder as Empty } from "../../app-shell/components/section-placeholder.tsx";\n',
    'import { SectionPlaceholder as Empty } from "#features/app-shell";\n',
    'import { SectionPlaceholder } from "../../app-shell/components/section-placeholder.tsx";\nconst Empty = SectionPlaceholder;\n',
  ]) {
    expect(await modalRules(eslint, repoRoot, MODAL_FILE, `${MODAL_IMPORT}${imports}${body}`), imports).toEqual([MODAL_BODY]);
  }
  const namespaced =
    'import * as shell from "#features/app-shell";\nexport const themeModal: ModalDefinition = { id: "theme", body: () => <shell.SectionPlaceholder title="t" /> };\n';
  expect(await modalRules(eslint, repoRoot, MODAL_FILE, `${MODAL_IMPORT}${namespaced}`)).toEqual([MODAL_BODY]);
  const planned = 'export const themeModal: ModalDefinition = { id: "theme", body: { planned: "build pending" } };\n';
  const shadow =
    'function SectionPlaceholder(): null {\n  return null;\n}\nexport const themeModal: ModalDefinition = { id: "theme", body: () => <SectionPlaceholder /> };\n';
  const real = 'import { ThemePanel } from "./theme-panel.tsx";\nexport const themeModal: ModalDefinition = { id: "theme", body: () => <ThemePanel /> };\n';
  for (const source of [planned, shadow, real]) {
    expect(await modalRules(eslint, repoRoot, MODAL_FILE, `${MODAL_IMPORT}${source}`), source).toEqual([]);
  }
  const host = 'import { SectionPlaceholder } from "./section-placeholder.tsx";\nexport const Pane = (): null => <SectionPlaceholder title="t" />;\n';
  expect(await modalRules(eslint, repoRoot, "packages/client/src/features/app-shell/components/modal-host.tsx", host)).toEqual([]);
  expect(await modalRules(eslint, repoRoot, "packages/client/src/features/app-shell/surfaces/app-shell.tsx", host)).toEqual([]);
});

test("a modal body reached through a module outside the shell cannot render SectionPlaceholder", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  const body =
    'import { SectionPlaceholder } from "../../app-shell/components/section-placeholder.tsx";\nexport const ModalPane = (): null => <SectionPlaceholder title="t" />;\n';
  for (const filename of ["packages/client/src/features/imagery/lib/modal-pane.tsx", "packages/client/src/features/imagery/components/modal-pane.tsx"]) {
    expect(await modalRules(eslint, repoRoot, filename, body), filename).toEqual([MODAL_BODY]);
  }
  const reexport = 'export { SectionPlaceholder as Empty } from "../../app-shell/components/section-placeholder.tsx";\n';
  expect(await modalRules(eslint, repoRoot, "packages/client/src/features/imagery/lib/modal-pane.tsx", reexport)).toEqual([MODAL_BODY]);
});

test("a ModalDefinition annotation is caught under a qualified name, an alias and a renamed import", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  const inline = '{ id: "x", trigger: { placement: "surface" }, body: { planned: "pending" } }';
  const stray = "packages/client/src/features/imagery/lib/stray-def.ts";
  const qualified = `import type * as S from "../../../state/index.ts";\nexport const strayModal: S.ModalDefinition = ${inline};\n`;
  expect(await modalRules(eslint, repoRoot, stray, qualified)).toEqual([MODAL_HOME]);
  expect(await modalRules(eslint, repoRoot, MODAL_FILE, qualified)).toEqual([]);
  const literalInHome = `import type * as S from "../../../state/index.ts";\nexport const themeModal: S.ModalDefinition = buildModal();\ndeclare function buildModal(): S.ModalDefinition;\n`;
  expect(await modalRules(eslint, repoRoot, MODAL_FILE, literalInHome)).toEqual([MODAL_LITERAL]);
  const alias = `${MODAL_IMPORT}type Alias = ModalDefinition;\nexport const strayModal: Alias = ${inline};\n`;
  const renamed = `import type { ModalDefinition as Renamed } from "../../../state/modal-registry.ts";\nexport const strayModal: Renamed = ${inline};\n`;
  const reexported = 'export type { ModalDefinition as Renamed } from "../../../state/modal-registry.ts";\n';
  for (const [filename, source] of [
    [stray, alias],
    [MODAL_FILE, alias],
    [stray, renamed],
    [MODAL_FILE, renamed],
    [stray, reexported],
  ] as const) {
    expect(await modalRules(eslint, repoRoot, filename, source), `${filename}: ${source}`).toContain(MODAL_SPELLING);
  }
  const importType = 'import("../../../state/index.ts").ModalDefinition';
  const viaImportType = `export const strayModal: ${importType} = ${inline};\n`;
  expect(await modalRules(eslint, repoRoot, stray, viaImportType)).toEqual([MODAL_HOME]);
  expect(await modalRules(eslint, repoRoot, MODAL_FILE, viaImportType)).toEqual([]);
  expect(await modalRules(eslint, repoRoot, stray, `export function makeModal(): ${importType} {\n  return ${inline};\n}\n`)).toEqual([MODAL_HOME]);
  expect(
    await modalRules(eslint, repoRoot, MODAL_FILE, `export const themeModal: ${importType} = buildModal();\ndeclare function buildModal(): ${importType};\n`),
  ).toEqual([MODAL_LITERAL]);
  expect(await modalRules(eslint, repoRoot, stray, `type Alias = ${importType};\n`)).toEqual([MODAL_SPELLING]);
  const sameName = 'export type { ModalDefinition } from "./modal-registry.ts";\n';
  expect(await modalRules(eslint, repoRoot, "packages/client/src/state/index.ts", sameName)).toEqual([]);
});
