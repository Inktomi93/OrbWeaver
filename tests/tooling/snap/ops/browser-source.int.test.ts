// A run hosted in a shared Chromium (`contextsIn`, through `runSnapCommand`) starts from what its own launch would
// give it. Each case plants state in one run, with a positive control read in that same run, and reads it back in
// the next run in the same browser: storage, cookies, the local-storage seed, viewport, media emulation and the
// `--probe` init script must all be gone, and the run slot must be the next run's own.
import { createServer } from "node:http";
import { expect, test } from "@orb/testkit/tooling";
import { EXIT } from "@orb/tooling/floor/cli/exit-contract";
import { vi } from "vitest";
import { scaledBudget } from "../../_load-budget.ts";
import { listeningAddress } from "../../_server-address.ts";

const CASE_TIMEOUT_MS = scaledBudget(90_000);
vi.setConfig({ testTimeout: CASE_TIMEOUT_MS, hookTimeout: CASE_TIMEOUT_MS });

const QUIET = ["--no-shot", "--no-deadcss", "--no-failure-evidence"] as const;
const RUN_SLOT_RE = /^run slot\s+(\S+)$/mu;
const EVAL_HEADER = "--- EVAL[0]";

// An http origin, because cookies do not exist on file://; the readiness flag and the bridge stub make it an app
// origin snap settles on.
const PAGE = `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>t</title></head>
<body><main><p>state under test</p></main><script>globalThis.__orb={consoleErrors:()=>({records:[],dropped:0,cap:128}),resetEvidence:()=>{},shell:()=>null}</script></body></html>`;

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

function evalState(stdout: string): ContextState {
  const start = stdout.indexOf(EVAL_HEADER);
  expect(start, `no eval block in:\n${stdout}`).toBeGreaterThanOrEqual(0);
  // The header quotes the expression, which may span lines; the value is the JSON object block after it.
  const body = stdout.slice(stdout.indexOf("\n{\n", start) + 1);
  return JSON.parse(body.slice(0, body.indexOf("\n}") + 2)) as ContextState;
}

function runSlot(stdout: string): string {
  const slot = RUN_SLOT_RE.exec(stdout)?.[1];
  expect(slot, `no run slot line in:\n${stdout}`).toBeTypeOf("string");
  return String(slot);
}

async function serve(): Promise<{ readonly base: string; readonly [Symbol.asyncDispose]: () => Promise<void> }> {
  const server = createServer((_req, res) => {
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
  const planted = await runSnap([
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
  ]);
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

  const next = await runSnap(["/", "--base", origin.base, "--eval", READ_STATE, ...QUIET]);
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

test("a run that needs a launch-time browser option is refused, and the shared browser still hosts the next run", async ({ runSnap }) => {
  await using origin = await serve();
  // `--vnc` asks for a headed display; the shared browser was launched headless and a context cannot change that.
  await expect(runSnap(["/", "--base", origin.base, "--vnc", ...QUIET])).rejects.toThrow(/INSTRUMENT ERROR: this run needs a headed display \(--vnc\)/u);

  const after = await runSnap(["/", "--base", origin.base, "--eval", READ_STATE, ...QUIET]);
  await expect(after).toExitWith(EXIT.clean);
  expect(evalState(after.stdout).width).toBe(1280);
});
