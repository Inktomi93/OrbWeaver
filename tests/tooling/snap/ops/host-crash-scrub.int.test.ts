// @subject tooling/src/snap/ops/host.ts
// The one-shot CLI's crash scrub: a throw Node detects after the run returned still prints the run's noted token masked,
// because the host keeps a run's noted values until the next run or process exit, never forgetting them as the run ends.
import process from "node:process";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/tooling";
import { EXIT } from "@orb/tooling/floor/cli/exit-contract";
import { spawnNiced } from "@orb/tooling/floor/process/proc";
import { PRIVATE_MASK } from "../../../../tooling/src/snap/contract/disk-safe-argv.ts";
import { scaledBudget } from "../../_load-budget.ts";

const toUrl = (relative: string): string => pathToFileURL(new URL(relative, import.meta.url).pathname).href;
const RUN_TOOL_URL = toUrl("../../../../tooling/src/floor/cli/run-tool.ts");
const SNAP_INDEX_URL = toUrl("../../../../tooling/src/snap/index.ts");
const CANARY = "plant-host-token-5d2c8e";
const RUN_BUDGET_MS = scaledBudget(60_000);

// What `tooling/src/snap/cli.ts` does, with a throw added after the run returns. The run navigates to a page this script
// serves, under a base URL carrying the token, which is how a run notes it; the throw then quotes that URL as Playwright's would.
function cliScript(afterRun: string): string {
  return [
    'import { createServer } from "node:http";',
    `import { runTool } from ${JSON.stringify(RUN_TOOL_URL)};`,
    `import { openSnapHost, scrubPlaywrightText } from ${JSON.stringify(SNAP_INDEX_URL)};`,
    "const server = createServer((_request, response) => {",
    '  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });',
    '  response.end(\'<!doctype html><html lang="en" data-app-ready="settled"><body><main>page</main></body></html>\');',
    "});",
    'await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));',
    `const base = \`http://127.0.0.1:\${server.address().port}/?token=${CANARY}\`;`,
    'const quoting = new Error("page.goto: net::ERR_CONNECTION_REFUSED at " + base);',
    "await runTool(",
    "  async () => {",
    '    await using host = openSnapHost("launch-per-run");',
    '    const code = await host.run(["/", "--base", base, "--no-shot", "--no-deadcss", "--no-failure-evidence"]);',
    "    server.closeAllConnections();",
    "    server.close();",
    `    ${afterRun}`,
    "    return code;",
    "  },",
    "  { scrubCrashText: scrubPlaywrightText },",
    ");",
  ].join("\n");
}

const LATE_REJECTION = "void Promise.reject(quoting); await new Promise((resolve) => setTimeout(resolve, 50));";
const LATE_THROW = "setImmediate(() => { throw quoting; }); await new Promise((resolve) => setTimeout(resolve, 50));";

test.for([
  ["an unhandled rejection", LATE_REJECTION],
  ["an uncaught throw", LATE_THROW],
] as const)(
  "%s detected after the run returned prints the run's base URL token masked",
  { timeout: RUN_BUDGET_MS },
  async ([_kind, afterRun], { plantedTree }) => {
    const root = await plantedTree({ "main.ts": cliScript(afterRun) });
    const res = await spawnNiced(process.execPath, [`${root}/main.ts`]);

    expect(res.code).toBe(EXIT.toolError);
    // The positive control: the throw the run did not catch reached the crash handler and printed its URL.
    expect(res.stderr).toContain("ERR_CONNECTION_REFUSED");
    expect(res.stderr).toContain(`token=${PRIVATE_MASK}`);
    expect(res.stderr).not.toContain(CANARY);
  },
);
