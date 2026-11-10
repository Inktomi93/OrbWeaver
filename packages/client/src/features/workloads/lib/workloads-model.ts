// workloads-model — the Workloads pane's pure vocabulary, DOM-free. Everything derives from the
// canonical tuples in @orb/contracts/workloads, so a kind flipping stub→built needs zero client edits.

import type { AssetKind } from "@orb/contracts/assets";
import { ASSET_KINDS } from "@orb/contracts/assets";
import type { IndexSource, WireWorkloadKind, WorkloadKind, WorkloadLane, WorkloadProgress, WorkloadStatus } from "@orb/contracts/workloads";
import {
  ACTIVE_WORKLOAD_STATUSES,
  INDEX_SOURCES,
  OPERATOR_TREE_WORKLOAD_KIND,
  ROUTE_STARTED_WORKLOAD_KIND,
  readsOperatorTree,
  WORKLOAD_KIND_MODES,
  WORKLOAD_KINDS,
  WORKLOAD_LANES,
} from "@orb/contracts/workloads";
import { sentenceCase } from "@orb/kit/strings";
import type { BadgeProps } from "@orb/ui/badge";
import type { SelectItems } from "@orb/ui/select/items";
import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";

export type WorkloadProgressView = Readonly<{ pct: NonNullable<WorkloadProgress["pct"]> | null; label: NonNullable<WorkloadProgress["message"]> | null }>;

/** The kinds the run dialog offers: singular-capable + built (not a stub). Every `singular: true` mode is
 *  already `stub: false` by construction, so the filter only needs `.singular`. A route-started kind is singular and
 *  built, but its route mints its params, so it is never a user run. */
export const RUNNABLE_WORKLOAD_KINDS: readonly WireWorkloadKind[] = WORKLOAD_KINDS.filter(
  (kind): kind is WireWorkloadKind => WORKLOAD_KIND_MODES[kind].singular && kind !== ROUTE_STARTED_WORKLOAD_KIND,
);

// Owner-only maintenance kinds: built, bulk-capable, not singular (a deployment-wide sweep, no per-user target).
//

const MAINTENANCE_WORKLOAD_KINDS: readonly WorkloadKind[] = WORKLOAD_KINDS.filter(
  (kind) => WORKLOAD_KIND_MODES[kind].bulk && !WORKLOAD_KIND_MODES[kind].singular && !WORKLOAD_KIND_MODES[kind].stub,
);

/** Whether a kind is an owner-only maintenance (bulk-only built) kind. */
export function isMaintenanceWorkloadKind(value: string): boolean {
  return (MAINTENANCE_WORKLOAD_KINDS as readonly string[]).includes(value);
}

/** Kind → human label (exhaustive). Stub kinds keep labels too — only the picker is restricted to {@link RUNNABLE_WORKLOAD_KINDS}. */
export const WORKLOAD_KIND_LABELS: Record<WorkloadKind, string> = {
  index: "Index (embeddings)",
  "distill-characters": "Distill characters",
  "compute-themes": "Compute themes",
  "memory-backfill": "Memory backfill",
  "group-character-backfill": "Group character backfill",
  "compute-cooccurrence": "Compute co-occurrence",
  "find-duplicates": "Find duplicates",
  csls: "Similarity calibration (CSLS)",
  "assets-backfill": "Assets backfill",
  "assets-gc": "Assets garbage collection",
  "assets-fsck": "Assets integrity check",
  "assets-rebuild-index": "Rebuild asset index",
  "import-st": "Import from SillyTavern",
  "import-bundle": "Import backup bundle",
  "import-token-usage-backfill": "Backfill imported token usage",
  "reconcile-stats": "Reconcile stats",
  "refresh-model-catalog": "Refresh model catalog",
  "reconcile-world-state": "Reconcile world state",
  "databank-ingest": "Databank ingest",
  "databank-reindex": "Databank reindex",
  "refine-score-sweep": "Score the library (Refinery)",
};

const RUNNABLE_KIND_OPTIONS: SelectItems = WORKLOAD_KINDS.filter((kind) => RUNNABLE_WORKLOAD_KINDS.includes(kind)).map((kind) => ({
  value: kind,
  label: WORKLOAD_KIND_LABELS[kind],
}));

const MAINTENANCE_KIND_OPTIONS: SelectItems = WORKLOAD_KINDS.filter((kind) => MAINTENANCE_WORKLOAD_KINDS.includes(kind)).map((kind) => ({
  value: kind,
  label: WORKLOAD_KIND_LABELS[kind],
}));

// The server refuses a member this kind: it reads the operator's tree, and a member's own folder goes through the upload route.
const MEMBER_KIND_OPTIONS: SelectItems = RUNNABLE_KIND_OPTIONS.filter((option) => option.value !== OPERATOR_TREE_WORKLOAD_KIND);

