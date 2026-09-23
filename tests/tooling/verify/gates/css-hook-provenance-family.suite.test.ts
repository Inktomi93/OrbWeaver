import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Project } from "ts-morph";
import type { ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import type { PolicyPassResult } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { gate as directClientMechanism } from "../../../../tooling/src/verify/gates/css-family-direct-client-mechanism.ts";
import { gate as familyOwnership } from "../../../../tooling/src/verify/gates/css-family-ownership.ts";
import { gate as familyOwnershipHealth } from "../../../../tooling/src/verify/gates/css-family-ownership-health.ts";
import { gate as selectorWriter } from "../../../../tooling/src/verify/gates/css-selector-has-a-writer.ts";
import { gate as selectorWriterHealth } from "../../../../tooling/src/verify/gates/css-selector-has-a-writer-health.ts";
import { installedPackageRootOf } from "../../../../tooling/src/verify/lib/baseui-read.ts";
import {
  BASE_UI_MANIFEST_PATH,
  CLEAN_PRODUCT_CSS,
  EMPTY_BASE_UI_MANIFEST,
  INERT_SOURCE,
  SELECTOR_FIXTURE,
  VENDOR_SURFACE_FIXTURE,
} from "../../../../tooling/src/verify/lib/css-family-proof-fixtures.ts";
import { cssHookProvenanceFact } from "../../../../tooling/src/verify/lib/css-family-source-provenance.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { ROOT } from "../../../../tooling/src/verify/lib/repo-paths.ts";
import { REVIEWED_GRANTS } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { waivableCoordinate } from "../../../../tooling/src/verify/lib/waivable-coordinate.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { loadInstalledPackage } from "../../../../tooling/src/verify/ops/resource-installed.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

/** The five `mode: "resource"` policies each materialise a temp repository per row. Measured well over
 *  vitest's 5s default on a loaded box. */
const PROOF_BUDGET_MS = 120_000;

test(
  "the css-hook-provenance family keeps every declared proof arm",
  () => {
    expect(verifyPolicyProofs([familyOwnership, familyOwnershipHealth, directClientMechanism, selectorWriter, selectorWriterHealth])).toEqual([]);
  },
  PROOF_BUDGET_MS,
);

/** THE §4.3 GRANT-IDENTITY ARM, which a proof row cannot express: `runPolicyPass` inside a module's own rows
 *  pins `reviewedGrants: []`, so a reviewed-grant policy proves nothing about CONSUMPTION there.
 *
 *  This is the arm the conversion OWES, because the three bounded direct-skin recipes were
 *  `EXPECTED_DIRECT_CLIENT_UI_MECHANISMS` — three hand-spelled COUNTS in `lib/css-family-census.ts` — until
 *  #2181, and §12.5 bans a count ratchet. What the migration must not lose is the count's two-sided ratchet:
 *  the row licenses exactly the recipe it names, and a recipe that stopped being painted goes STALE rather
 *  than sitting forever. Both directions are below, plus the wrong-operation control that says the identity
 *  is the (carrier, hook) PAIR and not the file. */
const CLIENT_GLOBALS = "packages/client/src/styles/globals.css";
const DIALOG = "packages/ui/src/primitives/dialog.tsx";
const OVERLAY = {
  "packages/ui/src/styles/theme.css": "@theme {\n  --color-background: black;\n}\n",
  "packages/ui/src/styles/globals.css": ":root { font-size: 100%; }\n",
  "packages/ui/src/styles/tiers.css": '[data-surface-tier="base"] { --spacing-x: 0; }\n',
  [CLIENT_GLOBALS]: 'html [data-slot="dialog-popup"] { border-radius: 1rem; }\n',
  "packages/client/src/features/app-shell/surfaces/shell.css": ":root { view-transition-name: none; }\n",
} as const;

function grant(subject: string, operation: string): ReviewedGateGrant {
  // The id is DERIVED from the identity, never a shared literal: two rows sharing an id reconcile as one and
  // the stale arm below reads clean.
  return {
    id: `css-family-direct-client-mechanism:probe:${subject}:${operation}`,
    policyId: "css-family-direct-client-mechanism",
    subject,
    operation,
    why: "probe row",
    endsWhen: "the probe ends",
  };
}

function pass(scratch: string, grants: readonly ReviewedGateGrant[]): PolicyPassResult {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  project.createSourceFile(`${scratch}/${DIALOG}`, 'export const dialog = <div data-slot="dialog-popup" />;\n', { overwrite: true });
  return runPolicyPass({
    knownPolicies: [directClientMechanism],
    policies: [directClientMechanism],
    root: scratch,
    project,
    resourceOptions: { overlay: OVERLAY },
    reviewedGrants: grants,
    failOnWarnings: false,
  });
}

test("the exact (carrier, hook) grant consumes the ruled recipe once and leaves no alarm", ({ scratch }) => {
  const result = pass(scratch, [grant(CLIENT_GLOBALS, "direct-client-mechanism:slot:dialog-popup")]);

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.authorityAlarms).toEqual([]);
});

