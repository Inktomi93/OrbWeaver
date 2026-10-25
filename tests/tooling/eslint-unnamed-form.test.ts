// The client refuses a `<form>` with no accessible name. Forms the accessibility registries cannot mount (auth and
// dialog forms) get this static guard instead.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";

const ROOT = join(import.meta.dirname, "../..");
const RULE = "no-restricted-syntax";
const PROBE = "packages/client/src/features/auth/components/probe.tsx";
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

// The first config calculation loads the whole repo config; it must not bill to a test's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, PROBE));
}, 120_000);

async function findings(source: string): Promise<readonly Linter.LintMessage[]> {
  const config = await eslint.calculateConfigForFile(join(ROOT, PROBE));
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.tsx"],
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
      rules: { [RULE]: config?.rules?.[RULE] ?? "off" },
    },
    { filename: join(ROOT, PROBE) },
  );
  expect(
    found.filter(({ fatal }) => fatal === true),
    source,
  ).toEqual([]);
  return found.filter(({ ruleId }) => ruleId === RULE);
}

test.for([
  ["a bare form", 'export const A = () => <form onSubmit={submit}><input aria-label="Handle" /></form>;'],
  ["a form with only an id", 'export const A = () => <form id="login" />;'],
  ["an empty aria-label", 'export const A = () => <form aria-label="" />;'],
  ["a whitespace aria-label", 'export const A = () => <form aria-label=" " />;'],
  ["an undefined aria-label", "export const A = () => <form aria-label={undefined} />;"],
  ["an empty aria-labelledby", 'export const A = () => <form aria-labelledby="" />;'],
] as const)("%s is a finding", async ([, source]) => {
  expect(await findings(source)).toHaveLength(1);
});

test.for([
  ["an aria-label", 'export const A = () => <form aria-label="Sign in" />;'],
  ["an aria-labelledby", 'export const A = () => <form aria-labelledby="title" />;'],
  ["a computed aria-label", "export const A = ({ name }) => <form aria-label={name} />;"],
  ["a TanStack form member element", "export const A = () => <form.Subscribe selector={pick}>{render}</form.Subscribe>;"],
] as const)("a form with %s passes", async ([, source]) => {
  expect(await findings(source)).toEqual([]);
});

test("the unnamed-form selector keeps the invisible-control selector in the same block", async () => {
  const literal = `export const a = "${String.fromCodePoint(0x20_2e)}";`;
  expect(await findings(literal)).toHaveLength(1);
});
