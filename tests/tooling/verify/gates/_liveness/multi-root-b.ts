// Real-corpus liveness arms (#2149) for policies whose declared population spans several roots — the
// occurrence bans, the open-JSON and test-presence families, the tooling registries and their neighbours
// (0042's tenth chunk, second half). DATA, collected by the one runner
// (`../real-corpus-liveness-family.suite.repo.int.test.ts`), which loads the structure run's own corpus once and
// runs every arm against it (docs/work/0043).
//
// EACH ARM IS ITS POLICY'S OWN `mustFlag` ROW, TRANSPLANTED ONTO THE REAL TREE. A defect that is a member of a
// real declaration (a code on a real tuple, a tool in the real registry) is planted with `edit`; a tripwire
// loses its real subject by `neutralise`/`remove`/`edit`; the gate-authoring policies get probe gate modules
// under `tooling/src/verify/gates/`, in memory only. Several of these policies read every file of a root, so
// they also report a batch-mate's plant; the runner's entanglement check proves those arms alone. A
// resource-analysis policy that lists the tree through the ResourceHost gets its new file in both views.
//
// NO ARM YET for three multi-root policies (0042 Evidence names them): `open-json-column-key-parity-deferred`,
// whose subject the real tree no longer has — `VariantMetadata` closed `messageVariants.metadata` and the stats
// rollup stopped json_extracting it, and reopening the column with an open writer and a raw reader in memory
// still left it silent; `open-json-column-key-parity-health` and `css-var-defined-health`, whose blindness
// counts span every JSON column or every product stylesheet and class root, so no bounded overlay empties them.
import { gate as noCallerUserId } from "../../../../../tooling/src/verify/gates/no-caller-user-id.ts";
import { gate as noDefaultProps } from "../../../../../tooling/src/verify/gates/no-default-props.ts";
import { gate as noHandwrittenWireJsonSchema } from "../../../../../tooling/src/verify/gates/no-handwritten-wire-json-schema.ts";
import { gate as noInlineTypes } from "../../../../../tooling/src/verify/gates/no-inline-types.ts";
import { gate as noManualMemo } from "../../../../../tooling/src/verify/gates/no-manual-memo.ts";
import { gate as noManualTokenEstimate } from "../../../../../tooling/src/verify/gates/no-manual-token-estimate.ts";
import { gate as noMediaQueriesInFeatures } from "../../../../../tooling/src/verify/gates/no-media-queries-in-features.ts";
import { gate as noRawContainerWidths } from "../../../../../tooling/src/verify/gates/no-raw-container-widths.ts";
import { gate as noRawRandom } from "../../../../../tooling/src/verify/gates/no-raw-random.ts";
import { gate as nullableColumnInequality } from "../../../../../tooling/src/verify/gates/nullable-column-inequality.ts";
import { gate as openJsonColumnKeyParity } from "../../../../../tooling/src/verify/gates/open-json-column-key-parity.ts";
import { gate as packageLayout } from "../../../../../tooling/src/verify/gates/package-layout.ts";
import { gate as playwrightCssTopology } from "../../../../../tooling/src/verify/gates/playwright-css-topology.ts";
import { gate as policyRefusalCoverage } from "../../../../../tooling/src/verify/gates/policy-refusal-coverage.ts";
import { gate as policyWaiverIdentity } from "../../../../../tooling/src/verify/gates/policy-waiver-identity.ts";
import { gate as queryMachineSealsHealth } from "../../../../../tooling/src/verify/gates/query-machine-seals-health.ts";
import { gate as realCorpusLivenessManifest } from "../../../../../tooling/src/verify/gates/real-corpus-liveness-manifest.ts";
import { gate as scrubberFactoryHome } from "../../../../../tooling/src/verify/gates/scrubber-factory-home.ts";
import { gate as staleDraftDecisionHealth } from "../../../../../tooling/src/verify/gates/stale-draft-decision-health.ts";
import { gate as testFactoryContract } from "../../../../../tooling/src/verify/gates/test-factory-contract.ts";
import { gate as testPresence } from "../../../../../tooling/src/verify/gates/test-presence.ts";
import { gate as testPresenceClient } from "../../../../../tooling/src/verify/gates/test-presence-client.ts";
import { gate as testPresenceInference } from "../../../../../tooling/src/verify/gates/test-presence-inference.ts";
import { gate as testidLiveness } from "../../../../../tooling/src/verify/gates/testid-liveness.ts";
import { gate as toolingClockBudget } from "../../../../../tooling/src/verify/gates/tooling-clock-budget.ts";
import { gate as toolingInstrumentProof } from "../../../../../tooling/src/verify/gates/tooling-instrument-proof.ts";
import { gate as toolingPortRegistry } from "../../../../../tooling/src/verify/gates/tooling-port-registry.ts";
import { gate as uiPrimitivePermissions } from "../../../../../tooling/src/verify/gates/ui-primitive-permissions.ts";
import { gate as userBusDeferredMember } from "../../../../../tooling/src/verify/gates/user-bus-deferred-member.ts";
import { gate as warningCodeCoverage } from "../../../../../tooling/src/verify/gates/warning-code-coverage.ts";
import { gate as wireSchemaVocabOneHome } from "../../../../../tooling/src/verify/gates/wire-schema-vocab-one-home.ts";
import type { RealCorpusLivenessArm, RealCorpusOverlay } from "../../../../support/real-corpus-liveness.ts";
import { probeGate } from "./tooling-tests.ts";

