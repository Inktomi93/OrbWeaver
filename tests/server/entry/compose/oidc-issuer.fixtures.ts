// A scripted external issuer: native clients still own discovery, token processing and JWT verification.

import { createHash, randomUUID } from "node:crypto";
import type { JWTPayload } from "jose";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

export const ISSUER = "https://native-issuer.example/";
export const CLIENT_ID = "orb-native-proof";
export const CLIENT_SECRET = "native-issuer-client-secret";
export const CALLBACK = "http://localhost/api/auth/oidc/callback";
const SIGNING_KEY = "native-proof-key";
const DISCOVERY = "/.well-known/openid-configuration";
const AUTHORIZE = "/authorize";
const TOKEN = "/token";
const JWKS = "/jwks";
const END_SESSION = "/end-session";
const TOKEN_LIFETIME_SECONDS = 300;

interface NativeIssuer {
  readonly fetch: typeof fetch;
  readonly calls: string[];
  readonly idTokens: string[];
  readonly authorize: (authorizationUrl: string, claims: JWTPayload) => URL;
  readonly logoutToken: (claims: Readonly<Record<string, unknown>>, omittedClaims?: readonly string[]) => Promise<string>;
}

/** Sign real issuer output; no Configuration, exchange, domain or accepted identity is fabricated. */
export async function createNativeIssuer(): Promise<NativeIssuer> {
  const keys = await generateKeyPair("RS256", { extractable: true });
  const publicKey = { ...(await exportJWK(keys.publicKey)), kid: SIGNING_KEY, alg: "RS256", use: "sig" };
  const grants = new Map<string, { readonly authorization: URL; readonly claims: JWTPayload }>();
  const calls: string[] = [];
  const idTokens: string[] = [];
  const sign = (claims: JWTPayload): Promise<string> =>
    new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid: SIGNING_KEY }).setIssuedAt().setExpirationTime("5m").sign(keys.privateKey);
  async function tokenResponse(request: Request): Promise<Response> {
    const form = new URLSearchParams(await request.text());
    const code = form.get("code") ?? "";
    const grant = grants.get(code);
    grants.delete(code);
    if (grant === undefined) {
      return Response.json({ error: "invalid_grant" }, { status: 400 });
    }
    const authorization = grant.authorization.searchParams;
    const verifier = form.get("code_verifier") ?? "";
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const clientAuthenticated =
      request.headers.get("authorization") === `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}` ||
      (form.get("client_id") === CLIENT_ID && form.get("client_secret") === CLIENT_SECRET);
    if (
      !clientAuthenticated ||
      form.get("grant_type") !== "authorization_code" ||
      form.get("redirect_uri") !== authorization.get("redirect_uri") ||
      authorization.get("code_challenge_method") !== "S256" ||
      challenge !== authorization.get("code_challenge")
    ) {
      return Response.json({ error: "invalid_grant" }, { status: 400 });
    }
    const token = await sign({ iss: ISSUER, aud: CLIENT_ID, nonce: authorization.get("nonce"), ...grant.claims });
    idTokens.push(token);
    // biome-ignore lint/style/useNamingConvention: OIDC token endpoint JSON uses the native protocol's fixed wire field names.
    return Response.json({ access_token: "scripted-issuer-access-token", token_type: "Bearer", expires_in: 300, id_token: token });
  }
  return {
    calls,
    idTokens,
    authorize: (authorizationUrl, claims): URL => {
      const authorization = new URL(authorizationUrl);
      const code = randomUUID();
      grants.set(code, { authorization, claims });
      const callback = new URL(authorization.searchParams.get("redirect_uri") ?? "");
      callback.searchParams.set("state", authorization.searchParams.get("state") ?? "");
      callback.searchParams.set("code", code);
      return callback;
    },
    logoutToken: (claims, omittedClaims = []): Promise<string> => {
      const issuedAt = Math.floor(Date.now() / 1000);
      const payload: Record<string, unknown> = {
        iss: ISSUER,
        aud: CLIENT_ID,
        iat: issuedAt,
        exp: issuedAt + TOKEN_LIFETIME_SECONDS,
        jti: randomUUID(),
        ...claims,
      };
      for (const claim of omittedClaims) {
        delete payload[claim];
      }
      return new SignJWT(payload).setProtectedHeader({ alg: "RS256", kid: SIGNING_KEY }).sign(keys.privateKey);
    },
    fetch: async (input, init): Promise<Response> => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      calls.push(`${request.method} ${url.pathname}`);
      if (url.origin !== new URL(ISSUER).origin) {
        throw new Error("native issuer received an unscripted origin");
      }
      if (url.pathname === DISCOVERY) {
        return Response.json({
          issuer: ISSUER,
          // biome-ignore lint/style/useNamingConvention: OIDC discovery fixes this wire field spelling.
          authorization_endpoint: new URL(AUTHORIZE, ISSUER).href,
          // biome-ignore lint/style/useNamingConvention: OIDC discovery fixes this wire field spelling.
          token_endpoint: new URL(TOKEN, ISSUER).href,
          // biome-ignore lint/style/useNamingConvention: OIDC discovery fixes this wire field spelling.
          jwks_uri: new URL(JWKS, ISSUER).href,
          // biome-ignore lint/style/useNamingConvention: OIDC discovery fixes this wire field spelling.
          end_session_endpoint: new URL(END_SESSION, ISSUER).href,
          // biome-ignore lint/style/useNamingConvention: OIDC discovery fixes this wire field spelling.
          response_types_supported: ["code"],
          // biome-ignore lint/style/useNamingConvention: OIDC discovery fixes this wire field spelling.
          subject_types_supported: ["public"],
          // biome-ignore lint/style/useNamingConvention: OIDC discovery fixes this wire field spelling.
          id_token_signing_alg_values_supported: ["RS256"],
          // biome-ignore lint/style/useNamingConvention: OIDC discovery fixes this wire field spelling.
          token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
        });
      }
      if (url.pathname === JWKS) {
        return Response.json({ keys: [publicKey] });
      }
      if (url.pathname !== TOKEN || request.method !== "POST") {
        throw new Error("native issuer received an unscripted request");
      }
      return await tokenResponse(request);
    },
  };
}
