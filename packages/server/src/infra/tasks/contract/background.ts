import type { DetachedSupervision } from "#foundation/observability";

/** Execution lifetime for detached work whose own boundary has already reported its failures. */
export interface BackgroundWork extends AsyncDisposable {
  readonly signal: AbortSignal;
  readonly cancel: () => void;
  readonly track: (settled: Promise<void>) => void;
  readonly settle: () => Promise<void>;
  readonly supervise: DetachedSupervision["superviseDetached"];
}
