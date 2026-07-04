// `<RenderProfiler>` — the `[perf]` channel's component half: slow-COMMIT attribution (UI-Arch
// §2.1 lib/; ported from neo features/_shared/render-profiler.tsx — orbweaver has no _shared
// drawer, lib/ is the cross-cutting home). Wraps a hot surface in React's <Profiler> and logs
// commits that cross the threshold:
//   14:23:08.412 [perf] slow commit MessageListSurface 23ms (update)
// The long-task tracer says "main thread blocked on route /"; this says "and it was THAT surface's
// commit". Same `[perf]` channel, so console-capture transcripts pick both up together.
// PROD COST ~ZERO: `IS_DEV` false renders children bare, and prod react-dom compiles <Profiler>'s
// onRender away regardless — safe to barrel-export (unlike dev-tools/long-task-tracer, which stay
// OUT of the barrel). Threshold: the 60fps budget is ~16ms total; one commit at 12ms has spent
// most of it, hence the floor.
// Use SPARINGLY — wrap composition-point surfaces (message list, recent chats, panel roots), not
// every component; per-row wrapping drowns the signal.

import type { ProfilerOnRenderCallback, ReactNode } from "react";
// biome mis-enumerates react's conditional-CJS export map and misses Profiler specifically (the
// same false positive main.tsx pins for StrictMode); tsc resolves it and the client typechecks.
// biome-ignore lint/correctness/noUnresolvedImports: tsc-verified false positive (see above).
import { Profiler } from "react";
import { IS_DEV } from "./dev-flag";
import { logClock } from "./log-clock";

const SLOW_COMMIT_MS = 12;

const PERF_STYLE = "color:#c60;font-weight:bold";
const MUTED_STYLE = "color:#888";

const onRender: ProfilerOnRenderCallback = (id, phase, actualDuration) => {
  if (actualDuration < SLOW_COMMIT_MS) {
    return;
  }
  console.warn(
    `%c${logClock()} [perf]%c slow commit ${id} ${Math.round(actualDuration)}ms (${phase})`,
    PERF_STYLE,
    MUTED_STYLE,
  );
};

/** Dev-only slow-commit logger; in prod it renders children bare. */
export function RenderProfiler({
  id,
  children,
}: {
  readonly id: string;
  readonly children: ReactNode;
}): ReactNode {
  if (!IS_DEV) {
    return children;
  }
  return (
    <Profiler id={id} onRender={onRender}>
      {children}
    </Profiler>
  );
}
