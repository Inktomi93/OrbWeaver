// The one home of the real process seams: wall timers, the business PRNG, the dice CSPRNG, the id source and the
// opaque nonce. Every composition root that is not a test passes these; the root itself never defaults one.

import { randomInt, randomUUID } from "node:crypto";
import { createIdSource } from "@orb/kit/ids";
import { systemTimers } from "#infra/timers";
import type { ServicesDeps } from "./services.ts";

/** The seams {@link createServices} requires instead of reading the ambient process. */
export type ProcessSeams = Pick<ServicesDeps, "timers" | "random" | "randomInt" | "idSource" | "newOpaqueId">;

/** The real process seams for a production or script composition; a test root supplies seeded ones instead. */
export function createProcessSeams(): ProcessSeams {
  return {
    timers: systemTimers,
    random: Math.random,
    randomInt: (max) => randomInt(max),
    idSource: createIdSource(),
    newOpaqueId: randomUUID,
  };
}
