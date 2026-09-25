// domain/share — the typed surface. The owner starts, stops and reads one relay (a quick tunnel) that makes this box
// reachable from the internet; the relay controller owns the process and the relay host it admits.

import type { AuthMode, RelayStatus, ShareRefusal, ShareRelayKind, ShareStatus } from "@orb/contracts/identity";
import type { RequireOwner } from "#domain/admin";
import type { AuditEntry } from "#foundation/observability";
import type { RelayHostWriter } from "#infra/auth";
import type { RelayLauncher } from "#infra/relay";
import type { ShareParams } from "./params.ts";

/** The one relay this process runs. It admits the relay's host the moment the relay reports its URL and drops it when
 *  the relay stops or dies; a death restarts it on a bounded schedule. Nothing here is persisted: a restart ends it. */
export interface RelayController {
  /** Starts a relay unless one is starting or up, and resolves once it is spawned; the URL arrives later as `up`.
   *  @throws a `DomainOperationError` with a `RELAY_BINARY_REFUSALS` code when the binary is refused; nothing ran. */
  readonly start: () => Promise<RelayStatus>;
  /** Ends the relay, cancels any restart and drops its host. Never throws. */
  readonly stop: () => void;
  readonly status: () => RelayStatus;
}

/** The controller's seams, wired at the composition root (`entry/lifecycle.ts`). */
export interface RelayControllerDeps {
  readonly relay: ShareRelayKind;
  readonly launcher: RelayLauncher;
  /** The relay host registry's write side (`infra/auth`); this controller is its only writer. */
  readonly hosts: RelayHostWriter;
  /** The loopback URL of this server's own listener, which the relay forwards to. */
  readonly origin: () => string;
  readonly now: () => number;
  /** Runs `run` once after `ms`; the returned function cancels it. */
  readonly schedule: (run: () => void, ms: number) => () => void;
}

/** The facts a share's preconditions read. */
export interface ShareFacts {
  readonly authMode: AuthMode;
  readonly inContainer: boolean;
  /** Read only under `local`, the one mode with a first-run owner claim. */
  readonly ownerNeedsPassword: () => Promise<boolean>;
  /** Where the owner finishes setup: this machine's own origin. */
  readonly localSetupUrl: () => string;
}

/** Why a share may not start, with the sentence that names its fix. */
export interface ShareRefusalNotice {
  readonly code: ShareRefusal;
  readonly message: string;
}

/** What a boot-time or post-claim start did, for the lifecycle's log line. */
export type ShareBootOutcome =
  | { readonly kind: "started"; readonly relay: RelayStatus }
  | { readonly kind: "refused"; readonly refusal: ShareRefusalNotice }
  | { readonly kind: "failed"; readonly code: string; readonly message: string }
  | { readonly kind: "not_waiting" };

/** What the composition root hands the share service. */
export interface ShareServiceDeps extends ShareFacts {
  readonly relay: RelayController;
  readonly requireOwner: RequireOwner;
  /** Every live stream socket on the box, so the card shows who is connected. */
  readonly liveSocketCount: () => number;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  readonly now: () => number;
}

/** The DI bundle the verbs close over: the deps plus the one precondition check every start runs. */
export interface ShareContext extends ShareServiceDeps {
  readonly refusal: () => Promise<ShareRefusalNotice | null>;
}

/** The share surface. `start`, `stop` and `status` are owner-only at the verb; the two boot ops have no caller, because
 *  the launcher's `SHARE_RELAY` asked for the relay before any request, and they run the same preconditions. */
export interface ShareService {
  readonly start: (params: ShareParams) => Promise<ShareStatus>;
  readonly stop: (params: ShareParams) => Promise<ShareStatus>;
  readonly status: (params: ShareParams) => Promise<ShareStatus>;
  /** The `SHARE_RELAY` boot start. A refusal for an unclaimed owner is remembered for {@link ShareService.resumeAfterOwnerClaim}. */
  readonly startAtBoot: () => Promise<ShareBootOutcome>;
  /** Called after the first-run claim sets the owner password: starts the relay the boot start was waiting to start. */
  readonly resumeAfterOwnerClaim: () => Promise<ShareBootOutcome>;
}
