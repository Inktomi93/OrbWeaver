// infra/relay — the share relay's I/O: the pinned cloudflared on disk (download, sha256 check, unpack) and the
// quick-tunnel process. Sealed like every adapter: entry builds it and injects the launcher into `domain/share`.

export { createCloudflaredBinary, extractTgzWithTar } from "./binary.ts";
export type {
  CloudflaredAsset,
  CloudflaredBinary,
  CloudflaredBinaryDeps,
  CloudflaredPackaging,
  CloudflaredPin,
  CloudflaredTarget,
  ExtractTgz,
  QuickTunnelLauncherDeps,
  RelayAssetFetch,
  RelayEvents,
  RelayLauncher,
  RelayProcess,
  SpawnRelay,
} from "./contract.ts";
export { CLOUDFLARED_TARGETS } from "./contract.ts";
export { CLOUDFLARED_PIN } from "./pin.ts";
export { createQuickTunnelLauncher, quickTunnelOrigin, spawnQuickTunnel } from "./quick-tunnel.ts";
