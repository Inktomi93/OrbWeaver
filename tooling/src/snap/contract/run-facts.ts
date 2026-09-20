// Machine-readable Snap facts. RESULT pairs are a byte-stable terminal transcript, never this schema's
// input. Zod is the one trust-boundary grammar; every public TypeScript fact type is inferred from it.
import { z } from "zod";
import type { InstrumentCurrentScope } from "../../_shared/artifact-scope.ts";
import { artifactRefSchema, factBatchIdSchema, instrumentCurrentScopeSchema } from "../../_shared/artifact-scope.ts";
import type { DiagnosticRetentionSummary } from "../../_shared/browser-evidence-ring.ts";
import { browserEvidenceRetentionBatchSchema, diagnosticRetentionSummary } from "../../_shared/browser-evidence-ring.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { DESIGN_AUDIT_SEVERITIES } from "../../ui-audit/index.ts";
import type { Arm } from "./arm-vocabulary.ts";
import { snapRatePostureSchema } from "./rate-posture.ts";

export type SnapCurrentScope = InstrumentCurrentScope;

export const SNAP_RUN_RESULTS_VERSION = 1;
/** `load-suspect` joined 2026-09-05 (#1616, owner ruling): a rate arm on a loaded box MEASURES and reports
 *  its number, so it is neither `passed` (nothing may promote that number) nor `withheld` (a number DOES
 *  exist). Every consumer of this tuple dispatches through a mapped `Record`, so the member is a compile
 *  error until each one decides what it means. */
export const SNAP_ARM_STATES = ["passed", "failed", "refused", "withheld", "load-suspect", "absent", "off"] as const;
const snapArmStateSchema = z.enum(SNAP_ARM_STATES);
export type SnapArmState = z.infer<typeof snapArmStateSchema>;

const detailSchema = z.string().min(1).nullable();
const armStateShape = { state: snapArmStateSchema, detail: detailSchema } as const;
const count = z.number().int().nonnegative();
const artifact = artifactRefSchema.nullable();
/** One design-audit verdict channel, as the FACT spells it: `complete` only over a channel the walk
 *  actually reached, `no-verdict` everywhere else (#1087 F1, carried onto the fact by #1538). */
const verdict = z.enum(["complete", "no-verdict"]);
const exitCodeSchema = z.union([z.literal(EXIT.clean), z.literal(EXIT.violations), z.literal(EXIT.toolError), z.literal(EXIT.misuse)]);
export function snapExitCode(value: number): z.infer<typeof exitCodeSchema> {
  return exitCodeSchema.parse(value);
}
export function snapExitState(value: number): "passed" | "failed" | "refused" {
  if (value === EXIT.clean) {
    return "passed";
  }
  return value === EXIT.violations ? "failed" : "refused";
}

