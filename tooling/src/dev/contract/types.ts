// dev's shapes: the argv verdict, the workspace graph the watch roots derive from, and the two spawn plans.

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
