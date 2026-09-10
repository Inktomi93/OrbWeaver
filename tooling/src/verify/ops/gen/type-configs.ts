// Deterministic complete TypeScript leaf configs, derived from authored world/test/ambient intent.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type { TypeConfigIntentInput } from "@orb/tooling/_shared/type-config-intent";
import {
  ambientRootsForProgram,
  BROWSER_LIB_ADDITIONS,
  browserSurfaceRootPatterns,
  browserTestRootPatterns,
  nodeTestExclusionPatterns,
  packageConfigPath,
  TEST_HELPER_ROOTS,
  TYPE_CONFIG_EXCLUDES,
  TYPE_CONFIG_INTENT_INPUT,
  TYPE_WORLD_TEMPLATE_PATHS,
  worldTemplateFor,
} from "@orb/tooling/_shared/type-config-intent";
import { ts } from "ts-morph";

type JsonObject = Readonly<Record<string, unknown>>;
const JSON_LINE_WIDTH = 160;

interface CompactArray {
  readonly line: string;
  readonly closingIndex: number;
}

function compactArrayAt(lines: readonly string[], index: number): CompactArray | undefined {
  const opening = lines[index];
  if (opening === undefined || !opening.endsWith("[")) {
    return;
  }
  const members: string[] = [];
  let closingIndex = index + 1;
  while (closingIndex < lines.length && !/^\s*\],?$/u.test(lines[closingIndex] ?? "")) {
    members.push((lines[closingIndex] ?? "").trim().replace(/,$/u, ""));
    closingIndex += 1;
  }
  const closing = lines[closingIndex];
  if (closing === undefined || members.length === 0) {
    return;
  }
  const line = `${opening}${members.join(", ")}]${closing.trimEnd().endsWith(",") ? "," : ""}`;
  return line.length <= JSON_LINE_WIDTH ? { line, closingIndex } : undefined;
}

function stableJson(value: JsonObject): string {
  const lines = JSON.stringify(value, null, 2).split("\n");
  const rendered: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const compact = compactArrayAt(lines, index);
    if (compact !== undefined) {
      rendered.push(compact.line);
      index = compact.closingIndex;
      continue;
    }
    rendered.push(lines[index] ?? "");
  }
  return `${rendered.join("\n")}\n`;
}

function baseLibraries(root: string): readonly string[] {
  const path = join(root, "tsconfig.base.json");
  const parsed = ts.parseConfigFileTextToJson(path, readFileSync(path, "utf8"));
  if (parsed.error !== undefined) {
    throw new Error(`cannot read authored base compiler intent: ${ts.flattenDiagnosticMessageText(parsed.error.messageText, "\n")}`);
  }
  const compilerOptions = parsed.config?.compilerOptions;
  const lib: unknown = typeof compilerOptions === "object" && compilerOptions !== null ? Reflect.get(compilerOptions, "lib") : undefined;
  if (!(Array.isArray(lib) && lib.every((entry) => typeof entry === "string")) || lib.length === 0) {
    throw new Error("tsconfig.base.json compilerOptions.lib must be a nonempty string array");
  }
  return lib;
}

function relativeAmbientRoots(configPath: string, ambients: readonly string[]): readonly string[] {
  const configDir = join("/", dirname(configPath));
  return ambients.map((ambient) => relative(configDir, join("/", ambient)) || ".");
}

function packageConfig(packageName: string, world: Parameters<typeof worldTemplateFor>[0]): JsonObject {
  const configPath = packageConfigPath(packageName);
  const include = ["src", ...relativeAmbientRoots(configPath, ambientRootsForProgram(configPath) ?? [])];
  // Drizzle Kit executes this package-root config under Node; every other package leaf owns source only.
  if (packageName === "db") {
    include.splice(1, 0, "drizzle.config.ts");
  }
  return {
    extends: `../../${worldTemplateFor(world)}`,
    include,
    exclude: TYPE_CONFIG_EXCLUDES,
  };
}

