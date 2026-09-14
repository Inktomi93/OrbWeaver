// Gate: css-length-tokens-grants — reviewed structural shell/query/class length identities.
import { defineGate } from "../contract/policy.ts";
import { CLEAN_PRODUCT_CSS, SOURCE_ANCHOR } from "../lib/css-family-proof-fixtures.ts";
import { cssLengthCandidates, SHELL_STYLESHEET, STRUCTURAL_LENGTH_OPERATION } from "../lib/css-length-policy.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";
import { reportReviewedGrantFileCandidates } from "../lib/reviewed-grant-findings.ts";
import { staticClassFact } from "../lib/static-class-facts.ts";

const MESSAGE = "an inherently structural raw CSS length requires one exact reviewed identity (tooling/src/verify/gates/css-length-tokens-grants.ts)";

export const gate = defineGate({
  id: "css-length-tokens-grants",
  family: "css-length-contract",
  authority: "reviewed-grant",
  severity: "error",
  population: "@frontend",
  analysis: "resource",
  execution: "entire-population",
  facts: [staticClassFact],
  resources: [{ kind: "product-css" }],
  message: MESSAGE,
  fix: "review this exact structural mechanic and add one central grant with the condition that ends it; reusable values belong in tokens",
  create: (ctx) => ({
    evaluate: () => {
      const css = readyResourceValue(ctx.resources.cssInventory("product"));
      const candidates = cssLengthCandidates(css, ctx.fact(staticClassFact), (node) => ctx.relativePath(node.getSourceFile())).filter(
        ({ structural }) => structural,
      );
      reportReviewedGrantFileCandidates(
        ctx.report,
        candidates.map(({ file, line, subject }) => ({ file, line, subject, operation: STRUCTURAL_LENGTH_OPERATION })),
        {
          message: MESSAGE,
          unreadableMessage: `a structural length identity could not be read — ${MESSAGE}`,
          fix: "review the exact subject or replace it with a token",
        },
      );
      ctx.receipt({
        kind: "population",
        source: `css-length-tokens-grants [candidates=${String(candidates.length)}]`,
        members: css.files.length + ctx.files.length,
      });
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: { ...CLEAN_PRODUCT_CSS, [SHELL_STYLESHEET]: ".shell-grid { --list-track: 0px; }\n", [SOURCE_ANCHOR]: "export const probe = null;\n" },
      expect: { count: 1, messageIncludes: "Subject: .shell-grid { --list-track: 0px }" },
      grant: { subject: ".shell-grid { --list-track: 0px }", operation: STRUCTURAL_LENGTH_OPERATION },
      why: "a structural declaration is keyed by its exact selector, property and value",
    },
    {
      mode: "resource",
      files: { ...CLEAN_PRODUCT_CSS, [SHELL_STYLESHEET]: "@media (max-width: 48rem) {\n}\n", [SOURCE_ANCHOR]: "export const probe = null;\n" },
      expect: { count: 1, messageIncludes: "Subject: @media (max-width: 48rem) {" },
      grant: { subject: "@media (max-width: 48rem) {", operation: STRUCTURAL_LENGTH_OPERATION },
      why: "a structural query is keyed by its exact authored prelude",
    },
    {
      mode: "resource",
      files: {
        ...CLEAN_PRODUCT_CSS,
        [SOURCE_ANCHOR]: "export const probe = null;\n",
        "packages/ui/src/markdown/markdown.tsx": 'export const proof = <div className="max-h-[60cqh]" />;\n',
      },
      expect: { count: 1, messageIncludes: "packages/ui/src/markdown/markdown.tsx :: max-h-[60cqh]" },
      grant: { subject: "packages/ui/src/markdown/markdown.tsx :: max-h-[60cqh]", operation: STRUCTURAL_LENGTH_OPERATION },
      why: "a class recipe identity includes its exact source file and Tailwind candidate",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: { ...CLEAN_PRODUCT_CSS, [SOURCE_ANCHOR]: 'export const probe = <div className="gap-row" />;\n' },
      why: "a token-backed tree has no structural raw-length candidate",
    },
  ],
  mustRefuse: [
    {
      mode: "resource",
      files: { [SOURCE_ANCHOR]: "export const probe = null;\n" },
      expect: { messageIncludes: "product-css" },
      why: "missing CSS evidence withholds central grant reconciliation",
    },
  ],
});