const DOMAIN = "packages/server/src/domain/character";
const FEATURE = "packages/client/src/features/chat";
const PRIMITIVE = "packages/ui/src/primitives/livenessthing";

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
    policy: noCallerUserId,
    overlays: [
      add(
        `${DOMAIN}/liveness-caller.ts`,
        `export function livenessCaller(${["caller", "UserId"].join("")}: string): string {\n  return ${["caller", "UserId"].join("")};\n}\n`,
      ),
    ],
    messageIncludes: "is forbidden (D19)",
  },
  {
    policy: noDefaultProps,
    overlays: [
      add("packages/ui/src/liveness-default.tsx", `const LivenessDefault = () => <div />;\nLivenessDefault.${["default", "Props"].join("")} = { id: 1 };\n`),
    ],
    messageIncludes: "defaultProps is deprecated",
  },
  {
    policy: noHandwrittenWireJsonSchema,
    overlays: [add(`${DOMAIN}/verbs/liveness-rf.ts`, 'export const livenessFormat = { name: "x", schema: { type: "object", properties: {} } };\n')],
    messageIncludes: "hand-authored JSON-Schema literal",
  },
  {
    policy: noInlineTypes,
    overlays: [add(`${DOMAIN}/verbs/liveness-verb.ts`, "export type LivenessInline = string;\n")],
    messageIncludes: "outside a type home",
  },
  {
    policy: noManualMemo,
    overlays: [add(`${FEATURE}/components/liveness-memo.tsx`, 'import { useMemo } from "react";\nexport const livenessMemo = useMemo(() => 1, []);\n')],
    messageIncludes: "manual React memoization",
  },
  {
    policy: noManualTokenEstimate,
    overlays: [add(`${DOMAIN}/liveness-estimate.ts`, "export const livenessEstimate = (text: string): number => text.length / 4;\n")],
    messageIncludes: "hand-rolled `.length / 4` token estimate",
  },
  {
    policy: noMediaQueriesInFeatures,
    overlays: [add(`${FEATURE}/liveness-media.tsx`, 'export const LivenessMedia = <div className="md:flex-row" />;\n')],
    messageIncludes: "viewport breakpoint variant",
  },
  {
    policy: noRawContainerWidths,
    overlays: [add(`${FEATURE}/liveness-width.tsx`, 'export const LivenessWidth = <div className="max-w-96" />;\n')],
    messageIncludes: "raw content width class",
  },
  {
    policy: noRawRandom,
    overlays: [add(`${DOMAIN}/liveness-dice.ts`, "export function livenessDice(): number {\n  return Math.random();\n}\n")],
    messageIncludes: `${DOMAIN}/liveness-dice.ts`,
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
    policy: queryMachineSealsHealth,
    overlays: [{ kind: "neutralise", path: "packages/client/src/data/create-collection-surface.ts", source: "export const createCollectionSurface = null;\n" }],
    messageIncludes: "useInfiniteQuery.",
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
    policy: testFactoryContract,
    overlays: [add("tests/support/factories/liveness-user.ts", "export function makeLivenessUser(db: unknown) {\n  return db;\n}\n")],
    messageIncludes: "PURE builder accepts a db",
  },
  {
    policy: testPresenceClient,
    // Only the data/forms/state primitives owe a per-file mirror.
    overlays: [add("packages/client/src/data/use-liveness.ts", "export const useLiveness = () => 1;\n")],
    messageIncludes: "client data/forms/state primitive has no test",
  },
  {
    policy: testPresenceInference,
    overlays: planted(
      "packages/inference/src/extensions/liveness-normalize.ts",
      "export function livenessNormalize(value: string): string {\n  return value.trim();\n}\n",
    ),
    messageIncludes: "has no supported test topology",
  },
  {
    policy: testPresence,
    overlays: [add(`${DOMAIN}/persistence/liveness-record.ts`, "export const livenessRecord = () => 1;\n")],
    messageIncludes: "persistence file has no .int.test",
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
    overlays: [edit("tooling/src/_shared/instruments.ts", "INSTRUMENT_TOOLS = [\n", 'INSTRUMENT_TOOLS = [\n  "livenessghost",\n')],
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
    policy: userBusDeferredMember,
    // The deferred member gains its canonical injected producer, so the deferral is stale.
    overlays: [
      add(
        "packages/server/src/domain/connection/verbs/liveness-save.ts",
        'import type { UserBusEvent } from "@orb/contracts/user-bus";\nexport function livenessSave(ctx: { emitUserEvent: (userId: string, event: UserBusEvent) => void }, userId: string): void {\n  ctx.emitUserEvent(userId, { type: "connectionsChanged" });\n}\n',
      ),
    ],
    reportsAt: ["packages/contracts/src/user-bus/index.ts"],
    messageIncludes: "Member: connectionsChanged",
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
    policy: wireSchemaVocabOneHome,
    overlays: [add("packages/inference/src/backends/livenessvendor/schema.ts", 'export const DROP = ["minLength", "maxLength", "$schema"];\n')],
    messageIncludes: "spelled outside the one scrub engine",
  },
];
