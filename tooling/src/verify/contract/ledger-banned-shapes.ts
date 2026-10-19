// The ROW SHAPES of the contract partition of the ledger's rejected shapes. The rows stay in `lib/ledger-banned-shapes.ts`;
// `gates/contract-banned-shapes.ts` narrows on `kind`. A shape a policy narrows is cross-boundary and `lib/` is not a type
// home (Spine-TypeScript-and-Patterns.md §7.4, Core-Tooling-Law.md §2.5).

/** A member that must not appear on a named exported interface. `home` is the declaration's ONE home: a
 *  name-keyed ban whose subject stops resolving there is a silent no-op, so the policy REDs on it.
 *  @public knip type-face false positive — an arm of the exported `ContractBannedShape` union, reached by narrowing on
 *  its discriminant and never named at a call site. */
export interface LedgerInterfaceFieldBan {
  readonly kind: "interface-field";
  readonly typeName: string;
  readonly field: string;
  readonly home: string;
  readonly cite: string;
}

/** A key that must not appear in a named exported Zod object schema's shape.
 *  @public knip type-face false positive — an arm of the exported `ContractBannedShape` union, reached by narrowing on
 *  its discriminant and never named at a call site. */
export interface LedgerSchemaFieldBan {
  readonly kind: "schema-field";
  readonly schemaVar: string;
  readonly field: string;
  readonly home: string;
  readonly cite: string;
}

export type ContractBannedShape = LedgerInterfaceFieldBan | LedgerSchemaFieldBan;
