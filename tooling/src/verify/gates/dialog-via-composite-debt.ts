// Two temporary chat-lane raw Dialog migrations. The shared fact classifies only these exact #2350 paths;
// every other raw Dialog import remains an error in dialog-via-composite.
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
        "packages/client/src/features/chat/components/rename-chat-dialog.tsx": 'import { Dialog } from "@orb/ui/dialog";\nexport const X = () => <Dialog />;\n',
      },
      expect: { count: 1, token: "Dialog" },
      why: "legacy mustPass[2], reclassified as live warning debt owned by #2350",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/chat/components/invite-dialog.tsx": 'import { Dialog } from "@orb/ui/dialog";\nexport const X = () => <Dialog />;\n',
      },
      expect: { count: 1, token: "Dialog" },
      why: "the second temporary chat-lane exception is the same #2350 debt species",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/client/src/features/chat/components/other-dialog.tsx": 'import { Dialog } from "@orb/ui/dialog";\nexport const X = () => <Dialog />;\n',
      },
      why: "a new chat raw import is not in the two-path debt class; the error sibling owns it",
    },
  ],
});
