// Snap's argv-to-operator contract: contradictory location/source asks refuse before boot, retired
// motion spellings teach the right replacement, and every accepted handler has an exact help token.
// The planted handler proves the completeness check can see a newly accepted flag rather than merely
// confirming today's prose against itself.
import type { SpawnSyncReturns } from "node:child_process";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { vi } from "vitest";
// THE PARSER, NOT THE BARREL (#1743). `snap/index.ts` re-exports the whole op graph — `ops/run.ts` and
// with it Playwright — so importing the two grammar doors through it made this pure file pay for the
// browser driver at collection. Measured on this box at loadavg ~30 (node, type-stripped, 5 runs each):
// the barrel 0.86-2.05s vs the three own modules 0.73-0.76s. Both doors have a module of their own, so
// the cheap seam is simply naming them (`ops/flags-handlers.ts` was already named this way below).
import { parseGotoTarget } from "../../../../tooling/src/_shared/argv.ts";
import { snapFlagDescriptors } from "../../../../tooling/src/snap/ops/flag-grammar.ts";
import { FLAG_HANDLERS } from "../../../../tooling/src/snap/ops/flags-handlers.ts";
import { parseSnapArgs } from "../../../../tooling/src/snap/ops/parse.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const SNAP_CLI = fileURLToPath(new URL("../../../../tooling/src/snap/cli.ts", import.meta.url));
// THE WALL CLOCK IS FOUR CHILD PROCESSES, NOT THE ASSERTIONS (#1743). Three of these four tests shell the
// REAL snap CLI (`runSnap`), and a snap CLI child costs 0.83-2.85s on this box at loadavg ~30 — measured
// with `spawnSync(node, [cli, …])`, three spawns per argv. The whole file therefore runs 5.9s of test
// body ALONE at that load (1.5s/1.9s/2.5s per test, `test:scoped` 2026-09-05) against vitest's 5s
// default, and any co-scheduled snap suite pushes the first case past it: measured 7.4s → `Test timed out
// in 5000ms` with nothing wrong in the parser. `budget()`'s config-load reading cannot help — it is taken
// before the sibling suites start — so the ceiling belongs HERE, where the base states the real cost.
vi.setConfig({ testTimeout: scaledBudget(30_000) });

function runSnap(args: readonly string[]): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [SNAP_CLI, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: scaledBudget(10_000),
  });
}

/** Snap's own spawned child entries — accepted, but hidden from the printed grammar and the generated
 *  index (`ops/flag-grammar.ts` INTERNAL_FLAGS). A SET, so a second such entry is one row here. */
const INTERNAL_SPELLINGS: ReadonlySet<string> = new Set(["--session-daemon", "--stage-keeper"]);

function undocumentedAcceptedFlags(): string[] {
  const documented = new Set(snapFlagDescriptors().map((row) => row.flag));
  return Object.keys(FLAG_HANDLERS)
    .filter((flag) => !INTERNAL_SPELLINGS.has(flag))
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

/** THE RETIRED SIBLING SPELLINGS DIE GENERICALLY NOW (owner ruling, #1315, extending the
 *  `--settle → --pause` call): the product is unlaunched, so nobody outside this repo ever typed
 *  `--os-reduced-motion` or `--cpuprofile` and there is no one left to refuse BY NAME — the spellings
 *  were grep-fixed at their call sites instead. What this pins is that they are GONE, not merely
 *  undocumented: still exit 3, still a named token in the message, and the parser must not have quietly
 *  re-acquired one as a second spelling for a live flag (Core-Tooling-Law.md §1's half-migration ban).
 *  `--profile → --react-profile` stays a NAMED refusal beside them as the control: it is a measured ASK
 *  from agents who never used a retired spelling at all, which is the different thing that table is for. */
test("the retired sibling spellings are gone outright, while a measured ask still refuses by name", () => {
  for (const flag of ["--os-reduced-motion", "--os-full-motion", "--cpuprofile", "--jsclick", "--wheelburst", "--cycles"]) {
    expect(parseSnapArgs([flag]).errors, flag).toEqual([`unknown flag ${flag}`]);
  }
  expect(parseSnapArgs(["--profile"]).errors).toEqual(["unknown flag --profile — did you mean --react-profile?"]);

  const result = runSnap(["--os-full-motion"]);
  expect(result.status, result.stdout).toBe(3);
  expect(result.stdout).toContain("unknown flag --os-full-motion");
  expect(result.stdout).not.toContain("did you mean");
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

test("--goto's help summary names only target forms the parser accepts, and the refused form is gone (#2482)", () => {
  // AN INSTRUMENT MAY NOT PRINT A CAPABILITY IT DOES NOT HAVE. The summary is the text `pnpm snap --help`
  // renders and the generated `.claude/skills/snap-driving/reference/flags.md` row copies, and it promised
  // "a dotted settings address group.sub.setting" — a bare dotted form `parseGotoTarget` has never accepted,
  // carrying the `settings` word that retired at #2447. The forms are extracted from the summary's own code
  // spans and each is PARSED, so the help cannot drift from the grammar again without this going red.
  const goto = snapFlagDescriptors().find((row) => row.flag === "--goto");
  expect(goto, "--goto has no descriptor row").toBeDefined();
  const summary = goto?.summary ?? "";
  const forms = [...summary.matchAll(/`(?<span>[^`]+)`/gu)].map((m) => m.groups?.["span"] ?? "").filter((span) => !span.startsWith("__orb"));
  // A ZERO HERE IS "I COULD NOT MEASURE", never "nothing to check": a summary that spells its grammar as
  // bare prose (exactly how the lying one was written) extracts no forms, and that must fail, not pass.
  expect(forms.length, `no code-spanned target form in --goto's summary: ${summary}`).toBeGreaterThanOrEqual(2);
  for (const form of forms) {
    expect(() => parseGotoTarget(form), form).not.toThrow();
  }
  // The retired promise, and the refusal that replaced the section arm's misleading answer.
  expect(summary).not.toContain("group.sub.setting");
  expect(() => parseGotoTarget("connections.connections.add-connection")).toThrow("dotted address with no namespace");
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
