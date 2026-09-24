// The BIND POSTURE resolver — the deploy-mode invariant: A NON-PRODUCTION PROCESS MUST NOT BE REACHABLE
// FROM AN UNTRUSTED NETWORK. Pure (raw values injected, no `process.env` read here), the `posture.ts` /
// `diagnostics.ts` shape: a resolver + a refusal + a warning list, all unit-testable. `foundation/env` owns
// the ONE process.env read and calls this with its parsed floor; `entry/lifecycle` binds to the result.
//
// ── WHY THIS FILE EXISTS (the 2026-08-09 incident) ────────────────────────────────────────────────────────
// The public site was being served by a DEV process — a `node --watch` started out of a worktree cache,
// bound bare on every interface, with the reverse proxy in front of it. `NODE_ENV` therefore defaulted to
// `development`, tRPC's `isDev` was true, and every error (including the pre-auth 401 an anonymous prober
// gets) returned absolute host paths, the OS username and exact dependency versions. The error-shape leak is
// belted at its own seam (`transport/trpc/trpc.ts` strips `stack` unconditionally). This file closes the
// OTHER half — the reason a dev process was reachable at all — because "someone started the wrong process"
// is not a control, and a dev build carries more than one dev-shaped affordance.
//
// ── THE MODEL (two arms, one rule) ────────────────────────────────────────────────────────────────────────
//
//   DEFAULT      Non-production, `BIND_HOST` unset ⇒ listen on LOOPBACK ONLY. A dev stack stays fully usable
//   (restrict)   (the vite proxy, the CT/e2e harnesses and `snap` all speak to localhost) while a proxy on
//                the docker bridge — or anything else off-box — simply cannot reach it. The failure mode
//                becomes a LOUD 502 at the edge instead of a silent dev-bytes-on-the-public-FQDN leak.
//                PRODUCTION is untouched: `BIND_HOST` unset ⇒ node's default (every interface), which is
//                what the proxy target requires.
//
//   REFUSE       Non-production with `BIND_HOST` naming a NON-loopback interface ⇒ BOOT IS REFUSED at env
//                (explicit)   parse, with the operator-actionable message below. Deliberate LAN dev use is
//                the one legitimate case for it and has an explicit opt-in: `ALLOW_DEV_PUBLIC_BIND=true`
//                (which then earns a standing boot WARN — it is the incident's exact shape, permitted only
//                because someone asked for it).
//
// The escape hatch is deliberately a SEPARATE knob from `BIND_HOST`, so "I want the LAN" is a decision an
// operator makes on purpose and can be found by grepping one name — never a side-effect of a host string.
//
// ── THE MODE ARM (single-user) ────────────────────────────────────────────────────────────────────────────
// `single-user` has no login: its only credential is the un-credentialed owner fallback. So it listens on
// LOOPBACK in every NODE_ENV, production included, and a non-loopback listener (an explicit `BIND_HOST` or the
// dev hatch) is REFUSED at parse unless `AUTH_FALLBACK_TRUSTED_PEERS` declares the peer set. That knob is the
// override on purpose: it is launch-only, warned every boot (`fallback-peers.ts`), and it is what a container
// needs, because a published port never delivers a loopback peer. Every other mode keeps the arms above.
//
// ── WHAT THIS FILE DOES NOT DO ────────────────────────────────────────────────────────────────────────────
// It is not an authorization control and does not replace the C13 deploy invariant (the server port must not
// be directly reachable by untrusted networks — `IP_ALLOWLIST` + the reverse proxy remain the perimeter, and
// a PRODUCTION login-mode process still binds every interface by design). It bounds two things: how far a
// non-production build can be reached, and how far a no-login box can be reached. The loopback predicate is
// re-spelled here rather than reused from `infra/network/ip-ranges` because foundation sits BELOW infra — an
// upward import is physics-illegal (§2).

import type { AuthMode } from "@orb/contracts/identity";

/** Non-production default: the loopback interface, and nothing else. */
const LOOPBACK_HOST = "127.0.0.1";

/** Loopback spellings that are not the IPv4 /8 (matched exactly, lower-cased). */
const LOOPBACK_ALIASES: ReadonlySet<string> = new Set(["localhost", "::1", "[::1]", "::ffff:127.0.0.1"]);

