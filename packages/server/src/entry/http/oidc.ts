// Bind the native OIDC client, real session/signup operations and owned key-cache/GC lifetime.
// Issuer HTTP stays behind the same graph egress owner as the rest of the production server.

import type { SessionToken } from "@orb/kit/ids";
import type { TimerScheduler } from "@orb/kit/time";
import type { CustomFetch } from "openid-client";
import { authorizationCodeGrant, customFetch, discovery } from "openid-client";
import { createOidcStore } from "#domain/sessions";
import type { OidcSettings, OwnerClaimCode } from "#infra/auth";
import {
  createBackchannelLogoutVerifier,
  createJwksReader,
  createOidcConfigCache,
  createOidcExchange,
  createOwnerClaimCode,
  oidcRedirectAllowlist,
} from "#infra/auth";
import { createBackgroundWork } from "#infra/tasks";

import { startOidcGcScheduler } from "#transport/jobs";
import type { ServicesDeps, ServicesResult } from "../compose/services.ts";
import type { OidcRoutesDeps } from "./index.ts";

type ConfiguredOidcDeps = Pick<ServicesDeps, "db" | "now" | "logger"> & {
  readonly built: Pick<ServicesResult, "sessions" | "signupInvites" | "seedUserConnections" | "egress">;
  /** The OIDC client settings, the root's env record in production. */
  readonly settings: OidcSettings;
  readonly ownerClaim?: OwnerClaimCode;
  readonly scheduleInterval: TimerScheduler["interval"];
};

/** Construct the production OIDC route capabilities; discovery stays lazy, single-flight and retryable. */
export async function createConfiguredOidc(deps: ConfiguredOidcDeps): Promise<OidcRoutesDeps & AsyncDisposable> {
  await using construction = new AsyncDisposableStack();
  const { settings } = deps;
  const issuer = settings.OIDC_ISSUER ?? "";
  const issuerUrl = issuer.length > 0 ? new URL(issuer) : new URL("http://localhost");
  const clientId = settings.OIDC_CLIENT_ID ?? "";
  const store = createOidcStore(deps.db, deps.now);
  const execution = deps.built.egress.configuredEndpointFetch;
  const fetchIssuer: CustomFetch = (url, { body, signal, ...options }) =>
    execution(url, {
      ...options,
      ...(body === undefined ? {} : { body: body instanceof Uint8Array ? new Uint8Array(body) : body }),
      ...(signal === undefined ? {} : { signal }),
    });
  const keys = construction.use(createJwksReader(execution));
  // biome-ignore lint/nursery/useDisposables: construction.move transfers GC to the returned async owner; local disposal would stop it before route use.
  const gc = construction.use(createBackgroundWork());
  const getConfig = createOidcConfigCache(() => discovery(issuerUrl, clientId, settings.OIDC_CLIENT_SECRET, undefined, { [customFetch]: fetchIssuer }));
  construction.defer(
    startOidcGcScheduler({ logger: deps.logger, sweep: store.deleteExpired, now: deps.now, scheduleInterval: deps.scheduleInterval, track: gc.track }),
  );
  const lifetime = construction.move();
  return {
    rolePolicy: deps.built.sessions.rolePolicy,
    exchange: createOidcExchange(authorizationCodeGrant),
    redirectAllowlist: oidcRedirectAllowlist(settings.OIDC_REDIRECT_URIS),
    scope: settings.OIDC_SCOPES,
    claims: {
      usernameClaim: settings.OIDC_USERNAME_CLAIM,
      uidClaim: settings.OIDC_UID_CLAIM,
      groupsClaim: settings.OIDC_GROUPS_CLAIM,
      emailClaim: settings.OIDC_EMAIL_CLAIM,
    },
    groupsSeparator: settings.OIDC_GROUPS_SEPARATOR,
    allowJitProvision: settings.OIDC_SIGNUP,
    requireApproval: settings.OIDC_REQUIRE_APPROVAL,
    store,
    getConfig,
    ...(settings.OIDC_BACKCHANNEL_LOGOUT ? { backchannelLogout: { verify: createBackchannelLogoutVerifier(keys.jwksFor).verify, clientId } } : {}),
    signup: {
      invites: deps.built.signupInvites,
      pending: deps.built.sessions,
      sessionIsLive: async (token: SessionToken): Promise<boolean> => (await deps.built.sessions.validate(token)) !== null,
      seedUserConnections: deps.built.seedUserConnections,
    },
    ownerClaim: deps.ownerClaim ?? createOwnerClaimCode(),
    [Symbol.asyncDispose]: () => lifetime.disposeAsync(),
  };
}