export const ARM_FACT_DATA_SCHEMAS = {
  "dead-css": z.object({ ...armStateShape, deadTokens: count, emptyRules: count }),
  aria: z.object({ ...armStateShape, captures: count, failures: count }),
  eval: z.object({ ...armStateShape, expressions: count, failures: count }),
  contrast: z.object({ ...armStateShape, checks: count, failures: count }),
  map: z.object({ ...armStateShape, entries: count, domFallbacks: count, failures: count }),
  assert: z.object({ ...armStateShape, assertions: count, failures: count }),
  "design-audit": z.object({
    ...armStateShape,
    findings: count,
    p0: count,
    p1: count,
    p2: count,
    p3: count,
    census: count,
    failOn: z.enum(DESIGN_AUDIT_SEVERITIES),
    // THE SIX NAMED CHANNELS (#1087 F1), all of them (#1538; the sixth by lane cb-audit-viewport,
    // 2026-09-20). The fact carried `populationVerdict` alone, so a fact-only consumer could not tell a
    // truncated census from a broken forced-state pass — exactly the distinction the channels exist to
    // make, and the JSON artifact has carried them since #1087. A terminal run stamps its own gap into
    // every one.
    viewportFrameVerdict: verdict,
    censusCapVerdict: verdict,
    populationVerdict: verdict,
    hoverVerdict: verdict,
    forceVerdict: verdict,
    instrumentPageErrorVerdict: verdict,
    ambiguousSelectors: count,
    unprovenSelectors: count,
    artifact,
  }),
  "app-snapshot": z.object({ ...armStateShape, snapshots: count, unavailable: count }),
  heap: z.object({ ...armStateShape, snapshots: count, comparisons: count, retainers: count, findings: count, errors: count }),
  filmstrip: z.object({
    ...armStateShape,
    observedFrames: count,
    retainedFrames: count,
    omittedFrames: count,
    observedBytes: count,
    retainedBytes: count,
    omittedBytes: count,
    durationMs: count,
    actions: count,
    limitEvents: count,
    artifact,
  }),
  shot: z.object({ ...armStateShape, requested: count, produced: count }),
  cascade: z.object({ ...armStateShape, queries: count, failures: count }),
  requests: z.object({ ...armStateShape, recorded: count, shown: count, evicted: count, artifact }),
  lighthouse: z.object({ ...armStateShape, audits: count, failedAudits: count, artifactCount: count }),
  motion: z.object({ ...armStateShape, measurements: count, problems: count, artifact }),
  "interaction-perf": z.object({ ...armStateShape, steps: count, breachSteps: count, artifact }),
  "cpu-profile": z.object({ ...armStateShape, nodes: count, samples: count, artifact }),
  "boot-trace": z.object({ ...armStateShape, events: count, insights: count, artifact }),
  "react-profile": z.object({ ...armStateShape, renderers: count, commits: count, components: count, artifact }),
} satisfies Record<Arm, z.ZodType>;

export type ArmFactDataByArm = { readonly [A in Arm]: z.infer<(typeof ARM_FACT_DATA_SCHEMAS)[A]> };

const ARM_FACT_SCHEMA_IDS = {
  "dead-css": "snap-arm-dead-css-v1",
  aria: "snap-arm-aria-v1",
  eval: "snap-arm-eval-v1",
  contrast: "snap-arm-contrast-v1",
  map: "snap-arm-map-v1",
  assert: "snap-arm-assert-v1",
  "design-audit": "snap-arm-design-audit-v1",
  "app-snapshot": "snap-arm-app-snapshot-v1",
  heap: "snap-arm-heap-v1",
  filmstrip: "snap-arm-filmstrip-v1",
  shot: "snap-arm-shot-v1",
  cascade: "snap-arm-cascade-v1",
  requests: "snap-arm-requests-v1",
  lighthouse: "snap-arm-lighthouse-v1",
  motion: "snap-arm-motion-v1",
  "interaction-perf": "snap-arm-interaction-perf-v1",
  "cpu-profile": "snap-arm-cpu-profile-v1",
  "boot-trace": "snap-arm-boot-trace-v1",
  "react-profile": "snap-arm-react-profile-v1",
} satisfies { readonly [A in Arm]: `snap-arm-${A}-v1` };
export type ArmFactSchemaIdByArm = typeof ARM_FACT_SCHEMA_IDS;

const armFactBase = {
  kind: z.literal("arm"),
  source: z.string().min(1),
  lifetime: z.string().min(1),
  scope: instrumentCurrentScopeSchema,
  artifacts: z.array(artifactRefSchema),
} as const;

