// The one dispatch behind `pnpm stack`, `pnpm start`, `pnpm share` and `pnpm fixture`: parse, build the
// stack's context from the ambient env, and hand the verb to its op.
import { REPO_ROOT } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ExitCode } from "../../_shared/exit-contract.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { warn } from "../../_shared/log.ts";
import { inheritedProcessEnv } from "../../_shared/process-env.ts";
import type { StackContext, StackInvocation } from "../contract/types.ts";
import { parseStackCommand, STACK_USAGE } from "../lib/argv.ts";
import { envFilePath, readEnvText } from "../lib/env-file.ts";
import { stackContext } from "../lib/stack-plan.ts";
import { doDevDown } from "./dev-down.ts";
import { doDevLogs, doDevStatus } from "./dev-status.ts";
import { doDevRestart, doDevUp, doDevUpFg } from "./dev-up.ts";
import { runFixture } from "./fixture.ts";
import { runLeader } from "./leader.ts";
import { runStackProd } from "./prod.ts";
import { runServedProbe } from "./served-probe.ts";
import { runStart } from "./start.ts";

refuseDirectInvocation(import.meta.url, "pnpm stack <verb>");

function devContext(): StackContext {
  return stackContext(REPO_ROOT, inheritedProcessEnv(), readEnvText(envFilePath(REPO_ROOT)));
}

async function runDevStack(invocation: StackInvocation): Promise<ExitCode> {
  const ctx = devContext();
  switch (invocation.verb) {
    case "up":
      return await doDevUp(ctx, invocation);
    case "up-fg":
      return await doDevUpFg(ctx, invocation);
    case "down":
      return await doDevDown(ctx);
    case "restart":
      return await doDevRestart(ctx, invocation);
    case "status":
      return await doDevStatus(ctx);
    case "logs":
      return doDevLogs(ctx, invocation.rest);
    case "_leader":
      return (await runLeader(ctx, { record: true })) as ExitCode;
  }
}

/** `pnpm stack`'s whole dispatch. argv is without the node/script prefix. */
export async function runStack(argv: readonly string[]): Promise<number> {
  const parsed = parseStackCommand(argv);
  if (!parsed.ok) {
    warn(`stack: ${parsed.error}\n${STACK_USAGE}`);
    return EXIT.misuse;
  }
  const command = parsed.command;
  switch (command.kind) {
    case "start":
      return await runStart(command.argv);
    case "fixture":
      return await runFixture(command.verb);
    case "served-probe":
      return await runServedProbe(undefined, devContext().ports.vite);
    case "stack":
      return command.invocation.mode === "prod" ? await runStackProd(command.invocation) : await runDevStack(command.invocation);
  }
}
