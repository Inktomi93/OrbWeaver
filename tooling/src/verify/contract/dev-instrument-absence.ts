// The shapes `lib/dev-instrument-absence.ts` derives and judges: the client's DEV-only instruments must be
// absent from every chunk of the production build.

/** The value-import graph of the client's source: repo-relative module path → the modules it imports
 *  (static or dynamic, type-only edges dropped because they are erased). */
export type ModuleValueGraph = ReadonlyMap<string, readonly string[]>;

/** What the judgment reads: the client entry, its DEV-branch imports, the source graph and the build. */
export interface DevInstrumentInputs {
  readonly entry: string;
  /** The declared DEV-only roots. */
  readonly roots: readonly string[];
  /** Every module the entry imports inside its `import.meta.env.DEV` branch, repo-relative. */
  readonly devBranch: readonly string[];
  readonly graph: ModuleValueGraph;
  /** Emitted chunk path (repo-relative) → the sources its sourcemap names. */
  readonly chunks: ReadonlyMap<string, readonly string[]>;
  /** Emitted chunks with no sourcemap that carry code beyond imports and re-exports. The bundler writes no
   *  map for a pure facade chunk; any other unmapped chunk hides its modules from this check. */
  readonly unmappedCode: readonly string[];
}

/** One DEV-only module found in a production chunk. */
export interface DevInstrumentLeak {
  /** The emitted chunk, repo-relative (`packages/client/dist/assets/<name>.js`). */
  readonly chunk: string;
  /** The DEV-only source module the chunk's sourcemap names, repo-relative. */
  readonly module: string;
}

export interface DevInstrumentVerdict {
  /** The declared DEV-only roots judged. */
  readonly roots: readonly string[];
  /** The roots plus every module reachable ONLY through them in the source graph, sorted. */
  readonly devOnly: readonly string[];
  /** How many chunk sourcemaps were read, and how many source entries they named in total. */
  readonly chunks: number;
  readonly sources: number;
  readonly leaks: readonly DevInstrumentLeak[];
  /** Why the check could not measure, or null. A non-null value is a tool error, never a pass. */
  readonly unmeasurable: string | null;
}
