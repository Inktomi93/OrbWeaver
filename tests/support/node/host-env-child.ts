// Reads the agent child-env baseline from the production process env module in its own process, around the boot's
// secret scrub, and prints what each read held. The scrub deletes from `process.env`, so a case needs a fresh process.

import process from "node:process";
import { hostEnvAllowlist, scrubAppSecretsFromProcessEnv } from "@orb/server/foundation/env";

const [secret, marker] = process.argv.slice(2);
if (secret === undefined || marker === undefined) {
  throw new Error("usage: host-env-child.ts <app secret key> <marker key>");
}
const before = hostEnvAllowlist();
const held = { secret: Object.hasOwn(before, secret), marker: Object.hasOwn(before, marker) };
// A caller that edits the baseline it was handed must not reach this process's own environment, which the next read shows.
const edited = Reflect.deleteProperty(before, marker);
const markerAfterEdit = Object.hasOwn(hostEnvAllowlist(), marker);
scrubAppSecretsFromProcessEnv();
const after = hostEnvAllowlist();
process.stdout.write(
  JSON.stringify({ held, edited, markerAfterEdit, afterScrub: { secret: Object.hasOwn(after, secret), marker: Object.hasOwn(after, marker) } }),
);
