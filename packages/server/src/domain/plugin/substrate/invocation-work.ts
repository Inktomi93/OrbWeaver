// Host settlement alone does not include the resident handler's subsequent crash-accounting writes.

import type { PluginInvocationWork } from "../contract/ops.ts";

/** Refuse new invocations during shutdown and join existing callers without owning their error verdict. */
export function createPluginInvocationWork(): PluginInvocationWork {
  const pending = new Set<Promise<void>>();
  let closed = false;
  return {
    async run<T>(job: () => Promise<T>): Promise<T> {
      if (closed) {
        throw new Error("plugin invocations are closed");
      }
      const { promise, resolve } = Promise.withResolvers<void>();
      pending.add(promise);
      try {
        return await job();
      } finally {
        pending.delete(promise);
        resolve();
      }
    },
    async [Symbol.asyncDispose](): Promise<void> {
      closed = true;
      await Promise.all(pending);
    },
  };
}
