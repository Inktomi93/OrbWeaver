// @subject packages/server/src/entry/app.ts
// Every mutating route the composed app serves refuses what a cross-site page can send: a CORS-simple body with no
// `x-orb-csrf`, riding the mode's ambient credential (Spine-Identity-and-Auth invariant 9). The rows come from the
// app's own route table, so a new registration is judged with no edit here. Only `CSRF_EXEMPT_ROUTES` excuses a
// route, and each exempt route proves its outcome does not depend on a session cookie.
import type { AuthMode } from "@orb/contracts/identity";
import { AUTH_FALLBACK_KEY, AUTH_MODES, authMeSchema, CSRF_HEADER } from "@orb/contracts/identity";
import { CSRF_EXEMPT_ROUTES } from "@orb/server/entry/auth";
import { expect, test } from "@orb/testkit/node";
import type { AuthModeRoot, AuthModeRootOptions, AuthSubject } from "@orb/testkit/node/auth";
import { createAuthModeRoot, mintMember, ownerSubject, signIn } from "@orb/testkit/node/auth";
import { createNativeIssuer } from "@orb/testkit/node/helpers";
import { METHOD_NAME_ALL } from "hono/router";

const LOOPBACK_PEER = "127.0.0.1";
const OWNER_FALLBACK: AuthModeRootOptions = { env: { [AUTH_FALLBACK_KEY]: "owner" }, physicalPeer: () => LOOPBACK_PEER };

/** The ambient credential a cross-site page can ride in each mode, and the root that admits it: the browser's
 *  session cookie, or the loopback owner fallback the browser on the box speaks from. */
const AMBIENT: Record<AuthMode, { readonly credential: "cookie" | "fallback"; readonly options: AuthModeRootOptions }> = {
  "single-user": { credential: "fallback", options: OWNER_FALLBACK },
  // The first-run route answers only a request from the box itself, so the local cookie rides a loopback peer.
  local: { credential: "cookie", options: { physicalPeer: () => LOOPBACK_PEER } },
  oidc: { credential: "cookie", options: {} },
  // The proxy's own header is CSRF-immune by invariant 9; the break-glass owner fallback is the ambient arm here.
  "forward-header": { credential: "fallback", options: OWNER_FALLBACK },
};

const AUTH_ME_ROUTE = "/api/auth/me";
const SAFE_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS"]);
// A CORS-simple content type: a cross-site form or fetch sends it with no preflight.
const FORGEABLE_CONTENT_TYPE = "text/plain";
// Not CORS-simple, so it is the proof the content-type belts accept; the header is the proof every other check reads.
const PROVEN_CONTENT_TYPE = "application/json";
const OK = 200;
const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const UNSUPPORTED_MEDIA_TYPE = 415;
const CSRF_REFUSALS: readonly number[] = [FORBIDDEN, UNSUPPORTED_MEDIA_TYPE];
const NOT_PAST_THE_CHECK: readonly number[] = [UNAUTHORIZED, ...CSRF_REFUSALS];
// The OIDC back-channel logout protocol's own form field and event claim (OpenID Connect Back-Channel Logout 1.0).
const LOGOUT_TOKEN_FIELD = "logout_token";
const BACKCHANNEL_LOGOUT_EVENT = "http://schemas.openid.net/event/backchannel-logout";

const routeKey = (method: string, path: string): string => `${method} ${path}`;
const EXEMPT: ReadonlySet<string> = new Set(Object.values(CSRF_EXEMPT_ROUTES).map(({ method, path }) => routeKey(method, path)));

interface Answer {
  readonly status: number;
  readonly body: string;
  readonly setsCookie: boolean;
}

async function answer(response: Response): Promise<Answer> {
  return { status: response.status, body: await response.text(), setsCookie: response.headers.getSetCookie().length > 0 };
}

/** The composed app's non-safe rows, one per method and pattern (a route's middleware repeats its row). */
function mutatingRows(root: AuthModeRoot): readonly { readonly method: string; readonly path: string }[] {
  const rows = new Map(
    root.http.routes.filter(({ method }) => !SAFE_METHODS.has(method)).map(({ method, path }) => [routeKey(method, path), { method, path }]),
  );
  return [...rows.values()];
}

async function admits(root: AuthModeRoot, headers: Readonly<Record<string, string>>): Promise<boolean> {
  const response = await root.http.request(AUTH_ME_ROUTE, { headers });
  return authMeSchema.parse(await response.json()).authenticated;
}

/** How one row answered: refused, with whether the proven request got past the check; served by no handler; or open. */
type Verdict = { readonly kind: "refused"; readonly proven: Answer } | { readonly kind: "no-handler" } | { readonly kind: "open"; readonly forged: Answer };

