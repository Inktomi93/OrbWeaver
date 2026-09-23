// Whole-repository ESLint execution is partitioned by native compiler owner so TypeScript programs die
// between processes. Discovery asks ESLint itself which files `.` means; actual shards use the unchanged
// production config, parser, rules, processors, formatter, cache, and diagnostics.
//
// CACHE PERSISTENCE (#1931). Each partition's ESLint child runs with `--cache --cache-location` pointing
// to a PER-OWNER file under `.cache/eslint/`. Without a per-owner location, ESLint's cache `reconcile()`
// purges entries for files NOT in the current invocation's file list — so every sequential partition
// REPLACES the shared `.eslintcache` with only its own files, and the next whole-tree run finds zero
// cache hits for every group except the one that ran last. A per-owner path makes each partition's cache
// independent and persistent across runs.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
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
/** Flags shared by every partition child. `--cache-location` is added per-owner in {@link runEslint}. */
const CHILD_FLAGS = ["--max-warnings", "0", "--cache", "--cache-strategy", "content", "--concurrency", "off"] as const;
/** The directory under which per-owner cache files live (inside `.cache/`, already gitignored). */
const ESLINT_CACHE_DIR = ".cache/eslint";

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

/** The discovery wire reader (#2212). `count` and `files` are serialized from the same producer-owned
 *  enumeration, so equality proves envelope consistency rather than independent completion. Malformed JSON
 *  and inconsistent envelopes both refuse with this discovery site named; neither is evidence of ENOBUFS. */
export function parsedDiscovery(text: string): readonly string[] {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error("ESLint discovery child emitted malformed serialized population data; no lint verdict is available", { cause: error });
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("ESLint discovery child emitted a malformed population envelope (expected { count, files })");
  }
  const { count, files } = value as { readonly count?: unknown; readonly files?: unknown };
  if (!(Array.isArray(files) && files.every((path): path is string => typeof path === "string" && path !== ""))) {
    throw new Error("ESLint discovery child emitted a malformed filename list");
  }
  if (!Number.isSafeInteger(count)) {
    throw new Error("ESLint discovery child emitted a malformed population envelope (count must be a safe integer)");
  }
  if (files.length !== count) {
    throw new Error(
      `ESLint discovery envelope is inconsistent: count ${String(count)} does not match ${String(files.length)} filenames; no lint verdict is available`,
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

/** #2211: a discovery population once exceeded node's default capture ceiling, which kills the child with
 *  ENOBUFS rather than returning clipped stdout. The current fenced repository measured about 446 KiB on
 *  2026-09-13, so that incident no longer reproduces; 64 MiB remains a named production fuse. */
const BYTES_PER_KIB = 1024;
const KIB_PER_MIB = 1024;
const DISCOVERY_BUFFER_MIB = 64;
export const DISCOVERY_MAX_BUFFER_BYTES = DISCOVERY_BUFFER_MIB * KIB_PER_MIB * BYTES_PER_KIB;

/** THE DISCOVERY DOOR, and the ceiling is NAMED HERE rather than left to node (#2211/#2212). The child writes
 *  the whole producer-owned filename population to stdout. Node does not return a clipped value when the
 *  capture ceiling is exceeded; it kills the child with ENOBUFS. The current fenced payload is below node's
 *  default, while the explicit 64 MiB ceiling preserves a stable fuse as the repository grows.
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

  // Ensure the per-owner cache directory exists before the first partition runs.
  const cacheDir = join(root, ESLINT_CACHE_DIR);
  mkdirSync(cacheDir, { recursive: true });

  let verdict: number = EXIT.clean;
  for (const [owner, paths] of [...groups].toSorted(([left], [right]) => left.localeCompare(right))) {
    process.stderr.write(`[eslint] ${owner}: ${String(paths.length)} file(s)\n`);
    // Each partition gets its own cache file so ESLint's reconcile() does not purge sibling entries (#1931).
    const ownerCacheFile = join(cacheDir, `${owner.replaceAll("/", "__")}.eslintcache`);
    const result = runNicedSync("pnpm", ["exec", "node", "scripts/eslint.ts", ...CHILD_FLAGS, "--cache-location", ownerCacheFile, ...paths], {
      cwd: root,
      stdio: "inherit",
    });
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
