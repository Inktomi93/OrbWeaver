// One snap invocation from its argv: the report readers, the argv preamble, the internal and admin entries,
// the stage door, and the run slot around the resolved mode. Its one caller is the snap host (`ops/host.ts`).
//
// The browser source reaches the ordinary capture path only. The matrix, scenario, `--contexts`, session and
// `--isolated` modes own their browser or process lifetimes and launch as they always do under a launch-per-run
// source; a context-per-run source refuses them (`ownLifetimeModes`) rather than let them launch beside it.
import { withInstrumentRun } from "../../floor/artifacts/artifact-out.ts";
import { print, prunedRuns, REPO_ROOT } from "../../floor/artifacts/artifacts.ts";
import { instrumentRefusal } from "../../floor/browser/page-validate.ts";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import { EXIT } from "../../floor/cli/exit-contract.ts";
import { SNAP_HELP } from "../contract/help.ts";
import type { Args } from "../contract/types.ts";
import { modalModeErrors } from "../lib/cli-mode.ts";
import { diskSafeArgv } from "../lib/disk-safe-argv.ts";
import { parseSnapReportArgs } from "../lib/run-report-query.ts";
import type { SnapBrowserSource } from "./browser-source.ts";
import { resolveContextsMode, snapContexts } from "./contexts.ts";
import { resolveFixtureTarget } from "./fixture.ts";
import { configureStage, refuseFileMode } from "./guards.ts";
import { runInternalEntry } from "./internal-entry.ts";
import { materializeDevToolsAssets } from "./materialize-devtools.ts";
import { snapMatrix } from "./matrix.ts";
import { parseSnapArgs } from "./parse.ts";
import { snap } from "./run.ts";
import { completeSnapRun } from "./run-bundle.ts";
import { printSnapReport, printSnapReports } from "./run-report.ts";
import { snapScenario } from "./scenario.ts";
import { runSessionAdmin } from "./session-admin.ts";
import { runSessionCall, sessionRouteErrors } from "./session-client.ts";
import { stageBandVerdictFor } from "./stage-marker.ts";
import { settleStageReadiness } from "./stage-teardown.ts";
import { waitForStage } from "./stage-wait.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

function printCliPreamble(opts: Args): number | null {
  // Warnings print FIRST and unconditionally — a run that is about to be refused for an unrelated error,
  // or that only asked for --help, still owes the caller the note that part of its argv does nothing.
  for (const warning of opts.warnings) {
    print(`ARG WARNING  ${warning}`);
  }
  if (opts.errors.length > 0) {
    for (const error of opts.errors) {
      print(`ARG ERROR    ${error}`);
    }
    print("Run pnpm snap --help for supported flags and combinations.");
    return EXIT.misuse;
  }
  if (opts.help) {
    print(SNAP_HELP);
    return 0;
  }
  return null;
}

/** The modes that launch their own Chromium, boot a stage or run a session process, whatever browser source the
 *  invocation was given, each named by the flags that ask for it. */
const OWN_LIFETIME_MODES = [
  "--matrix",
  "--scenario",
  "--contexts/--as",
  "--session",
  "an internal entry",
  "--isolated",
  "--materialize-devtools-assets",
] as const;
export type OwnLifetimeMode = (typeof OWN_LIFETIME_MODES)[number];

const ASKS_FOR: Readonly<Record<OwnLifetimeMode, (opts: Args) => boolean>> = {
  "--matrix": (opts) => opts.matrix,
  "--scenario": (opts) => opts.scenario !== null,
  "--contexts/--as": (opts) => opts.contexts > 1 || opts.as !== null,
  "--session": (opts) => opts.session !== null || opts.sessionExport !== null,
  "an internal entry": (opts) => opts.sessionDaemon !== null || opts.stageKeeper !== null || opts.stageWaiter !== null,
  "--isolated": (opts) => opts.isolated,
  "--materialize-devtools-assets": (opts) => opts.materializeDevToolsAssets,
};

function ownLifetimeModes(opts: Args): readonly OwnLifetimeMode[] {
  return OWN_LIFETIME_MODES.filter((mode) => ASKS_FOR[mode](opts));
}

async function runResolvedMode(opts: Args, browser: SnapBrowserSource): Promise<number> {
  if (opts.matrix) {
    return await snapMatrix(opts);
  }
  if (opts.scenario !== null) {
    return await snapScenario(opts);
  }
  // ONE resolve of the fixture's origins (flag > env > the offset-pair defaults), threaded into BOTH the
  // health probe and the login door / browser base — see ops/fixture.ts's PORTS note.
  const fixtureTarget = resolveFixtureTarget({ serverUrl: opts.fixtureServer, baseUrl: opts.fixtureBase });
  const contextsMode = resolveContextsMode(opts, fixtureTarget);
  if (contextsMode !== null) {
    if ("refuse" in contextsMode) {
      print(contextsMode.refuse);
      return 1;
    }
    return await snapContexts(opts, contextsMode.users, fixtureTarget);
  }
  return await snap(opts, browser);
}

