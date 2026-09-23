// Policy: baseui-surface-manifest — the INSTALLED @base-ui/react public surface must equal the committed
// manifest, and every anatomy part in it must carry an adjudicated disposition. This is the version-bump
// tripwire: a bump cannot land until someone has ruled on every part/prop that appeared or vanished.
// ARMS: A drift (component/part/prop/alias-target) · B `unresolved` disposition · C a disposition with no
// reason · D the reader went blind (nothing learned, expansion truncated) · E the committed ledger is
// valid JSON and is not a ledger.
//
// FOUNDING RECEIPT — why a changelog is not a substitute for a surface diff. The 1.6→1.7 structural export
// diff showed `Select`/`Combobox`/`Autocomplete` `Separator` re-implemented per component with their own
// Props/State, and `Drawer.Handle` re-pointed from dialog's `DialogHandle` to a new `DrawerHandle` — both
// filed upstream as "fixes", both material changes to types our seals consume. The manifest therefore
// records each part's ALIAS TARGET (`symbol` + `from`), not just its exported name, because a re-typing
// keeps the name and swaps what is behind it.
//
// SCOPE — the PUBLIC surface only: the `export_specifier` set of each component module's `index.d.ts` /
// `index.parts.d.ts`. Internal churn (contexts, `use*Root` hooks, the `floating-ui-react` re-exports that
// 1.7 dropped — zero importers here) is deliberately invisible, or every patch release reds this gate for
// declarations no seal can name.
//
// FAMILY `baseui-read` — the shared readers are `lib/baseui-read.ts#installedSurfaceFrom` (the installed
// anatomy, derived from the declared `installed-package:base-ui` doors), `#surfaceManifestFrom` (the
// committed ledger's shape, narrowed from the strict-JSON resource fact), `#blindParts` and
// `#truncatedParts`. `baseui-anatomy-completeness`, `baseui-derives-not-respells` (+ its `-health`
// sibling), `baseui-portal-container-seam` and `baseui-state-data-attributes` are the other members.
//
// POPULATION PORT: `{ of: "none" }` — this policy has no TS population at all and never did. LEGACY at
// 1692583d6 it declared `scopeSafety: "whole-project"` with NO `scanRoot`, so the legacy dispatcher handed
// it all 7,557 harness paths and `run` read not one of them: every subject came off disk through
// `readInstalledSurface` / `readManifest`. The port therefore DROPS a population the policy never used,
// and the subjects become three declared resources. Measured on this tree: legacy `check:structure --check
// baseui-surface-manifest` reported `scanned 7557/7557 files` and 0 findings; the final policy's effective
// population is the one manifest path, and the raw/effective counts are unchanged at 0.
//
// WHERE THE REFUSAL LIVES — THE RUNTIME, AND THIS IS A DELIBERATE CATCH DELTA (§4.6 category 5's sibling:
// an arm whose MECHANISM moved rather than a site that moved). Legacy arm D carried two of its own
// findings, `NO_PACKAGE` and `NO_MANIFEST`, each guarded by a hand-rolled real-tree anchor
// (`fileLoaded(ctx, "packages/ui/src/tokens/index.ts")`) so a sibling gate's mini-project would not
// inherit a phantom red. Both subjects are now DECLARED resources and both blindness cases are RUNTIME
// refusals — exit 2, "not a verdict", never a green zero. That is strictly louder than the two findings it
// replaces AND it deletes the anchor heuristic, which existed only because the legacy substrate could not
// tell "the package is not installed" from "this example is about something else". No proof row can
// express a refusal (guide §6.3); the pins are `runPolicyPass` drives in
// `tests/tooling/verify/gates/baseui-and-surface-family.suite.repo.int.test.ts` — the LEDGER's three reachable
// non-ready statuses (missing · unparseable · empty, all population-phase withholds, in the loop over this
// family's four ledger consumers) and the INSTALLED doors' three (the whole package missing, `metadata`
// unresolved, `ast` unresolved, all `[evaluate]` tool errors), beside the complete run asserting one
// `unresolved: 0` receipt per declared resource. The path this paragraph named until 2026-09-13 —
// `baseui-family.test.ts` — never existed on the tree (`v-conversions-11-2026-09-13.md`, board #2297).
//
// BUT THE TWO REFUSALS ARRIVE AT DIFFERENT PHASES, AND THE DIFFERENCE IS NOT COSMETIC — it was MEASURED by
// this conversion's §4.6 differential, after this header first claimed both were population-phase
// withholds. `installed-package` is an UNPOPULATED kind (`contract/resource-declaration.ts`
// `GATE_RESOURCE_UNPOPULATED_KINDS`), and `resolveResourceDeclarations` FILTERS every unpopulated kind out
// before it acquires anything — so nothing acquires the package at the population phase and nothing can
// withhold this policy for it. An uninstalled package surfaces only when `evaluate` calls the door:
// `PASS TOOL ERROR [evaluate] resource installed-package:base-ui:ast was declared ready by population
// resolution but came back missing`. The ledger, a POPULATED `json` kind, does withhold at the population
// phase: `PASS TOOL ERROR [population] resource declaration json:baseui-manifest is missing`.
// The consequence for any resource policy, not just this one: `readyResourceValue` is an ASSERTION about a
// broken runtime for a populated kind and a REACHABLE, load-bearing refusal for an unpopulated one. Both
// are tool errors and neither is a finding, so the outcome is the same — but a header that calls the
// second one unreachable is wrong, and `docs/law/resource-policy-contract.md` §1/§3.2 states the guarantee without
// the carve-out.
//
// A READY-BUT-DEGENERATE LEDGER IS THE OTHER HALF AND IT IS A FINDING (arm E, NEW at conversion). Legacy
// `readManifest` did `surfaceManifestFrom(...)` and returned `undefined` on a refusal — the SAME value it
// returned for "no file at all" — so a ledger that was valid JSON and was not a ledger made every gate in
// this family silently pass. `baseui-state-data-attributes.ts:44-52` (converted earlier) records the
// measurement that put the finding HERE: an ordinary policy reporting it was authored and refused by the
// engine with `AUTHORITY ALARM [ordinary-waiver] … has no nonempty position token for waiver binding`,
// because a file-anchored ordinary finding has no authored token at its coordinate. This policy is `hard`,
// has no door by construction, and is the single owner of every "the ledger is wrong" verdict.
//
// ANCHOR MOVE (§4.6 category 6): legacy reported arm D's two reader-blindness findings at SELF (this gate's
// own source file). SELF is in no resource population, so under this contract that is an `[evaluate]` tool
// error rather than a finding. They now anchor on the manifest row itself, which is both the artifact that
// is wrong and the one path this policy's population contains. The move orphans no waiver: this policy is
// `hard` and a marker census over the tree finds ZERO `@orb-gate-ignore baseui-surface-manifest` and ZERO
// `@orb-waive baseui-surface-manifest` in either grammar, so nothing was bound to the old position.
//
// DECLARED LIMIT — the reader-blindness branch below (`installedSurfaceFrom` returning `undefined`) is
// UNFALSIFIABLE BY CONSTRUCTION, and the construction was attempted rather than argued. It fires when the
// `installed-package` door returns READY declarations carrying no `@base-ui/react` package root. No
// fixture can produce that: `ops/resource-installed.ts:137-143` collects the paths by walking DOWN from
// the directory it just resolved for that very package, so every path it returns is under it by
// construction, and a package it cannot resolve comes back `missing` (a refusal, one phase earlier). The
// branch is pinned one tier down instead, at the reader, in
// `tests/tooling/verify/gates/baseui-and-surface-family.suite.repo.int.test.ts` under "§4.5 — the
// installed-surface READER's own blindness, which no proof row can reach": `installedSurfaceFrom` handed an
// anchorless path set returns `undefined`, and handed the real set minus one component's `index.d.ts` loses
// exactly that component.
//
// COMMENT POSTURE: comment-BLIND — every subject is a declared resource artifact (parsed JSON, installed
// `.d.ts` declarations); this policy reads no authored source and no comment.
// LEGACY SHA: 1692583d6.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `baseui-surface-manifest` descriptor at 89a0b751d78372c17b549ba2ac25931c768d7ccd, the parent of the conversion
// `17297f298` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The `1692583d6`
// cited above is an ancestor carrying a byte-identical legacy blob (`git rev-parse` of both), so both citations
// resolve to this source. Over the SAME 7,560 harness candidates at that tree (`git ls-tree` ∩
// `_shared/ts-workspace.ts#harnessGlobs`), the legacy harness — no `scanRoot` — dispatched 7,560, and the final
// `population` admits 0; the subject is the declared `installed-package:base-ui` + `json:baseui-manifest`.
// legacy − final = all 7,560 harness candidates — dispatched to the legacy `run`, which read none of them (its
// subject came off disk through `readInstalledSurface`/`readManifest`); retired with that read. final − legacy = ∅.
// Controls: the legacy side is non-empty and the final side is empty by declaration, so equality cannot pass
// vacuously; outside `docs/__cbbhr_out_control.ts` rejected by both.
// OUTSIDE-CONTROL CAVEAT (verifier cb-v-header-residue): `docs/__cbbhr_out_control.ts` is rejected by `harnessGlobs`,
// not by the legacy descriptor — which has no path predicate of its own and admits it — so it proves only that
// neither side reaches outside the harness corpus, not that the legacy filter discriminates.
import type { InstalledComponent, InstalledPart, ManifestComponent, ManifestPart, SurfaceManifest } from "../contract/baseui.ts";
import { defineGate } from "../contract/policy.ts";
import { JSON_RESOURCE_PATHS } from "../contract/resource-json.ts";
import { BASE_UI_PKG_REL, blindParts, installedSurfaceFrom, surfaceManifestFrom, truncatedParts } from "../lib/baseui-read.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const MANIFEST_PATH = JSON_RESOURCE_PATHS["baseui-manifest"];
const GEN = "node tooling/src/verify/cli.ts baseline baseui-surface";

