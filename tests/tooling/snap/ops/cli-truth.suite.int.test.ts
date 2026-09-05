// Consolidated #1298 acceptance: CLI lifecycle ownership, strict modal dispatch, explicit refusal
// redirects, report parsing, scenario/session lifetime truth, and descriptor-owned help completeness.

import type { SpawnSyncReturns } from "node:child_process";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { vi } from "vitest";
import { parseSnapArgs, parseSnapReportArgs, prepareScenario, snapFlagDescriptors } from "../../../../tooling/src/snap/index.ts";
import { SESSION_ONLY_FLAGS, sessionOnlyFlagsIn } from "../../../../tooling/src/snap/lib/session-plan.ts";
import { FLAG_HANDLERS } from "../../../../tooling/src/snap/ops/flags-handlers.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
/** Snap's OWN spawned entries — accepted argv, hidden from the printed grammar and the generated index
 *  because an operator typing one would be starting a background process by hand rather than asking for
 *  evidence (`ops/flag-grammar.ts` INTERNAL_FLAGS). A SET rather than one hardcoded name, so the next such
 *  entry is one row here rather than a silently-wrong equality. */
const INTERNAL_SPELLINGS: ReadonlySet<string> = new Set(["--session-daemon", "--stage-keeper"]);
const SNAP_CLI = fileURLToPath(new URL("../../../../tooling/src/snap/cli.ts", import.meta.url));
vi.setConfig({ testTimeout: scaledBudget(15_000) });

function runSnap(args: readonly string[]): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [SNAP_CLI, ...args], { cwd: ROOT, encoding: "utf8", timeout: scaledBudget(10_000) });
}

function grammarCode(grammar: ReturnType<typeof snapFlagDescriptors>[number]["grammar"]): "B" | "V" | "O" {
  if (grammar === "boolean") {
    return "B";
  }
  return grammar === "required-value" ? "V" : "O";
}