async function runReportReader(argv: readonly string[]): Promise<number | null> {
  const report = parseSnapReportArgs(argv);
  if (!(report.list !== null || report.query !== null || report.errors.length > 0)) {
    return null;
  }
  if (report.errors.length > 0) {
    for (const error of report.errors) {
      print(`ARG ERROR    ${error}`);
    }
    return EXIT.misuse;
  }
  if (report.list !== null) {
    return await printSnapReports(REPO_ROOT, report.list, prunedRuns(REPO_ROOT, "snap"));
  }
  if (report.query === null) {
    print("INSTRUMENT ERROR  report mode resolved without a list or query");
    return EXIT.toolError;
  }
  return await printSnapReport(REPO_ROOT, report.query);
}

/** `argv` rides beside the parsed `opts` for ONE consumer: a session call forwards its raw argv to the
 *  daemon, which re-parses it (validation has one home) — the client never re-spells the grammar. */
async function runParsed(opts: Args, argv: readonly string[], browser: SnapBrowserSource): Promise<number> {
  // Reader modes are intentionally dispatched from RAW argv before the ordinary parser, stage and run
  // slot. They are evidence readers, not rendered runs, and must remain browser-free even on refusal.
  const reportExit = await runReportReader(argv);
  if (reportExit !== null) {
    return reportExit;
  }
  opts.errors.push(...modalModeErrors(opts, argv), ...sessionRouteErrors(opts));
  const cliExit = printCliPreamble(opts);
  if (cliExit !== null) {
    return cliExit;
  }
  if (browser.kind === "context-per-run") {
    const own = ownLifetimeModes(opts);
    if (own.length > 0) {
      return instrumentRefusal(
        `${own.join(", ")} cannot run as a context of a shared browser: each launches a browser or a process of its own; run it through the snap CLI`,
      );
    }
  }
  if (opts.materializeDevToolsAssets) {
    return await materializeDevToolsAssets();
  }
  // The daemon opens ITS OWN run slot (instrument `snap-session` — the dead-session marker, design §3.8),
  // so it enters before the per-call slot below; the admin modes print and exit without a slot. The band
  // idle timer (#1163 arm b) is the same kind of internal re-exec and opens no run slot at all.
  const internalExit = await runInternalEntry(opts, argv);
  if (internalExit !== null) {
    return internalExit;
  }
  const sessionAdminExit = await runSessionAdmin(opts);
  if (sessionAdminExit !== null) {
    return sessionAdminExit;
  }
  if (opts.stageStatus || opts.stageDown || opts.stageSweep) {
    return configureStage(opts) ?? EXIT.clean;
  }
  // A queued stage ask resolves BEFORE the run slot opens: the waiter boots the stage, so the stage door below
  // reuses it warm. Not on the session leg, whose daemon boots its own stage.
  const waitExit = opts.session === null ? await waitForStage(opts) : null;
  if (waitExit !== null) {
    return waitExit;
  }
  const complete = async (receipt: Parameters<typeof completeSnapRun>[0]): Promise<void> => {
    await completeSnapRun(receipt, opts, diskSafeArgv(argv));
  };
  // A session call boots its stage INSIDE the daemon (the stage is the session's binding), so the stage
  // door below is the one-shot path's only; the call still owns a per-call slot (design §3.7).
  if (opts.session !== null || opts.sessionExport !== null) {
    return await withInstrumentRun(
      "snap",
      async () => {
        const fileRefusal = refuseFileMode(opts);
        if (fileRefusal !== null) {
          print(fileRefusal);
          return EXIT.violations;
        }
        return await runSessionCall(opts, argv);
      },
      REPO_ROOT,
      { complete },
    );
  }
  // Everything this run writes lands in its OWN slot and is published as `reports/snaps/…` pointers when
  // it finishes (#1164) — two concurrent snaps that took the same `--out` name keep both sets of pixels.
  // Wrapped HERE, not around the whole invocation: the help/misuse/argv legs above write no artifacts and
  // must not mint an empty slot.
  return await withInstrumentRun(
    "snap",
    async () => {
      const fileRefusal = refuseFileMode(opts);
      if (fileRefusal !== null) {
        print(fileRefusal);
        return EXIT.violations;
      }
      const stageExit = configureStage(opts);
      if (stageExit !== null) {
        return stageExit;
      }
      const band = stageBandVerdictFor(opts.base);
      if (band.refusal !== null) {
        print(band.refusal);
        return EXIT.toolError;
      }
      if (band.note !== null) {
        print(band.note);
      }
      try {
        return await runResolvedMode(opts, browser);
      } finally {
        // A stage THIS run booted that never served a settled app is kept for one warm retry when its server
        // and vite still answer, else torn down here, at the one-shot run's own exit (#1837) — inside the
        // slot, so its stack log is preserved before the dir goes. Deliberately NOT on the `--session` leg
        // above: a session daemon owns its stage for the life of the session.
        settleStageReadiness();
      }
    },
    REPO_ROOT,
    { complete },
  );
}

/** Run one snap invocation and return its exit code; every report line goes through `print`. */
export async function runSnapCommand(argv: readonly string[], browser: SnapBrowserSource): Promise<number> {
  return await runParsed(parseSnapArgs([...argv]), argv, browser);
}
