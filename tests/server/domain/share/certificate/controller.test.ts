// domain/share/certificate/controller — the IP certificate lifecycle (D269) over a scripted issuer, an in-memory store,
// a recording https listener and a timer seam driven by the frozen clock: what https serves, when renewals run, and
// the fallback to plain http when validation fails or the certificate runs out.

import type { IpCertificateSetting } from "@orb/contracts/identity";
import type { CertificateControllerDeps } from "@orb/server/domain/share";
import { createCertificateController } from "@orb/server/domain/share";
import { getLog } from "@orb/server/foundation/observability";
import type { IssuedCertificate, IssueOutcome, IssueRequest } from "@orb/server/infra/acme";
import { describe, vi } from "vitest";
import { EXPIRY_GUARD_MS, RENEWAL_RETRY_FIRST_MS } from "../../../../../packages/server/src/domain/share/substrate/renewal.ts";
import { createFrozenClock } from "../../../../support/clock.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const HOUR_MS = 3_600_000;
const LIFETIME_MS = 160 * HOUR_MS;
const SETTING: IpCertificateSetting = { address: "81.2.69.160", httpsPort: 8443, challengePort: 8080 };

interface Timer {
  readonly due: number;
  readonly ms: number;
  readonly run: () => void;
  state: "live" | "fired" | "cancelled";
}

interface Listener {
  readonly port: number;
  serving: string;
  closed: boolean;
}

function certificateAt(notBefore: number, serial: string): IssuedCertificate {
  return { certificatePem: `CERT ${serial}`, keyPem: `KEY ${serial}`, notBefore, notAfter: notBefore + LIFETIME_MS };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}

interface Harness {
  readonly clock: ReturnType<typeof createFrozenClock>;
  readonly controller: ReturnType<typeof createCertificateController>;
  readonly outcomes: IssueOutcome[];
  readonly issued: IssueRequest[];
  readonly listeners: Listener[];
  readonly saved: IssuedCertificate[];
  readonly files: { account: string | null; certificate: IssuedCertificate | null };
  readonly live: () => Timer[];
  /** Moves the clock to the earliest live timer and fires it, then lets the work it started settle. */
  readonly runNext: () => Promise<number>;
  /** Holds the next certificate save before its bytes land, as a slow disk would; the result releases it. */
  readonly holdNextSave: () => () => void;
}

function harness(
  options: {
    readonly stored?: IssuedCertificate;
    readonly listenerFails?: boolean;
    /** A certificate already on disk for another address, which that address's enable serves at once. */
    readonly storedFor?: { readonly address: string; readonly certificate: IssuedCertificate };
  } = {},
): Harness {
  const clock = createFrozenClock();
  const timers: Timer[] = [];
  const outcomes: IssueOutcome[] = [];
  const issued: IssueRequest[] = [];
  const listeners: Listener[] = [];
  const saved: IssuedCertificate[] = [];
  const files: { account: string | null; certificate: IssuedCertificate | null } = { account: null, certificate: options.stored ?? null };
  let serial = 0;
  let heldSave: Promise<void> | null = null;
  const deps: CertificateControllerDeps = {
    issuer: {
      createAccountKey: () => Promise.resolve("ACCOUNT KEY"),
      issue: (request) => {
        issued.push(request);
        const next = outcomes.shift();
        if (next !== undefined) {
          return Promise.resolve(next);
        }
        serial += 1;
        return Promise.resolve({ ok: true, certificate: certificateAt(clock.now(), `issued-${String(serial)}`) });
      },
    },
    store: {
      loadAccountKey: () => Promise.resolve(files.account),
      saveAccountKey: (pem) => {
        files.account = pem;
        return Promise.resolve();
      },
      loadCertificate: (address) => {
        if (options.storedFor?.address === address) {
          return Promise.resolve(options.storedFor.certificate);
        }
        return Promise.resolve(address === SETTING.address ? files.certificate : null);
      },
      saveCertificate: async (certificate) => {
        const hold = heldSave;
        heldSave = null;
        await hold;
        files.certificate = certificate;
        saved.push(certificate);
      },
      removeCertificate: () => {
        files.certificate = null;
        return Promise.resolve();
      },
    },
    startHttps: ({ port, certificatePem }) => {
      if (options.listenerFails === true) {
        return Promise.reject(new Error("listen EADDRINUSE: address already in use :::8443"));
      }
      const listener: Listener = { port, serving: certificatePem, closed: false };
      listeners.push(listener);
      return Promise.resolve({
        port,
        replaceCertificate: (next: string): void => {
          listener.serving = next;
        },
        close: (): Promise<void> => {
          listener.closed = true;
          return Promise.resolve();
        },
      });
    },
    bindHost: undefined,
    now: clock.now,
    schedule: (run, ms) => {
      const timer: Timer = { due: clock.now() + ms, ms, run, state: "live" };
      timers.push(timer);
      return () => {
        if (timer.state === "live") {
          timer.state = "cancelled";
        }
      };
    },
  };
  const controller = createCertificateController(deps);
  const live = (): Timer[] => timers.filter((timer) => timer.state === "live").sort((a, b) => a.due - b.due);
  return {
    clock,
    controller,
    outcomes,
    issued,
    listeners,
    saved,
    files,
    live,
    holdNextSave: (): (() => void) => {
      let release = (): void => undefined;
      heldSave = new Promise<void>((resolve) => {
        release = resolve;
      });
      return release;
    },
    runNext: async (): Promise<number> => {
      const [next] = live();
      if (next === undefined) {
        throw new Error("no live timer");
      }
      clock.advance(next.due - clock.now());
      next.state = "fired";
      next.run();
      await settle();
      return next.due;
    },
  };
}

