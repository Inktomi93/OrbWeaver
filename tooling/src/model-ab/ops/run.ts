// Argv → variants → (list | probe-only | boot-and-probe) → summary. The whole run's exit codes:
// 0 clean · 1 the GPUs are held (a REFUSAL, not a tool break) · 2 the vllm binary is missing.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { print, REPO_ROOT } from "../../_shared/artifacts.ts";
import type { ExitCode } from "../../_shared/exit-contract.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { warn } from "../../_shared/log.ts";
import type { CliOptions, Variant } from "../contract/types.ts";
import { runProbes } from "./probe.ts";
import { writeSummary } from "./report.ts";
import { busyGpuOwners, runVariants, SERVED_NAME, vllmBinMissing } from "./serve.ts";

const DEFAULT_PORT = 8901;
const DEFAULT_VLLM_BIN = path.join(REPO_ROOT, ".cache", "vllm", "venv", "bin", "vllm");
const DEFAULT_HF_HOME = "/media/inktomi/Data/vllm-models";
const STAMP_CHARS = 16;
const STAMP_SEPARATORS = /[:T]/gu;
/** The REBOOT axis (model × chat template × serve argv) — data beside its consumer (§2.5). */
const VARIANTS_FILE = path.join(import.meta.dirname, "variants.json");

export function parseCli(argv: readonly string[]): CliOptions {
  const opt = (n: string): string | undefined => {
    const i = argv.indexOf(n);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    list: argv.includes("--list"),
    keepUp: argv.includes("--keep-up"),
    variants: opt("--variants"),
    baseUrl: opt("--base-url"),
    model: opt("--model"),
    port: Number(opt("--port") ?? DEFAULT_PORT),
    vllmBin: opt("--vllm-bin") ?? DEFAULT_VLLM_BIN,
    hfHome: opt("--hf-home") ?? DEFAULT_HF_HOME,
  };
}

export function loadVariants(filter?: string): Variant[] {
  const spec = JSON.parse(readFileSync(VARIANTS_FILE, "utf8")) as { variants: Variant[] };
  if (filter === undefined) {
    return spec.variants;
  }
  const names = filter.split(",");
  return spec.variants.filter((v) => names.includes(v.name));
}

export async function runModelAb(argv: readonly string[]): Promise<ExitCode> {
  const cli = parseCli(argv);
  const variants = loadVariants(cli.variants);

  if (cli.list) {
    for (const v of variants) {
      print(`${existsSync(v.model) ? "ready  " : "missing"}  ${v.name}  ${v.model}`);
    }
    return EXIT.clean;
  }

  const stamp = new Date().toISOString().slice(0, STAMP_CHARS).replace(STAMP_SEPARATORS, "-");
  const outDir = path.join(REPO_ROOT, "reports", "ab", stamp);
  mkdirSync(outDir, { recursive: true });

  if (cli.baseUrl !== undefined) {
    // Probe-only mode against an already-running server (e.g. the live fleet's gen engine).
    const results = await runProbes(cli.baseUrl, cli.model ?? SERVED_NAME, (r) => {
      // Keep probe-only evidence equivalent to the booted-variant arm: summary.md is readable, while each
      // result is the lossless machine record used by follow-up comparison tooling.
      writeFileSync(path.join(outDir, `live.${r.probe}.json`), JSON.stringify(r, null, 2));
      print(`  ${r.ok ? "ok " : "ERR"} ${r.probe} (${r.ms}ms)${r.error === undefined ? "" : ` — ${r.error}`}`);
    });
    writeSummary([{ name: "live", results }], outDir, stamp);
    return EXIT.clean;
  }

  if (vllmBinMissing(cli.vllmBin)) {
    warn(`vllm binary missing at ${cli.vllmBin}`);
    return EXIT.toolError;
  }
  const owners = busyGpuOwners();
  if (owners.length > 0) {
    warn(`REFUSING to boot: GPUs are held by ${owners.join(" + ")}. Wait for it to finish (or stop the fleet) and re-run.`);
    return EXIT.violations;
  }
  const runnable = variants.filter((v) => {
    if (existsSync(v.model)) {
      return true;
    }
    print(`skip ${v.name} — model path missing (${v.model})`);
    return false;
  });

  writeSummary(await runVariants(runnable, cli, outDir), outDir, stamp);
  return EXIT.clean;
}
