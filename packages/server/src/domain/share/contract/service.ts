// domain/share — the typed surface. The owner starts, stops and reads one relay (a quick tunnel) that makes this box
// reachable from the internet; the relay controller owns the process and the relay host it admits.

import type {
  AuthMode,
  IpCertificateRefusal,
  IpCertificateSetting,
  IpCertificateStatus,
  Principal,
  RelayStatus,
  ShareRefusalNotice,
  ShareRelayKind,
  ShareStatus,
} from "@orb/contracts/identity";
import type { UserId } from "@orb/kit/ids";
import type { RequireOwner } from "#domain/admin";
import type { AuditEntry } from "#foundation/observability";
import type { AcmeIssuer, CertificateStore } from "#infra/acme";
import type { RelayHostWriter } from "#infra/auth";
import type { TlsTerminator, TlsTerminatorOptions } from "#infra/network";
import type { RelayLauncher } from "#infra/relay";
import type { EnableIpCertificateParams, ShareParams } from "./params.ts";

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

/** The IP certificate lifecycle (D269): obtain, serve over https, renew on a schedule, and fall back to plain http.
 *  Nothing here reads or writes the owner's setting; the verbs persist it and hand it over. */
export interface CertificateController {
  /** Serves `setting`: a stored certificate for its address while one is still usable, else a new order in the
   *  background. Resolves at once with `active` or `obtaining`; an unchanged setting already serving is left alone. */
  readonly enable: (setting: IpCertificateSetting) => Promise<IpCertificateStatus>;
  /** Stops serving, cancels every timer and deletes the certificate files; the account key stays. */
  readonly disable: () => Promise<void>;
  /** Stops serving and cancels every timer for a shutdown; the files stay for the next boot. */
  readonly stop: () => Promise<void>;
  readonly status: () => IpCertificateStatus;
}

/** The controller's seams, wired at the composition root (`entry/lifecycle.ts`). */
export interface CertificateControllerDeps {
  readonly issuer: AcmeIssuer;
  readonly store: CertificateStore;
  /** Opens the https listener on the app listener's interface, forwarding to the app over loopback. */
  readonly startHttps: (options: Pick<TlsTerminatorOptions, "port" | "certificatePem" | "keyPem">) => Promise<TlsTerminator>;
  /** The app listener's interface, which the HTTP-01 responder shares; undefined is every interface. */
  readonly bindHost: string | undefined;
  readonly now: () => number;
  /** Runs `run` once after `ms`; the returned function cancels it. */
  readonly schedule: (run: () => void, ms: number) => () => void;
}

/** Why the IP certificate may not start, with the sentence that names its fix. */
export interface IpCertificateRefusalNotice {
  readonly code: IpCertificateRefusal;
  readonly message: string;
}

/** The facts the IP certificate's preconditions read beside {@link ShareFacts}. */
export interface CertificateFacts {
  /** True when the app listener admits connections from beyond loopback (`BindPosture.publicBind`). */
  readonly publicBind: boolean;
  /** True when the app listener also takes loopback, where the https listener forwards (`loopbackOrigin` is not
   *  null): only a loopback peer's forwarded headers are believed (D255). */
  readonly loopbackUpstream: boolean;
  /** The port the app listener serves plain http on. */
  readonly appPort: () => number;
}

/** The IP certificate's preconditions over one setting: the refusal, else the setting with its address canonical. */
export type CertificateCheckResult = { readonly refusal: IpCertificateRefusalNotice } | { readonly refusal: null; readonly setting: IpCertificateSetting };

/** What the boot-time certificate start did, for the lifecycle's log line. */
export type CertificateBootOutcome =
  | { readonly kind: "not_configured" }
  | { readonly kind: "refused"; readonly refusal: IpCertificateRefusalNotice }
  | { readonly kind: "started"; readonly certificate: IpCertificateStatus };

/** The facts a share's preconditions read. */
export interface ShareFacts {
  readonly authMode: AuthMode;
  /** Read only under `local`, the one mode with a first-run owner claim. */
  readonly ownerNeedsPassword: () => Promise<boolean>;
  /** Where the owner finishes setup: this machine's own origin. */
  readonly localSetupUrl: () => string;
  /** The addresses a stranger already reaches this server at (`publicAddresses` in `foundation/env`). */
  readonly publicAddresses: readonly string[];
}

/** Puts the seating settings back as {@link ShareServiceDeps.enableSeating} found them. */
type RestoreSeating = () => Promise<void>;

/** What a boot-time or post-claim start did, for the lifecycle's log line. */
export type ShareBootOutcome =
  | { readonly kind: "started"; readonly relay: RelayStatus }
  | { readonly kind: "refused"; readonly refusal: ShareRefusalNotice }
  | { readonly kind: "failed"; readonly code: string; readonly message: string }
  | { readonly kind: "not_waiting" };

/** What the composition root hands the share service. */
export interface ShareServiceDeps extends ShareFacts, CertificateFacts {
  readonly relay: RelayController;
  readonly certificate: CertificateController;
  /** The owner's stored IP certificate choice, or null when it is off. */
  readonly certificateSetting: () => IpCertificateSetting | null;
  /** Persists the choice as `principal`, the owner; null turns it off. */
  readonly saveCertificateSetting: (principal: Principal, setting: IpCertificateSetting | null) => Promise<void>;
  /** Turns on, as the owner, whichever of the two settings a public link needs is off: multi-human seating, so
   *  friends can be invited into rooms, and discreet login, so the sign-in page a stranger reaches names no
   *  account. Every start runs it once the preconditions hold, before the relay spawns. It resolves with the step
   *  that puts back exactly what it changed, which a start runs when the relay fails to start. */
  readonly enableSeating: () => Promise<RestoreSeating>;
  readonly requireOwner: RequireOwner;
  /** The live stream sockets on the box, or one user's alone when `userId` is given. */
  readonly liveSocketCount: (userId?: UserId) => number;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  readonly now: () => number;
}

/** The DI bundle the verbs close over: the deps plus the one precondition check every start runs. */
export interface ShareContext extends ShareServiceDeps {
  readonly refusal: () => Promise<ShareRefusalNotice | null>;
  /** The IP certificate's preconditions, run by the owner's enable and by the boot start alike. */
  readonly certificateRefusal: (setting: IpCertificateSetting) => Promise<CertificateCheckResult>;
  /** What every verb answers: the relay, the live sockets of every account but the caller's (the owner's own tabs
   *  never read as a visitor) and the public addresses. */
  readonly statusFor: (principal: Principal, relay: RelayStatus) => ShareStatus;
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
  /** Owner-only: stores the IP certificate choice and starts getting the certificate. */
  readonly enableIpCertificate: (params: EnableIpCertificateParams) => Promise<ShareStatus>;
  /** Owner-only: turns the IP certificate off and deletes it; plain http keeps serving. */
  readonly disableIpCertificate: (params: ShareParams) => Promise<ShareStatus>;
  /** The boot start of a stored IP certificate choice, after the listener binds; the same preconditions run first. */
  readonly resumeIpCertificate: () => Promise<CertificateBootOutcome>;
}