const ARM_FACT_SCHEMAS = {
  "dead-css": z.object({
    ...armFactBase,
    arm: z.literal("dead-css"),
    schema: z.literal(ARM_FACT_SCHEMA_IDS["dead-css"]),
    data: ARM_FACT_DATA_SCHEMAS["dead-css"],
  }),
  aria: z.object({ ...armFactBase, arm: z.literal("aria"), schema: z.literal(ARM_FACT_SCHEMA_IDS.aria), data: ARM_FACT_DATA_SCHEMAS.aria }),
  eval: z.object({ ...armFactBase, arm: z.literal("eval"), schema: z.literal(ARM_FACT_SCHEMA_IDS.eval), data: ARM_FACT_DATA_SCHEMAS.eval }),
  contrast: z.object({ ...armFactBase, arm: z.literal("contrast"), schema: z.literal(ARM_FACT_SCHEMA_IDS.contrast), data: ARM_FACT_DATA_SCHEMAS.contrast }),
  map: z.object({ ...armFactBase, arm: z.literal("map"), schema: z.literal(ARM_FACT_SCHEMA_IDS.map), data: ARM_FACT_DATA_SCHEMAS.map }),
  assert: z.object({ ...armFactBase, arm: z.literal("assert"), schema: z.literal(ARM_FACT_SCHEMA_IDS.assert), data: ARM_FACT_DATA_SCHEMAS.assert }),
  "design-audit": z.object({
    ...armFactBase,
    arm: z.literal("design-audit"),
    schema: z.literal(ARM_FACT_SCHEMA_IDS["design-audit"]),
    data: ARM_FACT_DATA_SCHEMAS["design-audit"],
  }),
  "app-snapshot": z.object({
    ...armFactBase,
    arm: z.literal("app-snapshot"),
    schema: z.literal(ARM_FACT_SCHEMA_IDS["app-snapshot"]),
    data: ARM_FACT_DATA_SCHEMAS["app-snapshot"],
  }),
  heap: z.object({ ...armFactBase, arm: z.literal("heap"), schema: z.literal(ARM_FACT_SCHEMA_IDS.heap), data: ARM_FACT_DATA_SCHEMAS.heap }),
  filmstrip: z.object({ ...armFactBase, arm: z.literal("filmstrip"), schema: z.literal(ARM_FACT_SCHEMA_IDS.filmstrip), data: ARM_FACT_DATA_SCHEMAS.filmstrip }),
  shot: z.object({ ...armFactBase, arm: z.literal("shot"), schema: z.literal(ARM_FACT_SCHEMA_IDS.shot), data: ARM_FACT_DATA_SCHEMAS.shot }),
  cascade: z.object({ ...armFactBase, arm: z.literal("cascade"), schema: z.literal(ARM_FACT_SCHEMA_IDS.cascade), data: ARM_FACT_DATA_SCHEMAS.cascade }),
  requests: z.object({ ...armFactBase, arm: z.literal("requests"), schema: z.literal(ARM_FACT_SCHEMA_IDS.requests), data: ARM_FACT_DATA_SCHEMAS.requests }),
  lighthouse: z.object({
    ...armFactBase,
    arm: z.literal("lighthouse"),
    schema: z.literal(ARM_FACT_SCHEMA_IDS.lighthouse),
    data: ARM_FACT_DATA_SCHEMAS.lighthouse,
  }),
  motion: z.object({ ...armFactBase, arm: z.literal("motion"), schema: z.literal(ARM_FACT_SCHEMA_IDS.motion), data: ARM_FACT_DATA_SCHEMAS.motion }),
  "interaction-perf": z.object({
    ...armFactBase,
    arm: z.literal("interaction-perf"),
    schema: z.literal(ARM_FACT_SCHEMA_IDS["interaction-perf"]),
    data: ARM_FACT_DATA_SCHEMAS["interaction-perf"],
  }),
  "cpu-profile": z.object({
    ...armFactBase,
    arm: z.literal("cpu-profile"),
    schema: z.literal(ARM_FACT_SCHEMA_IDS["cpu-profile"]),
    data: ARM_FACT_DATA_SCHEMAS["cpu-profile"],
  }),
  "boot-trace": z.object({
    ...armFactBase,
    arm: z.literal("boot-trace"),
    schema: z.literal(ARM_FACT_SCHEMA_IDS["boot-trace"]),
    data: ARM_FACT_DATA_SCHEMAS["boot-trace"],
  }),
  "react-profile": z.object({
    ...armFactBase,
    arm: z.literal("react-profile"),
    schema: z.literal(ARM_FACT_SCHEMA_IDS["react-profile"]),
    data: ARM_FACT_DATA_SCHEMAS["react-profile"],
  }),
} satisfies Record<Arm, z.ZodType>;

