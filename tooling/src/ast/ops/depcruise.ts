// The depcruise pass-throughs (flow/reaches) — async now: the spawn rides the proc door
// (spawnNiced streams, so the old 64MiB maxBuffer ceiling is gone with the raw spawnSync).

import process from "node:process";
import { spawnNiced } from "@orb/tooling/_shared/proc";
import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { warn } from "../../_shared/log.ts";
import { noteMatches, noteScope, noteToolError } from "../lib/ledger.ts";
import { REPO_ROOT } from "../lib/root.ts";

refuseDirectInvocation(import.meta.url, "pnpm ast <lens>");

// depcruise pass-throughs — the module-graph layer (the same config + rules the gates run), in
// agent-readable text instead of the pnpm scripts' mermaid. flow = X's direct edges both ways;
// reaches = every module that can transitively reach X (the credential-firewall question shape).
export const DEPCRUISE_VERBS: Record<string, string> = { flow: "--focus", reaches: "--reaches" };

export async function runDepcruise(mode: string, pattern: string): Promise<void> {
  noteScope(`${mode}:${pattern}`);
  const res = await spawnNiced("node_modules/.bin/depcruise", ["packages", "--config", ".dependency-cruiser.cjs", "--output-type", "text", mode, pattern], {
    cwd: REPO_ROOT,
  });
  // depcruise emits one text line per EDGE INSTANCE, so a value import and a type import of the same
  // module render as identical lines — dedupe before printing (order preserved; counts stay honest).
  const raw = res.stdout.trim();
  const out = raw === "" ? "" : [...new Set(raw.split("\n"))].join("\n");
  print(out === "" ? `RESULT ast ${mode} ${pattern}: no edges` : out);
  // A pass-through: depcruise owns the walk, so `scanned` stays n/a rather than carrying a number this
  // process did not measure. `matches` is the edge-line count — the one result quantity we DO observe.
  const lines = out === "" ? 0 : out.split("\n").length;
  noteMatches(lines, lines);
  if (res.code !== 0 && out === "") {
    warn(res.stderr.trim());
    noteToolError();
    process.exitCode = 1;
  }
}
