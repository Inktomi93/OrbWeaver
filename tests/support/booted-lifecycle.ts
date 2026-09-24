// A real lifecycle booted on a throwaway data dir, and the boot log it wrote. The env is stubbed before the
// server graph is imported, so call `bootLifecycle` once per file, before anything imports that graph.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";

// An env key and its value; `undefined` unsets it.
type EnvPin = readonly [key: string, value: string | undefined];

export interface BootedLifecycle {
  /** The JSON log lines the boot wrote at or above `LOG_LEVEL=info`, in order. */
  readonly bootLog: readonly Record<string, unknown>[];
  readonly shutdown: () => Promise<void>;
}

/** Boot a lifecycle on loopback port 0 under `env` (after the throwaway-dir pins) and return its boot log. */
export async function bootLifecycle(prefix: string, env: readonly EnvPin[]): Promise<BootedLifecycle> {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const pins: readonly EnvPin[] = [
    ["DATABASE_URL", `file:${join(dir, "orb.db")}`],
    ["ASSETS_DIR", join(dir, "assets")],
    ["USER_RUNTIME_DIR", join(dir, "users")],
    ["LOCAL_LIGHT_CACHE_DIR", join(dir, "models")],
    ["LOCAL_LIGHT_PREFETCH", "off"],
    ["VLLM_DISABLED", "true"],
    ["LOG_LEVEL", "info"],
    ...env,
  ];
  for (const [key, value] of pins) {
    vi.stubEnv(key, value);
  }
  try {
    const { createLifecycle } = await import("../../packages/server/src/entry/lifecycle.ts");
    const { logRing } = await import("../../packages/server/src/foundation/observability/index.ts");
    const before = logRing.recent().length;
    const lifecycle = createLifecycle({ listenPort: 0 });
    await lifecycle.boot();
    const bootLog = logRing
      .recent()
      .slice(before)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    return {
      bootLog,
      shutdown: async (): Promise<void> => {
        try {
          await lifecycle.shutdown();
        } finally {
          rmSync(dir, { force: true, recursive: true });
        }
      },
    };
  } catch (error) {
    rmSync(dir, { force: true, recursive: true });
    throw error;
  }
}

/** The boot disclaimer group's positions in the boot log. */
export function disclaimerIndices(bootLog: readonly Record<string, unknown>[]): readonly number[] {
  return bootLog.flatMap((line, index) => (line["bootDisclaimer"] === true ? [index] : []));
}
