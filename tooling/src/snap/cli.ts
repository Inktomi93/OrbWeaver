// snap — one browser run, many pieces of UI evidence. The process host ONLY: the invocation itself is
// `runSnapCommand` behind ./index.ts (dependency-cruiser `tooling-cli-via-index`), run here with a browser of each
// run's own; the operator cookbook is `pnpm snap --help` + the ops/ headers.
// Boots against the running dev stack (`pnpm stack up` first) or an isolated stage (`--isolated`);
// artifacts land in this run's slot via floor/artifacts/artifact-out, published as reports/snaps/… pointers.
import process from "node:process";
import { pathToFileURL } from "node:url";
import { runTool } from "../floor/cli/run-tool.ts";
import { LAUNCH_PER_RUN, runSnapCommand, scrubPrivateError } from "./index.ts";

const cliEntry = process.argv[1];
if (cliEntry !== undefined && import.meta.url === pathToFileURL(cliEntry).href) {
  const argv = process.argv.slice(2);
  // the rethrow keeps the error's class, so runTool still tells a UsageError from a tool error. Ends if scrubPrivateError stops returning the error it was given.
  await runTool(async () => {
    try {
      return await runSnapCommand(argv, LAUNCH_PER_RUN);
    } catch (error) {
      throw scrubPrivateError(error);
    }
  });
}