async function judge(
  root: AuthModeRoot,
  row: { readonly method: string; readonly path: string },
  headers: Readonly<Record<string, string>>,
  segment: string,
): Promise<Verdict> {
  const url = row.path.replaceAll(/:[^/]+/gu, segment).replaceAll("*", segment);
  const method = row.method === METHOD_NAME_ALL ? "POST" : row.method;
  const forged = await answer(await root.http.request(url, { method, headers: { ...headers, "content-type": FORGEABLE_CONTENT_TYPE }, body: segment }));
  if (CSRF_REFUSALS.includes(forged.status)) {
    // The same request with the proof must get past the check, so the refusal above was the check's.
    const proven = await root.http.request(url, { method, headers: { ...headers, "content-type": PROVEN_CONTENT_TYPE, [CSRF_HEADER]: "1" }, body: "{}" });
    return { kind: "refused", proven: await answer(proven) };
  }
  // An ALL row is middleware where no handler serves the path: the forged POST then answers exactly what a GET does.
  if (row.method === METHOD_NAME_ALL && forged.status === NOT_FOUND) {
    const get = await answer(await root.http.request(url, { headers }));
    if (get.status === NOT_FOUND && get.body === forged.body) {
      return { kind: "no-handler" };
    }
  }
  return { kind: "open", forged };
}

for (const mode of AUTH_MODES) {
  const ambient = AMBIENT[mode];
  test(`every mutating route the ${mode} app serves refuses a forged request on its ${ambient.credential} credential`, async () => {
    await using root = await createAuthModeRoot(mode, ambient.options);
    const owner = await ownerSubject(root);
    const credential = async (): Promise<Readonly<Record<string, string>>> => (ambient.credential === "fallback" ? {} : (await signIn(root, owner)).headers);
    let headers = await credential();
    expect(await admits(root, headers)).toBe(true);

    const segment = root.ids.next("route");
    const refused: string[] = [];
    const failures: string[] = [];
    for (const row of mutatingRows(root).filter(({ method, path }) => !EXEMPT.has(routeKey(method, path)))) {
      const key = routeKey(row.method, row.path);
      const verdict = await judge(root, row, headers, segment);
      if (verdict.kind === "open") {
        failures.push(`${key} answered a forged request ${String(verdict.forged.status)}`);
      } else if (verdict.kind === "refused") {
        refused.push(key);
        if (NOT_PAST_THE_CHECK.includes(verdict.proven.status)) {
          failures.push(`${key} answered the proven request ${String(verdict.proven.status)}`);
        }
        // A route that ends or rotates the session (logout) leaves the browser a new jar; sign in again as it would.
        if (verdict.proven.setsCookie) {
          headers = await credential();
        }
      }
    }
    expect(failures).toEqual([]);
    expect(refused.length).toBeGreaterThan(0);
    expect(await admits(root, headers)).toBe(true);
  });
}

function logoutClaims(who: AuthSubject): Record<string, unknown> {
  return { sub: who.subject, events: { [BACKCHANNEL_LOGOUT_EVENT]: {} } };
}

/** Each exempt route registers a case proving, on the composed app, that its outcome is the same with and without a
 *  session cookie. Keyed by the production list, so an exemption with no proof fails `tsc`. */
const EXEMPTION_PROOFS: { readonly [Key in keyof typeof CSRF_EXEMPT_ROUTES]: (name: string) => void } = {
  oidcBackchannelLogout: (name) =>
    test(name, async () => {
      const route = CSRF_EXEMPT_ROUTES.oidcBackchannelLogout;
      await using root = await createAuthModeRoot("oidc");
      expect(mutatingRows(root).map(({ method, path }) => routeKey(method, path))).toContain(routeKey(route.method, route.path));
      const ownerWho = await ownerSubject(root);
      const owner = await signIn(root, ownerWho);
      const member = await mintMember(root);
      const post = async (token: string, headers: Readonly<Record<string, string>>): Promise<Answer> =>
        await answer(await root.http.request(route.path, { method: route.method, headers, body: new URLSearchParams([[LOGOUT_TOKEN_FIELD, token]]) }));

      // A token the issuer did not sign is refused the same way with and without the owner's session.
      const foreignSigned = await (await createNativeIssuer()).logoutToken(logoutClaims(ownerWho));
      const bare = await post(foreignSigned, {});
      expect(bare.status).toBe(BAD_REQUEST);
      expect(await post(foreignSigned, owner.headers)).toEqual(bare);
      expect(await admits(root, owner.headers)).toBe(true);

      // A signed token ends the member's session with no cookie present, and the owner's cookie beside it changes nothing.
      const first = await signIn(root, member);
      const ended = await post(await root.issuer.logoutToken(logoutClaims(member)), {});
      expect(ended.status).toBe(OK);
      expect(await admits(root, first.headers)).toBe(false);
      const second = await signIn(root, member);
      expect(await post(await root.issuer.logoutToken(logoutClaims(member)), owner.headers)).toEqual(ended);
      expect(await admits(root, second.headers)).toBe(false);
      expect(await admits(root, owner.headers)).toBe(true);
    }),
};

for (const [key, register] of Object.entries(EXEMPTION_PROOFS)) {
  register(`the CSRF-exempt ${key} route reads no ambient credential`);
}
