// workloads-model — the Workloads pane's pure vocabulary (Settings → Workloads; the per-user surface
// over `workloads.list/start/cancel/retry/subscribe`). DOM-free (node-testable). Everything derives
// from the D34 canonical tuples in `@orb/contracts/workloads` — the picker is DRIVEN OFF the contract
// (`WORKLOAD_KIND_MODES`), never a hand-copied kind list, so a kind flipping stub→built (its policy
// gaining `singular: true`) appears here with ZERO client edits. The label/param maps are exhaustive
// `Record<WorkloadKind, …>`s (§5.5) — a new kind fails `tsc` here until it says what the row reads.

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

/** The kinds the run dialog OFFERS: singular-capable + BUILT (not a stub) per the contract's mode-policy
 *  map. Runnable BY CONSTRUCTION — a kind flipping stub→built or gaining a singular mode appears here with
 *  ZERO client edits. The `singular`/`stub` flags are the ONE home (`@orb/contracts/workloads`); the client
 *  keeps NO parallel list. */
export const RUNNABLE_WORKLOAD_KINDS: readonly WorkloadKind[] = WORKLOAD_KINDS.filter(
  (kind) =>
    WORKLOAD_KIND_MODES[kind].singular &&
    !WORKLOAD_KIND_MODES[kind].stub &&
    // `import-bundle` is singular + built, but ROUTE-started: the `POST /api/import/bundle` upload route mints
    // its staging-token param (the picker can't supply that token), so it is never offered as a user run.
    kind !== "import-bundle",
);

/** The OWNER-only maintenance kinds: BUILT (`stub:false`), bulk-CAPABLE but NOT singular — a deployment-wide
 *  pass with no per-owner singular mode (today `refresh-model-catalog` + `compute-cooccurrence`). Runs
 *  `mode:"bulk"` by force (no singular mode to toggle) and carries NO `targetOwnerId` (a global/all-owners
 *  sweep, not a mint-into-a-user). Contract-derived off the `stub` flag — a future built bulk-only kind
 *  appears here automatically the moment its `stub` flips false; an unbuilt stub is excluded by the SAME
 *  flag (no client denylist). A non-owner NEVER sees these. */
export const MAINTENANCE_WORKLOAD_KINDS: readonly WorkloadKind[] = WORKLOAD_KINDS.filter(
  (kind) =>
    WORKLOAD_KIND_MODES[kind].bulk &&
    !WORKLOAD_KIND_MODES[kind].singular &&
    !WORKLOAD_KIND_MODES[kind].stub,
);

/** Whether a kind is an owner-only maintenance (bulk-only built) kind — forces `mode:"bulk"`, no target. */
export function isMaintenanceWorkloadKind(value: string): boolean {
  return (MAINTENANCE_WORKLOAD_KINDS as readonly string[]).includes(value);
}

/** Kind → human label (exhaustive — a new contract kind fails `tsc` until it gets a label). The stub
 *  kinds keep labels too: the LIST can show any kind's row (an owner's bulk stub run), only the PICKER
 *  is restricted to {@link RUNNABLE_WORKLOAD_KINDS}. */
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

/** The GROUPED (owner) kind-picker items — "Run on my data" + "Maintenance (all deployments)", the
 *  latter omitted when there are no built bulk-only kinds (an owner never sees an empty group). */
const OWNER_KIND_ITEMS: SelectItems<string> =
  MAINTENANCE_KIND_OPTIONS.length === 0
    ? RUNNABLE_KIND_OPTIONS
    : [
        { label: "Run on my data", items: RUNNABLE_KIND_OPTIONS },
        { label: "Maintenance (all deployments)", items: MAINTENANCE_KIND_OPTIONS },
      ];

/** The kind-picker's items for a viewer — the run and schedule dialogs share this: a non-owner sees
 *  the flat runnable list, the owner sees the grouped list adding the maintenance kinds (§C4 — was
 *  hand-duplicated in both dialogs). */
export function workloadKindItems(viewerIsOwner: boolean): SelectItems<string> {
  return viewerIsOwner ? OWNER_KIND_ITEMS : RUNNABLE_KIND_OPTIONS;
}

