// Gate: css-length-tokens-health — hard unreadable-evidence half of the length contract.
import { defineGate } from "../contract/policy.ts";
import { CLEAN_PRODUCT_CSS, SOURCE_ANCHOR } from "../lib/css-family-proof-fixtures.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";
import { staticClassFact } from "../lib/static-class-facts.ts";

const MESSAGE = "the CSS length census could not resolve a static class carrier (tooling/src/verify/gates/css-length-tokens-health.ts)";

export const gate = defineGate({
  id: "css-length-tokens-health",
  family: "css-length-contract",
  authority: "hard",
  severity: "error",
  population: "@frontend",
  analysis: "resource",
  execution: "entire-population",
  facts: [staticClassFact],
  resources: [{ kind: "product-css" }],
  message: MESSAGE,
  create: (ctx) => ({
    evaluate: () => {
      const css = readyResourceValue(ctx.resources.cssInventory("product"));
      const classes = ctx.fact(staticClassFact);
      for (const unreadable of classes.unresolved) {
        ctx.report.node(unreadable.node, { message: `${MESSAGE}: ${unreadable.reason}` });
      }
      ctx.receipt({
        kind: "population",
        source: `css-length-tokens-health [unresolved=${String(classes.unresolved.length)}]`,
        members: css.files.length + ctx.files.length,
      });
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: { ...CLEAN_PRODUCT_CSS, [SOURCE_ANCHOR]: 'let dynamic = "w-[1px]";\ndynamic = "w-[2px]";\nexport const probe = <div className={dynamic} />;\n' },
      expect: { count: 1, messageIncludes: "could not resolve" },
      why: "an unreadable class carrier is instrument health, not an ordinary author waiver",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: { ...CLEAN_PRODUCT_CSS, [SOURCE_ANCHOR]: 'export const probe = <div className="gap-row" />;\n' },
      why: "a fully static class carrier leaves no unreadable evidence",
    },
  ],
  mustRefuse: [
    {
      mode: "resource",
      files: { [SOURCE_ANCHOR]: "export const probe = null;\n" },
      expect: { messageIncludes: "product-css" },
      why: "missing product CSS withholds health judgment",
    },
  ],
});