/** The IPv4 loopback /8 — `127.0.0.0/8` routes to the local host, every octet of it. */
const LOOPBACK_V4_RE = /^127(\.\d{1,3}){3}$/;

/** The raw env values the resolver reads — passed in so this file never touches `process.env`. */
export interface BindPostureInput {
  readonly nodeEnv: "development" | "production" | "test";
  readonly authMode: AuthMode;
  /** `BIND_HOST` — unset means node's own default: EVERY interface. */
  readonly bindHost: string | undefined;
  /** `ALLOW_DEV_PUBLIC_BIND` — the deliberate-LAN-dev opt-in. */
  readonly allowDevPublicBind: boolean;
  /** `AUTH_FALLBACK_TRUSTED_PEERS` names at least one range: single-user's only door to a non-loopback bind. */
  readonly ownerPeersDeclared: boolean;
}

/** The composed posture. Every field is a fact about this boot, safe to print in a boot log. */
export interface BindPosture {
  /** The host to hand `serve({ hostname })`. `undefined` ⇒ omit the option ⇒ every interface (node default). */
  readonly host: string | undefined;
  /** True when the resolved listener admits connections from beyond loopback. */
  readonly publicBind: boolean;
  /** Non-null ⇒ this env combination is BOOT-FATAL; the string is the operator-facing reason. */
  readonly refusal: string | null;
  /** The ONE boot-log line stating what this bind means for reachability. Always present: the restriction
   *  arm has to be discoverable AT THE MOMENT OF CONFUSION — an operator whose FQDN just started answering
   *  502 greps the boot log, and the 502 itself belongs to the proxy and cannot carry the hint. */
  readonly notice: string;
}

/** The reachability sentence for each arm. The restricted one names the symptom (LAN/proxy/FQDN will not
 *  reach this process) AND both exits, because that is the line someone reads while confused. */
const NOTICE = {
  production: "listening on every interface (production — the reverse-proxy target).",
  // An EXPLICIT loopback bind in production (a same-host proxy in front, or the docker host-network
  // overlay): the process is deliberately unreachable off-box, and the log must not claim otherwise.
  productionLoopback:
    "bound to loopback ONLY (production, explicit BIND_HOST) — reachable by on-box processes and a same-host proxy; the LAN and the FQDN reach it only through that proxy.",
  opened: "publicly reachable on a NON-PRODUCTION build — ALLOW_DEV_PUBLIC_BIND is set (see the security warning below).",
} as const;

function restrictedNotice(host: string): string {
  return (
    `bound to ${host} — LOOPBACK ONLY, because this is a NON-PRODUCTION build. The LAN, the reverse proxy and the public FQDN ` +
    "will NOT reach this process (they get a 502). Deliberate: a dev build must not serve the internet (the 2026-08-09 leak). " +
    "For the FQDN run `pnpm stack up prod`; for deliberate LAN dev use set ALLOW_DEV_PUBLIC_BIND=true (which then logs a " +
    "standing security warning every boot)."
  );
}

/** True for any host that only the local machine can reach. An unset host is NOT loopback (node binds every
 *  interface), which is exactly why the default arm below has to substitute one. */
function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return LOOPBACK_ALIASES.has(normalized) || LOOPBACK_V4_RE.test(normalized);
}

function refusalFor(nodeEnv: string, bindHost: string): string {
  return (
    `BIND_HOST=${bindHost} with NODE_ENV=${nodeEnv} — a NON-PRODUCTION process must not listen where an untrusted ` +
    "network can reach it. This is the 2026-08-09 leak shape: a dev process bound on every interface behind the " +
    "public proxy served absolute host paths, the OS username and exact dependency versions to anonymous callers. " +
    "Serve the public deployment with `pnpm stack up prod` (NODE_ENV=production, prod dist) — never a dev/worktree/" +
    "snap process. For deliberate LAN dev use, set ALLOW_DEV_PUBLIC_BIND=true (accepted values are exactly `true`/" +
    "`false`), or bind loopback with BIND_HOST=127.0.0.1."
  );
}

