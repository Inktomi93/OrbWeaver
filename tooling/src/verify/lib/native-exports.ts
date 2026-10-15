// Completeness consumers distinguish a captured absent export from missing native source coverage.
import type { Node, SourceFile } from "ts-morph";

/** Keep the native getExportedDeclarations membership, including explicitly captured empty declarations. */
export function exportedNativeSources(sources: readonly SourceFile[], captures: ReadonlyMap<SourceFile, readonly Node[] | null>): SourceFile[] {
  return sources.filter((source) => {
    const declarations = captures.get(source);
    if (declarations === undefined) {
      throw new Error("native export source/name coverage is unavailable");
    }
    return declarations !== null;
  });
}
