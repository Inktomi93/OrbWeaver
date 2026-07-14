// domain/buddy/contract/observer-env — the observer reaction engine's cross-feature seam. buddy must not
// import domain/workloads/chat/the observability ring, so the entry root assembles this typed bundle from
// the real event sources. Event shapes here are LITE (no cross-feature type import) to keep coupling thin.

import type { Mood, Stage } from "@orb/contracts/buddy";
import type { RoleClients } from "@orb/contracts/role-clients";
import type { Db } from "@orb/db";
import type { BuddyQuipId, UserId } from "@orb/kit/ids";
import type { BuddySignalKind } from "./signals";

/** Workload lifecycle beat the observer reacts to; workloadId resolves the owner via the observer's own reads. */
export interface LiteWorkloadEvent {
  readonly workloadId: string;
  readonly phase: "started" | "completed" | "failed";
  readonly at: number;
}

/** Chat turn beat; actingUserId is the belt input so a seated buddy doesn't quip-react to its own event.
 *  null until the seat wave carries turn identity onto this seam. */
export interface LiteChatEvent {
  readonly chatId: string;
  readonly kind: "first-message" | "turn-completed" | "turn-aborted";
  readonly actingUserId: UserId | null;
  readonly at: number;
}

/** One request trace the 30s sampler scans, projected to the fields it needs. */
export interface LiteTrace {
  readonly requestId: string;
  readonly status: "ok" | "error";
  readonly providerDurationMs: number;
  readonly startedAt: number;
}

/** Per-user live reaction feed the buddy.stream subscription fans. Closed union — no unknown/Record field. */
export type BuddyBusEvent =
  | {
      readonly type: "quip";
      readonly userId: UserId;
      readonly quipId: BuddyQuipId;
      readonly text: string;
      readonly mood: Mood;
      readonly signalKind: BuddySignalKind;
      readonly fromCanned: boolean;
      readonly at: number;
    }
  | {
      readonly type: "moodChanged";
      readonly userId: UserId;
      readonly mood: Mood;
      readonly at: number;
    }
  | {
      readonly type: "evolved";
      readonly userId: UserId;
      readonly stage: Stage;
      readonly formTitle: string;
      readonly at: number;
    };

/** Per-user reaction bus (one per process). emit is the observer's write; subscribe/snapshot are transport reads. */
export interface BuddyBus {
  readonly emit: (event: BuddyBusEvent) => void;
  /** Torn down on signal abort (SSE disconnect) — no cross-reconnect leak. */
  readonly subscribe: (userId: UserId, signal: AbortSignal) => AsyncIterable<BuddyBusEvent>;
  readonly snapshot: (userId: UserId) => BuddyBusEvent[];
}

/** Observer's owner/host reads over other domains' non-identity tables (one FK/junction hop each). */
export interface BuddyObserverReads {
  readonly resolveWorkloadOwner: (workloadId: string) => Promise<UserId | null>;
  readonly resolveChatHost: (chatId: string) => Promise<UserId | null>;
}

type SubscribeWorkloadEvents = (listener: (event: LiteWorkloadEvent) => void) => () => void;
type SubscribeChatEvents = (listener: (event: LiteChatEvent) => void) => () => void;

/** Environment the observer subsystem closes over. ownerUserId is whose buddy reacts to system-health traces. */
export interface BuddyObserverEnv {
  readonly db: Db;
  readonly now: () => number;
  readonly newQuipId: () => BuddyQuipId;
  readonly ownerUserId: UserId;
  readonly onWorkloadEvent: SubscribeWorkloadEvents;
  readonly onChatEvent: SubscribeChatEvents;
  readonly readRecentTraces: () => readonly LiteTrace[];
  readonly summarize: RoleClients["summarize"];
  readonly emit: BuddyBus["emit"];
  /** If userId is an agent principal, its owner; else null. Drops events from the reacting owner's own agent. */
  readonly resolveAgentOwner: (userId: UserId) => Promise<UserId | null>;
  readonly scheduleInterval: (fn: () => void, ms: number) => () => void;
}

/** stop() is idempotent (SIGTERM teardown). */
export interface BuddyObserverHandle {
  readonly stop: () => void;
}
