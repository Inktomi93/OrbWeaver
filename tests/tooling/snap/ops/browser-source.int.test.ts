// A run hosted as a context of a shared Chromium (`openSnapHost("context-per-run")`, through `runSnap`) starts from
// what its own launch would give it. Each case plants state in one run, with a positive control read in that same run,
// and reads it back in the next run on the same host: page storage, cookies, emulation, the probe init script, the
// request ring and its body budget, the revealed private values and the profile window numbers must all be the next
// run's own. A run that hangs past its deadline is ended by the host, and the host's next run still runs.
import { createServer } from "node:http";
import { expect, expectSnapParity, test } from "@orb/testkit/tooling";
import { EXIT } from "@orb/tooling/floor/cli/exit-contract";
import { withProcessEnv } from "@orb/tooling/floor/process/process-env";
import { vi } from "vitest";
import { scaledBudget } from "../../_load-budget.ts";
import { listeningAddress } from "../../_server-address.ts";

const CASE_TIMEOUT_MS = scaledBudget(120_000);
const RUN_TIMEOUT_MS = scaledBudget(60_000);
// Shorter than a run needs to settle a hung eval, longer than the host's first run needs to launch its Chromium.
const HUNG_RUN_DEADLINE_MS = scaledBudget(20_000);
vi.setConfig({ testTimeout: CASE_TIMEOUT_MS, hookTimeout: CASE_TIMEOUT_MS });

const QUIET = ["--no-shot", "--no-deadcss", "--no-failure-evidence"] as const;
const RUN = { timeoutMs: RUN_TIMEOUT_MS } as const;
const RUN_SLOT_RE = /^run slot\s+(\S+)$/mu;
const EVAL_HEADER = "--- EVAL[0]";
const REQUESTS_RE = /^--- REQUESTS \((\d+) of (\d+), no filter\) ---$/mu;
const WINDOW_RE = /^ {2}window {7}\[(\d+),(\d+)\)/mu;
const BODY_BUDGET_RE = /^ {2}body-budget {2}retained=(\d+)\//mu;
const DATA_PATH = "/data.json";
// Spelled here, as an operator would, so the case exercises the env protocol the CDP fault seam publishes.
const CDP_FAULT_ENV = "ORB_PROBE_TEST_CDP_FAULT";
const CDP_FAULT = "Emulation.setCPUThrottlingRate";
const SECRET = "hushvalue-4821";

// An http origin, because cookies do not exist on file://; the readiness flag and the bridge stub make it an app
// origin snap settles on, and the fetch gives the request ring a JSON body to retain.
const PAGE = `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body><main><p>state under test</p></main><script>globalThis.__orb={consoleErrors:()=>({records:[],dropped:0,cap:128}),resetEvidence:()=>{},shell:()=>null};fetch("${DATA_PATH}")</script></body></html>`;

/** Everything a run can leave in its context that the next run must not see. */
const READ_STATE = `({
  stored: localStorage.getItem("planted"),
  seeded: localStorage.getItem("seeded"),
  session: sessionStorage.getItem("planted"),
  cookie: document.cookie,
  width: innerWidth,
  dark: matchMedia("(prefers-color-scheme: dark)").matches,
  reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
  probeStyle: [...document.querySelectorAll("style")].some((style) => style.textContent.includes("caret-color:transparent")),
})`;
const PLANT_THEN_READ = `(() => { localStorage.setItem("planted", "1"); sessionStorage.setItem("planted", "1"); document.cookie = "planted=1; path=/"; return ${READ_STATE}; })()`;
const READ_PROFILE_WINDOW = "({ windowId: globalThis.__ORB_SNAP_REACT_PROFILE__.snapshotMeta().windowId })";

interface ContextState {
  readonly stored: string | null;
  readonly seeded: string | null;
  readonly session: string | null;
  readonly cookie: string;
  readonly width: number;
  readonly dark: boolean;
  readonly reducedMotion: boolean;
  readonly probeStyle: boolean;
}

