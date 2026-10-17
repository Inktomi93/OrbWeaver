// Native lexical restrictions read authored strings, not only class carriers or cooked values.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";

const ARBITRARY = "orb/no-arbitrary-tw-values";
const COLOR = "orb/no-color-literals";
const MEDIA = "orb/no-media-queries-in-features";
const POINTER = "orb/no-pointer-variants-in-features";
const WIDTH = "orb/no-raw-container-widths";
const RULES = [ARBITRARY, COLOR, MEDIA, POINTER, WIDTH] as const;
const CLIENT = "packages/client/src/features/probe/example.tsx";
const UI = "packages/ui/src/primitives/probe/example.tsx";

async function configured(eslint: ESLint, path: string, source: string, ids: readonly string[] = RULES): Promise<readonly Linter.LintMessage[]> {
  const config = await eslint.calculateConfigForFile(path);
  expect(config, path).toBeDefined();
  const messages = new Linter().verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
      plugins: config.plugins,
      rules: Object.fromEntries(ids.map((id) => [id, config.rules[id] ?? "off"])),
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

for (const [id, source] of [
  [ARBITRARY, 'export const value = "w-[137px]";'],
  [COLOR, 'export const value = "bg-black";'],
  [MEDIA, 'export const value = "md:flex-row";'],
  [POINTER, 'export const value = "pointer-coarse:hidden";'],
  [WIDTH, 'export const value = "max-w-96";'],
] as const) {
  test(`the actual native ${id} rule refuses a bare producer`, async ({ repoRoot }) => {
    const messages = await configured(new ESLint({ cwd: repoRoot }), join(repoRoot, CLIENT), source, [id]);
    expect(messages, source).toMatchObject([{ ruleId: id }]);
  });
}

test("arbitrary values preserve scoped utilities, token bodies and the original last-colon limits", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  for (const value of ["w-[137px] p-[7px]", "hover:w-[137px]", "text-[13px]", "grid-cols-[repeat(auto-fit,1fr)]", "-translate-x-[13px]"]) {
    // Negative utilities are not in the original predicate's alphabetic utility grammar.
    const expected = value.startsWith("-") ? 0 : 1;
    expect(await configured(eslint, join(repoRoot, UI), `export const value = ${JSON.stringify(value)};`, [ARBITRARY]), value).toHaveLength(expected);
  }
  for (const value of [
    "w-[var(--sidebar-width)]",
    "w-[--sidebar-width]",
    "translate-x-[calc(var(--a)-var(--b))]",
    "data-[state=open]:opacity-100",
    "has-[:focus-visible]:ring-2",
    "before:content-['']",
    "fill-[#fff]",
    "text-[color:red]",
    "!w-[137px]",
    "w-[137px]!",
  ]) {
    expect(await configured(eslint, join(repoRoot, UI), `export const value = ${JSON.stringify(value)};`, [ARBITRARY]), value).toEqual([]);
  }
});

test("color arms retain their remedies and do not mistake semantic colors or bare ramps for palette steps", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  for (const [value, remedy] of [
    ["bg-black/50", "named non-token color"],
    ["text-red-500", "palette-scale color"],
    ["bg-blue-300/50 ring-emerald-600", "palette-scale color"],
    ["text-[#abc]", "arbitrary hex color"],
  ] as const) {
    const messages = await configured(eslint, join(repoRoot, UI), `export const value = ${JSON.stringify(value)};`, [COLOR]);
    expect(messages, value).toHaveLength(1);
    expect(messages[0]?.message, value).toContain(remedy);
  }
  for (const value of ["text-foreground", "bg-primary text-muted-foreground border-border", "bg-red text-slate"]) {
    expect(await configured(eslint, join(repoRoot, CLIENT), `export const value = ${JSON.stringify(value)};`, [COLOR]), value).toEqual([]);
  }
});

