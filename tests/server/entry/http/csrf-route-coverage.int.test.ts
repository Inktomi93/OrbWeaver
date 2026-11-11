// @subject packages/server/src/entry/app.ts
// Every mutating route the composed app serves refuses what a cross-site page can send: each CORS-simple body
// (text, url-encoded form, multipart form) with no `x-orb-csrf`, riding the mode's ambient credential
// (Spine-Identity-and-Auth invariant 9). The rows come from the app's own route table, and a wildcard row is walked
// at a real mutation path of the production router, so a new registration is judged with no edit here. Only
// `CSRF_EXEMPT_ROUTES` excuses a route, and each exempt route proves its outcome does not depend on an ambient
// credential.
import type { AuthMode } from "@orb/contracts/identity";
import { AUTH_FALLBACK_KEY, AUTH_MODES, authMeSchema, CSRF_HEADER, OIDC_BACKCHANNEL_LOGOUT_EVENT } from "@orb/contracts/identity";
import { CSRF_EXEMPT_ROUTES } from "@orb/server/entry/auth";
import { appRouter } from "@orb/server/transport/trpc";
import { PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { AuthModeRoot, AuthModeRootOptions, AuthSubject } from "@orb/testkit/node/auth";
import { createAuthModeRoot, mintMember, ownerSubject, signIn } from "@orb/testkit/node/auth";
import { createNativeIssuer } from "@orb/testkit/node/helpers";
import { METHOD_NAME_ALL } from "hono/router";
import { LOGOUT_TOKEN_FIELD } from "#server/entry/http/auth-routes.ts";

const LOOPBACK_PEER = "127.0.0.1";
const OWNER_FALLBACK: AuthModeRootOptions = { env: { [AUTH_FALLBACK_KEY]: "owner" }, physicalPeer: () => LOOPBACK_PEER };

/** The ambient credential a cross-site page can ride in each mode, and the root that admits it. The browser sends the
 *  session cookie; the loopback owner fallback rides the socket a browser on the box speaks from; a forward-auth
 *  proxy stamps its signed assertion on any request carrying the proxy's own, possibly ambient, credential. */
const AMBIENT: Record<AuthMode, { readonly credential: "cookie" | "fallback" | "proxy"; readonly options: AuthModeRootOptions }> = {
  "single-user": { credential: "fallback", options: OWNER_FALLBACK },
  // The first-run route answers only a request from the box itself, so the local cookie rides a loopback peer.
  local: { credential: "cookie", options: { physicalPeer: () => LOOPBACK_PEER } },
  oidc: { credential: "cookie", options: {} },
  "forward-header": { credential: "proxy", options: {} },
};

const AUTH_ME_ROUTE = "/api/auth/me";
const SAFE_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS"]);
/** The bodies a cross-site form or no-preflight fetch can send; each sets its own CORS-simple content type. */
const FORGED_BODIES: Readonly<Record<"text" | "urlencoded" | "multipart", (segment: string) => string | URLSearchParams | FormData>> = {
  text: (segment) => segment,
  urlencoded: (segment) => new URLSearchParams([[segment, segment]]),
  multipart: (segment) => {
    const form = new FormData();
    form.set(segment, segment);
    return form;
  },
};
// Not CORS-simple, so it is the proof the content-type belts accept; the header is the proof every other check reads.
// The body never parses, so no handler past the check acts on it.
const PROVEN_CONTENT_TYPE = "application/json";
const UNPARSEABLE_JSON = "{";
const OK = 200;
const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const UNSUPPORTED_MEDIA_TYPE = 415;
const CSRF_REFUSALS: readonly number[] = [FORBIDDEN, UNSUPPORTED_MEDIA_TYPE];
const NOT_PAST_THE_CHECK: readonly number[] = [UNAUTHORIZED, ...CSRF_REFUSALS];

/** A real mutation of the production router that parses an input, so a wildcard row is walked where a handler
 *  answers and the proven request stops at that parse. */
function inputMutationPath(): string {
  for (const [path, procedure] of Object.entries(appRouter._def.procedures)) {
    if (typeof procedure === "function" && procedure._def.type === "mutation" && procedure._def.inputs.length > 0) {
      return path;
    }
  }
  throw new Error("the production router declares no mutation with an input");
}
const MUTATION_PATH = inputMutationPath();

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

const sameAnswer = (left: Answer, right: Answer): boolean => left.status === right.status && left.body === right.body;

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

/** How one row answered: refused on every forged body, with the proven answer; served by no handler; or open. */
type Verdict = { readonly kind: "refused"; readonly proven: Answer } | { readonly kind: "no-handler" } | { readonly kind: "open"; readonly forged: string };

interface Walk {
  readonly root: AuthModeRoot;
  readonly headers: Readonly<Record<string, string>>;
  readonly segment: string;
  /** The app's own not-found answers, for an API path and a page path no handler serves. */
  readonly notFound: readonly Answer[];
}

async function judge(walk: Walk, row: { readonly method: string; readonly path: string }): Promise<Verdict> {
  const { root, headers, segment } = walk;
  const url = row.path.replaceAll(/:[^/]+/gu, segment).replaceAll("*", MUTATION_PATH);
  const method = row.method === METHOD_NAME_ALL ? "POST" : row.method;
  const forged: [string, Answer][] = [];
  for (const [name, body] of Object.entries(FORGED_BODIES)) {
    forged.push([name, await answer(await root.http.request(url, { method, headers, body: body(segment) }))]);
  }
  if (forged.every(([, reply]) => CSRF_REFUSALS.includes(reply.status))) {
    // The same request with the proof must get past the check, so the refusals above were the check's.
    const proven = await root.http.request(url, {
      method,
      headers: { ...headers, "content-type": PROVEN_CONTENT_TYPE, [CSRF_HEADER]: "1" },
      body: UNPARSEABLE_JSON,
    });
    return { kind: "refused", proven: await answer(proven) };
  }
  // A middleware row serves no handler at the path: every forged body then gets the app's own not-found answer.
  if (row.method === METHOD_NAME_ALL && forged.every(([, reply]) => walk.notFound.some((notFound) => sameAnswer(reply, notFound)))) {
    return { kind: "no-handler" };
  }
  return { kind: "open", forged: forged.map(([name, reply]) => `${name} ${String(reply.status)}`).join(", ") };
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
    const notFound = [
      await answer(await root.http.request(`/api/${segment}/${segment}`, { headers })),
      await answer(await root.http.request(`/${segment}/${segment}`, { headers })),
    ];
    expect(notFound.map(({ status }) => status)).toEqual([NOT_FOUND, NOT_FOUND]);
    const refused: string[] = [];
    const failures: string[] = [];
    for (const row of mutatingRows(root).filter(({ method, path }) => !EXEMPT.has(routeKey(method, path)))) {
      const key = routeKey(row.method, row.path);
      const verdict = await judge({ root, headers, segment, notFound }, row);
      if (verdict.kind === "open") {
        failures.push(`${key} answered a forged request: ${verdict.forged}`);
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
    // The tRPC mount is a wildcard ALL row; walked at the router's mutation path, it must be refused, not excused.
    expect(refused.some((key) => key.startsWith(`${METHOD_NAME_ALL} `))).toBe(true);
    expect(await admits(root, headers)).toBe(true);
  });
}

function logoutClaims(who: AuthSubject): Record<string, unknown> {
  return { sub: who.subject, events: { [OIDC_BACKCHANNEL_LOGOUT_EVENT]: {} } };
}

/** Each exempt route registers a case proving, on the composed app, that its outcome is the same with no credential,
 *  a session cookie and the loopback owner fallback. Keyed by the production list, so an exemption with no proof
 *  fails `tsc`; the ruling each entry cites is checked by `tests/server/entry/auth/csrf-exemption-rulings.repo.int.test.ts`. */
const EXEMPTION_PROOFS: { readonly [Key in keyof typeof CSRF_EXEMPT_ROUTES]: (name: string) => void } = {
  oidcBackchannelLogout: (name) =>
    test(name, async () => {
      const route = CSRF_EXEMPT_ROUTES.oidcBackchannelLogout;
      let peer = PUBLIC_PEER_ADDRESS;
      await using root = await createAuthModeRoot("oidc", { env: { [AUTH_FALLBACK_KEY]: "owner" }, physicalPeer: () => peer });
      expect(mutatingRows(root).map(({ method, path }) => routeKey(method, path))).toContain(routeKey(route.method, route.path));
      const ownerWho = await ownerSubject(root);
      const owner = await signIn(root, ownerWho);
      const member = await mintMember(root);
      // Each ambient credential a request to the route can carry, with the peer it rides on.
      const arms = [
        { headers: {}, peer: PUBLIC_PEER_ADDRESS },
        { headers: owner.headers, peer: PUBLIC_PEER_ADDRESS },
        { headers: {}, peer: LOOPBACK_PEER },
      ] as const;
      const post = async (token: string, arm: (typeof arms)[number]): Promise<Answer> => {
        peer = arm.peer;
        const reply = await answer(
          await root.http.request(route.path, { method: route.method, headers: arm.headers, body: new URLSearchParams([[LOGOUT_TOKEN_FIELD, token]]) }),
        );
        peer = PUBLIC_PEER_ADDRESS;
        return reply;
      };
      // The fallback arm really carries the owner, and the bare arm carries no one.
      peer = LOOPBACK_PEER;
      expect(await admits(root, {})).toBe(true);
      peer = PUBLIC_PEER_ADDRESS;
      expect(await admits(root, {})).toBe(false);

      // A token the issuer did not sign is refused the same way on every arm.
      const foreignSigned = await (await createNativeIssuer()).logoutToken(logoutClaims(ownerWho));
      const refusals: Answer[] = [];
      for (const arm of arms) {
        refusals.push(await post(foreignSigned, arm));
      }
      expect(refusals.map(({ status }) => status)).toEqual(arms.map(() => BAD_REQUEST));
      expect(new Set(refusals.map(({ body }) => body)).size).toBe(1);
      expect(await admits(root, owner.headers)).toBe(true);

      // A signed token for the member ends the member's session the same way on every arm, and never the owner's.
      const endings: Answer[] = [];
      for (const arm of arms) {
        const session = await signIn(root, member);
        endings.push(await post(await root.issuer.logoutToken(logoutClaims(member)), arm));
        expect(await admits(root, session.headers)).toBe(false);
        expect(await admits(root, owner.headers)).toBe(true);
      }
      expect(endings.map(({ status }) => status)).toEqual(arms.map(() => OK));
      expect(new Set(endings.map(({ body }) => body)).size).toBe(1);
    }),
};

for (const [key, register] of Object.entries(EXEMPTION_PROOFS)) {
  register(`the CSRF-exempt ${key} route's outcome does not depend on an ambient credential`);
}
