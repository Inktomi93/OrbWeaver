// The mutating HTTP routes that carry no CSRF check, each beside the law or ledger file that rules it. A route is
// exempt only because its outcome does not depend on an ambient credential (a session cookie, the loopback owner
// fallback or a forward-auth proxy's header); a route whose outcome depends on one is never exempt
// (Spine-Identity-and-Auth invariant 9). Each route registers through its entry here, so the exemption cannot
// name a path the app does not serve.
//
// `tests/server/entry/http/csrf-route-coverage.int.test.ts` fails a mutating route the composed app serves that is
// neither listed here nor refuses a forged request, and fails a listed route whose outcome depends on an ambient
// credential. `tests/server/entry/auth/csrf-exemption-rulings.repo.int.test.ts` fails an entry whose `ruling` file
// does not state the exemption for that route.

/** The request methods an exempt route may register under: the non-safe ones a CSRF check would otherwise guard. */
const MUTATING_METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;

/** One exempt route: its registered method and path, and the repo path of the law or ledger file that rules it. */
interface CsrfExemptRoute {
  readonly method: (typeof MUTATING_METHODS)[number];
  readonly path: `/api/${string}`;
  readonly ruling: `docs/law/${string}.md` | `docs/adr/${string}.md`;
}

export const CSRF_EXEMPT_ROUTES = {
  // The IdP calls it server to server, and the issuer-signed `logout_token` in the body is its whole authentication.
  oidcBackchannelLogout: {
    method: "POST",
    path: "/api/auth/oidc/backchannel-logout",
    ruling: "docs/law/Spine-Identity-and-Auth.md",
  },
} as const satisfies Record<string, CsrfExemptRoute>;
