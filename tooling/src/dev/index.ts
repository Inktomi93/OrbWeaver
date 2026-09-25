// dev's programmatic front door: the cross-platform `pnpm dev` launcher (D252), and the leader body the
// stack supervisor runs detached.
export type { DevChildName, DevLeaderHooks, DevParse, DevSpawnPlan, PortParse, ServerBootOutcome, WorkspacePackage } from "./contract/types.ts";
export { awaitServerReady, HEALTHZ_POLL_MS, SERVER_HEALTHZ_BASE_MS } from "./lib/boot.ts";
export {
  CLIENT_PACKAGE,
  DEV_USAGE,
  devBannerLines,
  devChildEnv,
  findPackage,
  parseDevArgv,
  resolveVitePort,
  SERVER_PACKAGE,
  serverSpawnPlan,
  serverWatchRoots,
  VITE_API_TARGET_ENV,
  VITE_PORT_ENV,
  viteSpawnPlan,
} from "./lib/plan.ts";
export { runDev } from "./ops/dev.ts";
