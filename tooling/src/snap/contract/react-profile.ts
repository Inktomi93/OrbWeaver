// Snap React development-renderer evidence. The browser collector emits this wire shape; the arm parses
// it here before ranking or filing any evidence.
import { z } from "zod";
import type { EvidenceWindowId } from "../../_shared/artifact-scope.ts";
import { evidenceWindowIdSchema } from "../../_shared/artifact-scope.ts";

/** @public Cross-file Snap React profile evidence contract. */
export interface ReactRendererEvidence {
  readonly id: number;
  readonly packageName: string;
  readonly version: string;
  readonly bundleType: number | null;
  readonly compatible: boolean;
  readonly incompatibilities: readonly string[];
  readonly injectedAtEpochMs: number;
}

export interface ReactFiberEvidence {
  readonly id: number;
  readonly parentId: number | null;
  readonly childIds: readonly number[];
  readonly segment: string;
  readonly tag: number;
  readonly kind: string;
  readonly name: string;
  readonly type: string;
  readonly key: string | null;
  readonly path: string;
  readonly ownerId: number | null;
  readonly ownerPath: string | null;
  readonly sourceStack: string | null;
  readonly rendered: boolean;
  /** Inherited from the nearest React Activity/Offscreen boundary. Retained hidden work remains raw
   * evidence but is excluded from the active hot-component ranking. */
  readonly activityState: "active" | "retained-hidden";
  readonly actualDurationMs: number;
  readonly selfTimeMs: number;
  readonly subtreeTimeMs: number;
  readonly treeBaseDurationMs: number;
  readonly reason: {
    readonly kind: string;
    readonly props: readonly string[];
    readonly state: boolean;
    readonly context: readonly number[];
    readonly hooks: readonly number[];
  };
  readonly props: unknown;
  readonly state: unknown;
  readonly context: unknown;
  readonly hooks: unknown;
  readonly boundary: unknown;
  readonly debugInfo: unknown;
}

type ReactFiberPayload = Pick<ReactFiberEvidence, Exclude<keyof ReactFiberEvidence, "ownerPath" | "path">>;

export interface ReactCommitEvidence {
  readonly id: number;
  readonly rendererId: number;
  readonly epochMs: number;
  readonly performanceNowMs: number;
  readonly priority: number | null;
  readonly didError: boolean;
  readonly rootId: number;
  readonly updaters: readonly { readonly id: number; readonly path: string | null }[];
  readonly componentCount: number;
  readonly truncated: boolean;
  readonly rootFiberId: number;
  /** Flat topology is deliberate: a live Fiber tree can be deeper than Playwright's value serializer.
   * parentId/childIds/path preserve the complete bounded tree without returning a recursive object graph. */
  readonly fibers: readonly ReactFiberEvidence[];
}

export interface ReactCommitPayload extends Pick<ReactCommitEvidence, Exclude<keyof ReactCommitEvidence, "fibers" | "updaters">> {
  readonly updaters: readonly { readonly id: number }[];
  readonly fibers: readonly ReactFiberPayload[];
}

export interface ReactProfileLimits {
  readonly maxCommits: number;
  readonly maxEventsPerKind: number;
  readonly maxFibersPerCommit: number;
  readonly maxPreviewDepth: number;
  readonly maxPreviewStringLength: number;
  readonly maxPreviewArrayEntries: number;
  readonly maxPreviewObjectKeys: number;
  readonly maxHookSlots: number;
  readonly maxContextDependencies: number;
  readonly maxChangedKeys: number;
  readonly boundaryChunkRecords: number;
}

export interface ReactProfilePageEvidence {
  readonly contextIndex: number;
  readonly pageIndex: number;
  readonly url: string;
  readonly hookInstalled: boolean;
  readonly installError: string | null;
  readonly collectorErrors: readonly string[];
  readonly windowId: EvidenceWindowId;
  readonly timeOriginEpochMs: number;
  readonly limits: ReactProfileLimits;
  readonly renderers: readonly ReactRendererEvidence[];
  readonly commits: readonly ReactCommitEvidence[];
  readonly schedules: readonly unknown[];
  readonly unmounts: readonly unknown[];
  readonly postCommits: readonly unknown[];
  readonly measures: readonly unknown[];
}

interface ReactProfilePagePayload
  extends Pick<ReactProfilePageEvidence, Exclude<keyof ReactProfilePageEvidence, "commits" | "contextIndex" | "pageIndex" | "url">> {
  readonly commits: readonly ReactCommitPayload[];
}

export interface RankedReactComponent {
  readonly contextIndex: number;
  readonly pageIndex: number;
  readonly rendererId: number;
  readonly name: string;
  readonly path: string;
  readonly commitCount: number;
  readonly renderCount: number;
  readonly totalActualDurationMs: number;
  readonly averageActualDurationMs: number;
  readonly maxActualDurationMs: number;
  readonly selfTimeMs: number;
  readonly subtreeTimeMs: number;
  readonly maxTreeBaseDurationMs: number;
}

export interface ReactActivitySummary {
  readonly retainedHiddenCompositeRenderCount: number;
}

export const REACT_PROFILE_SUMMARY_COMPONENT_LIMIT = 20;

export interface ReactProfileSummaryArtifact {
  readonly version: 1;
  readonly contract: "snap-react-development-renderer-profile-summary";
  readonly generatedAt: string;
  readonly summary: {
    readonly rendererCount: number;
    readonly commitCount: number;
    readonly componentCount: number;
    readonly updateEventCount: number;
    readonly userTimingCount: number;
    readonly reactTraceEventCount: number;
    readonly retainedHiddenCompositeRenderCount: number;
  };
  readonly limits: ReactProfileLimits;
  readonly limitations: Readonly<Record<"activity" | "compiler" | "hooks" | "reasons" | "selfTime" | "source" | "topology", string>>;
  readonly gaps: readonly { readonly evidence: string; readonly detail: string }[];
  readonly hottest: readonly RankedReactComponent[];
  readonly artifacts: { readonly rawFiber: string; readonly trace: string };
}

