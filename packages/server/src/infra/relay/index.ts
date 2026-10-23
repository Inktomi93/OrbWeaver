// infra/relay — the share relay's I/O: the pinned cloudflared on disk (download, sha256 check, unpack) and the
// quick-tunnel process. Sealed like every adapter: entry builds it and injects the launcher into `domain/share`.

export type {
  CloudflaredPin,
  RelayAssetFetch,
  RelayLauncher,
  RelayProcess,
  SpawnRelay,
} from "./contract.ts";
export { CLOUDFLARED_TARGETS } from "./contract.ts";
export { createOwnedRelayLauncher } from "./execution.ts";
export { CLOUDFLARED_PIN } from "./pin.ts";
export { RELAY_STOP_GRACE_MS } from "./quick-tunnel.ts";
