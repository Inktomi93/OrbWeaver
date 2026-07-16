// Gate: bound-field-via-hook (derive-modernization-audit.md §W3, G28 — the useBoundField hook sealed).
// Every bound field reads its `useFieldContext<T>()`, touch-gates the error, and assembles the same
// `<Field>` prop bundle; `useBoundField` (packages/client/src/forms/bound-fields/use-bound-field.ts) is
// the ONE home for that wiring. A bound field that imports `useFieldContext` DIRECTLY re-hand-rolls the
// prop bundle that drifts (the audit's "declared the ONE home, 7 of 10 never adopted it" rot). The G9
// import-specifier shape: a `useFieldContext` named import under `forms/bound-fields/**` — anywhere but
// the hook's own home — is RED (D72: a machine ships WITH its seal).
import type { ImportSpecifier } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const BOUND_FIELDS_DIR = "packages/client/src/forms/bound-fields/";
const HOOK_HOME = "packages/client/src/forms/bound-fields/use-bound-field.ts";
const HOOK = "useFieldContext";

const MESSAGE =
  "a bound field imports `useFieldContext` directly — every bound field's context-read + touch-gated error + `<Field>` prop bundle lives in ONE home. Use `useBoundField<T>(shell)` from ./use-bound-field instead. (derive-modernization-audit.md §W3, G28; D72 — a machine ships WITH its seal.)";

/** Is this ImportSpecifier the `useFieldContext` hook (the form contexts read-hook)? */
function isUseFieldContext(spec: ImportSpecifier): boolean {
  return spec.getName() === HOOK;
}

export const gate: GateDescriptor = {
  name: "bound-field-via-hook",
  docRow: "proposed/derive-modernization-audit.md §W3 (G28)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "replace the raw `useFieldContext<T>()` + hand `touchedFieldError`/`<Field>` bundle with `useBoundField<T>(shell)` from ./use-bound-field.",
  // Every bound-fields file EXCEPT the hook home (which legitimately imports the raw context read-hook).
  scanRoot: (p) => p.startsWith(BOUND_FIELDS_DIR) && p !== HOOK_HOME,
  kinds: [SyntaxKind.ImportSpecifier],
  visit: (node, _sf, ctx) => {
    if (Node.isImportSpecifier(node) && isUseFieldContext(node)) {
      ctx.report(node, { token: HOOK, offset: 0 });
    }
  },
  mustFlag: [
    {
      files: 'import { useFieldContext } from "../contexts";\nexport const f = useFieldContext;\n',
      at: "packages/client/src/forms/bound-fields/x-field.tsx",
      why: "a bound field importing the raw `useFieldContext` door directly — the re-hand-roll G28 seals",
    },
  ],
  mustPass: [
    {
      files: 'import { useFieldContext } from "../contexts";\nexport const f = useFieldContext;\n',
      at: HOOK_HOME,
      why: "the hook's own home is the ONE sanctioned `useFieldContext` site — scanRoot excludes it",
    },
    {
      files: 'import { useBoundField } from "./use-bound-field";\nexport const f = useBoundField;\n',
      at: "packages/client/src/forms/bound-fields/x-field.tsx",
      why: "a bound field on the hook (the fix) imports `useBoundField`, never the raw context — passes",
    },
    {
      files: 'import { useFieldContext } from "../contexts";\nexport const f = useFieldContext;\n',
      at: "packages/client/src/forms/use-app-form.ts",
      why: "a `useFieldContext` import OUTSIDE bound-fields/ (the form toolkit) is out of scope — only the family is keyed",
    },
  ],
};
