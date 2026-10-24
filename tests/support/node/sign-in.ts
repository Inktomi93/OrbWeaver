// The per-route sign-in steps, free of vitest, so the corpus producers the Playwright process loads can drive them.
// Every refusal is the product's HTTP answer; nothing here decides admission.

import { CSRF_HEADER } from "@orb/contracts/identity";
import type { Handle } from "@orb/kit/ids";
import type { JWTPayload } from "jose";
import type { createNativeIssuer } from "./oidc-issuer.ts";
import { CLIENT_ID, ISSUER, NATIVE_OIDC_SETTINGS } from "./oidc-issuer.ts";
import type { ServerTestHarness } from "./server.ts";

export type NativeIssuer = Awaited<ReturnType<typeof createNativeIssuer>>;

const LOGIN_ROUTE = "/api/auth/login";
const OIDC_LOGIN_ROUTE = "/api/auth/oidc/login";
const OIDC_SIGNED_IN_LOCATION = "/";
// The browser origin `NATIVE_OIDC_SETTINGS.OIDC_REDIRECT_URIS` allowlists.
const OIDC_ORIGIN_HOST = new URL(NATIVE_OIDC_SETTINGS.OIDC_REDIRECT_URIS).host;
const FORWARD_JWT_HEADER = "x-authentik-jwt";
const FORWARD_JWKS_HEADER = "x-authentik-meta-jwks";

/** The product refused a sign-in: `status` is the HTTP answer, `location` an OIDC redirect's target. */
export class SignInRefusal extends Error {
  override readonly name = "SignInRefusal";
  readonly status: number;
  readonly location: string | null;

  constructor(step: string, response: Pick<Response, "status" | "headers">, detail = "") {
    const location = response.headers.get("location");
    super(`${step} refused the sign-in (${String(response.status)}${location === null ? "" : ` -> ${location}`})${detail === "" ? "" : `: ${detail}`}`);
    this.status = response.status;
    this.location = location;
  }
}

type HttpRoot = Pick<ServerTestHarness, "http">;

/** The Cookie header a browser sends after `response`: each Set-Cookie pair, with cleared names dropped. */
export function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((line) => line.split(";", 1)[0] ?? "")
    .filter((pair) => !pair.endsWith("="))
    .join("; ");
}

/** `POST /api/auth/login`; the session cookie on success, else the product's refusal. */
export async function signInWithPassword(root: HttpRoot, handle: Handle, password: string, headers: Readonly<Record<string, string>> = {}): Promise<string> {
  const response = await root.http.request(LOGIN_ROUTE, {
    method: "POST",
    headers: { [CSRF_HEADER]: "1", ...headers },
    body: new URLSearchParams({ handle, password }),
  });
  await response.arrayBuffer();
  if (response.status !== 200) {
    throw new SignInRefusal(LOGIN_ROUTE, response);
  }
  return cookieHeader(response);
}

/** A started OIDC login: the issuer's redirect back to the callback, and the browser's binding cookie. */
export interface OidcLogin {
  readonly callback: URL;
  readonly cookie: string;
}

/** `GET /api/auth/oidc/login`, then the scripted issuer authorizes `claims`. */
export async function beginOidcLogin(root: HttpRoot, issuer: NativeIssuer, claims: JWTPayload, query = ""): Promise<OidcLogin> {
  const response = await root.http.request(`${OIDC_LOGIN_ROUTE}${query}`, { headers: { host: OIDC_ORIGIN_HOST } });
  await response.arrayBuffer();
  const authorization = response.headers.get("location");
  if (response.status !== 302 || authorization === null) {
    throw new SignInRefusal(OIDC_LOGIN_ROUTE, response, "no issuer redirect");
  }
  return { callback: issuer.authorize(authorization, claims), cookie: cookieHeader(response) };
}

/** The browser follows the issuer back to the callback carrying `cookie`. */
export async function finishOidcLogin(root: HttpRoot, login: OidcLogin, cookie = login.cookie): Promise<Response> {
  return await root.http.request(login.callback, { headers: { host: OIDC_ORIGIN_HOST, cookie } });
}

/** The full authorization-code flow; the session cookie when the callback lands signed in, else the product's refusal. */
export async function signInWithOidc(root: HttpRoot, issuer: NativeIssuer, claims: JWTPayload, query = ""): Promise<string> {
  const response = await finishOidcLogin(root, await beginOidcLogin(root, issuer, claims, query));
  await response.arrayBuffer();
  if (response.status !== 302 || response.headers.get("location") !== OIDC_SIGNED_IN_LOCATION) {
    throw new SignInRefusal("the OIDC callback", response);
  }
  return cookieHeader(response);
}

/** The request headers a forward-auth proxy sends for `claims`, signed by the issuer the root trusts. */
export async function forwardHeaders(issuer: NativeIssuer, claims: JWTPayload): Promise<Record<string, string>> {
  return {
    [FORWARD_JWT_HEADER]: await issuer.signedToken({ iss: ISSUER, aud: CLIENT_ID, ...claims }),
    [FORWARD_JWKS_HEADER]: new URL("jwks", ISSUER).href,
  };
}
