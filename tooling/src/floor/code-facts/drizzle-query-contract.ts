// Native Drizzle row-source and statement observations; consumers decide their scoping obligations.
import type { CallExpression, Node } from "ts-morph";
import type { MemberReference } from "./reference-fact-contract.ts";

export interface DrizzleValueSources {
  readonly members: readonly MemberReference[];
  readonly subselects: readonly Node[];
}

export interface DrizzleBuilderChain {
  readonly top: Node;
  readonly calls: readonly CallExpression[];
}

/** A table a drizzle read statement binds: the `.from(T)` row source, a joined table with its ON condition
 *  (`undefined` for a `crossJoin`, which binds every row of `T`), or a relational-API read
 *  (`db.query.<t>.findFirst|findMany(config)`), whose `table` is the `<t>` member name. */
export type ReadAnchor =
  | { readonly kind: "from"; readonly call: CallExpression; readonly table: Node }
  | { readonly kind: "join"; readonly call: CallExpression; readonly table: Node; readonly on: Node | undefined }
  | { readonly kind: "relational"; readonly call: CallExpression; readonly table: Node; readonly config: Node | undefined };

/** The predicates one read statement carries beyond its anchor: every `.where` argument the chain (or a split
 *  builder's binding) applies, and the ON condition of every inner join after the anchor. `escapes` is true
 *  when an unexecuted builder leaves the function's view (passed to a call or returned), so a helper can
 *  apply or replace its filter unseen. */
export interface ReadStatement {
  readonly wheres: readonly Node[];
  readonly innerOns: readonly Node[];
  readonly escapes: boolean;
}
