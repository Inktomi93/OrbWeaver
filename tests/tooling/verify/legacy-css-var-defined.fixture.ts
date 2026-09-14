// Gate: css-var-defined — exact custom-property references must resolve before browser review.
// COMMENT POSTURE: CSS comments use the shared blanker; TS carriers come from static-class provenance.
// Base UI runtime values derive from committed API tables set-equal to installed v1.7.0 CssVars types.
//
// THE THREE COUNT RATCHETS ARE GONE (#2181, 2026-09-12; §12.5 bans a count ratchet, and a reviewed grant
// is strictly 1:1 so a number over N subjects can never become one). `css-length-tokens` states the rule
// this module is the second application of: **a `count` is never the fix for an over-broad subject; it is
// the TELL that the subject is wrong.** What each of the three was, and what replaced it:
//
//   EXPECTED_MIRROR_FILES = 49        the number of files in the committed Base UI docs mirror. A census of
//                                     a vendored directory, and the property-resolution facts it is meant
//                                     to protect are already stated set-wise by the documented/declared
//                                     equality arm below — a mirror that loses a property breaks that arm,
//                                     while a mirror file documenting NO property is not a resolution fact
//                                     at all. Replaced by a zero tripwire.
//   EXPECTED_VENDOR_PROPERTIES = 43   `documented.size`. Strictly redundant: `sameSet(documented, declared)`
//                                     is a stronger statement about the SAME population and is DERIVED from
//                                     the installed package, so it cannot rot the way a hand-copied 43 can.
//                                     Replaced by a zero tripwire.
//   EXPECTED_VENDOR_MEMBERSHIPS = 19  the number of (file, property) reference SITES. This one is the
//                                     clearest tautology of the three and it was DRIVEN: planting one
//                                     additional `w-(--anchor-width)` carrier — a second use of an ALREADY
//                                     PROVED property, which needs no review at all — moved memberships
//                                     19 -> 20 and RED, while the reviewed vocabulary below stayed at 13.
//                                     A ratchet that fires on exactly the change nobody must review is
//                                     enforcing its own census. Replaced by a zero tripwire.
//
// A TRIPWIRE RECEIPTS A CONSTANT, NEVER THE CENSUS. Each replacement asks `population === 0`, which is the
// §4.6 blindness question ("did I measure anything at all"), and it is the only question about a population
// SIZE this module can ask without re-minting a number that goes stale on the next legitimate edit. All
// three stay behind the REAL-TREE anchor with the arms they replaced: a fixture root has no vendor mirror,
// so an unguarded zero tripwire would red in every conformance fixture — the #2198 shape exactly.
//
// WHAT IS LOST, stated rather than glossed: a mirror that silently shrinks by a file that documents no
// property, and a vendor property whose documented/declared pair disappears TOGETHER (a coordinated
// downgrade of the installed package plus the committed mirror). Neither is a custom-property RESOLUTION
// fact, which is this gate's subject; the version arm still reds on the second if the package version moves.
//
// THE EXACT SETS BECOME PER-IDENTITY ROWS, which is what makes them grant-shaped. Both real-tree arms used
// to compare a whole SET and report ONE finding carrying a dump of it; each now reports per NAME (vendor
// vocabulary) or per (file, property) ROW (runtime producers), so every finding has a distinct identity a
// 1:1 reviewed grant can key on, and the message names WHICH row moved instead of printing the set.
//
// EXPECTED_RUNTIME_USE IS DERIVED, NOT SPELLED (one home). It was a second hand-maintained set holding
// exactly the six property names of the producer rows; two spellings of one fact, and nothing detected a
// disagreement between them. It is now the rows' property projection, so adding a seventh producer row
// cannot leave a stale vocabulary behind.
//
// MEASURED 2026-09-12 over the WHOLE tree by driving THIS MODULE'S OWN reader (`inventoryCssVariables` +
// `readVendorContract`) through the workspace context the legacy dispatcher builds (`projectCtx`), never a
// re-implementation: sourceFiles 1690 · definitions 256 · references 832 · classRoots 2911 · mirrorFiles 49
// · documented 43 = declared 43 · vendor vocabulary 13 · memberships 19 · runtime use 6 · producers 6 —
// every legacy number reproduced exactly. Controls both directions: the planted `w-(--anchor-width)`
// carrier appeared as a membership (and, planted OUTSIDE `packages/{ui,client}/src`, did NOT — the reader's
// population filter is real), and an unnamed property was absent.
//
// DRIVEN THE SAME DAY through the legacy dispatcher against the REAL tree (one scratch module per cut,
// every anchor asserted to occur exactly once — this header quotes the module's own identifiers, so a
// naive replace patches the COMMENT and reports a false clean):
//   no cut                                          → 0 findings
//   a producer row's PROPERTY renamed (spinner)      → 3 (the writer is reported AT spinner.tsx:54, the
//                                                     derived vocabulary loses the name, and the row reads
//                                                     stale — the three halves of one edit, each named)
//   a producer row's FILE re-pointed (waystone pitch) → 2 (writer unreviewed + row produces nothing; the
//                                                     property stays allowed, which is correct)
//   a live vendor property loses its reviewed row    → 1 (named: `--anchor-width`)
//   a reviewed vendor row no file uses               → 1 (named: the planted row)
//   the three tripwires INVERTED (`=== 0` → `!== 0`) → 3 (all three arms are REACHED; an inverted arm that
//                                                     stays silent is the vacuous-liveness failure #2198
//                                                     shipped, and this is the cut that would catch it)
//
// THE `-health` SPLIT IS A CONVERSION-TIME EVENT, not a thing this file can do. The tripwires below are the
// §4.6 blindness arms that belong in a `css-var-defined-health` sibling; a LEGACY `GateDescriptor` has no
// family and no authority to split into, so they land here as arms now and move at the conversion.
import type { ExemptionRow, GateDescriptor, GateRunCtx } from "../../../tooling/src/verify/contract/gate.ts";
import type { CssVariableInventory, CssVariableSite } from "../../../tooling/src/verify/lib/css-var-resolution.ts";
import { inventoryCssVariables, readVendorContract } from "../../../tooling/src/verify/lib/css-var-resolution.ts";
import type { VendorContract } from "../../../tooling/src/verify/lib/vendor-css-contract.ts";

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
/** ONE reviewed runtime writer: the exact file that sets this custom property from a `CSSProperties`
 *  object, and why no static value can serve. `file` + `property` IS the identity — one row, one finding,
 *  so a reviewed grant over it is 1:1 by construction (§12.5). */
