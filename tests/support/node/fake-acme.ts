// A fake ACME certificate authority over plain http on loopback (RFC 8555), for the IP certificate issuer tests (D269).
// It records every signed request's protected header and payload, validates HTTP-01 by fetching the challenge from
// the issuer's own responder, and signs a leaf over the CSR's key for the order's IP identifier.

import { createHash, generateKeyPairSync } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { ipCertificatePem, readCsr } from "./x509.ts";

/** One signed request as the authority decoded it. */
export interface RecordedAcmeRequest {
  readonly path: string;
  readonly protectedHeader: Record<string, unknown>;
  /** The decoded JSON payload; null for a POST-as-GET. */
  readonly payload: Record<string, unknown> | null;
}

/** What the fake authority does with the challenge and the certificate. */
export interface FakeAcmeOptions {
  /** The port the issuer's responder listens on; the authority fetches the challenge there. */
  readonly challengePort: number;
  readonly token: string;
  /** The certificate's validity, epoch ms. */
  readonly notBefore: number;
  readonly notAfter: number;
  /** When set, the authority refuses every new order with this ACME problem, as a 400. */
  readonly refuseOrder?: { readonly type: string; readonly detail: string };
}

export interface FakeAcme {
  readonly directoryUrl: string;
  readonly requests: RecordedAcmeRequest[];
  /** The challenge fetches the authority made, with what each answered. */
  readonly fetches: { readonly url: string; readonly status: number; readonly body: string }[];
  readonly csrs: Buffer[];
  readonly close: () => Promise<void>;
}

const NONCE = "fake-nonce";

function base64urlJson(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf-8")) as Record<string, unknown>;
}

async function body(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

// RFC 7638: the required members of an EC key in lexicographic order.
function thumbprint(jwk: Record<string, unknown>): string {
  const canonical = JSON.stringify({ crv: jwk["crv"], kty: jwk["kty"], x: jwk["x"], y: jwk["y"] });
  return createHash("sha256").update(canonical).digest("base64url");
}

function send(res: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}): void {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  res.writeHead(status, { "content-type": "application/json", "replay-nonce": NONCE, ...headers });
  res.end(text);
}

// A signed request's decoded protected header and payload; the payload is null for a POST-as-GET.
interface Signed {
  readonly protectedHeader: Record<string, unknown>;
  readonly payload: Record<string, unknown> | null;
}

/** Starts the authority on an ephemeral loopback port. */
export async function startFakeAcme(options: FakeAcmeOptions): Promise<FakeAcme> {
  const requests: RecordedAcmeRequest[] = [];
  const fetches: { url: string; status: number; body: string }[] = [];
  const csrs: Buffer[] = [];
  const ca = generateKeyPairSync("ec", { namedCurve: "P-256" });
  let base = "";
  let accountJwk: Record<string, unknown> = {};
  let identifier = { type: "", value: "" };
  let challengeStatus: "pending" | "valid" | "invalid" = "pending";
  let challengeError: { type: string; detail: string } | null = null;
  let orderStatus: "pending" | "ready" | "valid" = "pending";
  let certificate = "";

  const challenge = (): Record<string, unknown> => ({
    type: "http-01",
    url: `${base}/chall/1`,
    token: options.token,
    status: challengeStatus,
    ...(challengeError === null ? {} : { error: challengeError }),
  });
  const order = (): Record<string, unknown> => ({
    status: orderStatus,
    identifiers: [identifier],
    authorizations: [`${base}/authz/1`],
    finalize: `${base}/order/1/finalize`,
    ...(orderStatus === "valid" ? { certificate: `${base}/cert/1` } : {}),
  });

  async function validate(): Promise<void> {
    const url = `http://127.0.0.1:${String(options.challengePort)}/.well-known/acme-challenge/${options.token}`;
    const expected = `${options.token}.${thumbprint(accountJwk)}`;
    try {
      const answer = await fetch(url);
      const text = await answer.text();
      fetches.push({ url, status: answer.status, body: text });
      challengeStatus = answer.status === 200 && text === expected ? "valid" : "invalid";
      challengeError =
        challengeStatus === "valid" ? null : { type: "urn:ietf:params:acme:error:unauthorized", detail: `the challenge answered ${String(answer.status)}` };
    } catch (err) {
      fetches.push({ url, status: 0, body: "" });
      challengeStatus = "invalid";
      challengeError = { type: "urn:ietf:params:acme:error:connection", detail: `could not connect: ${err instanceof Error ? err.message : String(err)}` };
    }
    if (challengeStatus === "valid") {
      orderStatus = "ready";
    }
  }

  // One handler per signed resource; each answers the way RFC 8555 section 7 shapes that resource.
  const signedRoutes: Record<string, (res: ServerResponse, signed: Signed) => Promise<void> | void> = {
    "/new-account": (res, { protectedHeader }) => {
      accountJwk = (protectedHeader["jwk"] as Record<string, unknown> | undefined) ?? {};
      send(res, 201, { status: "valid" }, { location: `${base}/acct/1` });
    },
    "/new-order": (res, { payload }) => {
      if (options.refuseOrder !== undefined) {
        send(res, 400, options.refuseOrder, { "content-type": "application/problem+json" });
        return;
      }
      const [first] = (payload?.["identifiers"] as { type: string; value: string }[] | undefined) ?? [];
      identifier = first ?? identifier;
      send(res, 201, order(), { location: `${base}/order/1` });
    },
    "/authz/1": (res) => {
      send(res, 200, { status: challengeStatus, identifier, challenges: [challenge()] });
    },
    "/chall/1": async (res, { payload }) => {
      if (payload !== null) {
        await validate();
      }
      send(res, 200, challenge());
    },
    "/order/1/finalize": (res, { payload }) => {
      const csr = Buffer.from(String(payload?.["csr"]), "base64url");
      csrs.push(csr);
      certificate = ipCertificatePem({
        address: identifier.value,
        subjectPublicKey: readCsr(csr).publicKey,
        issuerKey: ca.privateKey,
        issuerName: "Fake ACME CA",
        serial: 1,
        notBefore: options.notBefore,
        notAfter: options.notAfter,
      });
      orderStatus = "valid";
      send(res, 200, order());
    },
    "/order/1": (res) => {
      send(res, 200, order());
    },
    "/cert/1": (res) => {
      send(res, 200, certificate, { "content-type": "application/pem-certificate-chain" });
    },
  };

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = req.url ?? "/";
    if (path === "/directory") {
      send(res, 200, { newNonce: `${base}/new-nonce`, newAccount: `${base}/new-account`, newOrder: `${base}/new-order` });
      return;
    }
    if (path === "/new-nonce") {
      send(res, 200, "");
      return;
    }
    const jws = JSON.parse(await body(req)) as { protected: string; payload: string };
    const signed: Signed = { protectedHeader: base64urlJson(jws.protected), payload: jws.payload === "" ? null : base64urlJson(jws.payload) };
    requests.push({ path, ...signed });
    const handler = signedRoutes[path];
    if (handler === undefined) {
      send(res, 404, { type: "urn:ietf:params:acme:error:malformed", detail: `no route ${path}` });
      return;
    }
    await handler(res, signed);
  }

  const server = createServer((req, res) => {
    route(req, res).catch((err: unknown) => {
      send(res, 500, { type: "urn:ietf:params:acme:error:serverInternal", detail: String(err) });
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  return {
    directoryUrl: `${base}/directory`,
    requests,
    fetches,
    csrs,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
        server.closeAllConnections();
      }),
  };
}