const MESSAGE =
  "the committed Base UI surface manifest no longer describes the installed @base-ui/react. The manifest " +
  `(${MANIFEST_PATH}) is the anatomy decision ledger's machine half: every component namespace, every ` +
  "anatomy part, every part's own prop names, and what @orb/ui does with each part. A version bump that " +
  "changes the surface must be ADJUDICATED, not absorbed — upstream has shipped new anatomy parts and " +
  "re-pointed alias targets under changelog entries filed as 'fixes'.";

const FIX =
  `regenerate (\`${GEN}\`), read the printed minted/vanished/unresolved lists, and give every newly-minted ` +
  "part a disposition WITH a reason: `exposed` (the seal renders it — baseui-anatomy-completeness proves " +
  "that claim), `sealed-away` (deliberately not rendered; say why AND what would end it), or `n-a` (nothing " +
  "in @orb/ui wraps this component). Record the human half of the same ruling in " +
  "docs/law/ui-package-design.md, keyed on the identical `Component.Part` string.";

const DRIFT = (what: string): string => `${what} — the manifest and the installed package disagree; regenerate (\`${GEN}\`) and adjudicate the delta.`;
const UNRESOLVED = (key: string): string =>
  `\`${key}\` has no ruling yet (disposition "unresolved"). A part arrives unresolved from a version bump and ` +
  "must be ruled before it can land: `exposed`, `sealed-away` (with the reason and its end condition), or `n-a`.";
