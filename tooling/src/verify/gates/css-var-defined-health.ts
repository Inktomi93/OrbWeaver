// Gate: css-var-defined-health — hard evidence-health half of CSS variable resolution.
import { PRODUCT_STYLESHEETS, THEME } from "../contract/css-family.ts";
import { defineGate } from "../contract/policy.ts";
import { subjectAnchor } from "../lib/absent-subject-anchor.ts";
import { CLEAN_PRODUCT_CSS, SOURCE_ANCHOR, VENDOR_SURFACE_FIXTURE } from "../lib/css-family-proof-fixtures.ts";
import { cssVariableInventory, vendorUse } from "../lib/css-variable-policy.ts";
import { cssVariableSourceFact } from "../lib/css-variable-source-fact.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";
import { staticClassFact } from "../lib/static-class-facts.ts";
import { readVendorCssContract } from "../lib/vendor-css-contract.ts";

const MESSAGE = "the CSS-variable evidence population is blind (tooling/src/verify/gates/css-var-defined-health.ts)";
export const CSS_VARIABLE_HEALTH_FIXES = {
  population: "Restore the named source, definition, reference, class-root, declared Base UI property, or membership population.",
} as const;

export const gate = defineGate({
  id: "css-var-defined-health",
  family: "css-variable-resolution",
  authority: "hard",
  severity: "error",
  population: "@frontend",
  analysis: "resource",
  execution: "entire-population",
  facts: [cssVariableSourceFact, staticClassFact],
  resources: [{ kind: "product-css" }, { kind: "vendor-css-surface" }],
  message: MESSAGE,
  fix: CSS_VARIABLE_HEALTH_FIXES.population,
  create: (ctx) => ({
    evaluate: () => {
      const css = readyResourceValue(ctx.resources.cssInventory("product"));
      const surface = readyResourceValue(ctx.resources.vendorCssSurface());
      const vendor = readVendorCssContract(surface);
      const inventory = cssVariableInventory(css, ctx.fact(cssVariableSourceFact), ctx.fact(staticClassFact), (node) => ctx.relativePath(node.getSourceFile()));
      const anchor = subjectAnchor(new Set(css.files.map(({ path }) => path)), [...PRODUCT_STYLESHEETS])(THEME);
      const health = [
        [inventory.definitions.size, "custom-property definitions"],
        [inventory.references.length, "custom-property references"],
        [inventory.classRoots, "static class roots"],
        [vendor.declared.size, "declared Base UI properties"],
        [vendorUse(inventory, vendor).size, "Base UI reference-site memberships"],
      ] as const;
      for (const [count, name] of health) {
        if (count === 0) {
          ctx.report.file(anchor, {
            line: 1,
            column: 1,
            message: `css-var-defined measured zero ${name} — instrument blindness. ${MESSAGE}`,
            fix: CSS_VARIABLE_HEALTH_FIXES.population,
          });
        }
      }
      ctx.receipt({
        kind: "population",
        source: `css-var-defined-health [definitions=${String(inventory.definitions.size)}; references=${String(inventory.references.length)}; roots=${String(inventory.classRoots)}]`,
        members: css.files.length + ctx.files.length,
      });
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: {
        ...VENDOR_SURFACE_FIXTURE,
        ...CLEAN_PRODUCT_CSS,
        [SOURCE_ANCHOR]: 'export const probe = <div className="block" />;\n',
      },
      expect: { count: 3 },
      why: "references, declared vendor properties and reference-site memberships are independently non-vacuous populations; definitions and class roots remain present",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        ...VENDOR_SURFACE_FIXTURE,
        ...CLEAN_PRODUCT_CSS,
        [THEME]: ":root { --known: 1px; width: var(--anchor-width, 0px); }\n",
        [SOURCE_ANCHOR]: 'export const probe = <div className="w-(--known)" />;\n',
        "packages/ui/node_modules/@base-ui/react/select/SelectCssVars.d.ts": 'export enum SelectCssVars { width = "--anchor-width" }\n',
      },
      why: "all semantic populations are nonempty",
    },
  ],
  mustRefuse: [
    {
      mode: "resource",
      files: { ...CLEAN_PRODUCT_CSS, [SOURCE_ANCHOR]: "export const probe = null;\n" },
      expect: { messageIncludes: "vendor-css-surface" },
      why: "resource acquisition failure withholds the health owner before it can report a partial verdict",
    },
  ],
});