/** The grouped (owner) kind-picker items; the maintenance group is omitted when empty. */
const OWNER_KIND_ITEMS: SelectItems =
  MAINTENANCE_KIND_OPTIONS.length === 0
    ? RUNNABLE_KIND_OPTIONS
    : [
        { label: "Run on my data", items: RUNNABLE_KIND_OPTIONS },
        { label: "Maintenance (all deployments)", items: MAINTENANCE_KIND_OPTIONS },
      ];

/** The kind-picker's items for a viewer — a non-owner sees the flat list of kinds they may run, the owner sees the grouped list. */
export function workloadKindItems(viewerIsOwner: boolean): SelectItems {
  return viewerIsOwner ? OWNER_KIND_ITEMS : MEMBER_KIND_OPTIONS;
}

/** The `index` kind's source picker (text / image / all — what to reindex). */
const INDEX_SOURCE_LABELS: Record<IndexSource, string> = {
  text: "Text: characters + chat memory",
  image: "Images: avatars",
  all: "Everything",
};
export const INDEX_SOURCE_ITEMS: SelectItems = INDEX_SOURCES.map((source) => ({
  value: source,
  label: INDEX_SOURCE_LABELS[source],
}));

/** The `assets-rebuild-index` kind's asset-kind picker: the kind stamped on every row the rebuild re-derives. */
const ASSET_KIND_LABELS: Record<AssetKind, string> = {
  card: "Character cards",
  avatar: "Avatars",
  export: "Exports",
  generated: "Generated images",
  gallery: "Gallery",
  attachment: "Attachments",
  document: "Documents",
  background: "Backgrounds",
  plugin: "Plugin files",
};
export const ASSET_KIND_ITEMS: SelectItems = ASSET_KINDS.map((kind) => ({ value: kind, label: ASSET_KIND_LABELS[kind] }));

/** Status → row-badge label (exhaustive). */
export const WORKLOAD_STATUS_LABELS: Record<WorkloadStatus, string> = {
  queued: "Queued",
  running: "Running",
  cancelling: "Cancelling",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
  worker_died: "Worker died",
};

/** Status → badge (never color alone — the label above always rides with it). A success is the expected state, so it
 *  takes the quiet outline; a colour state keeps its fill and a neutral one its tint. */
export const WORKLOAD_STATUS_BADGE: Record<WorkloadStatus, Pick<BadgeProps, "tone" | "variant">> = {
  queued: { tone: "neutral", variant: "soft" },
  running: { tone: "info", variant: "solid" },
  cancelling: { tone: "warning", variant: "solid" },
  succeeded: { tone: "success", variant: "outline" },
  failed: { tone: "destructive", variant: "solid" },
  cancelled: { tone: "neutral", variant: "soft" },
  worker_died: { tone: "destructive", variant: "solid" },
};

/** Lane → group heading (exhaustive over the WORKLOAD_LANES tuple — a new lane is a tsc error here). The
 *  lane is EXECUTION, not priority: two rows in different lanes run at the same time.
 *
 *  TWO PARTS, because the micro-caps voice is a label voice: the NAME is short and rides `kicker`, what the
 *  lane is FOR is a clause and rides `gloss` in sentence case. One caps string made a sentence shout. */
export const WORKLOAD_LANE_LABELS: Record<WorkloadLane, { readonly name: string; readonly purpose: string }> = {
  interactive: { name: "Interactive", purpose: "Jobs you're waiting on" },
  sweep: { name: "Sweeps", purpose: "Bulk maintenance" },
};

/** Split rows into their execution lanes, in tuple order, dropping lanes with no rows. A SINGLE non-empty
 *  lane returns one group — the caller renders it flat (a lone heading is noise, not information). */
export function groupWorkloadsByLane<T extends { readonly lane: WorkloadLane }>(
  rows: readonly T[],
): readonly { readonly lane: WorkloadLane; readonly rows: readonly T[] }[] {
  return WORKLOAD_LANES.map((lane) => ({ lane, rows: rows.filter((row) => row.lane === lane) })).filter((group) => group.rows.length > 0);
}

/** A status that still holds the kind's single-active slot — Cancel is offered exactly here. */
export function isActiveWorkloadStatus(status: WorkloadStatus): boolean {
  return (ACTIVE_WORKLOAD_STATUSES as readonly WorkloadStatus[]).includes(status);
}

/** A terminal-failure-ish status: the only rows Retry can apply to. */
function isRetryableWorkloadStatus(status: WorkloadStatus): boolean {
  return status === "failed" || status === "cancelled" || status === "worker_died";
}

