// Real-corpus liveness arms (#2149) for the leftover policies whose declared population is `@tooling` or
// `@tests` with its own narrowing (0042's eighth chunk). DATA, collected by the one runner
// (`./runner.ts`), which loads each isolated structure corpus once
// and runs every arm against it (docs/work/0043).
//
// EACH ARM IS ITS POLICY'S OWN `mustFlag` ROW, TRANSPLANTED ONTO THE REAL TREE. The gate-authoring policies judge
// modules in `tooling/src/verify/gates/`, so their probes ARE gate modules there, against the real
// `contract/policy.ts` and `contract/gate.ts`; each is in memory only and carries a `liveness-` id. Several of
// these policies read every gate module or every test, so they also report a batch-mate's probe; the runner's
// entanglement check proves those arms alone.
//

import type { RealCorpusLivenessArm, RealCorpusOverlay } from "@orb/testkit/node/real-corpus-liveness.ts";
import { gate as auditClientTests } from "../../../../../tooling/src/verify/gates/audit-client-tests.ts";
import { gate as ctNoOneshotLiveReadAssert } from "../../../../../tooling/src/verify/gates/ct-no-oneshot-live-read-assert.ts";
import { gate as ctPollScheduleAndPaint } from "../../../../../tooling/src/verify/gates/ct-poll-schedule-and-paint.ts";
import { gate as diagnosticLegibility } from "../../../../../tooling/src/verify/gates/diagnostic-legibility.ts";
import { gate as noDirectReportsWrite } from "../../../../../tooling/src/verify/gates/no-direct-reports-write.ts";
import { gate as noOpaqueTestFixture } from "../../../../../tooling/src/verify/gates/no-opaque-test-fixture.ts";
import { gate as policyLegacyImports } from "../../../../../tooling/src/verify/gates/policy-legacy-imports.ts";
import { gate as policyProofExpectations } from "../../../../../tooling/src/verify/gates/policy-proof-expectations.ts";
import { gate as policySoundness } from "../../../../../tooling/src/verify/gates/policy-soundness.ts";
import { gate as routeTrpcNoBroadSpread } from "../../../../../tooling/src/verify/gates/route-trpc-no-broad-spread.ts";
import { gate as testDeterminism } from "../../../../../tooling/src/verify/gates/test-determinism.ts";
import { gate as testWorldBrowserContracts } from "../../../../../tooling/src/verify/gates/test-world-browser-contracts.ts";

const GATES = "tooling/src/verify/gates";
/** Assembled so this arm file never spells the banned call literally — only the planted overlay's own
 *  source (the testDeterminism fixture below) does. */
const CLOCK_CALL = ["Date", ".now()"].join("");

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
        "tests/client/features/chat/components/liveness-unbarriered.ct.tsx",
        'import { expect, test } from "@playwright/experimental-ct-react";\ntest("g", async ({ page }) => {\n  const button = page.getByRole("button");\n  await button.evaluate((el) => (el as HTMLButtonElement).click());\n  await expect.poll(async () => (await read(page)).observedCls, { intervals: [50], timeout: 10_000 }).toBeGreaterThan(0);\n});\n',
      ),
    ],
    messageIncludes: "Playwright poll idiom",
  },
  {
    policy: diagnosticLegibility,
    overlays: [add(`${GATES}/liveness-legibility.ts`, 'export const gate = { message: "a bare diagnostic with no home" };\n')],
    messageIncludes: "carries no pointer",
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
    overlays: [add("tests/server/liveness-clock.test.ts", `export const livenessNow = ${CLOCK_CALL};\n`)],
    messageIncludes: "Date.now",
  },
  {
    policy: testWorldBrowserContracts,
    overlays: [add("tests/ui/liveness-input.test-d.ts", 'import type { ButtonProps } from "@orb/ui/button";\nexport type LivenessSubject = ButtonProps;\n')],
    messageIncludes: "browser-only contract",
  },
];
