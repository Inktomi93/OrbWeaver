// Native discovery preserves CLI filename semantics without source parsing, authored processors or rules.
// Original effective configuration is still validated; actual lint shards use that untouched configuration.
// The child emits filenames, never a lint verdict; explicit ignored paths behave as `--no-warn-ignored`.
import { relative, resolve, sep } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { refuseDirectInvocation } from "@orb/tooling/floor/cli/entrypoint";
import { ESLint } from "eslint";
import { EXIT } from "../../floor/cli/exit-contract.ts";

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

export async function discoverEslintFiles(root: string, patterns: readonly string[] = ["."]): Promise<readonly string[]> {
  const loaded = (await import(pathToFileURL(`${root}/${CONFIG_REL}`).href)) as { readonly default?: unknown };
  if (!Array.isArray(loaded.default)) {
    throw new Error(`${CONFIG_REL} did not resolve to a flat config array`);
  }
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: [
      ...(discoveryRow(loaded.default) as FlatRow[]),
      // Empty blocks preserve native outer filenames without parsing or invoking authored processors.
      { processor: { preprocess: (): [] => [], postprocess: (): [] => [] } },
    ],
    ruleFilter: (): boolean => false,
    warnIgnored: false,
  });
  const results = await eslint.lintFiles([...patterns]);
  const original = new ESLint({ cwd: root, overrideConfigFile: resolve(root, CONFIG_REL) });
  for (const { filePath } of results) {
    if ((await original.calculateConfigForFile(filePath)) === undefined) {
      throw new Error("ESLint discovery and original native configuration resolved different filename populations");
    }
  }
  return results.map(({ filePath }) => relative(root, filePath).split(sep).join("/")).toSorted();
}

/** The producer serializes its native discovery result as one envelope (#2212). `count` is derived from the
 *  same `files` array and therefore checks wire consistency only; it is not an independent enumeration or a
 *  truncation oracle. Discovery ownership stays here, through ESLint's native `lintFiles(["."])` semantics. */
interface EslintDiscoveryWire {
  readonly count: number;
  readonly files: readonly string[];
}

export async function runEslintDiscovery(root: string, patterns?: readonly string[]): Promise<number> {
  const files = await discoverEslintFiles(root, patterns);
  const wire: EslintDiscoveryWire = { count: files.length, files };
  process.stdout.write(`${JSON.stringify(wire)}\n`);
  return EXIT.clean;
}
