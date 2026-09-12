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
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Project } from "ts-morph";
import { describe } from "vitest";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import type { PolicyPassResult } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { gate as portalContainerSeam } from "../../../../tooling/src/verify/gates/baseui-portal-container-seam.ts";
import { gate as stateDataAttributes } from "../../../../tooling/src/verify/gates/baseui-state-data-attributes.ts";
import { gate as surfaceA11yFocus } from "../../../../tooling/src/verify/gates/surface-a11y-focus.ts";
import { gate as surfaceInAContainer } from "../../../../tooling/src/verify/gates/surface-in-a-container.ts";
import { gate as surfaceInAContainerHealth } from "../../../../tooling/src/verify/gates/surface-in-a-container-health.ts";
import { getProject } from "../../../../tooling/src/verify/lib/harness.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const POLICIES = [portalContainerSeam, stateDataAttributes, surfaceA11yFocus, surfaceInAContainer, surfaceInAContainerHealth] as const;
const POLICY_IDS = new Set(POLICIES.map((policy) => policy.id));

const MANIFEST_REL = "tooling/src/verify/gates/baseui-surface.manifest.json";
/** The cheapest ledger that resolves the `json:baseui-manifest` declaration and names one stateful part. */
const MANIFEST_JSON =
  '{ "version": "9.9.9", "components": { "Popover": { "module": "@base-ui/react/popover", "namespaced": true, "parts": {' +
  '"Popup": { "kind": "part", "symbol": "PopoverPopup", "from": "./popup/PopoverPopup.js", "props": [], "handlers": {}, "state": ["open", "side"], "inherits": ["BaseUIComponentProps"], "disposition": "exposed", "why": "" }' +
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

// ── §4.6 THE REAL-TREE DRIVE ────────────────────────────────────────────────────────────────────────

describe("the real tree — marker translation, and the conversion differential", () => {
  test("both translated `@surface-focus-elsewhere` markers BIND: 0 effective, 2 waived, 0 alarms", ({ repoRoot }) => {
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
    expect(result.authority.waivedFindings).toHaveLength(2);
    expect(result.authority.authorityAlarms.filter((alarm) => POLICY_IDS.has(alarm.policyId))).toEqual([]);
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
