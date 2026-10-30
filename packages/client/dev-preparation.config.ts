// Vite must finish the cold authenticated transform graph before the stack can publish its listener.
// Dynamic boot imports are explicit roots; Vite discovers their static dependencies through its own pipeline.
import type { Plugin } from "vite";

const PREPARATION_ROOTS = [
  "/src/entry.ts",
  "/src/main.tsx",
  "/src/compose/authed-app.tsx",
  "/src/compose/config-sections.ts",
  "/src/dev/agent-handles/index.ts",
  "/src/lib/long-task-tracer.ts",
] as const;

/** Wrap the native client environment before listen; preserve its transport and client RPC restrictions. */
export function devPreparation(): Plugin {
  return {
    name: "orb:dev-preparation",
    apply: "serve",
    configureServer(server): void {
      const environment = server.environments.client;
      const nativeListen = environment.listen.bind(environment);
      const nativeWarmup = environment.warmupRequest.bind(environment);
      const pending = new Set<Promise<void>>();
      const failures: Error[] = [];
      // Native recursive warmups log errors without rejecting. Track their actual transforms so a
      // resolved root cannot publish readiness while a discovered child is still pending or failed.
      environment.warmupRequest = (url): Promise<void> => {
        const request = environment
          .transformRequest(url)
          .then((result): void => {
            if (result === null) {
              throw new Error("module returned no transform");
            }
          })
          .catch((cause: unknown): void => {
            const error = cause instanceof Error ? cause : new Error(String(cause));
            failures.push(new Error(`${url}: ${error.message}`, { cause: error }));
          })
          .finally((): void => {
            pending.delete(request);
          });
        pending.add(request);
        return request;
      };
      environment.listen = async (owner): Promise<void> => {
        await nativeListen(owner);
        await Promise.all(PREPARATION_ROOTS.map((url) => environment.warmupRequest(url)));
        // A child can discover more imports while an earlier batch settles. Vite's one-shot first-crawl
        // idle promise can already be resolved, so drain the registered transforms themselves.
        while (pending.size > 0) {
          await Promise.all(pending);
        }
        environment.warmupRequest = nativeWarmup;
        if (failures.length > 0) {
          throw new AggregateError(failures, `Development graph preparation failed:\n${failures.map((error) => error.message).join("\n")}`);
        }
        environment.listen = nativeListen;
        environment.logger.info("orb: development graph prepared");
      };
    },
  };
}
