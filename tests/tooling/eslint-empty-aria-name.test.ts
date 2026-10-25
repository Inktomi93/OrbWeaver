// An empty or whitespace-only aria-label / aria-labelledby names nothing, so the client and @orb/ui refuse one on any element.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";

const ROOT = join(import.meta.dirname, "../..");
const RULE = "no-restricted-syntax";
const CLIENT_PROBE = "packages/client/src/features/auth/components/probe.tsx";
const UI_PROBE = "packages/ui/src/primitives/probe/probe.tsx";
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

// The first config calculation loads the whole repo config; it must not bill to a test's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, CLIENT_PROBE));
}, 120_000);

async function findings(source: string, path: string): Promise<readonly Linter.LintMessage[]> {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.tsx"],
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
      rules: { [RULE]: config?.rules?.[RULE] ?? "off" },
    },
    { filename: join(ROOT, path) },
  );
  expect(
    found.filter(({ fatal }) => fatal === true),
    source,
  ).toEqual([]);
  return found.filter(({ ruleId }) => ruleId === RULE);
}

const PLANTED = [
  ["an empty aria-label", 'export const A = () => <button aria-label="" />;'],
  ["a whitespace aria-label", 'export const A = () => <Button aria-label="  " />;'],
  ["an undefined aria-label", "export const A = () => <Button aria-label={undefined} />;"],
  ["an empty expression aria-label", 'export const A = () => <Button aria-label={""} />;'],
  ["an empty template aria-label", "export const A = () => <Button aria-label={``} />;"],
  ["a whitespace template aria-label", "export const A = () => <Button aria-label={`  `} />;"],
  ["a void 0 aria-label", "export const A = () => <Button aria-label={void 0} />;"],
  ["an empty aria-labelledby", 'export const A = () => <section aria-labelledby="" />;'],
  ["an empty form aria-label", 'export const A = () => <form aria-label="" />;'],
] as const;

test.for(PLANTED.flatMap(([name, source]) => [[`${name} in the client`, source, CLIENT_PROBE] as const, [`${name} in @orb/ui`, source, UI_PROBE] as const]))(
  "%s is a finding",
  async ([, source, path]) => {
    expect(await findings(source, path)).toHaveLength(1);
  },
);

test.for([
  ["a literal name", 'export const A = () => <Button aria-label="Save" />;'],
  ["a computed name", "export const A = ({ name }) => <Button aria-label={name} />;"],
  ["a member name", "export const A = ({ labels, dot }) => <Button aria-label={labels[dot]} />;"],
  ["a call name", "export const A = ({ item }) => <Button aria-label={nameOf(item)} />;"],
  // biome-ignore lint/suspicious/noTemplateCurlyInString: the planted source is itself a template literal.
  ["a template with an expression", "export const A = ({ name }) => <Button aria-label={`Open ${name}`} />;"],
  ["an id reference", 'export const A = () => <section aria-labelledby="heading" />;'],
  ["an empty value on another attribute", 'export const A = () => <Button title="" />;'],
] as const)("%s passes", async ([, source]) => {
  expect(await findings(source, CLIENT_PROBE)).toEqual([]);
});
