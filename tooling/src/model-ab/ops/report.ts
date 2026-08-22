// The side-by-side summary: one ROW per probe, one COLUMN per variant. The table is the comparison
// instrument — per-probe JSON (full heads, finish reasons, usage) sits beside it as the lossless record.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { print } from "../../_shared/artifacts.ts";
import type { VariantRun } from "../contract/types.ts";
import { PROBES } from "./probes.ts";

const SUMMARY_ERROR_CHARS = 60;

export function writeSummary(runs: readonly VariantRun[], outDir: string, stamp: string): void {
  const names = runs.map((r) => r.name);
  const lines: string[] = ["# model-ab summary", "", `stamp: ${stamp}`, ""];
  lines.push(`| probe | ${names.join(" | ")} |`);
  lines.push(`| - | ${names.map(() => "-").join(" | ")} |`);
  const probeNames = [...PROBES.map((p) => p.name), "boot"];
  for (const p of probeNames) {
    const row = runs.map((run) => {
      const r = run.results.find((x) => x.probe === p);
      if (r === undefined) {
        return "";
      }
      if (!r.ok) {
        return `ERR ${String(r.status)} ${String(r.error ?? "").slice(0, SUMMARY_ERROR_CHARS)}`;
      }
      const think = r.reasoningChars !== undefined && r.reasoningChars > 0 ? ` think=${r.reasoningChars}ch` : "";
      return `${r.ms}ms${think} out=${String(r.contentChars)}ch`;
    });
    if (row.some((c) => c !== "")) {
      lines.push(`| ${p} | ${row.join(" | ")} |`);
    }
  }
  lines.push("", "Per-probe JSON (full heads, finish reasons, usage) sits beside this file.", "");
  const summaryPath = path.join(outDir, "summary.md");
  writeFileSync(summaryPath, lines.join("\n"));
  print(`\nsummary: ${summaryPath}`);
}
