// The depcruise pass-throughs (flow/reaches) — async now: the spawn rides the proc door
// (spawnNiced streams, so the old 64MiB maxBuffer ceiling is gone with the raw spawnSync).

import { spawnNiced } from "@orb/tooling/_shared/proc";
import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { exitToolError, noteMatches, noteScope } from "../lib/ledger.ts";
import { REPO_ROOT } from "../lib/root.ts";

refuseDirectInvocation(import.meta.url, "pnpm ast <lens>");

// depcruise pass-throughs — the module-graph layer (the same config + rules the gates run), in
// agent-readable text instead of the pnpm scripts' mermaid. flow = X's direct edges both ways;
// reaches = every module that can transitively reach X (the credential-firewall question shape).
export const DEPCRUISE_VERBS: Record<string, string> = { flow: "--focus", reaches: "--reaches" };
export const DEPCRUISE_ROOTS = ["packages", "tooling"] as const;

export async function runDepcruise(mode: string, pattern: string, spawn: typeof spawnNiced = spawnNiced): Promise<void> {
  noteScope(`graph-roots:${DEPCRUISE_ROOTS.join(",")}`);
  noteScope(`${mode}:${pattern}`);
  const res = await spawn("node_modules/.bin/depcruise", [...DEPCRUISE_ROOTS, "--config", ".dependency-cruiser.cjs", "--output-type", "text", mode, pattern], {
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
  // A NONZERO EXIT IS A BROKEN WALK, WITH OR WITHOUT OUTPUT (#1507).
  //
  // Two things were wrong here. (1) `&& out === ""` let a run that died PART WAY — some edges on stdout,
  // an error on stderr — print its partial graph and exit 0; a truncated module graph read as the answer.
  // (2) The code it did set was 1 (a VERDICT) for what is always a tool break.
  //
  // MECHANISM, re-derived on the tree rather than assumed (the row that sent this lane predicted
  // "violations → nonzero + stdout"): this pass-through runs `--output-type text`, and the TEXT reporter
  // hardcodes `exitCode: 0` (node_modules/dependency-cruiser/src/report/text.mjs:92) — only the `err`
  // reporter returns the violation count (src/report/error.mjs:200). So a rule violation CANNOT surface
  // as a nonzero exit here; `flow`/`reaches` are graph dumps, not validations. Every nonzero this op can
  // observe comes from dependency-cruiser's own catch arm (bad config, missing path — bin/
  // dependency-cruise.mjs:180-182) or from the spawn failing. That is exit-2 class, and it routes through
  // the ONE tool-error door so the epilogue and the ledger stay consistent.
  if (res.code !== 0) {
    exitToolError(
      `depcruise ${mode} ${pattern} exited ${String(res.code)} — the module-graph walk did NOT complete, so the ${String(lines)} edge line(s) above are partial, not an answer.\n${res.stderr.trim()}`,
    );
  }
}
