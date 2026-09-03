// The front-door resolution a SIBLING instrument's `--session <name>` calls (#1285,
// docs/design/1208-instrument-substrate.md §3.4/§5): the ownership/liveness verdict has ONE home
// (lib/session-plan.ts `sessionAccess`) — this module converts that verdict into either an attach target
// (endpoint + the environment `attachProbeSession` should declare) or a printable refusal, so
// design-audit/motion-audit/perf-meter/record never re-derive the F4 rules or read the registry directly.
// Exported through `snap/index.ts` (the ONLY door — `tooling-front-door` refuses a sibling importing
// `ops/**`); never call browser.ts's `chromium.connectOverCDP` here — gate arm H keeps that ONE call in
// `_shared/browser.ts`, this module only decides WHETHER a caller may reach it and with what endpoint.

import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { SessionAttachRefusal, SessionAttachResolution, SessionRow } from "../contract/session.ts";
import { foreignSessionRefusal, sessionAccess, sessionDeadText } from "../lib/session-plan.ts";
import { readRow, rowIsLive, sessionRegistryHome } from "./session-registry.ts";
import { repoRoot } from "./stage-git.ts";

refuseDirectInvocation(import.meta.url, "pnpm design-audit --session <name> <route>");

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

/** Resolve a `--session <name>` attach for a sibling instrument, driven from its OWN process (§9's
 *  rejected alternative is the daemon executing sibling ops — this function only judges access; the
 *  attach itself happens in the caller through `attachProbeSession`, per gate arm H). */
export function resolveSessionAttach(name: string): SessionAttachResolution {
  const root = repoRoot();
  const home = sessionRegistryHome(root);
  const row = readRow(home, name);
  const live = row !== null && rowIsLive(row);
  const access = sessionAccess({ row, live, callerCheckout: root });
  if (access === "absent") {
    return absentRefusal(name);
  }
  if (access === "reclaim") {
    return { ok: false, message: sessionDeadText(row as SessionRow, "attach") };
  }
  if (access === "refuse") {
    return { ok: false, message: foreignSessionRefusal(row as SessionRow, Date.now()) };
  }
  const liveRow = row as SessionRow;
  if (liveRow.cdpEndpoint === null) {
    return noEndpointRefusal(name);
  }
  const { environment } = liveRow;
  return {
    ok: true,
    row: liveRow,
    endpoint: liveRow.cdpEndpoint,
    environment: {
      viewport: environment.viewport,
      device: environment.device,
      colorScheme: environment.colorScheme,
      reducedMotion: environment.reducedMotion,
      ...(environment.deviceScaleFactor === null ? {} : { deviceScaleFactor: environment.deviceScaleFactor }),
    },
  };
}