interface RuntimeProducerRow extends ExemptionRow {
  readonly file: string;
  readonly property: string;
}

const RUNTIME_PRODUCER_ROWS: readonly RuntimeProducerRow[] = [
  {
    file: "packages/client/src/features/app-shell/surfaces/app-shell.tsx",
    property: "--width-shell-content",
    why: "the shell content width is a clamp() whose middle term is the USER'S stored chat-width percentage, so the value exists only once appearance state is read. Ends if chat width stops being user-set or moves into the generated theme",
  },
  {
    file: "packages/ui/src/art/web-weave/web-weave.tsx",
    property: "--orb-weave-hub-x",
    why: "the weave hub's horizontal position is computed per instance from the generated web geometry; no static percentage can stand in. Ends if the hub position becomes fixed or the art moves to a transform",
  },
  {
    file: "packages/ui/src/art/web-weave/web-weave.tsx",
    property: "--orb-weave-hub-y",
    why: "the vertical half of the same computed hub position — the pair is written by one style object. Ends with its twin above",
  },
  {
    file: "packages/ui/src/charts/meter/waystone-layers.tsx",
    property: "--orb-ws-pitch",
    why: "the lattice keyframe translates by the pitch, so ONE class serves every spacing and the pitch is per-layer DATA. Ends if the meter stops varying lattice spacing per layer",
  },
  {
    file: "packages/ui/src/charts/meter/waystone-layers.tsx",
    property: "--orb-ws-glow",
    why: "the breath keyframe reads the glow as its FLOOR, which an `opacity` attribute would lose to the animation; the floor is the computed per-frame glow. Ends if the breath animation stops needing a floor",
  },
  {
    file: "packages/ui/src/primitives/spinner/spinner.tsx",
    property: "--orb-web-spiral-length",
    why: "the spiral's dash length is derived from the measured spiral path, so the stroke geometry is only known after the path is generated. Ends if the spinner's spiral becomes a fixed path",
  },
];
/** DERIVED, never spelled twice: the reviewed runtime vocabulary IS the producer rows' properties. */
const EXPECTED_RUNTIME_USE: ReadonlySet<string> = new Set(RUNTIME_PRODUCER_ROWS.map((row) => row.property));
function producerKey(file: string, property: string): string {
  return `${file}:${property}`;
}
const EXPECTED_RUNTIME_PRODUCERS: ReadonlySet<string> = new Set(RUNTIME_PRODUCER_ROWS.map((row) => producerKey(row.file, row.property)));
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
    fix: "Restore the named source/definition/reference/class-root population or repair its reader; zero coverage cannot establish a clean tree.",
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
        fix: "Refresh the committed Base UI mirror against the installed package version and prove their CssVars contract agrees.",
        message: `Base UI mirror/package version mismatch: mirror=${vendor.mirrorVersion ?? "missing"}, installed=${vendor.version ?? "missing"} (tooling/src/verify/gates/css-var-defined.ts)`,
      });
    }
    if (!sameSet(vendor.documented, vendor.declared)) {
      ctx.report({
        file: GATE_SELF,
        line: 0,
        column: 0,
        fix: "Reconcile the committed API-table property names with installed CssVars declarations before changing vendor allowances.",
        message:
          "Base UI API-table custom properties and installed CssVars declarations differ — refresh/prove the mirror before changing runtime allowances (tooling/src/verify/gates/css-var-defined.ts)",
      });
    }
  }
}

