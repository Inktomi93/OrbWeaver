// The REBOOT axis: boot one variant's vLLM server, wait for /health, run the matrix, tear it down.
//
// SAFETY: refuses to boot while the quantize job or the engine fleet holds the GPUs, and uses its own
// offset port (default 8901) — never the fleet's ports, never snap's :8888 band.
//
// PRIORITY: the served engine rides `spawnNicedChild` (nice -n 19) like every other tooling spawn. That is
// deliberate rather than a FULL_PRIORITY_CALLERS exception: this harness REFUSES to run while anything
// else holds the GPUs, so there is nothing on the box to yield to except the co-hosted homelab — and the
// measurement it publishes is the DELTA between variant columns, all of which run at the same priority.
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { budget } from "@orb/tooling/_shared/load-budget";
import { print, REPO_ROOT } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { warn } from "../../_shared/log.ts";
import { execNicedSync, spawnNicedChild } from "../../_shared/proc.ts";
import type { CliOptions, Variant, VariantRun } from "../contract/types.ts";
import { runProbes } from "./probe.ts";

refuseDirectInvocation(import.meta.url, "node tooling/src/model-ab/cli.ts <verb>");

const HOST = "127.0.0.1";
// A CEILING, load-scaled through the one policy (#1232): the literal is the QUIET-BOX base. // 15 minutes — a cold TP2 27B load takes minutes, not seconds.
const BOOT_TIMEOUT_MS_BASE = 900_000;
const BOOT_TIMEOUT_MS = budget(BOOT_TIMEOUT_MS_BASE);
const MS_PER_SECOND = 1000;
const HEALTH_POLL_MS = 3000;
// A CEILING, load-scaled through the one policy (#1232): the literal is the QUIET-BOX base.
const HEALTH_PROBE_TIMEOUT_MS_BASE = 2000;
const HEALTH_PROBE_TIMEOUT_MS = budget(HEALTH_PROBE_TIMEOUT_MS_BASE);
const VRAM_SETTLE_MS = 12_000;
const BOOT_ERROR_CHARS = 300;
const SERVED_NAME = "ab-model";
const TENSOR_PARALLEL_SIZE = "2";
const GPU_MEMORY_UTILIZATION = "0.85";
const MAX_MODEL_LEN = "20000";
const MAX_NUM_SEQS = "8";

const GPU_OWNER_PATTERNS = [
  ["quantize_w8a8", "the quantize job"],
  ["vllm serve", "a vLLM engine (fleet?)"],
  ["VLLM::EngineCore", "a vLLM EngineCore"],
] as const;

export { SERVED_NAME };

/** Who currently holds the GPUs — the refuse-to-boot guard's evidence. */
export function busyGpuOwners(): string[] {
  const owners: string[] = [];
  for (const [pattern, label] of GPU_OWNER_PATTERNS) {
    try {
      execNicedSync("pgrep", ["-f", pattern]);
      owners.push(label);
    } catch (error) {
      if (error instanceof Error && "status" in error && error.status === 1) {
        continue;
      }
      throw error;
    }
  }
  return owners;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitHealthy(baseUrl: string, exited: () => boolean, deadline: number): Promise<void> {
  if (exited()) {
    throw new Error("vllm exited during boot — see the variant serve log");
  }
  if (Date.now() > deadline) {
    throw new Error("boot timeout");
  }
  // @orb-waive caught-failure-ownership(catch): a failed health poll advances to the bounded retry whose timeout or process exit is the operator verdict. Ends if one poll becomes terminal.
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(HEALTH_PROBE_TIMEOUT_MS) });
    if (res.ok) {
      return;
    }
  } catch {
    // Not up yet — fall through to the next poll.
  }
  await delay(HEALTH_POLL_MS);
  return waitHealthy(baseUrl, exited, deadline);
}

/** The live gen flags (packages/server `build-argv.ts` is the PRODUCTION source of truth; keep these
 *  aligned with it — an A/B that serves differently from production measures the wrong thing). */