const NO_REASON = (key: string, disposition: string): string =>
  `\`${key}\` is "${disposition}" with an empty reason. An exemption that cannot say why it exists — and what ` +
  "would end it — is a rubber stamp; write both into the manifest's `why`.";
const NOT_A_LEDGER = (reason: string): string =>
  `the committed ledger parsed as JSON but is not a surface manifest: ${reason}. Every gate in the baseui-read ` +
  `family reads its rulings from this file, so a shape it cannot narrow silently disarms all of them. Regenerate: \`${GEN}\`.`;
const NO_PACKAGE_ROOT = `the installed-package door returned declaration files carrying no ${BASE_UI_PKG_REL.split("/").slice(-2).join("/")} package root, so the installed surface could not be derived at all — this gate is BLIND, not green. Re-derive \`installedPackageRootOf\` in tooling/src/verify/lib/baseui-read.ts.`;
const BLIND_PART = (key: string): string =>
  `the surface reader learned NOTHING about \`${key}\` — neither a prop nor a heritage arm. Its Props type ` +
  "moved to a shape tooling/src/verify/lib/baseui-read.ts cannot walk, so every gate keyed on this manifest is " +
  "silently green for that part. Teach the expander the new shape, then regenerate.";
const TRUNCATED_PART = (key: string): string =>
  `\`${key}\`'s prop expansion hit the depth ceiling (MAX_EXPANSION_DEPTH in tooling/src/verify/lib/baseui-expand.ts) — ` +
  "its prop list is INCOMPLETE. Raise the ceiling and regenerate.";

