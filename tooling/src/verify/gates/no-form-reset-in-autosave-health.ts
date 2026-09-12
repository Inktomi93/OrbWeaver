// Policy: no-form-reset-in-autosave-health — the TYPE-STRIP tripwire for the sibling
// `no-form-reset-in-autosave` occurrence policy (family `editor-form-factory`, whose shared reader
// `lib/editor-form-factory.ts` also names this policy's exact subject `EDITOR_FORM_CONTRACT_FILE`; the
// family, population and §12.7 carry-forward receipts are recorded on the occurrence sibling). The autosave session's form surface is
// declared `Omit<AppFormInstance<TValues>, "reset">` in `forms/editor/autosave-contract.ts`, and that
// strip is the ONLY thing standing between a call site and the #1144 isDirty loop before the occurrence
// arms ever get a chance. If the strip disappears, the sibling policy still passes — there is simply
// nothing left for it to catch, because `.reset(` becomes legal TypeScript again.
//
// WHY IT IS A SEPARATE POLICY AND NOT A THIRD ARM. It is an ABSENCE verdict about one exact file: there
// is no authored node to anchor on, so it cannot carry an ordinary position token
// (`lib/ordinary-waiver.ts:394` requires an ordinary finding's token to be authored text at its own
// line/column, and the legacy descriptor's synthetic `omit-strip` token would have raised a binding
// failure and an authority alarm on the first real waiver). It is also not something an occurrence waiver
// should ever be able to switch off. `authority: "hard"` gives it no suppression door at all, and one
// authority per descriptor (§12.1) makes the split mandatory rather than stylistic.
//
// `execution: "entire-population"` is deliberate: "is the strip still there" is a verdict about a file
// that a narrowed/changed-files run may not have selected, and a run that did not look must DEFER rather
// than report the file clean.
//
// A RENAMED or DELETED contract file is not a gate-level finding here — `population.named` resolving to
// zero paths from a nonempty `@client` candidate set is a TOOL ERROR at population resolution itself
// (`resolvePopulation` throws "admitted zero paths"), which is a LOUDER signal than the legacy gate could
// produce: the legacy descriptor simply never visited the file and passed in silence, which is exactly
// the blind spot a rename would have opened. That is a strengthening the population algebra gives for
// free; the rows below prove the part it cannot see — the file still exists and the strip is gone.
//
// LEGACY SHA: b849e7add (`git show b849e7add:tooling/src/verify/gates/no-form-reset-in-autosave.ts`,
// `modelFileViolations`).
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { EDITOR_FORM_CONTRACT_FILE } from "../lib/editor-form-factory.ts";

const OMIT = "Omit";
const STRIPPED = '"reset"';

const MESSAGE =
  'the reset type-strip (Omit<…, "reset">) is gone from the autosave factory\'s returned surface — ' +
  "reset MUST stay removed (it is the autosave infinite loop, UI-Gates-and-Lessons.md §7 row 2); " +
  "restore the Omit in forms/editor/autosave-contract.ts.";

export const gate = defineGate({
  id: "no-form-reset-in-autosave-health",
  family: "editor-form-factory",
  authority: "hard",
  severity: "error",
  population: { in: ["@client"], under: ["packages/client/src/forms/editor/**"], named: ["autosave-contract.ts"] },
  analysis: "syntax",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  create: (ctx) => {
    const stripped = new Set<string>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.TypeReference],
          visit: (node, sourceFile): void => {
            if (!Node.isTypeReference(node) || node.getTypeName().getText() !== OMIT) {
              return;
            }
            if (node.getText().includes(STRIPPED)) {
              stripped.add(ctx.relativePath(sourceFile));
            }
          },
        },
      ],
      evaluate: (): void => {
        for (const sourceFile of ctx.files) {
          const path = ctx.relativePath(sourceFile);
          if (!stripped.has(path)) {
            ctx.report.file(path, { line: 1, message: MESSAGE });
          }
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "source",
      files: {
        [EDITOR_FORM_CONTRACT_FILE]: "export interface AutosaveSession {\n  readonly form: { reset: () => void };\n}\n",
      },
      expect: { count: 1, line: 1 },
      why: 'THE FOUNDING ROW, carried from the legacy descriptor\'s `modelFileViolations`: the TYPE-HOME file declares the session surface with NO `Omit<…, "reset">` strip, so `reset` is back on the autosave form and the occurrence sibling has nothing left to catch. The finding is file-anchored at line 1 because an absence has no node',
    },
    {
      mode: "source",
      files: {
        [EDITOR_FORM_CONTRACT_FILE]:
          'export type Widened<T> = Omit<T, "onSubmit">;\nexport interface AutosaveSession {\n  readonly form: Widened<{ reset: () => void; x: 1 }>;\n}\n',
      },
      expect: { count: 1, line: 1 },
      why: 'THE NEAR MISS: an `Omit<…>` IS present, but it strips something else. The arm asks for `Omit` AND the literal `"reset"` together, so a strip of a different member does not acquit the file — drop the `"reset"` half of the test and this row is the one that dies',
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        [EDITOR_FORM_CONTRACT_FILE]: 'export interface AutosaveSession {\n  readonly form: Omit<{ reset: () => void; x: 1 }, "reset">;\n}\n',
      },
      why: "THE POSITIVE CONTROL for the strip: the type home WITH the Omit is clean. Carried from the legacy descriptor, where its `why` recorded the point that still holds — the check reads the DECLARATION, not the file name",
    },
    {
      mode: "source",
      files: {
        [EDITOR_FORM_CONTRACT_FILE]:
          'export type AutosaveForm<T extends object> = Omit<T, "reset">;\nexport interface AutosaveSession {\n  readonly form: AutosaveForm<{ x: 1 }>;\n}\n',
      },
      why: 'the LIVE spelling as of 2026-09-12: the strip is an exported ALIAS (`AutosaveForm<T> = Omit<AppFormInstance<T>, "reset">`) that the session member then references. The arm looks for the `Omit` type reference anywhere in the file rather than on the member itself, which is what makes the real contract file pass — a member-only reader would have reported the live tree',
    },
    {
      mode: "source",
      files: {
        "packages/client/src/forms/editor/autosave-contract.ts": 'export type AutosaveForm<T extends object> = Omit<T, "reset">;\n',
        "packages/client/src/forms/editor/create-autosave-entity-form.tsx": "export interface Elsewhere {\n  readonly form: { reset: () => void };\n}\n",
      },
      why: "THE POPULATION FENCE, pinned: a strip-less declaration in the FACTORY file beside a compliant contract file is not this policy's finding — the strip lives in the TYPE HOME, and the factory file is the sibling occurrence policy's subject. Drop `named: [\"autosave-contract.ts\"]` and this row is the one that dies",
    },
  ],
});
