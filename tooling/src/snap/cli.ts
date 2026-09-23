// snap — one browser run, many pieces of UI evidence. Argv parse + dispatch ONLY (the five-slot cap):
// the programmatic surface is ./index.ts; the operator cookbook is `pnpm snap --help` + the ops/ headers.
// Boots against the running dev stack (`pnpm stack start` first) or an isolated stage (`--isolated`);
// artifacts land in this run's slot via _shared/artifact-out, published as reports/snaps/… pointers.
import process from "node:process";
import { pathToFileURL } from "node:url";
import { withInstrumentRun } from "../_shared/artifact-out.ts";
import { print, prunedRuns, REPO_ROOT } from "../_shared/artifacts.ts";
import { EXIT } from "../_shared/exit-contract.ts";
import { runTool } from "../_shared/run-tool.ts";
import type { Args } from "./index.ts";
import {
  completeSnapRun,
  configureStage,
  materializeDevToolsAssets,
  modalModeErrors,
  parseSnapArgs,
  parseSnapReportArgs,
  printSnapReport,
  printSnapReports,
  refuseFileMode,
  resolveContextsMode,
  resolveFixtureTarget,
  runInternalEntry,
  runSessionAdmin,
  runSessionCall,
  SNAP_HELP,
  sessionRouteErrors,
  snap,
  snapContexts,
  snapMatrix,
  snapScenario,
  stageBandVerdictFor,
  tearDownBootDeadStage,
} from "./index.ts";

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

async function runResolvedMode(opts: Args): Promise<number> {
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
  return await snap(opts);
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
export async function main(opts: Args, argv: readonly string[]): Promise<number> {
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
  const complete = async (receipt: Parameters<typeof completeSnapRun>[0]): Promise<void> => {
    await completeSnapRun(receipt, opts, argv);
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
  // Wrapped HERE, not around `main`: the help/misuse/argv legs above write no artifacts and must not mint
  // an empty slot.
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
        return await runResolvedMode(opts);
      } finally {
        // A stage THIS run booted that never served a settled app is torn down here, at the one-shot run's
        // own exit (#1837) — inside the slot, so its stack log is preserved before the dir goes. Deliberately
        // NOT on the `--session` leg above: a session daemon owns its stage for the life of the session.
        tearDownBootDeadStage();
      }
    },
    REPO_ROOT,
    { complete },
  );
}

const cliEntry = process.argv[1];
if (cliEntry !== undefined && import.meta.url === pathToFileURL(cliEntry).href) {
  const argv = process.argv.slice(2);
  await runTool(() => main(parseSnapArgs(argv), argv));
}
