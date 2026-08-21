// snap — one browser run, many pieces of UI evidence. Argv parse + dispatch ONLY (the five-slot cap):
// the programmatic surface is ./index.ts; the operator cookbook is `pnpm snap --help` + the ops/ headers.
// Boots against the running dev stack (`pnpm stack start` first) or an isolated stage (`--isolated`);
// artifacts land under reports/snaps/ via _shared/artifacts.
import process from "node:process";
import { pathToFileURL } from "node:url";
import { print } from "../_shared/artifacts.ts";
import { EXIT } from "../_shared/exit-contract.ts";
import { runTool } from "../_shared/run-tool.ts";
import type { Args } from "./index.ts";
import {
  configureStage,
  parseSnapArgs,
  refuseFileMode,
  resolveContextsMode,
  resolveFixtureTarget,
  SNAP_HELP,
  snap,
  snapContexts,
  snapMatrix,
  snapScenario,
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

export async function main(opts: Args): Promise<number> {
  const cliExit = printCliPreamble(opts);
  if (cliExit !== null) {
    return cliExit;
  }
  const fileRefusal = refuseFileMode(opts);
  if (fileRefusal !== null) {
    print(fileRefusal);
    return 1;
  }
  const stageExit = configureStage(opts);
  if (stageExit !== null) {
    return stageExit;
  }
  return await runResolvedMode(opts);
}

const cliEntry = process.argv[1];
if (cliEntry !== undefined && import.meta.url === pathToFileURL(cliEntry).href) {
  await runTool(() => main(parseSnapArgs(process.argv.slice(2))));
}
