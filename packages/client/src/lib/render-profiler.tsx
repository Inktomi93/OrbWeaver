// `<RenderProfiler>` — the `[perf]` channel's component half: wraps a hot surface in React's
// <Profiler> and warns on commits crossing SLOW_COMMIT_MS. Use sparingly — composition-point
// surfaces only, per-row wrapping drowns the signal. Prod cost ~zero (children render bare).

import type { ProfilerOnRenderCallback, ReactNode } from "react";
import { Profiler } from "react";
import { IS_DEV } from "./dev-flag";
import { logClock } from "./log-clock";
import { recordRender } from "./render-stats";

const SLOW_COMMIT_MS = 12;

const PERF_STYLE = "color:#c60;font-weight:bold";
const MUTED_STYLE = "color:#888";

const onRender: ProfilerOnRenderCallback = (id, phase, actualDuration) => {
  recordRender(id, phase, actualDuration);
  if (actualDuration < SLOW_COMMIT_MS) {
    return;
  }
  console.warn(`%c${logClock()} [perf]%c slow commit ${id} ${Math.round(actualDuration)}ms (${phase})`, PERF_STYLE, MUTED_STYLE);
};

/** Dev-only slow-commit logger; in prod it renders children bare. */
export function RenderProfiler({ id, children }: { readonly id: string; readonly children: ReactNode }): ReactNode {
  if (!IS_DEV) {
    return children;
  }
  return (
    <Profiler id={id} onRender={onRender}>
      {children}
    </Profiler>
  );
}