test("a grant naming the CARRIER but the wrong hook licenses nothing, and stales — the identity is the pair", ({ scratch }) => {
  const result = pass(scratch, [grant(CLIENT_GLOBALS, "direct-client-mechanism:slot:tooltip-popup")]);

  expect(result.authority.effectiveFindings.map(({ operation }) => operation)).toEqual(["direct-client-mechanism:slot:dialog-popup"]);
  expect(result.authority.authorityAlarms.map(({ kind }) => kind)).toEqual(["stale-reviewed-grant"]);
});

test("a grant whose recipe stopped being painted is STALE — the two-sided ratchet the retired count owned by hand", ({ scratch }) => {
  const result = pass(scratch, [
    grant(CLIENT_GLOBALS, "direct-client-mechanism:slot:dialog-popup"),
    grant(CLIENT_GLOBALS, "direct-client-mechanism:slot:message-list-scroll"),
  ]);

  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.authorityAlarms.map(({ kind }) => kind)).toEqual(["stale-reviewed-grant"]);
});

/** The three migrated rows, held two-sided against the policy they license. A row added for a policy that
 *  cannot report its identity shape would pass every other check in the tree. */
test("every direct-client-mechanism grant names a slot operation on the client globals carrier", () => {
  const rows = REVIEWED_GRANTS.filter(({ policyId }) => policyId === "css-family-direct-client-mechanism");

  expect(rows).toHaveLength(3);
  expect(rows.every(({ operation }) => operation.startsWith("direct-client-mechanism:slot:"))).toBe(true);
  expect(rows.every(({ subject }) => subject === CLIENT_GLOBALS)).toBe(true);
});

/** THE CONSUMER COUNT, HELD TWO-SIDED — #2305, the 2026-09-13 CSS-family verifier review ledger row 5.
 *
 *  Four prose homes said the `css-hook-provenance` fact had FIVE consumers by counting the FAMILY: both
 *  `-health` siblings declare `facts: []` and never call `ctx.fact`, so the real number is THREE. A prose
 *  count nothing holds is a §5b item-5 defect, and it recurs — so this pins BOTH halves and requires them to
 *  agree:
 *
 *    - the DECLARED half, off the loaded descriptors (`policy.facts`), which is what the runtime binds; and
 *    - the CALL half, a literal census of `ctx.fact(cssHookProvenanceFact)` over the whole gates directory,
 *      which is what the prose describes.
 *
 *  Either side moving without the other reds. The census carries its own PLANTED CONTROL in the same
 *  invocation — a bare zero from a text sweep is "I could not measure", never "it is not there". */
const GATES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../tooling/src/verify/gates");
const CONSUMERS = ["css-family-direct-client-mechanism", "css-family-ownership", "css-selector-has-a-writer"];