test("admin and maintainer modes refuse unrelated drive/output args before any run slot or browser/stage allocation", () => {
  for (const argv of [
    ["--stage-status", "--click", "body"],
    ["--session-status", "--json"],
    ["--session-export", "p-x", "--eval", "1"],
    ["--materialize-devtools-assets", "--json"],
  ]) {
    const result = runSnap(argv);
    expect(result.status, `${argv.join(" ")}\n${result.stdout}\n${result.stderr}`).toBe(3);
    expect(result.stdout).toContain("strict modal mode");
    expect(result.stdout).not.toContain("run slot");
  }
  for (const argv of [["--stage-status"], ["--session-status"]]) {
    const result = runSnap(argv);
    expect(result.status, `${argv.join(" ")}\n${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).not.toContain("run slot");
  }
});

test("report filters reject a following flag as the missing value without consuming it", () => {
  const arm = parseSnapReportArgs(["--report", "latest", "--arm", "--all"]);
  expect(arm.errors).toContain("--arm requires a non-empty value");
  expect(arm.query?.mode).toBe("all");
  expect(arm.query?.arm).toBeNull();
  const page = parseSnapReportArgs(["--report", "latest", "--text", "--page", "2"]);
  expect(page.errors).toContain("--text requires a non-empty value");
  expect(page.query?.page).toBe(2);
});

test("the public report arm spelling perf canonicalizes to the typed interaction-perf arm", () => {
  expect(parseSnapReportArgs(["--report", "latest", "--arm", "perf"]).query?.arm).toBe("interaction-perf");
  expect(parseSnapReportArgs(["--report", "latest", "--arm", "interaction-perf"]).query?.arm).toBe("interaction-perf");
});

/** THE PERF-METER DOOR'S RECIPE PIN IS RETIRED WITH THE DOOR (#1315). It asserted that
 *  the perf meter's full legacy dialect printed a shell-safe modern Snap
 *  recipe for every legacy word — an argv TRANSLATION layer, which is exactly what the owner's
 *  no-doors/no-shims ruling deleted. What survives is one rung weaker and one rung honester: the door
 *  refuses by name and points at the arm, pinned once for every folded tool in
 *  `unified-instrument.suite.int.test.ts` ("the folded tool dirs are NOT programs"), and the retired
 *  FLAG spellings still refuse naming their replacement — which the next test below still proves. */

test("scenario checkpoints refuse every explicit browser-lifetime flag while outer load and call work survive into each plan", async ({ scratch }) => {
  const path = `${scratch}/truth.json`;
  await writeFile(
    path,
    JSON.stringify({
      name: "truth",
      checkpoints: [
        { name: "clean", args: ["/", "--eval", "checkpoint"] },
        { name: "drift", args: ["/", "--cpu-throttle", "1", "--scale", "css"] },
      ],
    }),
  );
  const outer = parseSnapArgs([
    "--scenario",
    path,
    "--cpu-throttle",
    "4",
    "--network",
    "slow-4g",
    "--scale",
    "2",
    "--eval",
    "outer",
    "--watch",
    "2000",
    "--every",
    "250",
  ]);
  const prepared = await prepareScenario(outer, path);
  const clean = prepared.checkpoints[0];
  expect(clean?.cpuThrottle).toBe(4);
  expect(clean?.network).toBe("slow-4g");
  expect(clean?.scale).toEqual(outer.scale);
  expect(clean?.errors).toEqual(["clean: scenario checkpoints do not support --watch/--baseline/--diff"]);
  expect(clean?.eval.map((entry) => entry.expr)).toEqual(["outer", "checkpoint"]);
  expect(clean?.watchMs).toBe(2000);
  expect(clean?.watchEveryMs).toBe(250);
  expect(prepared.checkpoints[1]?.errors).toContainEqual(expect.stringContaining("browser-lifetime flags (--cpu-throttle --scale)"));
  const matrixOuter = parseSnapArgs(["--matrix", "--scenario", path, "--isolated"]);
  const matrixPrepared = await prepareScenario(matrixOuter, path);
  expect(matrixPrepared.checkpoints[0]?.isolated).toBe(true);
  expect(matrixPrepared.checkpoints[0]?.errors).toEqual([]);
});

test("a later session call cannot silently replace no-failure-evidence, and ownerless modifiers refuse while parent twins pass", () => {
  expect(SESSION_ONLY_FLAGS.has("--no-failure-evidence")).toBe(true);
  expect(sessionOnlyFlagsIn(["--no-failure-evidence", "--eval", "1"])).toEqual(["--no-failure-evidence"]);
  for (const [argv, message] of [
    [["--scenario-summary"], "requires --scenario"],
    [["--every", "250"], "requires --watch"],
    [["--motion-window", "100"], "requires --motion"],
    [["--motion-no-throttle"], "requires --motion"],
    [["--force"], "requires --stage-down or --session-close"],
    [["--fixture-base", "http://127.0.0.1:5175"], "require --contexts"],
  ] as const) {
    expect(parseSnapArgs([...argv]).errors).toContainEqual(expect.stringContaining(message));
  }
  expect(parseSnapArgs(["--scenario", "x.json", "--scenario-summary"]).errors).toEqual([]);
  expect(parseSnapArgs(["--watch", "1000", "--every", "250"]).errors).toEqual([]);
  expect(parseSnapArgs(["--motion", "body", "--motion-window", "100", "--motion-no-throttle"]).errors).toEqual([]);
  expect(parseSnapArgs(["--stage-down", "--force"]).errors).toEqual([]);
  expect(parseSnapArgs(["--as", "owner", "--fixture-base", "http://127.0.0.1:5175"]).errors).toEqual([]);
});

test("approved cleanup has one accepted spelling and each retired spelling refuses with its replacement", () => {
  const replacements = {
    "--press": "--force-click",
    "--ls": "--local-storage",
    "--sse": "--stream-settle",
    "--summary": "--scenario-summary",
    "--owner": "--stage-owner",
  } as const;
  for (const [oldFlag, replacement] of Object.entries(replacements)) {
    expect(FLAG_HANDLERS[oldFlag]).toBeUndefined();
    expect(FLAG_HANDLERS[replacement]).toBeDefined();
    expect(parseSnapArgs([oldFlag]).errors).toContainEqual(expect.stringContaining(`did you mean ${replacement}`));
  }
  // THE SIBLING CLIs' SPELLINGS ARE A DIFFERENT CASE and left this table at #1315 (owner ruling): the
  // product is unlaunched, so nobody outside this repo ever typed `--jsclick`/`--wheelburst`/`--cycles`
  // and there is no one to refuse by name. They must still be GONE from the handler map, which is the
  // half that would otherwise rot into a silently-accepted second spelling.
  for (const [oldFlag, replacement] of [
    ["--jsclick", "--dom-click"],
    ["--wheelburst", "--wheel-burst"],
    ["--cycles", "--perf-cycles"],
  ] as const) {
    expect(FLAG_HANDLERS[oldFlag]).toBeUndefined();
    expect(FLAG_HANDLERS[replacement]).toBeDefined();
    expect(parseSnapArgs([oldFlag]).errors).toEqual([`unknown flag ${oldFlag}`]);
  }
});

test("descriptor-owned help grammar covers every public accepted spelling exactly once and hides snap's own spawned entries", () => {
  const described = snapFlagDescriptors().map((row) => row.flag);
  const publicAccepted = Object.keys(FLAG_HANDLERS)
    .filter((flag) => !INTERNAL_SPELLINGS.has(flag))
    .sort();
  expect(described).toEqual(publicAccepted);
  expect(new Set(described).size).toBe(described.length);
  for (const internal of INTERNAL_SPELLINGS) {
    expect(described, `${internal} is snap's own child entry, never an operator spelling`).not.toContain(internal);
    expect(FLAG_HANDLERS[internal], `${internal} is still ACCEPTED — hidden is not the same as gone`).toBeDefined();
  }
});

test("the durable accepted-flag ledger matches every executable descriptor grammar, not membership alone", async () => {
  const source = await readFile(join(ROOT, "docs/reviews/stickler/2026-09-03-snap-cli-argv-audit.md"), "utf8");
  const inventory = source.split("## Complete post-repair accepted-flag inventory")[1]?.split("### Report-reader flags handled before normal parsing")[0];
  expect(inventory).toBeDefined();
  const ledger = new Map<string, string>();
  const lines = new Map<string, string>();
  for (const line of (inventory as string).split("\n")) {
    const flag = /^\| `([^`]+)` \|/u.exec(line)?.[1];
    if (flag !== undefined) {
      lines.set(flag, line);
    }
  }
  for (const match of (inventory as string).matchAll(/^\| `([^`]+)` \| `([BVO])(?:,[^`]*)?`[^|]*\|/gmu)) {
    ledger.set(match[1] as string, match[2] as string);
  }
  const descriptors = snapFlagDescriptors({ includeInternal: true });
  const executable = new Map(descriptors.map((row) => [row.flag, grammarCode(row.grammar)]));
  expect(Object.fromEntries(ledger)).toEqual(Object.fromEntries(executable));
  for (const descriptor of descriptors) {
    const cells = lines
      .get(descriptor.flag)
      ?.split("|")
      .map((cell) => cell.trim());
    expect(cells?.at(-3), descriptor.flag).toBe(INTERNAL_SPELLINGS.has(descriptor.flag) ? "internal" : "owned");
  }
  for (const line of lines.values()) {
    expect(line).not.toMatch(/incidental|broken|currently drifts/u);
  }
  for (const flag of ["--cpu-throttle", "--scale"]) {
    expect(lines.get(flag)).toContain("one shared scenario/session browser lifetime; raw checkpoint drift refused");
  }
  expect(lines.get("--out")).toContain("typed through the session request; custom JSON/HAR/trace artifacts enter the immutable index");
  expect(lines.get("--session-export")).toContain("typed `exportOut` reaches the daemon");
  expect(
    lines
      .get("--session-export")
      ?.split("|")
      .map((cell) => cell.trim())
      .at(-2),
  ).toBe("KEEP");
  const reportReader = source.split("### Report-reader flags handled before normal parsing")[1]?.split("### Rejected legacy spellings")[0];
  expect(reportReader).toBeDefined();
  for (const flag of ["--arm", "--channel", "--source", "--category", "--text", "--window"]) {
    const line = (reportReader as string).split("\n").find((candidate) => candidate.startsWith(`| \`${flag}\` |`));
    expect(line, flag).toContain("missing value refuses without consuming the next flag");
  }
});
