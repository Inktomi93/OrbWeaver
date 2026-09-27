// infra/network/tls-terminator — the IP certificate's https listener (D269). A real TLS listener with a certificate
// for 127.0.0.1, verified by the client against that certificate, forwarding to a recording http upstream: the app
// must see this hop's facts about the socket, never the visitor's own forwarding headers.

import type { KeyObject } from "node:crypto";
import { generateKeyPairSync, X509Certificate } from "node:crypto";
import type { IncomingHttpHeaders, Server } from "node:http";
import { createServer } from "node:http";
import { request as httpsRequest } from "node:https";
import type { AddressInfo } from "node:net";
import type { TLSSocket } from "node:tls";
import { connect as tlsConnect } from "node:tls";
import type { TlsTerminator } from "@orb/server/infra/network";
import { startTlsTerminator } from "@orb/server/infra/network";
import { afterEach, describe } from "vitest";
import { createFrozenClock } from "../../../support/clock.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { ipCertificatePem } from "../../../support/node/x509.ts";

const LOOPBACK = "127.0.0.1";
const LIFETIME_MS = 160 * 3_600_000;

interface Seen {
  readonly method: string | undefined;
  readonly url: string | undefined;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
}

interface Pair {
  readonly certificatePem: string;
  readonly keyPem: string;
}

function selfSigned(serial: number): Pair {
  const clock = createFrozenClock();
  const keys: { privateKey: KeyObject; publicKey: KeyObject } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return {
    certificatePem: ipCertificatePem({
      address: LOOPBACK,
      subjectPublicKey: keys.publicKey,
      issuerKey: keys.privateKey,
      issuerName: LOOPBACK,
      serial,
      notBefore: clock.now() - LIFETIME_MS,
      notAfter: clock.now() + LIFETIME_MS * 1000,
    }),
    keyPem: keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

let upstream: Server | null = null;
let terminator: TlsTerminator | null = null;

afterEach(async () => {
  await terminator?.close();
  terminator = null;
  await new Promise<void>((resolve) => {
    if (upstream === null) {
      resolve();
      return;
    }
    upstream.close(() => {
      resolve();
    });
    upstream.closeAllConnections();
  });
  upstream = null;
});

async function start(pair: Pair): Promise<{ readonly seen: Seen[]; readonly port: number }> {
  const seen: Seen[] = [];
  const app = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString("utf-8") });
      if (req.url === "/stream") {
        res.writeHead(200, { "content-type": "text/event-stream", connection: "keep-alive" });
        res.write("data: first\n\n");
        return;
      }
      res.writeHead(200, { "content-type": "text/plain", "set-cookie": ["a=1", "b=2"] });
      res.end("from the app");
    });
  });
  upstream = app;
  await new Promise<void>((resolve) => {
    app.listen(0, LOOPBACK, resolve);
  });
  const appPort = (app.address() as AddressInfo).port;
  terminator = await startTlsTerminator({ port: 0, host: LOOPBACK, ...pair, upstream: () => `http://${LOOPBACK}:${String(appPort)}` });
  return { seen, port: terminator.port };
}

function get(
  port: number,
  pair: Pair,
  options: { readonly path?: string; readonly headers?: Record<string, string>; readonly method?: string; readonly body?: string } = {},
): Promise<{ readonly status: number; readonly headers: IncomingHttpHeaders; readonly body: string; readonly serial: string }> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        host: LOOPBACK,
        port,
        path: options.path ?? "/",
        method: options.method ?? "GET",
        headers: options.headers ?? {},
        ca: pair.certificatePem,
        agent: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        const serial = (res.socket as TLSSocket).getPeerX509Certificate()?.serialNumber ?? "";
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString("utf-8"), serial });
        });
      },
    );
    req.on("error", reject);
    req.end(options.body);
  });
}