function toolingConfig(): JsonObject {
  const configPath = "tooling/tsconfig.json";
  return {
    extends: `../${TYPE_WORLD_TEMPLATE_PATHS.node}`,
    include: ["src", ...relativeAmbientRoots(configPath, ambientRootsForProgram(configPath) ?? [])],
    exclude: TYPE_CONFIG_EXCLUDES,
  };
}

function graphConfig(intent: TypeConfigIntentInput): JsonObject {
  return {
    extends: `./${TYPE_WORLD_TEMPLATE_PATHS.node}`,
    compilerOptions: { jsx: "react-jsx" },
    include: [
      ...(ambientRootsForProgram("tsconfig.json") ?? []),
      "*.config.ts",
      "knip.ts",
      "packages/*/*",
      "scripts/**/*.ts",
      "scripts/**/*.mts",
      "scripts/**/*.cts",
      "tests/**/*.ts",
      "tests/**/*.mts",
      "tests/**/*.cts",
      `${TEST_HELPER_ROOTS.node}/**/*`,
    ],
    exclude: [
      ...TYPE_CONFIG_EXCLUDES,
      ...nodeTestExclusionPatterns(intent.testKinds),
      "tests/e2e",
      "tests/support/browser",
      `${TEST_HELPER_ROOTS.iso}/**/*`,
      "playwright",
      "scripts/probes/st-goldens",
      "scripts/probes/st-goldens/sillytavern-runtime",
    ],
  };
}

function browserTestsConfig(intent: TypeConfigIntentInput): JsonObject {
  return {
    extends: `./${TYPE_WORLD_TEMPLATE_PATHS.browser}`,
    compilerOptions: { types: ["node"] },
    include: [
      ...(ambientRootsForProgram("tsconfig.tests-dom.json") ?? []),
      ...browserTestRootPatterns(intent.testKinds),
      "tests/**/*.tsx",
      "scripts/**/*.tsx",
      ...browserSurfaceRootPatterns(),
    ],
    exclude: [...TYPE_CONFIG_EXCLUDES, `${TEST_HELPER_ROOTS.iso}/**/*`, `${TEST_HELPER_ROOTS.node}/**/*`, "scripts/probes/st-goldens/sillytavern-runtime"],
  };
}

function isoTestsConfig(): JsonObject {
  return {
    extends: "./tsconfig.base.json",
    include: [...(ambientRootsForProgram("tsconfig.tests-iso.json") ?? []), `${TEST_HELPER_ROOTS.iso}/**/*`],
    exclude: TYPE_CONFIG_EXCLUDES,
  };
}

export function deriveTypeConfigFiles(root: string, intent: TypeConfigIntentInput = TYPE_CONFIG_INTENT_INPUT): Readonly<Record<string, string>> {
  const commonLib = baseLibraries(root);
  const configs = new Map<string, JsonObject>([
    [TYPE_WORLD_TEMPLATE_PATHS.node, { extends: "./tsconfig.base.json", compilerOptions: { types: ["node"] }, files: [] }],
    [
      TYPE_WORLD_TEMPLATE_PATHS.browser,
      {
        extends: "./tsconfig.base.json",
        compilerOptions: {
          module: "esnext",
          moduleResolution: "bundler",
          lib: [...commonLib, ...BROWSER_LIB_ADDITIONS],
          jsx: "react-jsx",
        },
        files: [],
      },
    ],
    ["tsconfig.json", graphConfig(intent)],
    ["tsconfig.tests-iso.json", isoTestsConfig()],
    ["tsconfig.tests-dom.json", browserTestsConfig(intent)],
    ["tooling/tsconfig.json", toolingConfig()],
  ]);
  for (const [packageName, world] of Object.entries(intent.packageWorlds)) {
    configs.set(packageConfigPath(packageName), packageConfig(packageName, world));
  }
  return Object.fromEntries([...configs].toSorted(([left], [right]) => left.localeCompare(right)).map(([path, config]) => [path, stableJson(config)]));
}

export function generateTypeConfigs(root: string): number {
  const files = deriveTypeConfigFiles(root);
  for (const [path, text] of Object.entries(files)) {
    writeFileSync(join(root, path), text);
  }
  return 0;
}
