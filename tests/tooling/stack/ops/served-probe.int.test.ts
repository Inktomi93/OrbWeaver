import { createServer } from "node:http";
import { expect, test } from "@orb/testkit/tooling";
import { EXIT } from "@orb/tooling/floor/cli/exit-contract";
import type { ServedState } from "../../../../tooling/src/stack/index.ts";
import { runServedProbe } from "../../../../tooling/src/stack/ops/served-probe.ts";

const PLANTED_MODULE = "export const landedAfterTheWatcherDied = 42;\n";
const FS_PREFIX_RE = /^\/@fs/u;

/** Serve `body` for every module request, or a 404 for `null`, on a private port. */
async function withFakeVite(body: string | null, run: (port: number) => Promise<void>): Promise<void> {
  const server = createServer((req, res) => {
    const requested = decodeURIComponent((req.url ?? "").replace(FS_PREFIX_RE, "").split("?")[0] ?? "");
    if (body === null || !requested.endsWith("canary.ts")) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": "application/javascript" }).end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "localhost", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  try {
    await run(port);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("served probe returns tool-error when freshness cannot be measured", async () => {
  expect(await runServedProbe([])).toBe(EXIT.toolError);
});

// One case per ServedState: the verb's exit for the verdict a real probe reached.
test.for([
  ["fresh", PLANTED_MODULE, EXIT.clean],
  ["stale", "// the transform vite computed before the watcher died\n", EXIT.violations],
  ["unreachable", null, EXIT.toolError],
] as const satisfies readonly (readonly [ServedState, string | null, number])[])(
  "a %s served transform exits with its mapped code through the verb",
  async ([, served, exit], { plantedTree }) => {
    const root = await plantedTree({ "packages/ui/src/canary.ts": PLANTED_MODULE });
    await withFakeVite(served, async (port) => {
      expect(await runServedProbe([`${root}/packages/ui/src`], port)).toBe(exit);
    });
  },
);

test("an unverifiable module (no value export) exits tool-error, never clean", async ({ plantedTree }) => {
  const root = await plantedTree({ "packages/ui/src/canary.ts": "// declares nothing\n" });
  await withFakeVite("// a transform that differs from the disk bytes\n", async (port) => {
    expect(await runServedProbe([`${root}/packages/ui/src`], port)).toBe(EXIT.toolError);
  });
});
