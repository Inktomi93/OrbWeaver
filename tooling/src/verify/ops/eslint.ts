// Whole-repository ESLint execution is partitioned by native compiler owner so TypeScript programs die
// between processes. Discovery asks ESLint itself which files `.` means; actual shards use the unchanged
// production config, parser, rules, processors, formatter, cache, and diagnostics.
import process from "node:process";
import { fileURLToPath } from "node:url";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { execNicedSync, runNicedSync } from "@orb/tooling/_shared/proc";
import { EXIT } from "../../_shared/exit-contract.ts";
import { isTypeWorldSource, predictedProgram } from "../../_shared/project-worlds.ts";
import type { CompilerProgram } from "../contract/policy-scope.ts";
import { eslintScheme } from "../lib/exit-classifiers.ts";
import { readCompilerProgramsFromInventory } from "../lib/policy-program-membership.ts";
import { readPolicyRepositoryInventory } from "../lib/policy-repo-inventory.ts";
import { eslintConfiguredPaths } from "./config-snapshot.ts";

refuseDirectInvocation(import.meta.url, "pnpm lint:eslint");

const CONFIG_REL = "eslint.config.js";
const DISCOVERY_ENTRY = fileURLToPath(new URL("./config-snapshot-entry.ts", import.meta.url));
const CHILD_FLAGS = ["--max-warnings", "0", "--cache", "--cache-strategy", "content", "--concurrency", "off"] as const;

function ownerFor(path: string, owners: readonly string[]): string {
  if (!isTypeWorldSource(path)) {
    return "<untyped>";
  }
  const predicted = predictedProgram(path);
  if (predicted !== undefined && owners.includes(predicted)) {
    return predicted;
  }
  if (owners.length === 1) {
    return owners[0] ?? "<unowned>";
  }
  throw new Error(`ESLint file ${path} has ${owners.length === 0 ? "no native compiler owner" : `ambiguous native compiler owners {${owners.join(", ")}}`}`);
}

function parsedDiscovery(text: string): readonly string[] {
  const value = JSON.parse(text) as unknown;
  if (!(Array.isArray(value) && value.every((path): path is string => typeof path === "string" && path !== ""))) {
    throw new Error("ESLint discovery child emitted a malformed filename list");
  }
  return value;
}

export function partitionEslintFiles(paths: readonly string[], programs: readonly CompilerProgram[]): ReadonlyMap<string, readonly string[]> {
  if (paths.length === 0) {
    throw new Error("ESLint discovery produced an empty population; no lint verdict is available");
  }
  if (new Set(paths).size !== paths.length) {
    throw new Error("ESLint discovery produced duplicate file identities");
  }
  const roots = new Map<string, string[]>();
  for (const program of programs) {
    for (const path of program.files) {
      const owners = roots.get(path) ?? [];
      owners.push(program.id);
      roots.set(path, owners);
    }
  }
  const groups = new Map<string, string[]>();
  for (const path of paths) {
    const owner = ownerFor(path, roots.get(path) ?? []);
    const members = groups.get(owner) ?? [];
    members.push(path);
    groups.set(owner, members);
  }
  return groups;
}

/** #2211: the discovery child writes the WHOLE admitted filename population to stdout and node's ~1MiB
 *  default does not truncate — it KILLS the child with ENOBUFS. 64MiB is what `check-gates.repo.int` already
 *  uses for the same class of payload. A ceiling is a fuse, not a fix: if this population keeps growing, hand
 *  the list over a file rather than raising the number again. */
const BYTES_PER_KIB = 1024;
const KIB_PER_MIB = 1024;
const DISCOVERY_BUFFER_MIB = 64;
const DISCOVERY_MAX_BUFFER_BYTES = DISCOVERY_BUFFER_MIB * KIB_PER_MIB * BYTES_PER_KIB;

export async function runEslint(root: string): Promise<number> {
  // #2211: the discovery child writes the WHOLE admitted filename population (~2300 paths for the root
  // program alone) to stdout. Node's ~1MiB default ceiling does not truncate — it kills the child with
  // ENOBUFS — so at current repo size this door could no longer enumerate its own population and the
  // whole-repo tier verdict was unobtainable. 64MiB matches what `check-gates.repo.int` already uses for
  // the same class of payload. A ceiling is still a fuse: if this population keeps growing, hand the list
  // over a file rather than raising the number again.
  const discoveredText = execNicedSync("pnpm", ["exec", "node", DISCOVERY_ENTRY, "eslint-discovery"], {
    cwd: root,
    maxBuffer: DISCOVERY_MAX_BUFFER_BYTES,
  });
  const discovered = parsedDiscovery(discoveredText);
  const admitted = await eslintConfiguredPaths(root, CONFIG_REL, discovered);
  if (admitted.length !== discovered.length || admitted.some((path, index) => path !== discovered[index])) {
    throw new Error("ESLint discovery and native ConfigArray admission resolved different filename populations");
  }

  const inventory = readPolicyRepositoryInventory(root);
  const programs = readCompilerProgramsFromInventory(inventory);
  const groups = partitionEslintFiles(admitted, programs);

  let verdict: number = EXIT.clean;
  for (const [owner, paths] of [...groups].toSorted(([left], [right]) => left.localeCompare(right))) {
    process.stderr.write(`[eslint] ${owner}: ${String(paths.length)} file(s)\n`);
    const result = runNicedSync("pnpm", ["exec", "node", "scripts/eslint.cjs", ...CHILD_FLAGS, ...paths], { cwd: root, stdio: "inherit" });
    const childVerdict = eslintScheme(result.status);
    if (childVerdict === EXIT.toolError) {
      return EXIT.toolError;
    }
    if (childVerdict === EXIT.violations) {
      verdict = EXIT.violations;
    }
  }
  return verdict;
}
