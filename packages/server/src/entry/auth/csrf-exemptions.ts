// The mutating HTTP routes that carry no CSRF check, each beside the law line that exempts it. A route is exempt
// only because it reads no ambient credential (a session cookie or the loopback owner fallback); a route that reads
// one is never exempt (Spine-Identity-and-Auth invariant 9). Each route registers through its entry here, so the
// exemption cannot name a path the app does not serve.
//
// `tests/server/entry/http/csrf-route-coverage.int.test.ts` fails a mutating route the composed app serves that is
// neither listed here nor refuses a forged request, and fails a listed route whose outcome depends on a session cookie.

/** The request methods an exempt route may register under: the non-safe ones a CSRF check would otherwise guard. */
const MUTATING_METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;

/** One exempt route: its registered method and path, and the law line that exempts it. */
interface CsrfExemptRoute {
  readonly method: (typeof MUTATING_METHODS)[number];
  readonly path: `/api/${string}`;
  readonly ruling: string;
}

export const CSRF_EXEMPT_ROUTES = {
  // The IdP calls it server to server, and the issuer-signed `logout_token` in the body is its whole authentication.
  oidcBackchannelLogout: {
    method: "POST",
    path: "/api/auth/oidc/backchannel-logout",
    ruling: "Spine-Identity-and-Auth invariant 9: the OIDC back-channel logout route reads no ambient credential",
  },
} as const satisfies Record<string, CsrfExemptRoute>;