function evalBlock(stdout: string): string {
  const start = stdout.indexOf(EVAL_HEADER);
  expect(start, `no eval block in:\n${stdout}`).toBeGreaterThanOrEqual(0);
  // The header quotes the expression, which may span lines; the value is the JSON object block after it.
  const body = stdout.slice(stdout.indexOf("\n{\n", start) + 1);
  return body.slice(0, body.indexOf("\n}") + 2);
}

function evalState(stdout: string): ContextState {
  return JSON.parse(evalBlock(stdout)) as ContextState;
}

function captured(re: RegExp, stdout: string): readonly number[] {
  const match = re.exec(stdout);
  expect(match, `no ${re.source} in:\n${stdout}`).not.toBeNull();
  return (match ?? []).slice(1).map(Number);
}

function runSlot(stdout: string): string {
  const slot = RUN_SLOT_RE.exec(stdout)?.[1];
  expect(slot, `no run slot line in:\n${stdout}`).toBeTypeOf("string");
  return String(slot);
}

async function serve(): Promise<{ readonly base: string; readonly [Symbol.asyncDispose]: () => Promise<void> }> {
  const server = createServer((req, res) => {
    if (req.url === DATA_PATH) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ rows: ["one", "two", "three"] }));
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(PAGE);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    base: `http://127.0.0.1:${String(listeningAddress(server).port)}`,
    [Symbol.asyncDispose]: async (): Promise<void> => {
      await new Promise((resolve) => {
        server.close(resolve);
      });
    },
  };
}

test("state one run plants in the shared browser is absent from the next run's context", async ({ runSnap }) => {
  await using origin = await serve();
  const planted = await runSnap(
    [
      "/",
      "--base",
      origin.base,
      "--viewport",
      "500x400",
      "--dark",
      "--reduced-motion",
      "--probe",
      "--local-storage",
      "seeded=1",
      "--eval",
      PLANT_THEN_READ,
      ...QUIET,
    ],
    RUN,
  );
  await expect(planted).toExitWith(EXIT.clean);
  // The positive control: every planted state is visible inside the run that planted it.
  expect(evalState(planted.stdout)).toEqual({
    stored: "1",
    seeded: "1",
    session: "1",
    cookie: "planted=1",
    width: 500,
    dark: true,
    reducedMotion: true,
    probeStyle: true,
  });

  const next = await runSnap(["/", "--base", origin.base, "--eval", READ_STATE, ...QUIET], RUN);
  await expect(next).toExitWith(EXIT.clean);
  expect(evalState(next.stdout)).toEqual({
    stored: null,
    seeded: null,
    session: null,
    cookie: "",
    width: 1280,
    dark: false,
    reducedMotion: false,
    probeStyle: false,
  });
  expect(runSlot(next.stdout)).not.toBe(runSlot(planted.stdout));
});

test("the next run's request log starts at its own first request, with its own empty body budget", async ({ runSnap }) => {
  await using origin = await serve();
  const planted = await runSnap(["/", "--base", origin.base, "--request-body", DATA_PATH, ...QUIET], RUN);
  await expect(planted).toExitWith(EXIT.clean);
  const [shown, total] = captured(REQUESTS_RE, planted.stdout);
  // The positive control: the run saw its page's requests from 0 and retained the JSON body it asked for.
  expect(shown).toBe(total);
  expect(captured(WINDOW_RE, planted.stdout)).toEqual([0, total]);
  expect(captured(BODY_BUDGET_RE, planted.stdout)[0]).toBeGreaterThan(0);

  const next = await runSnap(["/", "--base", origin.base, "--requests", ...QUIET], RUN);
  await expect(next).toExitWith(EXIT.clean);
  expect(captured(REQUESTS_RE, next.stdout)).toEqual([total, total]);
  expect(captured(WINDOW_RE, next.stdout)).toEqual([0, total]);
  expect(captured(BODY_BUDGET_RE, next.stdout)).toEqual([0]);
});