/** The `index` kind's source picker (text / image / all — what to reindex). */
export const INDEX_SOURCE_LABELS: Record<IndexSource, string> = {
  text: "Text — characters + chat memory",
  image: "Images — avatars",
  all: "Everything",
};
export const INDEX_SOURCE_ITEMS: SelectItems<string> = INDEX_SOURCES.map((source) => ({
  value: source as string,
  label: INDEX_SOURCE_LABELS[source],
}));

/** Status → row-badge label (exhaustive over the D34 status tuple). */
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

/** A status that still holds the kind's single-active slot — Cancel is offered exactly here. Derived
 *  from the contract's `ACTIVE_WORKLOAD_STATUSES` (the same predicate the db lock index keys on). */
export function isActiveWorkloadStatus(status: WorkloadStatus): boolean {
  return (ACTIVE_WORKLOAD_STATUSES as readonly WorkloadStatus[]).includes(status);
}

/** A terminal-failure-ish status — Retry is offered exactly here (`retry` clones ANY visible row, but
 *  offering it on success/active rows would be noise; worker_died is a failure the reaper stamped). */
export function isRetryableWorkloadStatus(status: WorkloadStatus): boolean {
  return status === "failed" || status === "cancelled" || status === "worker_died";
}

// ── The client-side filter tabs (All / Running / Recent / Failed) ────────────────────────────────────

/** The filter-tab axis, in render order. The union derives inline (`(typeof …)[number]`) — the
 *  rail-slots/settings-nav-model pattern (tuple exported, alias never). */
export const WORKLOAD_FILTERS = ["all", "running", "recent", "failed"] as const;

export const WORKLOAD_FILTER_LABELS: Record<(typeof WORKLOAD_FILTERS)[number], string> = {
  all: "All",
  running: "Running",
  recent: "Recent",
  failed: "Failed",
};

/** Per-filter empty copy — distinct per tab (the J10 honesty discipline; §4.3 rule 8). */
export const WORKLOAD_FILTER_EMPTY_COPY: Record<(typeof WORKLOAD_FILTERS)[number], string> = {
  all: "No workloads yet. Background jobs you run appear here.",
  running: "Nothing is running right now.",
  recent: "No finished workloads yet.",
  failed: "No failed workloads. Good.",
};

// The terminal buckets the Recent/Failed tabs key on — SUBSETS of the canonical status tuple,
// `satisfies`-pinned so a renamed status fails `tsc` here (the ACTIVE_WORKLOAD_STATUSES pattern).
const RECENT_STATUSES = ["succeeded", "cancelled"] as const satisfies readonly WorkloadStatus[];
const FAILED_STATUSES = ["failed", "worker_died"] as const satisfies readonly WorkloadStatus[];

/** Whether a row's status lands in a filter tab. `all` admits everything; `running` = the active
 *  (slot-holding) statuses; `recent` = clean terminals; `failed` = failure terminals. */
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

// ── The run dialog's param vocabulary ─────────────────────────────────────────────────────────────────

/** The per-kind param CONTROL shape axis (mirrors the server's `PARAMS_SCHEMAS` families — the schemas
 *  themselves live in `domain/workloads/contract` and cannot flow down the cake, so the client names
 *  the FAMILY, not the schema; the server re-parses every start as defense in depth). */
export const WORKLOAD_PARAM_SHAPES = ["none", "force", "dryRun", "k", "managed", "index"] as const;

/** Kind → param-control shape (exhaustive — a new kind fails `tsc` until it declares its controls).
 *  Stub kinds are `none` (real empty schemas server-side). */
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
  // `managed` = a server-minted param (the route's staging token); never a picker control (import-bundle is
  // ROUTE-started, excluded from RUNNABLE_WORKLOAD_KINDS).
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

/** Narrow a form-string kind to a RUNNABLE (singular-capable) contract kind. */
export function isRunnableWorkloadKind(value: string): value is WorkloadKind {
  return (RUNNABLE_WORKLOAD_KINDS as readonly string[]).includes(value);
}