function reportVendorBlindness(ctx: GateRunCtx, what: string): void {
  ctx.report({
    file: GATE_SELF,
    line: 0,
    column: 0,
    token: what,
    fix: "Restore the named Base UI mirror/property/reference population and its input paths before accepting the vendor census.",
    message: `css-var-defined measured zero ${what} on the real tree — the Base UI contract is unreadable, which is instrument blindness rather than a clean vendor surface (tooling/src/verify/gates/css-var-defined.ts)`,
  });
}

function checkRealTreeVendor(ctx: GateRunCtx, vendor: VendorContract, vendorUse: ReadonlySet<string>, memberships: number): void {
  const realTree = ctx.files.some((source) => source.getFilePath().endsWith(GATE_SELF));
  if (!realTree) {
    return;
  }
  // THE TRIPWIRES. Each receipts the CONSTANT zero, never the census it replaced (#2181 — see the header).
  const populations = [
    [vendor.mirrorFiles, "Base UI mirror files"],
    [vendor.documented.size, "documented Base UI properties"],
    [memberships, "Base UI reference-site memberships"],
  ] as const;
  for (const [count, label] of populations) {
    if (count === 0) {
      reportVendorBlindness(ctx, label);
    }
  }
  // THE REVIEWED VOCABULARY, one finding per NAME so each has a 1:1 identity (§12.5).
  for (const name of vendorUse) {
    if (!EXPECTED_VENDOR_USE.has(name)) {
      ctx.report({
        file: GATE_SELF,
        line: 0,
        column: 0,
        token: name,
        fix: "Prove the new Base UI property use against the installed contract, then review its exact EXPECTED_VENDOR_USE entry.",
        message: `${name} is a Base UI runtime property this tree now uses and no reviewed row allows — prove the use and add it to EXPECTED_VENDOR_USE (tooling/src/verify/gates/css-var-defined.ts)`,
      });
    }
  }
  for (const name of EXPECTED_VENDOR_USE) {
    if (!vendorUse.has(name)) {
      ctx.report({
        file: GATE_SELF,
        line: 0,
        column: 0,
        token: name,
        fix: "Delete the unused EXPECTED_VENDOR_USE entry after confirming that the property is no longer referenced.",
        message: `${name} is an allowed Base UI runtime property no file uses any more — delete its stale row (tooling/src/verify/gates/css-var-defined.ts)`,
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
  const producerSites = inventory.runtimeDefinitionSites.filter((site) => runtimeUse.has(site.name));
  const producers = new Set(producerSites.map((site) => producerKey(site.file, site.name)));
  for (const name of runtimeUse) {
    if (!EXPECTED_RUNTIME_USE.has(name)) {
      ctx.report({
        file: GATE_SELF,
        line: 0,
        column: 0,
        token: name,
        fix: "Review the live property and its exact CSSProperties writer; add its (file, property) row only when no static value can serve.",
        message: `${name} is set at runtime and read by this tree, and no producer row names it — every live property needs an exact CSSProperties writer with a reviewed row (tooling/src/verify/gates/css-var-defined.ts)`,
      });
    }
  }
  // AN UNREVIEWED WRITER IS REPORTED AT THE WRITER, not at this module: the identity is the site, and the
  // site is the code a reviewer has to read. It carries its OWN message — the gate-level one is about a
  // reference that cannot resolve, which is a different defect from an unreviewed writer.
  for (const site of producerSites) {
    if (!EXPECTED_RUNTIME_PRODUCERS.has(producerKey(site.file, site.name))) {
      ctx.report({
        file: site.file,
        line: site.line,
        column: site.column,
        token: site.name,
        fix: "Review this exact writer and add its (file, property) row with the reason no static value can serve.",
        message: `${site.name} is written here and no reviewed producer row names this writer — add the (file, property) row with the reason no static value can serve (tooling/src/verify/gates/css-var-defined.ts)`,
      });
    }
  }
  for (const row of RUNTIME_PRODUCER_ROWS) {
    if (!producers.has(producerKey(row.file, row.property))) {
      ctx.report({
        file: GATE_SELF,
        line: 0,
        column: 0,
        token: producerKey(row.file, row.property),
        fix: "Delete the stale producer row or review and repoint it to the actual writer; do not restore an obsolete write just to satisfy the row.",
        message: `${row.file} no longer writes ${row.property} — delete its stale producer row or re-point it at the writer that moved (tooling/src/verify/gates/css-var-defined.ts)`,
      });
    }
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

// Independent authored fixtures retain every approved vendor name and runtime writer. These are proof
// inputs, never a second production permission table; dropping a reviewed row must leave its witness.
const VARIABLE_PROOF_FILES: Readonly<Record<string, string>> = {
  "tooling/src/verify/gates/css-var-defined.ts": "export const proofAnchor = 1;\n",
  "packages/ui/src/styles/theme.css":
    ":root { --known: 1px; }\n.proof { width: var(--known); width: var(--accordion-panel-height, 0px); width: var(--active-tab-left, 0px); width: var(--active-tab-width, 0px); width: var(--anchor-width, 0px); width: var(--available-height, 0px); width: var(--available-width, 0px); width: var(--collapsible-panel-height, 0px); width: var(--drawer-snap-point-offset, 0px); width: var(--drawer-swipe-movement-x, 0px); width: var(--drawer-swipe-movement-y, 0px); width: var(--toast-swipe-movement-x, 0px); width: var(--toast-swipe-movement-y, 0px); width: var(--transform-origin, 0px); height: var(--width-shell-content); height: var(--orb-weave-hub-x); height: var(--orb-weave-hub-y); height: var(--orb-ws-pitch); height: var(--orb-ws-glow); height: var(--orb-web-spiral-length); }\n",
  "packages/client/src/features/proof.tsx": 'export const Proof = <div className="block" />;\n',
  "docs/vendor/base-ui/INDEX.md": "# Base UI docs mirror \u2014 v1.7.0\n",
  "docs/vendor/base-ui/components/proof.md":
    "| `--accordion-panel-height` | `number` | proof |\n| `--active-tab-left` | `number` | proof |\n| `--active-tab-width` | `number` | proof |\n| `--anchor-width` | `number` | proof |\n| `--available-height` | `number` | proof |\n| `--available-width` | `number` | proof |\n| `--collapsible-panel-height` | `number` | proof |\n| `--drawer-snap-point-offset` | `number` | proof |\n| `--drawer-swipe-movement-x` | `number` | proof |\n| `--drawer-swipe-movement-y` | `number` | proof |\n| `--toast-swipe-movement-x` | `number` | proof |\n| `--toast-swipe-movement-y` | `number` | proof |\n| `--transform-origin` | `number` | proof |\n",
  "packages/ui/node_modules/@base-ui/react/package.json": '{"version":"1.7.0"}',
  "packages/ui/node_modules/@base-ui/react/proof/ProofCssVars.d.ts":
    'export enum ProofCssVars { v0 = "--accordion-panel-height", v1 = "--active-tab-left", v2 = "--active-tab-width", v3 = "--anchor-width", v4 = "--available-height", v5 = "--available-width", v6 = "--collapsible-panel-height", v7 = "--drawer-snap-point-offset", v8 = "--drawer-swipe-movement-x", v9 = "--drawer-swipe-movement-y", v10 = "--toast-swipe-movement-x", v11 = "--toast-swipe-movement-y", v12 = "--transform-origin" }\n',
  "packages/client/src/features/app-shell/surfaces/app-shell.tsx": 'export const style: CSSProperties = { "--width-shell-content": 1 };\n',
  "packages/ui/src/art/web-weave/web-weave.tsx": 'export const style: CSSProperties = { "--orb-weave-hub-x": 1, "--orb-weave-hub-y": 1 };\n',
  "packages/ui/src/charts/meter/waystone-layers.tsx": 'export const style: CSSProperties = { "--orb-ws-pitch": 1, "--orb-ws-glow": 1 };\n',
  "packages/ui/src/primitives/spinner/spinner.tsx": 'export const style: CSSProperties = { "--orb-web-spiral-length": 1 };\n',
};
const PROOF_CSS = "packages/ui/src/styles/theme.css";
const PROOF_VENDOR_DOC = "docs/vendor/base-ui/components/proof.md";
const PROOF_VENDOR_TYPES = "packages/ui/node_modules/@base-ui/react/proof/ProofCssVars.d.ts";

function variableProofFiles(overrides: Readonly<Record<string, string>> = {}, omitted: readonly string[] = []): Readonly<Record<string, string>> {
  return { ...Object.fromEntries(Object.entries(VARIABLE_PROOF_FILES).filter(([file]) => !omitted.includes(file))), ...overrides };
}

function variableProofText(file: string): string {
  const text = VARIABLE_PROOF_FILES[file];
  if (text === undefined) {
    throw new Error(`missing variable proof input: ${file}`);
  }
  return text;
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
    {
      files: variableProofFiles({ [PROOF_VENDOR_TYPES]: "" }, ["docs/vendor/base-ui/INDEX.md", PROOF_VENDOR_DOC]),
      expect: { count: 16, token: "Base UI mirror files", messageIncludes: "measured zero Base UI mirror files" },
      why: "#2181 no mirror: three vendor zero-population findings plus thirteen stale reviewed names; fallback references prevent undefined-value noise",
    },
    {
      files: variableProofFiles({ [PROOF_VENDOR_DOC]: "# No property table\n", [PROOF_VENDOR_TYPES]: "" }),
      expect: { count: 15, token: "documented Base UI properties", messageIncludes: "measured zero documented Base UI properties" },
      why: "#2181 an existing mirror with no properties loses documented and membership populations plus thirteen reviewed names; the mirror-file tripwire stays quiet",
    },
    {
      files: variableProofFiles({
        [PROOF_CSS]: variableProofText(PROOF_CSS).replace(
          /width: var\(--(?:accordion|active|anchor|available|collapsible|drawer|toast|transform)[^;]+; /gu,
          "",
        ),
      }),
      expect: { count: 14, token: "Base UI reference-site memberships", messageIncludes: "measured zero Base UI reference-site memberships" },
      why: "#2181 documented and installed vendor names remain, but no authored use remains: one membership tripwire and thirteen stale names",
    },
    {
      files: variableProofFiles({
        [PROOF_CSS]: variableProofText(PROOF_CSS) + ".extra { width: var(--unreviewed-vendor); }\n",
        [PROOF_VENDOR_DOC]: variableProofText(PROOF_VENDOR_DOC) + "| `--unreviewed-vendor` | `number` | proof |\n",
        [PROOF_VENDOR_TYPES]: variableProofText(PROOF_VENDOR_TYPES) + 'export enum ExtraCssVars { extra = "--unreviewed-vendor" }\n',
      }),
      expect: { count: 1, token: "--unreviewed-vendor", messageIncludes: "is a Base UI runtime property this tree now uses" },
      why: "#2181 a proved vendor property newly used outside the reviewed vocabulary reports its exact identity once",
    },
    {
      files: variableProofFiles({ [PROOF_CSS]: variableProofText(PROOF_CSS).replace("width: var(--anchor-width, 0px); ", "") }),
      expect: { count: 1, token: "--anchor-width", messageIncludes: "is an allowed Base UI runtime property no file uses" },
      why: "#2181 one reviewed vendor name loses its sole use while every sibling remains live",
    },
    {
      files: variableProofFiles({ "packages/ui/node_modules/@base-ui/react/package.json": '{"version":"9.0.0"}' }),
      expect: { count: 1, messageIncludes: "Base UI mirror/package version mismatch" },
      why: "#2181 the vendor name sets agree but their versions do not; the remedy must repair the mirror/package pairing",
    },
    {
      files: variableProofFiles({
        [PROOF_CSS]: variableProofText(PROOF_CSS) + ".extra { width: var(--new-runtime); }\n",
        "packages/ui/src/proof-writer.ts": 'export const style: CSSProperties = { "--new-runtime": 1 };\n',
      }),
      expect: { count: 2, token: "--new-runtime", messageIncludes: "is set at runtime and read by this tree" },
      why: "#2181 a new runtime property has both an unreviewed vocabulary identity and an unreviewed exact writer; both findings are required",
    },
    {
      files: variableProofFiles({ "packages/ui/src/proof-writer.ts": 'export const style: CSSProperties = { "--width-shell-content": 1 };\n' }),
      expect: { count: 1, token: "--width-shell-content", messageIncludes: "is written here and no reviewed producer row names this writer" },
      why: "#2181 an already reviewed property gains a second unreviewed writer; property identity alone cannot authorize the new file",
    },
    ...RUNTIME_PRODUCER_ROWS.map((row) => ({
      files: variableProofFiles({ [PROOF_CSS]: variableProofText(PROOF_CSS).replace(`height: var(${row.property}); `, "") }),
      expect: { count: 1, token: producerKey(row.file, row.property), messageIncludes: "— delete its stale producer row or re-point it" },
      why: `#2181 stale runtime writer: ${row.file} :: ${row.property} loses its only live reference; sibling writer rows remain live`,
    })),
    {
      files: {
        [PROOF_CSS]: ".proof { width: var(--optional, 1px); }",
        "packages/client/src/features/proof.tsx": 'export const Proof = <div className="block" />;',
      },
      expect: { count: 1, messageIncludes: "scanned zero custom-property definitions" },
      why: "#2181 definitions alone are empty: source, reference-with-fallback and class-root populations are nonempty",
    },
    {
      files: {
        [PROOF_CSS]: ":root { --known: 1px; }",
        "packages/client/src/features/proof.tsx": 'export const Proof = <div className="block" />;',
      },
      expect: { count: 1, messageIncludes: "scanned zero custom-property references" },
      why: "#2181 references alone are empty: definitions, sources and a literal class root remain",
    },
    {
      files: { [PROOF_CSS]: ":root { --known: 1px; width: var(--known); }" },
      expect: { count: 1, messageIncludes: "scanned zero static class roots" },
      why: "#2181 class roots alone are empty: authored CSS supplies source, definition and reference populations",
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
    {
      files: VARIABLE_PROOF_FILES,
      why: "#2181 independent complete healthy twin reaches guarded vendor/runtime reconciliation with all approved identities and all nonzero populations; dropping either guard cannot hide a probe throw",
    },
  ],
};
