// The embedder-change rebuild as the client speaks of it: the confirm's words before a change that rebuilds the
// search index, and the vector role row's rebuild line after. Pure and barrel-free, because node-side CT specs import it.

import type { EmbedTargetRefusal, RoutableTask } from "@orb/contracts/inference";
import { CONNECTION_OP_CODES } from "@orb/contracts/inference";
import type { WorkloadKind, WorkloadStatus } from "@orb/contracts/workloads";
import { ACTIVE_WORKLOAD_STATUSES } from "@orb/contracts/workloads";
import { groupThousands } from "@orb/kit/strings";
import { trpcErrorDetailNumber, trpcErrorReason } from "./trpc-error-reason.ts";

/** The roles whose binding defines the owner's vector space; re-pointing the user's own one can rebuild the index. */
export const VECTOR_ROLES: readonly RoutableTask[] = ["embed", "imageEmbed"];

/** What the server says a pending embedder change would rebuild (`connection.embedSpaceChangePreview`). */
export interface ReindexPreview {
  readonly reindex: boolean;
  readonly stored: { readonly cards: number; readonly memory: number; readonly documents: number; readonly images: number };
  readonly embedCalls: number;
  /** Whether a Utility model is bound: the switch deletes the chat digests, and memory re-summarizes through it. */
  readonly utilityModelSet: boolean;
}

/** The embedder-change confirm's fixed words. */
export const REINDEX_CONFIRM_COPY = {
  title: "Rebuild your search index?",
  confirmLabel: "Rebuild index",
  unknown: "This change deletes your search index and rebuilds it.",
  pause: {
    search: "Search pauses until the rebuild finishes.",
    pictures: "Picture search pauses until the rebuild finishes.",
    memory: "Memory recall pauses until the rebuild finishes.",
  },
  resummarize: "Rebuilding chat memory re-summarizes your chats with the Utility model.",
  noUtility: "Chat memory can't rebuild until a Utility model is set.",
} as const;

/** What one stored vector of each scope is, in the user's words. */
const REINDEX_SCOPE_NOUNS = {
  cards: "cards",
  memory: "chat memory entries",
  documents: "databank passages",
  images: "pictures",
} as const satisfies Record<keyof ReindexPreview["stored"], string>;

/** Ask first only when the change moves to a new embedding generation AND that index holds something:
 *  rebuilding an empty index costs nothing the user could want to weigh. */
export function reindexNeedsConfirm(preview: ReindexPreview): boolean {
  return preview.reindex && preview.embedCalls > 0;
}

/** What pauses, named from the scopes the rebuild actually covers: text search, picture search alone, memory. */
function pauseSentences(stored: ReindexPreview["stored"]): readonly string[] {
  const sentences: string[] = [];
  if (stored.cards > 0 || stored.documents > 0) {
    sentences.push(REINDEX_CONFIRM_COPY.pause.search);
  } else if (stored.images > 0) {
    sentences.push(REINDEX_CONFIRM_COPY.pause.pictures);
  }
  if (stored.memory > 0) {
    sentences.push(REINDEX_CONFIRM_COPY.pause.memory);
  }
  return sentences;
}

/** The confirm's consequence. `null` = the preview could not be read, so the counts are unknown and the
 *  description says only what the change does. */
export function reindexConfirmDescription(preview: ReindexPreview | null): string {
  if (preview === null) {
    return `${REINDEX_CONFIRM_COPY.unknown} ${REINDEX_CONFIRM_COPY.pause.search}`;
  }
  const parts = (Object.keys(REINDEX_SCOPE_NOUNS) as (keyof ReindexPreview["stored"])[])
    .filter((scope) => preview.stored[scope] > 0)
    .map((scope) => `${groupThousands(preview.stored[scope])} ${REINDEX_SCOPE_NOUNS[scope]}`);
  const memory = preview.stored.memory > 0 ? [preview.utilityModelSet ? REINDEX_CONFIRM_COPY.resummarize : REINDEX_CONFIRM_COPY.noUtility] : [];
  return [
    `This change deletes your search index (${parts.join(", ")}) and rebuilds it.`,
    ...pauseSentences(preview.stored),
    ...memory,
    `Rebuilding ${groupThousands(preview.embedCalls)} items runs in the background — follow it under Settings → Jobs.`,
  ].join(" ");
}

