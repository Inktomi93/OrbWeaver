// Gate: dialog-via-composite (derive-modernization-audit.md §W1 G24). A client feature importing the raw
// Dialog root hand-assembles modal anatomy that a composite should own. Permanent non-form species use one
// exact ordinary marker per named import. Two temporary chat migrations are warning debt in the sibling.
//
// The legacy predicate remains features/**/*.tsx; the subject remains the first named exported-name Dialog
// import from the literal @orb/ui/dialog module. The private allowlist stale loop moves to central marker
// reconciliation, which catches stale, misplaced, and over-broad markers across every ordinary policy.
import { defineGate } from "../contract/policy.ts";
import { dialogRootImportFact } from "../lib/dialog-root-import.ts";

const MESSAGE = "a features/** file imports the raw `Dialog` root from @orb/ui/dialog — use FormDialog for a form/prompt or ConfirmDialog for an alert.";
const FIX =
  "compose FormDialog / TagPickerDialog / ConfirmDialog from #components; a permanent non-form species may waive this exact named import with `@orb-waive dialog-via-composite(Dialog): <why + end condition>`.";

export const gate = defineGate({
  id: "dialog-via-composite",
  family: "dialog-root-import",
  authority: "ordinary",
  severity: "error",
  population: "@client",
  analysis: "syntax",
  execution: "entire-population",
  facts: [dialogRootImportFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      const fact = ctx.fact(dialogRootImportFact);
      const hits = fact.occurrences.filter((hit) => !hit.debt);
      ctx.receipt({ kind: "population", source: "dialog-root-import sources", members: fact.sources });
      for (const hit of hits) {
        ctx.report.node(hit.node, { token: "Dialog", offset: 0 });
      }
    },
  }),
  mustFlag: [
    {
      mode: "source",
      files: {
        "packages/client/src/features/demo/components/demo-dialog.tsx":
          'import { Dialog, DialogPopup } from "@orb/ui/dialog";\nexport const X = () => <Dialog><DialogPopup /></Dialog>;\n',
      },
      expect: { count: 1, token: "Dialog" },
      why: "legacy mustFlag[0]: an ordinary feature hand-assembles a raw Dialog and reports the named root import",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/demo/components/aliased-dialog.tsx":
          'import { Dialog as RawDialog } from "@orb/ui/dialog";\nexport const X = () => <RawDialog />;\n',
      },
      expect: { count: 1, token: "Dialog" },
      why: "the exported name remains Dialog through a local alias, matching the legacy getName predicate",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/client/src/features/demo/components/demo-form-dialog.tsx":
          'import { FormDialog } from "#components";\nexport const X = () => <FormDialog />;\n',
      },
      why: "legacy mustPass[0]: a FormDialog consumer imports no raw root",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/demo/components/demo-native-form-dialog.tsx":
          'import { DialogClose } from "@orb/ui/dialog";\nimport { FormDialog } from "#components";\nexport const X = () => <FormDialog><DialogClose /></FormDialog>;\n',
      },
      why: "legacy mustPass[1]: DialogClose alone is not the Dialog root",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/chat/components/rename-chat-dialog.tsx": 'import { Dialog } from "@orb/ui/dialog";\nexport const X = () => <Dialog />;\n',
      },
      why: "legacy mustPass[2] is classified into the warning-debt sibling rather than this error owner",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/demo/components/waived-dialog.tsx":
          '// @orb-waive dialog-via-composite(Dialog): a permanent non-form species, tracked in #0000.\nimport { Dialog, DialogPopup } from "@orb/ui/dialog";\nexport const X = () => <Dialog><DialogPopup /></Dialog>;\n',
      },
      why:
        "the §6.2 positive identity arm: the correct marker at the exact reported named-import token `Dialog` " +
        "suppresses the twin of mustFlag[0] — one finding, one waived, zero effective findings, zero authority alarms",
    },
  ],
});
