// The SESSION-COOKIE TRANSPORT posture — `SESSION_COOKIE_INSECURE`, the explicit opt-in that serves the
// session cookie WITHOUT `Secure` (and without the `__Host-` prefix that requires it), so a plain-http LAN
// address can hold a login. Pure (raw values injected, no `process.env` read here), the `bind.ts` /
// `fallback-peers.ts` shape: a resolver, a notice, and a warning list, all unit-testable. `foundation/env`
// owns the ONE process.env read and calls this with its parsed floor; `infra/auth/modes/cookie-session.ts`
// turns the verdict into the cookie NAME + attributes (the name's home stays there, D40); `entry/lifecycle`
// logs the notice and the warning.
//
// ── WHY THE KNOB EXISTS (the first bug report a stranger files) ───────────────────────────────────────────
// The session cookie is `__Host-orb_session` + `Secure`. Both halves are refused by a browser on a
// plain-http origin that is not `localhost` (RFC 6265bis §4.1.2.5 / §4.1.3.2: a `Secure` cookie from a
// non-secure origin is ignored, and the `__Host-` prefix REQUIRES `Secure`). So on a home LAN — phone →
// `http://192.168.1.20:8788` — sign-in returns 200, the browser silently drops the Set-Cookie, and the next
// request is anonymous: "sign-in does nothing", with nothing in any log to explain it. SillyTavern and
// Marinara both work over plain-http LAN, so this reads as our bug, and it is the first thing a stranger
// who cloned the repo hits after `docker compose up`.
//
// ── WHAT SETTING IT ACTUALLY COSTS (read this before recommending it) ────────────────────────────────────
// The session cookie IS the credential. Without `Secure` it is transmitted in cleartext on every plain-http
// hop, so anyone who can observe that path — another device on the wi-fi, a switch or router in between, a
// hostile access point — can copy it and be that user, with no password and no second factor. A plain-http
// page served from the same host can also SET one (the `__Host-` prefix is exactly the control that stops
// cookie-tossing / session fixation from a sibling origin). On a private LAN the operator controls, that is
// the trade they are making on purpose. On a network they do not control, it is a full account takeover
// waiting for one passive listener. The knob is OFF by default, must be typed by a human, and announces
// itself in a standing WARN every boot for as long as it is true — the `ALLOW_DEV_PUBLIC_BIND` posture
// (`bind.ts`), for the same reason: a deliberate reachability downgrade that should never be rediscovered
// from an incident.
//
// ── WHAT IT IS NOT ───────────────────────────────────────────────────────────────────────────────────────
// It is NEVER auto-detected. Not from the request scheme, not from `X-Forwarded-Proto`, not from the `Host`
// header — every one of those is attacker- or proxy-supplied, and a per-request downgrade would let anyone
// who can forge a header ask for a cleartext-transportable cookie. The verdict is a launch-time fact about
// the whole process, decided once, from one operator-typed value.
//
// It carries NO parse-time refusal (owner ruling 2026-09-18: "if people turn on insecure then that's their
// choice, I'm not going to limit their network choice, but the console will nag"). In particular there is no
// production/bind/private-range gate: the shipped container is `NODE_ENV=production` AND binds every
// interface inside its namespace, so any such gate would refuse exactly the LAN audience the knob exists
// for. The honesty mechanism is the nag, not a fence.
//
// It is NOT refused under `oidc` either, and that needed checking rather than assuming: the OIDC flow keeps
// state/PKCE/nonce in the DB-backed `OidcMintStore`, not in a cookie (`entry/http/auth-routes.ts`), so the
// session cookie is the only cookie in it. The one real obstacle is `deriveRedirectUri` (same file), which
// defaults the scheme to `https` when `X-Forwarded-Proto` is absent — so a BARE plain-http origin 400s at
// `/api/auth/oidc/login`. A proxy that asserts `X-Forwarded-Proto: http` against an `http://…` entry in
// `OIDC_REDIRECT_URIS` completes normally, and env parse cannot tell the two apart. A refusal would
// therefore ban a shape that works; the warning names the obstacle instead.

import type { AuthMode } from "@orb/contracts/identity";

