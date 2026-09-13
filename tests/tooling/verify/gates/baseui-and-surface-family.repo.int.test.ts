// The `baseui-read` and `surface-composition` FAMILIES — the #1584 conversion receipt for
// `baseui-portal-container-seam`, `baseui-state-data-attributes`, `surface-a11y-focus`,
// `surface-in-a-container` and its `-health` split sibling. Two families in one file on purpose: they share
// the real-tree drive below, and a family test is routinely filed under a wave rather than a member (grep the
// POLICY ID across this directory, never the filename).
//
// WHAT LIVES HERE AND WHY, since a conversion no longer owes a family test for its DECLARED rows (the
// conformance stage runs every `mustFlag`/`mustPass` on the static tier). These are the things a proof row
// structurally cannot express:
//
//   §4.2  the POSITIVE IDENTITY ARM for each ORDINARY policy — all four assertions a `mustPass` row does not
//         separately make (`effectiveFindings []`, `waivedFindings 1`, `authorityAlarms []`), plus the
//         DISCRIMINATION control: the same fixture with the marker's position flipped must ALARM, or "my arm
//         is green" is not "my arm discriminates".
//   §4.5  the REFUSALS. `baseui-state-data-attributes` declares `json:baseui-manifest`; a missing or
//         unparseable one is a population-phase TOOL ERROR with the owner WITHHELD — never a finding and
//         never a clean zero — and `toolFailure` runs before a proof row's arm verdict, so no row can carry
//         it (guide §4.5b). These pins are also the SUCCESSOR PROOF for the legacy
//         `if (manifest === undefined) return;` fail-open the conversion deleted, and for the blindness
//         tripwire `surface-a11y-focus` retired into the empty-population refusal.
//   §4.6  the MARKER TRANSLATION, on the REAL FILES read off disk. An in-place translation is a claim about
//         the ENGINE, and only a real-site run tests it — a fixture cannot, because the thing under test is
//         whether the marker a human moved binds to the node the policy actually reports. This is the pin
//         that caught #2032 for another lane, and it is the reason the two `@surface-focus-elsewhere`
//         translations in this commit are not taken on trust.
//   §4.6  the CONVERSION DIFFERENTIAL, stated as what it FOUND rather than merely run.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Project } from "ts-morph";
import { describe } from "vitest";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import type { PolicyPassResult } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { gate as anatomyCompleteness } from "../../../../tooling/src/verify/gates/baseui-anatomy-completeness.ts";
import { gate as derivesNotRespells } from "../../../../tooling/src/verify/gates/baseui-derives-not-respells.ts";
import { gate as derivesNotRespellsHealth } from "../../../../tooling/src/verify/gates/baseui-derives-not-respells-health.ts";
import { gate as portalContainerSeam } from "../../../../tooling/src/verify/gates/baseui-portal-container-seam.ts";
import { gate as stateDataAttributes } from "../../../../tooling/src/verify/gates/baseui-state-data-attributes.ts";
import { gate as surfaceManifest } from "../../../../tooling/src/verify/gates/baseui-surface-manifest.ts";
import { gate as surfaceA11yFocus } from "../../../../tooling/src/verify/gates/surface-a11y-focus.ts";
import { gate as surfaceInAContainer } from "../../../../tooling/src/verify/gates/surface-in-a-container.ts";
import { gate as surfaceInAContainerHealth } from "../../../../tooling/src/verify/gates/surface-in-a-container-health.ts";
import { installedPackageRootOf, installedSurfaceFrom } from "../../../../tooling/src/verify/lib/baseui-read.ts";
import { getProject } from "../../../../tooling/src/verify/lib/harness.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { loadInstalledPackage } from "../../../../tooling/src/verify/ops/resource-installed.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const POLICIES = [
  anatomyCompleteness,
  derivesNotRespells,
  derivesNotRespellsHealth,
  portalContainerSeam,
  stateDataAttributes,
  surfaceManifest,
  surfaceA11yFocus,
  surfaceInAContainer,
  surfaceInAContainerHealth,
] as const;
const POLICY_IDS = new Set(POLICIES.map((policy) => policy.id));

const MANIFEST_REL = "tooling/src/verify/gates/baseui-surface.manifest.json";
/** The cheapest ledger that resolves the `json:baseui-manifest` declaration and names one stateful part. */
const MANIFEST_JSON =
  '{ "version": "9.9.9", "components": { "Popover": { "module": "@base-ui/react/popover", "namespaced": true, "parts": {' +
  '"Popup": { "kind": "part", "symbol": "PopoverPopup", "from": "./popup/PopoverPopup.js", "props": [], "handlers": {}, "state": ["open", "side"], "inherits": ["BaseUIComponentProps"], "disposition": "exposed", "why": "" }' +
  "} } } }\n";

/** The same ledger one component over: a `Select` Root whose `items` is a DATA prop (the ordinary arm's
 *  subject) and whose `onValueChange` is a 2-arity handler (the hard sibling's), plus a non-Root `Value`
 *  part carrying `placeholder` — the dead position the discrimination control below names. */