/** Whether a viewer gets Retry on a row. The server refuses anyone but the box owner a run of the operator's tree, and that
 *  refusal would read as a conflict. A poison row's params cannot be read, so it stays the repair path. */
export function canRetryWorkload(workload: inferOutput<Trpc["workloads"]["list"]>[number], viewerIsOwner: boolean): boolean {
  const operatorRun = workload.kind === OPERATOR_TREE_WORKLOAD_KIND && !workload.poison && readsOperatorTree(workload.params);
  return isRetryableWorkloadStatus(workload.status) && (viewerIsOwner || !operatorRun);
}

export const WORKLOAD_FILTERS = ["all", "running", "recent", "failed"] as const;

export const WORKLOAD_FILTER_LABELS: Record<(typeof WORKLOAD_FILTERS)[number], string> = {
  all: "All",
  running: "Running",
  recent: "Recent",
  failed: "Failed",
};

/** Per-filter empty copy — distinct per tab. */
export const WORKLOAD_FILTER_EMPTY_COPY: Record<(typeof WORKLOAD_FILTERS)[number], string> = {
  all: "No jobs yet. Background jobs you run appear here.",
  running: "Nothing is running right now.",
  recent: "No finished jobs yet.",
  failed: "No failed jobs. Good.",
};

/** A filtered tab's reason for offering no action: what lands here, and where the one Run a job control sits. */
export const WORKLOAD_FILTER_EMPTY_NEXT_STEP = "Jobs from schedules and from Run a job, beside these tabs, show here once they reach this state.";

const RECENT_STATUSES = ["succeeded", "cancelled"] as const satisfies readonly WorkloadStatus[];
const FAILED_STATUSES = ["failed", "worker_died"] as const satisfies readonly WorkloadStatus[];

/** Whether a row's status lands in a filter tab. */
export function workloadFilterMatches(filter: (typeof WORKLOAD_FILTERS)[number], status: WorkloadStatus): boolean {
  switch (filter) {
    case "all":
      return true;
    case "running":
      return isActiveWorkloadStatus(status);
    case "recent":
      return (RECENT_STATUSES as readonly WorkloadStatus[]).includes(status);
    case "failed":
      return (FAILED_STATUSES as readonly WorkloadStatus[]).includes(status);
  }
}

/** The per-kind param control shape axis; the server re-parses every start against its own schema regardless. */
export const WORKLOAD_PARAM_SHAPES = ["none", "force", "dryRun", "k", "managed", "index", "rescore", "assetKind"] as const;

/** Kind → param-control shape (exhaustive). Stub kinds are `none` (real empty schemas server-side). */
export const WORKLOAD_PARAM_SHAPE_BY_KIND: Record<WorkloadKind, (typeof WORKLOAD_PARAM_SHAPES)[number]> = {
  index: "index",
  "distill-characters": "none",
  "compute-themes": "k",
  "memory-backfill": "none",
  "group-character-backfill": "none",
  "compute-cooccurrence": "none",
  "find-duplicates": "none",
  csls: "none",
  "assets-backfill": "dryRun",
  "assets-gc": "dryRun",
  "assets-fsck": "none",
  "assets-rebuild-index": "assetKind",
  // `managed` = a server-minted param (route-started, never a picker control).
  "import-st": "dryRun",
  "import-bundle": "managed",
  "import-token-usage-backfill": "dryRun",
  "reconcile-stats": "none",
  "refresh-model-catalog": "none",
  "reconcile-world-state": "none",
  "databank-ingest": "none",
  "databank-reindex": "none",
  // Its own shape, not `force`: the switch is FILL-vs-REFRESH over scores, and `force`'s copy speaks about
  // re-embedding vectors — a control whose words describe a different subsystem is a lying control.
  "refine-score-sweep": "rescore",
};

/** Narrow a form-string kind to a runnable (singular-capable) contract kind. */
export function isRunnableWorkloadKind(value: string): value is WireWorkloadKind {
  return (RUNNABLE_WORKLOAD_KINDS as readonly string[]).includes(value);
}

/** Narrow a form-string kind to any kind the dialog can start — runnable OR owner-only maintenance. */
export function isStartableWorkloadKind(value: string): value is WireWorkloadKind {
  return isRunnableWorkloadKind(value) || isMaintenanceWorkloadKind(value);
}

/** Whether a bulk run of this kind must designate a mint target. */
export function workloadKindNeedsBulkTarget(kind: string): boolean {
  return isRunnableWorkloadKind(kind) && WORKLOAD_KIND_MODES[kind].bulkRequiresTarget;
}

