// The IP certificate controller (D269): off → obtaining → active, or failed back to plain http. Every enable or stop
// takes a new generation; a late issuance, bind or timer from an older one is dropped, so a stop is never undone.
// A failed renewal keeps the live certificate serving until the schedule gives up; expiry closes https, never serves on.
// SECURITY: keys and certificates never reach a log line or a status; only codes and the authority's sentence do.

import type { IpCertificateFailure, IpCertificateSetting, IpCertificateStatus } from "@orb/contracts/identity";
import { getLog } from "#foundation/observability";
import type { IssuedCertificate } from "#infra/acme";
import type { TlsTerminator } from "#infra/network";
import type { CertificateController, CertificateControllerDeps } from "../contract/service.ts";
import { nextRenewalAt } from "../substrate/renewal.ts";

// The longest single timer the controller arms; a later wake re-arms, because a node timer past this fires at once.
const MAX_TIMER_MS = 2_147_483_647;

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function sameSetting(a: IpCertificateSetting, b: IpCertificateSetting): boolean {
  return a.address === b.address && a.httpsPort === b.httpsPort && a.challengePort === b.challengePort;
}

// The https origin friends use: the address on the default port the router forwards to `httpsPort`.
function certificateUrl(address: string): string {
  return address.includes(":") ? `https://[${address}]` : `https://${address}`;
}

