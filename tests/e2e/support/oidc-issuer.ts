// The OIDC e2e issuer: HTTPS on loopback, so the server's real openid-client discovery and code grant run unchanged.
// Authorize consents at once for the identity a spec staged and returns the code with the untouched state; token
// checks the client secret, redirect URI and PKCE verifier, then signs an RS256 id_token carrying the nonce.

import type { KeyObject } from "node:crypto";
import { createHash, generateKeyPairSync, randomBytes, timingSafeEqual, X509Certificate } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer, request as httpsRequest } from "node:https";
import { join } from "node:path";
import { ipCertificatePem } from "@orb/testkit/node/x509.ts";
import { exportJWK, SignJWT } from "jose";
import { z } from "zod";

const LOOPBACK = "127.0.0.1";
const CERT_FILE = "issuer-cert.pem";
const KEY_FILE = "issuer-key.pem";
const DAY_MS = 86_400_000;
const CERT_LIFETIME_DAYS = 365;
const ID_TOKEN_LIFETIME = "5m";
const ACCESS_TOKEN_SECONDS = 300;
const SECRET_BYTES = 32;
const SIGNING_KID = "e2e-oidc-issuer";
const SIGNING_ALG = "RS256";
const RSA_BITS = 2048;
const STAGE_PATH = "/__e2e/identity";
const PATHS = { discovery: "/.well-known/openid-configuration", authorize: "/authorize", token: "/token", jwks: "/jwks" } as const;
const HTTP = { ok: 200, found: 302, badRequest: 400, unauthorized: 401, notFound: 404 } as const;

/** The loopback certificate and key; `certPath` is what the server child trusts through `NODE_EXTRA_CA_CERTS`. */
export interface IssuerTls {
  readonly cert: string;
  readonly key: string;
  readonly certPath: string;
}

const stagedIdentitySchema = z.strictObject({
  sub: z.string().min(1),
  preferredUsername: z.string().min(1),
  email: z.string().optional(),
  groups: z.array(z.string()).readonly().optional(),
});

/** The identity the next authorize request consents for; the token maps it to the claims the server reads by default. */
export type StagedIdentity = z.infer<typeof stagedIdentitySchema>;

/** A running issuer; stage its next identity with {@link stageIssuerIdentity}. */
export interface OidcIssuer extends AsyncDisposable {
  readonly url: string;
}

interface PendingCode {
  readonly redirectUri: string;
  readonly nonce: string | null;
  readonly challenge: string;
  readonly identity: StagedIdentity;
}

/** Where {@link ensureIssuerTls} keeps the certificate in `dir`; a reader that must not mint takes the path from here. */
export function issuerCertPath(dir: string): string {
  return join(dir, CERT_FILE);
}

/** Mint the self-signed loopback certificate once per directory, again only after it expires. */
export function ensureIssuerTls(dir: string, now: number = Date.now()): IssuerTls {
  const certPath = issuerCertPath(dir);
  const keyPath = join(dir, KEY_FILE);
  const current = existsSync(certPath) && existsSync(keyPath) && new Date(new X509Certificate(readFileSync(certPath)).validTo).getTime() > now + DAY_MS;
  if (!current) {
    mkdirSync(dir, { recursive: true });
    const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    writeFileSync(keyPath, privateKey.export({ type: "pkcs8", format: "pem" }));
    writeFileSync(
      certPath,
      ipCertificatePem({
        address: LOOPBACK,
        subjectPublicKey: publicKey,
        issuerKey: privateKey,
        issuerName: LOOPBACK,
        serial: 1,
        notBefore: now - DAY_MS,
        notAfter: now + CERT_LIFETIME_DAYS * DAY_MS,
      }),
    );
  }
  return { cert: readFileSync(certPath, "utf8"), key: readFileSync(keyPath, "utf8"), certPath };
}

function base64Url(bytes: Buffer): string {
  return bytes.toString("base64url");
}

