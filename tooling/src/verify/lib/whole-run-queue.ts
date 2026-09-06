// THE HOST-WIDE WHOLE-RUN QUEUE (#1835). Two whole `pnpm check` / `pnpm verify` runs on one box is never
// faster than one after the other — they are both CPU-saturating, so running them concurrently just makes
// each one's wall clock the sum plus contention, while flaking every load-sensitive stage. A WHOLE run
// therefore takes a host-wide slot and WAITS. The artifact isolation (#1029) already made concurrent runs
// SAFE; this makes them SERIAL.
//
// A SCOPED run (`--changed`/`--scope`/`--file`/`--package`) does NOT queue: it is the fast inner loop, it
// is what a lane runs while another lane's battery is live, and making it wait behind a 17-minute `--push`
// would be the change that gets this whole mechanism switched off.
//
// IT NEVER REFUSES — a refused verify breaks a merge train (the pool's own header, ./host-slots.ts). The
// queue applies under `ORB_DEDICATED_BOX=1` too (`wholeVerifyQueue` is true in BOTH profiles), because
// "the box is mine" does not make two simultaneous batteries a good idea.
//
// Lives in lib/ rather than in ops/run.ts because run.ts is the tier orchestrator and sits against the
// tooling-size cap; this is one self-contained decision with one seam.
import process from "node:process";
import { checkoutName } from "@orb/tooling/_shared/artifacts";
import { readConcurrencyProfile } from "@orb/tooling/_shared/concurrency-profile";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import type { HostSlotLease, HostSlotPool } from "../contract/host-slots.ts";
import type { HostSlotDeps } from "./host-slots.ts";
import { acquireHostSlot } from "./host-slots.ts";
import type { Parsed } from "./run-argv.ts";

refuseDirectInvocation(import.meta.url, "pnpm check (or pnpm verify [--push|--full])");

/** A whole `--push` run is ~17 minutes and `--full` is longer, so a second run legitimately waits a long
 *  time. This QUIET-BOX base is load-scaled at acquire time; past it the pool degrades to uncapped rather
 *  than refusing. */
const VERIFY_QUEUE_WAIT_BASE_MS = 2_700_000; // 45 minutes

/** Take the whole-run slot, or `null` when this run is exempt (scoped, or the profile turned the queue
 *  off). The caller releases in a `finally`.
 *
 *  `deps` exists for the tests: they drive this with their own runtime dir and process table, never the
 *  REAL host pool, where a planted holder would block an operator's live `pnpm check`. */
export async function enterWholeRunQueue(root: string, parsed: Parsed, deps: HostSlotDeps = {}): Promise<HostSlotLease | null> {
  if (parsed.selection !== undefined || !readConcurrencyProfile().wholeVerifyQueue) {
    return null;
  }
  const pool: HostSlotPool = { name: "verify", label: `${parsed.tier} ${checkoutName(root)}`, slots: 1, waitBaseMs: VERIFY_QUEUE_WAIT_BASE_MS };
  const lease = await acquireHostSlot(pool, {
    onQueued: (holder) => process.stderr.write(`[verify] verify: queued behind pid ${String(holder.pid)} since ${holder.startedAt} (${holder.label})\n`),
    onNotice: (message) => process.stderr.write(`[verify] ${message}\n`),
    ...deps,
  });
  process.stderr.write("[verify] verify: lock held; starting\n");
  return lease;
}
