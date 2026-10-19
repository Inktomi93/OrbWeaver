// The deep-imports codemod's shapes: where a package file sits, what a front door must gain, and the plan for
// one deep specifier.
import type { Node, SourceFile } from "ts-morph";
import type { PackageFileReach } from "../../floor/code-facts/module-reach-contract.ts";
import type { RelocateNote } from "./relocate.ts";

/** Where a package source file sits: the floor's package file plus the repo-relative `src/` root it lives under. */
export interface PackageSource extends PackageFileReach {
  readonly srcRoot: string;
}

/** One re-export a front door must gain for a migrated import to keep naming the same declaration. */
export interface DoorExport {
  readonly door: string;
  readonly name: string;
  readonly from: string;
  readonly typeOnly: boolean;
}

/** What the caller supplies: the door's current exports and the target's declarations, both by name. */
export interface DoorReader {
  readonly targetFile: (path: string) => SourceFile | undefined;
  readonly doorExports: (door: string) => ReadonlyMap<string, readonly Node[]>;
  /** Importers that keep a narrow leaf import across modules: a front-door barrel would widen a graph another
   *  check bounds (a plugin worker's, a DOM-free compiler world's). Each is an exact importer exempt in the
   *  dependency-cruiser `package-subpath-crossing` rule. */
  readonly narrowImporters: ReadonlySet<string>;
}

/** The result for one deep specifier: its new spelling, the door exports it needs, or why it has none. */
export type DeepImportPlan =
  | { readonly kind: "respell"; readonly spec: string; readonly exports: readonly DoorExport[] }
  | { readonly kind: "refuse"; readonly reason: string };

/** The migration computed in memory. */
export interface DeepImportsResult {
  readonly writes: ReadonlyMap<string, string>;
  readonly notes: readonly RelocateNote[];
  readonly respelled: number;
  readonly doorExports: number;
}
