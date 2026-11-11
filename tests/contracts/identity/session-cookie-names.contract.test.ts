// The browser enforces the session cookie's protections from its name alone, so a rename that drops the `__Host-`
// prefix, prefixes the plain-http name or lets one name contain the other compiles cleanly and fails only here.
import { REQUEST_TRANSPORTS, SESSION_COOKIE_NAMES } from "@orb/contracts/identity";
import { expect, test } from "@orb/testkit/node";

// RFC 6265bis §4.1.3: each prefix makes the browser discard a `Set-Cookie` that lacks `Secure`.
const SECURE_ONLY_PREFIXES = ["__Host-", "__Secure-"] as const;

test("the https name carries __Host-, the plain-http name carries no Secure-only prefix, and neither contains the other", () => {
  expect(SESSION_COOKIE_NAMES.https.startsWith("__Host-")).toBe(true);
  for (const prefix of SECURE_ONLY_PREFIXES) {
    expect(SESSION_COOKIE_NAMES.http.startsWith(prefix), prefix).toBe(false);
  }
  for (const transport of REQUEST_TRANSPORTS) {
    for (const other of REQUEST_TRANSPORTS.filter((candidate) => candidate !== transport)) {
      expect(SESSION_COOKIE_NAMES[transport].includes(SESSION_COOKIE_NAMES[other]), `${transport} contains ${other}`).toBe(false);
    }
  }
});
