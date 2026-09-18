// Macro resolution must remain read-only: saving a resolved field destroys its template.
// Exact central home grants replace the private SANCTIONED table. The shared fact preserves
// the legacy name-keyed import/bare-call grammar; this does not prove downstream data flow.
import { defineGate } from "../contract/policy.ts";
import { macroResolutionFact } from "../lib/macro-resolution-fact.ts";
import { reportReviewedGrantFileCandidates } from "../lib/reviewed-grant-findings.ts";

const MESSAGE =
  "macro resolution requires an exact reviewed read-only home; editable surfaces must display and persist RAW template text. (tooling/src/verify/gates/GATE-AUTHORING.md)";
const FIX = "render the raw template in writable fields. Review an exact read-only home centrally; editor-adjacent readouts also need a token-roundtrip CT.";
export const gate = defineGate({
  id: "macro-resolution-home",
  family: "macro-resolution",
  authority: "reviewed-grant",
  severity: "error",
  population: ["@client", "@ui"],
  analysis: "syntax",
  execution: "entire-population",
  facts: [macroResolutionFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      const { uses } = ctx.fact(macroResolutionFact);
      ctx.receipt({ kind: "population", source: "macro-resolution-home-sources", members: ctx.files.length });
      reportReviewedGrantFileCandidates(
        ctx.report,
        uses.map(({ file, line, name }) => ({
          subject: file,
          operation: "macro-resolution",
          file,
          line,
          note: name,
        })),
        { message: MESSAGE, fix: FIX, unreadableMessage: MESSAGE },
      );
    },
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/client/src/features/preset/editor.tsx": 'import { processMacros } from "@orb/kit/macro"; processMacros();' },
      grant: { subject: "packages/client/src/features/preset/editor.tsx", operation: "macro-resolution" },
      expect: { count: 1, messageIncludes: "processMacros" },
      why: "an import and call in one editor are one exact home obligation, with both actionable sites retained",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/client/src/features/preset/editor.tsx": 'import { scanMacroRuns } from "@orb/kit/macro"; scanMacroRuns("{{user}}");' },
      why: "tokenizing a template does not resolve it and stays legal in an editor",
    },
  ],
});
