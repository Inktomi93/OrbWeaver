// Real hard-profile controls keep compiler error suppression separate from tests-side negative assertions.
import { readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { ESLint } from "eslint";
import { Project } from "ts-morph";
import { gate as suppressionGate } from "../../../../tooling/src/verify/gates/suppressions.ts";
import { resolveSelection } from "../../../../tooling/src/verify/index.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { REVIEWED_GRANTS } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import {
  affectsSourceTypeSuppressionNativeLint,
  isSourceTypeSuppressionSource,
  SOURCE_TYPE_SUPPRESSION_NATIVE_INPUT_PATHS,
  SOURCE_TYPE_SUPPRESSION_RULE,
} from "../../../../tooling/src/verify/lib/source-type-suppression-native.ts";

const USER_BUS = "packages/contracts/src/user-bus/index.ts";
const EXPECTATION = "// @ts-expect-error Controlled unresolved-heritage native-oracle counterfactual.";
const SOURCE = `${EXPECTATION}\ninterface NativeOpaqueBusBase extends MissingBusPayloadBase {}\nexport type Event={type:"changed"}&NativeOpaqueBusBase;`;

test.for([
  { name: "line expectation", source: SOURCE, errors: 1 },
  { name: "block expectation", source: "/* @ts-expect-error Real missing declaration. */\nexport const value: Missing=1;", errors: 1 },
  {
    name: "final block line",
    source: "/* Browser compatibility is not permission.\n * @ts-expect-error Real missing declaration. */\nexport const value: Missing=1;",
    errors: 1,
  },
  { name: "ignore", source: "// @ts-ignore Real missing declaration.\nexport const value: Missing=1;", errors: 1 },
  { name: "nocheck", source: "// @ts-nocheck\nexport const value: Missing=1;", errors: 1 },
  { name: "checking enabled", source: "// @ts-check\nexport const value=1;", errors: 0 },
  { name: "source text", source: 'export const fixture="// @ts-expect-error missing";', errors: 0 },
  { name: "prose", source: "// A quoted @ts-expect-error is not a directive.\nexport const value=1;", errors: 0 },
  { name: "inline disable", source: `/* eslint-disable ${SOURCE_TYPE_SUPPRESSION_RULE} -- Attempted hard bypass. */\n${SOURCE}`, errors: 1 },
  { name: "configuration disable", source: `/* eslint "${SOURCE_TYPE_SUPPRESSION_RULE}":"off" */\n${SOURCE}`, errors: 1 },
])("the mandatory type-comment rule judges $name", async (row, { repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot, overrideConfigFile: join(repoRoot, "eslint-hard.config.js"), allowInlineConfig: false });
  const effective = await eslint.calculateConfigForFile(join(repoRoot, USER_BUS));
  expect(effective.languageOptions.parserOptions).toMatchObject({ project: false, projectService: false, programs: null });
  const [result] = await eslint.lintText(row.source, { filePath: join(repoRoot, USER_BUS) });
  expect(result?.fatalErrorCount).toBe(0);
  expect(result?.warningCount).toBe(0);
  expect(result?.messages.map(({ ruleId }) => ruleId)).toEqual(Array.from({ length: row.errors }, () => SOURCE_TYPE_SUPPRESSION_RULE));
});

test.for([
  "scripts/probes/st-goldens/generate-goldens.ts",
  "tooling/src/verify/contract/probe.ts",
  "packages/plugin-sdk/main.d.ts",
  "packages/showcase-plugins/bundles/probe/main.ts",
  "packages/default-content/src/probe.gen.ts",
  "packages/ui/token-contract.ts",
  "playwright/probe.tsx",
  "platform.d.ts",
  "knip.ts",
])("the mandatory source population includes %s", async (path, { repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot, overrideConfigFile: join(repoRoot, "eslint-hard.config.js"), allowInlineConfig: false });
  const [result] = await eslint.lintText(SOURCE, { filePath: join(repoRoot, path) });
  expect(result?.fatalErrorCount, path).toBe(0);
  expect(
    result?.messages.some(({ ruleId }) => ruleId === SOURCE_TYPE_SUPPRESSION_RULE),
    path,
  ).toBe(true);
});