const snapArmFactSchema = z.discriminatedUnion("arm", [
  ARM_FACT_SCHEMAS["dead-css"],
  ARM_FACT_SCHEMAS.aria,
  ARM_FACT_SCHEMAS.eval,
  ARM_FACT_SCHEMAS.contrast,
  ARM_FACT_SCHEMAS.map,
  ARM_FACT_SCHEMAS.assert,
  ARM_FACT_SCHEMAS["design-audit"],
  ARM_FACT_SCHEMAS["app-snapshot"],
  ARM_FACT_SCHEMAS.heap,
  ARM_FACT_SCHEMAS.filmstrip,
  ARM_FACT_SCHEMAS.shot,
  ARM_FACT_SCHEMAS.cascade,
  ARM_FACT_SCHEMAS.requests,
  ARM_FACT_SCHEMAS.lighthouse,
  ARM_FACT_SCHEMAS.motion,
  ARM_FACT_SCHEMAS["interaction-perf"],
  ARM_FACT_SCHEMAS["cpu-profile"],
  ARM_FACT_SCHEMAS["boot-trace"],
  ARM_FACT_SCHEMAS["react-profile"],
]);

export type SnapArmFactFor<A extends Arm> = A extends Arm
  ? {
      readonly kind: "arm";
      readonly arm: A;
      readonly schema: ArmFactSchemaIdByArm[A];
      readonly source: string;
      readonly lifetime: string;
      readonly scope: z.infer<typeof instrumentCurrentScopeSchema>;
      readonly artifacts: readonly z.infer<typeof artifactRefSchema>[];
      readonly data: ArmFactDataByArm[A];
    }
  : never;
export type SnapArmFact = { readonly [A in Arm]: SnapArmFactFor<A> }[Arm];

export function snapArmFact<A extends Arm>(input: {
  readonly arm: A;
  readonly schema: ArmFactSchemaIdByArm[A];
  readonly source: string;
  readonly lifetime: string;
  readonly scope: z.infer<typeof instrumentCurrentScopeSchema>;
  readonly artifacts: readonly z.infer<typeof artifactRefSchema>[];
  readonly data: ArmFactDataByArm[A];
}): SnapArmFact {
  return parseSnapArmFact({ kind: "arm", ...input });
}

const failureSummarySchema = z.object({
  navigation: count,
  navActions: count,
  pageErrors: count,
  failedRequests: count,
  steps: count,
  contrast: count,
  aria: count,
  map: count,
  eval: count,
  watch: count,
  diff: count,
  assertions: count,
  consoleErrors: count,
  consoleWarnings: count,
  css: count,
  deadCss: count,
  emptyCss: count,
  environment: count,
  appearance: count,
  lighthouse: count,
});

const coreBase = {
  kind: z.literal("core"),
  source: z.string().min(1),
  lifetime: z.string().min(1),
  scope: instrumentCurrentScopeSchema,
  artifacts: z.array(artifactRefSchema),
} as const;

const CORE_FACT_PROVENANCE = {
  rate: { source: "browser-system-info+host-load", lifetime: "one Snap run/cell" },
  run: { source: "snap-run-owner", lifetime: "one Snap run/cell" },
  retention: { source: "bounded-browser-evidence-rings", lifetime: "one Snap run/cell" },
  terminal: { source: "instrument-run-owner", lifetime: "run completion" },
} as const;

const SNAP_CORE_FACT_SCHEMAS = {
  "snap-rate-posture-v1": z.object({
    ...coreBase,
    schema: z.literal("snap-rate-posture-v1"),
    source: z.literal(CORE_FACT_PROVENANCE.rate.source),
    lifetime: z.literal(CORE_FACT_PROVENANCE.rate.lifetime),
    data: snapRatePostureSchema,
  }),
  "snap-core-run-v1": z.object({
    ...coreBase,
    schema: z.literal("snap-core-run-v1"),
    source: z.literal(CORE_FACT_PROVENANCE.run.source),
    lifetime: z.literal(CORE_FACT_PROVENANCE.run.lifetime),
    data: z.object({
      exit: exitCodeSchema,
      state: z.enum(["passed", "failed", "refused"]),
      pages: count,
      contexts: count,
      captures: count,
      fileActions: count,
      failedRequests: count,
      pageErrors: count,
      diagnostics: count,
      failures: failureSummarySchema,
    }),
  }),
  "snap-browser-retention-v1": z.object({
    ...coreBase,
    schema: z.literal("snap-browser-retention-v1"),
    source: z.literal(CORE_FACT_PROVENANCE.retention.source),
    lifetime: z.literal(CORE_FACT_PROVENANCE.retention.lifetime),
    data: browserEvidenceRetentionBatchSchema,
  }),
  "snap-terminal-v1": z.object({
    ...coreBase,
    schema: z.literal("snap-terminal-v1"),
    source: z.literal(CORE_FACT_PROVENANCE.terminal.source),
    lifetime: z.literal(CORE_FACT_PROVENANCE.terminal.lifetime),
    data: z.object({ exit: exitCodeSchema, state: z.enum(["passed", "failed", "refused"]), detail: z.string().min(1) }),
  }),
} as const;

