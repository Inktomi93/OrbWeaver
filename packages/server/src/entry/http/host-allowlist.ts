// The Host allowlist middleware: refuses a request for a name this server does not answer to, before the principal
// resolves (the decision and its reason: `infra/auth/host-allowlist.ts`). The refusal names the host and the fix
// for this install, and offers no in-app "allow" action: under single-user the rebinding page is the owner.

import type { MiddlewareHandler } from "hono";
import { html } from "hono/html";
import { settingInstruction } from "#foundation/env";
import type { HostNotAllowedNotice } from "#infra/auth";
import { refusedHost } from "#infra/auth";
import { peerIp, TRUSTED_PROXIES } from "#infra/network";
import { isApiPath } from "./spa.ts";

// RFC 9110 §15.5.20: this server is not authoritative for the requested host. Distinct from every auth 403.
const MISDIRECTED_REQUEST = 421;
const ALLOWED_HOSTS_KEY = "ALLOWED_HOSTS";

export interface HostAllowlistDeps {
  /** The configured names (`resolveAllowedHosts`); localhost and IP literals pass without an entry. */
  readonly allowedHosts: readonly string[];
  /** Picks the fix the refusal names (`settingInstruction`): the compose `environment:` block, or setup and `.env`. */
  readonly inContainer: boolean;
  readonly notice: HostNotAllowedNotice;
}

// The fix for this install, as one sentence. `host` is canonical and length-capped by `refusedHost`.
function fixSentence(host: string, inContainer: boolean): string {
  return `If ${host} is how you reach this server, ${settingInstruction(inContainer, ALLOWED_HOSTS_KEY, host)}.`;
}

// Every interpolation goes through hono's `html` tag, which HTML-escapes it: the host is attacker-chosen.
function refusalPage(host: string, inContainer: boolean): ReturnType<typeof html> {
  return html`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Address not allowed</title></head>
<body>
<h1>This address is not allowed</h1>
<p>Orbweaver refused a request for <code>${host}</code>. It answers to localhost, IP addresses and the names it knows, which <code>${ALLOWED_HOSTS_KEY}</code> extends.</p>
<p>${fixSentence(host, inContainer)} Separate several names with commas.</p>
<p>If you do not recognise this name, do not add it. A web page can point its own name at this server to reach it through your browser.</p>
</body>
</html>`;
}

/** Mount before the principal resolves. A refused request logs through `notice` and never reaches a route. */
export function hostAllowlist(deps: HostAllowlistDeps): MiddlewareHandler {
  return async (c, next) => {
    const host = refusedHost(
      {
        hostHeader: c.req.header("host"),
        urlHost: new URL(c.req.url).host,
        forwardedHost: c.req.header("x-forwarded-host"),
        peer: () => peerIp(c),
        trustedProxies: TRUSTED_PROXIES,
      },
      deps.allowedHosts,
    );
    if (host === null) {
      await next();
      return;
    }
    deps.notice(host);
    if (isApiPath(c.req.path)) {
      return c.json({ error: `This server does not answer to ${host}. ${fixSentence(host, deps.inContainer)}`, host }, MISDIRECTED_REQUEST);
    }
    return c.html(refusalPage(host, deps.inContainer), MISDIRECTED_REQUEST);
  };
}
