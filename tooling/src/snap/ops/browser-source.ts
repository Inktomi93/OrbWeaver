// Where one snap run's browser comes from. A one-shot CLI run launches its own Chromium and closes it at its
// finish (`LAUNCH_PER_RUN`). A host that already holds a Chromium, a session daemon's matrix cells or a test
// file's shared browser, gives each run a disposable isolated context instead (`contextsIn`): fresh storage,
// cookies, permissions, routes and init scripts, with the run's own viewport, device and media emulation.
//
// A context cannot change what its browser was launched with. A run that needs a launch-time provision the
// owner lacks (the DevTools SDK cascade profile, a debugging endpoint, a headed display) is refused as an
// INSTRUMENT ERROR, never run on a browser that silently differs from the one its own launch would build.
//
// What a context still shares with its owner: the owner's request ring (`adoptRequestRing`), which a run reads
// from its own checkpoint, and the ring's response-body budget.
import { closeProbeSessionAfterError } from "../../floor/browser/browser.ts";
import type { ProbeSession } from "../../floor/browser/browser-contract.ts";
import { instrumentRefusal } from "../../floor/browser/page-validate.ts";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import type { FailureArtifacts } from "../contract/run.ts";
import type { Args } from "../contract/types.ts";
import { armLaunchNeeds } from "./arms/registry.ts";
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
  /** Release after a throw; rethrows `error`, joined with any release failure. */
  readonly abandon: (error: unknown) => Promise<never>;
}

/** What a run asks of its browser beyond its own argv. */
export interface RunBrowserNeeds {
  /** The appearance-invariant pass reads the DevTools SDK runtime with no `--cascade` flag asking for it. */
  readonly requireCascadeRuntime: boolean;
}

export interface SnapBrowserSource {
  readonly open: (opts: Args, needs: RunBrowserNeeds) => Promise<RunBrowser>;
}

/** The one-shot host: a Chromium of the run's own, closed at its finish. */
export const LAUNCH_PER_RUN: SnapBrowserSource = {
  open: async (opts, needs) => {
    const session = await launchSnapSession(opts, { pages: opts.pages, requireCascadeRuntime: needs.requireCascadeRuntime });
    return {
      session,
      finish: async (red, name, enabled) => await finishSession(session, red, name, enabled),
      abandon: async (error) => await closeProbeSessionAfterError(session, error),
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

/** Runs hosted as disposable isolated contexts inside `owner`'s already-launched Chromium. */
export function contextsIn(owner: ProbeSession): SnapBrowserSource {
  return {
    open: async (opts, needs): Promise<RunBrowser> => {
      const missing = missingLaunchProvisions(owner, opts, needs);
      if (missing.length > 0) {
        return instrumentRefusal(`this run needs ${missing.join(" and ")}, which a context cannot add to the browser that hosts it`);
      }
      const opened = await openSnapMatrixContext(owner, opts);
      return {
        session: opened.session,
        finish: async (red, name, enabled) => await finishSnapContext(opened.context, red, name, enabled),
        abandon: async (error): Promise<never> => {
          await opened.context.context.close();
          throw error;
        },
      };
    },
  };
}
