// dev's programmatic front door: the cross-platform `pnpm dev` launcher (D252).
export type { DevParse, DevSpawnPlan, PortParse, WorkspacePackage } from "./contract/types.ts";
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
