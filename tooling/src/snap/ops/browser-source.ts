// Where one snap run's browser comes from. A one-shot CLI run launches its own Chromium and closes it at its
// finish (`LAUNCH_PER_RUN`). A host that already holds a Chromium, a session daemon's matrix cells or a snap host
// (`ops/host.ts`), gives each run a disposable isolated context instead (`contextsIn`): fresh storage, cookies,
// permissions, routes and init scripts, with the run's own viewport, device and media emulation.
//
// A context cannot change what its browser was launched with. A run that needs a launch-time provision the
// owner lacks (the DevTools SDK cascade profile, a debugging endpoint, a headed display) is refused as an
// INSTRUMENT ERROR, never run on a browser that silently differs from the one its own launch would build.
//
// The request ring is the one thing a context may share with its owner, and only when the caller says so: a session
// daemon's matrix cells record into the session's ring; a snap host's runs each get a ring of their own.
import { closeAfterError, closeProbeSession, closeProbeSessionAfterError } from "../../floor/browser/browser.ts";
import type { ProbeSession } from "../../floor/browser/browser-contract.ts";
import { instrumentRefusal } from "../../floor/browser/page-validate.ts";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import type { FailureArtifacts } from "../contract/run.ts";
import type { Args } from "../contract/types.ts";
import { armLaunchNeeds } from "./arms/registry.ts";
import type { ContextRingOwner } from "./session.ts";
import {
  cascadeRuntimeFor,
  finishSession,
  finishSnapContext,
  launchedHeadless,
  launchSnapSession,
  openSnapMatrixContext,
  publishesDebugging,
} from "./session.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

/** The browser one run captures in, and how the run gives it back. */
export interface RunBrowser {
  readonly session: ProbeSession;
  /** Settle failure evidence under `name` and release what this run owned. */
  readonly finish: (red: boolean, name: string, enabled: boolean) => Promise<FailureArtifacts>;
  /** Release after a throw; rethrows `error`, with any release failure joined to it. */
  readonly abandon: (error: unknown) => Promise<never>;
  /** Close what the run holds, from outside the run, so its pending browser work rejects and the run ends. */
  readonly abort: () => Promise<void>;
}

/** What a run asks of its browser beyond its own argv. */
interface RunBrowserNeeds {
  /** The appearance-invariant pass reads the DevTools SDK runtime with no `--cascade` flag asking for it. */
  readonly requireCascadeRuntime: boolean;
}

/** A source launches a browser per run, or hosts each run as a context of a browser that is already running. */
const BROWSER_SOURCE_KINDS = ["launch-per-run", "context-per-run"] as const;
export type BrowserSourceKind = (typeof BROWSER_SOURCE_KINDS)[number];

export interface SnapBrowserSource {
  readonly kind: BrowserSourceKind;
  readonly open: (opts: Args, needs: RunBrowserNeeds) => Promise<RunBrowser>;
}

/** The one-shot source: a Chromium of the run's own, closed at its finish. */
export const LAUNCH_PER_RUN: SnapBrowserSource = {
  kind: "launch-per-run",
  open: async (opts, needs) => {
    const session = await launchSnapSession(opts, { pages: opts.pages, requireCascadeRuntime: needs.requireCascadeRuntime });
    return {
      session,
      finish: async (red, name, enabled) => await finishSession(session, red, name, enabled),
      abandon: async (error) => await closeProbeSessionAfterError(session, error),
      abort: async () => await closeProbeSession(session),
    };
  },
};

/** The launch-time provisions `opts` needs that `owner` was not launched with. */
function missingLaunchProvisions(owner: ProbeSession, opts: Args, needs: RunBrowserNeeds): readonly string[] {
  const asked = armLaunchNeeds(opts);
  const missing: string[] = [];
  if ((asked.devtoolsSdk === true || needs.requireCascadeRuntime) && cascadeRuntimeFor(owner) === null) {
    missing.push("the DevTools SDK cascade runtime");
  }
  if (asked.debuggingPort === true && !publishesDebugging(owner)) {
    missing.push("a debugging endpoint");
  }
  // Only this direction: a headed owner captures what a headless one would, but a headless owner shows no one.
  if (opts.vnc && launchedHeadless(owner)) {
    missing.push("a headed display (--vnc)");
  }
  return missing;
}

/** Runs hosted as disposable isolated contexts inside `owner`'s already-launched Chromium, recording requests into
 *  the ring `ring` names. */
export function contextsIn(owner: ProbeSession, ring: ContextRingOwner): SnapBrowserSource {
  return {
    kind: "context-per-run",
    open: async (opts, needs): Promise<RunBrowser> => {
      const missing = missingLaunchProvisions(owner, opts, needs);
      if (missing.length > 0) {
        return instrumentRefusal(`this run needs ${missing.join(" and ")}, which a context cannot add to the browser that hosts it`);
      }
      const opened = await openSnapMatrixContext(owner, opts, ring);
      return {
        session: opened.session,
        finish: async (red, name, enabled) => await finishSnapContext(opened.context, red, name, enabled),
        abandon: async (error) => await closeAfterError(async () => await opened.context.context.close(), error),
        abort: async () => await opened.context.context.close(),
      };
    },
  };
}
