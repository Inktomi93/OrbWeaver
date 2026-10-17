import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import {
  affectsClientLexicalNativeLint,
  CLIENT_LEXICAL_NATIVE_INPUT_PATHS,
  CLIENT_LEXICAL_NATIVE_RULES,
} from "../../../../tooling/src/verify/lib/client-lexical-native.ts";

const repoRoot = join(import.meta.dirname, "../../../..");
const RULE = "orb/ui-size-via-variant";
const CLIENT = "packages/client/src/features/probe/example.tsx";
const UI = "packages/ui/src/primitives/probe/example.tsx";
const IMPORT = 'import { Button } from "@orb/ui/button";\n';

async function findings(eslint: ESLint, path: string, source: string): Promise<readonly Linter.LintMessage[]> {
  const config = await eslint.calculateConfigForFile(path);
  expect(config, path).toBeDefined();
  const messages = new Linter({ cwd: repoRoot }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
      plugins: config.plugins,
      rules: { [RULE]: config.rules[RULE] ?? "off" },
      linterOptions: config.linterOptions,
    },
    { filename: path },
  );
  expect(
    messages.filter(({ fatal }) => fatal),
    source,
  ).toEqual([]);
  return messages;
}

test("native sizing preserves every sealed-size spelling and exact authored token coordinate", async () => {
  const eslint = new ESLint({ cwd: repoRoot });
  for (const token of [
    "size-auto",
    "h-auto",
    "h-control",
    "w-40",
    "h-control-sm",
    "size-avatar-md",
    "focus:h-9",
    "!size-6",
    "h-auto!",
    "focus:!h-9",
    "[&:hover]:h-9!",
    "w-px",
    "h-2.5",
  ]) {
    const source = `${IMPORT}export const G = <Button className="p-0 ${token} shrink-0" />;`;
    const messages = await findings(eslint, join(repoRoot, CLIENT), source);
    expect(messages, token).toHaveLength(1);
    const message = messages[0];
    expect(message).toMatchObject({ ruleId: RULE, severity: 2, line: 2 });
    expect(source.split("\n")[1]?.slice((message?.column ?? 1) - 1, (message?.endColumn ?? 1) - 1)).toBe(token);
  }
  expect(await findings(eslint, join(repoRoot, UI), `${IMPORT}export const G = <Button className="h-control w-40" />;`)).toHaveLength(2);
  for (const [module, tag, value] of [
    ["tabs", "TabsTab", "h-auto"],
    ["avatar", "Avatar", "size-avatar-md"],
    ["input", "Input", "focus:!h-9"],
  ]) {
    const source = `import { ${tag} } from "@orb/ui/${module}"; export const G = <${tag} className="${value}" />;`;
    expect(await findings(eslint, join(repoRoot, CLIENT), source), source).toHaveLength(1);
  }
});

test("layout values, raw elements, local components and unsized APIs retain their fences", async () => {
  const eslint = new ESLint({ cwd: repoRoot });
  for (const value of [
    "w-full max-w-md min-w-0 shrink-0",
    "min-h-0",
    "h-full w-fit",
    "min-w-touch-target max-w-cq-md max-h-control-sm",
    "!w-full !min-h-0 !p-0 !shrink-0",
    "h-screen w-svw h-lvh size-dvh",
    "w-1/2 h-2/3",
    "w-(--custom)",
  ]) {
    expect(await findings(eslint, join(repoRoot, CLIENT), `${IMPORT}export const G = <Button className="${value}" />;`), value).toEqual([]);
  }
  for (const source of [
    'export const G = <div className="h-auto size-auto w-40" />;',
    'const Button = () => null; export const G = <Button className="size-auto" />;',
  ]) {
    expect(await findings(eslint, join(repoRoot, CLIENT), source), source).toEqual([]);
  }
  for (const specifier of ["layout", "skeleton", "theme-scope", "crossfade-image", "background-video", "virtual-list"]) {
    const source = `import { Box } from "@orb/ui/${specifier}"; export const G = <Box className="h-64 w-40" />;`;
    expect(await findings(eslint, join(repoRoot, CLIENT), source), specifier).toEqual([]);
  }
});

test("named imports and literal carriers preserve aliases, wrappers and explicit reader limits", async () => {
  const eslint = new ESLint({ cwd: repoRoot });
  const path = join(repoRoot, CLIENT);
  const prefix = 'import { Button as Action } from "@orb/ui/button";\n';
  for (const carrier of ['"h-9"', '{"h-9"}', "{`h-9`}"]) {
    expect(await findings(eslint, path, `${prefix}export const G = <Action className=${carrier}></Action>;`), carrier).toHaveLength(1);
  }
  for (const carrier of ['{("h-9")}', '{"h-9" as const}', '{"h-9" satisfies string}', '{cn("h-9")}', "{SIZE}", "{`h-${size}`}", "{tag`h-9`}"]) {
    expect(await findings(eslint, path, `${prefix}export const G = <Action className=${carrier} />;`), carrier).toEqual([]);
  }
  for (const source of [
    'import * as UI from "@orb/ui/button"; export const G = <UI.Button className="h-9" />;',
    'import Button from "@orb/ui/button"; export const G = <Button className="h-9" />;',
    `${IMPORT}export const G = <Button {...{className: "h-9"}} />;`,
    `${IMPORT}// <Button className="h-9" />\nexport const G = <Button />;`,
  ]) {
    expect(await findings(eslint, path, source), source).toEqual([]);
  }
  expect(await findings(eslint, path, `${prefix}export const G = <Action className="h-9" />;`)).toHaveLength(1);
  expect(await findings(eslint, path, `export const G = <Action className="h-9" />;\n${prefix}`)).toHaveLength(1);
  expect(await findings(eslint, path, 'const Action = () => null; export const G = <Action className="h-9" />;')).toEqual([]);
});

