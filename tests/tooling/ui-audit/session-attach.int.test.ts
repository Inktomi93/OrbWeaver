// #1285 / design §3.4 §5 — `design-audit --session <name>` attaches to a live snap session's browser
// instead of launching a fresh one, entering through snap's front door (`resolveSessionAttach`,
// `tooling/src/snap/ops/session-attach.ts`) rather than reading the registry itself. This is the FIRST
// sibling attach site to land (T8's own proof lives in the substrate design's test plan and is the
// orchestrator's to run against #1276 once this exists); this file proves the attach mechanism at
// design-audit's own call site: it measures the SESSION's declared environment (never its own default
// viewport), and a dead/absent session is refused loudly (exit 2) rather than silently falling back to a
// fresh launch — the one failure mode #1285 exists to close.
//
// @instrument-proof: a session booted at a non-default viewport, attached from design-audit, must measure
// THAT viewport (proven independently through a follow-up snap --eval on the still-live page) — never
// ui-audit's own 1280x800 default.
// @instrument-absence-proof: an absent session name, and a session whose daemon died, both refuse (exit 2,
// naming the reason) rather than falling back to launching a fresh browser under the session's name.
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { vi } from "vitest";
import type { SessionRow } from "../../../tooling/src/snap/contract/session.ts";
import { readSessionRow } from "../../../tooling/src/snap/lib/session-wire.ts";
import type { CliResult } from "../../support/tool-fixtures.ts";
import { expect, test } from "../../support/tool-fixtures.ts";
import { scaledBudget } from "../_load-budget.ts";

const CASE_BUDGET_MS = scaledBudget(90_000, 4);
vi.setConfig({ testTimeout: CASE_BUDGET_MS, hookTimeout: CASE_BUDGET_MS });
const CLI_BUDGET_MS = scaledBudget(45_000, 4);

const FIXTURE_HTML = '<!doctype html><html data-app-ready="settled"><body style="margin:0"><main>fixture</main></body></html>';
const QUIET = ["--no-shot", "--no-failure-evidence"];
const SESSION_HOME_KEY = "ORB_SNAP_SESSION_HOME";
const CENSUS_RE = /census=(\d+)/u;
const POLL_MS = 250;
const POLL_ATTEMPTS = 80;
const NON_DEFAULT_VIEWPORT = "700x900";

const uniq = (tag: string): string => `p-uia-${tag}-${process.pid}`;

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function until(predicate: () => boolean, attempts = POLL_ATTEMPTS): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (predicate()) {
      return true;
    }
    await sleep(POLL_MS);
  }
  return predicate();
}

interface Rig {
  readonly dir: string;
  readonly home: string;
  readonly snap: (args: readonly string[]) => Promise<CliResult>;
  readonly audit: (args: readonly string[]) => Promise<CliResult>;
  readonly rowOf: (name: string) => SessionRow;
  readonly close: (names: readonly string[]) => Promise<void>;
}

async function rig(
  scratch: string,
  runCli: (tool: string, args: readonly string[], opts?: { env?: Readonly<Record<string, string>>; timeoutMs?: number }) => Promise<CliResult>,
): Promise<Rig> {
  const home = join(scratch, "registry");
  const env = { [SESSION_HOME_KEY]: home };
  await writeFile(join(scratch, "fixture.html"), FIXTURE_HTML);
  const snap = (args: readonly string[]): Promise<CliResult> => runCli("snap", args, { env, timeoutMs: CLI_BUDGET_MS });
  const audit = (args: readonly string[]): Promise<CliResult> => runCli("ui-audit", args, { env, timeoutMs: CLI_BUDGET_MS });
  const rowOf = (name: string): SessionRow => {
    const row = readSessionRow(readFileSync(join(home, `${name}.json`), "utf8"));
    if (row === null) {
      throw new Error(`rowOf: ${name}.json in ${home} did not parse as a SessionRow`);
    }
    return row;
  };
  const close = async (names: readonly string[]): Promise<void> => {
    for (const name of names) {
      await snap(["--session-close", name, "--force"]);
    }
    await snap(["--session-sweep"]);
  };
  return { dir: scratch, home, snap, audit, rowOf, close };
}

test("a live session's declared viewport is what design-audit measures through --session, never its own 1280x800 default", async ({ scratch, runCli }) => {
  const r = await rig(scratch, runCli);
  const name = uniq("live");
  try {
    await expect(
      await r.snap(["--session", name, "--viewport", NON_DEFAULT_VIEWPORT, "--file", join(scratch, "fixture.html"), "--eval", "1", ...QUIET]),
    ).toExitWith(EXIT.clean);
    const res = await r.audit(["/fixture.html", "--session", name, "--base", `file://${scratch}`]);
    // A verdict (clean or findings), never a misuse/toolError — the attach measured a REAL page.
    expect([EXIT.clean, EXIT.violations]).toContain(res.code);
    expect(CENSUS_RE.test(res.stdout)).toBe(true);
    expect(Number(CENSUS_RE.exec(res.stdout)?.[1])).toBeGreaterThan(0);
    // The session's OWN declared viewport is what design-audit measured — never its own 1280x800 default,
    // and never a mismatch against the launcher-owned contract (`environment-fails=0`).
    expect(res.stdout).toContain(`viewport-actual=${NON_DEFAULT_VIEWPORT}`);
    expect(res.stdout).toContain("environment-fails=0");
  } finally {
    await r.close([name]);
  }
});

test("an absent session name refuses (exit 2, naming the session) rather than falling back to a fresh launch", async ({ scratch, runCli }) => {
  const r = await rig(scratch, runCli);
  const res = await r.audit(["/fixture.html", "--session", uniq("absent"), "--base", `file://${scratch}`]);
  await expect(res).toExitWith(EXIT.toolError);
  expect(res.stdout).toContain("SESSION REFUSED");
  expect(res.stdout).toContain("no session named");
});

test("a DEAD session (daemon gone) refuses (exit 2, naming the death) rather than silently launching a substitute browser", async ({ scratch, runCli }) => {
  const r = await rig(scratch, runCli);
  const name = uniq("dead");
  try {
    await expect(await r.snap(["--session", name, "--file", join(scratch, "fixture.html"), "--eval", "1", ...QUIET])).toExitWith(EXIT.clean);
    const row = r.rowOf(name);
    process.kill(row.daemonPid, "SIGKILL");
    expect(await until(() => !pidAlive(row.daemonPid))).toBe(true);
    const res = await r.audit(["/fixture.html", "--session", name, "--base", `file://${scratch}`]);
    await expect(res).toExitWith(EXIT.toolError);
    expect(res.stdout).toContain("SESSION DEAD");
  } finally {
    await r.close([name]);
  }
});