/** One part's structural identity, as a comparable string. Alias target and heritage ride along so a
 *  re-typing (same exported name, different declaration behind it) is a visible diff.
 *
 *  `state` WAS MISSING FROM THIS TUPLE UNTIL THE CONVERSION, and its absence was a real hole rather than a
 *  tidy-up: a part's `<Part>State` surface is what Base UI mirrors onto the DOM as `data-*`, so it is the
 *  fact `baseui-state-data-attributes` judges seals against and the fact the selector-writer family
 *  reconciles the committed ledger against the installed package. A bump that added or removed a state key
 *  while leaving props and heritage alone therefore changed what those policies enforce and this tripwire
 *  said nothing. Pinned by the `mustFlag` row whose fixture differs ONLY in `state` — cut `part.state` from
 *  this tuple and that row alone goes green. Measured on the real tree at the same time: adding the term
 *  produced ZERO new findings, i.e. the committed ledger and the installed 1.7.0 surface already agreed on
 *  every part's state, so this closes a hole rather than absorbing a drift. */
function identity(part: InstalledPart | ManifestPart): string {
  return `${part.kind}|${part.symbol}|${part.from}|${part.props.join(",")}|${part.state.join(",")}|${part.inherits.join(",")}`;
}

type Report = (message: string) => void;

/** One component's parts, both directions: appeared, changed shape, vanished. */
function diffParts(report: Report, name: string, installed: InstalledComponent, known: ManifestComponent): void {
  for (const [partName, part] of Object.entries(installed.parts)) {
    const recorded = known.parts[partName];
    if (recorded === undefined) {
      report(DRIFT(`\`${name}.${partName}\` appeared in the installed package and has no manifest entry`));
      continue;
    }
    if (identity(part) !== identity(recorded)) {
      report(DRIFT(`\`${name}.${partName}\` changed shape: installed \`${identity(part)}\` vs manifest \`${identity(recorded)}\``));
    }
  }
  for (const partName of Object.keys(known.parts)) {
    if (!(partName in installed.parts)) {
      report(DRIFT(`\`${name}.${partName}\` vanished from the installed package but still has a manifest entry`));
    }
  }
}

function diffSurface(
  report: Report,
  installed: { readonly version: string; readonly components: Readonly<Record<string, InstalledComponent>> },
  manifest: SurfaceManifest,
): void {
  if (installed.version !== manifest.version) {
    report(DRIFT(`installed @base-ui/react is ${installed.version}, the manifest describes ${manifest.version}`));
  }
  for (const [name, component] of Object.entries(installed.components)) {
    const known = manifest.components[name];
    if (known === undefined) {
      report(DRIFT(`the installed package publishes component \`${name}\` (${component.module}), absent from the manifest`));
      continue;
    }
    diffParts(report, name, component, known);
  }
  for (const name of Object.keys(manifest.components)) {
    if (!(name in installed.components)) {
      report(DRIFT(`component \`${name}\` vanished from the installed package but still has a manifest entry`));
    }
  }
}

