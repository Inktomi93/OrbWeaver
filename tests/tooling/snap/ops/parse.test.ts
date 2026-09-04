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

  // #1329: a summary/group is now REQUIRED for every non-arm flag (ops/flags-metadata.ts's completeness
  // door). A flag handler with no metadata row no longer goes silently undocumented — it makes
  // `snapFlagDescriptors()` THROW naming the flag, which is the stronger guarantee: nothing can ship
  // without its row (mirrors `ArmDef.help`'s "required" contract on the arm side).
  const planted = "--__planted-undocumented-snap-flag";
  FLAG_HANDLERS[planted] = (): void => undefined;
  try {
    expect(() => snapFlagDescriptors()).toThrow(/--__planted-undocumented-snap-flag has no summary\/group/u);
  } finally {
    delete FLAG_HANDLERS[planted];
  }
  expect(undocumentedAcceptedFlags()).toEqual([]);

  for (const row of snapFlagDescriptors()) {
    expect(row.summary.length, row.flag).toBeGreaterThan(0);
    expect(row.summary.endsWith("."), row.flag).toBe(false);
    expect(row.group.length, row.flag).toBeGreaterThan(0);
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

// ── the design-audit arm's grammar (#1315) ───────────────────────────────────────────────────────────
// The two flags the folded scan brought with it. `--fail-on` is a REQUIRED-VALUE flag over a closed
// severity ladder, and a bad value has to be CLI misuse rather than a silent default: the alternative is
// a run that audits the right surface at the wrong threshold and reports it clean, which is the exact
// class the retired parser refused with `--fail-on expects P0|P1|P2|P3`.

test("--design-audit and --fail-on parse into the arm's own Args slice, and a bad severity is misuse", () => {
  const on = parseSnapArgs(["/chats", "--design-audit", "--fail-on", "P2"]);
  expect(on.errors).toEqual([]);
  expect(on).toMatchObject({ route: "/chats", designAudit: true, failOn: "P2" });

  // The default is P1 — the severity the scan has always exited 1 at — and it survives the fold.
  expect(parseSnapArgs(["/chats", "--design-audit"])).toMatchObject({ designAudit: true, failOn: "P1" });
  // Off by default: an ordinary snap run must not grow a full-page census nobody asked for.
  expect(parseSnapArgs(["/chats"])).toMatchObject({ designAudit: false, failOn: "P1" });

  expect(parseSnapArgs(["/chats", "--fail-on", "P9"]).errors).toContain('--fail-on takes a severity (P0|P1|P2|P3), got "P9"');
  expect(parseSnapArgs(["/chats", "--fail-on"]).errors).toContain('--fail-on takes a severity (P0|P1|P2|P3), got ""');
});
