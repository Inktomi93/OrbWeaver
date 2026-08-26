// The babel AST subset the arid predicate reads, plus the census shapes its CLI reports.
/** The babel AST subset this predicate reads. Named here rather than imported: `@stryker-mutator/api`
 *  declares `NodePath` as an EMPTY interface (the real type is babel's, which is not a dependency here),
 *  so the shape has to be named locally. Method parameters are bivariant, which is what lets the class
 *  below still satisfy `Ignorer`. */
export interface AridNode {
  readonly type: string;
  readonly name?: string;
  readonly callee?: AridNode;
  readonly arguments?: readonly AridNode[];
  readonly object?: AridNode;
  readonly property?: AridNode;
  readonly computed?: boolean;
  readonly left?: AridNode;
  readonly right?: AridNode;
  readonly key?: AridNode;
  /** A node on `ObjectProperty` (the position this predicate reads); a primitive on a literal node. */
  readonly value?: AridNode | string | number | boolean;
  readonly properties?: readonly AridNode[];
  /** SwitchCase: absent/null marks the `default:` arm. */
  readonly test?: AridNode | null;
  /** SwitchCase's statements. */
  readonly consequent?: readonly AridNode[];
  /** BlockStatement's statements. */
  readonly body?: readonly AridNode[];
  /** VariableDeclaration's declarators. */
  readonly declarations?: readonly AridNode[];
  /** VariableDeclarator's binding — carries the type annotation this predicate reads. */
  readonly id?: AridNode;
  /** TSTypeAnnotation wrapper (`id.typeAnnotation.typeAnnotation.type === "TSNeverKeyword"`). */
  readonly typeAnnotation?: AridNode;
}

export interface AridPath {
  readonly node: AridNode;
  readonly parentPath?: AridPath | null;
}

/** One reason the ignorer fired, and how often, in a Stryker report. */
export interface AridReason {
  readonly reason: string;
  readonly count: number;
}

/** What the ignorer dropped from a report's denominator — the evidence a recalibration rests on. */
export interface AridCensus {
  readonly reportPath: string;
  readonly ignored: number;
  readonly scoredDenominator: number;
  readonly byReason: readonly AridReason[];
}