export function buildArgv(v: Variant, port: number): string[] {
  const template = path.isAbsolute(v.chatTemplate) ? v.chatTemplate : path.join(REPO_ROOT, v.chatTemplate);
  return [
    "serve",
    v.model,
    "--served-model-name",
    SERVED_NAME,
    "--host",
    HOST,
    "--port",
    String(port),
    "--tensor-parallel-size",
    TENSOR_PARALLEL_SIZE,
    "--gpu-memory-utilization",
    GPU_MEMORY_UTILIZATION,
    "--max-model-len",
    MAX_MODEL_LEN,
    "--max-num-seqs",
    MAX_NUM_SEQS,
    "--reasoning-parser",
    "qwen3",
    "--chat-template",
    template,
    "--default-chat-template-kwargs",
    JSON.stringify(v.defaultChatTemplateKwargs),
    "--structured-outputs-config",
    JSON.stringify({ enable_in_reasoning: false }),
    "--enable-auto-tool-choice",
    "--tool-call-parser",
    "qwen3_coder",
    ...v.extraArgs,
  ];
}

async function bootAndProbe(v: Variant, cli: CliOptions, outDir: string, isLast: boolean): Promise<VariantRun> {
  print(`\n== variant ${v.name} — booting (${v.model}) ==`);
  const logPath = path.join(outDir, `${v.name}.serve.log`);
  mkdirSync(path.dirname(logPath), { recursive: true });
  writeFileSync(logPath, "");
  // Launch through /usr/bin/env so the child inherits the session env untouched and only HF_HOME is
  // pinned — without this tool ever reading process.env (banned outside the env tier).
  const child = spawnNicedChild("/usr/bin/env", [`HF_HOME=${cli.hfHome}`, cli.vllmBin, ...buildArgv(v, cli.port)], {
    onOutput: (chunk) => {
      appendFileSync(logPath, chunk);
    },
  });
  const baseUrl = `http://${HOST}:${cli.port}`;
  const bootStart = Date.now();
  // @orb-waive caught-failure-ownership(e): the boot failure is warned and returned as an explicit failed variant row with error text. Ends if callers stop publishing that row.
  try {
    await waitHealthy(baseUrl, child.hasExited, bootStart + BOOT_TIMEOUT_MS);
    print(`  healthy in ${((Date.now() - bootStart) / MS_PER_SECOND).toFixed(0)}s`);
    const results = await runProbes(baseUrl, SERVED_NAME, (r) => {
      writeFileSync(path.join(outDir, `${v.name}.${r.probe}.json`), JSON.stringify(r, null, 2));
      print(`  ${r.ok ? "ok " : "ERR"} ${r.probe} (${r.ms}ms)${r.error === undefined ? "" : ` — ${r.error}`}`);
    });
    return { name: v.name, results };
  } catch (e) {
    warn(`  variant ${v.name} FAILED: ${String(e)}`);
    return { name: v.name, results: [{ probe: "boot", ok: false, status: 0, ms: Date.now() - bootStart, error: String(e).slice(0, BOOT_ERROR_CHARS) }] };
  } finally {
    if (cli.keepUp && isLast) {
      print(`  left serving on ${baseUrl} (--keep-up) — kill pid group ${String(child.pid)} when done`);
    } else {
      child.killGroup("SIGTERM");
      await delay(VRAM_SETTLE_MS);
    }
  }
}

export async function runVariants(variants: readonly Variant[], cli: CliOptions, outDir: string): Promise<VariantRun[]> {
  const runs: VariantRun[] = [];
  const step = async (idx: number): Promise<void> => {
    const variant = variants[idx];
    if (variant === undefined) {
      return;
    }
    runs.push(await bootAndProbe(variant, cli, outDir, idx === variants.length - 1));
    return step(idx + 1);
  };
  await step(0);
  return runs;
}

export function vllmBinMissing(bin: string): boolean {
  return !existsSync(bin);
}
