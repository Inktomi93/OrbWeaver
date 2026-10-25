// `orb/custom-property-declared`: a custom property a client or ui string reads, or a CT writes, is one a sheet, the generated
// channel, a runtime writer or a vendor declares. Run through the real config, so the declared set is the one Stylelint reads.
import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";
import {
  baseUiCustomProperties,
  declaredCustomProperties,
  RUNTIME_CUSTOM_PROPERTIES,
  VENDOR_CUSTOM_PROPERTIES,
} from "../../tooling/src/css-names/custom-properties.ts";

const ROOT = join(import.meta.dirname, "../..");
const RULE = "orb/custom-property-declared";
const SOURCE = "packages/client/src/features/a/reader.ts";
const CT = "tests/client/features/a/probe.ct.tsx";
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, SOURCE));
}, 120_000);

async function findings(source: string, file = SOURCE): Promise<readonly string[]> {
  const config = await eslint.calculateConfigForFile(join(ROOT, file));
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config?.plugins ?? {},
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: null } },
      rules: { [RULE]: config?.rules?.[RULE] ?? "off" },
    },
    { filename: join(ROOT, file) },
  );
  expect(found.filter(({ fatal }) => fatal === true)).toEqual([]);
  return found.filter(({ ruleId }) => ruleId === RULE).map(({ message }) => message);
}

test.for([
  ["a sheet's property in an arbitrary value", 'export const A = "w-[calc(100%-var(--spacing-section,0px))]";'],
  ["a sheet's property in the parenthesis form", 'export const A = "max-inline-(--container-cq-48)";'],
  ["the generated channel's property", 'export const A = "text-[length:calc(1rem*var(--appearance-font-scale,1))]";'],
  ["a Base UI property", 'export const A = "w-(--anchor-width) max-block-(--available-height)";'],
  ["a streamdown property", 'export const A = "dark:text-[var(--shiki-dark,inherit)]";'],
  ["prose that spells a flag in parentheses", 'export const A = "use (--force) to overwrite";'],
  ["a class-string write that a sheet reads", 'export const A = "in-data-[has-bg-image]:[--orb-skeleton-sweep-base:red]";'],
  ["a read of a class-string write", 'export const A = "p-[var(--orb-skeleton-sweep-crest,0px)]";'],
  ["a spaced read of a declared property", 'export const A = "w-[var( --spacing-section , 1px)]";'],
  ["a type-hinted read of a declared property", 'export const A = "text-(length:--appearance-font-scale)";'],
  ["a runtime-written property", 'export const A = "pb-[var(--orb-keyboard-inset,0px)]";'],
  // biome-ignore lint/suspicious/noTemplateCurlyInString: the case is template source the rule reads.
  ["a dynamic name the rule cannot read", "export const A = (k: string): string => `duration-(--motion-${k})`;"],
] as const)("%s passes", async ([, source]) => {
  expect(await findings(source)).toEqual([]);
});

test.for([
  ["a fallback of an undeclared property in a class string", 'export const A = "w-[calc(100%*var(--probe-gone,1))]";', "--probe-gone"],
  ["the parenthesis form of an undeclared property", 'export const A = "max-inline-(--container-cq-lg)";', "--container-cq-lg"],
  // biome-ignore lint/suspicious/noTemplateCurlyInString: the case is template source the rule reads.
  ["an undeclared property in a template chunk", "export const A = (k: string): string => `p-(--probe-gone) ${k}`;", "--probe-gone"],
  ["a spaced fallback", 'export const A = "w-[var( --probe-gone , 1)]";', "--probe-gone"],
  ["a space before the comma", 'export const A = "w-[var(--probe-gone , 1)]";', "--probe-gone"],
  ["a type-hinted read", 'export const A = "text-(length:--probe-gone)";', "--probe-gone"],
  ["an uppercase name", 'export const A = "w-[var(--Probe-Gone,1)]";', "--Probe-Gone"],
  ["an underscore name", 'export const A = "w-[var(--probe_gone,1)]";', "--probe_gone"],
  ["a class-string write nothing reads", 'export const A = "[--probe-dead:2]";', "--probe-dead"],
] as const)("%s is refused", async ([, source, name]) => {
  expect(await findings(source)).toEqual([expect.stringContaining(`"${name}"`)]);
});

test.for([
  ["a setProperty of a deleted property", 'document.documentElement.style.setProperty("--font-scale", "2");', "--font-scale"],
  ["a template-literal setProperty", "document.documentElement.style.setProperty(`--font-scale`, '2');", "--font-scale"],
  ["a getPropertyValue of a deleted property", 'export const A = getComputedStyle(document.body).getPropertyValue("--probe-gone");', "--probe-gone"],
  ["a stylesheet injected with a deleted property", 'export const A = ":root { --font-scale: 2 !important; }";', "--font-scale"],
] as const)("%s is refused in a CT", async ([, source, name]) => {
  expect(await findings(source, CT)).toEqual([expect.stringContaining(`"${name}"`)]);
});

test("a CT may set a declared property", async () => {
  expect(await findings('document.documentElement.style.setProperty("--appearance-font-scale", "2");', CT)).toEqual([]);
});

test("every vendor name is one the installed package spells", () => {
  const dist = (packageName: string): string =>
    globSync("**/*.js", { cwd: join(ROOT, "packages/ui/node_modules", packageName, "dist") })
      .map((file) => readFileSync(join(ROOT, "packages/ui/node_modules", packageName, "dist", file), "utf8"))
      .join("\n");
  for (const [name, packageName] of Object.entries(VENDOR_CUSTOM_PROPERTIES)) {
    expect(dist(packageName), name).toMatch(new RegExp(`${name}(?![\\w-])`, "u"));
  }
});

test("Base UI's names are read from its installed modules", () => {
  const names = baseUiCustomProperties(ROOT);
  expect(names).toContain("--anchor-width");
  expect(declaredCustomProperties(ROOT)).toContain("--available-height");
});

test("every runtime-written name carries the app's prefix", () => {
  expect(Object.keys(RUNTIME_CUSTOM_PROPERTIES).filter((name) => !name.startsWith("--orb-"))).toEqual([]);
});