export function createCertificateController(deps: CertificateControllerDeps): CertificateController {
  const log = getLog();
  let status: IpCertificateStatus = { state: "off" };
  let generation = 0;
  let setting: IpCertificateSetting | null = null;
  let listener: TlsTerminator | null = null;
  let served: IssuedCertificate | null = null;
  let renewalFailures = 0;
  let cancelRenewal: (() => void) | null = null;
  let cancelExpiry: (() => void) | null = null;
  // One order at a time: an order from an older generation still holds the challenge port until its authority answers.
  let ordering: Promise<void> = Promise.resolve();

  // Runs `run` at `at`, re-arming in steps no longer than MAX_TIMER_MS; the returned function cancels the whole chain.
  function scheduleAt(at: number, run: () => void): () => void {
    let cancel = (): void => undefined;
    const arm = (): void => {
      const wait = at - deps.now();
      if (wait <= 0) {
        run();
        return;
      }
      cancel = deps.schedule(arm, Math.min(wait, MAX_TIMER_MS));
    };
    cancel = deps.schedule(arm, Math.min(Math.max(at - deps.now(), 0), MAX_TIMER_MS));
    return () => {
      cancel();
    };
  }

  function cancelTimers(): void {
    cancelRenewal?.();
    cancelRenewal = null;
    cancelExpiry?.();
    cancelExpiry = null;
  }

  async function closeListener(): Promise<void> {
    const open = listener;
    listener = null;
    await open?.close();
  }

  // Everything this generation owns ends; the setting and the stored files are the caller's business.
  async function halt(): Promise<void> {
    generation += 1;
    cancelTimers();
    served = null;
    renewalFailures = 0;
    await closeListener();
  }

  function activeStatus(
    current: IpCertificateSetting,
    certificate: IssuedCertificate,
    renewAt: number | null,
    renewalFailure: IpCertificateFailure | null,
  ): IpCertificateStatus {
    return {
      state: "active",
      setting: current,
      url: certificateUrl(current.address),
      notAfter: certificate.notAfter,
      renewAt: renewAt ?? certificate.notAfter,
      renewalFailure,
    };
  }

  // The fallback: https is closed and plain http, with its standing warning, is all that serves.
  async function fail(gen: number, current: IpCertificateSetting, failure: IpCertificateFailure): Promise<void> {
    if (gen !== generation) {
      return;
    }
    cancelTimers();
    served = null;
    await closeListener();
    status = { state: "failed", setting: current, failure };
    log.warn(
      { share: true, security: true, code: failure.code, detail: failure.message },
      "share: the IP certificate is not serving; this server answers over plain http only, where a password crosses the network in clear",
    );
  }

  function armRenewal(gen: number, current: IpCertificateSetting, certificate: IssuedCertificate): number | null {
    const at = nextRenewalAt(certificate, renewalFailures, deps.now());
    cancelRenewal?.();
    cancelRenewal =
      at === null
        ? null
        : scheduleAt(at, () => {
            cancelRenewal = null;
            order(gen, current);
          });
    return at;
  }

  function armExpiry(gen: number, current: IpCertificateSetting, certificate: IssuedCertificate, lastFailure: IpCertificateFailure | null): void {
    cancelExpiry?.();
    cancelExpiry = scheduleAt(certificate.notAfter, () => {
      cancelExpiry = null;
      const cause = lastFailure === null ? "" : ` The last renewal failed: ${lastFailure.message}`;
      fail(gen, current, { code: "expired", message: `The certificate expired before a renewal succeeded.${cause}` }).catch((err: unknown) => {
        log.error({ share: true, err: errorText(err) }, "share: the expired IP certificate could not be closed");
      });
    });
  }

  async function serve(gen: number, current: IpCertificateSetting, certificate: IssuedCertificate): Promise<void> {
    // An older generation's certificate must never reach the listener a newer enable opened for another address.
    if (gen !== generation) {
      return;
    }
    if (listener === null) {
      let opened: TlsTerminator;
      // @orb-waive caught-failure-ownership(err): owned by `fail`, which sets the `failed` status the Share card shows and logs the security line naming plain http. Ends if `fail` stops setting that status.
      try {
        opened = await deps.startHttps({ port: current.httpsPort, certificatePem: certificate.certificatePem, keyPem: certificate.keyPem });
      } catch (err) {
        await fail(gen, current, { code: "listener_failed", message: `The https port ${String(current.httpsPort)} could not open: ${errorText(err)}` });
        return;
      }
      if (gen !== generation) {
        await opened.close();
        return;
      }
      listener = opened;
    } else {
      listener.replaceCertificate(certificate.certificatePem, certificate.keyPem);
    }
    served = certificate;
    renewalFailures = 0;
    const renewAt = armRenewal(gen, current, certificate);
    armExpiry(gen, current, certificate, null);
    status = activeStatus(current, certificate, renewAt, null);
    log.info({ share: true, notAfter: certificate.notAfter, renewAt }, `share: this server serves https at ${certificateUrl(current.address)}`);
  }

  // A renewal that failed while the certificate still serves backs off; a first order that failed falls back.
  async function orderFailed(gen: number, current: IpCertificateSetting, failure: IpCertificateFailure): Promise<void> {
    if (gen !== generation) {
      return;
    }
    const live = served;
    if (live === null) {
      await fail(gen, current, failure);
      return;
    }
    renewalFailures += 1;
    const retryAt = armRenewal(gen, current, live);
    armExpiry(gen, current, live, failure);
    status = activeStatus(current, live, retryAt, failure);
    log.warn(
      { share: true, code: failure.code, detail: failure.message, retryAt },
      "share: an IP certificate renewal failed; the current certificate keeps serving",
    );
  }

  async function accountKey(): Promise<string> {
    const stored = await deps.store.loadAccountKey();
    if (stored !== null) {
      return stored;
    }
    const created = await deps.issuer.createAccountKey();
    await deps.store.saveAccountKey(created);
    return created;
  }

  async function obtain(gen: number, current: IpCertificateSetting): Promise<void> {
    if (gen !== generation) {
      return;
    }
    // @orb-waive caught-failure-ownership(err): owned by `orderFailed`, which sets the status the Share card shows (a renewal failure beside the live certificate, or the `failed` fallback) and logs it. Ends if `orderFailed` stops setting that status.
    try {
      const outcome = await deps.issuer.issue({
        address: current.address,
        challengePort: current.challengePort,
        bindHost: deps.bindHost,
        accountKeyPem: await accountKey(),
      });
      if (gen !== generation) {
        return;
      }
      if (!outcome.ok) {
        await orderFailed(gen, current, { code: outcome.code, message: outcome.detail });
        return;
      }
      await deps.store.saveCertificate(outcome.certificate);
      if (gen !== generation) {
        await discardStale(current);
        return;
      }
      await serve(gen, current, outcome.certificate);
    } catch (err) {
      await orderFailed(gen, current, { code: "issuance_failed", message: errorText(err) });
    }
  }

  // A save that finished after a disable, or after a switch to another address, wrote files nothing serves: delete them.
  // A stop keeps its setting, so a save racing a shutdown keeps its valid certificate for the next boot.
  async function discardStale(saved: IpCertificateSetting): Promise<void> {
    if (setting === null || setting.address !== saved.address) {
      await deps.store.removeCertificate();
    }
  }

  // Queues an order behind any older one; its outcome lands in the status, and nothing it does can throw past here.
  function order(gen: number, current: IpCertificateSetting): void {
    ordering = ordering
      .then(() => obtain(gen, current))
      .catch((err: unknown) => {
        log.error({ share: true, err: errorText(err) }, "share: an IP certificate order ended without a status");
      });
  }

  // A stored certificate serves again only while a renewal still fits before its guard window.
  async function usableStored(address: string): Promise<IssuedCertificate | null> {
    try {
      const stored = await deps.store.loadCertificate(address);
      return stored !== null && nextRenewalAt(stored, 0, deps.now()) !== null ? stored : null;
    } catch (err) {
      log.warn({ share: true, err: errorText(err) }, "share: the stored IP certificate could not be read; ordering a new one");
      return null;
    }
  }

  return {
    enable: async (next): Promise<IpCertificateStatus> => {
      if (setting !== null && sameSetting(setting, next) && (status.state === "obtaining" || status.state === "active")) {
        return status;
      }
      await halt();
      const gen = generation;
      setting = next;
      status = { state: "obtaining", setting: next };
      const stored = await usableStored(next.address);
      if (gen !== generation) {
        return status;
      }
      if (stored !== null) {
        await serve(gen, next, stored);
        return status;
      }
      order(gen, next);
      return status;
    },
    disable: async (): Promise<void> => {
      const wasOn = status.state !== "off";
      await halt();
      setting = null;
      status = { state: "off" };
      await deps.store.removeCertificate();
      if (wasOn) {
        log.info({ share: true }, "share: the IP certificate is off and deleted; this server answers over plain http only");
      }
    },
    stop: async (): Promise<void> => {
      await halt();
      status = { state: "off" };
    },
    status: (): IpCertificateStatus => status,
  };
}