test("the exact actual public-root counterfactual is rejected without changing its source", async ({ repoRoot }) => {
  const before = readFileSync(join(repoRoot, USER_BUS), "utf8");
  const arm = '  | { type: "credentialsChanged"; credentialId?: UserCredentialId }';
  expect(before.split(arm)).toHaveLength(2);
  const source = before
    .replace("export type UserBusEvent =", `${EXPECTATION}\ninterface NativeOpaqueBusBase extends MissingBusPayloadBase {}\n\nexport type UserBusEvent =`)
    .replace(arm, '  | ({ type: "credentialsChanged"; credentialId?: UserCredentialId } & NativeOpaqueBusBase)');
  const eslint = new ESLint({ cwd: repoRoot, overrideConfigFile: join(repoRoot, "eslint-hard.config.js"), allowInlineConfig: false });
  const [result] = await eslint.lintText(source, { filePath: join(repoRoot, USER_BUS) });
  expect(result?.messages).toMatchObject([{ ruleId: SOURCE_TYPE_SUPPRESSION_RULE }]);
  expect(readFileSync(join(repoRoot, USER_BUS), "utf8")).toBe(before);
});

test("tests negative expectations stay outside the mandatory source rule", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot, overrideConfigFile: join(repoRoot, "eslint-hard.config.js"), allowInlineConfig: false });
  const [result] = await eslint.lintText('// @ts-expect-error Type-negative assertion.\nconst value: number="invalid";', {
    filePath: join(repoRoot, "tests/contracts/type-boundary.test-d.ts"),
  });
  expect(result?.fatalErrorCount).toBe(0);
  expect(result?.messages).toEqual([]);
});

test("the real scoped CLI cannot disable the mandatory source rule", { tags: ["slow"] }, async ({ plantedTree, repoRoot, runCli }) => {
  // The counterfactual isolates the real mandatory rule, not unrelated typed-policy populations.
  const root = await plantedTree({
    ".gitignore": "node_modules\n.cache\nreports\n",
    "package.json": '{"name":"native-metadata-fixture","type":"module","private":true}',
    "pnpm-workspace.yaml": "packages:\n  - packages/*\n",
    "packages/server/package.json": '{"name":"@orb/server","type":"module","private":true}',
    "eslint.config.js": `import {hardConfig} from ${JSON.stringify(pathToFileURL(join(repoRoot, "eslint.config.js")).href)};export default hardConfig.map(row=>({...row,rules:{},linterOptions:{noInlineConfig:false,reportUnusedDisableDirectives:"off"}}));`,
    "eslint-hard.config.js": `import {hardConfig} from ${JSON.stringify(pathToFileURL(join(repoRoot, "eslint.config.js")).href)};export default hardConfig.map(row=>({...row,rules:Object.fromEntries(Object.entries(row.rules??{}).filter(([rule])=>rule===${JSON.stringify(SOURCE_TYPE_SUPPRESSION_RULE)}))}));`,
    "scripts/eslint.ts": `await import(${JSON.stringify(pathToFileURL(join(repoRoot, "scripts/eslint.ts")).href)});`,
    [USER_BUS]: `/* eslint-disable ${SOURCE_TYPE_SUPPRESSION_RULE} -- Attempted hard bypass. */\n${SOURCE}`,
  });
  execFixtureGit(root, ["init", "-q"]);
  execFixtureGit(root, ["add", "."]);
  const result = await runCli("verify", ["eslint-scoped", USER_BUS], { cwd: root });
  await expect(result).toExitWith(1);
  expect(result.stdout).toContain(SOURCE_TYPE_SUPPRESSION_RULE);
  expect(result.stdout).toContain('Do not use "@ts-expect-error"');
});

test("existing class authority rejects source expectations while retaining the actual tests grant", () => {
  const root = "/source-suppression-boundary";
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile(`${root}/${USER_BUS}`, SOURCE);
  project.createSourceFile(`${root}/tests/contracts/type-boundary.test-d.ts`, '// @ts-expect-error Type-negative contract.\nconst count:number="bad";');
  const grants = REVIEWED_GRANTS.filter(({ policyId, subject }) => policyId === suppressionGate.id && subject === "@ts-expect-error");
  expect(grants.map(({ operation }) => operation)).toEqual(["tests"]);
  const result = runPolicyPass({ root, project, knownPolicies: [suppressionGate], policies: [suppressionGate], reviewedGrants: grants, failOnWarnings: false });
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings.map(({ subject, operation }) => ({ subject, operation }))).toEqual([
    { subject: "@ts-expect-error", operation: "source" },
  ]);
  expect(result.authority.grantedFindings.map(({ grantId }) => grantId)).toEqual(["suppressions:tests-ts-expect-error"]);
  expect(result.authority.authorityAlarms).toEqual([]);
});

