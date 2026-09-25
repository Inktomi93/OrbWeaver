// dev's shapes: the argv verdict, the workspace graph the watch roots derive from, the two spawn plans, and
// the hooks a supervisor hands the leader body.

export type DevParse = { readonly ok: true } | { readonly ok: false; readonly error: string };

/** A validated port, or the refusal that names the setting it came from. */
export type PortParse = { readonly ok: true; readonly port: number } | { readonly ok: false; readonly error: string };

/** One `packages/*` workspace member, as its `package.json` declares it. */
export interface WorkspacePackage {
  readonly name: string;
  /** Absolute package directory. */
  readonly dir: string;
  /** The workspace package names in its runtime `dependencies`. */
  readonly workspaceDeps: readonly string[];
}

export interface DevSpawnPlan {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
}

/** How the server's boot gate ended: it answered, it exited first, or the ceiling ran out. */
const SERVER_BOOT_OUTCOMES = ["ready", "exited", "timeout"] as const;
export type ServerBootOutcome = (typeof SERVER_BOOT_OUTCOMES)[number];

const DEV_CHILD_NAMES = ["server", "vite"] as const;
export type DevChildName = (typeof DEV_CHILD_NAMES)[number];

/** What a detached supervisor adds to the leader body: log files instead of this terminal, and the pids
 *  of the children it spawns, for the supervisor's record. `pnpm dev` passes neither. */
export interface DevLeaderHooks {
  /** The server's pretty log and vite's output go here (appended) instead of to this terminal. */
  readonly logs?: { readonly server: string; readonly client: string };
  readonly onChild?: (name: DevChildName, pid: number) => void;
}
