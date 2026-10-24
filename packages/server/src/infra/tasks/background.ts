import type { Logger } from "#foundation/observability";
import { createDetachedSupervision } from "#foundation/observability";
import type { BackgroundWork } from "./contract/background.ts";

/** Own the cancellation and settlement of work that outlives its initiating request; a failure outside a
 *  request reports through the root's `log`. */
export function createBackgroundWork(log: Logger): BackgroundWork {
  const { superviseSettled: settled } = createDetachedSupervision(log);
  const controller = new AbortController();
  const pending = new Set<Promise<void>>();
  let closed = false;
  const track: BackgroundWork["track"] = (task) => {
    const completion = task.then(() => {
      pending.delete(completion);
    });
    pending.add(completion);
  };
  const settle = async (): Promise<void> => {
    while (pending.size > 0) {
      await Promise.all([...pending]);
    }
  };
  return {
    signal: controller.signal,
    cancel: () => controller.abort(),
    track,
    settle,
    supervise: (...args): void => {
      if (closed) {
        throw new Error("cannot start work on a closed background-work lifetime");
      }
      track(settled(...args));
    },
    async [Symbol.asyncDispose](): Promise<void> {
      controller.abort();
      await settle();
      closed = true;
    },
  };
}
