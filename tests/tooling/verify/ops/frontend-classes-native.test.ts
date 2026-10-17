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

const ROOT = join(import.meta.dirname, "../../../..");
const SUBJECT = "packages/client/src/features/chat/components/probe.tsx";
const SPACING = "orb/no-raw-spacing-in-features";
const TYPE = "orb/no-raw-typography-in-features";
const HOVER = "orb/no-hover-display-swap";
const RULES = [SPACING, TYPE, HOVER];
const ORDINARY_ESLINT = new ESLint({ cwd: ROOT });
const HARD_ESLINT = new ESLint({ cwd: ROOT, overrideConfigFile: join(ROOT, "eslint-hard.config.js") });

async function findings(source: string, rules = RULES, path = SUBJECT, hard = false): Promise<readonly Linter.LintMessage[]> {
  const config = await (hard ? HARD_ESLINT : ORDINARY_ESLINT).calculateConfigForFile(join(ROOT, path));
  expect(config, path).toBeDefined();
  const messages = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
      plugins: config.plugins,
      rules: Object.fromEntries(rules.map((rule) => [rule, config.rules[rule] ?? "off"])),
      linterOptions: { noInlineConfig: hard, reportUnusedDisableDirectives: "error" },
    },
    { filename: join(ROOT, path) },
  );
  expect(
    messages.filter(({ fatal }) => fatal),
    source,
  ).toEqual([]);
  return messages;
}

test("raw spacing and typography retain their literal and nearest-carrier grammar", async () => {
  const cases = [
    ['const x=<div className="TOKEN"/>;', 1],
    ['const x=cn("TOKEN");', 1],
    ['const x=clsx({"TOKEN":ok});', 1],
    ['const x=cva({variants:{size:{large:"TOKEN"}}});', 1],
    ['const x=tv({unrelated:"TOKEN"});', 1],
    ['const x="TOKEN";', 0],
    ['const styles="TOKEN";', 0],
    ['const classes="TOKEN";', 0],
    ['const x=<div class="TOKEN"/>;', 0],
    ['const x=twMerge("TOKEN");', 0],
    ['const x=<div title="TOKEN"/>;', 0],
    ['describe("TOKEN");', 0],
    ['const x=cn(forward("TOKEN"));', 0],
    ['const x=forward(cn("TOKEN"));', 1],
    ['const x=<div className={forward("TOKEN")}/>;', 1],
    ['const x=cn(<div title="TOKEN"/>);', 1],
    ['const x=<div className={<div title="TOKEN"/>}/>;', 0],
    ['const x=cn(()=>{const note="TOKEN";return note;});', 1],
    ["const x=cn(tag`TOKEN`);", 1],
    ["const x=cn(`TOKEN ${value}`);", 0],
    ['const x=cn(`${"TOKEN"}`);', 1],
    ['const x=utils.cn("TOKEN");', 0],
    ['const x=(cn)("TOKEN");', 0],
    ['const x=cn?.("TOKEN");', 1],
    ['const x=cn<string>("TOKEN");', 1],
    ['const x=new cn("TOKEN");', 0],
    ['const x=<div className={null as "TOKEN"}/>;', 1],
  ] as const;
  for (const [rule, token] of [
    [SPACING, "p-4"],
    [TYPE, "text-sm"],
  ] as const) {
    for (const [pattern, count] of cases) {
      const source = pattern.replace("TOKEN", token);
      expect(await findings(source, [rule]), source).toHaveLength(count);
    }
  }
  for (const token of ["p-0", "gap-x-4", "p-row", "gap-gutter", "py-block"]) {
    expect(await findings(`const x=cn("${token}");`, [SPACING]), token).toEqual([]);
  }
  for (const token of ["-m-2", "p-0.5", "space-y-[3px]", "prefix-p-4-wide"]) {
    expect(await findings(`const x=cn("${token}");`, [SPACING]), token).toHaveLength(1);
  }
  expect(await findings('const x=cn("text-body text-micro text-label");', [TYPE])).toEqual([]);
  expect(await findings('const x=cn("text-9xl text-[13px] text-smaller");', [TYPE])).toHaveLength(1);
  expect(await findings(String.raw`const x=cn("p-\u0034 text-\u0073m");`, [SPACING, TYPE])).toEqual([]);
});

