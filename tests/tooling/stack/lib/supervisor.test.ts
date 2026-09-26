// `pnpm start`'s supervisor (tooling/src/stack/lib/supervisor.ts, through the tool front door): every respawn rebuilds
// the plan from `.env` as it is then, the prepare pass runs once per invocation, each signal has one handler that
// reaches the current child, and an interactive start opens the app in the browser once, after the server first
// answers. The effects are injected, so the loop is driven without spawning a server or a browser.
import { parseEnv } from "node:util";
import { RESTART_EXIT_CODE, START_SUPERVISOR, SUPERVISOR_ENV_KEY } from "@orb/kit/supervisor";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { FORWARDED_SIGNALS } from "@orb/tooling/_shared/proc-signals";
import type { ProdSpawnPlan, StartBrowser, StartInvocation, StartSpawn, StartSupervisorDeps } from "../../../../tooling/src/stack/index.ts";
import { OPEN_BROWSER_KEY, startBrowser, startLaunch, superviseStart } from "../../../../tooling/src/stack/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const INVOCATION: StartInvocation = { build: "skip", setup: false, port: null, share: false };
const PORT = 8788;
const APP_URL = "http://localhost:8788";

/** One scripted child exit; `during` runs while that child is alive, before it exits. */
interface Scripted {
  readonly code: number | null;
  readonly signal?: NodeJS.Signals;
  readonly during?: () => void;
}

interface Harness {
  readonly deps: StartSupervisorDeps;
  readonly plans: ProdSpawnPlan[];
  readonly killed: NodeJS.Signals[][];
  readonly handlers: Map<NodeJS.Signals, (() => void)[]>;
  readonly prepared: { count: number };
  readonly notices: string[];
  /** Every URL the injected opener was asked to open. */
  readonly opened: string[];
  /** The port of every `/healthz` wait the supervisor started. */
  readonly waits: number[];
}

/** The browser half of a harness: whether this invocation opens one, and how each child's `/healthz` wait ends. */
interface BrowserScript {
  readonly browser: () => StartBrowser;
  /** One entry per wait, in order: `true` answers at once, `false` never answers (the wait ends when that child exits). */
  readonly answers: readonly boolean[];
}

const NO_BROWSER: BrowserScript = { browser: () => ({ kind: "skip" }), answers: [] };

function harness(
  script: readonly Scripted[],
  launch: () => StartSpawn,
  opts: { readonly prepare?: () => number | null; readonly platform?: NodeJS.Platform; readonly browser?: BrowserScript } = {},
): Harness {
  const { prepare = (): number | null => null, platform = "linux", browser = NO_BROWSER } = opts;
  const plans: ProdSpawnPlan[] = [];
  const killed: NodeJS.Signals[][] = [];
  const handlers = new Map<NodeJS.Signals, (() => void)[]>();
  const prepared = { count: 0 };
  const notices: string[] = [];
  const opened: string[] = [];
  const waits: number[] = [];
  const deps: StartSupervisorDeps = {
    prepare: async () => {
      prepared.count += 1;
      return await Promise.resolve(prepare());
    },
    launch,
    spawn: (plan) => {
      const index = plans.length;
      plans.push(plan);
      const signals: NodeJS.Signals[] = [];
      killed.push(signals);
      const step = script[index];
      if (step === undefined) {
        throw new Error(`the supervisor spawned child ${index + 1}; the script has ${script.length}`);
      }
      return {
        kill: (signal) => signals.push(signal),
        wait: async () => {
          await Promise.resolve();
          step.during?.();
          return { code: step.signal === undefined ? step.code : null, signal: step.signal ?? null, error: undefined };
        },
      };
    },
    register: (signal, handler) => {
      handlers.set(signal, [...(handlers.get(signal) ?? []), handler]);
    },
    notice: (message) => notices.push(message),
    platform,
    browser: browser.browser,
    served: async (port, signal) => {
      const answers = browser.answers[waits.length];
      waits.push(port);
      if (answers === true) {
        return await Promise.resolve(true);
      }
      return await new Promise<boolean>((resolve) => {
        signal.addEventListener("abort", () => resolve(false));
      });
    },
    openApp: async (url) => {
      opened.push(url);
      await Promise.resolve();
    },
  };
  return { deps, plans, killed, handlers, prepared, notices, opened, waits };
}

/** A launch that reads a mutable `.env` text on every call, the way ops/start.ts reads the file. */
function fileLaunch(file: { text: string }): () => StartSpawn {
  return () => ({
    plan: startLaunch({
      repoRoot: "/repo",
      nodePath: "/usr/bin/node",
      fileEnv: parseEnv(file.text),
      ambient: Object.fromEntries([["PATH", "/bin"]]),
      invocation: INVOCATION,
      logPath: "/l",
    }).plan,
    port: PORT,
  });
}

/** The browser decision `ops/start.ts` makes after the prepare pass, from a terminal answer and a `.env` text. */
function fileBrowser(interactive: boolean, text: string): () => StartBrowser {
  return () => startBrowser({ interactive, fileEnv: parseEnv(text), ambient: {} });
}

test("a file switched from single-user to local between two runs yields a child env without AUTH_FALLBACK", async () => {
  const file = { text: "PORT=8788\nAUTH_MODE=single-user\n" };
  const run = harness(
    [
      {
        code: RESTART_EXIT_CODE,
        during: () => {
          file.text = "PORT=8788\nAUTH_MODE=local\n";
        },
      },
      { code: 0 },
    ],
    fileLaunch(file),
  );
  expect(await superviseStart(run.deps)).toBe(0);
  expect(run.plans).toHaveLength(2);
  // The server refuses `AUTH_FALLBACK=owner` once the mode is `local`: a plan built once would carry it into the respawn.
  expect(run.plans[0]?.env["AUTH_FALLBACK"]).toBe("owner");
  expect(run.plans[1]?.env["AUTH_FALLBACK"]).toBeUndefined();
  for (const plan of run.plans) {
    expect(plan.env[SUPERVISOR_ENV_KEY]).toBe(START_SUPERVISOR);
  }
});

