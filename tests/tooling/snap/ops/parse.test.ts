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
import { DEV_PORTS, ORB_APP_PORT_NUMBERS, stageBandPorts } from "../../../../tooling/src/_shared/ports.ts";
import { snapFlagDescriptors } from "../../../../tooling/src/snap/ops/flag-grammar.ts";
import { FLAG_HANDLERS } from "../../../../tooling/src/snap/ops/flags-handlers.ts";
import { parseSnapArgs } from "../../../../tooling/src/snap/ops/parse.ts";
import { validateRouteSection } from "../../../../tooling/src/snap/ops/parse-route.ts";
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

// @instrument-proof: #1837 — `pnpm snap /settings` (settings folded into `config` at #866) rendered the
// router's not-found page and reported BOOT-DEAD with "query cache is EMPTY", which two lanes read as an
// app failure and chased as a P0. The positional route names a rail section (`routes/router.tsx`
// `/$section`), so a segment `SECTION_IDS` does not carry is refused HERE, before the browser ever
// launches, naming the real vocabulary instead of letting the run misdiagnose itself downstream.
test("an unknown positional section refuses by name with exit 3, naming the vocabulary and --goto", () => {
  const parsed = parseSnapArgs(["/settings"]);
  expect(parsed.errors).toContainEqual(expect.stringContaining('unknown section "settings"'));
  expect(parsed.errors).toContainEqual(expect.stringContaining("config"));
  expect(parsed.errors).toContainEqual(expect.stringContaining("--goto config:<group>"));

  const result = runSnap(["/settings"]);
  expect(result.status, result.stdout).toBe(3);
  expect(result.stdout).toContain('unknown section "settings"');
});

test("a live section, a retired-but-healed section, the bare root and a non-route target all parse clean", () => {
  // Controls in the other direction, on the SAME check: a real section, a retired id the client still
  // heals (`RETIRED_SECTION_HEAL`), and the two route shapes that carry no section segment at all.
  for (const argv of [["/chats"], ["/config"], ["/worldInfo"], ["/"], []]) {
    expect(parseSnapArgs(argv).errors, argv.join(" ") || "(no route)").toEqual([]);
  }
});

// @instrument-proof: the section refusal fired on every `/<x>` whatever the target, so `--base` at a test's
// fixture HTTP server (`/bad.html`, `/no-settings`) and the router's own static `/login` on a real stage
// both refused as "unknown section". The check now judges only an orb app target and reads the router's
// static routes; the controls below keep every orb target refusing `/settings`.
const FIXTURE_PORT = 43_123;
const FIXTURE_ORIGIN = `http://127.0.0.1:${FIXTURE_PORT}`;

test("a fixture-server route, the router's static /login and an inherited-target call all parse clean", () => {
  expect(ORB_APP_PORT_NUMBERS.has(FIXTURE_PORT), "the fixture origin must not be a registered orb port").toBe(false);
  const argvs = [
    ["/no-settings", "--base", FIXTURE_ORIGIN],
    ["/bad.html", "--base", FIXTURE_ORIGIN],
    ["/login"],
    ["/login", "--isolated"],
    // A session call reaches its session's binding, which the argv cannot name; the session client judges it.
    ["--session", "p-route", "/settings"],
  ];
  for (const argv of argvs) {
    expect(parseSnapArgs(argv).errors, argv.join(" ")).toEqual([]);
  }
  expect(parseSnapArgs(["/settings"], { inheritedSessionBinding: true }).errors).toEqual([]);
  expect(parseSnapArgs(["/settings"], { scenarioCheckpoint: true }).errors).toEqual([]);
});

test("an unknown section still refuses on every orb target: default, stage, registered --base, and an inherited stage base", () => {
  const argvs = [
    ["/settings"],
    ["/settings", "--isolated"],
    ["/settings", "--base", `http://localhost:${DEV_PORTS.vite}`],
    ["/settings", "--base", `http://localhost:${DEV_PORTS.server}`],
    ["/settings", "--base", `http://127.0.0.1:${stageBandPorts(3).vite}`],
  ];
  for (const argv of argvs) {
    expect(parseSnapArgs(argv).errors, argv.join(" ")).toContainEqual(expect.stringContaining('unknown section "settings"'));
  }
  // The door an inheriting caller uses: the call's own args over the target it inherits.
  const call = parseSnapArgs(["/settings"], { scenarioCheckpoint: true });
  expect(validateRouteSection({ ...call, base: `http://127.0.0.1:${stageBandPorts(0).vite}` })).toContainEqual(
    expect.stringContaining('unknown section "settings"'),
  );
  expect(validateRouteSection({ ...call, base: FIXTURE_ORIGIN })).toEqual([]);
});

// @instrument-proof: 0203 — `pnpm snap /join/<token>` refused as "unknown section" on every orb target and
// ran on any other port. `/join/:token` is a server route the dev front door proxies (`server.proxy` in the
// client's vite config), answered by a 302 into the SPA before the router sees it.
test("a route the dev front door proxies to the server parses clean on every orb target", () => {
  const argvs = [["/join/qIi1H4vyldd"], ["/join/qIi1H4vyldd", "--isolated"], ["/join/qIi1H4vyldd", "--base", `http://127.0.0.1:${stageBandPorts(3).vite}`]];
  for (const argv of argvs) {
    expect(parseSnapArgs(argv).errors, argv.join(" ")).toEqual([]);
  }
  // Control: a segment that is neither a section nor a proxied server path still refuses on the same target.
  expect(parseSnapArgs(["/joins/qIi1H4vyldd"]).errors).toContainEqual(expect.stringContaining('unknown section "joins"'));
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
