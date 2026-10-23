import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";

const ROOT = join(import.meta.dirname, "../..");
const RULE = "orb/no-portal-float-token";
const FEATURE = "packages/client/src/features/chat/components/probe.tsx";
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

// The first config calculation loads the whole repo config; it must not bill to a test's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, FEATURE));
}, 120_000);

async function findings(source: string, path: string): Promise<readonly Linter.LintMessage[]> {
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
  return found.filter(({ ruleId }) => ruleId === RULE);
}

test.for([
  ["a positioner that portals", "packages/ui/src/primitives/popover/variants.ts", 'export const positioner = "z-(--z-popover)";'],
  ["a viewport that portals", "packages/ui/src/primitives/dialog/variants.ts", 'export const viewport = "fixed inset-0 z-(--z-modal)";'],
  ["the shared popup surface", "packages/ui/src/lib/popup-surface.ts", "export const surface = `relative z-(--z-popover) p-field`;"],
  ["the document-root boot veil", "packages/ui/src/art/web-weave/variants.ts", 'export const veil = "fixed inset-0 z-(--z-modal)";'],
] as const)("portal-float token is legal in %s", async ([, path, source]) => {
  expect(await findings(source, path)).toEqual([]);
});

test.for([
  ["a string literal", 'export const cls = "fixed z-(--z-modal) inset-0";'],
  ["a template literal", "export const cls = `relative z-(--z-tooltip) p-field`;"],
  ["a variant-prefixed class", 'export const cls = "md:z-(--z-toast)";'],
] as const)("portal-float token in a feature file is a finding: %s", async ([, source]) => {
  expect(await findings(source, FEATURE)).toHaveLength(1);
});

test("a non-allowlisted ui file is a finding too", async () => {
  expect(await findings('export const cls = "z-(--z-popover)";', "packages/ui/src/primitives/card/variants.ts")).toHaveLength(1);
});

test.for([
  ["in-context raised", 'export const cls = "relative z-(--z-raised)";'],
  ["in-context base", 'export const cls = "z-(--z-base)";'],
  ["app-frame overlay", 'export const cls = "absolute z-(--z-overlay)";'],
] as const)("%s token passes in a feature file", async ([, source]) => {
  expect(await findings(source, FEATURE)).toEqual([]);
});
