// Printable session refusal contracts: ownership, capacity, liveness, stage death, and boot-only argv.
import type { SessionRow, SessionStageState } from "../contract/session.ts";
import { describeStageAgePhrase } from "./stage-plan.ts";

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60_000;

export function foreignSessionRefusal(row: SessionRow, nowMs: number): string {
  return (
    `SESSION REFUSED  ${row.name} is owned by ANOTHER checkout — ${row.ownerCheckout} (daemon pid ${row.daemonPid}, ` +
    `last used ${describeStageAgePhrase(row.lastUsedAt, nowMs)}). A session's browser is private to its lane (F4): wait for it, ` +
    "boot your own under a different name, or tear theirs down deliberately with `pnpm snap --session-close " +
    `${row.name} --force\` (it kills THEIR run) — tooling/src/snap/lib/session-plan.ts.`
  );
}

export function sessionCapRefusal(name: string, live: readonly SessionRow[], cap: number, nowMs: number): string {
  const rows = live.map(
    (row) => `  ${row.name}  owner ${row.ownerCheckout} · pid ${row.daemonPid} · last used ${describeStageAgePhrase(row.lastUsedAt, nowMs)}`,
  );
  return [
    `SESSION REFUSED  cannot boot ${name}: ${live.length} session(s) are live and the cap is ${cap} (ORB_SESSION_CAP) — nothing was measured.`,
    ...rows,
    "  Close one you own (`pnpm snap --session-close <name>`), reap the idle/dead ones (`pnpm snap --session-sweep`), or wait —",
    "  tooling/src/snap/lib/session-plan.ts.",
  ].join("\n");
}

function describeOpAge(ageMs: number): string {
  const minutes = Math.round(ageMs / MS_PER_MINUTE);
  return minutes === 0 ? `${Math.round(ageMs / MS_PER_SECOND)}s` : `${minutes}m`;
}

export function sessionBusyRefusal(name: string, op: string, ageMs: number): string {
  return (
    `SESSION BUSY  ${name} is mid-\`${op}\` (${describeOpAge(ageMs)} in) — ` +
    "one request at a time per session: two callers driving one page is the shared-tab defect wearing a socket. Wait for it or use another name — tooling/src/snap/lib/session-plan.ts."
  );
}

export function sessionStageDeadRefusal(name: string, stage: SessionStageState): string {
  return [
    `STAGE DEAD     session ${name}'s band ${stage.band} died at ${stage.detectedAt ?? "an unknown time"} during \`${stage.op ?? "unknown op"}\` — nothing was measured.`,
    `               remedies: \`pnpm snap --stage-sweep\` frees the dead band; close and reboot the session with \`pnpm snap --session-close ${name}\` then \`pnpm snap --session ${name} …\` — tooling/src/snap/lib/session-plan.ts`,
  ].join("\n");
}

export function sessionDeadText(row: SessionRow, detail: string): string {
  const mid = row.inflightOp === null ? `idle since ${row.lastUsedAt} (last op ${row.lastOp ?? "none"})` : `mid-\`${row.inflightOp}\``;
  return [
    `SESSION DEAD   ${row.name} died ${mid} (daemon pid ${row.daemonPid} gone; ${detail})`,
    `               remedies: \`pnpm snap --session-sweep\` reaps the browser group + clears the marker; re-run \`--session ${row.name} …\` to reboot — tooling/src/snap/lib/session-plan.ts`,
  ].join("\n");
}

export function neverNavigatedRefusal(name: string): string {
  return `ARG ERROR    session ${name} has never navigated — a call with no route and no --file drives the LIVE page, and there is none yet; name a route (or --file <html>) on this call`;
}

export function cascadeNotBootedRefusal(name: string): string {
  return `ARG ERROR    --cascade needs the DevTools-SDK runtime, which is a launch property: session ${name} booted without it — close it and reboot with --cascade on the first call`;
}

export function sessionOnlyFlagsRefusal(name: string, flags: readonly string[]): string {
  return `ARG ERROR    ${flags.join(" ")} name(s) a property of the session's browser lifetime and only the boot call may set it; session ${name} is already up — close it (\`pnpm snap --session-close ${name}\`) and reboot with the flag, or drop it`;
}