const VALIDATION_FAILED: IssueOutcome = {
  ok: false,
  code: "validation_failed",
  detail: "81.2.69.160: Fetching http://81.2.69.160/.well-known/acme-challenge/tok: Timeout during connect (likely firewall problem)",
};

describe("createCertificateController", () => {
  test("enable orders one certificate, stores it and its account key, and serves https at the address", async () => {
    const h = harness();
    await expect(h.controller.enable(SETTING)).resolves.toEqual({ state: "obtaining", setting: SETTING });
    await settle();
    expect(h.issued).toEqual([{ address: SETTING.address, challengePort: SETTING.challengePort, bindHost: undefined, accountKeyPem: "ACCOUNT KEY" }]);
    expect(h.files.account).toBe("ACCOUNT KEY");
    expect(h.listeners).toEqual([{ port: SETTING.httpsPort, serving: "CERT issued-1", closed: false }]);
    const now = h.clock.now();
    expect(h.controller.status()).toEqual({
      state: "active",
      setting: SETTING,
      url: "https://81.2.69.160",
      notAfter: now + LIFETIME_MS,
      renewAt: now + 80 * HOUR_MS,
      renewalFailure: null,
    });
  });

  test("a failed validation falls back to plain http: no https listener, a failed status and a security warning", async () => {
    const warn = vi.spyOn(getLog(), "warn").mockImplementation(() => undefined);
    const h = harness();
    h.outcomes.push(VALIDATION_FAILED);
    await h.controller.enable(SETTING);
    await settle();
    expect(h.listeners).toEqual([]);
    expect(h.saved).toEqual([]);
    expect(h.controller.status()).toEqual({
      state: "failed",
      setting: SETTING,
      failure: { code: "validation_failed", message: VALIDATION_FAILED.ok ? "" : VALIDATION_FAILED.detail },
    });
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ security: true, code: "validation_failed" }), expect.stringContaining("plain http"));
    // No retry is armed: the owner tries again from the card.
    expect(h.live()).toEqual([]);
    warn.mockRestore();
  });

  test("a certificate renews inside its window and the renewed one replaces it on the same listener", async () => {
    const h = harness();
    await h.controller.enable(SETTING);
    await settle();
    const issuedAt = h.clock.now();
    expect(await h.runNext()).toBe(issuedAt + 80 * HOUR_MS);
    expect(h.issued).toHaveLength(2);
    expect(h.listeners).toHaveLength(1);
    expect(h.listeners[0]).toMatchObject({ serving: "CERT issued-2", closed: false });
    expect(h.controller.status()).toMatchObject({ state: "active", notAfter: h.clock.now() + LIFETIME_MS, renewalFailure: null });
  });

  test("a failed renewal keeps the live certificate serving and backs off, doubling each time", async () => {
    const warn = vi.spyOn(getLog(), "warn").mockImplementation(() => undefined);
    const h = harness();
    await h.controller.enable(SETTING);
    await settle();
    h.outcomes.push(VALIDATION_FAILED, VALIDATION_FAILED, VALIDATION_FAILED);
    const firstAttempt = await h.runNext();
    expect(h.listeners[0]).toMatchObject({ serving: "CERT issued-1", closed: false });
    expect(h.controller.status()).toMatchObject({
      state: "active",
      renewAt: firstAttempt + RENEWAL_RETRY_FIRST_MS,
      renewalFailure: { code: "validation_failed" },
    });
    const second = await h.runNext();
    expect(second).toBe(firstAttempt + RENEWAL_RETRY_FIRST_MS);
    const third = await h.runNext();
    expect(third).toBe(second + RENEWAL_RETRY_FIRST_MS * 2);
    // The next attempt succeeds and clears the failure.
    await h.runNext();
    expect(h.controller.status()).toMatchObject({ state: "active", renewalFailure: null });
    expect(h.listeners[0]?.serving).toBe("CERT issued-2");
    warn.mockRestore();
  });

  test("renewals that keep failing never run after expiry, and expiry closes https and falls back to plain http", async () => {
    const warn = vi.spyOn(getLog(), "warn").mockImplementation(() => undefined);
    const h = harness();
    await h.controller.enable(SETTING);
    await settle();
    const notAfter = h.clock.now() + LIFETIME_MS;
    for (let i = 0; i < 50; i++) {
      h.outcomes.push(VALIDATION_FAILED);
    }
    const attempts: number[] = [];
    while (h.controller.status().state === "active") {
      const before = h.issued.length;
      const at = await h.runNext();
      if (h.issued.length > before) {
        attempts.push(at);
      }
    }
    expect(attempts.length).toBeGreaterThan(3);
    expect(attempts.every((at) => at <= notAfter - EXPIRY_GUARD_MS)).toBe(true);
    expect(h.clock.now()).toBe(notAfter);
    expect(h.listeners[0]?.closed).toBe(true);
    expect(h.controller.status()).toMatchObject({ state: "failed", failure: { code: "expired" } });
    expect(h.live()).toEqual([]);
    warn.mockRestore();
  });

  test("a stored certificate still inside its life serves at once, with no order, and renews at its half-life", async () => {
    const clock = createFrozenClock();
    const stored = certificateAt(clock.now() - 10 * HOUR_MS, "stored");
    const h = harness({ stored });
    await expect(h.controller.enable(SETTING)).resolves.toMatchObject({ state: "active", renewAt: stored.notBefore + 80 * HOUR_MS });
    expect(h.issued).toEqual([]);
    expect(h.listeners).toEqual([{ port: SETTING.httpsPort, serving: "CERT stored", closed: false }]);
  });

  test("a stored certificate inside its guard window is not served; a new one is ordered", async () => {
    const clock = createFrozenClock();
    const h = harness({ stored: certificateAt(clock.now() - LIFETIME_MS + EXPIRY_GUARD_MS / 2, "stale") });
    await expect(h.controller.enable(SETTING)).resolves.toMatchObject({ state: "obtaining" });
    await settle();
    expect(h.issued).toHaveLength(1);
    expect(h.listeners[0]?.serving).toBe("CERT issued-1");
  });

  test("an https port that cannot open is a listener_failed fallback, with the certificate kept on disk", async () => {
    const warn = vi.spyOn(getLog(), "warn").mockImplementation(() => undefined);
    const h = harness({ listenerFails: true });
    await h.controller.enable(SETTING);
    await settle();
    expect(h.controller.status()).toMatchObject({ state: "failed", failure: { code: "listener_failed" } });
    expect(h.files.certificate?.certificatePem).toBe("CERT issued-1");
    warn.mockRestore();
  });

  test("disable closes https, cancels every timer and deletes the certificate; a late order cannot bring it back", async () => {
    const h = harness();
    await h.controller.enable(SETTING);
    await settle();
    await h.controller.disable();
    expect(h.listeners[0]?.closed).toBe(true);
    expect(h.live()).toEqual([]);
    expect(h.files.certificate).toBeNull();
    expect(h.files.account).toBe("ACCOUNT KEY");
    expect(h.controller.status()).toEqual({ state: "off" });
  });

  test("an order still in flight when the owner turns the certificate off is dropped: nothing stored, nothing served", async () => {
    const clock = createFrozenClock();
    let answer: (outcome: IssueOutcome) => void = () => undefined;
    const slow = new Promise<IssueOutcome>((resolve) => {
      answer = resolve;
    });
    const issue = vi.fn((): Promise<IssueOutcome> => slow);
    const controller = createCertificateController({
      issuer: { createAccountKey: () => Promise.resolve("K"), issue },
      store: {
        loadAccountKey: () => Promise.resolve("K"),
        saveAccountKey: () => Promise.resolve(),
        loadCertificate: () => Promise.resolve(null),
        saveCertificate: () => Promise.reject(new Error("a dropped order must not store anything")),
        removeCertificate: () => Promise.resolve(),
      },
      startHttps: () => Promise.reject(new Error("a dropped order must not open https")),
      bindHost: undefined,
      now: clock.now,
      schedule: () => () => undefined,
    });
    await controller.enable(SETTING);
    await settle();
    await controller.disable();
    answer({ ok: true, certificate: certificateAt(clock.now(), "late") });
    await settle();
    expect(issue).toHaveBeenCalledTimes(1);
    expect(controller.status()).toEqual({ state: "off" });
  });

  test("enable with the same setting while serving leaves it alone; stop closes https but keeps the files", async () => {
    const h = harness();
    await h.controller.enable(SETTING);
    await settle();
    await h.controller.enable(SETTING);
    await settle();
    expect(h.issued).toHaveLength(1);
    expect(h.listeners).toHaveLength(1);
    await h.controller.stop();
    expect(h.listeners[0]?.closed).toBe(true);
    expect(h.files.certificate?.certificatePem).toBe("CERT issued-1");
    expect(h.live()).toEqual([]);
  });

  test("a renewal that lands after the owner switched to another address never touches the new address's https", async () => {
    const clock = createFrozenClock();
    const other: IpCertificateSetting = { address: "81.2.69.161", httpsPort: 9443, challengePort: 9080 };
    // Issued ten hours before the switch, which happens at the first certificate's half-life.
    const otherCertificate = certificateAt(clock.now() + 70 * HOUR_MS, "other");
    const h = harness({ storedFor: { address: other.address, certificate: otherCertificate } });
    await h.controller.enable(SETTING);
    await settle();
    const release = h.holdNextSave();
    await h.runNext();
    // The renewal for the first address is ordered and now waits on its save; the owner moves to another address.
    await expect(h.controller.enable(other)).resolves.toMatchObject({ state: "active", setting: other });
    release();
    await settle();
    const serving = h.listeners.filter((listener) => !listener.closed);
    expect(serving).toEqual([{ port: other.httpsPort, serving: "CERT other", closed: false }]);
    expect(h.controller.status()).toMatchObject({ state: "active", setting: other, notAfter: otherCertificate.notAfter });
    expect(h.live().map((timer) => timer.due)).toContain(otherCertificate.notBefore + 80 * HOUR_MS);
  });

  test("a disable that races a certificate save leaves no certificate on disk", async () => {
    const h = harness();
    const release = h.holdNextSave();
    await h.controller.enable(SETTING);
    await settle();
    // The order came back and its save is still in flight when the owner turns https off.
    expect(h.issued).toHaveLength(1);
    await h.controller.disable();
    release();
    await settle();
    expect(h.files.certificate).toBeNull();
    expect(h.listeners).toEqual([]);
    expect(h.controller.status()).toEqual({ state: "off" });
  });

  test("control: a stop that races a save keeps the certificate for the next boot", async () => {
    const h = harness();
    const release = h.holdNextSave();
    await h.controller.enable(SETTING);
    await settle();
    await h.controller.stop();
    release();
    await settle();
    expect(h.files.certificate?.certificatePem).toBe("CERT issued-1");
  });
});
