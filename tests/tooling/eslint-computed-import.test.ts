import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";

const ROOT = join(import.meta.dirname, "../..");
const RULE = "no-restricted-syntax";
const MODEL_CACHE = "packages/inference/src/backends/local-light/model-cache.ts";
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

// The first config calculation loads the whole repo config; it must not bill to a test's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, MODEL_CACHE));
}, 120_000);

async function findings(source: string, path: string): Promise<readonly Linter.LintMessage[]> {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: null } },
      linterOptions: { reportUnusedDisableDirectives: "error" },
      rules: { [RULE]: config?.rules?.[RULE] ?? "off" },
    },
    { filename: join(ROOT, path) },
  );
  expect(
    found.filter(({ fatal }) => fatal === true),
    source,
  ).toEqual([]);
  return found.filter(({ ruleId }) => ruleId === RULE || ruleId === null);
}

const loader = (specifier: string): string => `async function load(): Promise<unknown> {\n  return await import(${specifier});\n}\n`;
// The specifier dependency-cruiser cannot resolve: the boot grant door, spelled at runtime.
const COMPUTED_BOOT_DOOR = loader('["@orb", "db", "wiring-boot"].join("/")');

test.for([
  ["a server domain", "packages/server/src/domain/character/probe.ts"],
  ["the db package", "packages/db/src/client/probe.ts"],
  ["the inference package", "packages/inference/src/backends/probe.ts"],
  ["a server seed root", "packages/server/src/domain/preset/seed.ts"],
] as const)("a computed import specifier fails lint in %s", async ([, path]) => {
  expect(
    await Promise.all(
      [COMPUTED_BOOT_DOOR, loader('"@orb/db/" + "wiring-driver"'), loader("`@orb/db/wiring-boot`")].map(
        async (source) => (await findings(source, path)).length,
      ),
    ),
  ).toEqual([1, 1, 1]);
  expect(await findings(loader('"@orb/db/wiring-boot"'), path)).toEqual([]);
});

// The host loaders an import rule never sees: the builtin-module getter (which hands back `node:module`) and a
// vm script's dynamic-import hook.
const HOST_LOADERS = [
  'export const host = process.getBuiltinModule("node:module");\n',
  'export const host = process["getBuiltinModule"]("node:module");\n',
  "const { getBuiltinModule } = process;\nexport const host = getBuiltinModule;\n",
  'import vm from "node:vm";\nexport const script = new vm.Script("1", { importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER });\n',
] as const;

test.for([
  ["a server domain", "packages/server/src/domain/character/probe.ts"],
  ["the db package", "packages/db/src/client/probe.ts"],
  ["the inference package", "packages/inference/src/backends/probe.ts"],
] as const)("a host module loader fails lint in %s", async ([, path]) => {
  expect(await Promise.all(HOST_LOADERS.map(async (source) => (await findings(source, path)).length > 0))).toEqual(HOST_LOADERS.map(() => true));
});

test("the model-cache kernel import is the one waived computed specifier, waived by line", async () => {
  expect(await findings(await readFile(join(ROOT, MODEL_CACHE), "utf8"), MODEL_CACHE)).toEqual([]);
  expect((await findings(COMPUTED_BOOT_DOOR, MODEL_CACHE)).length).toBe(1);
});
