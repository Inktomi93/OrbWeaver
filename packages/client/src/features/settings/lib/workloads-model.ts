// workloads-model — the Workloads pane's pure vocabulary, DOM-free. Everything derives from the
// canonical tuples in @orb/contracts/workloads, so a kind flipping stub→built needs zero client edits.

import type { IndexSource, WorkloadKind, WorkloadStatus } from "@orb/contracts/workloads";
import {
  ACTIVE_WORKLOAD_STATUSES,
  INDEX_SOURCES,
  WORKLOAD_KIND_MODES,
  WORKLOAD_KINDS,
} from "@orb/contracts/workloads";
import type { BadgeProps } from "@orb/ui/badge";
import type { SelectItems } from "@orb/ui/select";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";

/** The kinds the run dialog offers: singular-capable + built (not a stub). */
export const RUNNABLE_WORKLOAD_KINDS: readonly WorkloadKind[] = WORKLOAD_KINDS.filter(
  (kind) =>
    WORKLOAD_KIND_MODES[kind].singular &&
    !WORKLOAD_KIND_MODES[kind].stub &&
    // import-bundle is singular+built but route-started (mints its own staging token) — never a user run.
    kind !== "import-bundle",
);

/** Owner-only maintenance kinds: built, bulk-capable, not singular (a deployment-wide sweep, no per-user target). */
export const MAINTENANCE_WORKLOAD_KINDS: readonly WorkloadKind[] = WORKLOAD_KINDS.filter(
  (kind) =>
    WORKLOAD_KIND_MODES[kind].bulk &&
    !WORKLOAD_KIND_MODES[kind].singular &&
    !WORKLOAD_KIND_MODES[kind].stub,
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
  "import-st": "Import from SillyTavern",
  "import-bundle": "Import backup bundle",
  "reconcile-stats": "Reconcile stats",
  "refresh-model-catalog": "Refresh model catalog",
  "reconcile-world-state": "Reconcile world state",
  "crew-lorebook-keeper": "Crew: lorebook keeper",
  "crew-card-evolution": "Crew: card evolution",
  "crew-director": "Crew: director",
  "crew-prose-audit": "Crew: prose audit",
  "expressions-sprite-sheet": "Expressions sprite sheet",
  "databank-ingest": "Databank ingest",
  "databank-reindex": "Databank reindex",
  "rpg-world-gen": "RPG world generation",
  "rpg-recap": "RPG recap",
  "rpg-session-distill": "RPG session distill",
  "rpg-director": "RPG director",
  "rpg-lorebook-upkeep": "RPG lorebook upkeep",
  "rpg-illustration": "RPG illustration",
  "rpg-npc-portrait": "RPG NPC portrait",
  "rpg-scene-plan": "RPG scene plan",
  "rpg-scene-distill": "RPG scene distill",
  "rpg-recruit-card": "RPG recruit card",
};

const RUNNABLE_KIND_OPTIONS: SelectItems<string> = WORKLOAD_KINDS.filter((kind) =>
  (RUNNABLE_WORKLOAD_KINDS as readonly WorkloadKind[]).includes(kind),
).map((kind) => ({ value: kind as string, label: WORKLOAD_KIND_LABELS[kind] }));

const MAINTENANCE_KIND_OPTIONS: SelectItems<string> = WORKLOAD_KINDS.filter((kind) =>
  (MAINTENANCE_WORKLOAD_KINDS as readonly WorkloadKind[]).includes(kind),
).map((kind) => ({ value: kind as string, label: WORKLOAD_KIND_LABELS[kind] }));

/** The grouped (owner) kind-picker items; the maintenance group is omitted when empty. */
const OWNER_KIND_ITEMS: SelectItems<string> =
  MAINTENANCE_KIND_OPTIONS.length === 0
    ? RUNNABLE_KIND_OPTIONS
    : [
        { label: "Run on my data", items: RUNNABLE_KIND_OPTIONS },
        { label: "Maintenance (all deployments)", items: MAINTENANCE_KIND_OPTIONS },
      ];

