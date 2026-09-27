// The IP certificate's https listener (D269). It ends TLS and hands each request to the app's own listener over
// loopback as a same-host proxy, so the app still learns `https` only from a trusted hop's X-Forwarded-Proto (D255).
// SECURITY: the visitor's forwarding headers are replaced by the socket's own facts; only an origin-form target with
// its own Host is forwarded; and every body is re-framed explicitly upstream (see `framing`), on a connection of its own.

import type { IncomingHttpHeaders, IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import { request as httpRequest } from "node:http";
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
const HOP_BY_HOP = new Set(["connection", "keep-alive", "proxy-connection", "te", "trailer", "upgrade", "proxy-authorization", "proxy-authenticate"]);
// The message framing: never copied from the visitor and never removable through Connection; `framing` rewrites it.
const FRAMING = new Set(["content-length", "transfer-encoding"]);
// What this hop asserts itself; a visitor's own copy of any of them is dropped.
const FORWARDING = new Set(["x-forwarded-for", "x-forwarded-proto", "x-forwarded-host", "x-forwarded-port", "forwarded", "x-real-ip"]);
// Host is end-to-end: listed in Connection and dropped, the app would see this hop's own loopback origin instead.
const NEVER_LISTED = new Set(["host", ...FRAMING]);

function connectionTokens(headers: IncomingHttpHeaders): ReadonlySet<string> {
  const raw = headers.connection;
  return new Set(
    (raw ?? "")
      .split(",")
      .map((token) => token.trim().toLowerCase())
      .filter((token) => token !== "" && !NEVER_LISTED.has(token)),
  );
}

function withoutHopByHop(headers: IncomingHttpHeaders, drop: ReadonlySet<string>): OutgoingHttpHeaders {
  const listed = connectionTokens(headers);
  const kept: OutgoingHttpHeaders = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined && !HOP_BY_HOP.has(name) && !listed.has(name) && !drop.has(name)) {
      kept[name] = value;
    }
  }
  return kept;
}

// SECURITY: the visitor's body reaches this hop already de-framed, and node's client sends a GET, HEAD, DELETE or
// OPTIONS body unframed unless told otherwise, so the app would parse those bytes as a second request from loopback.
// Every body therefore goes upstream framed explicitly, whatever the method: chunked when the visitor chunked it (node
// refuses any other transfer coding and any length beside it), else the one length node already validated.
function framing(headers: IncomingHttpHeaders): OutgoingHttpHeaders {
  if (headers["transfer-encoding"] !== undefined) {
    return { "transfer-encoding": "chunked" };
  }
  const length = headers["content-length"];
  return length === undefined ? {} : { "content-length": length };
}

// The headers the app receives: the visitor's end-to-end headers, this hop's framing, then its facts about the socket.
function forwardedHeaders(headers: IncomingHttpHeaders, peer: string | undefined): OutgoingHttpHeaders {
  return {
    ...withoutHopByHop(headers, new Set([...FORWARDING, ...FRAMING])),
    ...framing(headers),
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

// SECURITY: `agent: false` opens one upstream connection per request and closes it after, so nothing a request leaves
// on its connection can ever reach another request, another visitor's above all. Loopback connects are cheap.
function forward(upstream: () => string): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    if (!isOriginForm(req.url) || req.headers.host === undefined) {
      res.writeHead(BAD_REQUEST, { "content-length": 0 });
      res.end();
      return;
    }
    const target = upstreamTarget(upstream());
    const outbound = httpRequest(
      { ...target, agent: false, method: req.method, path: req.url, headers: forwardedHeaders(req.headers, req.socket.remoteAddress) },
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

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => {
      resolve();
    });
    server.closeAllConnections();
  });
}

/** Binds the https listener and resolves once it listens.
 *  @throws the bind error (a port in use, a port this process may not bind) when the listener cannot open. */
export function startTlsTerminator(options: TlsTerminatorOptions): Promise<TlsTerminator> {
  const server = createServer({ cert: options.certificatePem, key: options.keyPem, minVersion: MIN_TLS_VERSION }, forward(options.upstream));
  return new Promise<TlsTerminator>((resolve, reject) => {
    const onError = (err: Error): void => {
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
        close: () => closeServer(server),
      });
    });
  });
}
