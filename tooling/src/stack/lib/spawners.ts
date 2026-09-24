// AN E2E/SNAP/CT STACK IS NOT THE STACK. Nine other things in this repo spawn a server or a vite on this
// box; `/healthz` carries `harness:true` for a Playwright-owned stack — we never adopt one and never kill
// one out from under a running battery. This census is what lets `status` NAME a foreign listener.
import { CT_VITE_PORT, DEV_PORTS, E2E_FIXTURE_PROVIDER_PORT, E2E_PORTS, FIXTURE_PORTS, STAGE_BANDS, stageBandPorts } from "../../_shared/ports.ts";
import type { StackSpawner } from "../contract/types.ts";

/** Every port below comes from the ONE registry (`tooling/src/_shared/ports.ts`) — this census names the
 *  SPAWNER and its discriminator; it does not decide a number. PROD deliberately shares the dev SERVER
 *  port: they are two ways to serve the same app on this box and must never run at once —
 *  `classifyInstance` turns that into a loud refusal instead of a race. The ten stage bands are listed
 *  individually because `status` must be able to name whichever one a foreign listener holds.
 */
export const STACK_SPAWNERS: readonly StackSpawner[] = [
  { name: "dev stack (pnpm stack up)", serverPort: DEV_PORTS.server, vitePort: DEV_PORTS.vite, discriminator: "DEV_SEED=on; pidfile .cache/stack/stack.pgid" },
  {
    name: "prod stack (pnpm stack up prod)",
    serverPort: DEV_PORTS.server,
    vitePort: null,
    discriminator: "NODE_ENV=production; pidfile .cache/stack/prod.json; no vite",
  },
  {
    name: "multi-user fixture",
    serverPort: FIXTURE_PORTS.server,
    vitePort: FIXTURE_PORTS.vite,
    discriminator: "AUTH_MODE=local; STACK_RUN_DIR=.cache/multi-user/stack",
  },
  {
    name: "e2e single-user",
    serverPort: E2E_PORTS.singleUser.server,
    vitePort: E2E_PORTS.singleUser.vite,
    discriminator: "healthz harness:true (E2E_HARNESS=on); start-fg, no pidfile",
  },
  {
    name: "e2e fixture provider",
    serverPort: E2E_FIXTURE_PROVIDER_PORT,
    vitePort: null,
    discriminator: "scripted BYO provider, not an orbweaver server",
  },
  {
    name: "e2e forward-header",
    serverPort: E2E_PORTS.forwardHeader.server,
    vitePort: E2E_PORTS.forwardHeader.vite,
    discriminator: "healthz harness:true; start-fg, no pidfile",
  },
  { name: "e2e local", serverPort: E2E_PORTS.local.server, vitePort: E2E_PORTS.local.vite, discriminator: "healthz harness:true; start-fg, no pidfile" },
  ...STAGE_BANDS.map((band): StackSpawner => {
    const ports = stageBandPorts(band);
    return {
      name: `snap --isolated/--dirty stage band ${band}`,
      serverPort: ports.server,
      vitePort: ports.vite,
      discriminator: "runs from .cache/snap-stage/<sha>; its OWN pidfile under that tree",
    };
  }),
  { name: "playwright-ct", serverPort: null, vitePort: CT_VITE_PORT, discriminator: "vite only — no orbweaver server exists in a CT run" },
];

/** Name the known spawner that owns a port, for a legible "not yours" message. */
export function spawnerForPort(port: number): StackSpawner | undefined {
  return STACK_SPAWNERS.find((s) => s.serverPort === port || s.vitePort === port);
}
