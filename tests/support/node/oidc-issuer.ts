// A scripted external issuer: native clients still own discovery, token processing and JWT verification.

import { createHash } from "node:crypto";
import type { GenerateKeyPairAlgorithm, JWTHeaderParameters, JWTPayload, KeyInput } from "jose";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import type { ServerHarnessOptions } from "./server.ts";

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
const TOKEN_LIFETIME = `${String(TOKEN_LIFETIME_SECONDS)}s`;

interface NativeIssuer {
  readonly fetch: typeof fetch;
  readonly calls: string[];
  readonly idTokens: string[];
  readonly authorize: (authorizationUrl: string, claims: JWTPayload) => URL;
  readonly signedToken: (claims: JWTPayload, options?: SignedTokenOptions) => Promise<string>;
  readonly logoutToken: (claims: Readonly<Record<string, unknown>>, omittedClaims?: readonly string[]) => Promise<string>;
}

interface SignedTokenOptions {
  readonly header?: JWTHeaderParameters;
  readonly signingKey?: KeyInput;
  readonly omittedClaims?: readonly string[];
}

/** Sign real issuer output; no Configuration, exchange, domain or accepted identity is fabricated. */
export async function createNativeIssuer(options: { readonly algorithm?: GenerateKeyPairAlgorithm } = {}): Promise<NativeIssuer> {
  const algorithm = options.algorithm ?? "RS256";
  const keys = await generateKeyPair(algorithm, { extractable: true });
  const publicKey = { ...(await exportJWK(keys.publicKey)), kid: SIGNING_KEY, alg: algorithm, use: "sig" };
  const grants = new Map<string, { readonly authorization: URL; readonly claims: JWTPayload }>();
  const calls: string[] = [];
  const idTokens: string[] = [];
  let authorizationCount = 0;
  let logoutCount = 0;
  const sign = (claims: JWTPayload, signing: SignedTokenOptions = {}): Promise<string> => {
    const payload = { ...claims };
    const omitted = signing.omittedClaims ?? [];
    for (const claim of omitted) {
      delete payload[claim];
    }
    const token = new SignJWT(payload).setProtectedHeader(signing.header ?? { alg: algorithm, kid: SIGNING_KEY });
    // Native defaults must not repair raw negative cases or deliberately omitted required claims.
    if (!(Object.hasOwn(claims, "iat") || omitted.includes("iat"))) {
      token.setIssuedAt();
    }
    if (!(Object.hasOwn(claims, "exp") || omitted.includes("exp"))) {
      token.setExpirationTime(TOKEN_LIFETIME);
    }
    return token.sign(signing.signingKey ?? keys.privateKey);
  };
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
    return Response.json({ access_token: "scripted-issuer-access-token", token_type: "Bearer", expires_in: TOKEN_LIFETIME_SECONDS, id_token: token });
  }
  return {
    calls,
    idTokens,
    signedToken: sign,
    authorize: (authorizationUrl, claims): URL => {
      const authorization = new URL(authorizationUrl);
      // This private scripted issuer needs unique grants, not the entropy of a production authorization server.
      const code = `scripted-code-${String(++authorizationCount)}`;
      grants.set(code, { authorization, claims });
      const callback = new URL(authorization.searchParams.get("redirect_uri") ?? "");
      callback.searchParams.set("state", authorization.searchParams.get("state") ?? "");
      callback.searchParams.set("code", code);
      return callback;
    },
    logoutToken: (claims, omittedClaims = []): Promise<string> => {
      const payload: Record<string, unknown> = {
        iss: ISSUER,
        aud: CLIENT_ID,
        jti: `scripted-logout-${String(++logoutCount)}`,
        ...claims,
      };
      for (const claim of omittedClaims) {
        delete payload[claim];
      }
      return sign(payload, { omittedClaims });
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
          id_token_signing_alg_values_supported: [algorithm],
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

export const NATIVE_OIDC_SETTINGS = {
  // biome-ignore lint/style/useNamingConvention: this is the canonical validated startup setting name.
  OIDC_ISSUER: ISSUER,
  // biome-ignore lint/style/useNamingConvention: this is the canonical validated startup setting name.
  OIDC_CLIENT_ID: CLIENT_ID,
  // biome-ignore lint/style/useNamingConvention: this is the canonical validated startup setting name.
  OIDC_CLIENT_SECRET: CLIENT_SECRET,
  // biome-ignore lint/style/useNamingConvention: this is the canonical validated startup setting name.
  OIDC_REDIRECT_URIS: CALLBACK,
  // biome-ignore lint/style/useNamingConvention: this is the canonical validated startup setting name.
  OIDC_SCOPES: "openid profile email",
  // biome-ignore lint/style/useNamingConvention: this is the canonical validated startup setting name.
  OIDC_USERNAME_CLAIM: "preferred_username",
  // biome-ignore lint/style/useNamingConvention: this is the canonical validated startup setting name.
  OIDC_UID_CLAIM: "sub",
  // biome-ignore lint/style/useNamingConvention: this is the canonical validated startup setting name.
  OIDC_GROUPS_CLAIM: "groups",
  // biome-ignore lint/style/useNamingConvention: this is the canonical validated startup setting name.
  OIDC_EMAIL_CLAIM: "email",
  // biome-ignore lint/style/useNamingConvention: this is the canonical validated startup setting name.
  OIDC_GROUPS_SEPARATOR: ";",
  // biome-ignore lint/style/useNamingConvention: this is the canonical validated startup setting name.
  OIDC_SIGNUP: true,
  // biome-ignore lint/style/useNamingConvention: this is the canonical validated startup setting name.
  OIDC_REQUIRE_APPROVAL: false,
  // biome-ignore lint/style/useNamingConvention: this is the canonical validated startup setting name.
  OIDC_BACKCHANNEL_LOGOUT: true,
} satisfies NonNullable<ServerHarnessOptions["oidc"]>;