function judgeDispositions(report: Report, manifest: SurfaceManifest): void {
  for (const [name, component] of Object.entries(manifest.components)) {
    for (const [partName, part] of Object.entries(component.parts)) {
      const key = `${name}.${partName}`;
      if (part.disposition === "unresolved") {
        report(UNRESOLVED(key));
        continue;
      }
      if (part.disposition !== "exposed" && part.why.trim().length === 0) {
        report(NO_REASON(key, part.disposition));
      }
    }
  }
  for (const key of blindParts(manifest)) {
    report(BLIND_PART(key));
  }
  for (const key of truncatedParts(manifest)) {
    report(TRUNCATED_PART(key));
  }
}

// ── self-proof substrate ────────────────────────────────────────────────────────────────────────────
//
// A `mode: "resource"` row materializes a real tmpdir, so the installed package is PLANTED where node's
// own resolver finds it from the declared base (`packages/ui/package.json`) — the same
// `packages/ui/node_modules/@base-ui/react` an importer sees. `ops/policy-conformance.ts:156-160` keeps
// those paths OUT of the authored overlay by name, which is what makes an installed fixture legal at all.
// Every row supplies EVERY declared resource: a row missing one is a `[population]` tool error, not a
// finding (`docs/law/resource-policy-contract.md` §3.5).
const PKG = BASE_UI_PKG_REL;

/** A minimal installed package for the self-proofs: one namespaced component with one part. The manifest
 *  carries `name` AND `version` because `metadataFacts` refuses a manifest missing either. */
const INSTALLED_ONE_PART: Readonly<Record<string, string>> = {
  [`${PKG}/package.json`]: '{ "name": "@base-ui/react", "version": "9.9.9" }\n',
  [`${PKG}/select/index.d.ts`]: 'export * as Select from "./index.parts.js";\n',
  [`${PKG}/select/index.parts.d.ts`]: 'export { SelectRoot as Root } from "./root/SelectRoot.js";\n',
  [`${PKG}/select/root/SelectRoot.d.ts`]: "export interface SelectRootProps {\n  items?: readonly string[] | undefined;\n}\n",
};

/** The ledger for the one-part installed package. `version` is a PARAMETER because the version comparison
 *  is an arm in its own right and its falsifier differs from the ordinary fixture in that field alone. */
function manifestJson(parts: string, version = "9.9.9"): string {
  return `{\n  "version": "${version}",\n  "components": {\n    "Select": {\n      "module": "@base-ui/react/select",\n      "namespaced": true,\n      "parts": {${parts}}\n    }\n  }\n}\n`;
}

const ROOT_ENTRY = (disposition: string, why: string, props = '"items"', inherits = ""): string =>
  `\n        "Root": { "kind": "part", "symbol": "SelectRoot", "from": "./root/SelectRoot.js", "props": [${props}], "inherits": [${inherits}], "disposition": "${disposition}", "why": "${why}" }\n      `;

/** A manifest entry for a part the installed package does NOT publish — the vanished-PART direction's
 *  subject. It carries neither props nor heritage because a part that is gone upstream has no shape left to
 *  record, which is also why this fixture necessarily produces arm D's blind-part finding beside the drift
 *  one (see the row's `why`). */
const GHOST_PART_ENTRY =
  '\n        "Separator": { "kind": "part", "symbol": "SelectSeparator", "from": "./separator/SelectSeparator.js", "props": [], "inherits": [], "disposition": "exposed", "why": "" }\n      ';

/** A ledger naming a whole COMPONENT the installed package does not publish, beside an agreeing `Select`.
 *  `Dialog.Root` declares a prop on purpose: a propless, heritage-less entry would trip arm D as well and
 *  the row would assert a count it does not mean (the "isolate ONE arm" rule). */
const MANIFEST_GHOST_COMPONENT = `{\n  "version": "9.9.9",\n  "components": {\n    "Select": {\n      "module": "@base-ui/react/select",\n      "namespaced": true,\n      "parts": {${ROOT_ENTRY("exposed", "")}}\n    },\n    "Dialog": {\n      "module": "@base-ui/react/dialog",\n      "namespaced": true,\n      "parts": {\n        "Root": { "kind": "part", "symbol": "DialogRoot", "from": "./root/DialogRoot.js", "props": ["open"], "inherits": [], "disposition": "exposed", "why": "" }\n      }\n    }\n  }\n}\n`;

