// The embedder-change rebuild as the client speaks of it: the confirm's words before a change that rebuilds the
// search index, and the vector role row's rebuild line after. Pure and barrel-free, because node-side CT specs import it.

import type { RoutableTask } from "@orb/contracts/inference";
import type { WorkloadKind, WorkloadStatus } from "@orb/contracts/workloads";
import { ACTIVE_WORKLOAD_STATUSES } from "@orb/contracts/workloads";
import { groupThousands } from "@orb/kit/strings";

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

/** The vector role row's rebuild line while an embedder change re-indexes, and after one failed. */
export const REBUILD_STATUS_COPY = {
  running: "Re-indexing — search paused",
  failed: "Rebuild failed — see Jobs",
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
