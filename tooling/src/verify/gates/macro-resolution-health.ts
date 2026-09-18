// A renamed resolver cannot silently escape a name-keyed enforcement boundary.
import { defineGate } from "../contract/policy.ts";
import { MACRO_RESOLVERS, macroResolutionFact } from "../lib/macro-resolution-fact.ts";

export const gate = defineGate({
  id: "macro-resolution-health",
  family: "macro-resolution",
  authority: "hard",
  severity: "error",
  population: ["@kit", "@client", "@ui"],
  analysis: "syntax",
  execution: "entire-population",
  facts: [macroResolutionFact],
  resources: [],
  message: "a macro resolver declaration disappeared; the name-keyed policy is now blind to that entry point. (tooling/src/verify/gates/GATE-AUTHORING.md)",
  fix: "retarget the resolver vocabulary in lib/macro-resolution-fact.ts at the renamed entry point and retain its editor protection.",
  create: (ctx) => ({
    evaluate: () => {
      const { declared } = ctx.fact(macroResolutionFact);
      ctx.receipt({ kind: "population", source: "macro-resolution-health-sources", members: ctx.files.length });
      const anchor = ctx.files[0];
      if (anchor === undefined) {
        throw new Error("macro-resolution-health: no admitted source anchor");
      }
      for (const name of MACRO_RESOLVERS) {
        if (!declared.has(name)) {
          ctx.report.file(ctx.relativePath(anchor), {
            line: 1,
            message: `${name} is no longer declared under packages/{kit,client}/src — the macro policy is now blind to this entry point.`,
          });
        }
      }
    },
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/client/src/example.ts": "export const x = 1;" },
      expect: { count: 5 },
      why: "all five resolver names disappeared; the policy cannot be licensed by a source waiver",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/kit/src/macro/example.ts":
          "export function resolveRowMacros() {} export function processMacros() {} export function createMacroContext() {} export function evaluateMacros() {} export function renderMessageForDisplay() {}",
      },
      why: "all five direct declarations remain observable under the legacy declaration population",
    },
  ],
});