const SINGLE_USER_REFUSAL =
  "AUTH_MODE=single-user serves this machine only. To let other devices sign in set AUTH_MODE=local (a session secret is generated for you). " +
  "In a container keep the port published on loopback and the shipped AUTH_FALLBACK_TRUSTED_PEERS.";

const SINGLE_USER_NOTICE =
  "bound to 127.0.0.1 — LOOPBACK ONLY, because AUTH_MODE=single-user has no login and serves this machine only. The LAN, a reverse " +
  "proxy and the public FQDN will NOT reach this process (a proxy gets a 502). To let other devices sign in set AUTH_MODE=local.";

/** The single-user arm, or `null` when the deploy-mode arms decide (every other mode, an explicit loopback
 *  bind, or a public bind the declared peer set admits). A declared peer set lifts the refusal on an
 *  explicit public bind; it never widens the unset default. */
function singleUserPosture(input: BindPostureInput): BindPosture | null {
  if (input.authMode !== "single-user") {
    return null;
  }
  // The hatch opens every interface only where it acts at all (non-production); in production it is inert.
  const hatchOpens = input.allowDevPublicBind && input.nodeEnv !== "production";
  if (input.bindHost === undefined && !hatchOpens) {
    return { host: LOOPBACK_HOST, publicBind: false, refusal: null, notice: SINGLE_USER_NOTICE };
  }
  const publicRequest = input.bindHost === undefined || !isLoopbackHost(input.bindHost);
  if (publicRequest && !input.ownerPeersDeclared) {
    return { host: input.bindHost, publicBind: true, refusal: SINGLE_USER_REFUSAL, notice: NOTICE.opened };
  }
  return null;
}

/** Resolve the listen host + the boot verdict. Total over (mode × env × host × hatch × peer set); the caller
 *  that enforces `refusal` is the env parse itself (`foundation/env/index.ts`'s superRefine), so an env
 *  carrying a refused combination cannot come into existence at all. */
export function resolveBindPosture(input: BindPostureInput): BindPosture {
  const singleUser = singleUserPosture(input);
  if (singleUser !== null) {
    return singleUser;
  }
  const production = input.nodeEnv === "production";
  if (production) {
    // Production binds where the operator says, defaulting to every interface — the proxy target needs it.
    const publicBind = input.bindHost === undefined || !isLoopbackHost(input.bindHost);
    return {
      host: input.bindHost,
      publicBind,
      refusal: null,
      notice: publicBind ? NOTICE.production : NOTICE.productionLoopback,
    };
  }
  if (input.bindHost === undefined) {
    // The DEFAULT arm: a non-production process restricts itself to loopback unless the hatch is open.
    return input.allowDevPublicBind
      ? { host: undefined, publicBind: true, refusal: null, notice: NOTICE.opened }
      : { host: LOOPBACK_HOST, publicBind: false, refusal: null, notice: restrictedNotice(LOOPBACK_HOST) };
  }
  if (isLoopbackHost(input.bindHost)) {
    return { host: input.bindHost, publicBind: false, refusal: null, notice: restrictedNotice(input.bindHost) };
  }
  // The REFUSE arm: an EXPLICIT non-loopback bind on a non-production build, without the opt-in.
  return {
    host: input.bindHost,
    publicBind: true,
    refusal: input.allowDevPublicBind ? null : refusalFor(input.nodeEnv, input.bindHost),
    notice: NOTICE.opened,
  };
}

/** The operator-facing lines for a posture — EMPTY when nothing needs saying, so a healthy boot is silent
 *  (the `diagnostics.ts` contract). The one standing warning is the hatch: a non-production process that IS
 *  publicly reachable is the incident's shape, allowed only because someone asked for it — it should keep
 *  announcing itself for as long as it is true. */
export function bindPostureWarnings(input: BindPostureInput, posture: BindPosture): readonly string[] {
  if (input.nodeEnv === "production" || !posture.publicBind) {
    return [];
  }
  return [
    `ALLOW_DEV_PUBLIC_BIND is set with NODE_ENV=${input.nodeEnv} — this NON-PRODUCTION process is listening on ` +
      `${posture.host ?? "every interface"} and is reachable off-box. A dev build ships dev-shaped diagnostics; the public ` +
      "deployment must run `pnpm stack up prod`. Unset the hatch when the LAN session is over.",
  ];
}
