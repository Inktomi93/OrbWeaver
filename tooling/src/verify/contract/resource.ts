// Resource acquisition is internal to providers. Policies receive only the closed ResourceHost surface.
export type ResourceLoad<T> = (
  | { readonly status: "ready"; readonly value: T; readonly paths: readonly string[]; readonly members: number }
  | { readonly status: "missing" | "empty" | "unresolved" | "malformed"; readonly reason: string; readonly paths: readonly string[]; readonly members: number }
) & { readonly subprocess?: ResourceSubprocessReceipt };

export interface ResourceSubprocessReceipt {
  readonly command: "git-index";
  readonly exitStatus: number | null;
  readonly timeoutMs: number;
}

export interface ResourceReceipt {
  readonly source: string;
  readonly status: ResourceLoad<never>["status"];
  readonly paths: readonly string[];
  readonly members: number;
  readonly durationMs: number;
  readonly subprocess?: ResourceSubprocessReceipt;
}

export type ResourceFact<T> = ResourceLoad<T> & { readonly receipt: ResourceReceipt };

export interface ResourceTreeEntry {
  readonly path: string;
  readonly kind: "file" | "directory";
  readonly bytes: number;
  readonly lines: number;
  readonly nulBytes: number;
  readonly origin: "disk" | "overlay";
}

/** Internal provider input, never supplied to a gate or exposed by ResourceHost. */
export interface ResourceReader {
  readonly read: (path: string) => ResourceLoad<string>;
  readonly tree: (path: string) => ResourceLoad<readonly ResourceTreeEntry[]>;
}

/** The same normalized file map can be applied to the shared AST workspace by the fixture runner. */
export interface ResourceReaderOptions {
  readonly root: string;
  readonly overlay?: Readonly<Record<string, string | null>>;
}

export interface TrackedResourceIndex {
  readonly repoPaths: readonly string[];
}