test("a value one run revealed in private is not scrubbed from the next run's page text", async ({ runSnap }) => {
  await using origin = await serve();
  const echo = `({ echo: ${JSON.stringify(SECRET)} })`;
  const planted = await runSnap(["/", "--base", origin.base, "--local-storage", `note=${SECRET}`, "--eval", echo, ...QUIET], RUN);
  await expect(planted).toExitWith(EXIT.clean);
  // The positive control: inside the run that revealed it, the value is scrubbed from what the page hands back.
  expect(evalBlock(planted.stdout)).not.toContain(SECRET);

  const next = await runSnap(["/", "--base", origin.base, "--eval", echo, ...QUIET], RUN);
  await expect(next).toExitWith(EXIT.clean);
  expect(JSON.parse(evalBlock(next.stdout))).toEqual({ echo: SECRET });
});

test("each run numbers its React profile window from 1, as its own launch would", async ({ runSnap }) => {
  await using origin = await serve();
  const windowIds: string[] = [];
  for (const run of [1, 2]) {
    const res = await runSnap(["/", "--base", origin.base, "--react-profile", "--eval", READ_PROFILE_WINDOW, ...QUIET], RUN);
    // The page mounts no React renderer, which the arm reports as a tool error after the window was opened and read.
    await expect(res, `run ${String(run)}`).toExitWith(EXIT.toolError);
    windowIds.push((JSON.parse(evalBlock(res.stdout)) as { readonly windowId: string }).windowId);
  }
  expect(windowIds.map((id) => id.slice(id.lastIndexOf("-") + 1))).toEqual(["1", "1"]);
});

test("a run that hangs past its deadline is ended by the host, and the host's next run runs", async ({ runSnap }) => {
  await using origin = await serve();
  const hung = await runSnap(["/", "--base", origin.base, "--eval", "new Promise(() => {})", ...QUIET], { timeoutMs: HUNG_RUN_DEADLINE_MS });
  expect(hung.timedOut).toBe(true);
  expect(hung.code).toBeNull();

  const next = await runSnap(["/", "--base", origin.base, "--eval", READ_STATE, ...QUIET], RUN);
  await expect(next).toExitWith(EXIT.clean);
  expect(evalState(next.stdout).width).toBe(1280);
});

test("a run that needs a launch-time browser option is refused, and the shared browser still hosts the next run", async ({ runSnap }) => {
  await using origin = await serve();
  // `--vnc` asks for a headed display; the shared browser was launched headless and a context cannot change that.
  const refused = await runSnap(["/", "--base", origin.base, "--vnc", ...QUIET], RUN);
  await expect(refused).toExitWith(EXIT.toolError);
  expect(refused.stderr).toMatch(/INSTRUMENT ERROR: this run needs a headed display \(--vnc\)/u);

  const after = await runSnap(["/", "--base", origin.base, "--eval", READ_STATE, ...QUIET], RUN);
  await expect(after).toExitWith(EXIT.clean);
  expect(evalState(after.stdout).width).toBe(1280);
});

test("a mode that launches its own browser is refused in the host rather than launched beside it", async ({ runSnap }) => {
  await using origin = await serve();
  // `--matrix` needs a stage, so the argv carries `--isolated` too; both own a lifetime the host cannot give a context.
  const refused = await runSnap(["/", "--matrix", "--isolated", ...QUIET], RUN);
  await expect(refused).toExitWith(EXIT.toolError);
  expect(refused.stderr).toMatch(/INSTRUMENT ERROR: --matrix, --isolated cannot run as a context of a shared browser/u);
  const after = await runSnap(["/", "--base", origin.base, "--eval", READ_STATE, ...QUIET], RUN);
  await expect(after).toExitWith(EXIT.clean);
});

test("under the CDP fault seam a hosted run fails exactly as the spawned CLI does", async ({ runCli, runSnap }) => {
  await using origin = await serve();
  const args = ["/", "--base", origin.base, "--cpu-throttle", "4", ...QUIET];
  // The in-process run reads the knob live from this process's env; the spawned twin gets it in its own env.
  const faulted = await withProcessEnv(
    CDP_FAULT_ENV,
    CDP_FAULT,
    async () => await expectSnapParity({ runCli, runSnap }, args, RUN, { [CDP_FAULT_ENV]: CDP_FAULT }),
  );
  // The positive control: both doors failed under the fault, so the parity above compared two failures.
  expect(faulted.code).not.toBe(EXIT.clean);
  expect(faulted.stderr).toContain("CDP FAULT INJECTION ACTIVE");
});
