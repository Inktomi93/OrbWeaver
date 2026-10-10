// A daily planner refresh never overlaps itself; shutdown joins the running refresh before closing DB.
import { getLog } from "#foundation/observability";

const PLANNER_REFRESH_INTERVAL_MS = 86_400_000;

/** The caller has completed boot refresh; this owns only the recurring task and its settlement. */
export function startPlannerMaintenance(refresh: () => Promise<void>, scheduleInterval: (run: () => void, ms: number) => () => void): () => Promise<void> {
  let stopped = false;
  let running: Promise<void> | null = null;
  const cancel = scheduleInterval(() => {
    if (stopped || running !== null) {
      return;
    }
    running = refresh()
      .catch((err: unknown) => getLog().error({ err }, "planner maintenance failed; next daily tick retries"))
      .finally(() => {
        running = null;
      });
  }, PLANNER_REFRESH_INTERVAL_MS);
  return async (): Promise<void> => {
    stopped = true;
    cancel();
    await running;
  };
}
