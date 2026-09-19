// The typed surface of the tenancy READER (`lib/tenancy-read.ts`) — the shape the (a)-class tenancy gates
// (`owner-scoped-writes`, `owner-scoped-upserts`, `table-scoping-class`) judge their verdicts off. Homed in
// contract/ per the five-slot type law (docs/architecture/core/Core-Tooling-Law.md §2.5): `lib/` is plumbing, and an
// exported shape declared there is `no-inline-types`-RED, exactly as a domain substrate exporting a type is.

/** What a drizzle statement's table argument resolved to. The three READ verdicts a tenancy gate must judge
 *  differently — the fourth state (the argument is not an identifier at all) is `undefined`, because a
 *  property access / call / literal is not a BINDING and the reader makes no claim about it. */
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
