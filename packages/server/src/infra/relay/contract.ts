// The relay adapter's contract: the cloudflared pin's shape, the injected download and spawn seams, and the launcher
// port the share domain's relay controller drives. db-free and domain-free, like every infra contract.

/** The node `${process.platform}-${process.arch}` pairs cloudflared publishes a build for. */
export const CLOUDFLARED_TARGETS = ["linux-x64", "linux-arm64", "linux-arm", "linux-ia32", "darwin-x64", "darwin-arm64", "win32-x64", "win32-ia32"] as const;
export type CloudflaredTarget = (typeof CLOUDFLARED_TARGETS)[number];

// How a release asset carries the executable: the file itself, or a gzip tar holding one `cloudflared` entry.
const CLOUDFLARED_PACKAGINGS = ["binary", "tgz"] as const;
export type CloudflaredPackaging = (typeof CLOUDFLARED_PACKAGINGS)[number];

/** One pinned release asset. `bytes` caps the download before the hash is even compared. */
export interface CloudflaredAsset {
  readonly file: string;
  readonly packaging: CloudflaredPackaging;
  readonly bytes: number;
  /** Lower-case hex sha256 of the whole asset as published. */
  readonly sha256: string;
}

export interface CloudflaredPin {
  readonly version: string;
  /** The asset URL is `${releaseBase}/${version}/${file}`. */
  readonly releaseBase: string;
  /** The only hosts a download may reach: the release host and the host its asset redirect lands on. */
  readonly downloadHosts: readonly string[];
  readonly assets: Readonly<Record<CloudflaredTarget, CloudflaredAsset>>;
}

/** The download transport: production passes the pinned-download door (safeFetch over the pin's `downloadHosts`);
 *  tests pass a fake. `maxBytes` is the asset's pinned size and `deadlineMs` bounds the whole download. */
export type RelayAssetFetch = (url: string, limits: { readonly maxBytes: number; readonly deadlineMs: number }) => Promise<Response>;

/** Unpacks the single `cloudflared` entry of a verified tgz into `intoDir`. Called only after the archive's hash matched. */
export type ExtractTgz = (archive: string, intoDir: string) => Promise<void>;

/** What the binary verifier reads: the pin, this process's target, its private directory and the two I/O seams. */
export interface CloudflaredBinaryDeps {
  readonly pin: CloudflaredPin;
  /** `${process.platform}-${process.arch}`; a pair outside {@link CLOUDFLARED_TARGETS} refuses. */
  readonly target: string;
  readonly dir: string;
  readonly fetch: RelayAssetFetch;
  readonly extractTgz: ExtractTgz;
}

/** Yields the path of a cloudflared executable whose bytes were checked against the pin on this call. */
export interface CloudflaredBinary {
  readonly ensure: () => Promise<string>;
}

/** What a running relay reports to its controller. `onUrl` fires at most once per process. */
export interface RelayEvents {
  readonly onUrl: (url: string) => void;
  /** The process ended or could not start; `detail` is for the log only. */
  readonly onExit: (detail: string) => void;
}

/** One running relay process. `stop` asks it to end and forces it after a grace period; it never throws. */
export interface RelayProcess {
  readonly stop: () => void;
}

/** Starts one relay process from a verified executable. */
export type SpawnRelay = (executable: string, origin: string, events: RelayEvents) => RelayProcess;

/** The port the relay controller drives: verify the binary, then start a relay to `origin` (a loopback URL). It
 *  rejects with a `DomainOperationError` carrying a `RELAY_BINARY_REFUSALS` code before anything runs. */
export interface RelayLauncher {
  readonly launch: (origin: string, events: RelayEvents) => Promise<RelayProcess>;
}

/** The quick-tunnel launcher's two seams: the verifier and the spawner (a fake in tests, so no test runs a tunnel). */
export interface QuickTunnelLauncherDeps {
  readonly binary: CloudflaredBinary;
  readonly spawn: SpawnRelay;
}