test("viewport and pointer variants retain their different token and population boundaries", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  for (const value of ["md:flex-row", "min-[600px]:flex-row", "max-lg:hidden", "min-xl:block", "2xl:grid"]) {
    expect(await configured(eslint, join(repoRoot, UI), `export const value = ${JSON.stringify(value)};`, [MEDIA]), value).toHaveLength(1);
  }
  for (const value of ["@md:flex-row", "hover:md:flex", "!md:flex", "xmd:flex", "min-[600 px]:flex"]) {
    expect(await configured(eslint, join(repoRoot, CLIENT), `export const value = ${JSON.stringify(value)};`, [MEDIA]), value).toEqual([]);
  }
  for (const value of ["pointer-fine:group-hover:pointer-events-auto", "any-pointer-coarse:hidden", "[@media(hover:hover)]:block"]) {
    expect(await configured(eslint, join(repoRoot, CLIENT), `export const value = ${JSON.stringify(value)};`, [POINTER]), value).toHaveLength(1);
  }
  for (const value of [
    "hover:bg-accent @md:flex-row",
    "min-w-touch-target min-h-touch-target",
    "pointer-events-none pointer-events-auto",
    "hover:pointer-fine:hidden",
    "[@media(pointer: coarse)]:block",
  ]) {
    expect(await configured(eslint, join(repoRoot, CLIENT), `export const value = ${JSON.stringify(value)};`, [POINTER]), value).toEqual([]);
  }
});

test("width rules keep whole-token numeric and bracket syntax, not new variant or floor bans", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  for (const value of ["w-[600px]", "mx-auto max-w-96 rounded", "w-2.5", "max-w-1.25", "min-w-[600px]"]) {
    expect(await configured(eslint, join(repoRoot, CLIENT), `export const value = ${JSON.stringify(value)};`, [WIDTH]), value).toHaveLength(1);
  }
  for (const value of ["w-full", "w-1/2", "min-w-24", "w-0", "md:w-96", "!w-96", "w-96!", "w-96-wide", "w-[foo bar]"]) {
    expect(await configured(eslint, join(repoRoot, CLIENT), `export const value = ${JSON.stringify(value)};`, [WIDTH]), value).toEqual([]);
  }
});

test("unfenced raw literals include type strings, keys and producers without decoding escape sequences", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  for (const [id, value] of [
    [ARBITRARY, "w-[137px]"],
    [COLOR, "bg-black"],
    [MEDIA, "md:flex-row"],
    [POINTER, "pointer-coarse:hidden"],
    [WIDTH, "max-w-96"],
  ] as const) {
    for (const source of [
      `export type Value = ${JSON.stringify(value)};`,
      `export const values = { ${JSON.stringify(value)}: true };`,
      `export function value(): string { return ${JSON.stringify(value)}; }`,
      `import { clsx as alias } from "clsx"; export const value = alias(${JSON.stringify(value)});`,
      `function cn(value: string) { return value.length; } cn(${JSON.stringify(value)});`,
      `// ${value}\nexport const value = "clean";`,
    ]) {
      const expected = source.startsWith("//") ? 0 : 1;
      expect(await configured(eslint, join(repoRoot, CLIENT), source, [id]), source).toHaveLength(expected);
    }
  }
  expect(await configured(eslint, join(repoRoot, CLIENT), 'export const value = "bg-\\u0062lack";', [COLOR])).toEqual([]);
  expect(await configured(eslint, join(repoRoot, CLIENT), 'export const value = "max-w-\\u0039\\u0036";', [WIDTH])).toEqual([]);
  expect(await configured(eslint, join(repoRoot, CLIENT), '<div className="bg-&#98;lack" />;', [COLOR])).toEqual([]);
});

test("only the viewport ban reads interpolated spans while all five read untagged and tagged static templates", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  for (const [id, value] of [
    [ARBITRARY, "w-[137px]"],
    [COLOR, "bg-black"],
    [MEDIA, "md:flex-row"],
    [POINTER, "pointer-coarse:hidden"],
    [WIDTH, "max-w-96"],
  ] as const) {
    for (const prefix of ["", "tag"]) {
      expect(await configured(eslint, join(repoRoot, CLIENT), `export const value = ${prefix}\`${value}\`;`, [id]), id).toHaveLength(1);
    }
    const source = `export const value = \`${value}\${dynamic}\`;`;
    expect(await configured(eslint, join(repoRoot, CLIENT), source, [id]), source).toHaveLength(id === MEDIA ? 1 : 0);
  }
  expect(await configured(eslint, join(repoRoot, CLIENT), "export const value = `${a} md:flex-row ${b} lg:hidden`;", [MEDIA])).toHaveLength(2);
  expect(await configured(eslint, join(repoRoot, CLIENT), "export const value = `${prefix}:flex-row`;", [MEDIA])).toEqual([]);
});

