// Gate: css-var-defined — exact custom-property references must resolve before browser review.
// COMMENT POSTURE: CSS comments use the shared blanker; TS carriers come from static-class provenance.
// Base UI runtime values derive from committed API tables set-equal to installed v1.7.0 CssVars types.
import type { GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import type { CssVariableInventory, CssVariableSite, VendorContract } from "../lib/css-var-resolution.ts";
import { inventoryCssVariables, readVendorContract } from "../lib/css-var-resolution.ts";

const CSS_HOMES = [
  "packages/ui/src/styles/theme.css",
  "packages/ui/src/styles/globals.css",
  "packages/ui/src/styles/tiers.css",
  "packages/client/src/styles/globals.css",
  "packages/client/src/features/app-shell/surfaces/shell.css",
] as const;
const EXPECTED_VENDOR_USE = new Set([
  "--accordion-panel-height",
  "--active-tab-left",
  "--active-tab-width",
  "--anchor-width",
  "--available-height",
  "--available-width",
  "--collapsible-panel-height",
  "--drawer-snap-point-offset",
  "--drawer-swipe-movement-x",
  "--drawer-swipe-movement-y",
  "--toast-swipe-movement-x",
  "--toast-swipe-movement-y",
  "--transform-origin",
]);
const EXPECTED_MIRROR_FILES = 49;
const EXPECTED_VENDOR_PROPERTIES = 43;
// The issue's pre-parser sweep counted 20 text memberships; the syntax pass excludes its one prose-only
// mention, so the enforced population is the 19 executable source-file/property pairs.
const EXPECTED_VENDOR_MEMBERSHIPS = 19;
const EXPECTED_RUNTIME_USE = new Set([
  "--orb-weave-hub-x",
  "--orb-weave-hub-y",
  "--orb-web-spiral-length",
  "--orb-ws-glow",
  "--orb-ws-pitch",
  "--width-shell-content",
]);
const EXPECTED_RUNTIME_PRODUCERS = new Set([
  "packages/client/src/features/app-shell/surfaces/app-shell.tsx:--width-shell-content",
  "packages/ui/src/art/web-weave/web-weave.tsx:--orb-weave-hub-x",
  "packages/ui/src/art/web-weave/web-weave.tsx:--orb-weave-hub-y",
  "packages/ui/src/charts/meter/waystone-layers.tsx:--orb-ws-pitch",
  "packages/ui/src/charts/meter/waystone-layers.tsx:--orb-ws-glow",
  "packages/ui/src/primitives/spinner/spinner.tsx:--orb-web-spiral-length",
]);
const GATE_SELF = "tooling/src/verify/gates/css-var-defined.ts";

function reportSite(ctx: GateRunCtx, site: CssVariableSite): void {
  if (site.node !== undefined && site.offset !== undefined) {
    ctx.report(site.node, { token: site.name, offset: site.offset });
    return;
  }
  // @finding-overload-ok: CSS is outside the ts-morph graph, so this exact token position cannot be node-anchored; ends if CSS joins the shared syntax graph.
  ctx.report({ file: site.file, line: site.line, column: site.column, token: site.name });
}

function sameSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function reportBlindness(ctx: GateRunCtx, what: string): void {
  ctx.report({
    file: GATE_SELF,
    line: 0,
    column: 0,
    message: `css-var-defined scanned zero ${what} — instrument blindness, not a clean tree (tooling/src/verify/gates/css-var-defined.ts)`,
  });
}

function checkPopulations(ctx: GateRunCtx, inventory: CssVariableInventory): void {
  const populations = [
    [inventory.sourceFiles, "source files"],
    [inventory.definitions.size, "custom-property definitions"],
    [inventory.references.length, "custom-property references"],
    [inventory.classRoots, "static class roots"],
  ] as const;
  for (const [count, label] of populations) {
    if (count === 0) {
      reportBlindness(ctx, label);
    }
  }
}

function checkReferences(ctx: GateRunCtx, inventory: CssVariableInventory, vendor: VendorContract): void {
  for (const site of inventory.unsupported) {
    reportSite(ctx, site);
  }
  for (const site of inventory.references) {
    if (!(site.fallback || inventory.definitions.has(site.name) || vendor.documented.has(site.name))) {
      reportSite(ctx, site);
    }
  }
}

function checkVendorContract(ctx: GateRunCtx, vendor: VendorContract): void {
  if (vendor.documented.size > 0 || vendor.declared.size > 0) {
    if (vendor.version !== vendor.mirrorVersion) {
      ctx.report({
        file: GATE_SELF,
        line: 0,
        column: 0,
        message: `Base UI mirror/package version mismatch: mirror=${vendor.mirrorVersion ?? "missing"}, installed=${vendor.version ?? "missing"} (tooling/src/verify/gates/css-var-defined.ts)`,
      });
    }
    if (!sameSet(vendor.documented, vendor.declared)) {
      ctx.report({
        file: GATE_SELF,
        line: 0,
        column: 0,
        message:
          "Base UI API-table custom properties and installed CssVars declarations differ — refresh/prove the mirror before changing runtime allowances (tooling/src/verify/gates/css-var-defined.ts)",
      });
    }
  }
}

function checkRealTreeVendor(ctx: GateRunCtx, vendor: VendorContract, vendorUse: ReadonlySet<string>, memberships: number): void {
  const realTree = ctx.files.some((source) => source.getFilePath().endsWith(GATE_SELF));
  if (realTree) {
    if (vendor.mirrorFiles !== EXPECTED_MIRROR_FILES || vendor.documented.size !== EXPECTED_VENDOR_PROPERTIES) {
      ctx.report({
        file: GATE_SELF,
        line: 0,
        column: 0,
        message: `Base UI vendor population drift: docs=${vendor.mirrorFiles}/${EXPECTED_MIRROR_FILES}, properties=${vendor.documented.size}/${EXPECTED_VENDOR_PROPERTIES} (tooling/src/verify/gates/css-var-defined.ts)`,
      });
    }
    if (!sameSet(vendorUse, EXPECTED_VENDOR_USE)) {
      ctx.report({
        file: GATE_SELF,
        line: 0,
        column: 0,
        message:
          "Base UI runtime-property use changed — re-prove every added use and delete every stale expected use (tooling/src/verify/gates/css-var-defined.ts)",
      });
    }
    if (memberships !== EXPECTED_VENDOR_MEMBERSHIPS) {
      ctx.report({
        file: GATE_SELF,
        line: 0,
        column: 0,
        message: `Base UI reference-site membership drift: ${memberships}/${EXPECTED_VENDOR_MEMBERSHIPS} (tooling/src/verify/gates/css-var-defined.ts)`,
      });
    }
  }
}

function checkRealTreeRuntime(ctx: GateRunCtx, inventory: CssVariableInventory): void {
  if (!ctx.files.some((source) => source.getFilePath().endsWith(GATE_SELF))) {
    return;
  }
  const runtimeUse = new Set(
    inventory.references.filter((site) => !inventory.cssDefinitions.has(site.name) && inventory.runtimeDefinitions.has(site.name)).map((site) => site.name),
  );
  const producers = new Set(inventory.runtimeDefinitionSites.filter((site) => runtimeUse.has(site.name)).map((site) => `${site.file}:${site.name}`));
  if (!sameSet(runtimeUse, EXPECTED_RUNTIME_USE)) {
    ctx.report({
      file: GATE_SELF,
      line: 0,
      column: 0,
      message: `runtime-set custom-property use changed: ${[...runtimeUse].sort().join(", ")} — prove every added use and delete every stale expected use (tooling/src/verify/gates/css-var-defined.ts)`,
    });
  }
  if (!sameSet(producers, EXPECTED_RUNTIME_PRODUCERS)) {
    ctx.report({
      file: GATE_SELF,
      line: 0,
      column: 0,
      message: `runtime-set custom-property producers changed: ${[...producers].sort().join(", ")} — every live property needs an exact CSSProperties writer (tooling/src/verify/gates/css-var-defined.ts)`,
    });
  }
}

function run(ctx: GateRunCtx): void {
  const inventory = inventoryCssVariables(ctx.root, ctx.files, CSS_HOMES);
  checkPopulations(ctx, inventory);
  const vendor = readVendorContract(ctx.root);
  const vendorReferences = inventory.references.filter((site) => vendor.documented.has(site.name));
  const vendorUse = new Set(vendorReferences.map((site) => site.name));
  const vendorMemberships = new Set(vendorReferences.map((site) => `${site.file}:${site.name}`));
  checkReferences(ctx, inventory, vendor);
  checkVendorContract(ctx, vendor);
  checkRealTreeVendor(ctx, vendor, vendorUse, vendorMemberships.size);
  checkRealTreeRuntime(ctx, inventory);
  ctx.scan({
    unit: `css variable [sources=${inventory.sourceFiles} definitions=${inventory.definitions.size} references=${inventory.references.length} classRoots=${inventory.classRoots} vendorDocs=${vendor.mirrorFiles} vendorProperties=${vendor.documented.size} vendorUsed=${vendorUse.size} vendorMemberships=${vendorMemberships.size}]`,
    candidates: inventory.references.length,
    scanned: inventory.references.length,
  });
}

export const gate: GateDescriptor = {
  name: "css-var-defined",
  docRow: "docs/architecture/core/client-architecture-lockdown.md §4.7 / CSS census G-NEW-2",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message:
    "a custom-property reference does not have a statically proved value source, or dynamically constructs the property name so resolution cannot be proved (tooling/src/verify/gates/css-var-defined.ts)",
  fix: "define it in the six-home topology, add an explicit var() fallback, or use a proved Base UI runtime property",
  run,
  mustFlag: [
    {
      files: {
        "packages/ui/src/styles/theme.css": ":root { --known: 1px; }",
        "packages/client/src/features/x.tsx": 'export const X = <div className="z-(--missing)" />;',
      },
      expect: { token: "--missing" },
      why: "the historical z-(--z-sticky) class: Tailwind emits a valid rule whose value resolves to nothing",
    },
    {
      files: {
        "packages/ui/src/styles/theme.css": ":root { --known: 1px; }",
        "packages/client/src/features/x.tsx": ["export const X = ({ name }: { name: string }) => <div className={`z-(--$", "{name})`} />;"].join(""),
      },
      expect: { token: "dynamic-custom-property" },
      why: "a substituted custom-property name must fail loud instead of disappearing from exact-literal coverage",
    },
    {
      files: {
        "packages/ui/src/styles/theme.css": ":root { --known: 1px; }",
        "packages/client/src/features/x.tsx": 'export const X = <div className="w-(--anchor-width)" />;',
        "docs/vendor/base-ui/INDEX.md": "# Base UI docs mirror — v1.7.0\n",
        "docs/vendor/base-ui/components/x.md": "| `--anchor-width` | `number` | width |\n",
        "packages/ui/node_modules/@base-ui/react/package.json": '{"version":"1.7.0"}',
        "packages/ui/node_modules/@base-ui/react/x/XCssVars.d.ts": 'export enum XCssVars { other = "--other" }\n',
      },
      expect: { messageIncludes: "API-table custom properties" },
      why: "THE STALE VENDOR ARM: a documented allowance without the installed CssVars contract is not a proved runtime writer",
    },
    {
      files: { "package.json": "{}" },
      expect: { messageIncludes: "scanned zero source files" },
      why: "wrong scope or an empty source population is instrument blindness, never a clean verdict",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/ui/src/styles/theme.css": ":root { --generated: 1px; }",
        "packages/ui/src/styles/globals.css": ".a { --authored: 2px; width: var(--generated); height: var(--authored); }",
        "packages/client/src/features/x.tsx": 'export const X = <div className="w-(--generated)" />;',
      },
      why: "generated and authored definitions resolve CSS var() and arbitrary-variable class references",
    },
    {
      files: {
        "packages/ui/src/styles/theme.css": ":root { --known: 1px; }",
        "packages/ui/src/styles/globals.css": ".a { width: var(--optional, 1rem); /* var(--comment-only) */ }",
        "packages/client/src/features/x.tsx": "export const note = 'z-(--prose-only)'; export const X = <div className=\"w-(--known)\" />;",
      },
      why: "fallbacks pass, while CSS comments and non-carrier string prose do not become references",
    },
    {
      files: {
        "packages/ui/src/styles/theme.css": ":root { --known: 1px; }",
        "packages/client/src/lib/recipe.ts": "import { tv } from 'tailwind-variants'; export const recipe = tv({ base: 'w-(--known)' });",
      },
      why: "an exported tv recipe is a first-class class carrier, not a JSX-only special case",
    },
    {
      files: {
        "packages/ui/src/styles/theme.css": ":root { --known: 1px; }",
        "packages/client/src/features/x.tsx": 'export const X = <div className="w-(--anchor-width)" />;',
        "docs/vendor/base-ui/INDEX.md": "# Base UI docs mirror — v1.7.0\n",
        "docs/vendor/base-ui/components/x.md": "| `--anchor-width` | `number` | width |\n",
        "packages/ui/node_modules/@base-ui/react/package.json": '{"version":"1.7.0"}',
        "packages/ui/node_modules/@base-ui/react/x/XCssVars.d.ts": 'export enum XCssVars { width = "--anchor-width" }\n',
      },
      why: "a runtime property in both the committed API table and installed CssVars type is proved",
    },
  ],
};