type SnapCoreFact = z.infer<(typeof SNAP_CORE_FACT_SCHEMAS)[keyof typeof SNAP_CORE_FACT_SCHEMAS]>;

const snapRunResultsSchema = z.object({
  v: z.literal(SNAP_RUN_RESULTS_VERSION),
  batches: z.array(
    z.object({
      id: factBatchIdSchema,
      core: z.array(
        z.discriminatedUnion("schema", [
          SNAP_CORE_FACT_SCHEMAS["snap-rate-posture-v1"],
          SNAP_CORE_FACT_SCHEMAS["snap-core-run-v1"],
          SNAP_CORE_FACT_SCHEMAS["snap-browser-retention-v1"],
          SNAP_CORE_FACT_SCHEMAS["snap-terminal-v1"],
        ]),
      ),
      arms: z.array(snapArmFactSchema),
    }),
  ),
});

export interface SnapRunFactBatch {
  readonly id: z.infer<typeof factBatchIdSchema>;
  readonly core: readonly SnapCoreFact[];
  readonly arms: readonly SnapArmFact[];
}

export interface SnapRunResults {
  readonly v: typeof SNAP_RUN_RESULTS_VERSION;
  readonly batches: readonly SnapRunFactBatch[];
}

function parseSnapArmFact(value: unknown): SnapArmFact {
  try {
    return snapArmFactSchema.parse(value);
  } catch (error) {
    const record = typeof value === "object" && value !== null ? value : {};
    const arm = Reflect.get(record, "arm");
    const schema = Reflect.get(record, "schema");
    const expected = typeof arm === "string" ? Reflect.get(ARM_FACT_SCHEMA_IDS, arm) : undefined;
    const prefix =
      expected !== undefined && schema !== expected ? `unknown ${arm} fact schema ${JSON.stringify(schema)}` : `malformed ${String(arm)} fact data`;
    throw new Error(`${prefix}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

export function parseSnapRunResults(value: unknown): SnapRunResults {
  const envelope = snapRunResultsSchema.parse(value);
  const batches = envelope.batches.map((batch) => ({ ...batch, arms: batch.arms.map(parseSnapArmFact) }));
  const ids = new Set<string>();
  for (const batch of batches) {
    if (ids.has(batch.id)) {
      throw new Error(`duplicate Snap fact batch id ${batch.id}`);
    }
    ids.add(batch.id);
    const coreSchemas = new Set<string>();
    const armScopes = new Set<string>();
    for (const fact of batch.core) {
      if (coreSchemas.has(fact.schema)) {
        throw new Error(`duplicate ${fact.schema} core fact in batch ${batch.id}`);
      }
      coreSchemas.add(fact.schema);
    }
    for (const fact of batch.arms) {
      const key = `${fact.arm}\u0000${JSON.stringify(fact.scope)}`;
      if (armScopes.has(key)) {
        throw new Error(`duplicate ${fact.arm} fact scope in batch ${batch.id}`);
      }
      armScopes.add(key);
    }
  }
  return {
    v: SNAP_RUN_RESULTS_VERSION,
    batches,
  };
}

export function snapDiagnosticRetention(results: SnapRunResults | undefined): DiagnosticRetentionSummary {
  const fact = results?.batches.flatMap((batch) => batch.core).find((candidate) => candidate.schema === "snap-browser-retention-v1");
  return fact === undefined ? { complete: true, dropped: 0, sources: [] } : diagnosticRetentionSummary(fact.data);
}
