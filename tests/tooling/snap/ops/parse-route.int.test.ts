// The route section check follows a session's real target: a session bound to a fixture HTTP server takes
// file routes on later calls, and a session booting on the default orb base still refuses an unknown
// section before any daemon boots.
//
// @instrument-proof: a later `--session <name> /other.html` call on a fixture-bound session exited 3 as an
// "unknown section" because the parse judged the default base, not the session's binding.
import { createServer } from "node:http";
import { join } from "node:path";
import process from "node:process";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { HOST_POOL_ROOT_ENV } from "@orb/tooling/_shared/host-slots";
import { vi } from "vitest";
import type { CliResult } from "../../../support/tool-fixtures.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const CASE_BUDGET_MS = scaledBudget(120_000, 4);
const CLI_BUDGET_MS = scaledBudget(60_000, 4);
vi.setConfig({ testTimeout: CASE_BUDGET_MS, hookTimeout: CASE_BUDGET_MS });

const FIXTURE_HTML =
  '<!doctype html><html lang="en" data-app-ready="settled"><head><meta charset="utf-8"><title>fixture</title></head><body><main>fixture</main><script>globalThis.__orb={consoleErrors:()=>({records:[],dropped:0,cap:128}),resetEvidence:()=>{}}</script></body></html>';
const PATHNAME_EVAL = "location.pathname";
const QUIET = ["--no-shot"];
/** Boot-only: `--no-failure-evidence` is a browser-lifetime flag a later session call may not carry. */
const BOOT_QUIET = [...QUIET, "--no-failure-evidence"];

async function fixtureServer(): Promise<{ readonly base: string; readonly close: () => Promise<void> }> {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(FIXTURE_HTML);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("fixture server did not bind a TCP port");
  }
  return {
    base: `http://127.0.0.1:${address.port}`,
    close: async () => await new Promise<void>((resolve, reject) => server.close((error) => (error === undefined ? resolve() : reject(error)))),
  };
}

test("a fixture-bound session takes file routes on later calls; a default-base session still refuses an unknown section", async ({ plantedTree, runCli }) => {
  const fixture = await fixtureServer();
  const root = await plantedTree({ "registry/.keep": "" });
  const env = Object.fromEntries([
    ["ORB_SNAP_SESSION_HOME", join(root, "registry")],
    [HOST_POOL_ROOT_ENV, join(root, "host-slots")],
  ]);
  const snap = (args: readonly string[]): Promise<CliResult> => runCli("snap", args, { env, timeoutMs: CLI_BUDGET_MS });
  const bound = `p-route-bound-${process.pid}`;
  const orb = `p-route-orb-${process.pid}`;
  try {
    const boot = await snap(["--session", bound, "--base", fixture.base, "/start.html", "--eval", PATHNAME_EVAL, ...BOOT_QUIET]);
    await expect(boot).toExitWith(EXIT.clean);
    expect(boot.stdout).toContain("/start.html");

    const later = await snap(["--session", bound, "/other.html", "--eval", PATHNAME_EVAL, ...QUIET]);
    await expect(later).toExitWith(EXIT.clean);
    expect(later.stdout).toContain("/other.html");
    expect(later.stdout).not.toContain("unknown section");

    const refused = await snap(["--session", orb, "/settings", ...BOOT_QUIET]);
    await expect(refused).toExitWith(EXIT.misuse);
    expect(refused.stdout).toContain('unknown section "settings"');
    expect(refused.stdout, "the refusal must land before a daemon boots").not.toContain("booting");
  } finally {
    await snap(["--session-close", bound]);
    await snap(["--session-close", orb]);
    await snap(["--session-sweep"]);
    await fixture.close();
  }
});
