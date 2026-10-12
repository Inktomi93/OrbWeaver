// `<RenderProfiler>` — the `[perf]` channel's component half: wraps a hot surface in React's
// <Profiler> and warns on commits crossing SLOW_COMMIT_MS. Use sparingly — composition-point
// surfaces only, per-row wrapping drowns the signal. Prod cost ~zero (children render bare).

import type { ProfilerOnRenderCallback, ReactNode } from "react";
import { Profiler } from "react";
import { CONSOLE_STYLES } from "./console-styles.ts";
import { IS_DEV } from "./dev-flag.ts";
import { logClock } from "./log-clock.ts";
import { recordRender } from "./render-stats.ts";

const SLOW_COMMIT_MS = 12;

const onRender: ProfilerOnRenderCallback = (id, phase, actualDuration) => {
  recordRender(id, phase, actualDuration);
  if (actualDuration < SLOW_COMMIT_MS) {
    return;
  }
  console.warn(`%c${logClock()} [perf]%c slow commit ${id} ${Math.round(actualDuration)}ms (${phase})`, CONSOLE_STYLES.warning, CONSOLE_STYLES.muted);
};

const recordOnly: ProfilerOnRenderCallback = (id, phase, actualDuration) => {
  recordRender(id, phase, actualDuration);
};

/** Dev-only slow-commit logger; in prod it renders children bare. */
export function RenderProfiler({ id, warn = true, children }: { readonly id: string; readonly warn?: boolean; readonly children: ReactNode }): ReactNode {
  if (!IS_DEV) {
    return children;
  }
  return (
    <Profiler id={id} onRender={warn ? onRender : recordOnly}>
      {children}
    </Profiler>
  );
}
