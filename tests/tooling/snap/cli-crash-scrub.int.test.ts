// A snap process that crashes on an async throw prints its stack with every noted value masked, and a tool that
// notes nothing keeps its raw stack. Each case spawns the real CLI: the subject is the process's own uncaught and
// unhandled-rejection handlers, which exit the process. A preload module stands in for the page error: it notes a
// base URL's token the way a navigation does, then throws a Playwright-shaped error quoting that URL, after the
// runner's handlers are installed.
import { pathToFileURL } from "node:url";
import type { CliResult, ToolFixtures } from "@orb/testkit/tooling";
import { expect, test } from "@orb/testkit/tooling";
import { EXIT } from "@orb/tooling/floor/cli/exit-contract";
import { PRIVATE_MASK } from "../../../tooling/src/snap/contract/disk-safe-argv.ts";

const DISK_SAFE_ARGV_URL = new URL("../../../tooling/src/snap/lib/disk-safe-argv.ts", import.meta.url).href;
const NODE_OPTIONS_ENV = "NODE_OPTIONS";
const CANARY = "plant-crash-token-7f3a91";
const CANARY_URL = `http://127.0.0.1:1/?token=${CANARY}`;
const PAGE_ERROR = `new Error(${JSON.stringify(`page.goto: net::ERR_CONNECTION_REFUSED at ${CANARY_URL}`)})`;

const THROWS = {
  uncaught: `throw ${PAGE_ERROR};`,
  "unhandled rejection": `void Promise.reject(${PAGE_ERROR});`,
} as const;

type CrashKind = keyof typeof THROWS;

// The runner adds its uncaughtException listener, then its unhandledRejection one; the throw waits for the second.
function preload(kind: CrashKind): string {
  return [
    'import process from "node:process";',
    `import { noteUrlSecrets } from ${JSON.stringify(DISK_SAFE_ARGV_URL)};`,
    "process.on('newListener', function plant(event) {",
    "  if (event !== 'unhandledRejection') return;",
    "  process.off('newListener', plant);",
    "  setImmediate(() => {",
    `    noteUrlSecrets(${JSON.stringify(CANARY_URL)});`,
    `    ${THROWS[kind]}`,
    "  });",
    "});",
  ].join("\n");
}

async function crashed(
  { plantedTree, runCli }: Pick<ToolFixtures, "plantedTree" | "runCli">,
  argv: readonly [tool: string, ...args: string[]],
  kind: CrashKind,
): Promise<CliResult> {
  const root = await plantedTree({ "plant.mjs": preload(kind) });
  const plant = pathToFileURL(`${root}/plant.mjs`).href;
  const [tool, ...args] = argv;
  return await runCli(tool, args, { env: { [NODE_OPTIONS_ENV]: `--import=${plant}` } });
}

// Each case is one CLI child: a whole tooling graph behind a heap re-exec.
test.for(Object.keys(THROWS) as CrashKind[])(
  "a snap process that crashes on an %s prints its stack with the noted token masked",
  { tags: ["slow"] },
  async (kind, { plantedTree, runCli }) => {
    const run = await crashed({ plantedTree, runCli }, ["snap", "--help"], kind);
    expect(run.code).toBe(EXIT.toolError);
    expect(run.stderr).toContain(`token=${PRIVATE_MASK}`);
    expect(run.stderr).not.toContain(CANARY);
  },
);

// The positive control for the plant, and the proof that the hook is snap's alone: a tool that passes none prints raw.
test("another tool's crash still prints the raw stack the throw carried", { tags: ["slow"] }, async ({ plantedTree, runCli }) => {
  const run = await crashed({ plantedTree, runCli }, ["doc", "help"], "uncaught");
  expect(run.code).toBe(EXIT.toolError);
  expect(run.stderr).toContain(CANARY);
  expect(run.stderr).toMatch(/^ {4}at /mu);
});
