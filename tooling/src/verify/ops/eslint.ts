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

/** THE COMPLETION CONTROL (#2212), and it is deliberately not a did-not-throw check. The child states the
 *  COUNT it enumerated beside the list; a delivered list that disagrees is a TRUNCATION and is refused here
 *  by name. #2211's failure was a KILLED child (ENOBUFS terminates, it does not clip) and the failure its fix
 *  must not introduce is the quiet short list — the two are indistinguishable to "the call returned", so the
 *  only thing that separates them is an executing assertion over the producer's own claim. */
export function parsedDiscovery(text: string): readonly string[] {
  const value = JSON.parse(text) as unknown;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("ESLint discovery child emitted a malformed population envelope (expected { count, files })");
  }
  const { count, files } = value as { readonly count?: unknown; readonly files?: unknown };
  if (!(Array.isArray(files) && files.every((path): path is string => typeof path === "string" && path !== ""))) {
    throw new Error("ESLint discovery child emitted a malformed filename list");
  }
  if (!Number.isSafeInteger(count)) {
    throw new Error("ESLint discovery child emitted no usable population count; a list with no stated size cannot be proven complete");
  }
  if (files.length !== count) {
    throw new Error(
      `ESLint discovery delivered ${String(files.length)} filenames but the child enumerated ${String(count)} — the population was TRUNCATED in transit, ` +
        "so no lint verdict is available (raise the discovery maxBuffer in tooling/src/verify/ops/eslint.ts, or hand the list over a file)",
    );
  }
  return files;
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
export const DISCOVERY_MAX_BUFFER_BYTES = DISCOVERY_BUFFER_MIB * KIB_PER_MIB * BYTES_PER_KIB;

/** THE DISCOVERY DOOR, and the ceiling is NAMED HERE rather than left to node (#2211/#2212). The child writes
 *  the WHOLE admitted filename population (~2300 paths for the root program alone) to stdout; node's ~1MiB
 *  default does not truncate at the ceiling, it KILLS the child with ENOBUFS, so at current repo size this
 *  door could no longer enumerate its own population and the whole-repo tier verdict was UNOBTAINABLE.
 *
 *  A BLOWN CEILING REFUSES BY NAME. `spawnSync`'s bare "spawnSync nice ENOBUFS" names the wrapper, not the
 *  population that outgrew it, and an operator reading that has no way to know WHICH door died or what to do
 *  — #2211 took a barrier tail plus a stack frame to attribute. The translation below states the site, the
 *  ceiling it was given, and the remedy, so the next occurrence is self-describing at the point of failure.
 *  `maxBuffer` is a parameter so a control can drive the refusal with a deliberately tiny ceiling; a fuse
 *  nobody has ever seen blow is a fuse nobody knows is wired. */
export function readDiscoveredPopulation(root: string, maxBuffer: number = DISCOVERY_MAX_BUFFER_BYTES): readonly string[] {
  try {
    return parsedDiscovery(execNicedSync("pnpm", ["exec", "node", DISCOVERY_ENTRY, "eslint-discovery"], { cwd: root, maxBuffer }));
  } catch (error) {
    if (!isBufferOverflow(error)) {
      throw error;
    }
    throw new Error(
      `ESLint discovery outgrew its ${String(maxBuffer)}-byte stdout ceiling (tooling/src/verify/ops/eslint.ts, DISCOVERY_BUFFER_MIB): the child was ` +
        "KILLED with ENOBUFS rather than truncated, so the admitted population could not be enumerated and NO lint verdict exists for this run. " +
        "Raise the ceiling, or hand the population over a file instead of stdout.",
      { cause: error },
    );
  }
}

/** ENOBUFS as node reports it from `execFileSync`: the code on the error, with the message as the fallback
 *  for a wrapper that rebuilds the error (`withCapturedStderr` folds captured stderr into `.message`). */
function isBufferOverflow(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const { code, message } = error as { readonly code?: unknown; readonly message?: unknown };
  return code === "ENOBUFS" || (typeof message === "string" && message.includes("ENOBUFS"));
}

export async function runEslint(root: string): Promise<number> {
  const discovered = readDiscoveredPopulation(root);
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