/** The same installed package with a root declaring NO props, so a manifest entry carrying no props and no
 *  heritage AGREES with it. Arm D's two rows are about the manifest ROW being empty, not about drift; with
 *  the ordinary fixture the identity comparison fires too and the row would assert a count it does not
 *  mean. This is the "isolate ONE arm" rule (`docs/law/resource-policy-contract.md` §3.5) paid in a fixture. */
const INSTALLED_EMPTY_ROOT: Readonly<Record<string, string>> = {
  ...INSTALLED_ONE_PART,
  [`${PKG}/select/root/SelectRoot.d.ts`]: "export interface SelectRootProps {}\n",
};

export const gate = defineGate({
  id: "baseui-surface-manifest",
  family: "baseui-read",
  // HARD by construction, not by preference: every arm reports a FILE-anchored verdict about a generated
  // artifact, and a file-anchored ordinary finding has no authored token at its coordinate, so it has no
  // waiver door at all (guide §2.1's authored-coordinate rule — measured on the sibling and quoted in its header).
  authority: "hard",
  severity: "error",
  population: { of: "none", why: "the installed package surface and the committed ledger are closed ResourceHost facts; this policy reads no authored source" },
  analysis: "resource",
  // The verdict compares two whole artifacts; no per-file answer exists and no subset composes to one.
  execution: "entire-population",
  facts: [],
  resources: [
    { kind: "json", id: "baseui-manifest" },
    { kind: "installed-package", id: "base-ui", mode: "ast" },
    { kind: "installed-package", id: "base-ui", mode: "metadata" },
  ],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      const report: Report = (message) => {
        ctx.report.file(MANIFEST_PATH, { line: 1, message });
      };
      const read = surfaceManifestFrom(readyResourceValue(ctx.resources.json("baseui-manifest")).value);
      const declarations = readyResourceValue(ctx.resources.installedPackage({ id: "base-ui", mode: "ast" }));
      const metadata = readyResourceValue(ctx.resources.installedPackage({ id: "base-ui", mode: "metadata" }));
      if (!read.ok) {
        report(NOT_A_LEDGER(read.reason));
        return;
      }
      // Both doors are narrowed above so the declarations are CONSUMED whatever the ledger says (an
      // unconsumed declaration is a receipt-phase refusal), and the union arms are the contract's.
      const installed =
        declarations.mode === "ast" && metadata.mode === "metadata" ? installedSurfaceFrom(declarations.declarationPaths, metadata.version) : undefined;
      if (installed === undefined) {
        report(NO_PACKAGE_ROOT);
        return;
      }
      diffSurface(report, installed, read.manifest);
      judgeDispositions(report, read.manifest);
    },
  }),

  mustFlag: [
    {
      mode: "resource",
      files: {
        ...INSTALLED_ONE_PART,
        [MANIFEST_PATH]: manifestJson(ROOT_ENTRY("exposed", "")),
        [`${PKG}/select/separator/SelectSeparator.d.ts`]: "export interface SelectSeparatorProps {\n  orientation?: string | undefined;\n}\n",
        [`${PKG}/select/index.parts.d.ts`]:
          'export { SelectRoot as Root } from "./root/SelectRoot.js";\nexport { SelectSeparator as Separator } from "./separator/SelectSeparator.js";\n',
      },
      expect: { count: 1, messageIncludes: "appeared in the installed package and has no manifest entry" },
      why: "ARM A, THE FOUNDING CASE — a bump adds an anatomy part (the real 1.7 `Select.Separator`) and the manifest does not know about it; the changelog called that a fix",
    },
    {
      mode: "resource",
      files: {
        ...INSTALLED_ONE_PART,
        [`${PKG}/select/root/SelectRoot.d.ts`]:
          "export interface SelectRootProps {\n  items?: readonly string[] | undefined;\n  onValueChange?: ((v: string) => void) | undefined;\n}\n",
        [MANIFEST_PATH]: manifestJson(ROOT_ENTRY("exposed", "")),
      },
      expect: { count: 1, messageIncludes: "changed shape" },
      why: "ARM A's finer half: a PROP appeared on an existing part — invisible to a parts-only diff, which is why `identity()` carries the prop list",
    },
    {
      mode: "resource",
      files: {
        ...INSTALLED_ONE_PART,
        [`${PKG}/select/root/SelectRoot.d.ts`]:
          "export interface SelectRootProps {\n  items?: readonly string[] | undefined;\n}\nexport interface SelectRootState {\n  open: boolean;\n}\n",
        [MANIFEST_PATH]: manifestJson(ROOT_ENTRY("exposed", "")),
      },
      expect: { count: 1, messageIncludes: "changed shape" },
      why: "ARM A's STATE half, and the row that dies when `part.state` is cut from `identity()`: the installed part gains a `<Part>State` key while its props, alias target and heritage are byte-identical to the manifest's. `<Part>State` is what Base UI mirrors onto the DOM as `data-*`, so it is the surface `baseui-state-data-attributes` judges seals against — a bump that moved it silently moved what that policy enforces. The legacy tuple omitted `state` entirely and this fixture was green against it. It is also the surviving owner of the aggregate attribute-NAME comparison the css-hook-provenance conversion RETIRED into this tuple (`x-css-family-unit-2026-09-13.md` deviation 3), so cutting `state` now blinds two families rather than one",
    },
    {
      mode: "resource",
      files: { ...INSTALLED_ONE_PART, [MANIFEST_PATH]: manifestJson(`${ROOT_ENTRY("exposed", "")},${GHOST_PART_ENTRY}`) },
      expect: { count: 2, messageIncludes: "`Select.Separator` vanished from the installed package" },
      why: "ARM A's VANISHED-PART direction, and the row that dies when the second `diffParts` loop's membership test is failed OPEN: upstream DELETED an anatomy part the ledger still rules on, which is the same adjudication debt as an appearance and was enforced by nothing. The count is 2 and it is exact rather than sloppy: a manifest entry for a part that is gone has neither props nor heritage left to record, so arm D's blind-part tripwire necessarily fires beside the drift finding — a fixture that avoided it would have to give the ghost entry a shape the installed package cannot corroborate",
    },
    {
      mode: "resource",
      files: { ...INSTALLED_ONE_PART, [MANIFEST_PATH]: MANIFEST_GHOST_COMPONENT },
      expect: { count: 1, messageIncludes: "component `Dialog` vanished from the installed package" },
      why: "ARM A one level up, and the row that dies when the second `diffSurface` loop's membership test is failed OPEN: a whole COMPONENT namespace vanished upstream and its rulings are still in the ledger. Distinct from the row above because the two loops are separate code and the part-level one cannot reach a component that no longer exists at all",
    },
    {
      mode: "resource",
      files: { ...INSTALLED_ONE_PART, [MANIFEST_PATH]: manifestJson(ROOT_ENTRY("exposed", ""), "9.9.8") },
      expect: { count: 1, messageIncludes: "the manifest describes 9.9.8" },
      why: "THE HEADLINE CLAIM, and until this row nothing proved it: this module's first paragraph calls itself \"the version-bump tripwire\", and the version comparison in `diffSurface` was enforced by no proof row at all — failed OPEN it left every other row green. The fixture differs from `mustPass[0]` in the manifest's `version` field ALONE, which is why the count is 1: the anatomy still agrees",
    },
    {
      mode: "resource",
      files: { ...INSTALLED_ONE_PART, [MANIFEST_PATH]: manifestJson(ROOT_ENTRY("unresolved", "")) },
      expect: { count: 1, messageIncludes: "no ruling yet" },
      why: "ARM B: the birth state the generator mints for a new part — always RED, so a bump cannot be absorbed without a human ruling",
    },
    {
      mode: "resource",
      files: { ...INSTALLED_ONE_PART, [MANIFEST_PATH]: manifestJson(ROOT_ENTRY("sealed-away", "")) },
      expect: { count: 1, messageIncludes: "rubber stamp" },
      why: "ARM C: a `sealed-away` ruling with an empty reason cannot say what would end it — a permanent exemption by accident",
    },
    {
      mode: "resource",
      files: { ...INSTALLED_EMPTY_ROOT, [MANIFEST_PATH]: manifestJson(ROOT_ENTRY("exposed", "", "")) },
      expect: { count: 1, messageIncludes: "learned NOTHING" },
      why: "ARM D, the READER's own blindness tripwire: a part with neither props nor heritage means the expander walked off the end (the depth-cap defect that silently cut Combobox.Root from 44 props to 14). This is also the row that pins the ANCHOR MOVE — legacy reported it at this gate's own source file, which is in no resource population and would now be an `[evaluate]` tool error rather than a finding",
    },
    {
      mode: "resource",
      files: { ...INSTALLED_EMPTY_ROOT, [MANIFEST_PATH]: manifestJson(ROOT_ENTRY("exposed", "", "", '"TRUNCATED:SelectRootProps"')) },
      expect: { count: 2, messageIncludes: "hit the depth ceiling" },
      why: "ARM D's second half, UNPINNED IN LEGACY: an expansion that hit MAX_EXPANSION_DEPTH records `TRUNCATED:` in `inherits` rather than dropping the props silently, and the manifest must red for it. The count is 2 and that is exact rather than sloppy: a truncation marker is a heritage arm the installed package does not have, so the identity comparison necessarily reports drift beside it — no fixture can carry the marker and agree, because agreeing would need a real 32-hop alias chain",
    },
    {
      mode: "resource",
      files: {
        ...INSTALLED_ONE_PART,
        [MANIFEST_PATH]: '{ "version": "9.9.9", "components": { "Select": { "module": "@base-ui/react/select", "namespaced": true } } }\n',
      },
      expect: { count: 1, messageIncludes: "is not a surface manifest" },
      why: "ARM E, NEW AT CONVERSION AND THE CATCH THIS GATE DID NOT HAVE: a ledger that is valid JSON and is not a ledger (no `parts`). Legacy `readManifest` collapsed this refusal into the same `undefined` it returned for a missing file and every gate in the family passed silently. `baseui-state-data-attributes` measured that an ORDINARY policy cannot own this finding (no waiver position on a file anchor) and named this policy as the owner",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: { ...INSTALLED_ONE_PART, [MANIFEST_PATH]: manifestJson(ROOT_ENTRY("exposed", "")) },
      why: "the agreeing state: installed surface == manifest, every part ruled. `exposed` needs no `why` — its justification is the rendered JSX, which baseui-anatomy-completeness checks",
    },
    {
      mode: "resource",
      files: {
        ...INSTALLED_ONE_PART,
        [MANIFEST_PATH]: manifestJson(ROOT_ENTRY("n-a", "no @orb/ui seal wraps Select in this example; ends when one is added.")),
      },
      why: "a DECLARED LIMIT written down: a non-`exposed` disposition WITH a reason is the sanctioned shape, not a violation — arm C judges the empty reason, never the disposition",
    },
    {
      mode: "resource",
      files: {
        ...INSTALLED_ONE_PART,
        [`${PKG}/docs/index.d.ts`]: 'export * as Docs from "./index.parts.js";\n',
        [`${PKG}/docs/index.parts.d.ts`]: 'export { DocsRoot as Root } from "./root/DocsRoot.js";\n',
        [`${PKG}/docs/root/DocsRoot.d.ts`]: "export interface DocsRootProps {\n  href?: string | undefined;\n}\n",
        [MANIFEST_PATH]: manifestJson(ROOT_ENTRY("exposed", "")),
      },
      why: "THE NON-COMPONENT FENCE, and the row that dies when `NON_COMPONENT_DIRS` is cut: `docs/` publishes a real `index.d.ts` with a real anatomy part and is package plumbing, not anatomy. Without the fence this fixture reports `Docs` as a component absent from the manifest",
    },
  ],
});
