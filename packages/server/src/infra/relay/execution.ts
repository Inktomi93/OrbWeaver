// Own verifier/extractor completion and every native child, including launches invalidated before spawn returns.
import { createCloudflaredBinary, extractTgzWithTar } from "./binary.ts";
import type { OwnedRelayLauncher, OwnedRelayProcess, RelayExecutionDeps, RelayProcess } from "./contract.ts";
import { spawnQuickTunnel } from "./quick-tunnel.ts";

/** Construct the native relay execution owner; null pin refuses unscripted execution before any I/O. */
export function createOwnedRelayLauncher(deps: RelayExecutionDeps): OwnedRelayLauncher {
  const abort = new AbortController();
  const pending = new Set<Promise<RelayProcess>>();
  const children = new Set<OwnedRelayProcess>();
  const legacyChildren = new Set<RelayProcess>();
  let disposal: Promise<void> | undefined;
  const cancel = (): void => {
    abort.abort();
    using stopping = new DisposableStack();
    for (const child of children) {
      stopping.defer(child.stop);
    }
    for (const child of legacyChildren) {
      stopping.defer(child.stop);
    }
  };
  return {
    launch(origin, events): Promise<RelayProcess> {
      const operation = Promise.resolve().then(async (): Promise<RelayProcess> => {
        abort.signal.throwIfAborted();
        if (deps.pin === null) {
          throw new Error("server harness: unscripted external relay execution");
        }
        const binary = createCloudflaredBinary({ ...deps, pin: deps.pin, extractTgz: extractTgzWithTar, signal: abort.signal });
        const executable = await binary.ensure();
        abort.signal.throwIfAborted();
        if (deps.spawn !== undefined) {
          const child = deps.spawn(executable, origin, events);
          legacyChildren.add(child);
          return child;
        }
        // biome-ignore lint/nursery/useDisposables: this exact child transfers to the launcher owner until its native close event.
        const child = spawnQuickTunnel(executable, origin, events);
        children.add(child);
        const forgetChild = (): boolean => children.delete(child);
        void child.settled.then(
          () => forgetChild(),
          () => forgetChild(),
        );
        return child;
      });
      pending.add(operation);
      void operation.then(
        () => pending.delete(operation),
        () => pending.delete(operation),
      );
      return operation;
    },
    cancel,
    [Symbol.asyncDispose](): Promise<void> {
      disposal ??= (async (): Promise<void> => {
        cancel();
        await Promise.allSettled([...pending]);
        await Promise.all([...children].map((child) => child[Symbol.asyncDispose]()));
      })();
      return disposal;
    },
  };
}
