// Real-corpus liveness arms (#2149) for policies whose declared population spans several roots — the
// occurrence bans, the open-JSON and test-presence families, the tooling registries and their neighbours
// (0042's tenth chunk, second half). DATA, collected by the one runner
// (`./runner.ts`), which loads each isolated structure corpus once and
// runs every arm against it (docs/work/0043).
//
// EACH ARM IS ITS POLICY'S OWN `mustFlag` ROW, TRANSPLANTED ONTO THE REAL TREE. A defect that is a member of a
// real declaration (a code on a real tuple, a tool in the real registry) is planted with `edit`; a tripwire
// loses its real subject by `neutralise`/`remove`/`edit`; the gate-authoring policies get probe gate modules
// under `tooling/src/verify/gates/`, in memory only. Several of these policies read every file of a root, so
// they also report a batch-mate's plant; the runner's entanglement check proves those arms alone. A
// resource-analysis policy that lists the tree through the ResourceHost gets its new file in both views.
//
// NO ARM YET for one multi-root policy (0042 Evidence names it): `open-json-column-key-parity-deferred`,
// whose subject the real tree no longer has — `VariantMetadata` closed `messageVariants.metadata` and the stats
// rollup stopped json_extracting it, and reopening the column with an open writer and a raw reader in memory
// still left it silent.

import type { RealCorpusLivenessArm, RealCorpusOverlay } from "@orb/testkit/node/real-corpus-liveness.ts";
import { PRODUCT_STYLESHEETS } from "../../../../../tooling/src/verify/contract/css-family.ts";
import { gate as cssVarDefinedHealth } from "../../../../../tooling/src/verify/gates/css-var-defined-health.ts";
import { gate as noHandwrittenWireJsonSchema } from "../../../../../tooling/src/verify/gates/no-handwritten-wire-json-schema.ts";
import { gate as noInlinePackageInterface } from "../../../../../tooling/src/verify/gates/no-inline-package-interface.ts";
import { gate as noInlineTypes } from "../../../../../tooling/src/verify/gates/no-inline-types.ts";
import { gate as noManualMemo } from "../../../../../tooling/src/verify/gates/no-manual-memo.ts";
import { gate as noManualTokenEstimate } from "../../../../../tooling/src/verify/gates/no-manual-token-estimate.ts";
import { gate as nullableColumnInequality } from "../../../../../tooling/src/verify/gates/nullable-column-inequality.ts";
import { gate as openJsonColumnKeyParity } from "../../../../../tooling/src/verify/gates/open-json-column-key-parity.ts";
import { gate as packageDeepImport } from "../../../../../tooling/src/verify/gates/package-deep-import.ts";
import { gate as packageLayout } from "../../../../../tooling/src/verify/gates/package-layout.ts";
import { gate as packageSubpathCrossing } from "../../../../../tooling/src/verify/gates/package-subpath-crossing.ts";
import { gate as playwrightCssTopology } from "../../../../../tooling/src/verify/gates/playwright-css-topology.ts";
import { gate as policyRefusalCoverage } from "../../../../../tooling/src/verify/gates/policy-refusal-coverage.ts";
import { gate as policyWaiverIdentity } from "../../../../../tooling/src/verify/gates/policy-waiver-identity.ts";
import { gate as realCorpusLivenessManifest } from "../../../../../tooling/src/verify/gates/real-corpus-liveness-manifest.ts";
import { gate as scrubberFactoryHome } from "../../../../../tooling/src/verify/gates/scrubber-factory-home.ts";
import { gate as staleDraftDecisionHealth } from "../../../../../tooling/src/verify/gates/stale-draft-decision-health.ts";
import { gate as structuredPlanOneHome } from "../../../../../tooling/src/verify/gates/structured-plan-one-home.ts";

import { gate as testPresenceClient } from "../../../../../tooling/src/verify/gates/test-presence-client.ts";
import { gate as testReach } from "../../../../../tooling/src/verify/gates/test-reach.ts";
import { gate as testidLiveness } from "../../../../../tooling/src/verify/gates/testid-liveness.ts";
import { gate as toolingClockBudget } from "../../../../../tooling/src/verify/gates/tooling-clock-budget.ts";
import { gate as toolingInstrumentProof } from "../../../../../tooling/src/verify/gates/tooling-instrument-proof.ts";
import { gate as toolingPortRegistry } from "../../../../../tooling/src/verify/gates/tooling-port-registry.ts";
import { gate as uiPrimitivePermissions } from "../../../../../tooling/src/verify/gates/ui-primitive-permissions.ts";
import { gate as warningCodeCoverage } from "../../../../../tooling/src/verify/gates/warning-code-coverage.ts";
import { gate as wireSchemaVocabOneHome } from "../../../../../tooling/src/verify/gates/wire-schema-vocab-one-home.ts";
import { probeGate } from "./tooling-tests.ts";

const DOMAIN = "packages/server/src/domain/character";
const FEATURE = "packages/client/src/features/chat";
const PRIMITIVE = "packages/ui/src/primitives/livenessthing";
const STANDING_CONTRAST_CT = "tests/legacy/client/features/chat/surfaces/worst-legal-art-contrast.suite.ct.tsx";

