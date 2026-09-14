// The frozen legacy corpus remains executable while its 20 rows are compared with the three final
// production owners. Resource rows use physical scratch trees because authored-tree is their evidence.
import type { Finding, GateDescriptor } from "../../../../tooling/src/verify/contract/gate.ts";
import type { CoordinatedGateFinding, GateAuthorityAlarm, ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import { gate as health } from "../../../../tooling/src/verify/gates/ui-primitive-overlay-health.ts";
import { gate as permissions } from "../../../../tooling/src/verify/gates/ui-primitive-permissions.ts";
import { gate as ordinary } from "../../../../tooling/src/verify/gates/ui-primitive-structure.ts";
import { reviewedGrantsFor } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { verifyGateProofs } from "../../../../tooling/src/verify/ops/conformance.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import type { Files } from "../../../support/legacy-differential.ts";
import { exampleFiles, frozenFilesystemLegacyGate } from "../../../support/legacy-differential.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { runUiPrimitiveFinalReplay, runUiPrimitiveLegacyReplay } from "../../../support/ui-primitive-conversion-differential.ts";
import { scaledBudget } from "../../_load-budget.ts";

const BASE = "42b0594d4";
const LEGACY_PATH = "tooling/src/verify/gates/ui-primitive-structure.ts";
const POLICIES = [ordinary, permissions, health] as const;
const REPLAY_FILES: Files = {
  "packages/ui/src/primitives/replay/replay.tsx": 'export const Replay = () => <div data-slot="replay" />;\n',
  "packages/ui/src/primitives/replay/index.ts": 'export { Replay } from "./replay";\n',
  "packages/ui/src/primitives/replay/variants.ts": 'import { tv } from "#lib";\nexport const replayVariants = tv({ base: "block" });\n',
  "tests/ui/primitives/replay/replay.ct.tsx": "export const t = 1;\n",
};
const PRODUCTION_GRANT_IDS = [
  "ui-primitive-permissions:colors-color-field",
  "ui-primitive-permissions:colors-sandbox-frame",
  "ui-primitive-permissions:colors-theme-scope",
  "ui-primitive-permissions:ct-icons",
  "ui-primitive-permissions:provider-drawerprovider",
  "ui-primitive-permissions:provider-drawervirtualkeyboardprovider",
  "ui-primitive-permissions:shape-aria-announcer",
  "ui-primitive-permissions:shape-file-trigger",
  "ui-primitive-permissions:shape-icons",
  "ui-primitive-permissions:shape-message-list",
  "ui-primitive-permissions:shape-virtual-list",
] as const;

interface SiteIdentity {
  readonly file: string;
  readonly line: number;
  readonly arm: string;
}
interface FindingIdentity {
  readonly owner: "legacy" | "ui-primitive-structure" | "ui-primitive-overlay-health" | "ui-primitive-permissions";
  readonly arm: string;
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly token?: string;
  readonly subject?: string;
  readonly operation?: string;
  readonly sites?: readonly SiteIdentity[];
}

function sortedIdentities(values: readonly FindingIdentity[]): readonly FindingIdentity[] {
  return [...values].toSorted((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function staleLegacyArm(message: string): string | undefined {
  const variants = /^stale VARIANTS_EXEMPT row — `(?<name>[^`]+)` is not a primitive directory/u.exec(message)?.groups?.["name"];
  if (variants !== undefined) {
    return `stale:ui-primitive-permissions:shape-${variants}`;
  }
  const testName = /^stale TEST_EXEMPT row — `(?<name>[^`]+)` is not a primitive directory/u.exec(message)?.groups?.["name"];
  if (testName === "icons") {
    return "stale:ui-primitive-permissions:ct-icons";
  }
  if (testName === "aria-announcer") {
    return "stale:retired-aria-announcer-ct";
  }
  const provider = /^stale PROVIDER_ALLOW row — `<(?<tag>[^>]+)>` appears/u.exec(message)?.groups?.["tag"];
  if (provider !== undefined) {
    return `stale:ui-primitive-permissions:provider-${provider.toLowerCase()}`;
  }
  const color = /^stale COLOR_LITERAL_TEST_EXEMPT row — `(?<name>[^.]+)[.]ct[.]tsx`/u.exec(message)?.groups?.["name"];
  return color === undefined ? undefined : `stale:ui-primitive-permissions:colors-${color}`;
}

function legacyIdentity(finding: Finding, gate: GateDescriptor): FindingIdentity {
  const base = { owner: "legacy" as const, file: finding.file, line: finding.line, column: finding.column };
  if (finding.token === "variants-leak") {
    return { ...base, arm: "variants-leak", token: finding.token };
  }
  if (finding.token?.startsWith("tv-export-name:") === true) {
    return { ...base, arm: "shape:tv-export-name", token: finding.token };
  }
  const message = finding.message ?? gate.message;
  const fixed: readonly (readonly [needle: string, arm: string])[] = [
    ["missing index.ts —", "shape:missing-index"],
    ["missing variants.ts —", "shape:missing-variants"],
    ["no co-located CT —", "ct:missing"],
    ["hardcoded color literal in a .ct.tsx —", "color:literal"],
    ["inline <ThemeProvider> in a test —", "provider:ThemeProvider"],
    ["inline <svg> glyph —", "inline-svg"],
    ["modal overlay 'dialog' must NOT have a .Positioner —", "overlay:modal-positioner"],
    ["no data-slot locator —", "shape:data-slot"],
  ];
  const arm = fixed.find(([needle]) => message.startsWith(needle))?.[1] ?? staleLegacyArm(message);
  if (arm === undefined) {
    throw new Error(`unclassified legacy UI primitive finding: ${JSON.stringify(finding)}`);
  }
  return { ...base, arm };
}

function permissionSiteArm(note: string): string {
  const exact = new Map<string, string>([
    ["missing index.ts — a styled primitive requires its component, index and variants files.", "missing-index"],
    ["missing variants.ts — a styled primitive requires its component, index and variants files.", "missing-variants"],
    ["tv-export-name:wrongVariants — expected thingVariants.", "tv-export-name:wrongVariants"],
    ["no data-slot locator — every primitive part declares its locator.", "data-slot"],
    ["hardcoded color literal in a .ct.tsx — assert colors via TOKENS.", "color-literal"],
  ]).get(note);
  if (exact !== undefined) {
    return exact;
  }
  if (/^missing [a-z-]+[.]tsx — a styled primitive requires its component, index and variants files[.]$/u.test(note)) {
    return "missing-component";
  }
  if (/^no co-located CT — expected tests\/ui\/primitives\/[a-z-]+\/[a-z-]+[.]ct[.]tsx[.]$/u.test(note)) {
    return "missing-ct";
  }
  const provider = /^inline <(?<tag>[^>]+)> in a test — global providers live in CtProviders[.]$/u.exec(note)?.groups?.["tag"];
  if (provider !== undefined) {
    return `inline-provider:${provider}`;
  }
  throw new Error(`unclassified UI primitive permission site: ${note}`);
}

function permissionSites(message: string, subject: string, operation: string): readonly SiteIdentity[] {
  const prefix = `${permissions.message} Subject: ${subject}, operation: ${operation}, site(s): `;
  if (!(message.startsWith(prefix) && message.endsWith("."))) {
    throw new Error(`malformed UI primitive permission message: ${message}`);
  }
  return message
    .slice(prefix.length, -1)
    .split(/, (?=[^,]+:\d+ \()/u)
    .map((entry) => {
      const groups = /^(?<file>.+):(?<line>\d+) \((?<note>.+)\)$/u.exec(entry)?.groups;
      if (groups === undefined) {
        throw new Error(`malformed UI primitive permission site: ${entry}`);
      }
      return { file: groups["file"] as string, line: Number(groups["line"]), arm: permissionSiteArm(groups["note"] as string) };
    });
}

function finalIdentity(finding: CoordinatedGateFinding): FindingIdentity {
  if (finding.policyId === permissions.id) {
    if (finding.subject === undefined || finding.operation === undefined || finding.message === undefined || finding.fix !== permissions.fix) {
      throw new Error(`incomplete UI primitive permission identity: ${JSON.stringify(finding)}`);
    }
    return {
      owner: permissions.id,
      arm: `permission:${finding.operation}`,
      file: finding.file,
      line: finding.line,
      column: finding.column,
      subject: finding.subject,
      operation: finding.operation,
      sites: permissionSites(finding.message, finding.subject, finding.operation),
    };
  }
  if (finding.policyId === ordinary.id) {
    const arm = new Map([
      ["./variants", "variants-leak"],
      ["svg", "inline-svg"],
    ]).get(finding.token ?? "");
    if (arm === undefined || finding.message !== undefined || finding.fix !== undefined || finding.subject !== undefined || finding.operation !== undefined) {
      throw new Error(`unclassified ordinary UI primitive finding: ${JSON.stringify(finding)}`);
    }
    return { owner: ordinary.id, arm, file: finding.file, line: finding.line, column: finding.column, token: finding.token };
  }
  if (finding.policyId === health.id && finding.message === "modal overlay 'dialog' must NOT have a .Positioner.") {
    return { owner: health.id, arm: "overlay:modal-positioner", file: finding.file, line: finding.line, column: finding.column };
  }
  throw new Error(`unclassified final UI primitive finding: ${JSON.stringify(finding)}`);
}

const legacy = (...[arm, file, line, column, token]: readonly [string, string, number, number, string?]): FindingIdentity => ({
  owner: "legacy",
  arm,
  file,
  line,
  column,
  ...(token === undefined ? {} : { token }),
});
const final = (...[owner, arm, file, line, column, token]: readonly [FindingIdentity["owner"], string, string, number, number, string?]): FindingIdentity => ({
  owner,
  arm,
  file,
  line,
  column,
  ...(token === undefined ? {} : { token }),
});
const permission = (...[subject, operation, file, line, sites]: readonly [string, string, string, number, readonly SiteIdentity[]]): FindingIdentity => ({
  owner: permissions.id,
  arm: `permission:${operation}`,
  file,
  line,
  column: 1,
  subject,
  operation,
  sites,
});
const site = (file: string, line: number, arm: string): SiteIdentity => ({ file, line, arm });

const THING = "packages/ui/src/primitives/thing";
const THING_TSX = `${THING}/thing.tsx`;
const THING_CT = "tests/ui/primitives/thing/thing.ct.tsx";
const stale = (arm: string): FindingIdentity => legacy(`stale:${arm}`, LEGACY_PATH, 1, 0);
const grantIds = [...PRODUCTION_GRANT_IDS];

const PASS_ZERO_RAW: readonly FindingIdentity[] = [
  permission("packages/ui/src/primitives/aria-announcer", "primitive-ct", "packages/ui/src/primitives/aria-announcer", 1, [
    site("packages/ui/src/primitives/aria-announcer", 1, "missing-ct"),
  ]),
  ...["aria-announcer", "file-trigger", "icons", "message-list", "virtual-list"].map((name) =>
    permission(`packages/ui/src/primitives/${name}`, "primitive-shape", `packages/ui/src/primitives/${name}`, 1, [
      site(`packages/ui/src/primitives/${name}`, 1, "missing-component"),
      site(`packages/ui/src/primitives/${name}`, 1, "missing-variants"),
    ]),
  ),
  permission("packages/ui/src/primitives/icons", "primitive-ct", "packages/ui/src/primitives/icons", 1, [
    site("packages/ui/src/primitives/icons", 1, "missing-ct"),
  ]),
  ...[
    "tests/ui/content/sandbox-frame/sandbox-frame.ct.tsx",
    "tests/ui/content/theme-scope/theme-scope.ct.tsx",
    "tests/ui/primitives/color-field/color-field.ct.tsx",
  ].map((file) => permission(file, "test-color-values", file, 1, [site(file, 1, "color-literal")])),
  permission("DrawerProvider", "inline-test-provider", "tests/ui/primitives/drawer/drawer.fixtures.tsx", 2, [
    site("tests/ui/primitives/drawer/drawer.fixtures.tsx", 2, "inline-provider:DrawerProvider"),
  ]),
  permission("DrawerVirtualKeyboardProvider", "inline-test-provider", "tests/ui/primitives/drawer/drawer.fixtures.tsx", 3, [
    site("tests/ui/primitives/drawer/drawer.fixtures.tsx", 3, "inline-provider:DrawerVirtualKeyboardProvider"),
  ]),
];

interface RowExpectation {
  readonly transition: string;
  readonly legacy: readonly FindingIdentity[];
  readonly final: readonly FindingIdentity[];
  readonly raw?: readonly FindingIdentity[];
  readonly grants?: readonly string[];
  readonly staleAlarms?: readonly string[];
}

const ROWS: readonly RowExpectation[] = [
  {
    transition: "three file findings become two exact candidates; shape sites group and the directory anchor moves 0→1",
    legacy: [legacy("shape:missing-index", `${THING}/`, 0, 0), legacy("shape:missing-variants", `${THING}/`, 0, 0), legacy("ct:missing", `${THING}/`, 0, 0)],
    final: [
      permission(THING, "primitive-shape", THING, 1, [site(THING, 1, "missing-index"), site(THING, 1, "missing-variants")]),
      permission(THING, "primitive-ct", THING, 1, [site(THING, 1, "missing-ct")]),
    ],
  },
  {
    transition: "tv export-name moves from a node token at column 14 to a grouped shape site at column 1",
    legacy: [legacy("shape:tv-export-name", `${THING}/variants.ts`, 2, 14, "tv-export-name:wrongVariants")],
    final: [permission(THING, "primitive-shape", `${THING}/variants.ts`, 2, [site(`${THING}/variants.ts`, 2, "tv-export-name:wrongVariants")])],
  },
  {
    transition: "interpolated color code keeps file and line while moving to exact reviewed authority",
    legacy: [legacy("color:literal", THING_CT, 1, 0)],
    final: [permission(THING_CT, "test-color-values", THING_CT, 1, [site(THING_CT, 1, "color-literal")])],
  },
  {
    transition: "comment-blind data-slot catch keeps file and line under the shape owner",
    legacy: [legacy("shape:data-slot", THING_TSX, 1, 0)],
    final: [permission(THING, "primitive-shape", THING_TSX, 1, [site(THING_TSX, 1, "data-slot")])],
  },
  {
    transition: "variants leak remains ordinary; discriminator becomes the authored ./variants token at column 16",
    legacy: [legacy("variants-leak", `${THING}/index.ts`, 2, 1, "variants-leak")],
    final: [final(ordinary.id, "variants-leak", `${THING}/index.ts`, 2, 16, "./variants")],
  },
  {
    transition: "literal color keeps file and line under exact reviewed authority",
    legacy: [legacy("color:literal", THING_CT, 1, 0)],
    final: [permission(THING_CT, "test-color-values", THING_CT, 1, [site(THING_CT, 1, "color-literal")])],
  },
  {
    transition: "comment blanking preserves the authored color's line 2 coordinate",
    legacy: [legacy("color:literal", THING_CT, 2, 0)],
    final: [permission(THING_CT, "test-color-values", THING_CT, 2, [site(THING_CT, 2, "color-literal")])],
  },
  {
    transition: "narration blanking preserves the toHaveCSS value's line 2 coordinate",
    legacy: [legacy("color:literal", THING_CT, 2, 0)],
    final: [permission(THING_CT, "test-color-values", THING_CT, 2, [site(THING_CT, 2, "color-literal")])],
  },
  {
    transition: "value-bearing regex color keeps its line 1 coordinate",
    legacy: [legacy("color:literal", THING_CT, 1, 0)],
    final: [permission(THING_CT, "test-color-values", THING_CT, 1, [site(THING_CT, 1, "color-literal")])],
  },
  {
    transition: "provider keeps file and line and gains exact provider subject/operation authority",
    legacy: [legacy("provider:ThemeProvider", THING_CT, 1, 0)],
    final: [permission("ThemeProvider", "inline-test-provider", THING_CT, 1, [site(THING_CT, 1, "inline-provider:ThemeProvider")])],
  },
  {
    transition: "SVG remains ordinary and moves from a file message to the authored svg token at column 29",
    legacy: [legacy("inline-svg", THING_TSX, 1, 0)],
    final: [final(ordinary.id, "inline-svg", THING_TSX, 1, 29, "svg")],
  },
  {
    transition: "modal anatomy splits to hard overlay health while keeping file and line",
    legacy: [legacy("overlay:modal-positioner", "packages/ui/src/primitives/dialog/dialog.tsx", 1, 0)],
    final: [final(health.id, "overlay:modal-positioner", "packages/ui/src/primitives/dialog/dialog.tsx", 1, 1)],
  },
  {
    transition: "data-slot keeps file and line under exact primitive-shape authority",
    legacy: [legacy("shape:data-slot", THING_TSX, 1, 0)],
    final: [permission(THING, "primitive-shape", THING_TSX, 1, [site(THING_TSX, 1, "data-slot")])],
  },
  {
    transition: "12 private stale rows become 11 central stale alarms; aria-announcer CT has no grant",
    legacy: [...grantIds.map((id) => stale(id)), stale("retired-aria-announcer-ct")],
    final: [],
    staleAlarms: grantIds,
  },
  {
    transition: "legacy-hidden exemptions become 12 raw candidates and 11 grants; aria-announcer CT stays live",
    legacy: [],
    final: [PASS_ZERO_RAW[0] as FindingIdentity],
    raw: PASS_ZERO_RAW,
    grants: grantIds,
  },
  {
    transition: "complete primitive trio, locator, and CT remains an exact pass",
    legacy: [],
    final: [],
  },
  {
    transition: "comment-only issue and color spellings remain blanked and pass",
    legacy: [],
    final: [],
  },
  {
    transition: "test-title and expect-message issue citations remain narration and pass",
    legacy: [],
    final: [],
  },
  {
    transition: "format-only color-function regex remains outside the value-bearing color arm",
    legacy: [],
    final: [],
  },
  {
    transition: "parameterized template-title citation remains narration and passes",
    legacy: [],
    final: [],
  },
];

function expectedResourcePaths(files: Files): readonly string[] {
  const roots = ["packages/ui/src/primitives", "tests"];
  const paths = new Set<string>();
  for (const file of Object.keys(files)) {
    const root = roots.find((candidate) => file.startsWith(`${candidate}/`));
    if (root === undefined) {
      continue;
    }
    const segments = file.split("/");
    const rootLength = root.split("/").length;
    for (let length = rootLength + 1; length <= segments.length; length += 1) {
      paths.add(segments.slice(0, length).join("/"));
    }
  }
  return [...paths].toSorted();
}

function assertFinalPopulation(result: ReturnType<typeof runUiPrimitiveFinalReplay>, files: Files, tag: string): void {
  const ui = Object.keys(files)
    .filter((path) => path.startsWith("packages/ui/src/"))
    .toSorted();
  const all = Object.keys(files)
    .filter((path) => path.startsWith("packages/ui/src/") || path.startsWith("tests/ui/"))
    .toSorted();
  const owners = new Map(result.policies.map((owner) => [owner.id, owner]));
  expect(owners.get(ordinary.id)?.population.effectiveSourcePaths, `${tag} ordinary source population identities`).toEqual(ui);
  expect(owners.get(health.id)?.population.effectiveSourcePaths, `${tag} health source population identities`).toEqual(ui);
  expect(owners.get(permissions.id)?.population.effectiveSourcePaths, `${tag} permission source population identities`).toEqual(all);
  expect(owners.get(ordinary.id)?.population.effectiveResourcePaths, `${tag} ordinary has no resource population`).toEqual([]);
  expect(owners.get(health.id)?.population.effectiveResourcePaths, `${tag} health has no resource population`).toEqual([]);
  expect(owners.get(permissions.id)?.population.effectiveResourcePaths, `${tag} exact authored-tree population identities`).toEqual(
    expectedResourcePaths(files),
  );
  expect(result.facts, `${tag} one shared fact owner`).toHaveLength(1);
  expect(result.facts[0]?.id, `${tag} shared fact identity`).toBe("ui-primitive");
  expect(result.facts[0]?.population.effectiveSourcePaths, `${tag} shared fact population identities`).toEqual(all);
  expect(result.facts[0]?.population.effectiveResourcePaths, `${tag} shared fact has no resources`).toEqual([]);
}

function alarmIdentity(alarm: GateAuthorityAlarm): string {
  if (alarm.kind !== "stale-reviewed-grant") {
    throw new Error(`unexpected UI primitive authority alarm: ${JSON.stringify(alarm)}`);
  }
  return `${alarm.policyId}|${alarm.grantId}|${alarm.subject}|${alarm.operation}`;
}

test(
  "every UI primitive structure example still holds through production legacy dispatch",
  async ({ scratch }) => {
    const gate = await frozenFilesystemLegacyGate(scratch, BASE, LEGACY_PATH);
    expect(verifyGateProofs([gate])).toEqual([]);
  },
  scaledBudget(30_000),
);

test("final UI primitive authority owners execute their declared proofs", () => {
  expect(verifyPolicyProofs(POLICIES)).toEqual([]);
});

test(
  "§4.6 replays all 14 flag and 6 pass rows through the production UI primitive split",
  async ({ scratch }) => {
    const frozen = await frozenFilesystemLegacyGate(scratch, BASE, LEGACY_PATH);
    const examples = [...frozen.mustFlag, ...frozen.mustPass];
    const productionGrants = reviewedGrantsFor([permissions]);
    expect(examples, "the frozen corpus is exactly 14 flag + 6 pass rows").toHaveLength(20);
    expect(frozen.mustFlag).toHaveLength(14);
    expect(frozen.mustPass).toHaveLength(6);
    expect(ROWS, "every frozen row has an explicit transition classification").toHaveLength(20);
    expect(
      productionGrants.map(({ id }) => id),
      "the production table contains exactly the 11 migrated grants",
    ).toEqual(PRODUCTION_GRANT_IDS);

    for (const [index, example] of examples.entries()) {
      const expected = ROWS[index] as RowExpectation;
      const tag = `row ${String(index)} — ${expected.transition}`;
      const rawFiles = exampleFiles(example, THING_TSX);
      const files = { ...rawFiles, ...REPLAY_FILES };
      const rawLegacy = runUiPrimitiveLegacyReplay(scratch, frozen, rawFiles);
      const before = runUiPrimitiveLegacyReplay(scratch, frozen, files);
      const grants = expected.staleAlarms !== undefined || expected.grants !== undefined ? productionGrants : [];
      const after = runUiPrimitiveFinalReplay(scratch, POLICIES, files, grants);
      const rawLegacyFindings = rawLegacy.gates[0]?.findings ?? [];
      const legacyFindings = before.gates[0]?.findings ?? [];

      expect(rawLegacy.toolErrors, `${tag} raw legacy tool errors`).toEqual([]);
      expect(before.toolErrors, `${tag} completed legacy tool errors`).toEqual([]);
      expect(sortedIdentities(legacyFindings.map((finding) => legacyIdentity(finding, frozen))), `${tag} exact legacy finding identities`).toEqual(
        sortedIdentities(expected.legacy),
      );
      expect(
        sortedIdentities(rawLegacyFindings.map((finding) => legacyIdentity(finding, frozen))),
        `${tag} neutral replay primitive is inert on the legacy verdict`,
      ).toEqual(sortedIdentities(expected.legacy));
      expect(before.gates[0]?.scan.candidates, `${tag} exact legacy source population cardinality`).toBe(Object.keys(files).length);
      expect(before.gates[0]?.scan.scanned, `${tag} legacy scans every materialized source`).toBe(Object.keys(files).length);

      expect(after.factErrors, `${tag} fact errors`).toEqual([]);
      expect(after.toolErrors, `${tag} policy errors`).toEqual([]);
      expect(after.authority.toolErrors, `${tag} authority errors`).toEqual([]);
      expect(after.authority.withheldPolicyIds, `${tag} withheld owners`).toEqual([]);
      expect(after.waiverCarrierRefusals, `${tag} waiver carrier refusals`).toEqual([]);
      expect(
        after.policies.map(({ id, owner }) => [id, owner.status]),
        `${tag} all three production owners complete`,
      ).toEqual([
        [health.id, "success"],
        [permissions.id, "success"],
        [ordinary.id, "success"],
      ]);
      assertFinalPopulation(after, files, tag);

      const effective = after.authority.effectiveFindings.map(finalIdentity);
      const raw = [
        ...after.authority.effectiveFindings,
        ...after.authority.waivedFindings.map(({ finding }) => finding),
        ...after.authority.grantedFindings.map(({ finding }) => finding),
      ].map(finalIdentity);
      expect(sortedIdentities(effective), `${tag} exact final effective finding identities`).toEqual(sortedIdentities(expected.final));
      expect(sortedIdentities(raw), `${tag} exact final raw finding identities`).toEqual(sortedIdentities(expected.raw ?? expected.final));
      expect(after.authority.waivedFindings, `${tag} this differential authors no ordinary marker`).toEqual([]);
      expect(after.authority.grantedFindings.map(({ grantId }) => grantId).toSorted(), `${tag} exact consumed grant identities`).toEqual(
        [...(expected.grants ?? [])].toSorted(),
      );

      const expectedAlarms = productionGrants
        .filter(({ id }) => expected.staleAlarms?.includes(id) ?? false)
        .map((grant: ReviewedGateGrant) => `${permissions.id}|${grant.id}|${grant.subject}|${grant.operation}`)
        .toSorted();
      expect(after.authority.authorityAlarms.map(alarmIdentity).toSorted(), `${tag} exact central stale alarms`).toEqual(expectedAlarms);
    }
  },
  scaledBudget(120_000),
);
