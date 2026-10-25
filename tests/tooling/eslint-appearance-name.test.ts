// `orb/appearance-name-in-manifest`: an appearance channel name a client or ui string spells is one the manifest's
// channel writes. Run through the real config, so the vocabulary is the one the generator derives.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";

const ROOT = join(import.meta.dirname, "../..");
const RULE = "orb/appearance-name-in-manifest";
const CLIENT = "packages/client/src/features/a/reader.ts";
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, CLIENT));
}, 120_000);

async function findings(source: string): Promise<readonly string[]> {
  const config = await eslint.calculateConfigForFile(join(ROOT, CLIENT));
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.ts"],
      plugins: config?.plugins ?? {},
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: null } },
      rules: { [RULE]: config?.rules?.[RULE] ?? "off" },
    },
    { filename: join(ROOT, CLIENT) },
  );
  expect(found.filter(({ fatal }) => fatal === true)).toEqual([]);
  return found.filter(({ ruleId }) => ruleId === RULE).map(({ message }) => message);
}

test.for([
  ["a registered property", 'export const A = "var(--appearance-font-scale)";'],
  ["a root attribute", 'export const A = "[data-appearance-shadow-effects]";'],
  ["a class variant", 'export const A = "appearance-shadow-effects-true:opacity-50";'],
  ["a resolved preference variant", 'export const A = "appearance-reduced-motion:animate-none";'],
  ["a media condition key", 'export const A = { "motion-reduce": 1 };'],
  // biome-ignore lint/suspicious/noTemplateCurlyInString: the case is template source the rule reads.
  ["a name inside a template", "export const A = (k: string): string => `[data-appearance-surface-texture=${k}]`;"],
] as const)("%s the channel writes passes", async ([, source]) => {
  expect(await findings(source)).toEqual([]);
});

test.for([
  ["a misspelled property", 'export const A = "--appearance-font-scal";', "--appearance-font-scal"],
  ["the retired attribute spelling in the new prefix", 'export const A = "[data-appearance-shadow]";', "data-appearance-shadow"],
  ["a variant for a value the schema lacks", 'export const A = "appearance-shadow-effects-on:opacity-50";', "appearance-shadow-effects-on"],
  ["an OS-only motion variant", 'export const A = "motion-reduce:animate-none";', "motion-reduce:"],
  ["the OS-only motion-safe variant", 'export const A = "motion-safe:animate-pulse";', "motion-safe:"],
  ["an OS-only contrast variant", 'export const A = "contrast-more:border-2";', "contrast-more:"],
  // biome-ignore lint/suspicious/noTemplateCurlyInString: the case is template source the rule reads.
  ["a name in a template chunk", "export const A = (k: string): string => `[data-appearance-texture=${k}]`;", "data-appearance-texture"],
] as const)("%s is refused", async ([, source, name]) => {
  expect(await findings(source)).toEqual([expect.stringContaining(`"${name}"`)]);
});
