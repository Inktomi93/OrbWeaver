// The DIAGNOSTICS POSTURE resolver — ONE coherent ops story for the knobs that decide who can look inside a
// running box and how much is there to see. Pure (raw values injected, no `process.env` read here), the
// `posture.ts` shape: a resolver + derived predicates + a warning list, all unit-testable.
//
// ── THE MENTAL MODEL AN OPERATOR HOLDS (three planes of ONE door) ─────────────────────────────────────────
//
//   PERIMETER   `IP_ALLOWLIST`                  WHO MAY REACH THE BOX AT ALL. A comma CIDR list; a request
//               (`infra/network::ipAllowlistMiddleware`)  from outside it (and outside loopback) gets 403
//                                               BEFORE any auth runs. Unset ⇒ anything that can route to the
//                                               port may knock. This is the OUTER ring and it is not
//                                               diagnostics-specific — it is the whole app's front gate,
//                                               which is exactly why it belongs in this story: it is the
//                                               only plane that bounds who may even ATTEMPT the other two.
//
//   CREDENTIAL  `DEBUG_TOKEN` (+ an admin SESSION)   WHO MAY OPEN THE DIAGNOSTICS DOOR. `/api/_debug/*` takes
//               (`observability/debug/routes.ts`)     exactly two credentials: an admin/owner session, or the
//                                               `x-debug-token` operator secret. TOKEN UNSET ⇒ the token arm
//                                               404s; the SESSION arm still opens the door (that is the
//                                               designed headless-vs-human split, not a gap). The token is a
//                                               bearer secret with no expiry and no per-caller identity —
//                                               its only lifecycle is rotation.
//
//   RETENTION   `WIRE_CAPTURE`, `RPG_TRACE`     WHAT IS BEHIND THE DOOR. Off ⇒ the recorder sink is never
//               (`debug/wire-capture.ts`,       wired: zero retained bytes, byte-identical turns, and the
//                `domain/rpg` ring)             probe answers `[]` — prod-safe by construction. On ⇒ a
//                                               per-process ring holds the FINAL PROVIDER REQUEST BODIES:
//                                               system prompts, full transcripts, persona/world text. That
//                                               is the most sensitive plaintext this app ever assembles.
//
// ── HOW THEY COMPOSE (the one sentence) ──────────────────────────────────────────────────────────────────
// The perimeter bounds who may knock; the credential bounds who gets in; retention decides what getting in
// is WORTH. Only the third plane changes the blast radius of the first two — which is why the resolver's
// verdict keys on retention × perimeter, and why `WIRE_CAPTURE=on` with `IP_ALLOWLIST` unset is the one
// combination that earns a standing warning.
//
// ── WHAT THIS FILE DOES NOT DO ───────────────────────────────────────────────────────────────────────────
// It changes NO gate's semantics. It does not rename the three env vars: `IP_ALLOWLIST` guards the whole
// app (not just diagnostics), so folding it under a `DEBUG_*`/`DIAGNOSTICS_*` prefix would MISFILE the one
// knob operators most need to find, and renaming the other two would break every live `.env`/compose file
// for cosmetic uniformity. The unification is the MODEL, the boot report and the `/api/_debug/info`
// readout — not a prefix.
//
// A FAIL-CLOSED arm (refuse to wire a capture sink at all while the perimeter is open) is the obvious next
// tightening and is deliberately NOT taken here: it would silently disable capture on a running deployment
// that has it on today, which is a posture flip the operator owns. The warning names the exact fix instead.

/** The composed verdict. Keys on RETENTION × PERIMETER — the credential planes are reported as facts
 *  beside it, because the door has a second credential (an admin session) that no env knob can remove. */
export const DIAGNOSTICS_EXPOSURES = ["minimal", "retaining", "retaining-open"] as const;
// @orb-gate-ignore no-inline-types: the §7.5 keystone — this derived type MUST co-locate with its `as const`
// tuple, and the exposure axis is a server-foundation env axis, not a cross-boundary contract.
export type DiagnosticsExposure = (typeof DIAGNOSTICS_EXPOSURES)[number];

/** The raw env values the resolver reads — passed in so this file never touches `process.env`. */
export interface DiagnosticsPostureInput {
  readonly debugToken: string | undefined;
  readonly ipAllowlist: string | undefined;
  readonly wireCapture: "on" | "off";
  readonly rpgTrace: "on" | "off";
}

/** The composed posture. Every field is a FACT about the running box, safe to print in a boot log and on
 *  the (already host-gated) `/api/_debug/info` probe — no secret value appears, only whether one is set. */
export interface DiagnosticsPosture {
  /** `true` when `IP_ALLOWLIST` is non-empty — the 403-before-auth ring is armed. */
  readonly perimeter: boolean;
  /** `true` when `DEBUG_TOKEN` is set. The admin-SESSION credential exists either way. */
  readonly tokenConfigured: boolean;
  /** The recorders currently retaining bytes, by env knob. Empty ⇒ nothing is held. */
  readonly retaining: readonly string[];
  readonly exposure: DiagnosticsExposure;
}

/** An empty/whitespace-only allowlist is NOT a perimeter — `parseAllowlist` yields zero entries and
 *  `app.ts` skips the middleware entirely, so the honest reading of `IP_ALLOWLIST=""` is "unset". */
function hasPerimeter(raw: string | undefined): boolean {
  return raw !== undefined && raw.trim() !== "";
}

/** The verdict axis, spelled as a total function so a new arm is a change HERE and nowhere else. */
function exposureOf(retains: boolean, perimeter: boolean): DiagnosticsExposure {
  if (!retains) {
    return "minimal";
  }
  return perimeter ? "retaining" : "retaining-open";
}

export function resolveDiagnosticsPosture(input: DiagnosticsPostureInput): DiagnosticsPosture {
  const perimeter = hasPerimeter(input.ipAllowlist);
  const retaining = [...(input.wireCapture === "on" ? ["WIRE_CAPTURE"] : []), ...(input.rpgTrace === "on" ? ["RPG_TRACE"] : [])];
  return { perimeter, tokenConfigured: input.debugToken !== undefined, retaining, exposure: exposureOf(retaining.length > 0, perimeter) };
}

/** The operator-facing lines for a posture — EMPTY when nothing needs saying, so a healthy boot is silent.
 *  Each line names the exposure AND the exact knob that closes it: a warning that does not tell you what to
 *  type is a warning that gets ignored. These are the two standing OWNER OPS items, made self-announcing. */
export function diagnosticsPostureWarnings(posture: DiagnosticsPosture): readonly string[] {
  const lines: string[] = [];
  if (posture.exposure === "retaining-open") {
    lines.push(
      `${posture.retaining.join(" + ")} is ON with no IP_ALLOWLIST — the /api/_debug ring holds RAW PROVIDER REQUEST BODIES ` +
        "(system prompts, full transcripts, persona/world text) behind a door reachable from any network that can route to this port. " +
        "Set IP_ALLOWLIST to your admin CIDR(s), or turn the recorder off.",
    );
  }
  if (posture.tokenConfigured && !posture.perimeter) {
    lines.push(
      "DEBUG_TOKEN is set with no IP_ALLOWLIST — it is a bearer secret with no expiry and no per-caller identity, " +
        "offered to any network that can route to this port. Set IP_ALLOWLIST, and rotate the token on a schedule.",
    );
  }
  return lines;
}
