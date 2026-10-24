// The one home of the real process seams: timers, monotonic clock, PRNGs, ids, nonce, the physical network and this
// process's parsed env record, which carries the machine's container posture and name. Every non-test root passes these; the root never defaults one. Exempt: observability's
// `middleware.ts` and `debug/bug-report.ts` read `performance.now` (measurements); `logger.ts` still builds the process logger from the process env at module init for the sites item 1271 has not moved to the root's `logger`.

import { randomInt, randomUUID } from "node:crypto";
import { createIdSource } from "@orb/kit/ids";
import { authModeSource, env, hostEnvAllowlist } from "#foundation/env";
import { createLogger } from "#foundation/observability";
import { systemConnector, systemFetch, systemResolver } from "#infra/network";
import { systemTimers } from "#infra/timers";
import type { ServicesDeps } from "./services.ts";

/** The seams {@link createServices} requires instead of reading the ambient process. */
export type ProcessSeams = Pick<
  ServicesDeps,
  | "timers"
  | "monotonicNow"
  | "random"
  | "randomInt"
  | "idSource"
  | "newOpaqueId"
  | "buildConnector"
  | "networkExecution"
  | "env"
  | "hostEnvAllowlist"
  | "authModeSource"
  | "logger"
>;

/** The real process seams for a production or script composition; a test root supplies seeded ones instead. */
export function createProcessSeams(): ProcessSeams {
  return {
    timers: systemTimers,
    monotonicNow: () => performance.now(),
    random: Math.random,
    randomInt: (max) => randomInt(max),
    idSource: createIdSource(),
    newOpaqueId: randomUUID,
    buildConnector: systemConnector,
    networkExecution: { fetch: systemFetch, resolver: systemResolver },
    env,
    hostEnvAllowlist,
    authModeSource: authModeSource(),
    logger: createLogger(env.LOG_LEVEL),
  };
}
