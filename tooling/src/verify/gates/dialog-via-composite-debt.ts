// #2350 RESOLVED — both chat-lane raw Dialog paths migrated to FormDialog. The debt set is now empty, so
// this gate fires on zero paths. It survives as a proof that the migration landed and a regression guard:
// any future chat raw Dialog import will be caught by the sibling error gate, not by a dead debt tracker.
import { defineGate } from "../contract/policy.ts";
import { dialogRootImportFact } from "../lib/dialog-root-import.ts";

export const gate = defineGate({
  id: "dialog-via-composite-debt",
  family: "dialog-root-import",
  authority: "hard",
  severity: "warning",
  workItem: 2350,
  population: "@client",
  analysis: "syntax",
  execution: "entire-population",
  facts: [dialogRootImportFact],
  resources: [],
  message: "a temporary chat-lane raw Dialog remains pending migration to a composite (#2350).",
  fix: "migrate this dialog to FormDialog or the appropriate composite, then remove its resolved #2350 debt path from the shared classifier.",
  create: (ctx) => ({
    evaluate: () => {
      const fact = ctx.fact(dialogRootImportFact);
      const hits = fact.occurrences.filter((hit) => hit.debt);
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
        "packages/client/src/features/chat/components/debt-probe.tsx": 'import { Dialog } from "@orb/ui/dialog";\nexport const X = () => <Dialog />;\n',
      },
      expect: { count: 1 },
      why: "regression control: a raw Dialog import in a chat debt path MUST be caught",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/client/src/features/chat/components/rename-chat-dialog.tsx": 'import { Dialog } from "@orb/ui/dialog";\nexport const X = () => <Dialog />;\n',
      },
      why: "#2350 regression guard: rename-chat-dialog was migrated to FormDialog; a raw import here is a regression",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/chat/components/invite-dialog.tsx": 'import { Dialog } from "@orb/ui/dialog";\nexport const X = () => <Dialog />;\n',
      },
      why: "#2350 regression guard: invite-dialog was migrated to FormDialog; a raw import here is a regression",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/chat/components/other-dialog.tsx": 'import { Dialog } from "@orb/ui/dialog";\nexport const X = () => <Dialog />;\n',
      },
      why: "a new chat raw import is not in the debt class; the error sibling owns it",
    },
  ],
});