function add(path: string, source: string): RealCorpusOverlay {
  return { kind: "add", path, source };
}

/** A new source file planted in BOTH views: the project, and the ResourceHost a resource-analysis policy lists
 *  the tree through. Planted in one view alone, the two denominators disagree and the policy refuses. */
function planted(path: string, source: string): readonly [RealCorpusOverlay, RealCorpusOverlay] {
  return [add(path, source), { kind: "resource", path, source }];
}

function edit(path: string, search: string, replacement: string): RealCorpusOverlay {
  return { kind: "edit", path, replace: [search, replacement] };
}

export const MULTI_ROOT_B_ARMS: readonly RealCorpusLivenessArm[] = [
  {
    policy: cssVarDefinedHealth,
    overlays: [
      { kind: "remove", path: "packages/client/src/" },
      { kind: "remove", path: "packages/ui/src/" },
      add("packages/client/src/liveness-css-health.tsx", "export const livenessCssHealth = true;\n"),
      ...PRODUCT_STYLESHEETS.map((path): RealCorpusOverlay => ({ kind: "resource", path, source: ".liveness { color: inherit; }\n" })),
    ],
    messageIncludes: "css-var-defined measured zero",
  },
  {
    policy: noHandwrittenWireJsonSchema,
    overlays: [add(`${DOMAIN}/verbs/liveness-rf.ts`, 'export const livenessFormat = { name: "x", schema: { type: "object", properties: {} } };\n')],
    messageIncludes: "hand-authored JSON-Schema literal",
  },
  {
    policy: noInlinePackageInterface,
    overlays: [add("packages/server/src/infra/liveness-shape.ts", "export interface LivenessShape {\n  readonly x: string;\n}\n")],
    messageIncludes: "exported interface in server entry, transport, infra, foundation or inference",
  },
  {
    policy: noInlineTypes,
    overlays: [add(`${DOMAIN}/verbs/liveness-verb.ts`, "export type LivenessInline = string;\n")],
    messageIncludes: "outside a type home",
  },
  {
    policy: noManualMemo,
    overlays: [add(`${FEATURE}/components/liveness-memo.tsx`, 'import * as React from "react";\nexport const livenessMemo = React.useMemo(() => 1, []);\n')],
    messageIncludes: "manual React memoization",
  },
  {
    policy: noManualTokenEstimate,
    overlays: [add(`${DOMAIN}/liveness-estimate.ts`, "export const livenessEstimate = (text: string): number => text.length / 4;\n")],
    messageIncludes: "hand-rolled `.length / 4` token estimate",
  },
  {
    policy: nullableColumnInequality,
    // `characters.avatarAssetId` is nullable on the real schema.
    overlays: [
      add(
        `${DOMAIN}/persistence/liveness-reads.ts`,
        'import { characters } from "@orb/db";\nimport { ne } from "drizzle-orm";\nexport const livenessPredicate = ne(characters.avatarAssetId, "a");\n',
      ),
    ],
    messageIncludes: "an inequality predicate",
  },
  {
    policy: openJsonColumnKeyParity,
    // A reader of a key no writer stores on the real open `auditLogs.metadata` bag.
    overlays: [
      add(
        "packages/server/src/domain/audit/persistence/liveness-read.ts",
        "import { sql } from \"drizzle-orm\";\nexport async function livenessRead(db: D) {\n  return db.all(sql`SELECT id FROM audit_logs a WHERE json_extract(a.metadata, '$.livenessKey') IS NOT NULL`);\n}\n",
      ),
    ],
    messageIncludes: "Subject: auditLogs.metadata",
  },
  {
    policy: packageLayout,
    overlays: planted("packages/inference/src/liveness-loose.ts", "export const livenessLoose = 1;\n"),
    messageIncludes: "a loose `.ts` file",
  },
  {
    policy: playwrightCssTopology,
    overlays: [
      { kind: "resource", path: "playwright/index.tsx", replace: ['import "@orb/client/styles";', 'import "../packages/client/src/styles/globals.css";'] },
    ],
    messageIncludes: "CT must import",
  },
  {
    policy: policyRefusalCoverage,
    overlays: [
      add(
        "tooling/src/verify/gates/liveness-refusal.ts",
        'import { defineGate } from "../contract/policy.ts";\nexport const gate = defineGate({\n  id: "liveness-refusal",\n  family: "liveness-refusal",\n  authority: "hard",\n  severity: "error",\n  population: "@client",\n  analysis: "resource",\n  execution: "entire-population",\n  facts: [],\n  resources: [{ kind: "tracked-files" }],\n  message: "m",\n  fix: "f",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "resource", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],\n  mustPass: [{ mode: "resource", files: { "packages/client/src/b.ts": "y" }, why: "w" }],\n});\n',
      ),
    ],
    messageIncludes: "pins NO REFUSAL",
  },
  {
    policy: policyWaiverIdentity,
    overlays: [probeGate({ id: "liveness-no-waiver-arm", authority: "ordinary" })],
    messageIncludes: "no positive §6.2 identity arm",
  },
  {
    policy: realCorpusLivenessManifest,
    overlays: [probeGate({ id: "liveness-unpinned" })],
    messageIncludes: "no real-corpus liveness pin",
  },
  {
    policy: scrubberFactoryHome,
    // The content home keeps its helpers and loses the stateful factory's name.
    overlays: [edit("packages/kit/src/content/index.ts", "export function createHiddenSpanStreamScrubber(", "export function createLivenessRenamedScrubber(")],
    messageIncludes: "createHiddenSpanStreamScrubber",
  },
  {
    policy: staleDraftDecisionHealth,
    overlays: [{ kind: "remove", path: "packages/client/src/lib/edit-session.ts" }],
    messageIncludes: "edit-session",
  },
  {
    policy: structuredPlanOneHome,
    overlays: [add(`${DOMAIN}/liveness-structured.ts`, 'export const livenessRequest = { tools: [], toolChoice: { mode: "required" } };\n')],
    messageIncludes: "a structured-output or tool-call spelling outside the structured planner",
  },

  {
    policy: testPresenceClient,
    // The standing contrast CT leaves both views; the absence is reported at the room it covers.
    overlays: [
      { kind: "remove", path: STANDING_CONTRAST_CT },
      { kind: "resource", path: STANDING_CONTRAST_CT, delete: true },
    ],
    reportsAt: ["packages/client/src/features/chat/surfaces/chat-room-surface.tsx"],
    messageIncludes: "standing DOM-derived worst-legal-art contrast CT",
  },
  {
    policy: testReach,
    overlays: [add(`${DOMAIN}/persistence/liveness-record.ts`, "export const livenessRecord = () => 1;\n")],
    messageIncludes: "persistence module is reached by no integration test",
  },
  {
    policy: testidLiveness,
    overlays: [
      add(
        "tests/client/features/character/components/liveness-testid.ct.tsx",
        'test("liveness", async () => {\n  await expect(component.getByTestId("liveness-ghost")).toHaveText("x");\n});\n',
      ),
    ],
    messageIncludes: "A1: nothing on the tree mints",
  },
  {
    policy: toolingClockBudget,
    overlays: [add("tooling/src/ui-audit/ops/liveness-walk.ts", "export const livenessOpts = { timeout: 30_000 };\n")],
    messageIncludes: "Clock: `timeout: 30_000`",
  },
  {
    policy: toolingInstrumentProof,
    // A registry row naming a tool with no directory.
    overlays: [edit("tooling/src/floor/instrument/instruments.ts", "INSTRUMENT_TOOLS = [\n", 'INSTRUMENT_TOOLS = [\n  "livenessghost",\n')],
    messageIncludes: "is not a live directory",
  },
  {
    policy: toolingPortRegistry,
    overlays: [add("tooling/src/stack/ops/liveness-port.ts", "export const livenessPort = 8788;\n")],
    messageIncludes: "Subject: tooling/src/stack/ops/liveness-port.ts, operation: port-literal",
  },
  {
    policy: uiPrimitivePermissions,
    overlays: [
      ...planted(`${PRIMITIVE}/livenessthing.tsx`, 'export const LivenessThing = () => <div data-slot="livenessthing" />;\n'),
      ...planted(`${PRIMITIVE}/index.ts`, 'export { LivenessThing } from "./livenessthing";\n'),
      ...planted("tests/ui/primitives/livenessthing/livenessthing.ct.tsx", "export const proof = true;\n"),
    ],
    reportsAt: [PRIMITIVE],
    messageIncludes: "missing variants.ts",
  },
  {
    policy: warningCodeCoverage,
    overlays: [
      edit(
        "packages/contracts/src/chat/bus.ts",
        "export const PLAIN_CHAT_WARNING_CODES = [\n",
        'export const PLAIN_CHAT_WARNING_CODES = [\n  "liveness_never_emitted",\n',
      ),
    ],
    messageIncludes: 'Member: "liveness_never_emitted"',
  },
  {
    policy: packageDeepImport,
    // A probe two levels below the chat feature root climbing back to its front door: the same-module arm.
    overlays: [add("packages/server/src/domain/chat/liveness/deep/probe.ts", 'export { chatLiveness } from "../../index.ts";\n')],
    messageIncludes: "Use #src/domain/chat/index.ts.",
  },
  {
    policy: packageSubpathCrossing,
    // An ungranted importer reaching a tag verb through the file subpath instead of the `#domain/tag` door.
    overlays: [add("packages/server/src/domain/chat/liveness-crossing.ts", 'export * from "#src/domain/tag/verbs/attach.ts";\n')],
    messageIncludes: "Use #domain/tag.",
  },
  {
    policy: wireSchemaVocabOneHome,
    overlays: [add("packages/inference/src/backends/livenessvendor/schema.ts", 'export const DROP = ["minLength", "maxLength", "$schema"];\n')],
    messageIncludes: "spelled outside the one scrub engine",
  },
];
