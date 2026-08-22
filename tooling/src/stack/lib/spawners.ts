// AN E2E/SNAP/CT STACK IS NOT THE STACK. Nine other things in this repo spawn a server or a vite on this
// box; `/healthz` carries `harness:true` for a Playwright-owned stack — we never adopt one and never kill
// one out from under a running battery. This census is what lets `status` NAME a foreign listener.
import type { StackSpawner } from "../contract/types.ts";

/** Sources: tooling/src/stack/stack.sh (dev), tooling/src/snap/ops/stage.ts (snap stage offsets),
 *  scripts/dev/multi-user-fixture.sh, tests/e2e/support/modes.ts (the three auth-mode projects + the
 *  fixture provider), playwright-ct.config.ts. PROD deliberately shares the dev SERVER port: they are two
 *  ways to serve the same app on this box and must never run at once — `classifyInstance` turns that into
 *  a loud refusal instead of a race. */
export const STACK_SPAWNERS: readonly StackSpawner[] = [
  { name: "dev stack (pnpm stack up)", serverPort: 8788, vitePort: 5173, discriminator: "DEV_SEED=on; pidfile .cache/stack/stack.pgid" },
  { name: "prod stack (pnpm stack up prod)", serverPort: 8788, vitePort: null, discriminator: "NODE_ENV=production; pidfile .cache/stack/prod.json; no vite" },
  { name: "vLLM engine fleet", serverPort: null, vitePort: null, discriminator: "ports 8701/8702/8703; pidfile .cache/stack/engines.pgid" },
  { name: "multi-user fixture", serverPort: 8790, vitePort: 5175, discriminator: "AUTH_MODE=local; STACK_RUN_DIR=.cache/multi-user/stack" },
  { name: "e2e single-user", serverPort: 8796, vitePort: 5181, discriminator: "healthz harness:true (E2E_HARNESS=on); start-fg, no pidfile" },
  { name: "e2e fixture provider", serverPort: 8797, vitePort: null, discriminator: "scripted BYO provider, not an orbweaver server" },
  { name: "e2e forward-header", serverPort: 8798, vitePort: 5182, discriminator: "healthz harness:true; start-fg, no pidfile" },
  { name: "e2e local", serverPort: 8799, vitePort: 5183, discriminator: "healthz harness:true; start-fg, no pidfile" },
  {
    name: "snap --isolated/--dirty stage",
    serverPort: 8888,
    vitePort: 5273,
    discriminator: "runs from .cache/snap-stage/<sha>; its OWN pidfile under that tree",
  },
  { name: "playwright-ct", serverPort: null, vitePort: 3100, discriminator: "vite only — no orbweaver server exists in a CT run" },
];

/** Name the known spawner that owns a port, for a legible "not yours" message. */
export function spawnerForPort(port: number): StackSpawner | undefined {
  return STACK_SPAWNERS.find((s) => s.serverPort === port || s.vitePort === port);
}
