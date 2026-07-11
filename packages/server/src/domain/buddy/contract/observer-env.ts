// domain/buddy/contract/observer-env — the observer reaction engine's CROSS-FEATURE seam (PD-45/PD-64).
// Mirrors `contract/agent-env.ts`: `domain/buddy` must NOT import `domain/workloads`/`domain/chat`/the
// observability ring (`domain-no-cross-feature`), so the composition root (`entry/`) assembles this typed
// bundle from the real event sources and injects it into `startBuddyObserver`. Uses only LOCAL/kit types +
// the domain's own signal/bus vocab — the event shapes are LITE (no cross-feature type import), so the
// coupling stays type-thin. The bus OUTPUT vocab (`BuddyBusEvent`) is homed here too — it is the observer's
// spoken product (the SSE payload the `buddy.stream` subscription fans + a client will consume).

import type { Mood, Stage } from "@orb/contracts/buddy";
import type { RoleClients } from "@orb/contracts/role-clients";
import type { Db } from "@orb/db";
import type { BuddyQuipId, UserId } from "@orb/kit/ids";
import type { BuddySignalKind } from "./signals";

// ── The LITE input event shapes (produced by the entry adapter from the real buses/ring) ──────────────

/** A workload lifecycle beat the observer reacts to — the three phases that map to `workload:*` signals
 *  (`progress`/`status`/`cancelled` are dropped by the adapter). `workloadId` resolves the owner (whose
 *  buddy reacts) via the observer's own db-reads; `at` is the injected-clock stamp (the source's event
 *  time). LITE: no `WorkloadEvent`/`WorkloadKind` import (the type-thin seam). */
export interface LiteWorkloadEvent {
  readonly workloadId: string;
  readonly phase: "started" | "completed" | "failed";
  readonly at: number;
}

/** A chat turn beat the observer reacts to — mapped from the chat bus to the three `chat:*` signals.
 *  `chatId` resolves the host (whose buddy reacts) via the observer's db-reads. `actingUserId` is the
 *  principal that DROVE the turn — the belt input (agent-principal-design/04 §6: a seated buddy must not
 *  quip-react to its OWN room event). `null` until the seat wave carries turn identity onto this seam (the
 *  public `ChatBusEvent` deliberately omits it, D19), so the belt is inert at runtime but lands + is tested
 *  now. LITE: no `ChatBusEvent`/`ChatId` import. */
export interface LiteChatEvent {
  readonly chatId: string;
  readonly kind: "first-message" | "turn-completed" | "turn-aborted";
  readonly actingUserId: UserId | null;
  readonly at: number;
}

/** One request trace the 30s sampler scans — the observability ring projected to the fields the sampler
 *  needs (slow-turn = a long provider span; error-spike = a run of `error` status). LITE: no `RequestTrace`
 *  import (foundation's shape stays foundation-internal; the entry adapter narrows it). */
export interface LiteTrace {
  readonly requestId: string;
  readonly status: "ok" | "error";
  readonly providerDurationMs: number;
  readonly startedAt: number;
}

// ── The bus OUTPUT vocab — the observer's spoken product (SSE) ─────────────────────────────────────────

/** The per-user live reaction feed the `buddy.stream` subscription fans (over the kit replay buffer +
 *  late-subscriber replay). A CLOSED union of branded ids / enum literals / plain scalars — no `unknown`/
 *  `Record` field (the bus-payload allowlist discipline; a quip's text is model/canned output, never a
 *  secret). Every arm carries `userId` (the channel key) + `at` (the injected-clock stamp). */
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

/** The per-user reaction bus (ONE per process, built at the composition root over `@orb/kit/replay-buffer`).
 *  `emit` is the observer's write; `subscribe`/`snapshot` are the transport `buddy.stream` reads (the
 *  late-subscriber ramp: snapshot the retained window, then tail live). */
export interface BuddyBus {
  /** Record + fan one event to its user's channel (pushes into the replay ring first). */
  readonly emit: (event: BuddyBusEvent) => void;
  /** The user's live feed, torn down on `signal` abort (SSE disconnect) — no cross-reconnect leak. */
  readonly subscribe: (userId: UserId, signal: AbortSignal) => AsyncIterable<BuddyBusEvent>;
  /** The still-live retained events for a user (the reconnect/first-subscribe ramp-up). */
  readonly snapshot: (userId: UserId) => BuddyBusEvent[];
}

// ── The observer's narrow schema-level reads (impl: observer/db-reads.ts) ─────────────────────────────

/** The observer's owner/host reads over OTHER domains' NON-identity tables (one FK/junction hop each — NOT
 *  cross-feature service calls; `observer/db-reads.ts`). "Whose buddy reacts". The belt's agent-owner hop is
 *  NOT here — it reads `users` (the no-direct-users-read chokepoint), so it is an INJECTED env op wired at
 *  the entry root (the sanctioned users reader), {@link BuddyObserverEnv.resolveAgentOwner}. */
export interface BuddyObserverReads {
  /** The owner whose buddy reacts to a workload beat, or null (a system/scheduler row with no owner). */
  readonly resolveWorkloadOwner: (workloadId: string) => Promise<UserId | null>;
  /** The present HOST of a chat (whose buddy reacts to its turns), or null (hostless/gone room). */
  readonly resolveChatHost: (chatId: string) => Promise<UserId | null>;
}

// ── The injected event-source seams (subscribe → unsubscribe) ─────────────────────────────────────────

/** Subscribe to the live workload beats; returns the unsubscribe. Wired at `entry/` over the workloads
 *  progress-bus (adapted to {@link LiteWorkloadEvent}). */
export type SubscribeWorkloadEvents = (listener: (event: LiteWorkloadEvent) => void) => () => void;

/** Subscribe to the live chat turn beats; returns the unsubscribe. Wired at `entry/` over the chat bus
 *  (adapted to {@link LiteChatEvent}). */
export type SubscribeChatEvents = (listener: (event: LiteChatEvent) => void) => () => void;

// ── The observer DI bundle (assembled at `entry/`, handed to `startBuddyObserver`) ────────────────────

/**
 * The environment the observer subsystem closes over — the db (its own tables + the narrow schema-level
 * owner/host reads), the determinism seam (`now`/`newQuipId`), the two live event sources, the
 * observability-ring reader (the sampler poll), the vLLM `summarize` (quip generation; canned fallback on
 * breaker-open), the reaction bus emit, and the injected interval timer (no ambient `setInterval` — the
 * sampler/presence sweeps are deterministically testable). `ownerUserId` is whose buddy reacts to
 * SYSTEM-health traces (the operator's companion — traces are request-scoped, not user-attributed).
 */
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
  /** THE BELT (agent-principal-design/04 §6): if `userId` is an AGENT principal, its owner; else null. An
   *  INJECTED op (reads `users`, the no-direct-users-read chokepoint — wired at the entry root). The router
   *  drops an event whose `actingUserId` resolves to the reacting owner's OWN agent. */
  readonly resolveAgentOwner: (userId: UserId) => Promise<UserId | null>;
  /** Arm a repeating timer; returns its clearer. Injected so the sweeps take no ambient `setInterval`. */
  readonly scheduleInterval: (fn: () => void, ms: number) => () => void;
}

/** The observer handle the lifecycle drives — `stop()` is idempotent (SIGTERM teardown). */
export interface BuddyObserverHandle {
  readonly stop: () => void;
}