test("hover display keeps unfenced per-token variants and every literal template part", async () => {
  const positives = [
    "group-hover/row:hidden",
    "group-hover:flex",
    "pointer-fine:group-hover/member:flex",
    "hover:hidden",
    "peer-hover:block",
    "not-hover:hidden",
    "not-group-hover/name:!inline-flex",
    "[&:hover]:hidden",
    "[&:hover:focus]:grid!",
  ];
  for (const token of positives) {
    expect(await findings(`const indirect="${token}";`, [HOVER]), token).toHaveLength(1);
  }
  const source = "const x=`hover:hidden ${a} peer-hover:block ${b} [&:hover]:grid`;";
  expect(await findings(source, [HOVER])).toHaveLength(3);
  const pair = 'const x="hover:hidden peer-hover:block";';
  const messages = await findings(pair, [HOVER]);
  expect(messages.map(({ column }) => column)).toEqual([pair.indexOf("hover:hidden") + 1, pair.indexOf("peer-hover:block") + 1]);
  for (const token of [
    "group-hover/row:invisible",
    "group-focus-within/row:invisible",
    "pointer-coarse:hidden",
    "opacity-0",
    "group-hover:opacity-100",
    "pointer-fine:flex",
    "sm:block",
    "group-hover:bg-accent",
    "group-focus-within:flex",
    "group-hover:table-auto",
    "flex-1",
    "grid-cols-3",
    "[@media(hover:hover)]:flex",
    "hidden on hover",
    "hover-tip:hidden",
  ]) {
    expect(await findings(`const x="${token}";`, [HOVER]), token).toEqual([]);
  }
  expect(await findings("const x=`group-hover:${display}`;", [HOVER])).toEqual([]);
});

test("native homes, generated sources and outside populations preserve exact scope", async () => {
  const source = 'const x=cn("p-4 text-sm hover:hidden");';
  for (const path of ["packages/ui/src/layout/probe.ts", "packages/ui/src/layout/nested/probe.ts", "packages/ui/src/markdown/probe.tsx"]) {
    expect(await findings(source, RULES, path), path).toMatchObject([{ ruleId: HOVER }]);
  }
  for (const path of [SUBJECT, "packages/ui/src/layout-wide/probe.ts", "packages/ui/src/markdown-wide/probe.ts", "packages/ui/src/probe.gen.tsx"]) {
    expect(await findings(source, RULES, path), path).toHaveLength(3);
  }
  expect(await findings('export type X="hover:hidden";', RULES, "packages/ui/src/probe.d.ts")).toMatchObject([{ ruleId: HOVER }]);
  for (const path of ["packages/server/src/probe.ts", "tests/client/probe.ct.tsx", "tests/legacy/ui/probe.test.ts", "tooling/src/probe.ts"]) {
    expect(await findings(source, RULES, path), path).toEqual([]);
  }
  expect(await findings(source, RULES, SUBJECT, true)).toEqual([]);
});

test("ordinary native directives remain line-local, stale and unknown directives fail", async () => {
  for (const [rule, token] of [
    [SPACING, "p-4"],
    [TYPE, "text-sm"],
    [HOVER, "hover:hidden"],
  ] as const) {
    const body = `const x=cn("${token}");`;
    const marker = `// eslint-disable-next-line ${rule} -- Controlled native permission input; remove with fixture.\n`;
    expect(await findings(`${marker}${body}`, [rule])).toEqual([]);
    expect(await findings(`${marker}${body}\n${body}`, [rule])).toMatchObject([{ ruleId: rule }]);
    expect(await findings(`${marker}const x="safe";`, [rule])).toMatchObject([{ message: expect.stringContaining("Unused eslint-disable directive") }]);
    expect(await findings(`// eslint-disable-next-line ${rule}-wrong -- Unknown native rule.\n${body}`, [rule])).toHaveLength(2);
  }
});

test("the existing lexical metadata admission includes all three native rules and both retained home inputs", async () => {
  const config = await new ESLint({ cwd: ROOT }).calculateConfigForFile(join(ROOT, SUBJECT));
  for (const rule of RULES) {
    expect(CLIENT_LEXICAL_NATIVE_RULES).toContain(rule);
    expect(config.rules[rule]).toEqual([2]);
  }
  for (const path of ["tooling/src/verify/lib/raw-spacing-tier.ts", "tooling/src/verify/lib/raw-typography-tier.ts"]) {
    expect(CLIENT_LEXICAL_NATIVE_INPUT_PATHS).toContain(path);
    expect(affectsClientLexicalNativeLint(path)).toBe(true);
  }
  expect(config.settings["orb/client-lexical-inputs"]).toBe(
    createHash("sha256")
      .update(JSON.stringify(CLIENT_LEXICAL_NATIVE_INPUT_PATHS.map((path) => [path, readFileSync(join(ROOT, path), "utf8")])))
      .digest("hex"),
  );
});

test("malformed frontend source refuses with a native parse error, never a clean rule verdict", async () => {
  const config = await ORDINARY_ESLINT.calculateConfigForFile(join(ROOT, SUBJECT));
  const messages = new Linter().verify('const x=<div className="p-4 text-sm hover:hidden";', {
    languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
    plugins: config.plugins,
    rules: Object.fromEntries(RULES.map((rule) => [rule, config.rules[rule]])),
  });
  expect(messages).toMatchObject([{ fatal: true, severity: 2 }]);
});