describe("startTlsTerminator", () => {
  test("a verified TLS request reaches the app with this hop's address and https, and the answer comes back", async () => {
    const pair = selfSigned(1);
    const { seen, port } = await start(pair);
    const answer = await get(port, pair, { path: "/api/auth/config?x=1", headers: { host: "81.2.69.160" } });
    expect(answer).toMatchObject({ status: 200, body: "from the app" });
    expect(answer.headers["set-cookie"]).toEqual(["a=1", "b=2"]);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe("/api/auth/config?x=1");
    expect(seen[0]?.headers["x-forwarded-for"]).toBe(LOOPBACK);
    expect(seen[0]?.headers["x-forwarded-proto"]).toBe("https");
    expect(seen[0]?.headers.host).toBe("81.2.69.160");
  });

  test("a visitor's own forwarding headers are dropped, never appended to", async () => {
    const pair = selfSigned(1);
    const { seen, port } = await start(pair);
    await get(port, pair, {
      headers: {
        "x-forwarded-for": "10.0.0.5",
        "x-forwarded-proto": "http",
        "x-real-ip": "10.0.0.6",
        forwarded: "for=10.0.0.7;proto=http",
        "x-forwarded-host": "evil.example",
        connection: "x-orb-csrf, close",
        "x-orb-csrf": "1",
      },
    });
    const headers = seen[0]?.headers ?? {};
    expect(headers["x-forwarded-for"]).toBe(LOOPBACK);
    expect(headers["x-forwarded-proto"]).toBe("https");
    expect(headers["x-real-ip"]).toBeUndefined();
    expect(headers.forwarded).toBeUndefined();
    expect(headers["x-forwarded-host"]).toBeUndefined();
    // A header the visitor named in Connection is hop-by-hop and stops here.
    expect(headers["x-orb-csrf"]).toBeUndefined();
  });

  test("Host is always the visitor's, even when the visitor lists it in Connection; a request with no Host is refused", async () => {
    const pair = selfSigned(1);
    const { seen, port } = await start(pair);
    await get(port, pair, { headers: { host: "81.2.69.160", connection: "host" } });
    expect(seen[0]?.headers.host).toBe("81.2.69.160");
    // HTTP/1.0 may omit Host, and node's own Host check covers only HTTP/1.1, so this hop refuses it itself.
    const bare = await new Promise<string>((resolve, reject) => {
      const socket = tlsConnect({ host: LOOPBACK, port, ca: pair.certificatePem }, () => {
        socket.write("GET / HTTP/1.0\r\n\r\n");
      });
      const chunks: Buffer[] = [];
      socket.on("data", (chunk: Buffer) => chunks.push(chunk));
      socket.on("end", () => {
        resolve(Buffer.concat(chunks).toString("latin1").split("\r\n")[0] ?? "");
      });
      socket.on("error", reject);
    });
    expect(bare).toMatch(/^HTTP\/1\.[01] 400 /u);
    expect(seen).toHaveLength(1);
  });

  test("a request body is forwarded whole", async () => {
    const pair = selfSigned(1);
    const { seen, port } = await start(pair);
    await get(port, pair, { method: "POST", path: "/api/trpc/share.start", headers: { "content-type": "application/json" }, body: '{"a":1}' });
    expect(seen[0]).toMatchObject({ method: "POST", url: "/api/trpc/share.start", body: '{"a":1}' });
  });

  test("an absolute-form or scheme-relative target is refused with a 400 and never reaches the app", async () => {
    const pair = selfSigned(1);
    const { seen, port } = await start(pair);
    for (const path of ["http://169.254.169.254/latest/meta-data", "//169.254.169.254/latest", "*"]) {
      expect((await get(port, pair, { path })).status).toBe(400);
    }
    expect(seen).toEqual([]);
  });

  test("a streamed answer arrives before the app ends it", async () => {
    const pair = selfSigned(1);
    const { port } = await start(pair);
    const firstChunk = await new Promise<string>((resolve, reject) => {
      const req = httpsRequest({ host: LOOPBACK, port, path: "/stream", ca: pair.certificatePem, agent: false }, (res) => {
        res.once("data", (chunk: Buffer) => {
          resolve(chunk.toString("utf-8"));
          req.destroy();
        });
      });
      req.on("error", reject);
      req.end();
    });
    expect(firstChunk).toBe("data: first\n\n");
  });

  test("replaceCertificate serves the renewed certificate on the next connection, on the same port", async () => {
    const first = selfSigned(1);
    const renewed = selfSigned(2);
    const { port } = await start(first);
    expect((await get(port, first)).serial).toBe(new X509Certificate(first.certificatePem).serialNumber);
    terminator?.replaceCertificate(renewed.certificatePem, renewed.keyPem);
    expect((await get(port, renewed)).serial).toBe(new X509Certificate(renewed.certificatePem).serialNumber);
  });

  test("control: a client that does not trust the certificate is refused at the handshake", async () => {
    const pair = selfSigned(1);
    const { seen, port } = await start(pair);
    await expect(get(port, selfSigned(3))).rejects.toThrow();
    expect(seen).toEqual([]);
  });
});
