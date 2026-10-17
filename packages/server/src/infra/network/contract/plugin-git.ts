// Git distribution capabilities stay in the network adapter contract, without its execution dependencies.

export interface PluginGitSource {
  readonly clone: (url: string) => Promise<{ readonly bundle: Uint8Array; readonly commit: string }>;
  readonly head: (url: string) => Promise<string>;
}
