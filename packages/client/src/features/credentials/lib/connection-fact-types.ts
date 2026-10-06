// Pure connection-editor fact grammar; pricing and capability row builders share one shape.

/**
 * The control an Override reveals for ONE fact. Six kinds cover every row in both blocks — which is WHY
 * both blocks are flattened to LEAVES.
 *
 * STATED DEVIATION FROM THE MOCK (Board B): the drawing joins two composite quirks into one reading row
 * (`sleep endpoints: /is_sleeping · /wake_up`, `price: $x in · $y out`). A joined row reads fine and has no
 * editor, and §5.3a's affordance is ONE OVERRIDE PER FIELD — an Override that silently skips the composite
 * fields is that affordance with holes in it. Splitting them costs one extra line of reading each and makes
 * every row in both blocks overridable through the same four controls.
 */
/** NOT exported: `no-inline-types` refuses an exported UNION outside a type home, and no consumer needs
 *  the name — a component types its parameter as `FactRow["edit"]`, which is the same type by construction. */
type FactEdit =
  | { readonly kind: "text" }
  | { readonly kind: "number"; readonly min?: NumberBound; readonly max?: NumberBound }
  | { readonly kind: "boolean"; readonly labels?: BooleanLabels }
  | { readonly kind: "list" }
  | { readonly kind: "enum"; readonly options: readonly string[] }
  | { readonly kind: "choice"; readonly choices: readonly FactChoice[] };

/** How a boolean fact reads when "yes"/"no" would hide what the value means. */
export interface BooleanLabels {
  readonly yes: string;
  readonly no: string;
}

/** One answer of a `choice` fact, for a leaf whose answers are not one scalar each: the label it reads as, the
 *  value its Override writes at the leaf's path, and whether a resolved value reads as it. */
export interface FactChoice {
  readonly label: string;
  readonly writes: unknown;
  readonly matches: (value: unknown) => boolean;
}

/** A bound on the values a number fact takes, and how it reads. */
export interface NumberBound {
  readonly value: number;
  readonly reads: string;
}

export interface FactRow {
  /** The DOTTED path from the `declared` block's root (`features.prefill`, `generation.context.window`) —
   *  the React key, the subject of the row's `Override`/`Reset` accessible name, and the write target. */
  readonly path: string;
  /** The key column. Plain words except where the string IS the wire's (§5.3a: `prefill` survives raw). */
  readonly name: string;
  /** The resolved value, formatted for reading. */
  readonly value: string;
  /** Where the resolved value came from — only ever what this client can actually prove. */
  readonly source: string;
  /** `true` ⇒ the row's own `declared` block states this field: a colour change and `Reset` instead of
   *  `Override`. */
  readonly overridden: boolean;
  /** `true` ⇒ the value is set somewhere else, which `source` names, so the row offers no `Override`. */
  readonly setElsewhere?: boolean;
  readonly edit: FactEdit;
  /** What the Override control opens seeded with — the resolved value in the control's own spelling. */
  readonly draft: string;
  /** Paths a write must set ALONGSIDE the leaf because their schema requires them: `rangeSchema` needs
   *  `min` beside `max`, so a bare `max` write would not parse. Empty on every row but that one. */
  readonly siblings: Readonly<Record<string, unknown>>;
}

/** One row's static description — the reading name, the control, and how the raw value reads. */
export interface FactLeaf {
  readonly path: string;
  readonly name: string;
  readonly edit: FactEdit;
  readonly format?: (value: unknown) => string;
  /** Present ⇒ the leaf renders even when the fold states no value, reading as this, so it can be declared. */
  readonly unset?: string;
  /** The flag (a dotted path from the same root) the fold sets when this value is a floor guess. */
  readonly estimatedBy?: string;
}