test("the css-hook-provenance fact has exactly THREE consumers, declared and called, held two-sided", () => {
  // Typed as the CONTRACT rather than as the five literal descriptors: tsc narrows a `-health` module's
  // `facts` to `readonly []`, and `includes` on that takes `never` — the identity check is the point, so the
  // widening is where it belongs.
  const family: readonly GatePolicy[] = [familyOwnership, familyOwnershipHealth, directClientMechanism, selectorWriter, selectorWriterHealth];
  const declared = family
    .filter((policy) => policy.facts.includes(cssHookProvenanceFact))
    .map((policy) => policy.id)
    .toSorted((left, right) => left.localeCompare(right));

  expect(declared).toEqual(CONSUMERS);

  const modules = readdirSync(GATES_DIR).filter((name) => name.endsWith(".ts"));
  const called = modules
    .filter((name) => readFileSync(join(GATES_DIR, name), "utf8").includes("ctx.fact(cssHookProvenanceFact)"))
    .map((name) => name.replace(/\.ts$/u, ""))
    .toSorted((left, right) => left.localeCompare(right));
  // PLANTED POSITIVE CONTROL, same invocation: the sweep can see a `ctx.fact(` call at all.
  const anyFactCall = modules.filter((name) => readFileSync(join(GATES_DIR, name), "utf8").includes("ctx.fact(")).length;

  expect(modules.length).toBeGreaterThan(200);
  expect(anyFactCall).toBeGreaterThan(CONSUMERS.length);
  expect(called).toEqual(CONSUMERS);
});

/** Both `-health` siblings read the CSS identity ALONE — the half the overstated prose kept getting wrong. */
test("neither -health sibling declares the fact", () => {
  expect(familyOwnershipHealth.facts).toEqual([]);
  expect(selectorWriterHealth.facts).toEqual([]);
});

// ── §4.5 — vendorCensus's designed refusal, and its type-obligation invariants (#2310) ─────────────────
//
// `css-selector-has-a-writer.ts#vendorCensus` carries FOUR in-module throws across itself and its own
// `hookCoordinate` (the twin of `css-family-policy.ts#selectorCoordinate`); none had a pin before this file.
// One is REACHABLE from a constructible input — a committed `baseui-manifest` that is valid JSON but fails
// `surfaceManifestFrom`'s schema — and gets the ordinary §4.5 shape below: a planted red input and its
// healthy twin. The other three are TYPE OBLIGATIONS with NO CONSTRUCTIBLE FIXTURE (guide §6.1's fourth
// outcome), each pinned as an INVARIANT DECLARATION against the real loader/predicate instead of a fake
// refusal row:
//   * the mode-mismatch branch (`installed.mode !== "ast"`) — `loadInstalledPackage`
//     (`ops/resource-installed.ts#astFacts`) always returns the mode it was asked for, and
//     `resource-declaration.ts#resourceRequestIdentity` keys the resource-host cache by the WHOLE identity
//     including mode, so two different modes of the same package can never answer each other's slot;
//   * the anchorless-surface branch (`surface === undefined`) — `base-ui`'s `INSTALLED_PACKAGE_DEFINITIONS`
//     entry carries no `via`/`directoryAnchor` indirection, so `astFacts`' `collectDeclarations` walk starts
//     at the resolved package directory itself and every returned path is that directory joined with a
//     child segment — which means every path already contains the `/@base-ui/react/` anchor
//     `installedPackageRootOf` searches for, by construction, whenever the door answers `ready`;
//   * `hookCoordinate`'s own refusal (`waivableCoordinate` returning `undefined`) — every `SelectorHookIdentity.authored`
//     slice begins with `.` or `[` (neither excluded by the `@orb-waive` position grammar), so the leading
//     paren-free run is never empty and never whitespace-only, which are the only two ways
//     `waivableCoordinate` returns `undefined`. This is the SAME measurement `css-selector-has-a-writer.ts`'s
//     own header already states MEASURED (a `[data-probe="a(b)"]` fixture written as a `mustRefuse` row did
//     not refuse); this pin is that measurement, committed rather than left in a comment.