test("changed source and metadata reach mandatory lint without adding tests to the source population", async ({ repoRoot, plantedTree }) => {
  const source = "scripts/probes/st-goldens/generate-goldens.ts";
  const metadata = "tooling/src/verify/lib/source-type-suppression-native.ts";
  const root = await plantedTree({
    ".gitignore": "node_modules\n",
    "package.json": '{"name":"source-comment-selection","private":true,"type":"module"}',
    "packages/plugin-sdk/package.json": '{"name":"@orb/plugin-sdk","private":true,"type":"module"}',
    "scripts/ts7.ts": readFileSync(join(repoRoot, "scripts/ts7.ts"), "utf8"),
    "tsconfig.tests-dom.json": JSON.stringify({ compilerOptions: { types: [], lib: ["es2025", "dom"] }, files: [source] }),
    "tooling/tsconfig.json": JSON.stringify({ compilerOptions: { types: [], lib: ["es2025"] }, files: ["src/verify/lib/source-type-suppression-native.ts"] }),
    "packages/plugin-sdk/tsconfig.author-main.json": JSON.stringify({ compilerOptions: { types: [], lib: ["es2025"] }, files: ["main.d.ts"] }),
    [source]: "export const browserCallback=true;",
    [metadata]: "export const nativeMetadata=true;",
    "packages/plugin-sdk/main.d.ts": "export declare const sdk:unique symbol;",
    "eslint-hard.config.js": "export default [];",
  });
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  execFixtureGit(root, ["init"]);
  expect(resolveSelection({ kind: "changed", paths: [source, metadata, "eslint-hard.config.js"] }, root).eslintPaths).toEqual([
    source,
    metadata,
    "eslint-hard.config.js",
  ]);
  expect(resolveSelection({ kind: "scope", glob: "scripts/probes/st-goldens/**" }, root).eslintPaths).toEqual(["scripts/probes/st-goldens"]);
  expect(resolveSelection({ kind: "package", name: "plugin-sdk" }, root).eslintPaths).toEqual(["packages/plugin-sdk/"]);
  expect(isSourceTypeSuppressionSource("tests/contracts/type-boundary.test-d.ts")).toBe(false);
  expect(isSourceTypeSuppressionSource("scripts/probes/st-goldens/sillytavern-runtime/captured.ts")).toBe(false);
  expect(isSourceTypeSuppressionSource("playwright/.cache/generated.ts")).toBe(false);
  expect(affectsSourceTypeSuppressionNativeLint("tooling/src/verify/lib/source-type-suppression-native.ts")).toBe(true);
});

test("metadata-only scoped CLI changes rejudge the real source rule without a typed program", { tags: ["slow"] }, async ({ plantedTree, repoRoot, runCli }) => {
  // Metadata rejudgment must retain the syntax rule without borrowing a compiler Program.
  const ordinary = `import {hardConfig} from ${JSON.stringify(pathToFileURL(join(repoRoot, "eslint.config.js")).href)};export default hardConfig.map(row=>({...row,rules:{},linterOptions:{noInlineConfig:false,reportUnusedDisableDirectives:"off"}}));`;
  const root = await plantedTree({
    ".gitignore": "node_modules\n.cache\nreports\n",
    ...Object.fromEntries(SOURCE_TYPE_SUPPRESSION_NATIVE_INPUT_PATHS.map((path) => [path, ""])),
    "package.json": '{"name":"native-metadata-fixture","type":"module","private":true}',
    "pnpm-workspace.yaml": "packages:\n  - packages/*\n",
    "packages/server/package.json": '{"name":"@orb/server","type":"module","private":true}',
    "eslint.config.js": ordinary,
    "eslint-hard.config.js": `import {hardConfig} from ${JSON.stringify(pathToFileURL(join(repoRoot, "eslint.config.js")).href)};export default hardConfig.map(row=>({...row,rules:Object.fromEntries(Object.entries(row.rules??{}).filter(([rule])=>rule===${JSON.stringify(SOURCE_TYPE_SUPPRESSION_RULE)}))}));`,
    "scripts/eslint.ts": `await import(${JSON.stringify(pathToFileURL(join(repoRoot, "scripts/eslint.ts")).href)});`,
    "root-probe.ts": "export {};",
    "packages/ui/native-probe.ts": "export {};",
    "packages/showcase-plugins/bundles/native/main.ts": "export {};",
    "playwright/native-probe.ts": "export {};",
    "scripts/native-probe.ts": "export {};",
    "tooling/src/verify/lib/source-type-suppression-native.ts": "export const metadata=true;",
    [USER_BUS]: SOURCE,
  });
  execFixtureGit(root, ["init", "-q"]);
  execFixtureGit(root, ["add", "."]);
  const result = await runCli("verify", ["eslint-scoped", "tooling/src/verify/lib/source-type-suppression-native.ts"], { cwd: root });
  expect(result.code, result.stdout + result.stderr).toBe(1);
  await expect(result).toExitWith(1);
  expect(result.stdout).toContain("source-type-suppression-native hard:");
  expect(result.stdout).toContain(USER_BUS);
  expect(result.stdout).toContain(SOURCE_TYPE_SUPPRESSION_RULE);
});
