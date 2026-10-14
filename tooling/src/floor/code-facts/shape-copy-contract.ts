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

/** Native field observations; neither a copy threshold nor an ownership verdict. */
export interface ShapeCopyComparison {
  readonly contract: ShapeCopySource;
  readonly shared: number;
  readonly agreeing: number;
  readonly exact: boolean;
}

export type ShapeFieldAgreement = (candidate: Node, source: Node, field: string) => boolean;
