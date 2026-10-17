import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";

const TESTID = "orb/testid-typed-only";
const SCROLL = "orb/scroll-container-positioned";
const SUBJECT = "packages/client/src/components/probe.tsx";

async function messages(root: string, rule: string, source: string, path = SUBJECT): Promise<readonly Linter.LintMessage[]> {
  const filename = join(root, path);
  const config = await new ESLint({ cwd: root }).calculateConfigForFile(filename);
  expect(config).toBeDefined();
  const found = new Linter().verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config.plugins,
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
      linterOptions: { reportUnusedDisableDirectives: "error" },
      rules: { [rule]: config.rules[rule] ?? "off" },
    },
    { filename },
  );
  expect(found.some(({ fatal }) => fatal === true)).toBe(false);
  return found;
}

for (const [name, rule, source, count] of [
  ["empty test id", TESTID, 'const A=<div data-testid=""/>;', 1],
  ["braced empty test id", TESTID, 'const A=<div data-testid={""}/>;', 1],
  ["template test id", TESTID, "const A=<div data-testid={`raw`}/>;", 1],
  ["deep non-null template wrapper", TESTID, "const A=<div data-testid={((((`raw` as string)!) satisfies string)!)}/>;", 1],
  ["dynamic template", TESTID, "const A=<div data-testid={`raw-${value}`}/>;", 0],
  ["typed call", TESTID, 'const A=<div data-testid={testId("raw")}/>;', 0],
  ["other call remains nonliteral", TESTID, 'const A=<div data-testid={other("raw")}/>;', 0],
  ["type-only literal inside an expression is not the value", TESTID, 'const A=<div data-testid={id as "raw"}/>;', 0],
  ["constant remains indirect", TESTID, 'const id="raw";const A=<div data-testid={id}/>;', 0],
  ["spread remains indirect", TESTID, 'const A=<div {...{"data-testid":"raw"}}/>;', 0],
  ["missing value", TESTID, "const A=<div data-testid/>;", 0],
  ["empty expression", TESTID, "const A=<div data-testid={/*owner*/}/>;", 0],
  ["numeric value", TESTID, "const A=<div data-testid={3}/>;", 0],
  ["similar attribute", TESTID, 'const A=<div data-test-id="raw"/>;', 0],
  ["member component still has raw attribute", TESTID, 'const A=<UI.Part data-testid="raw"/>;', 1],
  ["separate attributes keep separate findings", TESTID, 'const A=<div data-testid="raw"><span data-testid="raw"/></div>;', 2],
  ["both-axis scroll", SCROLL, 'const A="overflow-auto";', 1],
  ["both-axis forced scroll", SCROLL, 'const A="overflow-scroll";', 1],
  ["vertical forced scroll", SCROLL, 'const A="overflow-y-scroll";', 1],
  ["horizontal only", SCROLL, 'const A="overflow-x-auto overflow-x-scroll";', 0],
  ["hidden clip", SCROLL, 'const A="overflow-hidden overflow-y-hidden";', 0],
  ["relative", SCROLL, 'const A="relative overflow-y-auto";', 0],
  ["absolute", SCROLL, 'const A="absolute overflow-y-auto";', 0],
  ["fixed", SCROLL, 'const A="fixed overflow-auto";', 0],
  ["sticky", SCROLL, 'const A="sticky overflow-scroll";', 0],
  ["static is not positioned", SCROLL, 'const A="static overflow-y-auto";', 1],
  ["position substring is not a utility", SCROLL, 'const A="table-fixed overflow-y-auto";', 1],
  ["scroll substring is not a utility", SCROLL, 'const A="overflow-y-auto-driven";', 0],
  ["unfenced prose token stays in scope", SCROLL, 'const A="this pane is overflow-y-auto today";', 1],
  ["variant position acquits", SCROLL, 'const A="md:relative overflow-y-auto";', 0],
  ["nested arbitrary variant position", SCROLL, 'const A="[@media(hover:hover)]:relative overflow-y-auto";', 0],
  ["valid parentheses token is an ordinary finding", SCROLL, 'const A="[@media(hover:hover)]:overflow-y-auto";', 1],
  ["nested bracket variant", SCROLL, 'const A="data-[x=[y:z]]:overflow-y-auto";', 1],
  ["unclosed bracket does not invent a terminal", SCROLL, 'const A="[x:overflow-y-auto";', 0],
  ["unmatched closer preserves reader posture", SCROLL, 'const A="x]:overflow-y-auto";', 0],
  ["important trailing scroll", SCROLL, 'const A="overflow-y-auto!";', 1],
  ["important leading position", SCROLL, 'const A="!relative overflow-y-auto";', 0],
  ["important trailing position", SCROLL, 'const A="relative! overflow-y-auto";', 0],
  ["both important markers preserve reader semantics", SCROLL, 'const A="!relative! !overflow-y-auto!";', 0],
  ["extra important marker is not silently stripped", SCROLL, 'const A="!!relative overflow-y-auto";', 1],
  ["two scrolls one literal", SCROLL, 'const A="overflow-y-auto overflow-scroll";', 1],
  ["separate literal cannot lend position", SCROLL, 'const A=cn("relative","overflow-y-auto");', 1],
  ["template head", SCROLL, "const A=`overflow-y-auto ${value}`;", 1],
  ["template middle", SCROLL, "const A=`${value} overflow-y-auto ${other}`;", 1],
  ["template tail", SCROLL, "const A=`${value} overflow-y-auto`;", 1],
  ["template parts cannot lend position", SCROLL, "const A=`relative ${value} overflow-y-auto`;", 1],
  ["two template parts keep two findings", SCROLL, "const A=`overflow-y-auto ${value} overflow-y-auto`;", 2],
  ["runtime-built token", SCROLL, "const A=`overflow-${axis}-auto`;", 0],
  ["raw unicode escape does not become a utility", SCROLL, String.raw`const A="\u006fverflow-y-auto";`, 0],
  ["raw escape does not become whitespace", SCROLL, String.raw`const A="relative\noverflow-y-auto";`, 0],
  ["actual template newline balances same part", SCROLL, "const A=`relative\noverflow-y-auto`;", 0],
  ["comment only", SCROLL, "// overflow-y-auto\nconst A=1;", 0],
  ["JSX text is not a literal", SCROLL, "const A=<p>overflow-y-auto</p>;", 0],
  ["textarea still needs inert position", SCROLL, 'const A=<textarea className="overflow-y-auto"/>;', 1],
] as const) {
  test(`native lexical boundary ${name}`, async ({ repoRoot }) => {
    expect(await messages(repoRoot, rule, source)).toHaveLength(count);
  });
}

