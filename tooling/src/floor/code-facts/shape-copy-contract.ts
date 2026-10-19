import type { Node } from "ts-morph";

export interface ShapeCopySource {
  readonly name: string;
  readonly file: string;
  readonly decl: Node;
  readonly fields: ReadonlySet<string>;
}

export interface ShapeCopyCandidate {
  readonly decl: Node;
  readonly fields: ReadonlySet<string>;
}

/** One pair's field facts in the left side's field order; consumers derive their own scores from them. */
export interface ShapeFieldComparison {
  /** Left field names the right side also carries. */
  readonly shared: readonly string[];
  /** Shared names whose types the supplied agreement accepts. */
  readonly agreeing: readonly string[];
  /** Both sides carry exactly the shared names. */
  readonly exact: boolean;
}

/** Native field observations; neither a copy threshold nor an ownership verdict. */
export interface ShapeCopyComparison {
  readonly contract: ShapeCopySource;
  readonly shared: number;
  readonly agreeing: number;
  readonly exact: boolean;
}

export type ShapeFieldAgreement = (candidate: Node, source: Node, field: string) => boolean;