const DERIVES_MANIFEST_JSON =
  '{ "version": "9.9.9", "components": { "Select": { "module": "@base-ui/react/select", "namespaced": true, "parts": {' +
  '"Root": { "kind": "part", "symbol": "SelectRoot", "from": "./root/SelectRoot.js", "props": ["items", "onValueChange"], "handlers": { "onValueChange": 2 }, "state": [], "inherits": [], "disposition": "exposed", "why": "" },' +
  '"Value": { "kind": "part", "symbol": "SelectValue", "from": "./value/SelectValue.js", "props": ["placeholder"], "handlers": {}, "state": [], "inherits": [], "disposition": "exposed", "why": "" }' +
  "} } } }\n";

function pass(policy: GatePolicy, root: string, files: Readonly<Record<string, string>>): PolicyPassResult {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  for (const [path, content] of Object.entries(files)) {
    if (path.endsWith(".ts") || path.endsWith(".tsx")) {
      project.createSourceFile(`${root}/${path}`, content, { overwrite: true });
    }
  }
  return runPolicyPass({
    knownPolicies: [policy],
    policies: [policy],
    root,
    project,
    resourceOptions: { overlay: files },
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

test("every converted policy in both families keeps its two-sided proofs", () => {
  expect(verifyPolicyProofs([...POLICIES])).toEqual([]);
});

// ── §4.2 IDENTITY ARMS ──────────────────────────────────────────────────────────────────────────────
//
// One per ORDINARY policy (`surface-in-a-container-health` is `hard`, so it has no door), and each is the TRIPLE — `effectiveFindings []`,
// `waivedFindings 1`, `authorityAlarms []`. The third assertion is the one a `mustPass` row cannot make:
// an over-broad or duplicate marker ALARMS without changing the finding count, so a two-assertion arm would
// pass a marker that suppresses the wrong thing. Every fixture produces exactly ONE finding, because one
// marker consumes one occurrence.

interface IdentityCase {
  readonly policy: GatePolicy;
  readonly path: string;
  /** The position the policy reports — what the author must type. */
  readonly position: string;
  /** A position the fixture does NOT report, for the discrimination control. */
  readonly deadPosition: string;
  readonly body: (marker: string) => string;
  readonly extra?: Readonly<Record<string, string>>;
}

const SEAL_PATH = "packages/ui/src/primitives/popover/probe-popover.tsx";
const DIALOG_PATH = "packages/ui/src/primitives/dialog/probe-dialog.tsx";

const IDENTITY_CASES: readonly IdentityCase[] = [
  {
    policy: portalContainerSeam,
    path: DIALOG_PATH,
    position: "BaseDialog.Portal",
    deadPosition: "BaseDialog.Popup",
    body: (marker) =>
      `import { Dialog as BaseDialog } from "@base-ui/react/dialog";\nexport interface DialogPopupProps {\n  className?: string;\n}\n${marker}export const P = (_props: DialogPopupProps) => <BaseDialog.Portal />;\n`,
  },
  {
    policy: stateDataAttributes,
    path: SEAL_PATH,
    position: "open",
    deadPosition: "side",
    body: (marker) =>
      `import { Popover as BasePopover } from "@base-ui/react/popover";\nimport { useState } from "react";\nexport function Seal({ side }: { side: string }) {\n  const [open] = useState(false);\n  ${marker}  return <BasePopover.Popup className={open ? "a" : "b"} />;\n}\n`,
    extra: { [MANIFEST_REL]: MANIFEST_JSON },
  },
  {
    policy: derivesNotRespells,
    path: "packages/ui/src/primitives/select/probe-select.tsx",
    // The position is the PROP NAME, exactly as the seven live product markers already spell it — which is
    // why the conversion's marker translation was a pure grammar swap with no anchor move.
    position: "items",
    deadPosition: "placeholder",
    body: (marker) =>
      `import type { SelectRootProps } from "@base-ui/react/select";\nimport { Select as BaseSelect } from "@base-ui/react/select";\nexport interface SealProps {\n  ${marker}  items?: readonly string[];\n}\nexport const Seal = (p: SealProps) => <BaseSelect.Root {...p} />;\n`,
    extra: { [MANIFEST_REL]: DERIVES_MANIFEST_JSON },
  },
  {
    policy: surfaceA11yFocus,
    path: "packages/client/src/features/x/surfaces/pane.tsx",
    position: "Pane",
    deadPosition: "Other",
    body: (marker) => `${marker}export const Pane = () => <div>content</div>;\n`,
  },
  {
    policy: surfaceInAContainer,
    path: "packages/client/src/features/x/surfaces/pane.tsx",
    position: "Pane",
    deadPosition: "Other",
    body: (marker) => `${marker}export const Pane = () => <div><ul><li>row</li></ul></div>;\n`,
  },
];

/** The family's SHARED-ANCHOR claim, ASSERTED rather than described: `surface-a11y-focus` and
 *  `surface-in-a-container` must report the SAME position for one surface, which is what lets an author waive
 *  both from two adjacent lines instead of hunting two different coordinates. Both identity arms above prove
 *  each position binds; this proves they are the same position. */
test("the two surface policies report the SAME position for one surface", () => {
  const focus = IDENTITY_CASES.find((item) => item.policy === surfaceA11yFocus);
  const container = IDENTITY_CASES.find((item) => item.policy === surfaceInAContainer);
  expect(focus?.path).toBe(container?.path);
  expect(focus?.position).toBe(container?.position);
});

describe("§4.2 identity arms — the reported position IS the waiver position, and it discriminates", () => {
  for (const item of IDENTITY_CASES) {
    test(`${item.policy.id}: the correct marker at the reported position suppresses`, ({ scratch }) => {
      const marker = `// @orb-waive ${item.policy.id}(${item.position}): the arm's stand-in reason; ends when this fixture stops flagging.\n`;
      const result = pass(item.policy, scratch, { ...item.extra, [item.path]: item.body(marker) });

      expect(result.toolErrors).toEqual([]);
      expect(result.authority.effectiveFindings).toEqual([]);
      expect(result.authority.waivedFindings).toHaveLength(1);
      expect(result.authority.authorityAlarms).toEqual([]);
    });

    test(`${item.policy.id}: a marker naming a DEAD position alarms instead of suppressing`, ({ scratch }) => {
      const marker = `// @orb-waive ${item.policy.id}(${item.deadPosition}): a position this fixture does not report.\n`;
      const result = pass(item.policy, scratch, { ...item.extra, [item.path]: item.body(marker) });

      // THE DISCRIMINATION CONTROL. Without it, "my arm is green" is not "my arm discriminates" — a marker
      // that bound to anything would pass the arm above just as well.
      expect(result.authority.waivedFindings).toEqual([]);
      expect(result.authority.authorityAlarms.map((alarm) => alarm.message).join("\n")).toContain("dead position");
    });
  }
});

// ── §4.5 REFUSALS ───────────────────────────────────────────────────────────────────────────────────

/** The shape every refusal shares, read as one object so a refusal that drifted on ONE axis — a finding
 *  leaking through, an owner completing — fails with the whole picture in the diff. */
function refusalShape(result: PolicyPassResult): Record<string, unknown> {
  return {
    phases: result.toolErrors.map((error) => error.phase),
    messages: result.toolErrors.map((error) => error.message),
    ownerStatuses: result.policies.map((owner) => owner.owner.status),
    findings: result.authority.effectiveFindings.length,
  };
}

const SEAL_SOURCE =
  'import { Popover as BasePopover } from "@base-ui/react/popover";\nimport { useState } from "react";\nexport function Seal({ side }: { side: string }) {\n  const [open] = useState(false);\n  return <BasePopover.Popup className={open ? "a" : "b"} />;\n}\n';

describe("§4.5 — a broken ledger is a REFUSAL, never a finding and never a clean zero", () => {
  test("the complete run judges, and files one resource receipt with nothing unresolved", ({ scratch }) => {
    const result = pass(stateDataAttributes, scratch, { [MANIFEST_REL]: MANIFEST_JSON, [SEAL_PATH]: SEAL_SOURCE });

    expect(result.toolErrors).toEqual([]);
    expect(result.authority.effectiveFindings).toHaveLength(1);
    expect(result.policies.flatMap((owner) => owner.receipts.filter((receipt) => receipt.kind === "resource"))).toMatchObject([
      { kind: "resource", source: "json:baseui-manifest", unresolved: 0 },
    ]);
  });

  test("a MISSING ledger withholds the owner — the legacy silent `return` is dead", ({ scratch }) => {
    const result = pass(stateDataAttributes, scratch, { [SEAL_PATH]: SEAL_SOURCE });

    expect(refusalShape(result)).toMatchObject({ phases: ["population"], ownerStatuses: ["incomplete"], findings: 0 });
    expect(result.toolErrors[0]?.message).toContain("json:baseui-manifest");
    expect(result.authority.withheldPolicyIds).toContain(stateDataAttributes.id);
  });

  test("an UNPARSEABLE ledger withholds the owner too — missing and malformed stay separate facts", ({ scratch }) => {
    const result = pass(stateDataAttributes, scratch, { [MANIFEST_REL]: "{ not json\n", [SEAL_PATH]: SEAL_SOURCE });

    expect(refusalShape(result)).toMatchObject({ phases: ["population"], ownerStatuses: ["incomplete"], findings: 0 });
    expect(result.authority.withheldPolicyIds).toContain(stateDataAttributes.id);
  });

  test("an EMPTY ledger withholds the owner too — the third reachable `json` status", ({ scratch }) => {
    // The status this block was missing (#2297): the reader answers `empty` for a zero-byte file BEFORE the
    // parser runs, so a truncated write on the generated ledger is neither the missing nor the unparseable
    // case above. This policy's header claims all three; this is the row that makes the claim true.
    const result = pass(stateDataAttributes, scratch, { [MANIFEST_REL]: "", [SEAL_PATH]: SEAL_SOURCE });

    expect(refusalShape(result)).toMatchObject({ phases: ["population"], ownerStatuses: ["incomplete"], findings: 0 });
    expect(result.toolErrors[0]?.message).toContain("json:baseui-manifest is empty");
    expect(result.authority.withheldPolicyIds).toContain(stateDataAttributes.id);
  });

  test("an EMPTY population refuses — this IS the retired `surface-a11y-focus` blindness tripwire", ({ scratch }) => {
    // Legacy carried a hand-rolled arm (`featuresSeen && surfacesSeen === 0` reporting at a DIRECTORY path)
    // against `surfaces/` being renamed out from under a directory-name-keyed scan. Under this contract the
    // same failure is the runtime's: a declared population that admits nothing is a refusal, not a pass.
    const result = pass(surfaceA11yFocus, scratch, { "packages/client/src/data/not-a-surface.ts": "export const x = 1;\n" });

    expect(result.authority.effectiveFindings).toEqual([]);
    expect(result.toolErrors.map((error) => error.phase)).toEqual(["population"]);
    expect(result.authority.withheldPolicyIds).toContain(surfaceA11yFocus.id);
  });
});

describe("§4.5 — the baseui-read ledger consumers all refuse, and the phase depends on the KIND", () => {
  // THE MECHANISM THIS BLOCK EXISTS TO PIN, measured by the conversion differential after a header claimed
  // otherwise: `resolveResourceDeclarations` acquires and withholds only POPULATED kinds. `json` is one, so
  // a broken ledger withholds at the POPULATION phase, before `create`. `installed-package` is UNPOPULATED
  // (`contract/resource-declaration.ts#GATE_RESOURCE_UNPOPULATED_KINDS`), so it is FILTERED OUT of that
  // resolution entirely and an uninstalled package cannot withhold anybody — it surfaces only when
  // `evaluate` opens the door and `readyResourceValue` throws. Both are tool errors and neither is a
  // finding, so the outcome is identical; the PHASE is not, and a policy author who believes the population
  // phase guards an unpopulated kind has one guard fewer than they think.
  for (const policy of [anatomyCompleteness, derivesNotRespells, derivesNotRespellsHealth, surfaceManifest]) {
    test(`${policy.id}: a MISSING ledger withholds the owner — the legacy silent \`return\` is dead`, ({ scratch }) => {
      const result = pass(policy, scratch, { [SEAL_PATH]: SEAL_SOURCE });

      expect(refusalShape(result)).toMatchObject({ phases: ["population"], ownerStatuses: ["incomplete"], findings: 0 });
      expect(result.toolErrors[0]?.message).toContain("json:baseui-manifest");
      expect(result.authority.withheldPolicyIds).toContain(policy.id);
    });

    test(`${policy.id}: an UNPARSEABLE ledger withholds too — missing and malformed stay separate facts`, ({ scratch }) => {
      const result = pass(policy, scratch, { [MANIFEST_REL]: "{ not json\n", [SEAL_PATH]: SEAL_SOURCE });

      expect(refusalShape(result)).toMatchObject({ phases: ["population"], ownerStatuses: ["incomplete"], findings: 0 });
      expect(result.authority.withheldPolicyIds).toContain(policy.id);
    });

    test(`${policy.id}: an EMPTY ledger withholds too — the THIRD json status, and it is not "missing"`, ({ scratch }) => {
      // `resource-policy-contract.md` §3.6 asks one pin per declared resource per REACHABLE non-ready
      // status, and `empty` is a distinct `json` fact by that document's own §2 table: the reader answers
      // `missing` for an absent path and `empty` for a zero-byte one (`ops/resource-reader.ts#read`
      // returns `unavailable("empty", …)` on `value.length === 0`, BEFORE the parser is reached, so this
      // can never collapse into the unparseable pin above). A truncated write on the generated ledger is
      // the real-world shape, and until 2026-09-13 nothing pinned it (#2297).
      const result = pass(policy, scratch, { [MANIFEST_REL]: "", [SEAL_PATH]: SEAL_SOURCE });

      expect(refusalShape(result)).toMatchObject({ phases: ["population"], ownerStatuses: ["incomplete"], findings: 0 });
      expect(result.toolErrors[0]?.message).toContain("json:baseui-manifest is empty");
      expect(result.authority.withheldPolicyIds).toContain(policy.id);
    });
  }

  test("baseui-surface-manifest: an UNINSTALLED package is an [evaluate] tool error, NOT a finding", ({ scratch }) => {
    // The successor proof for the legacy `NO_PACKAGE` finding and its hand-rolled real-tree anchor. The
    // scratch root has no `node_modules`, so node's resolver cannot find `@base-ui/react` from
    // `packages/ui/package.json`; the legacy descriptor answered that with a report, this answers it with
    // "this run is not a verdict".
    const result = pass(surfaceManifest, scratch, { [MANIFEST_REL]: MANIFEST_JSON });

    expect(result.authority.effectiveFindings).toEqual([]);
    expect(result.toolErrors.map((error) => error.phase)).toEqual(["evaluate"]);
    expect(result.toolErrors[0]?.message).toContain("installed-package:base-ui:ast");
    expect(result.toolErrors[0]?.message).toContain("missing");
  });
});

// ── §4.5 — the INSTALLED doors, one pin per REACHABLE status, and the one that is unconstructible ────
//
// THE CONSTRUCTION LIMIT, MEASURED RATHER THAN ASSUMED, because §3.6's "one pin per declared resource per
// non-ready status" reads as if `missing` were a per-MODE fact and it is not. `ops/resource-installed.ts`
// resolves BOTH modes through the SAME `manifestPath(root, id, …)` call and only then branches on
// `request.mode`, so `missing` is a property of the PACKAGE: there is no tree on which `ast` is missing and
// `metadata` is ready, or the reverse. Driven on five constructed roots: with the package absent, both
// doors report `missing` together, and the `ast` door answers first because `evaluate` opens it first
// (`installedPackage({mode: "ast"})` precedes the metadata read). That single case is the pin directly
// above. What IS per-mode is `unresolved`, because each mode reads a DIFFERENT thing out of the resolved
// directory — the manifest's name/version pair for `metadata`, the `.d.ts` inventory for `ast` — so each
// gets its own pin below and each was reached by a different planted defect.
describe("§4.5 — the installed-package doors refuse per MODE, and `missing` is not one of them", () => {
  const pkgRel = "packages/ui/node_modules/@base-ui/react";
  /** The resolution base `INSTALLED_PACKAGE_DEFINITIONS["base-ui"].from` names. */
  const uiManifest = { "packages/ui/package.json": '{ "name": "@orb/ui", "version": "0.0.0" }\n' };
  /** Enough of an installed anatomy for the `ast` door to come back READY. */
  const installedDeclarations = {
    [`${pkgRel}/select/index.d.ts`]: 'export * as Select from "./index.parts.js";\n',
    [`${pkgRel}/select/index.parts.d.ts`]: 'export { SelectRoot as Root } from "./root/SelectRoot.js";\n',
    [`${pkgRel}/select/root/SelectRoot.d.ts`]: "export interface SelectRootProps {\n  items?: readonly string[] | undefined;\n}\n",
  };
  const surfaceManifestJson =
    '{ "version": "9.9.9", "components": { "Select": { "module": "@base-ui/react/select", "namespaced": true, "parts": {' +
    '"Root": { "kind": "part", "symbol": "SelectRoot", "from": "./root/SelectRoot.js", "props": ["items"], "state": [], "inherits": [], "disposition": "exposed", "why": "" }' +
    "} } } }\n";

  /** The installed tree is REAL files, never an overlay: `loadInstalledPackage` goes through node's own
   *  resolver and `readdirSync`, neither of which the resource overlay reaches (that is the whole point of
   *  the kind — an installed package is not the authored transaction). */
  function plantInstalled(root: string, files: Readonly<Record<string, string>>): void {
    for (const [rel, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), content, "utf8");
    }
  }

  test("the COMPLETE run judges and receipts all three declared resources with nothing unresolved", ({ scratch }) => {
    plantInstalled(scratch, { ...uiManifest, ...installedDeclarations, [`${pkgRel}/package.json`]: '{ "name": "@base-ui/react", "version": "9.9.9" }\n' });
    const result = pass(surfaceManifest, scratch, { [MANIFEST_REL]: surfaceManifestJson });

    expect(result.toolErrors).toEqual([]);
    expect(result.policies.map((owner) => owner.owner.status)).toEqual(["success"]);
    expect(result.authority.effectiveFindings).toEqual([]);
    expect(
      result.policies
        .flatMap((owner) => owner.receipts.filter((receipt) => receipt.kind === "resource"))
        .map((receipt) => ({ source: receipt.source, unresolved: receipt.unresolved }))
        .toSorted((left, right) => left.source.localeCompare(right.source)),
    ).toEqual([
      { source: "installed-package:base-ui:ast", unresolved: 0 },
      { source: "installed-package:base-ui:metadata", unresolved: 0 },
      { source: "json:baseui-manifest", unresolved: 0 },
    ]);
  });

  test("metadata UNRESOLVED — a manifest with a name and no version is a broken read, not an absent one", ({ scratch }) => {
    // Reachable from a real defect: a package whose manifest carries `name` but no string `version`.
    // `metadataFacts` throws and `loadInstalledPackage` maps that to `unresolved` — deliberately NOT
    // `missing`, because "run pnpm install" and "the reader is broken" send a reader to two places.
    plantInstalled(scratch, { ...uiManifest, ...installedDeclarations, [`${pkgRel}/package.json`]: '{ "name": "@base-ui/react" }\n' });
    const result = pass(surfaceManifest, scratch, { [MANIFEST_REL]: surfaceManifestJson });

    expect(refusalShape(result)).toMatchObject({ phases: ["evaluate"], ownerStatuses: ["incomplete"], findings: 0 });
    expect(result.toolErrors[0]?.message).toContain("installed-package:base-ui:metadata");
    expect(result.toolErrors[0]?.message).toContain("came back unresolved");
    expect(result.authority.withheldPolicyIds).toContain(surfaceManifest.id);
  });

  test("ast UNRESOLVED — an installed package publishing no declarations is the OTHER per-mode refusal", ({ scratch }) => {
    // The pair to the row above, and what proves the two doors refuse independently rather than sharing
    // one verdict: here the manifest is perfect and the `.d.ts` inventory is empty, so `metadata` is READY
    // and `ast` refuses. `ast` is read first in `evaluate`, so it is also the message that surfaces.
    plantInstalled(scratch, {
      ...uiManifest,
      [`${pkgRel}/package.json`]: '{ "name": "@base-ui/react", "version": "9.9.9" }\n',
      [`${pkgRel}/index.js`]: "module.exports = {};\n",
    });
    const result = pass(surfaceManifest, scratch, { [MANIFEST_REL]: surfaceManifestJson });

    expect(refusalShape(result)).toMatchObject({ phases: ["evaluate"], ownerStatuses: ["incomplete"], findings: 0 });
    expect(result.toolErrors[0]?.message).toContain("installed-package:base-ui:ast");
    expect(result.toolErrors[0]?.message).toContain("publishes no declaration files");
    expect(result.authority.withheldPolicyIds).toContain(surfaceManifest.id);
  });

  test("`missing` is NOT per-mode — both doors report it together, so one pin covers the status", ({ scratch }) => {
    // The construction limit, ASSERTED rather than written in prose above: this is the direct read of the
    // provider that makes "one pin per declared resource per status" satisfiable with a single row for
    // `missing`, and it reds if a future refactor ever gives the two modes separate resolutions.
    plantInstalled(scratch, uiManifest);

    expect(loadInstalledPackage(scratch, { id: "base-ui", mode: "ast" }).status).toBe("missing");
    expect(loadInstalledPackage(scratch, { id: "base-ui", mode: "metadata" }).status).toBe("missing");
  });
});

describe("§4.5 — the installed-surface READER's own blindness, which no proof row can reach", () => {
  // `installedSurfaceFrom` returning `undefined` is `baseui-surface-manifest`'s BLIND arm, and it is
  // UNFALSIFIABLE from a proof row by construction: `ops/resource-installed.ts` collects declaration paths
  // by walking DOWN from the directory it just resolved for that package, so every path it returns is under
  // the package root and a package it cannot resolve comes back `missing` instead. The claim is therefore
  // pinned one tier down, at the reader, where the input CAN be constructed.
  test("an anchorless declaration set derives NOTHING rather than an empty surface", () => {
    expect(installedPackageRootOf(["/tmp/nowhere/x.d.ts"])).toBeUndefined();
    expect(installedSurfaceFrom(["/tmp/nowhere/x.d.ts"], "9.9.9")).toBeUndefined();
  });

  test("the derivation is DRIVEN BY the declared paths — dropping one component's entry drops that component", ({ repoRoot }) => {
    const ast = loadInstalledPackage(repoRoot, { id: "base-ui", mode: "ast" });
    const metadata = loadInstalledPackage(repoRoot, { id: "base-ui", mode: "metadata" });
    expect(ast.status).toBe("ready");
    expect(metadata.status).toBe("ready");
    if (ast.status !== "ready" || ast.value.mode !== "ast" || metadata.status !== "ready" || metadata.value.mode !== "metadata") {
      throw new Error("the installed-package doors must be ready on the real tree");
    }
    const full = installedSurfaceFrom(ast.value.declarationPaths, metadata.value.version);
    if (full === undefined) {
      throw new Error("the installed surface must derive from the real declaration paths");
    }
    expect(full.version).toBe(metadata.value.version);
    expect(Object.hasOwn(full.components, "Select")).toBe(true);

    // THE POSITIVE CONTROL, without which "the paths are the subject" is a sentence rather than a fact: a
    // reader that ignored its argument and re-globbed the package directory would produce the identical
    // surface here.
    const withoutSelect = ast.value.declarationPaths.filter((path) => !path.endsWith("/select/index.d.ts"));
    const cut = installedSurfaceFrom(withoutSelect, metadata.value.version);
    if (cut === undefined) {
      throw new Error("the cut surface must still derive — only `Select` is expected to vanish");
    }
    expect(Object.hasOwn(cut.components, "Select")).toBe(false);
    expect(Object.keys(cut.components)).toHaveLength(Object.keys(full.components).length - 1);
  });
});

// ── §4.6 THE REAL-TREE DRIVE ────────────────────────────────────────────────────────────────────────

describe("the real tree — marker translation, and the conversion differential", () => {
  test("every translated marker across BOTH families BINDS: 0 effective, 9 waived, 0 alarms", ({ repoRoot }) => {
    const result = runPolicyPass({
      knownPolicies: [...POLICIES],
      policies: [...POLICIES],
      root: repoRoot,
      project: getProject(repoRoot),
      reviewedGrants: [],
      failOnWarnings: false,
    });

    expect(result.toolErrors).toEqual([]);
    // A FIXTURE CANNOT TEST THIS. The claim is that two markers a human MOVED in this commit bind to the
    // nodes the converted policy reports on the files as they sit on disk — which is only ever true or false
    // about those files. Before the translation this drive read `effective 2 / waived 0`, naming
    // `new-chat-picker-surface.tsx:133 NewChatPicker` and `corpus-home-surface.tsx:109 CorpusHomeSurface`;
    // after it, the same two sites are waived and nothing else moved.
    expect(result.authority.effectiveFindings).toEqual([]);
    // 2 + 7: the two `surface-a11y-focus` translations this file was minted for, plus the seven
    // `baseui-derives-not-respells` markers the #1584 conversion swapped from `@orb-gate-ignore` to
    // `@orb-waive` (combobox 3 · autocomplete 3 · select 1). `raw 9 = waived 9 = effective 0` is what makes
    // that swap a MEASUREMENT rather than a hope — a dead marker is silent in both directions and would
    // simply reappear as an effective finding here.
    expect(result.authority.waivedFindings).toHaveLength(9);
    expect(result.authority.authorityAlarms.filter((alarm) => POLICY_IDS.has(alarm.policyId))).toEqual([]);
  });

  test("the seven translated `baseui-derives-not-respells` markers close their arithmetic per file", ({ repoRoot }) => {
    // The step-6 reconciliation as ARITHMETIC. Legacy `@orb-gate-ignore baseui-derives-not-respells(` count
    // per file at 1692583d6 was 3/3/1; current `@orb-waive` count is 3/3/1; the retired vocabulary survives
    // in no product file. Every one was already on the line ABOVE its member, so no trailing-position site
    // moved and no position changed — the legacy position WAS the prop name at its own offset inside the
    // member, which is exactly what `locateFinding` requires, so this translation is a pure grammar swap.
    const sites = {
      "packages/ui/src/primitives/combobox/combobox.tsx": 3,
      "packages/ui/src/primitives/autocomplete/autocomplete.tsx": 3,
      "packages/ui/src/primitives/select/select.tsx": 1,
    } as const;
    const counts = (line: string, text: string): number => text.split("\n").filter((row) => row.trimStart().startsWith(line)).length;
    for (const [rel, expected] of Object.entries(sites)) {
      const text = readFileSync(join(repoRoot, rel), "utf8");
      expect(counts("// @orb-waive baseui-derives-not-respells(", text), rel).toBe(expected);
      expect(counts("// @orb-gate-ignore baseui-derives-not-respells(", text), rel).toBe(0);
    }
  });

  test("the two waivers are the only `@orb-waive` lines naming these policies, and no legacy grammar survives", ({ repoRoot }) => {
    // The step-6 marker reconciliation, closed as ARITHMETIC rather than as a per-file diff: a DELETED marker
    // is silent in both directions, so only a closed total proves nothing is hiding. Legacy total for
    // `@surface-focus-elsewhere` was 2 marker-form sites; current total is 2 `@orb-waive` lines naming
    // `surface-a11y-focus`, and the retired vocabulary appears in no product file at all.
    const sites = [
      "packages/client/src/features/chat/surfaces/new-chat-picker-surface.tsx",
      "packages/client/src/features/discovery/surfaces/corpus-home-surface.tsx",
    ];
    const texts = sites.map((rel) => readFileSync(join(repoRoot, rel), "utf8"));

    expect(texts.map((text) => text.split("\n").filter((line) => line.trimStart().startsWith("// @orb-waive surface-a11y-focus(")).length)).toEqual([1, 1]);
    expect(texts.map((text) => text.split("\n").filter((line) => line.trimStart().startsWith("// @surface-focus-elsewhere")).length)).toEqual([0, 0]);
  });
});

// ── §2309 — THE SCOPED-SELECTION CONTROL, on both live consumers of the ledger ───────────────────────
//
// The production control for the shared selection calculation (`lib/policy-effective-population.ts`), whose
// pure truth table is `tests/tooling/verify/lib/policy-effective-population.test.ts`. It is HERE because the
// defect was only ever visible through a real consumer: both `baseui-derives-not-respells` siblings declare
// `population: "@ui"`, `execution: "selected-files"` and `json:baseui-manifest`, so a changed-mode request
// can name the LEDGER without naming a single seal — and the ledger is exactly the input whose meaning
// decides every seal's verdict.
//
// MEASURED AT `028e278ee`, BEFORE THE FIX, with this same fixture pair:
//   · request = [the ledger]  → both siblings `mode: "run"`, `owner: success`, `effectiveSourcePaths: []`,
//     `findings: []`, `toolErrors: []` — a SUCCESSFUL CLEAN over zero subjects, while the identical tree at
//     whole scope reported one finding each;
//   · request = [the seal]    → both siblings `[create] resource request json:baseui-manifest is undeclared`,
//     owner `incomplete`, WITHHELD — the narrowed resource population withdrew the door the policy declares.
// Neither arm can be a proof row: a row supplies a fixture, never a narrowed REQUEST.
describe("§2309 — a changed LEDGER re-judges every seal, and a changed SEAL still gets the whole ledger", () => {
  /** The same seal under both siblings' arms: `items` is the ordinary DATA re-spelling, `onValueChange` the
   *  hard HANDLER one. Its verdict is decided entirely by what the ledger says a `Select.Root` exposes. */
  const DerivesSealPath = "packages/ui/src/primitives/select/probe-select.tsx";
  const DerivesSealSource =
    'import type { SelectRootProps } from "@base-ui/react/select";\nimport { Select as BaseSelect } from "@base-ui/react/select";\nexport interface SealProps {\n  items?: readonly string[];\n  onValueChange?: (value: string) => void;\n}\nexport const Seal = (p: SealProps) => <BaseSelect.Root {...p} />;\n';
  /** THE SEMANTIC EDIT, and the only thing that differs between the two arms below: a `Select.Root` that
   *  exposes NEITHER member leaves the seal above legal under both siblings. `DERIVES_MANIFEST_JSON` exposes
   *  both, and the unchanged seal is then a re-spelling twice over. */
  const LedgerBefore =
    '{ "version": "9.9.9", "components": { "Select": { "module": "@base-ui/react/select", "namespaced": true, "parts": {' +
    '"Root": { "kind": "part", "symbol": "SelectRoot", "from": "./root/SelectRoot.js", "props": [], "handlers": {}, "state": [], "inherits": [], "disposition": "exposed", "why": "" }' +
    "} } } }\n";

  function scopedPass(policy: GatePolicy, root: string, ledger: string, requestedPaths: readonly string[]): PolicyPassResult {
    const files = { [MANIFEST_REL]: ledger, [DerivesSealPath]: DerivesSealSource };
    const project = new Project({ skipAddingFilesFromTsConfig: true });
    project.createSourceFile(`${root}/${DerivesSealPath}`, DerivesSealSource, { overwrite: true });
    return runPolicyPass({
      knownPolicies: [policy],
      policies: [policy],
      root,
      project,
      requestedPaths,
      resourceOptions: { overlay: files },
      reviewedGrants: [],
      failOnWarnings: false,
    });
  }

  for (const policy of [derivesNotRespells, derivesNotRespellsHealth]) {
    test(`${policy.id}: a request naming ONLY the ledger re-judges the whole declared seal population`, ({ scratch }) => {
      // THE CONTROL FIRST — the same request against the ledger the seal is legal under. It must be a clean
      // that JUDGED: an empty `effectiveSourcePaths` would make the flagged arm below unfalsifiable, since a
      // run over zero subjects is clean whatever the ledger says.
      const before = scopedPass(policy, scratch, LedgerBefore, [MANIFEST_REL]);
      expect(before.toolErrors).toEqual([]);
      expect(before.policies[0]?.owner).toEqual({ status: "success", population: "complete" });
      expect(before.policies[0]?.population.effectiveSourcePaths).toEqual([DerivesSealPath]);
      expect(before.authority.effectiveFindings).toEqual([]);

      // THE ARM: only the ledger changed, and the seal nobody named is now a violation.
      const after = scopedPass(policy, scratch, DERIVES_MANIFEST_JSON, [MANIFEST_REL]);
      expect(after.toolErrors).toEqual([]);
      expect(after.policies[0]?.owner).toEqual({ status: "success", population: "complete" });
      expect(after.policies[0]?.population.effectiveSourcePaths).toEqual([DerivesSealPath]);
      expect(after.authority.withheldPolicyIds).toEqual([]);
      expect(after.authority.effectiveFindings).toMatchObject([{ policyId: policy.id, file: DerivesSealPath }]);
    });

    test(`${policy.id}: a request naming ONLY the seal keeps the ledger readable and the selection exact`, ({ scratch }) => {
      const result = scopedPass(policy, scratch, DERIVES_MANIFEST_JSON, [DerivesSealPath]);

      // No `[create] … is undeclared`: the declared resource is data, and a narrowed scope does not withdraw it.
      expect(result.toolErrors).toEqual([]);
      expect(result.policies[0]?.owner).toEqual({ status: "success", population: "complete" });
      expect(result.policies[0]?.population).toMatchObject({
        effectiveSourcePaths: [DerivesSealPath],
        effectiveResourcePaths: [MANIFEST_REL],
      });
      expect(result.policies[0]?.receipts).toMatchObject([{ kind: "resource", source: "json:baseui-manifest", unresolved: 0 }]);
      expect(result.authority.effectiveFindings).toMatchObject([{ policyId: policy.id, file: DerivesSealPath }]);
    });

    test(`${policy.id}: a request naming neither axis is still not-applicable — availability is not applicability`, ({ scratch }) => {
      const result = scopedPass(policy, scratch, DERIVES_MANIFEST_JSON, ["docs/architecture/core/AGENTS.md"]);

      expect(result.toolErrors).toEqual([]);
      expect(result.policies[0]?.owner).toMatchObject({ status: "not-applicable" });
      expect(result.policies[0]?.population.effectiveResourcePaths).toEqual([]);
      expect(result.authority.effectiveFindings).toEqual([]);
    });
  }
});
