// The shared flag-FAMILY tables every instrument's own `ops/parse.ts` consumes
// (docs/design/1208-instrument-substrate.md §4.2/§4.3). `Core-Tooling-Law.md` §4.9 refuses a generic
// `parseArgv(spec)` — each tool keeps its own byte-stable parser and scanner — so this file holds only
// the DATA a family shares (the flag's name, its help line, its required-value shape), never a parser.
//
// Phase 4 (design §10's row) started this file with WHERE_FLAGS' one NEW member, `--session` (#1285): the
// substrate's sibling-attach flag, spelled ONCE here so `design-audit`/`motion-audit`/`perf-meter`/
// `record` cannot each mint their own copy of its name or its help text. `--base`/`--isolated`/`--ref`/
// `--dirty`/`--fresh` — WHERE_FLAGS' other §4.3 members — stay hand-spelled per tool for now: moving them
// here is a BYTE-STABILITY-checked migration of its own (a value change owes the `tests/**` literal
// sweep), not a side effect of adding one new flag. Slice 1 (#1290) added HELP_FLAGS and ALIAS_REFUSALS
// (the two families the pain census, §1 P5, measured the most hits against) and design-audit's --wait ->
// --settle rename (F1). Slice 2 added SESSION_ADMIN_FLAGS/STAGE_ADMIN_FLAGS refusal-with-pointer.
//
// OWNER RULING 2026-09-03 (474e2df65, re-attested 5f8da9a13) SUPERSEDES this file's original slice-1/2
// deferral note (git history has the old text): "this flag exists on snap only, so adding it to the
// siblings is a feature addition" is NOT a reason to defer — THE UNIFICATION IS TOTAL, a tool that lacks a
// family member GAINS it, and that IS the deliverable (§1's P5 counted five dialects precisely because
// each tool grew its own vocabulary). Slice 3 lands motion-audit's `--os-reduced-motion`/`--os-full-motion`
// RENAME to the canonical `--reduced-motion` (ENVIRONMENT_FLAGS' first cross-tool member; the owner also
// ruled NO ALIASES survive — the old spellings are REFUSALS, not accepted second spellings) plus the pure-
// spelling promotion of `--viewport`/`--mobile`/`--desktop` (already IDENTICAL across all five tools).
// The remaining ENVIRONMENT_FLAGS members (`--wide`/`--dark`/`--light` as NEW capability on
// design-audit/perf-meter/record), all of ARTIFACT_FLAGS, and WHERE_FLAGS' isolated-stage members land in
// a LATER slice — wiring them requires touching each sibling's `ops/run.ts` browser-launch call and
// `_shared/browser.ts`, both reserved to other live lanes (`cb-bind`, `cb-screen`) as of this slice; see
// the closing fork report for the receipts.

/** HELP_FLAGS (§4.3): every tool prints its help and exits 0 on either spelling. Before this family,
 *  `--help`/`-h` was an UNKNOWN FLAG (exit 3) on every tool but snap — measured 34 hits across
 *  design-audit/ui-audit, motion-audit and perf-meter invocations (§1 P5). */
export const HELP_FLAGS: ReadonlySet<string> = new Set(["--help", "-h"]);

/** ALIAS_REFUSALS (§4.3): an unknown flag that matches a KNOWN ASK refuses NAMING the real flag instead
 *  of the generic "unknown flag" — measured asks (§1 P5): `--full-page` (snap has `--full`),
 *  `--watch-every` (it is `--every`), `--name` (it is `--out`), `--screenshot` (it is `--shot-of`).
 *  `--os-reduced-motion`/`--os-full-motion` (owner ruling 2026-09-03): motion-audit's RENAMED spellings —
 *  THIS IS A REFUSAL TABLE, NOT AN ALIAS TABLE. The old flag stops working outright; it is never quietly
 *  accepted as a second spelling for the same thing (Core-Tooling-Law.md §1's half-migration ban).
 *  A consuming tool passes ITS OWN known-flag set to `aliasRefusal` so the suggestion never names a flag
 *  that tool does not actually have (`--full`/`--every`/`--shot-of` are snap-only; `--out` is shared). */
export const ALIAS_REFUSALS: ReadonlyMap<string, string> = new Map([
  ["--full-page", "--full"],
  ["--watch-every", "--every"],
  ["--name", "--out"],
  ["--screenshot", "--shot-of"],
  ["--os-reduced-motion", "--reduced-motion"],
  ["--os-full-motion", "--reduced-motion"],
]);

/** Returns the "unknown flag X — did you mean Y?" refusal for a token in `ALIAS_REFUSALS`, but ONLY when
 *  `knownFlags` (the CALLING tool's own vocabulary) actually has the suggested spelling — otherwise `null`,
 *  so the generic "unknown flag" applies rather than a suggestion that names a flag the tool never had. */