/** Why the server undid an embedder write before anything moved, or `null` when it failed for another reason. */
export function embedRefusalOf(error: unknown): EmbedTargetRefusal | null {
  const reason = trpcErrorReason(error);
  if (reason === CONNECTION_OP_CODES.embedUnreachable) {
    return { kind: "unreachable" };
  }
  if (reason !== CONNECTION_OP_CODES.embedWidthUnmakeable) {
    return null;
  }
  const stated = trpcErrorDetailNumber(error, "stated");
  const measured = trpcErrorDetailNumber(error, "measured");
  return stated === null || measured === null ? null : { kind: "width", stated, measured };
}

/** The `data-refusal` a refusal line carries, per refusal kind. */
export const EMBED_REFUSAL_SLOTS = { width: "embed-width", unreachable: "embed-unreachable" } as const satisfies Record<EmbedTargetRefusal["kind"], string>;

/** Why an embedder write was refused, and what to do next. */
export function embedRefusalText(refusal: EmbedTargetRefusal): string {
  if (refusal.kind === "unreachable") {
    return "Couldn't reach this embedder to check its vector width, so nothing changed. Try again.";
  }
  const made = groupThousands(refusal.measured);
  return `This model makes ${made}-wide vectors, not ${groupThousands(refusal.stated)}, so nothing changed. Set its vector width under Advanced to ${made}.`;
}

/** The same refusal said on the editor row whose change it refused. The rollback already put the row back, so it says
 *  what was kept rather than what to set. */
export function embedRefusalRowText(refusal: EmbedTargetRefusal): string {
  if (refusal.kind === "unreachable") {
    return "Kept as it was: couldn't reach this embedder to check its vector width. Try again.";
  }
  return `Kept as it was: this model makes ${groupThousands(refusal.measured)}-wide vectors, not ${groupThousands(refusal.stated)}.`;
}

/** The vector role row's rebuild line while an embedder change re-indexes, and after one failed. */
export const REBUILD_STATUS_COPY = {
  running: "Re-indexing — search paused.",
  failed: "Rebuild failed — search is paused until a retry finishes.",
} as const;

/** The control beside a rebuild line or a paused search that opens the rebuild's jobs. */
export const REBUILD_JOBS_LABEL = "See Jobs";

/** What a search surface says while the owner's index is moving: for the rebuild running, failed, or no rebuild found. */
export const SEARCH_PAUSED_COPY = {
  running: "Search is paused while your index rebuilds.",
  failed: "The last rebuild failed, so search is paused. Retry it under Jobs.",
  unknown: "Search is paused until your index is rebuilt.",
  textInstead: "Search card text instead",
} as const;
type RebuildState = keyof typeof REBUILD_STATUS_COPY;

/** The fields of a `workloads.list` row the rebuild state reads. */
interface RebuildRow {
  readonly kind: string;
  readonly status: WorkloadStatus;
  readonly ownerId: string | null;
  readonly createdAt: number;
  readonly params: unknown;
}

/** The workload kinds an embedder change queues, one per scope search waits on: cards and pictures, documents, memory. */
export const EMBEDDER_REBUILD_KINDS = ["index", "databank-reindex", "memory-backfill"] as const satisfies readonly WorkloadKind[];

function isEmbedderRebuild(row: RebuildRow): boolean {
  const { params } = row;
  return (
    EMBEDDER_REBUILD_KINDS.some((kind) => kind === row.kind) &&
    typeof params === "object" &&
    params !== null &&
    "embedderChanged" in params &&
    params.embedderChanged === true
  );
}

/**
 * The viewer's embedder rebuild (their own, or a box-wide sweep), shown only while their search is paused for it:
 * running while the newest rebuild of any kind is active, failed when one of them failed, else nothing.
 *
 * @remarks The space status decides first: once search answers, an older failed row is history, not the state. A move
 * whose memory is off queues no memory rebuild, so a failed memory row can outlive the rebuild that superseded it.
 */
export function embedderRebuildState(
  rows: readonly RebuildRow[],
  viewerId: string | null,
  space: { readonly paused: boolean } | undefined,
): RebuildState | null {
  if (space?.paused !== true) {
    return null;
  }
  const newestByKind = new Map<string, RebuildRow>();
  for (const row of rows.filter((candidate) => isEmbedderRebuild(candidate) && (candidate.ownerId === null || candidate.ownerId === viewerId))) {
    const newest = newestByKind.get(row.kind);
    if (newest === undefined || row.createdAt > newest.createdAt) {
      newestByKind.set(row.kind, row);
    }
  }
  const newest = [...newestByKind.values()];
  if (newest.some((row) => ACTIVE_WORKLOAD_STATUSES.some((status) => status === row.status))) {
    return "running";
  }
  return newest.some((row) => row.status === "failed" || row.status === "worker_died") ? "failed" : null;
}
