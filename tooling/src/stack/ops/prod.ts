// stack-prod: the PRODUCTION half of `pnpm stack`.
//
//   pnpm stack up prod [--debug] [--build]      boot production, detached, verified by INSTANCE IDENTITY
//   pnpm stack up-fg prod [--debug] [--build]   the production server in the FOREGROUND (this terminal)
//   pnpm stack down prod                        SIGTERM → watch the bounded drain → confirm gone
//   pnpm stack restart prod [--debug] [--build]
//   pnpm stack status prod
//
// Every trap the hand-rolled incantation carried is closed here: cwd (`.env` and `CLIENT_DIST_DIR` are
// cwd-relative, so the spawn cwd is DERIVED), a dead boot (prod throws at startup without
// packages/client/dist/index.html — checked BEFORE the old instance is stopped), identity (a health check
// validates the PORT, and a stale incumbent answers; see classifyInstance in lib/identity.ts), and `.env`
// editing (`--debug` arms the debug knobs as a spawn-time env OVERLAY; the file is never written).
//
// NO SERVER BUILD STEP: node 26 runs `packages/server/src/entry/index.ts` directly (type stripping).
// `--build` builds only the CLIENT bundle, through @orb/client's own `vite build` script.
import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ExitCode } from "../../_shared/exit-contract.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { warn } from "../../_shared/log.ts";
import type { StackInvocation } from "../contract/types.ts";
import { doDown, doStatus } from "./prod-down.ts";
import { DEFAULT_LOG_LINES, tailLog } from "./prod-support.ts";
import { doRestart, doUp, doUpFg } from "./prod-up.ts";

refuseDirectInvocation(import.meta.url, "pnpm stack <verb> prod");

/** The prod launcher's whole dispatch over an already-parsed invocation. */
export async function runStackProd(invocation: StackInvocation): Promise<ExitCode> {
  switch (invocation.verb) {
    case "up":
      return await doUp(invocation);
    case "up-fg":
      return await doUpFg(invocation);
    case "down":
      return await doDown();
    case "restart":
      return await doRestart(invocation);
    case "status":
      return await doStatus();
    case "logs":
      print(tailLog(Number(invocation.rest[0] ?? DEFAULT_LOG_LINES)).trimEnd());
      return EXIT.clean;
    // The parser refuses `_leader prod` before this switch, so this case is unreachable HERE, not
    // undefined. Spelled as its own case so a NEW verb fails the compile instead of landing on misuse.
    case "_leader":
      warn("stack[prod]: `_leader` is a dev-only verb — prod has no leader");
      return EXIT.misuse;
  }
}
