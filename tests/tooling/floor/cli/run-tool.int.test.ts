// The exit-honesty runner's behavioral pins — each arm spawns a REAL node child over a scratch main:
// the crash-collision control (bare node crash exits 1 — the verdict collision runTool exists to kill),
// crash→toolError(2), UsageError→misuse(3), verdict passthrough, never-downgrade (a set verdict
// survives a later crash as 2, not 1), and the crash scrub hook on every crash path.
import process from "node:process";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/tooling";
import { EXIT } from "@orb/tooling/floor/cli/exit-contract";
import { spawnNiced } from "@orb/tooling/floor/process/proc";
import { PRIVATE_MASK } from "../../../../tooling/src/snap/contract/disk-safe-argv.ts";

const RUN_TOOL_URL = pathToFileURL(new URL("../../../../tooling/src/floor/cli/run-tool.ts", import.meta.url).pathname).href;

function script(body: string): string {
  return `import { runTool, UsageError } from ${JSON.stringify(RUN_TOOL_URL)};\n${body}\n`;
}

async function runScratch(
  plantedTree: (files: Record<string, string>) => Promise<string>,
  body: string,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const root = await plantedTree({ "main.ts": body });
  const res = await spawnNiced(process.execPath, [`${root}/main.ts`]);
  return { code: res.code, stdout: res.stdout, stderr: res.stderr };
}

test("CONTROL: a bare node crash exits 1 — indistinguishable from a violations verdict (the collision)", async ({ plantedTree }) => {
  const res = await runScratch(plantedTree, 'throw new Error("boom");');
  expect(res.code).toBe(1);
});

test("a crash under runTool exits toolError (2), never a verdict", async ({ plantedTree }) => {
  const res = await runScratch(plantedTree, script('await runTool(() => { throw new Error("boom"); });'));
  expect(res.code).toBe(EXIT.toolError);
  expect(res.stderr).toContain("TOOL ERROR");
});

test("an async crash (unhandled rejection) under runTool exits toolError (2)", async ({ plantedTree }) => {
  const res = await runScratch(
    plantedTree,
    script('await runTool(async () => { void Promise.reject(new Error("late")); await new Promise((r) => setTimeout(r, 50)); return 0; });'),
  );
  expect(res.code).toBe(EXIT.toolError);
});

test("UsageError maps to misuse (3) with the message on stderr", async ({ plantedTree }) => {
  const res = await runScratch(plantedTree, script('await runTool(() => { throw new UsageError("--frob requires a value"); });'));
  expect(res.code).toBe(EXIT.misuse);
  expect(res.stderr).toContain("--frob requires a value");
});

test("a returned verdict passes through and a report far larger than a pipe buffer drains first (no hard exit on the verdict path)", async ({
  plantedTree,
}) => {
  const Line = "report line\n";
  const Lines = 40_000;
  const res = await runScratch(
    plantedTree,
    script(`await runTool(() => { process.stdout.write(${JSON.stringify(Line)}.repeat(${String(Lines)})); return 1; });`),
  );
  expect(res.code).toBe(EXIT.violations);
  expect(res.stdout).toHaveLength(Line.length * Lines);
});

test("NEVER-DOWNGRADE: a violations verdict already set survives a late crash as toolError, not clean", async ({ plantedTree }) => {
  const res = await runScratch(plantedTree, script('await runTool(() => { process.exitCode = 1; throw new Error("epilogue blew up"); });'));
  expect(res.code).toBe(EXIT.toolError);
});

// The crash scrub snap passes (`tooling/src/snap/cli.ts`), over the real runner and the real value scrub: the run notes a
// base URL token as a navigation does, then throws an error quoting that URL down each crash path.
const PRIVATE_VALUES_URL = pathToFileURL(new URL("../../../../tooling/src/snap/lib/private-values.ts", import.meta.url).pathname).href;
const DISK_SAFE_ARGV_URL = pathToFileURL(new URL("../../../../tooling/src/snap/lib/disk-safe-argv.ts", import.meta.url).pathname).href;
const CANARY = "plant-crash-token-7f3a91";
const CANARY_URL = `http://127.0.0.1:1/?token=${CANARY}`;
const PAGE_ERROR = `new Error(${JSON.stringify(`page.goto: net::ERR_CONNECTION_REFUSED at ${CANARY_URL}`)})`;
const CRASHES = {
  uncaught: `setImmediate(() => { throw ${PAGE_ERROR}; }); await new Promise((r) => setTimeout(r, 50)); return 0;`,
  "unhandled rejection": `void Promise.reject(${PAGE_ERROR}); await new Promise((r) => setTimeout(r, 50)); return 0;`,
  "awaited throw": `throw ${PAGE_ERROR};`,
} as const;

function crashScript(body: string, options: string): string {
  return script(
    [
      `import { scrubPlaywrightText } from ${JSON.stringify(PRIVATE_VALUES_URL)};`,
      `import { noteUrlSecrets } from ${JSON.stringify(DISK_SAFE_ARGV_URL)};`,
      `await runTool(async () => { noteUrlSecrets(${JSON.stringify(CANARY_URL)}); ${body} }${options});`,
    ].join("\n"),
  );
}

test.for(Object.entries(CRASHES))("an %s under runTool with snap's scrub prints the noted token masked", async ([_kind, body], { plantedTree }) => {
  const res = await runScratch(plantedTree, crashScript(body, ", { scrubCrashText: scrubPlaywrightText }"));
  expect(res.code).toBe(EXIT.toolError);
  expect(res.stderr).toContain(`token=${PRIVATE_MASK}`);
  expect(res.stderr).not.toContain(CANARY);
});

// The positive control for the plant, and the default every other tool keeps: no hook prints the raw stack.
test("a crash under runTool with no scrub prints the raw stack it carried", async ({ plantedTree }) => {
  const res = await runScratch(plantedTree, crashScript(CRASHES.uncaught, ""));
  expect(res.code).toBe(EXIT.toolError);
  expect(res.stderr).toContain(CANARY);
  expect(res.stderr).toMatch(/^ {4}at /mu);
});

test("a local fake runTool retains the crash/verdict collision instead of canonical exit honesty", async ({ plantedTree }) => {
  const res = await runScratch(plantedTree, 'function runTool(main:()=>number){main();} runTool(()=>{throw new Error("fake runner");});');
  expect(res.code).toBe(EXIT.violations);
  expect(res.stderr).toContain("fake runner");
  expect(res.stderr).not.toContain("TOOL ERROR");
});

// A `using` block whose disposal throws after the body threw keeps both failures in one SuppressedError: the run's own
// error in `.suppressed`, the disposal's in `.error`.
test("a run that throws and whose disposal throws too prints both errors, the run's first", async ({ plantedTree }) => {
  const res = await runScratch(
    plantedTree,
    script(
      [
        "await runTool(() => {",
        '  using _held = { [Symbol.dispose]() { throw new Error("the compiler had already exited"); } };',
        '  throw new Error("the group failed first");',
        "});",
      ].join("\n"),
    ),
  );
  expect(res.code).toBe(EXIT.toolError);
  const run = res.stderr.indexOf("the group failed first");
  const disposal = res.stderr.indexOf("the compiler had already exited");
  expect(run).toBeGreaterThan(-1);
  expect(disposal).toBeGreaterThan(run);
  // each error keeps its own stack
  expect(res.stderr.match(/^ {4}at /gmu)?.length).toBeGreaterThanOrEqual(2);
});
