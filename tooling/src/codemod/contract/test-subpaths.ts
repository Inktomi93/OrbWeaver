// The test-subpaths codemod's result: new bytes per file, and the package paths it left for the operator.
import type { RelocateNote } from "./relocate.ts";

/** The migration computed in memory. */
export interface TestSubpathsResult {
  readonly writes: ReadonlyMap<string, string>;
  readonly notes: readonly RelocateNote[];
}