test("effective source scopes preserve generated and declaration files without covering tests or unrelated packages", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  for (const path of ["packages/ui/src/tokens/index.ts", "packages/ui/src/tokens/themes.gen.ts"]) {
    const config = await eslint.calculateConfigForFile(join(repoRoot, path));
    expect(config.rules["better-tailwindcss/no-unknown-classes"], path).toBeUndefined();
    expect(config.rules["orb/no-tailwind-dark-variant"], path).toBeUndefined();
    expect(config.rules["orb/class-token-splice"], path).toBeUndefined();
    expect(config.languageOptions.parserOptions.projectService, path).toBe(false);
  }
  const source = 'export type Bad = "bg-black w-[137px] md:flex max-w-96 pointer-coarse:hidden";';
  for (const path of ["packages/ui/src/tokens/index.ts", "packages/ui/src/tokens/themes.gen.ts", "packages/ui/src/primitives/probe.d.ts", UI, CLIENT]) {
    const messages = await configured(eslint, join(repoRoot, path), source);
    expect(
      messages.map(({ ruleId }) => ruleId).toSorted((left, right) => String(left).localeCompare(String(right))),
      path,
    ).toEqual((path === CLIENT ? [...RULES] : RULES.filter((id) => id !== POINTER)).toSorted());
  }
  for (const path of [
    "tests/client/components/example.ct.tsx",
    "tests/legacy/client/example.test.ts",
    "packages/server/src/example.ts",
    "tooling/src/example.ts",
  ]) {
    expect(await configured(eslint, join(repoRoot, path), source), path).toEqual([]);
  }
  expect(await configured(eslint, join(repoRoot, "packages/client/src/features/app-shell/example.tsx"), source, [MEDIA, POINTER])).toEqual([]);
  expect(await configured(eslint, join(repoRoot, "packages/client/src/lib/example.ts"), source, [POINTER])).toEqual([]);
  for (const path of ["packages/ui/src/layout/example.ts", "packages/ui/src/markdown/example.tsx"]) {
    expect(await configured(eslint, join(repoRoot, path), source, [WIDTH]), path).toEqual([]);
    expect(await configured(eslint, join(repoRoot, path), 'export const value = "w-[137px]";', [ARBITRARY]), path).toHaveLength(1);
  }
});

test("real recipe and inherited-skin permissions are line-local, live and do not license a fresh line in the same file", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  for (const [path, badValue] of [
    ["packages/ui/src/layout/variants.ts", "w-[137px]"],
    ["packages/ui/src/markdown/markdown.tsx", "w-[137px]"],
    ["packages/ui/src/primitives/card/variants.ts", "rounded-[14px]"],
  ] as const) {
    const source = readFileSync(join(repoRoot, path), "utf8");
    expect(source).not.toContain("@orb-waive no-arbitrary-tw-values");
    expect(await configured(eslint, join(repoRoot, path), source, [ARBITRARY]), path).toEqual([]);
    const unlicensed = source.replace(/^.*eslint-disable-next-line orb\/no-arbitrary-tw-values.*\r?\n/gmu, "");
    expect((await configured(eslint, join(repoRoot, path), unlicensed, [ARBITRARY])).length, path).toBeGreaterThan(0);
    expect(await configured(eslint, join(repoRoot, path), `${source}\nexport const unlicensed = ${JSON.stringify(badValue)};`, [ARBITRARY])).toMatchObject([
      { ruleId: ARBITRARY },
    ]);
  }
  const card = join(repoRoot, "packages/ui/src/primitives/card/variants.ts");
  const withoutInheritance = readFileSync(card, "utf8").replaceAll("before:rounded-[inherit] ", "");
  expect(await configured(eslint, card, withoutInheritance, [ARBITRARY])).toMatchObject([
    { ruleId: null, message: expect.stringContaining("Unused eslint-disable directive") },
    { ruleId: null, message: expect.stringContaining("Unused eslint-disable directive") },
  ]);
  const path = join(repoRoot, "packages/ui/src/layout/permission.ts");
  const directive = "// eslint-disable-next-line orb/no-arbitrary-tw-values -- shared track composition until a token expresses these tracks.\n";
  expect(await configured(eslint, path, `${directive}export const value = "grid-cols-[repeat(auto-fit,1fr)]";`, [ARBITRARY])).toEqual([]);
  expect(await configured(eslint, path, `${directive}export const value = "grid-cols-2";`, [ARBITRARY])).toMatchObject([
    { ruleId: null, message: expect.stringContaining("Unused eslint-disable directive") },
  ]);
});