test("the prepare pass runs once across two respawns, and any other exit ends the supervisor with that code", async () => {
  const run = harness([{ code: RESTART_EXIT_CODE }, { code: RESTART_EXIT_CODE }, { code: 7 }], fileLaunch({ text: "" }));
  expect(await superviseStart(run.deps)).toBe(7);
  expect(run.prepared.count).toBe(1);
  expect(run.plans).toHaveLength(3);
  expect(run.notices).toHaveLength(2);
});

test("a prepare pass that stops the launch spawns nothing, and a child that cannot run is a tool error", async () => {
  const stopped = harness([], fileLaunch({ text: "" }), { prepare: () => 3 });
  expect(await superviseStart(stopped.deps)).toBe(3);
  expect(stopped.plans).toHaveLength(0);
  const broken = harness([{ code: null }], fileLaunch({ text: "" }));
  const unrunnable: StartSupervisorDeps = {
    ...broken.deps,
    spawn: () => ({ kill: () => undefined, wait: async () => await Promise.resolve({ code: null, signal: null, error: new Error("spawn ENOENT") }) }),
  };
  expect(await superviseStart(unrunnable)).toBe(EXIT.toolError);
  expect(broken.notices).toEqual(["could not run the server — spawn ENOENT"]);
});

test("one handler per signal across two respawns, and it reaches the current child only", async () => {
  const handlersFor = (signal: NodeJS.Signals): readonly (() => void)[] => run.handlers.get(signal) ?? [];
  const run = harness(
    [
      { code: RESTART_EXIT_CODE },
      { code: RESTART_EXIT_CODE },
      {
        // A Ctrl-C while the third child runs; that child then exits with the restart code, which must not respawn.
        code: RESTART_EXIT_CODE,
        during: () => {
          for (const handler of handlersFor("SIGINT")) {
            handler();
          }
        },
      },
    ],
    fileLaunch({ text: "" }),
  );
  expect(await superviseStart(run.deps)).toBe(RESTART_EXIT_CODE);
  expect(run.plans).toHaveLength(3);
  for (const signal of FORWARDED_SIGNALS) {
    expect(handlersFor(signal), signal).toHaveLength(1);
  }
  expect(run.killed).toEqual([[], [], ["SIGINT"]]);
});

// On Windows the console delivers the Ctrl-C to the server itself, and a forwarded kill would be TerminateProcess
// (tooling/src/_shared/proc.ts forwardSignalsTo). The supervisor still records the stop, so a restart code the
// server exits with after it is never respawned.
test("on win32 a Ctrl-C sends the child nothing and still stops the loop", async () => {
  const run = harness(
    [
      {
        code: RESTART_EXIT_CODE,
        during: () => {
          for (const handler of run.handlers.get("SIGINT") ?? []) {
            handler();
          }
        },
      },
    ],
    fileLaunch({ text: "" }),
    { platform: "win32" },
  );
  expect(await superviseStart(run.deps)).toBe(RESTART_EXIT_CODE);
  expect(run.plans).toHaveLength(1);
  expect(run.killed).toEqual([[]]);
});

test("an interactive start opens the app once, after the server first answers, however often it respawns", async () => {
  const run = harness([{ code: RESTART_EXIT_CODE }, { code: RESTART_EXIT_CODE }, { code: 0 }], fileLaunch({ text: "" }), {
    browser: { browser: fileBrowser(true, ""), answers: [true] },
  });
  expect(await superviseStart(run.deps)).toBe(0);
  expect(run.plans).toHaveLength(3);
  expect(run.opened).toEqual([APP_URL]);
  // Once opened, a respawn waits for nothing: the tab the person has is already pointed at the server.
  expect(run.waits).toEqual([PORT]);
});

test("a child that exits before it answers hands the open to its respawn", async () => {
  const run = harness([{ code: RESTART_EXIT_CODE }, { code: 0 }], fileLaunch({ text: "" }), {
    browser: { browser: fileBrowser(true, ""), answers: [false, true] },
  });
  expect(await superviseStart(run.deps)).toBe(0);
  expect(run.waits).toEqual([PORT, PORT]);
  expect(run.opened).toEqual([APP_URL]);
});

test("a non-interactive start and the off setting never open a browser and never wait for one", async () => {
  const offLine = `${OPEN_BROWSER_KEY}=off\n`;
  for (const [label, browser] of [
    ["no terminal", fileBrowser(false, "")],
    ["off in .env", fileBrowser(true, offLine)],
  ] as const) {
    const run = harness([{ code: RESTART_EXIT_CODE }, { code: 0 }], fileLaunch({ text: offLine }), { browser: { browser, answers: [true, true] } });
    expect(await superviseStart(run.deps), label).toBe(0);
    expect(run.opened, label).toEqual([]);
    expect(run.waits, label).toEqual([]);
  }
});

test("a setting that is neither on nor off opens nothing and says so once", async () => {
  const run = harness([{ code: RESTART_EXIT_CODE }, { code: 0 }], fileLaunch({ text: "" }), {
    browser: { browser: fileBrowser(true, `${OPEN_BROWSER_KEY}=false\n`), answers: [true, true] },
  });
  expect(await superviseStart(run.deps)).toBe(0);
  expect(run.opened).toEqual([]);
  expect(run.notices.filter((notice) => notice.includes(OPEN_BROWSER_KEY))).toHaveLength(1);
});