export function aliasRefusal(flag: string, knownFlags: ReadonlySet<string>): string | null {
  const real = ALIAS_REFUSALS.get(flag);
  return real !== undefined && knownFlags.has(real) ? `unknown flag ${flag} — did you mean ${real}?` : null;
}

/** The substrate's sibling-attach flag (design §3.4/§5, #1285): `--session <name>` on
 *  design-audit/motion-audit/perf-meter/record resolves through `snap`'s front door
 *  (`resolveSessionAttach`) instead of launching a fresh browser. Snap's own `--session` predates this
 *  file (phase 1, `snap/ops/flags-session.ts`) and is unchanged — this constant is for the FOUR SIBLINGS
 *  only, so the name is spelled once for them rather than once each. */
export const SESSION_FLAG = "--session";

/** WHERE_FLAGS (§4.3): today this family has exactly one member a sibling tool's parser wires — see the
 *  header note on why `--base`/`--isolated`/`--ref`/`--dirty`/`--fresh` are not here yet. */
export const WHERE_FLAGS: ReadonlySet<string> = new Set([SESSION_FLAG]);

/** The canonical `--reduced-motion` spelling — motion-audit's RENAME target (owner ruling 2026-09-03) for
 *  its retired `--os-reduced-motion`/`--os-full-motion`; snap has carried this spelling since phase 1. A
 *  named constant (SESSION_FLAG's shape) rather than a bare literal so a future consumer of this same
 *  member never re-spells it. */
export const REDUCED_MOTION_FLAG = "--reduced-motion";

/** ENVIRONMENT_FLAGS (§4.3, owner ruling 2026-09-03): ONE spelling, no aliases, lands on ALL FIVE tools.
 *  `--reduced-motion` is the first member wired here (slice 3, #1290). `--viewport`/`--mobile`/`--desktop`
 *  already agree byte-for-byte across all five tools' hand-spelled literals and are the next safe
 *  promotion (unchanged this slice — a spelling move is still its own byte-stability receipt, not a side
 *  effect of this one). `--wide`/`--dark`/`--light` are NEW capability on design-audit/perf-meter/record
 *  and are DEFERRED: see this file's header for why (the wiring crosses into files two other live lanes
 *  own). */
export const ENVIRONMENT_FLAGS: ReadonlySet<string> = new Set([REDUCED_MOTION_FLAG]);

/** SESSION_ADMIN_FLAGS (§4.3): snap-only — the sibling four are refused BY NAME with a pointer (below),
 *  never a bare "unknown flag". */
export const SESSION_ADMIN_FLAGS: ReadonlySet<string> = new Set([
  "--session-status",
  "--session-close",
  "--session-sweep",
  "--session-export",
  "--session-ttl",
]);

/** STAGE_ADMIN_FLAGS (§4.3): snap-only (unchanged ruling: one lifecycle owner). `--force` is shared with
 *  SESSION_ADMIN_FLAGS' teardown-consent shape (#447) rather than doubled in both sets. */
export const STAGE_ADMIN_FLAGS: ReadonlySet<string> = new Set(["--stage-status", "--stage-down", "--stage-sweep", "--force"]);

/** A sibling tool's scanArgv calls this on every unknown flag BEFORE the generic "unknown flag" and before
 *  `aliasRefusal` (session/stage admin is a STRONGER refusal than "did you mean" — it names the one home,
 *  not a synonym). Snap itself never calls this: it owns SESSION_ADMIN_FLAGS/STAGE_ADMIN_FLAGS, so they
 *  are never unknown there and this branch is unreached. */
export function crossToolAdminRefusal(flag: string): string | null {
  if (SESSION_ADMIN_FLAGS.has(flag)) {
    return `unknown flag ${flag} — session admin is snap's: pnpm snap --session-status|--session-close|--session-sweep|--session-export|--session-ttl`;
  }
  if (STAGE_ADMIN_FLAGS.has(flag)) {
    return `unknown flag ${flag} — stage admin is snap's: pnpm snap --stage-status|--stage-down|--stage-sweep`;
  }
  return null;
}

/** The `--session <name>` help row, shared verbatim so the four sibling `--help` blocks describe the
 *  identical contract instead of four hand-written paraphrases drifting apart. */
export const SESSION_FLAG_HELP =
  "  --session <name>          attach to a live snap session's browser instead of launching a fresh one\n" +
  "                            (docs/design/1208-instrument-substrate.md §3.4) — the session must already\n" +
  "                            be booted (`pnpm snap --session <name> <route>`); a dead or foreign-owned\n" +
  "                            session is refused (exit 2), naming the reason. Stage/environment flags on\n" +
  "                            THIS run still apply to the run's OWN navigation; the browser itself is\n" +
  "                            shared, not re-launched.";
