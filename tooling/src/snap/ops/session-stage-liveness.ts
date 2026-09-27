import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { listeningPids } from "../../_shared/platform.ts";
import type { SessionRow } from "../contract/session.ts";
import { writeRow } from "./session-registry.ts";
import { stageBindingAlive } from "./stage-census.ts";
import { markStageDead } from "./stage-marker.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --session <name> <route>");

interface StageBoundSessionState {
  readonly home: string;
  readonly stageHome: string;
  row: SessionRow;
}

/** Sticky T4 death observation: once either stage half dies, both registries retain the first failure. */
export function observeSessionStageDeath(state: StageBoundSessionState, op: string): SessionRow["stage"] {
  const stage = state.row.stage;
  if (stage === null || stage === undefined || stage.status === "dead") {
    return stage;
  }
  const bound = listeningPids();
  if (bound.kind === "refused") {
    // The death mark is sticky, so only a table that was read may set it; an unreadable one observes nothing.
    print(`[snap-session] stage band ${String(stage.band)} liveness not observed at ${op} — ${bound.reason}`);
    return null;
  }
  if (stageBindingAlive(state.stageHome, stage.band, bound.value)) {
    return null;
  }
  const detectedAt = new Date().toISOString();
  const dead = { band: stage.band, status: "dead" as const, detectedAt, op };
  state.row = { ...state.row, stage: dead, lastUsedAt: detectedAt };
  writeRow(state.home, state.row);
  markStageDead(state.stageHome, stage.band, detectedAt, op);
  return dead;
}
