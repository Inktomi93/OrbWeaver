// The shape lib/spelling-twins.ts returns. Homed here because the five-slot template puts every exported
// shape in contract/ (docs/law/Core-Tooling-Law.md §2.5) and `no-inline-types` enforces it.

/** A gate fixture RESPELLED into the two spellings that escape a naive detector (#1506). Each arm is
 *  `undefined` when the fixture carries nothing of that shape to respell — a REFUSAL the caller counts and
 *  prints, never a silent pass. */
export interface SpellingTwin {
  /** every `x.foo` rewritten to `x["foo"]` */
  readonly bracket: Readonly<Record<string, string>> | undefined;
  /** every `import { foo } from "m"` rewritten to `import * as ns from "m"` + `ns.foo` */
  readonly namespace: Readonly<Record<string, string>> | undefined;
}
