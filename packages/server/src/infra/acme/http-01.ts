// The HTTP-01 responder (RFC 8555 section 8.3). One listener per pending challenge, opened by the issuer just before it
// asks the certificate authority to validate and closed as soon as the challenge settles.
// SECURITY: it answers exactly `GET` or `HEAD /.well-known/acme-challenge/<token>` and 404s every other method, path and
// query, so the port the router forwards from 80 exposes nothing of the app, and nothing at all between challenges.

import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createServer } from "node:http";
import type { ChallengeResponse, OpenChallenge, OpenChallengeResponder } from "./contract.ts";

const CHALLENGE_PATH_PREFIX = "/.well-known/acme-challenge/";
const OK = 200;
const NOT_FOUND = 404;
// A certificate authority sends one small GET; nothing legitimate needs longer.
const REQUEST_TIMEOUT_MS = 10_000;

function answer(response: ChallengeResponse): (req: IncomingMessage, res: ServerResponse) => void {
  const path = `${CHALLENGE_PATH_PREFIX}${response.token}`;
  const body = Buffer.from(response.keyAuthorization, "utf-8");
  return (req, res) => {
    const read = req.method === "GET" || req.method === "HEAD";
    if (!read || req.url !== path) {
      res.writeHead(NOT_FOUND, { "content-type": "text/plain", "content-length": 0 });
      res.end();
      return;
    }
    res.writeHead(OK, { "content-type": "text/plain", "content-length": body.length });
    res.end(req.method === "HEAD" ? undefined : body);
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

/** Listens on `response.port` (and `response.host`, when set) until the returned `close`. */
export const openChallengeResponder: OpenChallengeResponder = (response) =>
  new Promise<OpenChallenge>((resolve, reject) => {
    const server = createServer({ requestTimeout: REQUEST_TIMEOUT_MS, headersTimeout: REQUEST_TIMEOUT_MS }, answer(response));
    const onError = (err: Error): void => {
      reject(err);
    };
    server.once("error", onError);
    server.listen({ port: response.port, ...(response.host === undefined ? {} : { host: response.host }) }, () => {
      server.off("error", onError);
      resolve({ close: () => closeServer(server) });
    });
  });
