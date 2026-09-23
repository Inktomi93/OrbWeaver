// Gate: css-var-defined — ordinary authored custom-property references must resolve.
// FAMILY `css-variable-resolution`: shared readers live in lib/css-variable-policy.ts and the
// dispatcher-fed cssVariableSourceFact. Permissions and instrument health are sibling policies.
import { defineGate } from "../contract/policy.ts";
import { CLEAN_PRODUCT_CSS, VENDOR_SURFACE_FIXTURE } from "../lib/css-family-proof-fixtures.ts";
import type { CssVariableSite } from "../lib/css-var-resolution.ts";
import { cssVariableInventory } from "../lib/css-variable-policy.ts";
import { cssVariableSourceFact } from "../lib/css-variable-source-fact.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";
import { staticClassFact } from "../lib/static-class-facts.ts";
import { readVendorCssContract } from "../lib/vendor-css-contract.ts";

const MESSAGE =
  "a custom-property reference has no statically proved value source, or dynamically constructs the property name (tooling/src/verify/gates/css-var-defined.ts)";
const VENDOR_FIXTURE = {
  ...VENDOR_SURFACE_FIXTURE,
  "packages/ui/node_modules/@base-ui/react/x/XCssVars.d.ts": 'export enum XCssVars { other = "--other" }\n',
} as const;

function dynamicCoordinate(site: CssVariableSite): string {
  const text = site.node?.getText().slice(site.offset) ?? "";
  return /^[a-zA-Z0-9_-]+/u.exec(text)?.[0] ?? "custom-property";
}

export const gate = defineGate({
  id: "css-var-defined",
  family: "css-variable-resolution",
  authority: "ordinary",
  severity: "error",
  population: "@frontend",
  analysis: "resource",
  execution: "entire-population",
  facts: [cssVariableSourceFact, staticClassFact],
  resources: [{ kind: "product-css" }, { kind: "vendor-css-surface" }],
  message: MESSAGE,
  fix:
    "define the property in product CSS, add an explicit var() fallback, use a runtime property licensed by " +
    "css-var-defined-grants, or waive a deliberate unresolved reference with " +
    "`// @orb-waive css-var-defined(<position>): <reason>` at the exact reported custom-property name, " +
    "including its leading `--`, e.g. `--missing`.",
  create: (ctx) => ({
    evaluate: () => {
      const css = readyResourceValue(ctx.resources.cssInventory("product"));
      const vendor = readVendorCssContract(readyResourceValue(ctx.resources.vendorCssSurface()));
      const inventory = cssVariableInventory(css, ctx.fact(cssVariableSourceFact), ctx.fact(staticClassFact), (node) => ctx.relativePath(node.getSourceFile()));
      const report = (site: CssVariableSite): void => {
        if (site.node !== undefined && site.offset !== undefined) {
          ctx.report.node(
            site.node,
            site.name === "dynamic-custom-property"
              ? {
                  token: dynamicCoordinate(site),
                  offset: site.offset,
                  message: `a dynamically constructed custom-property name cannot be resolved. ${MESSAGE}`,
                }
              : { token: site.name, offset: site.offset },
          );
        } else {
          ctx.report.file(site.file, { line: site.line, column: site.column, token: site.name });
        }
      };
      for (const site of inventory.unsupported) {
        report(site);
      }
      for (const site of inventory.references) {
        if (!(site.fallback || inventory.definitions.has(site.name) || vendor.declared.has(site.name))) {
          report(site);
        }
      }
      ctx.receipt({
        kind: "population",
        source: `css-var-defined [references=${String(inventory.references.length)}]`,
        members: css.files.length + ctx.files.length,
      });
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: {
        ...VENDOR_FIXTURE,
        ...CLEAN_PRODUCT_CSS,
        "packages/ui/src/styles/theme.css": ":root { --known: 1px; }",
        "packages/client/src/features/x.tsx": 'export const X = <div className="z-(--missing)" />;',
      },
      expect: { count: 1, token: "--missing" },
      why: "the founding unresolved arbitrary-variable class reports its exact authored property slice",
    },
    {
      mode: "resource",
      files: {
        ...VENDOR_FIXTURE,
        ...CLEAN_PRODUCT_CSS,
        "packages/ui/src/styles/theme.css": ":root { --known: 1px; }",
        "packages/client/src/features/x.tsx": ["export const X = ({ name }: { name: string }) => <div className={`z-(--$", "{name})`} />;"].join(""),
      },
      expect: { count: 1, messageIncludes: "dynamically constructed" },
      why: "a substituted property name fails loud instead of disappearing from literal coverage",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        ...VENDOR_FIXTURE,
        ...CLEAN_PRODUCT_CSS,
        "packages/ui/src/styles/theme.css": ":root { --generated: 1px; }",
        "packages/ui/src/styles/globals.css": ".a { --authored: 2px; width: var(--generated); height: var(--authored); }",
        "packages/client/src/features/x.tsx": 'export const X = <div className="w-(--generated)" />;',
      },
      why: "generated and authored definitions resolve CSS and arbitrary-variable references",
    },
    {
      mode: "resource",
      files: {
        ...VENDOR_FIXTURE,
        ...CLEAN_PRODUCT_CSS,
        "packages/ui/src/styles/theme.css": ":root { --known: 1px; }",
        "packages/ui/src/styles/globals.css": ".a { width: var(--optional, 1rem); /* var(--comment-only) */ }",
        "packages/client/src/features/x.tsx": "export const note = 'z-(--prose-only)'; export const X = <div className=\"w-(--known)\" />;",
      },
      why: "fallbacks pass while CSS comments and inert source prose do not become references",
    },
    {
      mode: "resource",
      files: {
        ...VENDOR_FIXTURE,
        ...CLEAN_PRODUCT_CSS,
        "packages/ui/src/styles/theme.css": ":root { --known: 1px; }",
        "packages/client/src/features/x.tsx":
          '// @orb-waive css-var-defined(--missing): reviewed pending migration, tracked in #0000.\nexport const X = <div className="z-(--missing)" />;\n',
      },
      why:
        "the §6.2 positive identity arm: the correct marker at the exact reported custom-property name " +
        "`--missing` suppresses the twin of mustFlag[0] — one finding, one waived, zero effective findings, " +
        "zero authority alarms",
    },
  ],
  mustRefuse: [
    {
      mode: "resource",
      files: {
        ...CLEAN_PRODUCT_CSS,
        "packages/ui/src/styles/theme.css": ":root { --known: 1px; }",
        "packages/client/src/features/x.tsx": "export const x = 1;",
      },
      expect: { messageIncludes: "vendor-css-surface" },
      why: "missing vendor evidence withholds resolution rather than treating its vocabulary as empty",
    },
  ],
});
