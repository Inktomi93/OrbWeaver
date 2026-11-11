// The mutating HTTP routes that carry no CSRF check, each with a cite of the law or ledger sentence that rules it. A
// route is exempt only because its outcome does not depend on an ambient credential (a session cookie, the loopback
// owner fallback or a forward-auth proxy's header); a route whose outcome depends on one is never exempt
// (Spine-Identity-and-Auth invariant 9). Each route registers through its entry here, so the exemption cannot
// name a path the app does not serve.
//
// `tests/server/entry/http/csrf-route-coverage.int.test.ts` fails a mutating route the composed app serves that is
// neither listed here nor refuses a forged request, and fails a listed route whose outcome depends on an ambient
// credential. `tests/server/entry/auth/csrf-exemption-rulings.repo.int.test.ts` fails an entry whose cited sentence
// is not, word for word, a sentence of its cited file that opens with the entry's own method and path.

/** The request methods an exempt route may register under: the non-safe ones a CSRF check would otherwise guard. */
const MUTATING_METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;
type MutatingMethod = (typeof MUTATING_METHODS)[number];

/** One exempt route: its registered method and path, and the ruling it rests on, cited as the law or ledger file and
 *  the exact sentence in it that states the exemption. The sentence's home is that file; this is its cite. */
interface CsrfExemptRoute {
  readonly method: MutatingMethod;
  readonly path: `/api/${string}`;
  readonly ruling: {
    readonly file: `docs/law/${string}.md` | `docs/adr/${string}.md`;
    readonly sentence: `\`${MutatingMethod} /api/${string}\` carries no CSRF check, because ${string}.`;
  };
}

export const CSRF_EXEMPT_ROUTES = {
  // The IdP calls it server to server, and the issuer-signed `logout_token` in the body is its whole authentication.
  oidcBackchannelLogout: {
    method: "POST",
    path: "/api/auth/oidc/backchannel-logout",
    ruling: {
      file: "docs/law/Spine-Identity-and-Auth.md",
      sentence:
        "`POST /api/auth/oidc/backchannel-logout` carries no CSRF check, because its outcome does not depend on an ambient credential: the issuer-signed `logout_token` is its only authentication.",
    },
  },
} as const satisfies Record<string, CsrfExemptRoute>;
