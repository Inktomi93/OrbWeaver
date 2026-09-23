// Real-corpus liveness arms (#2149) for the leftover policies whose declared population is `@tooling` or
// `@tests` with its own narrowing (0042's eighth chunk). DATA, collected by the one runner
// (`../real-corpus-liveness-family.suite.repo.int.test.ts`), which loads the structure run's own corpus once
// and runs every arm against it (docs/work/0043).
//
// EACH ARM IS ITS POLICY'S OWN `mustFlag` ROW, TRANSPLANTED ONTO THE REAL TREE. The gate-authoring policies judge
// modules in `tooling/src/verify/gates/`, so their probes ARE gate modules there, against the real
// `contract/policy.ts` and `contract/gate.ts`; each is in memory only and carries a `liveness-` id. Several of
// these policies read every gate module or every test, so they also report a batch-mate's probe; the runner's
// entanglement check proves those arms alone.
//
// `no-manual-memo-compiler-health` HAS NO ARM: its subject is the INSTALLED React Compiler under
// `packages/client/node_modules/`, and the ResourceHost's overlay refuses to mutate a non-authored tree (the
// production reader's own rule), so no overlay can take the denylist away. Its liveness needs an installed-package
// overlay the runner does not have (docs/work/0145).
import { gate as auditClientTests } from "../../../../../tooling/src/verify/gates/audit-client-tests.ts";
import { gate as ctNoOneshotLiveReadAssert } from "../../../../../tooling/src/verify/gates/ct-no-oneshot-live-read-assert.ts";
import { gate as ctPollScheduleAndPaint } from "../../../../../tooling/src/verify/gates/ct-poll-schedule-and-paint.ts";
import { gate as ctStorySingleImport } from "../../../../../tooling/src/verify/gates/ct-story-single-import.ts";
import { gate as diagnosticLegibility } from "../../../../../tooling/src/verify/gates/diagnostic-legibility.ts";
import { gate as gateModernization } from "../../../../../tooling/src/verify/gates/gate-modernization.ts";
import { gate as noDirectReportsWrite } from "../../../../../tooling/src/verify/gates/no-direct-reports-write.ts";
import { gate as noOpaqueTestFixture } from "../../../../../tooling/src/verify/gates/no-opaque-test-fixture.ts";
import { gate as policyBindingResolution } from "../../../../../tooling/src/verify/gates/policy-binding-resolution.ts";
import { gate as policyFamilyReaders } from "../../../../../tooling/src/verify/gates/policy-family-readers.ts";
import { gate as policyFixtureSubstrate } from "../../../../../tooling/src/verify/gates/policy-fixture-substrate.ts";
import { gate as policyLegacyImports } from "../../../../../tooling/src/verify/gates/policy-legacy-imports.ts";
import { gate as policyProofExpectations } from "../../../../../tooling/src/verify/gates/policy-proof-expectations.ts";
import { gate as policySoundness } from "../../../../../tooling/src/verify/gates/policy-soundness.ts";
import { gate as policyWaiverSpelling } from "../../../../../tooling/src/verify/gates/policy-waiver-spelling.ts";
import { gate as routeTrpcLifoOrder } from "../../../../../tooling/src/verify/gates/route-trpc-lifo-order.ts";
import { gate as routeTrpcNoBroadSpread } from "../../../../../tooling/src/verify/gates/route-trpc-no-broad-spread.ts";
import { gate as testDeterminism } from "../../../../../tooling/src/verify/gates/test-determinism.ts";
import { gate as testNoStubs } from "../../../../../tooling/src/verify/gates/test-no-stubs.ts";
import { gate as testWorldBrowserContracts } from "../../../../../tooling/src/verify/gates/test-world-browser-contracts.ts";
import { gate as toolingCliEntry } from "../../../../../tooling/src/verify/gates/tooling-cli-entry.ts";
import { gate as toolingOpsDirectInvocation } from "../../../../../tooling/src/verify/gates/tooling-ops-direct-invocation.ts";
import { gate as toolingSize } from "../../../../../tooling/src/verify/gates/tooling-size.ts";
import type { RealCorpusLivenessArm, RealCorpusOverlay } from "../../../../support/real-corpus-liveness.ts";

const GATES = "tooling/src/verify/gates";
const OVER_CAP = Array.from({ length: 460 }, (_, index) => `export const line${String(index)} = ${String(index)};`).join("\n");

function add(path: string, source: string): RealCorpusOverlay {
  return { kind: "add", path, source };
}

interface ProbeGate {
  readonly id: string;
  readonly head?: string;
  readonly family?: string;
  readonly authority?: string;
  readonly population?: string;
  readonly create?: string;
  readonly mustFlag?: string;
  readonly tail?: string;
}

const STANDARD_MUST_FLAG = '[{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }]';