function sameSecret(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

// RFC 6749 §2.3.1: client_secret_basic form-encodes both halves before base64.
function presentedClient(request: IncomingMessage, form: URLSearchParams): { readonly id: string; readonly secret: string } | null {
  const header = request.headers.authorization;
  if (header?.startsWith("Basic ") === true) {
    const [id = "", secret = ""] = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8").split(":");
    return { id: decodeURIComponent(id), secret: decodeURIComponent(secret) };
  }
  const id = form.get("client_id");
  const secret = form.get("client_secret");
  return id === null || secret === null ? null : { id, secret };
}

/** Does this token request redeem `pending`: a code grant to its redirect URI, with the verifier for its challenge? */
function redeems(form: URLSearchParams, pending: PendingCode | undefined): pending is PendingCode {
  return (
    form.get("grant_type") === "authorization_code" &&
    pending !== undefined &&
    form.get("redirect_uri") === pending.redirectUri &&
    base64Url(
      createHash("sha256")
        .update(form.get("code_verifier") ?? "")
        .digest(),
    ) === pending.challenge
  );
}

/** The id_token's identity claims, under the names the server reads by default. */
function identityClaims(identity: StagedIdentity, nonce: string | null): Record<string, unknown> {
  const optional: [string, unknown][] = [
    ["email", identity.email],
    ["groups", identity.groups === undefined ? undefined : [...identity.groups]],
    ["nonce", nonce ?? undefined],
  ];
  return Object.fromEntries([["preferred_username", identity.preferredUsername], ...optional.filter(([, value]) => value !== undefined)]);
}

/** Start the issuer on `port` (0 picks one). Its URL is the OIDC_ISSUER the server child discovers. */
export async function startOidcIssuer(options: {
  readonly port: number;
  readonly tls: IssuerTls;
  readonly clientId: string;
  readonly clientSecret: string;
}): Promise<OidcIssuer> {
  const { publicKey, privateKey }: { publicKey: KeyObject; privateKey: KeyObject } = generateKeyPairSync("rsa", { modulusLength: RSA_BITS });
  const jwk = { ...(await exportJWK(publicKey)), kid: SIGNING_KID, alg: SIGNING_ALG, use: "sig" };
  const codes = new Map<string, PendingCode>();
  let staged: StagedIdentity | null = null;
  let url = "";

  const authorize = (query: URLSearchParams, response: ServerResponse): void => {
    const redirectUri = query.get("redirect_uri");
    const challenge = query.get("code_challenge");
    if (
      query.get("client_id") !== options.clientId ||
      query.get("response_type") !== "code" ||
      query.get("code_challenge_method") !== "S256" ||
      redirectUri === null ||
      challenge === null ||
      staged === null
    ) {
      json(response, HTTP.badRequest, { error: "invalid_request" });
      return;
    }
    const code = base64Url(randomBytes(SECRET_BYTES));
    codes.set(code, { redirectUri, nonce: query.get("nonce"), challenge, identity: staged });
    const back = new URL(redirectUri);
    back.searchParams.set("code", code);
    const state = query.get("state");
    if (state !== null) {
      back.searchParams.set("state", state);
    }
    response.writeHead(HTTP.found, { location: back.href });
    response.end();
  };

  const token = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const form = new URLSearchParams(await readBody(request));
    const client = presentedClient(request, form);
    if (client === null || client.id !== options.clientId || !sameSecret(client.secret, options.clientSecret)) {
      json(response, HTTP.unauthorized, { error: "invalid_client" });
      return;
    }
    const code = form.get("code") ?? "";
    const pending = codes.get(code);
    // A code is single-use: the lookup consumes it whether or not the rest of the request holds.
    codes.delete(code);
    if (!redeems(form, pending)) {
      json(response, HTTP.badRequest, { error: "invalid_grant" });
      return;
    }
    const idToken = await new SignJWT(identityClaims(pending.identity, pending.nonce))
      .setProtectedHeader({ alg: SIGNING_ALG, kid: SIGNING_KID })
      .setIssuer(url)
      .setAudience(options.clientId)
      .setSubject(pending.identity.sub)
      .setIssuedAt()
      .setExpirationTime(ID_TOKEN_LIFETIME)
      .sign(privateKey);
    json(
      response,
      HTTP.ok,
      Object.fromEntries([
        ["access_token", base64Url(randomBytes(SECRET_BYTES))],
        ["token_type", "Bearer"],
        ["expires_in", ACCESS_TOKEN_SECONDS],
        ["id_token", idToken],
      ]),
    );
  };

  const server = createServer({ cert: options.tls.cert, key: options.tls.key }, (request, response) => {
    const requestUrl = new URL(request.url ?? "/", url);
    const route = `${request.method ?? "GET"} ${requestUrl.pathname}`;
    const handled = ((): Promise<void> | undefined => {
      switch (route) {
        case `GET ${PATHS.discovery}`:
          json(
            response,
            HTTP.ok,
            Object.fromEntries([
              ["issuer", url],
              ["authorization_endpoint", `${url}${PATHS.authorize}`],
              ["token_endpoint", `${url}${PATHS.token}`],
              ["jwks_uri", `${url}${PATHS.jwks}`],
              ["response_types_supported", ["code"]],
              ["subject_types_supported", ["public"]],
              ["id_token_signing_alg_values_supported", [SIGNING_ALG]],
              ["code_challenge_methods_supported", ["S256"]],
              ["token_endpoint_auth_methods_supported", ["client_secret_basic", "client_secret_post"]],
            ]),
          );
          return;
        case `GET ${PATHS.jwks}`:
          json(response, HTTP.ok, { keys: [jwk] });
          return;
        case `GET ${PATHS.authorize}`:
          authorize(requestUrl.searchParams, response);
          return;
        case `POST ${PATHS.token}`:
          return token(request, response);
        case `POST ${STAGE_PATH}`:
          return readBody(request).then((body) => {
            staged = stagedIdentitySchema.parse(JSON.parse(body));
            response.writeHead(HTTP.ok).end();
          });
        default:
          json(response, HTTP.notFound, { error: "not_found" });
          return;
      }
    })();
    handled?.catch((error: unknown) => json(response, HTTP.badRequest, { error: String(error) }));
  });
  await new Promise<void>((resolve) => server.listen(options.port, LOOPBACK, resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("the OIDC issuer did not bind a TCP port");
  }
  url = `https://${LOOPBACK}:${String(address.port)}`;
  return { url, [Symbol.asyncDispose]: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

/** Stage the next authorize identity from another process (a spec worker), trusting only the issuer certificate. */
export function stageIssuerIdentity(issuerUrl: string, identity: StagedIdentity, ca: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const sent = httpsRequest(new URL(STAGE_PATH, issuerUrl), { method: "POST", ca, headers: { "content-type": "application/json" } }, (answer) => {
      answer.resume();
      answer.on("end", () =>
        answer.statusCode === HTTP.ok ? resolve() : reject(new Error(`the issuer refused the staged identity: ${String(answer.statusCode)}`)),
      );
    });
    sent.on("error", reject);
    sent.end(JSON.stringify(identity));
  });
}
