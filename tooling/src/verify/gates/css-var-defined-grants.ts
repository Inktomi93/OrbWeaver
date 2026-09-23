// Gate: css-var-defined-grants — exact reviewed identities for vendor properties and runtime writers.
// One vendor property is one candidate; one runtime writer is one (file, property) candidate. Central
// reconciliation owns exactness, stale rows, duplicates and multiplicity.
import { defineGate } from "../contract/policy.ts";
import { CLEAN_PRODUCT_CSS, SOURCE_ANCHOR, VENDOR_SURFACE_FIXTURE } from "../lib/css-family-proof-fixtures.ts";
import { cssVariableInventory, runtimeUse, vendorUse } from "../lib/css-variable-policy.ts";
import { cssVariableSourceFact } from "../lib/css-variable-source-fact.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";
import type { ReviewedGrantFileCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantFileCandidates } from "../lib/reviewed-grant-findings.ts";
import { staticClassFact } from "../lib/static-class-facts.ts";
import { readVendorCssContract } from "../lib/vendor-css-contract.ts";

export const VENDOR_OPERATION = "base-ui-runtime-property";
export const RUNTIME_WRITER_OPERATION_PREFIX = "css-runtime-writer:";
const MESSAGE =
  "a vendor custom property or runtime CSSProperties writer requires an exact reviewed identity (tooling/src/verify/gates/css-var-defined-grants.ts)";
export const CSS_VARIABLE_GRANT_FIXES = {
  vendor: "Review the live vendor use and its exact central reviewed grant identity.",
  runtime: "Review the live property and this exact CSSProperties writer; add one central grant only when no static value can serve.",
} as const;

export const gate = defineGate({
  id: "css-var-defined-grants",
  family: "css-variable-resolution",
  authority: "reviewed-grant",
  severity: "error",
  population: "@frontend",
  analysis: "resource",
  execution: "entire-population",
  facts: [cssVariableSourceFact, staticClassFact],
  resources: [{ kind: "product-css" }, { kind: "vendor-css-surface" }],
  message: MESSAGE,
  fix: "prove the exact vendor property or CSSProperties writer, then add one central reviewed grant with a concrete end condition",
  create: (ctx) => ({
    evaluate: () => {
      const css = readyResourceValue(ctx.resources.cssInventory("product"));
      const vendor = readVendorCssContract(readyResourceValue(ctx.resources.vendorCssSurface()));
      const inventory = cssVariableInventory(css, ctx.fact(cssVariableSourceFact), ctx.fact(staticClassFact), (node) => ctx.relativePath(node.getSourceFile()));
      const vendorCandidates: ReviewedGrantFileCandidate[] = [];
      for (const name of vendorUse(inventory, vendor)) {
        const site = inventory.references.find((candidate) => candidate.name === name);
        if (site !== undefined) {
          vendorCandidates.push({ file: site.file, line: site.line, subject: name, operation: VENDOR_OPERATION });
        }
      }
      const used = runtimeUse(inventory);
      const runtimeCandidates: ReviewedGrantFileCandidate[] = [];
      for (const site of inventory.runtimeDefinitionSites) {
        if (used.has(site.name)) {
          runtimeCandidates.push({ file: site.file, line: site.line, subject: site.file, operation: `${RUNTIME_WRITER_OPERATION_PREFIX}${site.name}` });
        }
      }
      reportReviewedGrantFileCandidates(ctx.report, vendorCandidates, {
        message: MESSAGE,
        unreadableMessage: `a vendor CSS property identity could not be read — ${MESSAGE}`,
        fix: CSS_VARIABLE_GRANT_FIXES.vendor,
      });
      reportReviewedGrantFileCandidates(ctx.report, runtimeCandidates, {
        message: MESSAGE,
        unreadableMessage: `a runtime CSS property identity could not be read — ${MESSAGE}`,
        fix: CSS_VARIABLE_GRANT_FIXES.runtime,
      });
      ctx.receipt({
        kind: "population",
        source: `css-var-defined-grants [candidates=${String(vendorCandidates.length + runtimeCandidates.length)}]`,
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
        [SOURCE_ANCHOR]: 'export const probe = <div className="w-(--anchor-width)" />;\n',
        "packages/ui/node_modules/@base-ui/react/select/SelectCssVars.d.ts": 'export enum SelectCssVars { width = "--anchor-width" }\n',
      },
      expect: { count: 1, messageIncludes: "Subject: --anchor-width" },
      grant: { subject: "--anchor-width", operation: VENDOR_OPERATION },
      why: "one proved vendor property use is one exact reviewed candidate",
    },
    {
      mode: "resource",
      files: {
        ...VENDOR_SURFACE_FIXTURE,
        ...CLEAN_PRODUCT_CSS,
        [SOURCE_ANCHOR]: 'export const use = <div className="h-(--runtime-proof)" />;\nexport const style: CSSProperties = { "--runtime-proof": 1 };\n',
      },
      expect: { count: 1, messageIncludes: "Subject: packages/client/src/features/probe.tsx" },
      grant: { subject: "packages/client/src/features/probe.tsx", operation: `${RUNTIME_WRITER_OPERATION_PREFIX}--runtime-proof` },
      why: "the writer grant identity includes both its exact file and property",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        ...VENDOR_SURFACE_FIXTURE,
        ...CLEAN_PRODUCT_CSS,
        [SOURCE_ANCHOR]: "export const probe = null;\n",
      },
      why: "a tree using neither vendor properties nor runtime writers has no permission candidates",
    },
  ],
  mustRefuse: [
    {
      mode: "resource",
      files: { ...CLEAN_PRODUCT_CSS, [SOURCE_ANCHOR]: "export const probe = null;\n" },
      expect: { messageIncludes: "vendor-css-surface" },
      why: "missing vendor evidence withholds grant reconciliation",
    },
  ],
});
