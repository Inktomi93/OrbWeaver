// Gate: css-length-tokens — ordinary raw CSS lengths outside reviewed structural mechanics.
import { defineGate } from "../contract/policy.ts";
import { CLEAN_PRODUCT_CSS, SOURCE_ANCHOR } from "../lib/css-family-proof-fixtures.ts";
import { cssLengthCandidates, SHELL_STYLESHEET } from "../lib/css-length-policy.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";
import { staticClassFact } from "../lib/static-class-facts.ts";

const MESSAGE = "a raw non-structural CSS length bypasses the DTCG/token-output contract (tooling/src/verify/gates/css-length-tokens.ts)";

export const gate = defineGate({
  id: "css-length-tokens",
  family: "css-length-contract",
  authority: "ordinary",
  severity: "error",
  population: "@frontend",
  analysis: "resource",
  execution: "entire-population",
  facts: [staticClassFact],
  resources: [{ kind: "product-css" }],
  message: MESSAGE,
  fix: "use an existing token, add a portable DTCG token, or move an inherently structural mechanic through the exact css-length-tokens-grants review door",
  create: (ctx) => ({
    evaluate: () => {
      const css = readyResourceValue(ctx.resources.cssInventory("product"));
      const candidates = cssLengthCandidates(css, ctx.fact(staticClassFact), (node) => ctx.relativePath(node.getSourceFile()));
      for (const candidate of candidates) {
        if (candidate.structural) {
          continue;
        }
        if (candidate.node !== undefined && candidate.offset !== undefined) {
          ctx.report.node(candidate.node, { token: candidate.token, offset: candidate.offset });
        } else {
          ctx.report.file(candidate.file, { line: candidate.line, column: candidate.column, token: candidate.token });
        }
      }
      ctx.receipt({ kind: "population", source: `css-length-tokens [candidates=${String(candidates.length)}]`, members: css.files.length + ctx.files.length });
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: {
        ...CLEAN_PRODUCT_CSS,
        [SHELL_STYLESHEET]: ".shell-grid { height: calc(100dvh - var(--orb-keyboard-inset, 0px)); }\n.paint { gap: 7px; }\n",
        [SOURCE_ANCHOR]: "export const probe = null;\n",
      },
      expect: { count: 1, token: "gap" },
      why: "a component paint length in the sanctioned shell stylesheet is raw and ordinary",
    },
    {
      mode: "resource",
      files: { ...CLEAN_PRODUCT_CSS, [SHELL_STYLESHEET]: ".shell-label { line-height: 1; }\n", [SOURCE_ANCHOR]: "export const probe = null;\n" },
      expect: { count: 1, token: "line-height" },
      why: "unitless raw line-height is a reusable typographic value even without a length unit",
    },
    {
      mode: "resource",
      files: { ...CLEAN_PRODUCT_CSS, [SOURCE_ANCHOR]: 'export const probe = <div className="hover:w-[137px]" />;\n' },
      expect: { count: 1, token: "137px" },
      why: "a raw arbitrary length discovered through the shared static-class fact is ordinary",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: { ...CLEAN_PRODUCT_CSS, [SOURCE_ANCHOR]: 'export const probe = <div className="w-(--dimension-rail) gap-row" />;\n' },
      why: "token-backed class carriers contain no raw length",
    },
  ],
  mustRefuse: [
    {
      mode: "resource",
      files: { [SOURCE_ANCHOR]: "export const probe = null;\n" },
      expect: { messageIncludes: "product-css" },
      why: "missing product CSS withholds the owner instead of manufacturing a clean census",
    },
  ],
});
