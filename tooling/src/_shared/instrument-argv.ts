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
// sweep), not a side effect of adding one new flag. §4.3's remaining families land here in slice 2 of
// #1290 (ENVIRONMENT_FLAGS + its alias resolution, SESSION_ADMIN_FLAGS/STAGE_ADMIN_FLAGS refusal-with-
// pointer, ARTIFACT_FLAGS, and WHERE_FLAGS' other members) — this commit (slice 1) adds HELP_FLAGS and
// ALIAS_REFUSALS only, the two families the pain census (§1 P5) measured the most hits against.

/** HELP_FLAGS (§4.3): every tool prints its help and exits 0 on either spelling. Before this family,
 *  `--help`/`-h` was an UNKNOWN FLAG (exit 3) on every tool but snap — measured 34 hits across
 *  design-audit/ui-audit, motion-audit and perf-meter invocations (§1 P5). */
export const HELP_FLAGS: ReadonlySet<string> = new Set(["--help", "-h"]);

/** ALIAS_REFUSALS (§4.3): an unknown flag that matches a KNOWN ASK refuses NAMING the real flag instead
 *  of the generic "unknown flag" — measured asks (§1 P5): `--full-page` (snap has `--full`),
 *  `--watch-every` (it is `--every`), `--name` (it is `--out`), `--screenshot` (it is `--shot-of`).
 *  A consuming tool passes ITS OWN known-flag set to `aliasRefusal` so the suggestion never names a flag
 *  that tool does not actually have (`--full`/`--every`/`--shot-of` are snap-only; `--out` is shared). */
export const ALIAS_REFUSALS: ReadonlyMap<string, string> = new Map([
  ["--full-page", "--full"],
  ["--watch-every", "--every"],
  ["--name", "--out"],
  ["--screenshot", "--shot-of"],
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

/** The `--session <name>` help row, shared verbatim so the four sibling `--help` blocks describe the
 *  identical contract instead of four hand-written paraphrases drifting apart. */
export const SESSION_FLAG_HELP =
  "  --session <name>          attach to a live snap session's browser instead of launching a fresh one\n" +
  "                            (docs/design/1208-instrument-substrate.md §3.4) — the session must already\n" +
  "                            be booted (`pnpm snap --session <name> <route>`); a dead or foreign-owned\n" +
  "                            session is refused (exit 2), naming the reason. Stage/environment flags on\n" +
  "                            THIS run still apply to the run's OWN navigation; the browser itself is\n" +
  "                            shared, not re-launched.";
