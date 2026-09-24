// entry/lifecycle — a cookie mode with no session secret refuses to boot, before the listener binds. A remote
// DATABASE_URL has no local data dir to hold a generated `.session-secret`, so `AUTH_MODE=local` with no
// SESSION_SECRET has no pepper and must say so rather than serve a login that cannot work.

import { vi } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

vi.stubEnv("DATABASE_URL", "libsql://orbweaver-secret-refusal.invalid");
vi.stubEnv("AUTH_MODE", "local");
vi.stubEnv("SESSION_SECRET", undefined);
vi.stubEnv("VLLM_DISABLED", "true");

const { createLifecycle } = await import("../../../packages/server/src/entry/lifecycle.ts");

test("AUTH_MODE=local with no session secret and a remote db refuses before binding", async () => {
  const lifecycle = createLifecycle({ listenPort: 0 });
  try {
    await expect(lifecycle.boot()).rejects.toThrow("SESSION_SECRET");
    expect(lifecycle.listeningAddress()).toBeNull();
  } finally {
    await lifecycle.shutdown();
  }
});
