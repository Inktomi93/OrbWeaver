/**
 * engines-compose — the program behind `pnpm engines compose`: write `docker/compose.engines.yaml` from the
 * shipped env floor + the ONE argv builder (`buildEngineArgv`), so the engine CONTAINERS and the bare-metal
 * fleet can never run different serve flags. All of the reasoning, and every departure from the bare-metal
 * spawn, lives in `../lib/engines-compose.ts`; this file is argv + I/O.
 *
 *   pnpm engines compose               regenerate the committed overlay (2-GPU reference topology)
 *   pnpm engines compose --gpus 1      regenerate it for a single-card box
 *   pnpm engines compose --stdout      print it instead of writing (what a drift row diffs)
 *
 * IT SPAWNS NOTHING. Unlike every other verb behind `engines.sh`, this one never touches a GPU, a port or a
 * process — it reads config and writes a file — which is why it is exempt from the standing ban on running
 * the engine launchers to inspect them.
 *
 * WHY THE LAUNCH-ENV REFUSAL. The generated file is TRACKED and SHIPPED, and the env floor it resolves from
 * is whatever the environment says — including a `.env` (this box's own sets `VLLM_GEN_MODEL` to a local
 * checkpoint path). Baking one developer's model path into the overlay everyone pulls is the exact failure
 * the one-argv-builder design exists to prevent, one level up. So the front door runs with
 * `ORB_ENV_NO_FILE=1` (no `.env` at all) and this program refuses outright if a launch-floor key is still
 * set, naming it. Exit 3 = misuse, per the house exit contract: the invocation was wrong, the tool is fine.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { processEnvSnapshot } from "@orb/server/foundation/env";
import { print, printResult } from "../../_shared/artifacts.ts";
import type { ExitCode } from "../../_shared/exit-contract.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { runTool, UsageError } from "../../_shared/run-tool.ts";
import { ENGINES_COMPOSE_DEFAULT_GPU_COUNT, ENGINES_COMPOSE_REL, launchEnvKeysSetIn, renderEnginesComposeFromEnv } from "../lib/engines-compose.ts";

const REPO_ROOT = process.cwd();
const ARGV = process.argv.slice(2);
const GPUS_FLAG = "--gpus";
const STDOUT_FLAG = "--stdout";
const USAGE = `usage: engines-compose.ts [${GPUS_FLAG} <count>] [${STDOUT_FLAG}]`;
/** `--gpus N` / `--gpus=N`, defaulting to the committed topology. A non-positive-integer count is misuse,
 *  never a silent fallback: the count drives tensor-parallel size and the per-card util split, so a typo
 *  that fell through to the default would emit a plausible overlay for the wrong hardware. */
function parseGpuCount(argv: readonly string[]): number {
  const eq = argv.find((a) => a.startsWith(`${GPUS_FLAG}=`));
  const idx = argv.indexOf(GPUS_FLAG);
  const spaced = idx < 0 ? undefined : argv[idx + 1];
  const raw = eq === undefined ? spaced : eq.slice(GPUS_FLAG.length + 1);
  if (raw === undefined) {
    if (idx >= 0) {
      throw new UsageError(`engines-compose: ${GPUS_FLAG} needs a count — ${USAGE}`);
    }
    return ENGINES_COMPOSE_DEFAULT_GPU_COUNT;
  }
  const count = Number(raw);
  if (!Number.isInteger(count) || count < 1) {
    throw new UsageError(`engines-compose: ${GPUS_FLAG} '${raw}' is not a positive integer — ${USAGE}`);
  }
  return count;
}

/** Every argument this program understands, so a typo can never read as the default invocation. */
function refuseUnknownArgs(argv: readonly string[], gpuCount: number): void {
  const known = new Set<string>([STDOUT_FLAG, GPUS_FLAG, `${GPUS_FLAG}=${String(gpuCount)}`, String(gpuCount)]);
  const unknown = argv.find((a) => !known.has(a));
  if (unknown !== undefined) {
    throw new UsageError(`engines-compose does not recognize ${JSON.stringify(unknown)} — ${USAGE}`);
  }
}

function refuseEngineEnv(): void {
  const set = launchEnvKeysSetIn(processEnvSnapshot());
  if (set.length > 0) {
    throw new UsageError(
      `engines-compose: ${set.join(", ")} set in the environment — the generated overlay is a TRACKED artifact and must carry the shipped defaults, not this box. Unset them (the \`pnpm engines compose\` front door also runs with ORB_ENV_NO_FILE=1 so a local .env cannot leak in).`,
    );
  }
}

function main(): ExitCode {
  const gpuCount = parseGpuCount(ARGV);
  refuseUnknownArgs(ARGV, gpuCount);
  refuseEngineEnv();
  const yaml = renderEnginesComposeFromEnv(REPO_ROOT, gpuCount);
  if (ARGV.includes(STDOUT_FLAG)) {
    process.stdout.write(yaml);
    return EXIT.clean;
  }
  writeFileSync(path.join(REPO_ROOT, ENGINES_COMPOSE_REL), yaml);
  print(`engines-compose: wrote ${ENGINES_COMPOSE_REL} for ${String(gpuCount)} GPU(s)`);
  printResult("engines-compose", [
    ["file", ENGINES_COMPOSE_REL],
    ["gpus", gpuCount],
  ]);
  return EXIT.clean;
}

await runTool(main);
