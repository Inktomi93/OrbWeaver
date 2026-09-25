// A HEALTH CHECK VALIDATES THE PORT, NOT YOUR PROCESS. A stale incumbent answers `/healthz` happily.
// Adopt/stop decisions therefore need an INSTANCE IDENTITY: the pid the port's listener actually belongs
// to (or `/api/_debug/info`'s `pid` when the debug surface is armed), matched against the pidfile record.
import type { InstanceClassification, ObservedInstance, ProdRecord, UpAction } from "../contract/types.ts";

/** THE identity decision — [[health-check-validates-the-port-not-your-process]] in code.
 *
 *  Order matters: the harness stamp is checked FIRST (a battery-owned stack must be untouchable even if
 *  something about our record coincidentally matched), then pid identity. */
export function classifyInstance(opts: {
  readonly record: ProdRecord | null;
  readonly observed: ObservedInstance;
  /** Is the recorded pid still a live process? (`process.kill(pid, 0)`) */
  readonly recordProcessAlive: boolean;
}): InstanceClassification {
  const { record, observed } = opts;
  if (observed.harness === true) {
    return {
      verdict: "harness",
      reason: "the port is held by a Playwright harness stack (/healthz reports harness:true) — never adopted, never stopped by this tool",
    };
  }
  if (observed.listenerPid === null && !observed.healthy) {
    return { verdict: "absent", reason: "nothing is listening on the port" };
  }
  if (record === null) {
    return { verdict: "foreign", reason: `the port is held by pid ${observed.listenerPid ?? "?"} and there is no prod pidfile — this tool did not start it` };
  }
  if (!opts.recordProcessAlive) {
    return observed.listenerPid === null
      ? { verdict: "absent", reason: `the recorded pid ${record.pid} is gone and nothing holds the port — stale pidfile` }
      : {
          verdict: "foreign",
          reason: `the recorded pid ${record.pid} is gone but pid ${observed.listenerPid} holds the port — a different process took it`,
        };
  }
  if (observed.listenerPid !== null && observed.listenerPid !== record.pid) {
    return { verdict: "foreign", reason: `the port is held by pid ${observed.listenerPid}, but our record says pid ${record.pid}` };
  }
  return observed.healthy
    ? { verdict: "ours-healthy", reason: `pid ${record.pid} verified by identity and answering /healthz` }
    : { verdict: "ours-unhealthy", reason: `pid ${record.pid} is alive but /healthz is not answering (still booting, or wedged)` };
}

/** `up` on an already-verified-healthy instance is a NO-OP REPORT, never a second spawn (the engines
 *  launcher paid for this exact class — a duplicate fleet that loaded models and served nothing). */
export function decideUp(classification: InstanceClassification): { readonly action: UpAction; readonly reason: string } {
  switch (classification.verdict) {
    case "ours-healthy":
      return { action: "adopt", reason: classification.reason };
    case "absent":
      return { action: "spawn", reason: classification.reason };
    // Enumerated, not `default:` — a NEW verdict must fail the compile here rather than silently
    // inheriting "refuse" (the §5.5 string-union dispatch law). All three refuse today for the same
    // reason: `up` never double-spawns onto a held port, and never touches a stack it did not start.
    case "ours-unhealthy":
    case "foreign":
    case "harness":
      return { action: "refuse", reason: classification.reason };
  }
}

/** `down`/`restart` may only signal an instance whose identity we PROVED. `ours-unhealthy` counts: a
 *  wedged instance of ours is exactly the thing an operator needs to be able to stop. */
export function decideDown(classification: InstanceClassification): { readonly action: "stop" | "noop" | "refuse"; readonly reason: string } {
  switch (classification.verdict) {
    case "ours-healthy":
    case "ours-unhealthy":
      return { action: "stop", reason: classification.reason };
    case "absent":
      return { action: "noop", reason: classification.reason };
    // Enumerated, not `default:` (§5.5) — a foreign holder and a harness stack are the two instances
    // this tool proved it does NOT own, and a new verdict must be decided here, not defaulted.
    case "foreign":
    case "harness":
      return { action: "refuse", reason: classification.reason };
  }
}
