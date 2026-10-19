import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";

const ROOT = join(import.meta.dirname, "../../../..");
const REGION = "orb/context-region-single-claimant";
const BRACKET = "orb/context-bracket-single-writer";
const REGION_HOME = "packages/client/src/features/rpg/lib/rpg-hud-region.tsx";
const BRACKET_HOME = "packages/client/src/features/app-shell/components/context-bracket.tsx";
const OTHER = "packages/client/src/features/crew/lib/crew-hud-region.tsx";
const MINT =
  'declare function defineContextRegion<S>(def: unknown): unknown;\nexport const a = defineContextRegion({ id: "a", claims: () => true, band: () => null });\n';
const eslint = new ESLint({ cwd: ROOT, overrideConfigFile: join(ROOT, "eslint-hard.config.js") });

// The first config calculation loads the whole repo config; it must not bill to a test's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, REGION_HOME));
}, 120_000);

async function findings(rule: string, source: string, path: string): Promise<readonly string[]> {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config?.plugins ?? {},
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: null, ecmaFeatures: { jsx: true } } },
      linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: "off" },
      rules: { [rule]: config?.rules?.[rule] ?? "off" },
    },
    { filename: join(ROOT, path) },
  );
  expect(
    found.filter(({ fatal }) => fatal === true),
    source,
  ).toEqual([]);
  return found.filter(({ ruleId }) => ruleId === rule).map(({ message }) => message);
}

test("the claimant home allows one defineContextRegion call and reports a second", async () => {
  expect(await findings(REGION, MINT, REGION_HOME)).toEqual([]);
  expect(await findings(REGION, `${MINT}export const b = defineContextRegion({ id: "b", claims: () => true, band: () => null });\n`, REGION_HOME)).toHaveLength(
    1,
  );
});

test("a claimant outside the home is a second claimant, bare or through a namespace", async () => {
  expect(await findings(REGION, MINT, OTHER)).toHaveLength(1);
  expect(await findings(REGION, 'import * as lib from "#lib";\nexport const a = lib.defineContextRegion({});\n', OTHER)).toHaveLength(1);
});

test("a home that stops claiming reports itself stale", async () => {
  const found = await findings(REGION, "export const a = 1;\n", REGION_HOME);
  expect(found).toHaveLength(1);
  expect(found[0]).toContain("no longer calls it");
});

test("the mint home and server code are outside the claimant count", async () => {
  expect(await findings(REGION, MINT, "packages/client/src/lib/registry-contracts.ts")).toEqual([]);
  expect(await findings(REGION, MINT, "packages/server/src/domain/x/verbs/x.ts")).toEqual([]);
});

test("the bracket writer home allows one probe attribute and every other writer is reported", async () => {
  const one = "export const a = <div data-context-bracket={true} />;\n";
  expect(await findings(BRACKET, one, BRACKET_HOME)).toEqual([]);
  expect(await findings(BRACKET, `${one}export const b = <div data-context-bracket={true} />;\n`, BRACKET_HOME)).toHaveLength(1);
  expect(await findings(BRACKET, one, "packages/client/src/features/rpg/components/rpg-hud-band.tsx")).toHaveLength(1);
  expect(await findings(BRACKET, "export const a = 1;\n", BRACKET_HOME)).toHaveLength(1);
});

test("a longer attribute name and a class string are not the probe attribute", async () => {
  const source =
    'export const a = <div data-context-bracketed={true} />;\nexport const b = <div data-context-bracketing={true} />;\nexport const c = <div className="data-context-bracket" />;\n';
  expect(await findings(BRACKET, source, "packages/client/src/features/rpg/components/rpg-hud-band.tsx")).toEqual([]);
});

test("the HARD profile cannot be disabled by a subject comment", async () => {
  const [result] = await eslint.lintText(`/* eslint-disable ${REGION} -- Attempted bypass. */\n${MINT}`, { filePath: join(ROOT, OTHER) });
  expect(result?.fatalErrorCount).toBe(0);
  expect(result?.messages.filter(({ ruleId }) => ruleId === REGION)).toHaveLength(1);
});
