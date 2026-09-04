// Snap's argv-to-operator contract: contradictory location/source asks refuse before boot, retired
// motion spellings teach the right replacement, and every accepted handler has an exact help token.
// The planted handler proves the completeness check can see a newly accepted flag rather than merely
// confirming today's prose against itself.
import type { SpawnSyncReturns } from "node:child_process";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseSnapArgs, snapFlagDescriptors } from "../../../../tooling/src/snap/index.ts";
import { FLAG_HANDLERS } from "../../../../tooling/src/snap/ops/flags-handlers.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const SNAP_CLI = fileURLToPath(new URL("../../../../tooling/src/snap/cli.ts", import.meta.url));

function runSnap(args: readonly string[]): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [SNAP_CLI, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: scaledBudget(10_000),
  });
}

function undocumentedAcceptedFlags(): string[] {
  const documented = new Set(snapFlagDescriptors().map((row) => row.flag));
  return Object.keys(FLAG_HANDLERS)
    .filter((flag) => flag !== "--session-daemon")
    .filter((flag) => !documented.has(flag))
    .sort();
}

test("contradictory stage sources and locations refuse by name with exit 3, while each location mode remains legal alone", () => {
  const cases = [
    [["--dirty", "--ref", "HEAD"], "--dirty and --ref are mutually exclusive"],
    [["--base", "http://localhost:5173", "--isolated"], "--base and --isolated are mutually exclusive"],
  ] as const;

  for (const [argv, refusal] of cases) {
    expect(parseSnapArgs([...argv]).errors).toContainEqual(expect.stringContaining(refusal));
    const result = runSnap(argv);
    expect(result.status, result.stdout).toBe(3);
    expect(result.stdout).toContain(`ARG ERROR    ${refusal}`);
  }

  for (const argv of [["--dirty"], ["--ref", "HEAD"], ["--base", "http://localhost:5173"], ["--isolated"]]) {
    expect(parseSnapArgs(argv).errors, argv.join(" ")).toEqual([]);
  }
});

test("retired OS-motion spellings refuse once: reduced points to the real flag, full says to omit itself", () => {
  expect(parseSnapArgs(["--os-reduced-motion"]).errors).toEqual(["unknown flag --os-reduced-motion — did you mean --reduced-motion?"]);
  expect(parseSnapArgs(["--os-full-motion"]).errors).toEqual(["unknown flag --os-full-motion — full motion is already the default; omit the flag"]);

  const result = runSnap(["--os-full-motion"]);
  expect(result.status, result.stdout).toBe(3);
  expect(result.stdout).toContain("full motion is already the default; omit the flag");
  expect(result.stdout).not.toContain("did you mean --reduced-motion");
});

test("retired profiler spellings refuse by name instead of becoming generic unknown flags", () => {
  expect(parseSnapArgs(["--profile"]).errors).toEqual(["unknown flag --profile — did you mean --react-profile?"]);
  expect(parseSnapArgs(["--cpuprofile"]).errors).toEqual(["unknown flag --cpuprofile — did you mean --cpu-profile?"]);
});

test("every accepted public Snap flag derives exactly one grammar descriptor, including a planted handler", () => {
  expect(undocumentedAcceptedFlags()).toEqual([]);

  const planted = "--__planted-undocumented-snap-flag";
  FLAG_HANDLERS[planted] = (): void => undefined;
  try {
    expect(undocumentedAcceptedFlags()).toEqual([]);
    expect(snapFlagDescriptors().filter((row) => row.flag === planted)).toEqual([{ flag: planted, grammar: "boolean", pageTargetable: false }]);
  } finally {
    delete FLAG_HANDLERS[planted];
  }

  const liveHelp = runSnap(["--help"]);
  expect(liveHelp.status, liveHelp.stdout).toBe(0);
  for (const flag of [
    "--debug-token",
    "--fixture-base",
    "--fixture-server",
    "--idle",
    "--dom-click",
    "--force-click",
    "--probe",
    "--stream-settle",
    "--wait",
  ]) {
    expect(liveHelp.stdout, flag).toMatch(new RegExp(`${flag}(?![a-z0-9-])`, "u"));
  }
  expect(liveHelp.stdout).toContain("developer fixture stack");
});
