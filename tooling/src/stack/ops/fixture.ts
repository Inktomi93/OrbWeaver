// `pnpm fixture`: the dev stack as a real two-human deployment beside the operator's own, then the seed
// that mints the second account. An env recipe over the dev verbs, never a second supervisor.
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { print, REPO_ROOT } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ExitCode } from "../../_shared/exit-contract.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { runNicedSync } from "../../_shared/proc.ts";
import { inheritedProcessEnv } from "../../_shared/process-env.ts";
import type { FixtureVerb, StackContext } from "../contract/types.ts";
import { FIXTURE_DIR_REL, fixtureEnv } from "../lib/fixture-plan.ts";
import { stackContext } from "../lib/stack-plan.ts";
import { doDevDown } from "./dev-down.ts";
import { doDevStatus } from "./dev-status.ts";
import { doDevUp } from "./dev-up.ts";

refuseDirectInvocation(import.meta.url, "pnpm fixture <verb>");

const SEED_CLI_REL = join("tooling", "src", "seed", "cli.ts");
const IDLE_INVOCATION = { verb: "up", mode: "dev", debug: false, build: false, force: false, rest: [] } as const;

function log(message: string): void {
  print(`fixture: ${message}`);
}

/** The fixture's context: the recipe over the ambient env, and no `.env` (the recipe says so). */
function fixtureContext(): StackContext {
  return stackContext(REPO_ROOT, { ...inheritedProcessEnv(), ...fixtureEnv(REPO_ROOT, inheritedProcessEnv()) }, null);
}

function seed(ctx: StackContext): ExitCode {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(ctx.ambient)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  const res = runNicedSync(process.execPath, [join(ctx.repoRoot, SEED_CLI_REL), "multi-user"], { cwd: ctx.repoRoot, env, stdio: "inherit" });
  return res.status === 0 ? EXIT.clean : EXIT.violations;
}

async function up(ctx: StackContext): Promise<ExitCode> {
  mkdirSync(join(ctx.repoRoot, FIXTURE_DIR_REL, "assets"), { recursive: true });
  mkdirSync(ctx.runDir, { recursive: true });
  log(`booting the two-human stack on :${String(ctx.ports.server)}/:${String(ctx.ports.vite)} (data under ${FIXTURE_DIR_REL})…`);
  const booted = await doDevUp(ctx, IDLE_INVOCATION);
  if (booted !== EXIT.clean) {
    log("stack failed to start — see the RESULT line above (something else owns the ports? set FIXTURE_PORT/FIXTURE_VITE_PORT).");
    return booted;
  }
  log("stack healthy — seeding LOCAL_MULTI_USER + the member account…");
  return seed(ctx);
}

export async function runFixture(verb: FixtureVerb): Promise<ExitCode> {
  const ctx = fixtureContext();
  switch (verb) {
    case "up":
      return await up(ctx);
    case "seed":
      return seed(ctx);
    case "down":
      return await doDevDown(ctx);
    case "status":
      return await doDevStatus(ctx);
    case "reset": {
      const down = await doDevDown(ctx);
      if (down !== EXIT.clean) {
        return down;
      }
      rmSync(join(ctx.repoRoot, FIXTURE_DIR_REL), { recursive: true, force: true });
      log(`reset — deleted ${FIXTURE_DIR_REL} (the next 'up' is a fresh two-human box)`);
      return EXIT.clean;
    }
  }
}
