// The ROW SHAPES of the "the ledger killed this shape BY NAME" table (#1988). The rows themselves stay in
// `lib/ledger-banned-shapes.ts` — that module is the data plus its D-cites — but the two partition unions
// and the five row interfaces are imported BY `gates/schema-banned-shapes.ts` and
// `gates/contract-banned-shapes.ts`, which narrow on `kind`. A shape a policy narrows is cross-boundary and
// `lib/` is not a type home (Spine-TypeScript-and-Patterns.md §7.4, Core-Tooling-Law.md §2.5).

/** A named column that must not exist on a named table. */
export interface LedgerColumnBan {
  readonly kind: "column";
  readonly table: string;
  readonly column: string;
  readonly cite: string;
}

/** A FAMILY of column names on a named table (`chats.*presetId*`), with the label the finding prints.
 *  @public knip type-face false positive — an arm of the exported `SchemaBannedShape` union (line 56), reached by narrowing on
 *  its discriminant and never named at a call site. */
export interface LedgerColumnPatternBan {
  readonly kind: "column-pattern";
  readonly table: string;
  readonly pattern: RegExp;
  readonly label: string;
  readonly cite: string;
}

/** A whole table the ledger refused.
 *  @public knip type-face false positive — an arm of the exported `SchemaBannedShape` union (line 54), reached by narrowing on
 *  its discriminant and never named at a call site. */
export interface LedgerTableBan {
  readonly kind: "table";
  readonly table: string;
  readonly cite: string;
}

/** A member that must not appear on a named exported interface. `home` is the declaration's ONE home: a
 *  name-keyed ban whose subject stops resolving there is a silent no-op, so the policy REDs on it.
 *  @public knip type-face false positive — an arm of the exported `ContractBannedShape` union (line 53), reached by narrowing on
 *  its discriminant and never named at a call site. */
export interface LedgerInterfaceFieldBan {
  readonly kind: "interface-field";
  readonly typeName: string;
  readonly field: string;
  readonly home: string;
  readonly cite: string;
}

/** A key that must not appear in a named exported Zod object schema's shape.
 *  @public knip type-face false positive — an arm of the exported `ContractBannedShape` union (line 51), reached by narrowing on
 *  its discriminant and never named at a call site. */
export interface LedgerSchemaFieldBan {
  readonly kind: "schema-field";
  readonly schemaVar: string;
  readonly field: string;
  readonly home: string;
  readonly cite: string;
}

export type SchemaBannedShape = LedgerColumnBan | LedgerColumnPatternBan | LedgerTableBan;
export type ContractBannedShape = LedgerInterfaceFieldBan | LedgerSchemaFieldBan;