/** Whether a run of this kind needs the asset kind chosen: a blob on disk carries no kind, so the rebuild never guesses one. */
export function workloadKindNeedsAssetKind(kind: string): boolean {
  return isStartableWorkloadKind(kind) && WORKLOAD_PARAM_SHAPE_BY_KIND[kind] === "assetKind";
}

/** The run dialog's form values. `kind` is a plain string; {@link isRunnableWorkloadKind} narrows at the save seam. */
export interface RunWorkloadFormValues extends WorkloadRunValues {
  readonly kind: WorkloadKind;
  /** Owner-only bulk toggle — a non-owner's dialog never renders the field, so it stays `false`. */
  readonly bulk: boolean;
  /** The bulk-create mint target (`""` = unpicked). */
  readonly targetOwnerId: string;
  /** Optional deferred-start datetime (a `datetime-local` string; `""` = run now). */
  readonly runAt: string;
  /** The DAG gate — workload ids this run must wait on; `[]` = no gate. */
  readonly dependsOn: readonly string[];
}

export const RUN_WORKLOAD_FORM_DEFAULTS: RunWorkloadFormValues = {
  kind: RUNNABLE_WORKLOAD_KINDS[0] ?? "index",
  bulk: false,
  targetOwnerId: "",
  force: false,
  dryRun: false,
  k: null,
  source: "all",
  assetKind: "",
  runAt: "",
  dependsOn: [],
};

/** The param slots {@link buildStartInput} reads — the run and schedule form values extend this. */
export interface WorkloadRunValues {
  readonly force: boolean;
  readonly dryRun: boolean;
  /** Cluster count for `compute-themes`; `null` = use the server default. */
  readonly k: number | null;
  /** The `index` kind's embed source. Inert for every other kind. */
  readonly source: IndexSource;
  /** The `assets-rebuild-index` kind's asset kind; `""` = not chosen yet, which the forms refuse. Inert for every other kind. */
  readonly assetKind: AssetKind | "";
}

type StartWorkloadWire = inferInput<Trpc["workloads"]["start"]>;
type EstimateWorkloadWire = inferInput<Trpc["workloads"]["estimateModelCalls"]>;
const RUN_SCOPE_KEYS = ["input", "mode", "targetOwnerId"] as const;
type RunScopeKey = (typeof RUN_SCOPE_KEYS)[number];

/** The run scope the dialog both estimates and starts: `Pick` from each router input, so a key either procedure
 *  stops declaring fails tsc here instead of riding the payload into a strict refusal. */
export type WorkloadRunRequestScope = Pick<StartWorkloadWire, RunScopeKey> & Pick<EstimateWorkloadWire, RunScopeKey>;

/** Assemble the wire `start.input` for a kind — the params object carries only the kind's own tunable. */
export function buildStartInput(kind: WireWorkloadKind, values: WorkloadRunValues): StartWorkloadWire["input"] {
  const shape = WORKLOAD_PARAM_SHAPE_BY_KIND[kind];
  let params: Record<string, unknown> = {};
  if (shape === "force" && values.force) {
    params = { force: true };
  } else if (shape === "dryRun" && values.dryRun) {
    params = { dryRun: true };
  } else if (shape === "k" && values.k !== null) {
    params = { k: values.k };
  } else if (shape === "index") {
    params = values.force ? { source: values.source, force: true } : { source: values.source };
  } else if (shape === "rescore" && values.force) {
    // The dialog's ONE boolean slot carries whichever re-do switch the active kind has; the wire NAME is the
    // kind's own (`rescoreAll`), never the form's.
    params = { rescoreAll: true };
  } else if (shape === "assetKind") {
    params = { kind: values.assetKind };
  }
  return { kind, params };
}

/** The nullable display projection: a missing percent is indeterminate, and message/counts determine the label. */

const PERCENT_SCALE = 100;

/** The label a progress snapshot reads as. The runner writes its messages as lower-case log lines, and every surface reads them as a label. */
function progressLabel(message: string | undefined, counts: { readonly current: number; readonly total: number } | null): string | null {
  if (message !== undefined) {
    return sentenceCase(message);
  }
  return counts === null ? null : `${counts.current} of ${counts.total}`;
}

/** Derive a progress view from a workload `progress` SSE event — explicit `pct` wins, else current/total derive one, else indeterminate. */
export function toProgressView(fields: Pick<WorkloadProgress, "pct" | "current" | "total" | "message">): WorkloadProgressView {
  const { pct, current, total, message } = fields;
  const haveCounts = current !== undefined && total !== undefined;
  const derivedPct = pct ?? (haveCounts && total > 0 ? Math.round((current / total) * PERCENT_SCALE) : null);
  return { pct: derivedPct, label: progressLabel(message, haveCounts ? { current, total } : null) };
}