/** Narrow a form-string kind to ANY kind the dialog can START — a singular-capable kind OR an
 *  owner-only maintenance kind (the picker's items derive from these two lists, so this only rejects a
 *  value that never came from the picker). */
export function isStartableWorkloadKind(value: string): value is WorkloadKind {
  return isRunnableWorkloadKind(value) || isMaintenanceWorkloadKind(value);
}

/** Whether a BULK run of this kind must designate a mint target (`bulkRequiresTarget` — the
 *  create-kinds, e.g. import-st). String-tolerant: the form stores `kind` as a plain string. */
export function workloadKindNeedsBulkTarget(kind: string): boolean {
  return isRunnableWorkloadKind(kind) && WORKLOAD_KIND_MODES[kind].bulkRequiresTarget;
}

/** The run dialog's form values (§13.4 — a ≥3-field form rides `createSavedEntityForm`). `kind` is a
 *  plain string (the bound SelectField is string-valued); {@link isRunnableWorkloadKind} narrows at
 *  the save seam. Only the ACTIVE kind's param slot is read by {@link buildStartInput}, so stale
 *  values from a previous kind pick are inert. */
export interface RunWorkloadFormValues {
  readonly kind: string;
  /** Owner-only bulk toggle — a non-owner's dialog never renders the field, so it stays `false`. */
  readonly bulk: boolean;
  /** The bulk-create mint target (`""` = unpicked; validated required when the kind needs one). */
  readonly targetOwnerId: string;
  readonly force: boolean;
  readonly dryRun: boolean;
  /** Cluster count for `compute-themes`; `null` = "use the server default" (the tunable is optional). */
  readonly k: number | null;
  /** The `index` kind's embed SOURCE — `text` (corpus) / `image` (assets) / `all` (everything). Inert for
   *  every other kind (only the `index` param shape reads it). Defaults to `all` (reindex everything). */
  readonly source: IndexSource;
  /** Optional deferred-start datetime (a `datetime-local` string; `""` = run now). Parsed to an epoch-ms
   *  `scheduledAt` at the save seam ({@link parseRunAt}) — the run-once-at-time-T primitive. */
  readonly runAt: string;
  /** The DAG gate — the workload ids this run must wait on (dispatched only once EVERY dep `succeeded`;
   *  if any dep hits a non-success terminal the run fails `dependency_failed`, never running). `[]` = no gate. */
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

/** Assemble the wire `start.input` for a kind: the params object carries ONLY the kind's own tunable
 *  (and omits it entirely at its default — tunables are optional; precedence resolves in the runner). */
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
    // `source` is REQUIRED (it selects the pass AND stamps the single-active lock); `force` rides only when set.
    params = values.force ? { source: values.source, force: true } : { source: values.source };
  }
  // The wire input is a per-kind discriminated union; a runtime-indexed `{kind, params}` pair can't be
  // correlated by tsc, but the pair IS correct by construction (params built from the kind's own shape
  // entry) and the start verb re-parses params against the kind's schema regardless (defense in depth).
  return { kind, params } as StartWorkloadWire["input"];
}

// ── Row detail helpers ────────────────────────────────────────────────────────────────────────────────

const RESULT_PREVIEW_MAX_CHARS = 120;

/** A one-line preview of a succeeded row's result blob — compact JSON, ellipsized. `null` when there
 *  is nothing worth showing (no result, or an empty object). */
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

/** The row-local live-progress view model (fed by `use-workload-stream`, buffered in row state —
 *  the §11.1 discipline: transient progress never touches the query cache). `pct: null` renders the
 *  indeterminate bar. */
export interface WorkloadProgressView {
  readonly pct: number | null;
  readonly label: string | null;
}

const PERCENT_SCALE = 100;

/** The raw progress fields a workload `progress` SSE event carries — an explicit `pct` wins, else
 *  `current`/`total` derive one, else indeterminate (`pct: null`). The ONE derivation (C14 — was
 *  hand-duplicated between `use-workload-stream.ts` and `bundle-workload-tracker.tsx`). */
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
