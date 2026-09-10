// Discovery asks ESLint itself which filenames `.` means, while disabling only typed program creation
// and rule execution. The child emits filenames, never a lint verdict; actual shards use the untouched config.
import { relative, sep } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { ESLint } from "eslint";
import { EXIT } from "../../_shared/exit-contract.ts";

refuseDirectInvocation(import.meta.url, "pnpm lint:eslint");

const CONFIG_REL = "eslint.config.js";

type FlatRow = Record<string, unknown> & {
  readonly languageOptions?: Record<string, unknown> & { readonly parserOptions?: Record<string, unknown> };
};

function discoveryRow(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(discoveryRow);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  const row = value as FlatRow;
  if (row.languageOptions === undefined) {
    return row;
  }
  return {
    ...row,
    languageOptions: {
      ...row.languageOptions,
      parserOptions: { ...row.languageOptions.parserOptions, project: false, projectService: false, programs: null },
    },
  };
}

export async function discoverEslintFiles(root: string): Promise<readonly string[]> {
  const loaded = (await import(pathToFileURL(`${root}/${CONFIG_REL}`).href)) as { readonly default?: unknown };
  if (!Array.isArray(loaded.default)) {
    throw new Error(`${CONFIG_REL} did not resolve to a flat config array`);
  }
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: discoveryRow(loaded.default) as FlatRow[],
    ruleFilter: (): boolean => false,
  });
  const results = await eslint.lintFiles(["."]);
  return results.map(({ filePath }) => relative(root, filePath).split(sep).join("/")).toSorted();
}

export async function runEslintDiscovery(root: string): Promise<number> {
  process.stdout.write(`${JSON.stringify(await discoverEslintFiles(root))}\n`);
  return EXIT.clean;
}
