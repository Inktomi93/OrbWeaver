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

/** THE CHILD STATES ITS OWN COUNT BESIDE THE LIST (#2212). A bare array cannot distinguish a COMPLETE
 *  enumeration from a SHORT one: the failure #2211 fixed was a KILLED child (`ENOBUFS` — `execFileSync` does
 *  not truncate, it terminates), and the failure that fix must not introduce is a silently truncated list.
 *  The count is the producer's claim about how many files it enumerated; the consumer checks the delivered
 *  list against it, so any path that loses rows in transit has to disagree with a number rather than simply
 *  arrive shorter. "It did not throw" cannot tell a complete list from a clipped one, which is why the
 *  ceiling alone was never the whole fix. */
export interface EslintDiscoveryWire {
  readonly count: number;
  readonly files: readonly string[];
}

export async function runEslintDiscovery(root: string): Promise<number> {
  const files = await discoverEslintFiles(root);
  const wire: EslintDiscoveryWire = { count: files.length, files };
  process.stdout.write(`${JSON.stringify(wire)}\n`);
  return EXIT.clean;
}
