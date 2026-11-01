// D336: TypeScript strings spell no colour recipe over an intent or tone colour; the generated token map is exempt.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";
import { resolvedConfig } from "./_eslint-config.ts";

const ROOT = join(import.meta.dirname, "../..");
const RULE = "orb/no-intent-color-recipe";
const UI_PROBE = "packages/ui/src/primitives/probe/probe.tsx";
const CLIENT_PROBE = "packages/client/src/features/auth/components/probe.tsx";
const TEST_PROBE = "tests/ui/primitives/probe/probe.ct.tsx";
const TOOLING_PROBE = "tooling/src/ui-audit/lib/probe.tsx";
const GENERATED = "packages/ui/src/tokens/index.ts";
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

// The first config calculation loads the whole repo config; it must not bill to a test's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, UI_PROBE));
}, 120_000);

async function findings(source: string, path: string): Promise<number> {
  const config = await resolvedConfig(eslint, join(ROOT, path));
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config.plugins,
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: null, ecmaFeatures: { jsx: true } } },
      rules: { [RULE]: config.rules[RULE] ?? "off" },
    },
    { filename: join(ROOT, path) },
  );
  expect(found.filter(({ fatal }) => fatal === true)).toEqual([]);
  return found.filter(({ ruleId }) => ruleId === RULE).length;
}

const PLANTED = [
  ["a mix in a style object", 'export const S = { background: "color-mix(in oklab, var(--color-primary) 14%, var(--color-background))" };'],
  ["a relative colour in a style prop", 'export const C = () => <div style={{ color: "oklch(from var(--color-destructive) l c h / 0.5)" }} />;'],
  ["a tone role mixed by hand", 'export const S = "color-mix(in oklab, var(--color-tone-solid) 50%, transparent)";'],
  ["an intent foreground mixed by hand", 'export const S = "color-mix(in oklab, var(--color-success-foreground) 80%, transparent)";'],
  ["an arbitrary class value", 'export const C = () => <div className="bg-[color-mix(in_oklab,var(--color-warning)_20%,transparent)]" />;'],
  ["an arbitrary relative class value", 'export const C = () => <div className="bg-[oklch(from_var(--color-info)_l_c_h_/_0.4)]" />;'],
  // biome-ignore lint/suspicious/noTemplateCurlyInString: the planted source is itself a template literal.
  ["a template around a hole", "export const mix = (amount) => `color-mix(in oklab, var(--color-primary) ${amount}, transparent)`;"],
] as const;

test.for(PLANTED.flatMap(([name, source]) => [UI_PROBE, CLIENT_PROBE, TEST_PROBE, TOOLING_PROBE].map((path) => [`${name} in ${path}`, source, path] as const)))(
  "%s is a finding",
  async ([, source, path]) => {
    expect(await findings(source, path)).toBe(1);
  },
);

test.for([
  ["a mix over the neutral ramp", 'export const S = "color-mix(in oklab, var(--color-foreground) 12%, transparent)";'],
  ["a relative colour from a surface", 'export const S = "oklch(from var(--color-card) l c h / 0.8)";'],
  ["a served intent read straight", 'export const S = { color: "var(--color-primary)" };'],
  // biome-ignore lint/suspicious/noTemplateCurlyInString: the planted source is itself a template literal.
  ["a recipe whose colour is a runtime value", "export const mix = (token) => `color-mix(in oklab, var(${token}) 40%, transparent)`;"],
  ["a word that only looks like a function", 'export const S = "--color-mix(primary)";'],
] as const)("%s is accepted", async ([, source]) => {
  expect(await findings(source, UI_PROBE)).toBe(0);
});

test("the generated token map is exempt", async () => {
  expect(await findings('export const S = "color-mix(in oklab, var(--color-primary) 14%, transparent)";', GENERATED)).toBe(0);
});