/** Materialize a `mode: "resource"` fixture to REAL disk (installed-package/vendor-css-surface bypass the
 *  authored `ResourceReader` and read the filesystem directly, per `ops/resource-installed.ts`'s and
 *  `ops/resource-vendor.ts`'s own headers) and build the AUTHORED overlay from everything else, mirroring
 *  `ops/policy-conformance.ts#runResourceExample` minus the git init this family's resources never need
 *  (`product-css`/`vendor-css-surface`/`json` read fixed paths directly, never a git-derived population). */
const NON_AUTHORED_SEGMENT_RE = /(?:^|\/)(?:node_modules|\.git|dist|\.cache)(?:\/|$)/u;

function passResource(policy: GatePolicy, root: string, files: Readonly<Record<string, string>>): PolicyPassResult {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(root, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content);
    if (path.endsWith(".ts") || path.endsWith(".tsx")) {
      project.addSourceFileAtPath(absolute);
    }
  }
  const overlay = Object.fromEntries(Object.entries(files).filter(([path]) => !NON_AUTHORED_SEGMENT_RE.test(path)));
  return runPolicyPass({ knownPolicies: [policy], policies: [policy], root, project, resourceOptions: { overlay }, reviewedGrants: [], failOnWarnings: false });
}

/** The shape a designed refusal shares (`baseui-and-surface-family.suite.repo.int.test.ts:206-213`'s house
 *  idiom): a single object so a refusal that drifted on ONE axis — a finding leaking through, an owner
 *  completing anyway — fails with the whole picture in the diff. */
function refusalShape(result: PolicyPassResult): Record<string, unknown> {
  return {
    phases: result.toolErrors.map((error) => error.phase),
    messages: result.toolErrors.map((error) => error.message),
    ownerStatuses: result.policies.map((owner) => owner.owner.status),
    findings: result.authority.effectiveFindings.length,
  };
}

test("a committed Base UI manifest that is valid JSON but fails the surface schema REFUSES at evaluate, never a finding and never a clean zero", ({
  scratch,
}) => {
  const result = passResource(selectorWriter, scratch, { ...SELECTOR_FIXTURE, [BASE_UI_MANIFEST_PATH]: '{ "components": {} }\n' });

  expect(refusalShape(result)).toMatchObject({
    phases: ["evaluate"],
    messages: ["the committed Base UI surface manifest is unreadable: the manifest has no string `version`"],
    ownerStatuses: ["incomplete"],
    findings: 0,
  });
  expect(result.factErrors).toEqual([]);
  // The authority layer restates the SAME evaluate-phase refusal as an `owner-incomplete` tool error rather
  // than a second, unrelated one — this is the pass's own accounting of the refusal above, not a fresh kind.
  expect(result.authority.toolErrors).toMatchObject([{ kind: "owner-incomplete", policyId: selectorWriter.id }]);
});

test("the healthy twin — the same fixture with a schema-valid empty manifest — judges cleanly, no refusal", ({ scratch }) => {
  const result = passResource(selectorWriter, scratch, { ...SELECTOR_FIXTURE, [BASE_UI_MANIFEST_PATH]: EMPTY_BASE_UI_MANIFEST });

  expect(result.toolErrors).toEqual([]);
  expect(result.policies.map((owner) => owner.owner.status)).toEqual(["success"]);
  expect(result.authority.effectiveFindings).toEqual([]);
});

test("INVARIANT: the installed-package door never answers a mode it was not asked for, so vendorCensus's mode-mismatch throw is unreachable through it", () => {
  const value = loadInstalledPackage(ROOT, { id: "base-ui", mode: "ast" });

  expect(value.status).toBe("ready");
  expect(value.status === "ready" ? value.value.mode : undefined).toBe("ast");
});

