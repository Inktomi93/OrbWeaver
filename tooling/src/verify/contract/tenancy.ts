// The typed surface of the tenancy READER (`lib/tenancy-read.ts`) — the shape the (a)-class tenancy gates
// (`owner-scoped-reads`, `owner-scoped-writes`, `owner-scoped-upserts`, `table-scoping-class`) judge their
// verdicts off. Homed in contract/ per the five-slot type law (docs/law/Core-Tooling-Law.md §2.5): `lib/` is plumbing, and an
// exported shape declared there is `no-inline-types`-RED, exactly as a domain substrate exporting a type is.
import type { CallExpression, Node } from "ts-morph";

/** What a drizzle statement's table argument resolved to. The three verdicts a tenancy gate must judge
 *  differently — the fourth state (the argument is a literal) is `undefined`: a literal names no table. */
export type TableTarget =
  /** Traced to a table of the CLASS THE CALLER ASKED ABOUT — `ident` is the LOCAL binding the predicate must
   *  name. The class is the reader's first set argument, not a fixed one: the (a)-class gates pass the
   *  `ownerId` set, `membership-write-fan` passes the (b)-class `membership` set (#1734). */
  | { readonly kind: "in-class"; readonly ident: string }
  /** Traced to a schema table of some OTHER scoping class — legitimately out of the asking gate's scope. */
  | { readonly kind: "other-table" }
  /** An identifier the resolver could NOT trace to any declared table: a parameter, a reassigned binding, an
   *  alias chain past the reader's depth cap or through a cycle, or an initializer shape it cannot read. NOT
   *  a clean answer — an unreadable target is an unproven one, so the gates report it rather than exempt it. */
  | { readonly kind: "unresolvable"; readonly ident: string };

/** A table a drizzle read statement binds: the `.from(T)` row source, a joined table with its ON condition
 *  (`undefined` for a `crossJoin`, which binds every row of `T`), or a relational-API read
 *  (`db.query.<t>.findFirst|findMany(config)`), whose `table` is the `<t>` member name. */
export type ReadAnchor =
  | { readonly kind: "from"; readonly call: CallExpression; readonly table: Node }
  | { readonly kind: "join"; readonly call: CallExpression; readonly table: Node; readonly on: Node | undefined }
  | { readonly kind: "relational"; readonly call: CallExpression; readonly table: Node; readonly config: Node | undefined };

/** The schema's tables as the tenancy readers key them: declared identifiers, and the SQL name to identifier
 *  map a typed table reference (`_.name`) resolves through. */
export interface SchemaTableIndex {
  readonly idents: ReadonlySet<string>;
  readonly identBySqlName: ReadonlyMap<string, string>;
}

/** One table a reference can name, on the gate side of the shared floor resolver: a declared schema table, a
 *  subquery with its inner select, or an honest unresolved. */
export type TableRef =
  | { readonly kind: "table"; readonly ident: string }
  | { readonly kind: "subquery"; readonly select: Node }
  /** A constant raw `sql` template row source, such as `(select 1)`, that interpolates nothing and names no schema table. */
  | { readonly kind: "no-table" }
  | { readonly kind: "unresolved" };

/** The predicates one read statement carries beyond its anchor: every `.where` argument the chain (or a split
 *  builder's binding) applies, and the ON condition of every inner join after the anchor. `escapes` is true
 *  when a `$dynamic()` builder leaves the function's view (passed to a call or returned), so a helper can
 *  apply or replace its filter unseen. */
export interface ReadStatement {
  readonly wheres: readonly Node[];
  readonly innerOns: readonly Node[];
  readonly escapes: boolean;
}

/** One FK-chain term binding a joined table: the bound table's declared identifier, its receiver as written
 *  (`chats`, or an alias), and the bound column as written (`chats.anchorPersonaId`), which a by-id term must
 *  not select on. */
export interface ChainTerm {
  readonly boundTable: string;
  readonly boundReceiver: string;
  readonly boundColumn: string;
}

/** One declared foreign key from a child table to a parent table, by column property name. */
export interface ForeignKeyColumns {
  readonly childColumn: string;
  readonly parentColumn: string;
}

/** What a predicate VALUE reads: the written receivers of the table or subquery columns it names, and the
 *  subselects it runs. A value with neither is a plain value (a parameter, a literal, a caller binding). */
export interface ValueSources {
  readonly receivers: readonly string[];
  readonly subselects: readonly Node[];
}

/** What a predicate's conjuncts are, read through `and(…)`, `const` bindings, array spreads and one helper hop:
 *  the leaf terms, and whether some conjunct could not be read (a parameter, a `let`, a destructured binding,
 *  a spread of a non-literal array, or a helper whose returns no reader resolves). */
export interface ConjunctLeaves {
  readonly leaves: readonly Node[];
  readonly opaque: boolean;
}
