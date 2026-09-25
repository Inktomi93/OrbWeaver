// The OpenRouter provider probe batch — one harness, five standing probes.
//
//   PROBES=f4,f4a,f5,or5,or5b,or7,or7b,or8,or9,or10,or11,or12   subset (default: all)
//   FORCE=1                              re-run a probe that already has a verdict row in its JSONL
//
// Resume unit is the PROBE, not the arm: the cache probes are only meaningful with their arms fired
// back-to-back inside one 5-minute Anthropic cache TTL, so a half-finished cache probe MUST be re-run
// whole. A completed run is identified by a `kind:"verdict"` row; re-runs append, never overwrite.
//
// ⚠️ Live spend against OpenRouter (`anthropic/claude-sonnet-5`) and, for F5's native reference arms,
// the Anthropic Messages API. Full batch ≈ $0.5. Keys are read from the repo `.env` and never printed.

import { jsonl, readEnvKey, totalSpend } from "./_kit.ts";
import * as f4 from "./f4-tool-description-cache.ts";
import * as f4a from "./f4a-effort-cache.ts";
import * as f5 from "./f5-effort-translation.ts";
import * as or5 from "./or5-breakpoint-offsets.ts";
import * as or5b from "./or5b-depth-invariance.ts";
import * as or7 from "./or7-reasoning-roundtrip.ts";
import * as or7b from "./or7b-multihop-reasoning-drop.ts";
import * as or8 from "./or8-same-role-adjacency.ts";
import * as or9 from "./or9-reasoning-in-same-role-runs.ts";
import * as or10 from "./or10-carry-prefix-binding.ts";
import * as or11 from "./or11-depth-system-obedience.ts";
import * as or12 from "./or12-per-turn-sections-history-cache.ts";

const ALL = [f4, f4a, f5, or5, or5b, or7, or7b, or8, or9, or10, or11, or12];

const requested = (process.env["PROBES"] ?? "").trim();
const selected = requested.length > 0 ? ALL.filter((p) => requested.split(",").includes(p.id)) : ALL;
const force = process.env["FORCE"] === "1";

if (readEnvKey("OPENROUTER_API_KEY").length === 0) {
  console.error("OPENROUTER_API_KEY not found (process.env or the repo .env). Nothing fired.");
  process.exit(1);
}

const verdicts: object[] = [];
for (const probe of selected) {
  if (!force && jsonl(probe.id).hasCompletedRun()) {
    console.log(`\n=== ${probe.id} — SKIPPED (a completed run is already in results/${probe.id}.jsonl; FORCE=1 to re-run)`);
    continue;
  }
  console.log(`\n=== ${probe.id} — ${probe.title}`);
  verdicts.push(await probe.run());
}

console.log(`\n=== verdicts`);
for (const verdict of verdicts) {
  console.log(JSON.stringify(verdict));
}
console.log(`\nOpenRouter spend this run: $${totalSpend().toFixed(4)} (native arms bill separately)`);
