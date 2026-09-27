// The IP certificate's https listener (D269). It ends TLS and hands each request to the app's own listener over
// loopback as a same-host proxy, so the app still learns `https` only from a trusted hop's X-Forwarded-Proto (D255).
// SECURITY: every forwarding header the visitor sent is dropped and replaced by the socket's own facts, so a visitor can
// never pick its address or its transport. Only an origin-form request target with its own Host is forwarded: an
// absolute or `//` target would aim this hop at another host, and a missing Host would read as this loopback origin.

import type { IncomingHttpHeaders, IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import { Agent, request as httpRequest } from "node:http";
import type { Server } from "node:https";
import { createServer } from "node:https";
import { pipeline } from "node:stream";

/** Where the https listener binds, what it serves, and the app listener it forwards to. */
export interface TlsTerminatorOptions {
  readonly port: number;
  /** The app listener's own interface; undefined binds every interface. */
  readonly host: string | undefined;
  readonly certificatePem: string;
  readonly keyPem: string;
  /** The app listener's loopback origin, such as `http://127.0.0.1:8788`, read per request. */
  readonly upstream: () => string;
}

/** A listening terminator. A renewal swaps the certificate in place; `close` ends every connection. */
export interface TlsTerminator {
  readonly port: number;
  readonly replaceCertificate: (certificatePem: string, keyPem: string) => void;
  readonly close: () => Promise<void>;
}

const BAD_REQUEST = 400;
const BAD_GATEWAY = 502;
const MIN_TLS_VERSION = "TLSv1.2";

// RFC 9110 section 7.6.1 hop-by-hop fields, plus every name the Connection header lists.
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-connection",
  "transfer-encoding",
  "te",
  "trailer",
  "upgrade",
  "proxy-authorization",
  "proxy-authenticate",
]);
// What this hop asserts itself; a visitor's own copy of any of them is dropped.
const FORWARDING = new Set(["x-forwarded-for", "x-forwarded-proto", "x-forwarded-host", "x-forwarded-port", "forwarded", "x-real-ip"]);

function connectionTokens(headers: IncomingHttpHeaders): ReadonlySet<string> {
  const raw = headers.connection;
  return new Set(
    (raw ?? "")
      .split(",")
      .map((token) => token.trim().toLowerCase())
      .filter((token) => token !== ""),
  );
}

function withoutHopByHop(headers: IncomingHttpHeaders, drop: ReadonlySet<string>): OutgoingHttpHeaders {
  // Host is end-to-end and never listable: dropped, the app would see this hop's own loopback origin instead.
  const listed = new Set([...connectionTokens(headers)].filter((token) => token !== "host"));
  const kept: OutgoingHttpHeaders = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined && !HOP_BY_HOP.has(name) && !listed.has(name) && !drop.has(name)) {
      kept[name] = value;
    }
  }
  return kept;
}

// The headers the app receives: the visitor's end-to-end headers, then this hop's own facts about the socket.
function forwardedHeaders(headers: IncomingHttpHeaders, peer: string | undefined): OutgoingHttpHeaders {
  return {
    ...withoutHopByHop(headers, FORWARDING),
    ...(peer === undefined ? {} : { "x-forwarded-for": peer }),
    "x-forwarded-proto": "https",
  };
}

// True for an origin-form request target (`/path?query`), the only form this hop forwards.
function isOriginForm(target: string | undefined): target is string {
  return target !== undefined && target.startsWith("/") && !target.startsWith("//");
}

function upstreamTarget(origin: string): { readonly hostname: string; readonly port: number } {
  const url = new URL(origin);
  return { hostname: url.hostname.replace(/^\[(.*)\]$/u, "$1"), port: Number(url.port) };
}

function forward(agent: Agent, upstream: () => string): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    if (!isOriginForm(req.url) || req.headers.host === undefined) {
      res.writeHead(BAD_REQUEST, { "content-length": 0 });
      res.end();
      return;
    }
    const target = upstreamTarget(upstream());
    const outbound = httpRequest(
      { ...target, agent, method: req.method, path: req.url, headers: forwardedHeaders(req.headers, req.socket.remoteAddress) },
      (answer) => {
        res.writeHead(answer.statusCode ?? BAD_GATEWAY, withoutHopByHop(answer.headers, new Set()));
        pipeline(answer, res, () => undefined);
      },
    );
    outbound.on("error", () => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      res.writeHead(BAD_GATEWAY, { "content-length": 0 });
      res.end();
    });
    res.on("close", () => {
      if (!res.writableFinished) {
        outbound.destroy();
      }
    });
    pipeline(req, outbound, () => undefined);
  };
}

function closeServer(server: Server, agent: Agent): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => {
      agent.destroy();
      resolve();
    });
    server.closeAllConnections();
  });
}

/** Binds the https listener and resolves once it listens.
 *  @throws the bind error (a port in use, a port this process may not bind) when the listener cannot open. */
export function startTlsTerminator(options: TlsTerminatorOptions): Promise<TlsTerminator> {
  const agent = new Agent({ keepAlive: true });
  const server = createServer({ cert: options.certificatePem, key: options.keyPem, minVersion: MIN_TLS_VERSION }, forward(agent, options.upstream));
  return new Promise<TlsTerminator>((resolve, reject) => {
    const onError = (err: Error): void => {
      agent.destroy();
      reject(err);
    };
    server.once("error", onError);
    server.listen({ port: options.port, ...(options.host === undefined ? {} : { host: options.host }) }, () => {
      server.off("error", onError);
      const address = server.address();
      resolve({
        port: typeof address === "object" && address !== null ? address.port : options.port,
        replaceCertificate: (certificatePem, keyPem): void => {
          server.setSecureContext({ cert: certificatePem, key: keyPem, minVersion: MIN_TLS_VERSION });
        },
        close: () => closeServer(server, agent),
      });
    });
  });
}
