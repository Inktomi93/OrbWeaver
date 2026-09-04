// The front-door resolution a SIBLING instrument's `--session <name>` calls (#1285,
// docs/design/1208-instrument-substrate.md §3.4/§5): the ownership/liveness verdict has ONE home
// (lib/session-plan.ts `sessionAccess`) — this module converts that verdict into either an attach target
// (endpoint + the environment `attachProbeSession` should declare) or a printable refusal, so
// design-audit/motion-audit/perf-meter/record never re-derive the F4 rules or read the registry directly.
// Exported through `snap/index.ts` (the ONLY door — `tooling-front-door` refuses a sibling importing
// `ops/**`); never call browser.ts's `chromium.connectOverCDP` here — gate arm H keeps that ONE call in
// `_shared/browser.ts`, this module only decides WHETHER a caller may reach it and with what endpoint.

import process from "node:process";
import { errorMessage } from "@orb/kit/error-message";
import { attachProbeSession } from "../../_shared/browser.ts";
import type { ProbeAttachOptions, ProbeSession } from "../../_shared/browser-contract.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type {
  SessionAttachLease,
  SessionAttachRefusal,
  SessionAttachResolution,
  SessionAttachTarget,
  SessionRequest,
  SessionRow,
} from "../contract/session.ts";
import { SESSION_PROTOCOL_VERSION } from "../contract/session.ts";
import { sessionAccess } from "../lib/session-plan.ts";
import { foreignSessionRefusal, sessionDeadText } from "../lib/session-refusals.ts";
import { sessionRequest } from "./session-client.ts";
import { readRow, rowIsLive, sessionRegistryHome } from "./session-registry.ts";
import { repoRoot } from "./stage-git.ts";

refuseDirectInvocation(import.meta.url, "pnpm design-audit --session <name> <route>");

const ATTACH_HEARTBEAT_MIN_MS = 50;
const ATTACH_HEARTBEAT_MAX_MS = 10_000;
const ATTACH_HEARTBEATS_PER_TTL = 3;

function noEndpointRefusal(name: string): SessionAttachRefusal {
  return {
    ok: false,
    message: `SESSION REFUSED  ${name} has no debugging endpoint yet — the boot call has not finished launching; try again in a moment.`,
  };
}

function absentRefusal(name: string): SessionAttachRefusal {
  return {
    ok: false,
    message: `SESSION REFUSED  no session named ${name} — boot it first with \`pnpm snap --session ${name} <route>\` (docs/design/1208-instrument-substrate.md §4.4).`,
  };
}

/** Keep a sibling instrument's attached browser and bound stage live from its OWN process (§9's
 *  rejected alternative is the daemon executing sibling ops). The daemon remains the heartbeat door;
 *  the caller reaches CDP only through `attachResolvedSession` and `_shared/browser.ts`, per gate arm H. */
export async function beginSessionAttachLease(row: SessionRow, root: string): Promise<SessionAttachLease> {
  const request: SessionRequest = {
    v: SESSION_PROTOCOL_VERSION,
    kind: "ping",
    runId: "",
    slotDir: "",
    argv: [],
    cwd: process.cwd(),
    checkout: root,
    boot: false,
    force: false,
    exportOut: null,
  };
  let failure: Error | null = null;
  let pending = Promise.resolve();
  const heartbeat = async (): Promise<Error | null> => {
    // @orb-gate-ignore caught-failure-ownership(empty:error): the recurring timer cannot throw to an awaiter, so the caught cause is returned to the caller and retained for `close()` to throw into ProbeSession cleanup. Ends if cleanup stops awaiting the lease or this catch stops returning the cause.
    try {
      const exit = await sessionRequest(row.socket, request, () => undefined);
      if (exit !== 0) {
        throw new Error(`heartbeat exited ${exit}`);
      }
      return null;
    } catch (error) {
      return new Error(`SESSION HEARTBEAT FAILED  ${row.name}: ${errorMessage(error)}`, { cause: error });
    }
  };
  failure = await heartbeat();
  if (failure !== null) {
    throw failure;
  }
  const timer = setInterval(
    () => {
      pending = pending.then(async () => {
        const nextFailure = await heartbeat();
        if (nextFailure !== null) {
          failure = nextFailure;
        }
      });
    },
    Math.max(ATTACH_HEARTBEAT_MIN_MS, Math.min(ATTACH_HEARTBEAT_MAX_MS, Math.floor(row.ttlMs / ATTACH_HEARTBEATS_PER_TTL))),
  );
  return {
    close: async (): Promise<void> => {
      clearInterval(timer);
      await pending;
      if (failure !== null) {
        throw failure;
      }
    },
  };
}

export async function resolveSessionAttach(name: string): Promise<SessionAttachResolution> {
  const root = repoRoot();
  const home = sessionRegistryHome(root);
  const row = readRow(home, name);
  const live = row !== null && rowIsLive(row);
  const access = sessionAccess({ row, live, callerCheckout: root });
  if (access === "absent") {
    return absentRefusal(name);
  }
  if (row === null) {
    return { ok: false, message: `SESSION REFUSED  ${name}: registry access resolved ${access} without a row` };
  }
  if (access === "reclaim") {
    return { ok: false, message: sessionDeadText(row, "attach") };
  }
  if (access === "refuse") {
    return { ok: false, message: foreignSessionRefusal(row, Date.now()) };
  }
  const liveRow = row;
  if (liveRow.cdpEndpoint === null) {
    return noEndpointRefusal(name);
  }
  const { environment } = liveRow;
  return {
    ok: true,
    row: liveRow,
    endpoint: liveRow.cdpEndpoint,
    environment: sessionProbeAttachOptions(environment),
    lease: await beginSessionAttachLease(liveRow, root),
  };
}

export function sessionProbeAttachOptions(environment: SessionRow["environment"]): ProbeAttachOptions {
  return {
    viewport: environment.viewport,
    device: environment.device,
    colorScheme: environment.colorScheme,
    reducedMotion: environment.reducedMotion,
    contrast: environment.contrast,
    reducedTransparency: environment.reducedTransparency,
    ...(environment.deviceScaleFactor === null ? {} : { deviceScaleFactor: environment.deviceScaleFactor }),
  };
}

/** Attach through the one browser door and bind the heartbeat lease to ordinary ProbeSession cleanup. */
export async function attachResolvedSession(target: SessionAttachTarget, overrides: Partial<ProbeAttachOptions> = {}): Promise<ProbeSession> {
  try {
    const attached = await attachProbeSession(target.endpoint, { ...target.environment, ...overrides });
    return { ...attached, cleanup: [...(attached.cleanup ?? []), target.lease.close] };
  } catch (error) {
    await target.lease.close();
    throw error;
  }
}
