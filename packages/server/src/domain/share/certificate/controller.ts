// The IP certificate controller (D275): off → obtaining → active, or failed back to plain http. Every enable or stop
// takes a new generation; a late issuance, bind or timer from an older one is dropped, so a stop is never undone.
// A failed renewal keeps the live certificate serving until the schedule gives up; expiry closes https, never serves on.
// SECURITY: keys and certificates never reach a log line or a status; only codes and the authority's sentence do.

import type { IpCertificateFailure, IpCertificateSetting, IpCertificateStatus } from "@orb/contracts/identity";
import { getLog } from "#foundation/observability";
import type { IssuedCertificate } from "#infra/acme";
import type { TlsTerminator } from "#infra/network";
import type { CertificateControllerDeps, OwnedCertificateController } from "../contract/service.ts";
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

export function createCertificateController(deps: CertificateControllerDeps): OwnedCertificateController {
  const log = getLog(deps.logger);
  let status: IpCertificateStatus = { state: "off" };
  let generation = 0;
  let setting: IpCertificateSetting | null = null;
  let listener: TlsTerminator | null = null;
  let closing: Promise<void> = Promise.resolve();
  let served: IssuedCertificate | null = null;
  let renewalFailures = 0;
  let cancelRenewal: (() => void) | null = null;
  let cancelExpiry: (() => void) | null = null;
  // One order at a time: an order from an older generation still holds the challenge port until its authority answers.
  let ordering: Promise<void> = Promise.resolve();
  let orderAbort = new AbortController();
  // biome-ignore lint/suspicious/noConfusingVoidType: one settlement owner tracks status-returning enable and no-result lifecycle operations.
  const pending = new Set<Promise<IpCertificateStatus | void>>();
  let disposed = false;
  let disposal: Promise<void> | undefined;

  // A call, so the checker does not keep a `setting = null` narrowing across an awaited halt in which a concurrent enable replaces it.
  function currentSetting(): IpCertificateSetting | null {
    return setting;
  }

  // biome-ignore lint/suspicious/noConfusingVoidType: lifecycle callbacks return Promise<void>, not the narrower Promise<undefined>.
  function track<T extends IpCertificateStatus | void>(run: () => Promise<T>): Promise<T> {
    if (disposed) {
      return Promise.reject(new Error("The certificate controller is disposed"));
    }
    const operation = Promise.withResolvers<T>();
    pending.add(operation.promise);
    void run().then(operation.resolve, operation.reject);
    void operation.promise.then(
      () => pending.delete(operation.promise),
      () => pending.delete(operation.promise),
    );
    return operation.promise;
  }

  async function settle(): Promise<void> {
    const results = await Promise.allSettled([...pending]);
    await ordering;
    const failures = results.filter((result) => result.status === "rejected").map((result) => result.reason);
    if (failures.length > 0) {
      throw new AggregateError(failures, "certificate controller settlement failed");
    }
  }

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
    using cancelling = new DisposableStack();
    if (cancelRenewal !== null) {
      cancelling.defer(cancelRenewal);
    }
    cancelRenewal = null;
    if (cancelExpiry !== null) {
      cancelling.defer(cancelExpiry);
    }
    cancelExpiry = null;
  }

  async function closeListener(): Promise<void> {
    const open = listener;
    listener = null;
    if (open !== null) {
      closing = Promise.all([closing, open.close()]).then((): void => undefined);
    }
    await closing;
  }

  // Everything this generation owns ends; the setting and the stored files are the caller's business.
  async function halt(): Promise<number> {
    generation += 1;
    const gen = generation;
    orderAbort.abort();
    orderAbort = new AbortController();
    served = null;
    renewalFailures = 0;
    await using stopping = new AsyncDisposableStack();
    stopping.defer(closeListener);
    stopping.defer(cancelTimers);
    return gen;
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
    if (gen !== generation) {
      return;
    }
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
            if (nextRenewalAt(certificate, 0, deps.now()) === null) {
              return;
            }
            order(gen, current);
          });
    return at;
  }

  function armExpiry(gen: number, current: IpCertificateSetting, certificate: IssuedCertificate, lastFailure: IpCertificateFailure | null): void {
    cancelExpiry?.();
    cancelExpiry = scheduleAt(certificate.notAfter, () => {
      cancelExpiry = null;
      const cause = lastFailure === null ? "" : ` The last renewal failed: ${lastFailure.message}`;
      track(() => fail(gen, current, { code: "expired", message: `The certificate expired before a renewal succeeded.${cause}` })).catch((err: unknown) => {
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
      // owned by `fail`, which sets the `failed` status the Share card shows and logs the security line naming plain http. Ends if `fail` stops setting that status.
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
    const signal = orderAbort.signal;
    // owned by `orderFailed`, which sets the status the Share card shows (a renewal failure beside the live certificate, or the `failed` fallback) and logs it. Ends if `orderFailed` stops setting that status.
    try {
      const accountKeyPem = await accountKey();
      if (gen !== generation) {
        return;
      }
      const outcome = await deps.issuer.issue(
        {
          address: current.address,
          challengePort: current.challengePort,
          bindHost: deps.bindHost,
          accountKeyPem,
        },
        signal,
      );
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
    enable: (next): Promise<IpCertificateStatus> =>
      track(async () => {
        if (setting !== null && sameSetting(setting, next) && (status.state === "obtaining" || status.state === "active")) {
          return status;
        }
        setting = next;
        status = { state: "obtaining", setting: next };
        const gen = await halt();
        if (disposed || gen !== generation) {
          return status;
        }
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
      }),
    disable: (): Promise<void> =>
      track(async () => {
        const wasOn = status.state !== "off";
        setting = null;
        status = { state: "off" };
        const gen = await halt();
        if (gen !== generation && currentSetting() !== null) {
          return;
        }
        await deps.store.removeCertificate();
        if (wasOn) {
          log.info({ share: true }, "share: the IP certificate is off and deleted; this server answers over plain http only");
        }
      }),
    stop: (): Promise<void> =>
      track(async () => {
        status = { state: "off" };
        await halt();
      }),
    status: (): IpCertificateStatus => status,
    settle,
    [Symbol.asyncDispose](): Promise<void> {
      disposal ??= (async (): Promise<void> => {
        disposed = true;
        const stopped = halt();
        status = { state: "off" };
        const results = await Promise.allSettled([stopped, settle()]);
        const failures = results.filter((result) => result.status === "rejected").map((result) => result.reason);
        if (failures.length > 0) {
          throw new AggregateError(failures, "certificate controller disposal failed");
        }
      })();
      return disposal;
    },
  };
}
