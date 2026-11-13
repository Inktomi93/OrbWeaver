// snap — one browser run, many pieces of UI evidence. The process entry ONLY: the invocation runs through the snap
// host behind ./index.ts (dependency-cruiser `tooling-cli-via-index`), each run launching a Chromium of its own; the
// operator cookbook is `pnpm snap --help` + the ops/ headers.
// Boots against the running dev stack (`pnpm stack up` first) or an isolated stage (`--isolated`);
// artifacts land in this run's slot via floor/artifacts/artifact-out, published as reports/snaps/… pointers.
import process from "node:process";
import { pathToFileURL } from "node:url";
import { runTool } from "../floor/cli/run-tool.ts";
import { openSnapHost } from "./index.ts";

const cliEntry = process.argv[1];
if (cliEntry !== undefined && import.meta.url === pathToFileURL(cliEntry).href) {
  const argv = process.argv.slice(2);
  await runTool(async () => {
    await using host = openSnapHost("launch-per-run");
    return await host.run(argv);
  });
}