/** The kind-picker's items for a viewer — a non-owner sees the flat runnable list, the owner sees the grouped list. */
export function workloadKindItems(viewerIsOwner: boolean): SelectItems<string> {
  return viewerIsOwner ? OWNER_KIND_ITEMS : RUNNABLE_KIND_OPTIONS;
}

/** The `index` kind's source picker (text / image / all — what to reindex). */
const INDEX_SOURCE_LABELS: Record<IndexSource, string> = {
  text: "Text — characters + chat memory",
  image: "Images — avatars",
  all: "Everything",
};
export const INDEX_SOURCE_ITEMS: SelectItems<string> = INDEX_SOURCES.map((source) => ({
  value: source as string,
  label: INDEX_SOURCE_LABELS[source],
}));

/** Status → row-badge label (exhaustive). */
export const WORKLOAD_STATUS_LABELS: Record<WorkloadStatus, string> = {
  queued: "Queued",
  running: "Running",
  cancelling: "Cancelling",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
  // biome-ignore lint/style/useNamingConvention: the key IS the canonical D34 wire status member (`worker_died`, @orb/contracts/workloads) — a camelCase respell would break the exhaustive Record.
  worker_died: "Worker died",
};

/** Status → badge intent (never color alone — the label above always rides with it). */
export const WORKLOAD_STATUS_INTENT: Record<WorkloadStatus, NonNullable<BadgeProps["intent"]>> = {
  queued: "neutral",
  running: "info",
  cancelling: "warning",
  succeeded: "success",
  failed: "danger",
  cancelled: "neutral",
  // biome-ignore lint/style/useNamingConvention: the key IS the canonical D34 wire status member (`worker_died`, @orb/contracts/workloads) — a camelCase respell would break the exhaustive Record.
  worker_died: "danger",
};

/** A status that still holds the kind's single-active slot — Cancel is offered exactly here. */
export function isActiveWorkloadStatus(status: WorkloadStatus): boolean {
  return (ACTIVE_WORKLOAD_STATUSES as readonly WorkloadStatus[]).includes(status);
}

/** A terminal-failure-ish status — Retry is offered exactly here. */
export function isRetryableWorkloadStatus(status: WorkloadStatus): boolean {
  return status === "failed" || status === "cancelled" || status === "worker_died";
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
  all: "No workloads yet. Background jobs you run appear here.",
  running: "Nothing is running right now.",
  recent: "No finished workloads yet.",
  failed: "No failed workloads. Good.",
};

const RECENT_STATUSES = ["succeeded", "cancelled"] as const satisfies readonly WorkloadStatus[];
const FAILED_STATUSES = ["failed", "worker_died"] as const satisfies readonly WorkloadStatus[];