test("INVARIANT: every declaration path the ast door returns for base-ui carries the package anchor, so vendorCensus's anchorless-surface throw is unreachable through it", () => {
  const value = loadInstalledPackage(ROOT, { id: "base-ui", mode: "ast" });
  const declarationPaths = value.status === "ready" && value.value.mode === "ast" ? value.value.declarationPaths : [];

  expect(declarationPaths.length).toBeGreaterThan(0);
  expect(installedPackageRootOf(declarationPaths)).toBeDefined();
});

test("INVARIANT: every authored selector-hook slice yields a defined waivable coordinate, so hookCoordinate's refusal — selectorCoordinate's twin — is unreachable for real hook text", () => {
  // The exact case `css-selector-has-a-writer.ts`'s header records as MEASURED-but-unpinned: a hook carrying
  // a parenthesis still yields its leading paren-free run, because that run always starts with the `.` or
  // `[` every authored class/attribute slice opens with.
  for (const authored of ['[data-probe="a(b)"]', ".a(b)", "[data-x]", ".shell-wrapper", '[data-mode="a()b"]']) {
    expect(waivableCoordinate(authored)).toBeDefined();
  }
});

// LEG 2 (review 21bf17a9f, warm leg): the invariant above only proved `waivableCoordinate` never returns
// `undefined` for HAND-AUTHORED literals — it never drove the PRODUCER (`selectorClassHooks`/
// `selectorDataAttributes` here, folded through `css-resource-facts.ts#hookFacts` into the `authored` field
// `selectorHookIdentities` reads). A regressed producer emitting an empty or paren-leading slice would reach
// `hookCoordinate`'s throw at `css-selector-has-a-writer.ts:93` while that pin stayed green. This test drives
// the REAL production path instead: `selectorWriter` end to end through `passResource`, over a fixture
// carrying every parenthesis shape the corpus can hold (class hooks wrapped in `:is()`/`:where()`/`:not()`,
// an attribute VALUE carrying parens, and a bracket sitting at column 0 of its own selector) plus an unwaived
// baseline so every one of these unwritten hooks actually reaches `ctx.report.file` → `hookCoordinate`.
const PAREN_CASES_CSS =
  ":is(.shell-wrapper, .other-wrapper) { display: grid; }\n" +
  ":where(.tier-wrapper) { color: red; }\n" +
  ":not(.excluded-wrapper) { color: blue; }\n" +
  '[data-slot="dialog(popup)"] { color: green; }\n' +
  '[data-mode="a(b)c"] { color: red; }\n' +
  "[data-x] { color: red; }\n";

test("PRODUCTION PATH: every REAL derived selector-hook slice — parenthesis-wrapped classes, an attribute value carrying parens, a bracket at column 0 — reaches a coordinate with no evaluate-phase throw", ({
  scratch,
}) => {
  const result = passResource(selectorWriter, scratch, { ...SELECTOR_FIXTURE, "packages/client/src/styles/globals.css": PAREN_CASES_CSS });

  expect(result.toolErrors).toEqual([]);
  expect(result.policies.map((owner) => owner.owner.status)).toEqual(["success"]);
  // Every hook above is unwritten (SELECTOR_FIXTURE's source anchor is inert), so each one reports — proving
  // `hookCoordinate` ran to completion for every REAL derived slice rather than the whole evaluate silently
  // stopping partway through on an upstream throw.
  const tokens = result.authority.effectiveFindings.map((finding) => finding.token);
  expect(tokens).toEqual(
    expect.arrayContaining([".shell-wrapper", ".other-wrapper", ".tier-wrapper", ".excluded-wrapper", '[data-slot="dialog', '[data-mode="a', "[data-x]"]),
  );
});

