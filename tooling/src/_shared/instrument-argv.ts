// The shared flag-FAMILY tables every instrument's own `ops/parse.ts` consumes
// (docs/design/1208-instrument-substrate.md §4.2/§4.3). `Core-Tooling-Law.md` §4.9 refuses a generic
// `parseArgv(spec)` — each tool keeps its own byte-stable parser and scanner — so this file holds only
// the DATA a family shares (the flag's name, its help line, its required-value shape), never a parser.
//
// Phase 4 (design §10's row) starts this file with WHERE_FLAGS' one NEW member, `--session` (#1285): the
// substrate's sibling-attach flag, spelled ONCE here so `design-audit`/`motion-audit`/`perf-meter`/
// `record` cannot each mint their own copy of its name or its help text. `--base`/`--isolated`/`--ref`/
// `--dirty`/`--fresh` — WHERE_FLAGS' other §4.3 members — stay hand-spelled per tool for now: moving them
// here is a BYTE-STABILITY-checked migration of its own (a value change owes the `tests/**` literal
// sweep), not a side effect of adding one new flag. The rest of §4.3's families (HELP_FLAGS,
// ARTIFACT_FLAGS, ALIAS_REFUSALS, …) land in a later commit — do not grow this file "while in here".

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
