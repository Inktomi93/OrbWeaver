// `orb/no-raw-intrinsic-paint`: a raw HTML element in the client carries no className, style or spread; the app shell's
// static shell.css class strings are the one exception.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";

const ROOT = join(import.meta.dirname, "../..");
const RULE = "orb/no-raw-intrinsic-paint";
const FEATURE = "packages/client/src/features/a/control.tsx";
const SHELL = "packages/client/src/features/app-shell/components/frame.tsx";
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, FEATURE));
}, 120_000);

async function findings(source: string, path: string): Promise<readonly string[]> {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config?.plugins ?? {},
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: null, ecmaFeatures: { jsx: true } } },
      rules: { [RULE]: config?.rules?.[RULE] ?? "off" },
    },
    { filename: join(ROOT, path) },
  );
  expect(
    found.filter(({ fatal }) => fatal === true),
    source,
  ).toEqual([]);
  return found.filter(({ ruleId }) => ruleId === RULE).map(({ message }) => message);
}

const element = (attributes: string): string => `export const T = (<div ${attributes} />);\n`;

test.for([
  ["a Tailwind class on a raw div in a feature", element('className="flex gap-row"'), FEATURE],
  ["a spread on a raw span", "export const T = (<span {...props} />);\n", FEATURE],
  ["a non-shell class in the app shell", element('className="contents"'), SHELL],
  ["a style in the app shell", element('className="shell-grid" style={{ opacity: 1 }}'), SHELL],
  ["a dynamic className in the app shell", element('className={cn("shell-grid", extra)}'), SHELL],
] as const)("the rule reports %s", async ([, source, path]) => {
  expect(await findings(source, path)).toHaveLength(1);
});

test.for([
  ["a shell class in the app shell", element('className="shell-grid"'), SHELL],
  ["a data attribute spread in the app shell", element('className="shell-grid" {...{ [ROOT_ATTRIBUTE]: "" }}'), SHELL],
  ["a conditional data attribute spread", element('className="shell-grid" {...(flag ? { "data-has-bg-image": true } : {})}'), SHELL],
  ["a primitive with a className", 'export const T = (<Stack className="flex" />);\n', FEATURE],
  ["a raw element with only semantics", element('aria-hidden="true" data-slot="probe"'), FEATURE],
] as const)("the rule passes %s", async ([, source, path]) => {
  expect(await findings(source, path)).toEqual([]);
});

test("the rule judges client source only", async () => {
  const configOf = async (path: string): Promise<unknown> => (await eslint.calculateConfigForFile(join(ROOT, path)))?.rules?.[RULE]?.[0];
  expect(await configOf(FEATURE)).toBe(2);
  expect(await configOf("packages/ui/src/primitives/a/control.tsx")).toBeUndefined();
});