const finite = z.number();
const nonnegativeInteger = z.number().int().nonnegative();
const positiveInteger = z.number().int().positive();
const reactProfileLimitsSchema: z.ZodType<ReactProfileLimits> = z.object({
  maxCommits: positiveInteger,
  maxEventsPerKind: positiveInteger,
  maxFibersPerCommit: positiveInteger,
  maxPreviewDepth: positiveInteger,
  maxPreviewStringLength: positiveInteger,
  maxPreviewArrayEntries: positiveInteger,
  maxPreviewObjectKeys: positiveInteger,
  maxHookSlots: positiveInteger,
  maxContextDependencies: positiveInteger,
  maxChangedKeys: positiveInteger,
  boundaryChunkRecords: positiveInteger,
});
const reactRendererEvidenceSchema: z.ZodType<ReactRendererEvidence> = z.object({
  id: nonnegativeInteger,
  packageName: z.string(),
  version: z.string(),
  bundleType: z.number().int().nullable(),
  compatible: z.boolean(),
  incompatibilities: z.array(z.string()),
  injectedAtEpochMs: finite,
});
const reactFiberPayloadSchema: z.ZodType<ReactFiberPayload> = z.object({
  id: nonnegativeInteger,
  parentId: z.number().int().nullable(),
  childIds: z.array(nonnegativeInteger),
  tag: z.number().int(),
  kind: z.string(),
  name: z.string(),
  type: z.string(),
  key: z.string().nullable(),
  segment: z.string(),
  ownerId: z.number().int().nullable(),
  sourceStack: z.string().nullable(),
  rendered: z.boolean(),
  activityState: z.enum(["active", "retained-hidden"]),
  actualDurationMs: finite,
  selfTimeMs: finite,
  subtreeTimeMs: finite,
  treeBaseDurationMs: finite,
  reason: z.object({
    kind: z.string(),
    props: z.array(z.string()),
    state: z.boolean(),
    context: z.array(z.number().int()),
    hooks: z.array(z.number().int()),
  }),
  props: z.unknown(),
  state: z.unknown(),
  context: z.unknown(),
  hooks: z.unknown(),
  boundary: z.unknown(),
  debugInfo: z.unknown(),
});
const reactCommitPayloadSchema: z.ZodType<ReactCommitPayload> = z.object({
  id: nonnegativeInteger,
  rendererId: nonnegativeInteger,
  epochMs: finite,
  performanceNowMs: finite,
  priority: z.number().int().nullable(),
  didError: z.boolean(),
  rootId: nonnegativeInteger,
  updaters: z.array(z.object({ id: nonnegativeInteger })),
  componentCount: nonnegativeInteger,
  truncated: z.boolean(),
  rootFiberId: nonnegativeInteger,
  fibers: z.array(reactFiberPayloadSchema),
});

export const reactProfilePagePayloadSchema: z.ZodType<ReactProfilePagePayload> = z.object({
  hookInstalled: z.boolean(),
  installError: z.string().nullable(),
  collectorErrors: z.array(z.string()),
  windowId: evidenceWindowIdSchema,
  timeOriginEpochMs: finite,
  limits: reactProfileLimitsSchema,
  renderers: z.array(reactRendererEvidenceSchema),
  commits: z.array(reactCommitPayloadSchema),
  schedules: z.array(z.unknown()),
  unmounts: z.array(z.unknown()),
  postCommits: z.array(z.unknown()),
  measures: z.array(z.unknown()),
});

const rankedReactComponentSchema: z.ZodType<RankedReactComponent> = z.object({
  contextIndex: nonnegativeInteger,
  pageIndex: nonnegativeInteger,
  rendererId: nonnegativeInteger,
  name: z.string(),
  path: z.string(),
  commitCount: nonnegativeInteger,
  renderCount: nonnegativeInteger,
  totalActualDurationMs: finite,
  averageActualDurationMs: finite,
  maxActualDurationMs: finite,
  selfTimeMs: finite,
  subtreeTimeMs: finite,
  maxTreeBaseDurationMs: finite,
});

export const reactProfileSummaryArtifactSchema: z.ZodType<ReactProfileSummaryArtifact> = z.object({
  version: z.literal(1),
  contract: z.literal("snap-react-development-renderer-profile-summary"),
  generatedAt: z.string(),
  summary: z.object({
    rendererCount: nonnegativeInteger,
    commitCount: nonnegativeInteger,
    componentCount: nonnegativeInteger,
    updateEventCount: nonnegativeInteger,
    userTimingCount: nonnegativeInteger,
    reactTraceEventCount: nonnegativeInteger,
    retainedHiddenCompositeRenderCount: nonnegativeInteger,
  }),
  limits: reactProfileLimitsSchema,
  limitations: z.object({
    activity: z.string(),
    compiler: z.string(),
    hooks: z.string(),
    reasons: z.string(),
    selfTime: z.string(),
    source: z.string(),
    topology: z.string(),
  }),
  gaps: z.array(z.object({ evidence: z.string(), detail: z.string() })),
  hottest: z.array(rankedReactComponentSchema).max(REACT_PROFILE_SUMMARY_COMPONENT_LIMIT),
  artifacts: z.object({ rawFiber: z.string(), trace: z.string() }),
});
