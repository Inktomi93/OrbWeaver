// Native JSON column read anchors and select/insert row identities.
import type { Node, Type } from "ts-morph";

/** One member read of a column name: `row.col`, `row["col"]`, `row[KEY]` or a `{ col }` destructure. */
export interface ColumnRead {
  readonly column: string;
  /** The node the finding anchors on, and the authored text at `offset` that names the read. */
  readonly anchor: Node;
  readonly offset: number;
  readonly token: string;
  /** The node whose type is the receiver's. */
  readonly receiver: Node;
  /** The node carrying the read value: the access itself, or the destructured binding's name. */
  readonly value: Node;
}

/** What the reader judges a row by: each table's select- and insert-model type identity, and every column's
 *  declaration node. */
export interface RowModels {
  readonly select: ReadonlySet<unknown>;
  readonly insert: ReadonlySet<unknown>;
  readonly columns: ReadonlySet<unknown>;
}

/** Keep every contributing source type and origin until TypeScript narrows the actual read. */
export interface RowOrigin {
  readonly sourceType: Type;
  readonly kind: "schema" | "plain" | "unresolved";
  readonly table?: Node | undefined;
  readonly partitionType?: Type | undefined;
  /** A `Pick`/`Omit` projection: members of the row are absent, so a sibling arm may re-supply one. */
  readonly dropsMembers?: boolean | undefined;
}

export interface RowReadServices {
  readonly model: (node: Node, path: readonly string[]) => boolean;
  readonly exactModel: (node: Node) => boolean;
  readonly identity: typeof import("./type-member-origin.ts").resolveTypeIdentityOrigin;
  readonly property: typeof import("./type-member-origin-core.ts").resolveTypePropertyOrigin;
  readonly lexical: typeof import("./reference-fact.ts").resolveLexicalValueDeclaration;
  readonly target: typeof import("./call-returns.ts").readCallTarget;
  readonly columnDeclaration: (node: Node) => boolean;
  readonly columnReference: (node: Node) => boolean;
}
