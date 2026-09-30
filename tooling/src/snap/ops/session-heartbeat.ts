// The stateful-session heartbeat shared by daemon calls and sibling attach leases. A heartbeat is one
// interaction through the substrate, so it stamps BOTH the session row and its bound stage row (§3.6).
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { SessionRow } from "../contract/session.ts";
import { writeRow } from "./session-registry.ts";
import { touchRow as touchStageBand } from "./stage-marker.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --session <name> <route>");

export interface SessionHeartbeatState {
  readonly home: string;
  readonly stageHome: string;
  readonly stageBand: number | null;
  row: SessionRow;
}

export function touchSessionHeartbeat(state: SessionHeartbeatState, patch: Partial<SessionRow> = {}, nowIso: string = new Date().toISOString()): void {
  state.row = { ...state.row, ...patch, lastUsedAt: nowIso };
  writeRow(state.home, state.row);
  if (state.stageBand !== null) {
    touchStageBand(state.stageHome, state.stageBand, nowIso, state.row.ownerCheckout);
  }
}