/** A final-policy module under the gate corpus, shaped like the gate-authoring rows' `probe.ts`. */
export function probeGate({
  id,
  head = "",
  family = id,
  authority = "hard",
  population = '"@client"',
  create = "() => ({ evaluate: () => undefined })",
  mustFlag = STANDARD_MUST_FLAG,
  tail = "",
}: ProbeGate): RealCorpusOverlay {
  return add(
    `${GATES}/${id}.ts`,
    `${head}import { defineGate } from "../contract/policy.ts";\n` +
      "export const gate = defineGate({\n" +
      `  id: "${id}",\n  family: "${family}",\n  authority: "${authority}",\n  severity: "error",\n  population: ${population},\n` +
      '  analysis: "syntax",\n  execution: "selected-files",\n  facts: [],\n  resources: [],\n' +
      '  mustPass: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, why: "w" }],\n' +
      `  message: "m",\n  create: ${create},\n` +
      `  mustFlag: ${mustFlag},\n` +
      `${tail}});\n`,
  );
}

export const TOOLING_TESTS_ARMS: readonly RealCorpusLivenessArm[] = [
  {
    policy: auditClientTests,
    overlays: [add("tests/tooling/liveness-audit.test.ts", 'test("does nothing", () => {\n  const x = 1;\n  void x;\n});\n')],
    messageIncludes: "no `expect(...).<matcher>()`",
  },
  {
    policy: ctNoOneshotLiveReadAssert,
    overlays: [
      add(
        "tests/client/data/liveness-oneshot.ct.tsx",
        'import { expect, test } from "@playwright/experimental-ct-react";\ntest("x", () => {\n  expect(trpc.count("tag.createTag")).toBe(2);\n});\n',
      ),
    ],
    messageIncludes: "non-retrying `expect()`",
  },
  {
    policy: ctPollScheduleAndPaint,
    overlays: [
      add(
        "tests/client/features/chat/components/liveness-shared-array.ct.tsx",
        'import { expect, test } from "@playwright/experimental-ct-react";\nconst SCHEDULE = [50, 100, 250];\ntest("g", async () => {\n  await expect.poll(() => 1, { intervals: SCHEDULE, timeout: 10_000 }).toBe(1);\n});\n',
      ),
    ],
    messageIncludes: "Playwright poll idiom",
  },
  {
    policy: ctStorySingleImport,
    overlays: [
      add(
        "tests/ui/charts/liveness-double.ct.tsx",
        'import { StoryA } from "./_ct-stories.tsx";\nimport { StoryA as StoryA } from "./_ct-stories.tsx";\nStoryA;\n',
      ),
    ],
    messageIncludes: "TWICE",
  },
  {
    policy: diagnosticLegibility,
    overlays: [add(`${GATES}/liveness-legibility.ts`, 'export const gate = { message: "a bare diagnostic with no home" };\n')],
    messageIncludes: "carries no pointer",
  },
  {
    policy: gateModernization,
    overlays: [add(`${GATES}/liveness-not-a-gate.ts`, "export const notAGate = 1;\n")],
    messageIncludes: "exports no `gate` descriptor",
  },
  {
    policy: noDirectReportsWrite,
    overlays: [
      add(
        "tests/ui/liveness-plain.ct.tsx",
        'export async function livenessShot(page: { screenshot: (o: unknown) => Promise<unknown> }): Promise<void> {\n  await page.screenshot({ path: "reports/snaps/liveness.png" });\n}\n',
      ),
    ],
    messageIncludes: "reports/",
  },
  {
    policy: noOpaqueTestFixture,
    overlays: [add("tests/client/features/rpg/liveness.fixtures.ts", 'export function makeLivenessGame(): unknown {\n  return { ruleset: "d20" };\n}\n')],
    messageIncludes: "typed `unknown`",
  },
  {
    policy: policyBindingResolution,
    // On the real ts-morph `getDefinitionNodes` lives on the reference-findable nodes (an `Identifier`), not on
    // the base `Node` the row's stub declares it on, so the probe walks an `Identifier` as a real gate would.
    overlays: [
      probeGate({
        id: "liveness-binding",
        head: 'import type { Identifier } from "ts-morph";\nexport const probe = (node: Identifier): unknown => node.getDefinitionNodes();\n',
      }),
    ],
    messageIncludes: "Member: `getDefinitionNodes`.",
  },
  {
    policy: policyFamilyReaders,
    // A member joining a REAL shared-reader family (`ui-pointer-capability-tier`) whose create consumes no
    // shared production dependency at all.
    overlays: [probeGate({ id: "liveness-family", family: "ui-pointer-capability-tier" })],
    messageIncludes: "resolves no shared canonical production dependency",
  },
  {
    policy: policyFixtureSubstrate,
    overlays: [
      add(
        "tests/tooling/verify/gates/liveness-probe.test.ts",
        'import { writeFileSync } from "node:fs";\nimport { join } from "node:path";\nimport { test } from "../../../support/tool-fixtures.ts";\nwriteFileSync(join(process.cwd(), "tooling/src/verify/gates/x.ts"), "planted");\nexport const livenessTest = test;\n',
      ),
    ],
    messageIncludes: "CHECKOUT",
  },
  {
    policy: policyLegacyImports,
    overlays: [
      add(
        "tooling/src/verify/lib/liveness-finite-boxes.ts",
        'import type { ExemptionRow } from "../contract/gate.ts";\ntype Box<T> = { value: T };\nexport const LIVENESS_VALUE: Box<Box<ExemptionRow>> = { value: { value: { why: "w" } } };\n',
      ),
      probeGate({ id: "liveness-legacy", head: 'import { LIVENESS_VALUE } from "../lib/liveness-finite-boxes.ts";\nexport const held = LIVENESS_VALUE;\n' }),
    ],
    messageIncludes: "contained canonical identity: ExemptionRow",
  },
  {
    policy: policyProofExpectations,
    // A mustFlag row whose `messageIncludes` is a getter — not statically readable.
    overlays: [
      probeGate({
        id: "liveness-proof",
        create:
          '(ctx) => ({ visitors: [{ kinds: [1], visit: (node) => { ctx.report.node(node, { message: "arm A: the entry is not registered." }); ctx.report.node(node, { message: "arm B: the target does not exist." }); } }] })',
        mustFlag: '[{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1, get messageIncludes() { return "not"; } }, why: "w" }]',
      }),
    ],
    messageIncludes: "not statically readable",
  },
  {
    policy: policySoundness,
    overlays: [probeGate({ id: "liveness-soundness", population: '{ in: ["@client"], ext: ["ts", "tsx"] }' })],
    messageIncludes: "INERT",
  },
  {
    policy: policyWaiverSpelling,
    overlays: [
      probeGate({
        id: "liveness-waiver",
        authority: "ordinary",
        create: "(ctx) => ({ visitors: [{ kinds: [1], visit: (node) => ctx.report.node(node) }] })",
        tail: '  fix: "move it.",\n',
      }),
    ],
    messageIncludes: "does not name its own waiver spelling",
  },
  {
    policy: routeTrpcLifoOrder,
    overlays: [
      add(
        "tests/client/features/chat/liveness-lifo.ct.tsx",
        'import { test } from "@playwright/experimental-ct-react";\nimport { routeTrpc } from "../../../support/node/route-trpc.ts";\ntest("g", async ({ page }) => {\n  await page.route("**/api/trpc/**", () => new Promise(() => undefined));\n  await routeTrpc(page, {});\n});\n',
      ),
    ],
    messageIncludes: "BEFORE `routeTrpc",
  },
  {
    policy: routeTrpcNoBroadSpread,
    overlays: [
      add(
        "tests/client/a11y/liveness-mixed-record.ct.tsx",
        'import { routeTrpc } from "../../support/node/route-trpc.ts";\ndeclare const page: unknown;\ndeclare const broad: Readonly<Record<string, unknown>>;\nvoid routeTrpc(page, { health: { ok: true }, ...broad });\n',
      ),
    ],
    messageIncludes: "spreads a string-indexed route map",
  },
  {
    policy: testDeterminism,
    // @orb-waive test-determinism(Date.now): the overlay source proves testDeterminism itself, not this test's subject; ends when that arm retires.
    overlays: [add("tests/server/liveness-clock.test.ts", "export const livenessNow = Date.now();\n")],
    messageIncludes: "Date.now",
  },
  {
    policy: testNoStubs,
    overlays: [add("tests/tooling/liveness-stub.test.ts", 'test("does nothing", () => {\n  const x = 1;\n});\n')],
    messageIncludes: "stub test contains no assertions",
  },
  {
    policy: testWorldBrowserContracts,
    overlays: [add("tests/ui/liveness-input.test-d.ts", 'import type { ButtonProps } from "@orb/ui/button";\nexport type LivenessSubject = ButtonProps;\n')],
    messageIncludes: "browser-only contract",
  },
  {
    policy: toolingCliEntry,
    overlays: [add("tooling/src/livenessbadcli/cli.ts", "export const livenessCli = 1;\n")],
    messageIncludes: "must enter through runTool",
  },
  {
    policy: toolingOpsDirectInvocation,
    overlays: [add("tooling/src/snap/ops/liveness-ops.ts", "export const livenessOps = 1;\n")],
    messageIncludes: "LIBRARY module with no module-scope `refuseDirectInvocation",
  },
  {
    policy: toolingSize,
    overlays: [add("tooling/src/snap/ops/liveness-big.ts", OVER_CAP)],
    messageIncludes: "cap 450",
  },
];