/** Whether a row's status lands in a filter tab. */
export function workloadFilterMatches(
  filter: (typeof WORKLOAD_FILTERS)[number],
  status: WorkloadStatus,
): boolean {
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
export const WORKLOAD_PARAM_SHAPES = ["none", "force", "dryRun", "k", "managed", "index"] as const;

/** Kind → param-control shape (exhaustive). Stub kinds are `none` (real empty schemas server-side). */
export const WORKLOAD_PARAM_SHAPE_BY_KIND: Record<
  WorkloadKind,
  (typeof WORKLOAD_PARAM_SHAPES)[number]
> = {
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
  // `managed` = a server-minted param (route-started, never a picker control).
  "import-st": "dryRun",
  "import-bundle": "managed",
  "reconcile-stats": "none",
  "refresh-model-catalog": "none",
  "reconcile-world-state": "none",
  "crew-lorebook-keeper": "none",
  "crew-card-evolution": "none",
  "crew-director": "none",
  "crew-prose-audit": "none",
  "expressions-sprite-sheet": "none",
  "databank-ingest": "none",
  "databank-reindex": "none",
  "rpg-world-gen": "none",
  "rpg-recap": "none",
  "rpg-session-distill": "none",
  "rpg-director": "none",
  "rpg-lorebook-upkeep": "none",
  "rpg-illustration": "none",
  "rpg-npc-portrait": "none",
  "rpg-scene-plan": "none",
  "rpg-scene-distill": "none",
  "rpg-recruit-card": "none",
};

/** Narrow a form-string kind to a runnable (singular-capable) contract kind. */
export function isRunnableWorkloadKind(value: string): value is WorkloadKind {
  return (RUNNABLE_WORKLOAD_KINDS as readonly string[]).includes(value);
}

/** Narrow a form-string kind to any kind the dialog can start — runnable OR owner-only maintenance. */
export function isStartableWorkloadKind(value: string): value is WorkloadKind {
  return isRunnableWorkloadKind(value) || isMaintenanceWorkloadKind(value);
}

/** Whether a bulk run of this kind must designate a mint target. */
export function workloadKindNeedsBulkTarget(kind: string): boolean {
  return isRunnableWorkloadKind(kind) && WORKLOAD_KIND_MODES[kind].bulkRequiresTarget;
}

/** The run dialog's form values. `kind` is a plain string; {@link isRunnableWorkloadKind} narrows at the save seam. */
export interface RunWorkloadFormValues {
  readonly kind: string;
  /** Owner-only bulk toggle — a non-owner's dialog never renders the field, so it stays `false`. */
  readonly bulk: boolean;
  /** The bulk-create mint target (`""` = unpicked). */
  readonly targetOwnerId: string;
  readonly force: boolean;
  readonly dryRun: boolean;
  /** Cluster count for `compute-themes`; `null` = use the server default. */
  readonly k: number | null;
  /** The `index` kind's embed source. Inert for every other kind. */
  readonly source: IndexSource;
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
  runAt: "",
  dependsOn: [],
};

/** The param slots {@link buildStartInput} reads — the form values satisfy this structurally. */
export interface WorkloadRunValues {
  readonly force: boolean;
  readonly dryRun: boolean;
  readonly k: number | null;
  readonly source: IndexSource;
}

type StartWorkloadWire = inferInput<Trpc["workloads"]["start"]>;

/** Assemble the wire `start.input` for a kind — the params object carries only the kind's own tunable. */
export function buildStartInput(
  kind: WorkloadKind,
  values: WorkloadRunValues,
): StartWorkloadWire["input"] {
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
  }
  return { kind, params } as StartWorkloadWire["input"];
}

const RESULT_PREVIEW_MAX_CHARS = 120;

/** A one-line preview of a succeeded row's result blob — compact JSON, ellipsized. `null` when there is nothing worth showing. */
export function workloadResultPreview(result: unknown): string | null {
  if (result === null || result === undefined) {
    return null;
  }
  const text = JSON.stringify(result);
  if (text === undefined || text === "{}") {
    return null;
  }
  return text.length > RESULT_PREVIEW_MAX_CHARS
    ? `${text.slice(0, RESULT_PREVIEW_MAX_CHARS)}…`
    : text;
}

/** The row-local live-progress view model. `pct: null` renders the indeterminate bar. */
export interface WorkloadProgressView {
  readonly pct: number | null;
  readonly label: string | null;
}

const PERCENT_SCALE = 100;

/** Derive a progress view from a workload `progress` SSE event — explicit `pct` wins, else current/total derive one, else indeterminate. */
export function toProgressView(fields: {
  readonly pct?: number;
  readonly current?: number;
  readonly total?: number;
  readonly message?: string;
}): WorkloadProgressView {
  const { pct, current, total, message } = fields;
  const haveCounts = current !== undefined && total !== undefined;
  const derivedPct =
    pct ?? (haveCounts && total > 0 ? Math.round((current / total) * PERCENT_SCALE) : null);
  const label = message ?? (haveCounts ? `${current} of ${total}` : null);
  return { pct: derivedPct, label };
}