/** The raw env values the resolver reads — passed in so this file never touches `process.env`. */
export interface SessionCookiePostureInput {
  /** `SESSION_COOKIE_INSECURE` — the operator's explicit opt-in (accepted values exactly `true`/`false`). */
  readonly insecure: boolean;
  /** `AUTH_MODE` — read ONLY to say something true in the warning: two modes mint no session cookie at all,
   *  and `oidc` has its own plain-http obstacle. It never changes the verdict. */
  readonly authMode: AuthMode;
}

/** The composed posture. Both fields are facts about this boot, safe to print in a boot log. */
export interface SessionCookiePosture {
  /** `true` (the default) ⇒ the session cookie carries `Secure` and the `__Host-` prefix. */
  readonly secure: boolean;
  /** The ONE boot-log line stating what the session cookie's transport is. Always present: "sign-in does
   *  nothing on the LAN" is a symptom with no other tell, so the posture has to be greppable in the boot
   *  log at the moment of confusion — the same reason `bind.ts` always logs its notice. */
  readonly notice: string;
}

/** The modes that ever MINT a session cookie. `single-user` authenticates by the peer-gated owner fallback
 *  and `forward-header` by the proxy's headers — neither route registers a cookie mint (`entry/lifecycle`
 *  supplies `authenticate` only in `local` and the OIDC routes only in `oidc`), so the knob is inert there
 *  and the warning says so rather than implying a change nobody will see. */
const COOKIE_MINTING_MODES: ReadonlySet<AuthMode> = new Set<AuthMode>(["local", "oidc"]);

const NOTICE = {
  secure:
    "session cookie: Secure + host-only (`__Host-` prefix) — a browser keeps it on https, or on http://localhost only. " +
    "Signing in at a plain-http LAN address will silently fail; set SESSION_COOKIE_INSECURE=true to accept a cleartext cookie on that network, or put TLS in front.",
  insecure:
    "session cookie: NOT Secure and NOT host-only (SESSION_COOKIE_INSECURE=true) — it is kept and sent over plain http, IN CLEAR, on every hop. See the security warning below.",
} as const;

export function resolveSessionCookiePosture(input: SessionCookiePostureInput): SessionCookiePosture {
  const secure = !input.insecure;
  return { secure, notice: secure ? NOTICE.secure : NOTICE.insecure };
}

/** The operator-facing lines — EMPTY when nothing needs saying, so a healthy boot is silent (the
 *  `diagnostics.ts` contract). The one standing warning is the downgrade itself: it removes, on purpose, the
 *  control that keeps the session credential off a cleartext wire, so it announces itself for as long as it
 *  is true and says plainly what an eavesdropper gets. Mode-specific sentences are appended rather than
 *  homed in a second warning, so the operator reads ONE line about their box. */
export function sessionCookieWarnings(input: SessionCookiePostureInput, posture: SessionCookiePosture): readonly string[] {
  if (posture.secure) {
    return [];
  }
  return [
    "SESSION_COOKIE_INSECURE=true — the session cookie is served WITHOUT `Secure` and without the `__Host-` prefix, so it " +
      "travels IN CLEAR over plain http. The cookie IS the credential: anyone who can watch that network (another device on " +
      "the wi-fi, a switch or router in the path, a hostile access point) can copy it and BE that user — no password, no " +
      "second factor — and a plain-http page on the same host can plant one instead (session fixation). This is the right " +
      "trade ONLY on a private network you control and only while there is no TLS in front; it is never safe on a network " +
      "you do not own. Put any TLS terminator in front (Caddy, nginx, Traefik, a Tailscale `serve`) and unset this knob." +
      modeSentence(input.authMode),
  ];
}

/** The mode-specific tail of the warning above — true statements about THIS box, so the line is never
 *  generic advice the operator has to translate. */
function modeSentence(mode: AuthMode): string {
  if (!COOKIE_MINTING_MODES.has(mode)) {
    return ` (AUTH_MODE=${mode} mints no session cookie at all, so on this box the knob currently changes nothing — it will apply if you switch to AUTH_MODE=local or oidc.)`;
  }
  if (mode === "oidc") {
    return (
      " (AUTH_MODE=oidc: the login REDIRECT is a separate problem this knob does not solve — the callback origin is derived " +
      "as https unless a proxy sends `X-Forwarded-Proto: http`, so /api/auth/oidc/login answers 400 on a bare plain-http " +
      "origin until OIDC_REDIRECT_URIS names the exact http:// callback AND the proxy asserts that scheme. Most IdPs also " +
      "refuse a non-https redirect_uri outright.)"
    );
  }
  return "";
}