for (const [path, rule, source, count] of [
  ["packages/client/src/components/x.gen.tsx", TESTID, 'const A=<div data-testid="raw"/>;', 1],
  ["packages/ui/src/primitives/probe.tsx", TESTID, 'const A=<div data-testid="raw"/>;', 0],
  ["tests/client/features/x/_ct-stories.tsx", TESTID, 'const A=<div data-testid="raw"/>;', 0],
  ["packages/ui/src/primitives/probe.gen.ts", SCROLL, 'const A="overflow-y-auto";', 1],
  ["packages/ui/src/primitives/probe.d.ts", SCROLL, 'declare const A:"overflow-y-auto";', 1],
  ["packages/client/src/features/x/variants.ts", SCROLL, 'const A=tv({base:"overflow-y-auto"});', 1],
  ["packages/server/src/domain/x/probe.ts", SCROLL, 'const A="overflow-y-auto";', 0],
  ["tests/ui/probe.ct.tsx", SCROLL, 'const A="overflow-y-auto";', 0],
] as const) {
  test(`native lexical population ${path} ${rule}`, async ({ repoRoot }) => {
    expect(await messages(repoRoot, rule, source, path)).toHaveLength(count);
  });
}

for (const [rule, bad] of [
  [TESTID, 'const A=<div data-testid="raw"/>;'],
  [SCROLL, 'const A="overflow-y-auto";'],
] as const) {
  test(`native lexical line permission ${rule}`, async ({ repoRoot }) => {
    const permission = `// eslint-disable-next-line ${rule} -- Bounded native permission control.\n`;
    expect(await messages(repoRoot, rule, permission + bad)).toEqual([]);
    expect(await messages(repoRoot, rule, permission + bad + "\n" + bad.replace(" A=", " B="))).toMatchObject([{ ruleId: rule }]);
    expect(await messages(repoRoot, rule, permission + "const clean=1;")).toMatchObject([
      { ruleId: null, message: expect.stringContaining("Unused eslint-disable directive") },
    ]);
  });
}

for (const [name, rule, source] of [
  ["bare test id", TESTID, 'const A=<div data-testid="raw"/>;'],
  ["wrapped test id", TESTID, 'const A=<div data-testid={(("raw"! as string) satisfies string)}/>;'],
  ["raw scroller", SCROLL, 'const A="overflow-y-auto";'],
  ["variant important scroller", SCROLL, 'const A="md:!overflow-y-scroll";'],
] as const) {
  test(`native lexical founding ${name}`, async ({ repoRoot }) => {
    expect(await messages(repoRoot, rule, source)).toMatchObject([{ ruleId: rule }]);
  });
}
