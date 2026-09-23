// Gate: dialog-via-composite. A client feature importing the raw
// Dialog root hand-assembles modal anatomy that a composite should own. Permanent non-form species use one
// exact ordinary marker per named import.
//
// SOLE OWNER SINCE #2393 (2026-09-18). The `dialog-via-composite-debt` warning sibling is deleted: #2350
// migrated both chat paths, its `DIALOG_DEBT_PATHS` set emptied, and a policy whose flag class is empty
// cannot carry the nonempty `mustFlag` the contract requires — its one row had become an unsatisfiable
// claim that reported as a conformance TOOL ERROR. Its catalog row already carried the retirement clause
// ("retire the debt classifier when complete"). So there is no partition left to filter: EVERY occurrence
// the shared fact reports is this owner's, and the sibling's two regression guards moved here as mustFlag.
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
  // SINGLETON SINCE #2393, and the loader enforces it: with `dialog-via-composite-debt` deleted this policy
  // is the sole consumer of `lib/dialog-root-import.ts`, and `lib/policy-module.ts` requires a singleton
  // family to equal its one policy id. The shared reader keeps its own module name; only the FAMILY label,
  // which names a set of policies, follows the set down to one.
  family: "dialog-via-composite",
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
      ctx.receipt({ kind: "population", source: "dialog-root-import sources", members: fact.sources });
      for (const hit of fact.occurrences) {
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
    // THE TWO #2350 REGRESSION GUARDS, INHERITED FROM THE RETIRED DEBT SIBLING (#2393). They were that
    // gate's `mustPass` rows while the debt partition existed — a raw Dialog at either path was ITS
    // finding, not this one's. With the partition gone they flip arms rather than disappear: the property
    // the guards assert is unchanged ("these two paths were migrated to FormDialog, and a raw import at
    // either is a regression that gets caught"), only its OWNER moved. Delete them only when the paths do.
    {
      mode: "source",
      files: {
        "packages/client/src/features/chat/components/rename-chat-dialog.tsx": 'import { Dialog } from "@orb/ui/dialog";\nexport const X = () => <Dialog />;\n',
      },
      expect: { count: 1, token: "Dialog" },
      why: "#2350 regression guard: rename-chat-dialog was migrated to FormDialog PROMPT mode; a raw root import here is this owner's error",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/chat/components/invite-dialog.tsx": 'import { Dialog } from "@orb/ui/dialog";\nexport const X = () => <Dialog />;\n',
      },
      expect: { count: 1, token: "Dialog" },
      why: "#2350 regression guard: invite-dialog was migrated to FormDialog DISMISS mode; a raw root import here is this owner's error",
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
        "packages/client/src/features/demo/components/waived-dialog.tsx":
          '// @orb-waive dialog-via-composite(Dialog): a permanent non-form species, tracked in #0000.\nimport { Dialog, DialogPopup } from "@orb/ui/dialog";\nexport const X = () => <Dialog><DialogPopup /></Dialog>;\n',
      },
      why:
        "the §6.2 positive identity arm: the correct marker at the exact reported named-import token `Dialog` " +
        "suppresses the twin of mustFlag[0] — one finding, one waived, zero effective findings, zero authority alarms",
    },
  ],
});
