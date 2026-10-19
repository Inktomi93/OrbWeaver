// The typed surface of the tenancy READER (`lib/tenancy-read.ts`) — the shape the (a)-class tenancy gates
// (`owner-scoped-reads`, `owner-scoped-writes`, `owner-scoped-upserts`) judge their
// verdicts off. Homed in contract/ per the five-slot type law (docs/law/Core-Tooling-Law.md §2.5): `lib/` is plumbing, and an
// exported shape declared there is `no-inline-types`-RED, exactly as a domain substrate exporting a type is.
import type { Node } from "ts-morph";
import type { DrizzleValueSourceEvidence } from "../../floor/code-facts/drizzle-query-contract.ts";
import type { TypeObservationReader } from "../../floor/code-facts/type-observations-contract.ts";
import type { GatePolicyAnalysisDetails } from "./policy.ts";

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

export type { ReadAnchor } from "../../floor/code-facts/drizzle-query-contract.ts";

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

/** Native facts retain source rejection and type classification as separate consumer judgments. */
export interface TenancyPinServices {
  readonly sourceEvidence: (node: Node) => DrizzleValueSourceEvidence;
  readonly typeObservations: (node: Node) => TypeObservationReader;
}

export interface TenancyPinPass extends TenancyPinServices {
  readonly prepare: () => void;
  readonly assertSchema: (index: SchemaTableIndex) => void;
  readonly sql: import("../../floor/code-facts/drizzle-sql-facts-contract.ts").DrizzleSqlReader;
}

/** One row source a predicate value reads a column of: its written receiver, and its declared schema table
 *  (undefined for a subquery or CTE, which has no scoping class). */
export interface ValueReceiver {
  readonly receiver: string;
  readonly table: string | undefined;
  readonly node?: Node;
}

/** What a predicate VALUE reads: the row sources whose columns it names, and the subselects it runs. A value
 *  with neither still scopes only when its type is a plain string id (the pin readers' `isPlainValue`). */
export interface ValueSources {
  readonly unresolved: boolean;
  readonly receivers: readonly ValueReceiver[];
  readonly subselects: readonly Node[];
}

/** A local observation, not runtime authorization or SQL-carrier containment. */
export type DirectOwnerRead = GatePolicyAnalysisDetails & { readonly finding?: string };

export interface DirectOwnerReadScope {
  readonly calls: ReadonlyMap<Node, import("../../floor/code-facts/drizzle-evidence-contract.ts").DrizzleCallEvidence>;
  readonly columns: ReadonlyMap<Node, import("../../floor/code-facts/drizzle-evidence-contract.ts").DrizzleCallEvidence>;
  readonly index: SchemaTableIndex;
  readonly ownerTables: ReadonlySet<string>;
  readonly fkEdges: ReadonlySet<string>;
  readonly derivedParents: ReadonlyMap<string, ReadonlySet<string>>;
}

export interface DirectOwnerReadInputs {
  readonly calls: readonly Node[];
  readonly columns: readonly Node[];
}
