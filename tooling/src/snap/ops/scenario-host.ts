// A scenario normally owns its browser lifetime; matrix-on-session supplies a disposable context instead,
// so the same capture engine can finish or fail without ever closing the daemon's owner browser.
import { closeProbeSessionAfterError } from "../../_shared/browser.ts";
import type { ProbeSession } from "../../_shared/browser-contract.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { FailureArtifacts } from "../contract/run.ts";
import type { Args } from "../contract/types.ts";
import { finishSession, launchSnapSession } from "./session.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --scenario <file>");

export interface ScenarioHost {
  readonly session: ProbeSession;
  readonly finish: (red: boolean, name: string, enabled: boolean) => Promise<FailureArtifacts>;
}

export async function scenarioSession(first: Args, host: ScenarioHost | null): Promise<ProbeSession> {
  return host === null ? await launchSnapSession(first) : host.session;
}

export async function finishScenarioSession(
  session: ProbeSession,
  host: ScenarioHost | null,
  finish: { readonly red: boolean; readonly name: string; readonly enabled: boolean },
): Promise<FailureArtifacts> {
  return host === null ? await finishSession(session, finish.red, finish.name, finish.enabled) : await host.finish(finish.red, finish.name, finish.enabled);
}

export async function scenarioFailure(session: ProbeSession, host: ScenarioHost | null, error: unknown): Promise<never> {
  if (host !== null) {
    throw error;
  }
  return await closeProbeSessionAfterError(session, error);
}