// LEG 3 (#2318, warm leg): `css-selector-has-a-writer` is a SIXTH `json:baseui-manifest` consumer with no
// §4.5 refusal pin — reachable, and outside #2297's fence (that fix pinned the four-consumer derives loop
// plus `baseui-state-data-attributes`; this policy's own declaration was never touched). `json` is a
// POPULATED resource kind, so a non-ready `json:baseui-manifest` withholds the OWNER at the POPULATION
// phase, before `evaluate` ever runs — the same shape `baseui-and-surface-family.suite.repo.int.test.ts:256-294`
// pins for the other five consumers. `docs/law/resource-policy-contract.md` §3.6: one pin per declared resource per
// REACHABLE non-ready status. `ops/resource-json.ts`'s header states the closed set: `missing | empty |
// unresolved` (the third being an unparseable-but-present file) — never a fourth.
//
// RED-FIRST: `grep 'baseui-manifest' tests/tooling/verify/gates/css-hook-provenance-family.suite.test.ts` before
// this block returns exactly one hit — LEG 1's own comment about the SEMANTICALLY-invalid-but-parseable-JSON
// case (a different defect, already pinned above) — never a missing/empty/unresolved assertion. Nothing here
// today plants an empty manifest and checks that `css-selector-has-a-writer`'s owner goes incomplete.
const WITHOUT_MANIFEST = { ...CLEAN_PRODUCT_CSS, ...INERT_SOURCE, ...VENDOR_SURFACE_FIXTURE };

test("json:baseui-manifest MISSING withholds css-selector-has-a-writer's owner at population — never a finding, never a clean pass", ({ scratch }) => {
  const result = passResource(selectorWriter, scratch, WITHOUT_MANIFEST);

  expect(refusalShape(result)).toMatchObject({ phases: ["population"], ownerStatuses: ["incomplete"], findings: 0 });
  expect(result.toolErrors[0]?.message).toContain("resource declaration json:baseui-manifest is missing");
  expect(result.authority.withheldPolicyIds).toContain(selectorWriter.id);
});

test("json:baseui-manifest EMPTY withholds css-selector-has-a-writer's owner at population — the third status, and it is not 'missing'", ({ scratch }) => {
  const result = passResource(selectorWriter, scratch, { ...SELECTOR_FIXTURE, [BASE_UI_MANIFEST_PATH]: "" });

  expect(refusalShape(result)).toMatchObject({ phases: ["population"], ownerStatuses: ["incomplete"], findings: 0 });
  expect(result.toolErrors[0]?.message).toContain("resource declaration json:baseui-manifest is empty");
  expect(result.authority.withheldPolicyIds).toContain(selectorWriter.id);
});

test("json:baseui-manifest UNPARSEABLE withholds css-selector-has-a-writer's owner at population — missing and malformed stay separate facts", ({
  scratch,
}) => {
  const result = passResource(selectorWriter, scratch, { ...SELECTOR_FIXTURE, [BASE_UI_MANIFEST_PATH]: "{ not json\n" });

  expect(refusalShape(result)).toMatchObject({ phases: ["population"], ownerStatuses: ["incomplete"], findings: 0 });
  expect(result.toolErrors[0]?.message).toContain("resource declaration json:baseui-manifest is unresolved");
  expect(result.toolErrors[0]?.message).toContain("did not parse as strict JSON");
  expect(result.authority.withheldPolicyIds).toContain(selectorWriter.id);
});

test("the healthy twin — the same substrate with a schema-valid manifest present — judges cleanly, no refusal, normal findings", ({ scratch }) => {
  const result = passResource(selectorWriter, scratch, { ...SELECTOR_FIXTURE, [BASE_UI_MANIFEST_PATH]: EMPTY_BASE_UI_MANIFEST });

  expect(result.toolErrors).toEqual([]);
  expect(result.policies.map((owner) => owner.owner.status)).toEqual(["success"]);
  expect(result.authority.withheldPolicyIds).toEqual([]);
  // SELECTOR_FIXTURE's baseline sheets are inert (no unwritten hooks), so the healthy twin reports nothing —
  // the exact "normal findings" shape for THIS substrate is zero, matching the other healthy-twin pin above.
  expect(result.authority.effectiveFindings).toEqual([]);
});
