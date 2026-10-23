// The one home of the real process seams: wall timers, the monotonic clock, the business PRNG, the dice CSPRNG, the
// id source, the opaque nonce, and the physical network (dial, fetch, DNS). Every non-test root passes these; the
// root never defaults one.

import { randomInt, randomUUID } from "node:crypto";
import { createIdSource } from "@orb/kit/ids";
import { systemConnector, systemFetch, systemResolver } from "#infra/network";
import { systemTimers } from "#infra/timers";
import type { ServicesDeps } from "./services.ts";

/** The seams {@link createServices} requires instead of reading the ambient process. */
export type ProcessSeams = Pick<
  ServicesDeps,
  "timers" | "monotonicNow" | "random" | "randomInt" | "idSource" | "newOpaqueId" | "buildConnector" | "networkExecution"
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
  };
}
