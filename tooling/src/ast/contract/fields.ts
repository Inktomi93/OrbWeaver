// The `contract-field-liveness` lens's own shapes. Split out of `contract/types.ts` at #879 rather than
// grown inside it: that file sits ~15 lines under the 450-line `tooling-size` cap, so anything added there
// pushes the whole tool over. A multi-file `contract/` dir is the sanctioned shape (`verify/contract/` has
// nineteen). `ContractField`/`FieldReadSites` deliberately STAY in types.ts — moving them would relocate
// hunks other lanes are editing.
import type { FieldReadSites } from "./types.ts";

/** The head/tail literal text bracketing a template expression's substitutions — the evidence behind
 *  `contract-field-liveness`'s `template-key` class (a producer builds the key, so no key index can see it).
 *  Homed here beside `Hit` deliberately, away from the `ContractField`/`FieldReadSites` block. */
export interface TemplateBracket {
  readonly head: string;
  readonly tail: string;
}

/** Every index `contract-field-liveness` derives from the production corpus in one walk. `consumed`'s shape
 *  is CONSUMED VERBATIM by the viewgap lens (both must agree about what a read is) — widen this record,
 *  never that map. */
export interface FieldIndexes {
  readonly produced: Set<string>;
  readonly consumed: Map<string, FieldReadSites>;
  /** `<owner>.<field>` for every schema-composition alias — the #879 permanent-false-positive fence. */
  readonly aliased: Set<string>;
  readonly templates: readonly TemplateBracket[];
}

/** Why a `contract-field-liveness` hit has no producer, DERIVED from the tree. `unclassified` is the only
 *  one worth a human read; the other three are structurally permanent. */
const FIELD_HIT_CLASSES = ["template-key", "guest", "foreign-format", "unclassified"] as const;
export type FieldHitClass = (typeof FIELD_HIT_CLASSES)[number];