test("effective native scope includes authored outputs and declarations but not tests or other packages", async () => {
  const eslint = new ESLint({ cwd: repoRoot });
  const source = `${IMPORT}export const G = <Button className="size-auto" />;`;
  for (const path of [
    CLIENT,
    UI,
    "packages/client/src/example.gen.tsx",
    "packages/ui/src/example.gen.tsx",
    "packages/ui/src/example.d.ts",
    "packages/client/src/example.ts",
  ]) {
    const tsSource = path.endsWith(".ts") ? `${IMPORT}export type G = string;` : source;
    const config = await eslint.calculateConfigForFile(join(repoRoot, path));
    expect(config.rules[RULE], path).toEqual([2]);
    expect(await findings(eslint, join(repoRoot, path), tsSource), path).toHaveLength(path.endsWith(".ts") ? 0 : 1);
  }
  for (const path of ["packages/server/src/example.tsx", "tooling/src/example.tsx", "tests/client/example.ct.tsx", "tests/legacy/client/example.ct.tsx"]) {
    expect(await findings(eslint, join(repoRoot, path), source), path).toEqual([]);
  }
});

test("real Select permissions are live and line-local; VirtualList height is caller-owned without permission", async () => {
  const eslint = new ESLint({ cwd: repoRoot });
  for (const path of [
    "packages/client/src/features/character/components/character-library-toolbar.tsx",
    "packages/client/src/features/tag/surfaces/labels-list-surface.tsx",
  ]) {
    const source = readFileSync(join(repoRoot, path), "utf8");
    expect(source).not.toContain("@orb-waive ui-size-via-variant");
    expect(await findings(eslint, join(repoRoot, path), source), path).toEqual([]);
    const unlicensed = source.replace(/^.*eslint-disable-next-line orb\/ui-size-via-variant.*\r?\n/gmu, "");
    expect(await findings(eslint, join(repoRoot, path), unlicensed), path).toMatchObject([{ ruleId: RULE }]);
    expect(await findings(eslint, join(repoRoot, path), source.replace('className="w-auto"', 'className="w-full"')), path).toMatchObject([
      { ruleId: null, message: expect.stringContaining("Unused eslint-disable directive") },
    ]);
    expect(
      await findings(
        eslint,
        join(repoRoot, path),
        `${source}\nimport { Button as NewControl } from "@orb/ui/button";\nexport const fresh = <NewControl className="h-9" />;`,
      ),
      path,
    ).toMatchObject([{ ruleId: RULE }]);
  }
  const rows = "packages/client/src/features/tag/components/tag-collection-rows.tsx";
  const source = readFileSync(join(repoRoot, rows), "utf8");
  expect(source).not.toContain("@orb-waive ui-size-via-variant");
  expect(source).not.toContain("eslint-disable-next-line orb/ui-size-via-variant");
  expect(await findings(eslint, join(repoRoot, rows), source)).toEqual([]);
});

test("native permissions expose misspelled rules and stale positions instead of hiding fresh findings", async () => {
  const eslint = new ESLint({ cwd: repoRoot });
  const path = join(repoRoot, CLIENT);
  expect(
    await findings(
      eslint,
      path,
      `${IMPORT}// eslint-disable-next-line orb/ui-size-via-variant-wrong -- wrong rule.\nexport const G = <Button className="h-9" />;`,
    ),
  ).toMatchObject([{ ruleId: "orb/ui-size-via-variant-wrong", message: expect.stringContaining("was not found") }, { ruleId: RULE }]);
  expect(
    await findings(
      eslint,
      path,
      `${IMPORT}// eslint-disable-next-line orb/ui-size-via-variant -- stale line.\nexport const clean = true;\nexport const G = <Button className="h-9" />;`,
    ),
  ).toMatchObject([{ ruleId: null, message: expect.stringContaining("Unused eslint-disable directive") }, { ruleId: RULE }]);
});

test("canonical token-reader changes invalidate native settings and select the sizing rule", async () => {
  const helper = "tooling/src/verify/lib/tailwind-class-token.ts";
  expect(CLIENT_LEXICAL_NATIVE_RULES).toContain(RULE);
  expect(CLIENT_LEXICAL_NATIVE_INPUT_PATHS).toContain(helper);
  expect(affectsClientLexicalNativeLint(helper)).toBe(true);
  expect(affectsClientLexicalNativeLint("tooling/src/verify/lib")).toBe(true);
  const config = await new ESLint({ cwd: repoRoot }).calculateConfigForFile(join(repoRoot, CLIENT));
  const identity = createHash("sha256")
    .update(JSON.stringify(CLIENT_LEXICAL_NATIVE_INPUT_PATHS.map((path) => [path, readFileSync(join(repoRoot, path), "utf8")])))
    .digest("hex");
  expect(config.settings["orb/client-lexical-inputs"]).toBe(identity);
});
