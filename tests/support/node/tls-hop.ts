// A certificate for one IP address and a TLS client that trusts only it, for a test that drives the IP certificate's
// https listener. Node only: no server module, so a suite can import it before it stubs its env.

import type { KeyObject } from "node:crypto";
import { generateKeyPairSync } from "node:crypto";
import { request } from "node:https";
import { createFrozenClock } from "../clock.ts";
import { ipCertificatePem } from "./x509.ts";

const LIFETIME_MS = 160 * 3_600_000;
// The TLS client checks the certificate against the real clock, so it stays valid for years around the frozen one.
const VALID_LIFETIMES = 1000;

export interface CertificatePair {
  readonly certificatePem: string;
  readonly keyPem: string;
}

export interface TlsAnswer {
  readonly status: number;
  /** The `name=value` pairs of every Set-Cookie, joined as a Cookie header. */
  readonly cookie: string;
  readonly body: string;
}

/** A self-signed certificate whose one SAN is `address`, and its key. */
export function selfSignedIpPair(address: string): CertificatePair {
  const clock = createFrozenClock();
  const keys: { privateKey: KeyObject; publicKey: KeyObject } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return {
    certificatePem: ipCertificatePem({
      address,
      subjectPublicKey: keys.publicKey,
      issuerKey: keys.privateKey,
      issuerName: address,
      serial: 1,
      notBefore: clock.now() - LIFETIME_MS,
      notAfter: clock.now() + LIFETIME_MS * VALID_LIFETIMES,
    }),
    keyPem: keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

/** One request over TLS to `host:port`, verified against `ca` alone, on its own connection. A body goes with its length. */
export function tlsRequest(options: {
  readonly host: string;
  readonly port: number;
  readonly ca: string;
  readonly path: string;
  readonly method?: string;
  readonly headers?: Record<string, string>;
  readonly body?: string;
}): Promise<TlsAnswer> {
  const length = options.body === undefined ? {} : { "content-length": String(Buffer.byteLength(options.body)) };
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: options.host,
        port: options.port,
        path: options.path,
        method: options.method ?? "GET",
        headers: { ...length, ...options.headers },
        ca: options.ca,
        agent: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const cookie = (res.headers["set-cookie"] ?? []).map((line) => line.split(";")[0] ?? "").join("; ");
          resolve({ status: res.statusCode ?? 0, cookie, body: Buffer.concat(chunks).toString("utf8") });
        });
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.end(options.body);
  });
}
