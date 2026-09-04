// The shared flag-FAMILY tables a public rendered tool's own `ops/parse.ts` consumes
// (docs/design/1208-instrument-substrate.md §4.2/§4.3). `Core-Tooling-Law.md` §4.9 refuses a generic
// `parseArgv(spec)` — a tool keeps its own byte-stable parser and scanner — so this file holds only
// the DATA a family shares (the flag's name, its required-value shape), never a parser.
//
// THERE IS ONE PARSER LEFT (#1315). The family tables were the accepted-vocabulary source for Snap AND
// its four sibling CLIs; the siblings are folded into Snap arms and their argv doors are gone, so this
// file is now Snap's own enforcement input plus the two tests that pin the vocabulary. It is kept rather
// than inlined because the FAMILY is the contract: `instrumentFamilyRosterErrors` still makes a missing
// shared member fail loud before a browser boots, which is what caught a parser that quietly stopped
// accepting `--isolated`.

/** HELP_FLAGS (§4.3): every tool prints its help and exits 0 on either spelling. Before this family,
 *  `--help`/`-h` was an UNKNOWN FLAG (exit 3) on every tool but snap — measured 34 hits across
 *  design-audit/ui-audit, motion-audit and perf-meter invocations (§1 P5). */
export const HELP_FLAGS: ReadonlySet<string> = new Set(["--help", "-h"]);

/** ALIAS_REFUSALS (§4.3): an unknown flag that matches a KNOWN ASK refuses NAMING the real flag instead
 *  of the generic "unknown flag" — measured asks (§1 P5): `--full-page` (snap has `--full`),
 *  `--watch-every` (it is `--every`), `--name` (it is `--out`), `--screenshot` (it is `--shot-of`).
 *  THIS IS A REFUSAL TABLE, NOT AN ALIAS TABLE. The old flag stops working outright; it is never quietly
 *  accepted as a second spelling for the same thing (Core-Tooling-Law.md §1's half-migration ban).
 *  A consuming tool passes ITS OWN known-flag set to `aliasRefusal` so the suggestion never names a flag
 *  that tool does not actually have (`--full`/`--every`/`--shot-of` are snap-only; `--out` is shared).
 *
 *  THE SIBLING CLIs' RETIRED SPELLINGS STAY IN THIS TABLE THROUGH #1315, and the reason is the table's
 *  own nature: `aliasRefusal` only fires when the SUGGESTED flag is one the consuming tool actually has,
 *  and all six of those targets (`--reduced-motion`, `--cpu-profile`, `--dom-click`, `--wheel-burst`,
 *  `--perf-cycles`) are LIVE SNAP FLAGS. So `--os-reduced-motion` and `--cpuprofile` are not a retired
 *  sibling's door — they are stale spellings of a capability Snap still has, and the row is what makes
 *  the stale spelling die NAMING its replacement instead of dying generically. The doors the owner
 *  ruling deleted were argv TRANSLATION layers (a `cli.ts` that accepted the old grammar and re-ran
 *  Snap); a refusal that accepts nothing is the ruling's mechanism, not its target. */
export const ALIAS_REFUSALS: ReadonlyMap<string, string> = new Map([
  ["--full-page", "--full"],
  ["--watch-every", "--every"],
  ["--name", "--out"],
  ["--screenshot", "--shot-of"],
  ["--os-reduced-motion", "--reduced-motion"],
  ["--os-full-motion", "--reduced-motion"],
  ["--profile", "--react-profile"],
  ["--cpuprofile", "--cpu-profile"],
  ["--jsclick", "--dom-click"],
  ["--press", "--force-click"],
  ["--wheelburst", "--wheel-burst"],
  ["--ls", "--local-storage"],
  ["--sse", "--stream-settle"],
  ["--summary", "--scenario-summary"],
  ["--owner", "--stage-owner"],
  ["--cycles", "--perf-cycles"],
]);

/** Returns the "unknown flag X — did you mean Y?" refusal for a token in `ALIAS_REFUSALS`, but ONLY when
 *  `knownFlags` (the CALLING tool's own vocabulary) actually has the suggested spelling — otherwise `null`,
 *  so the generic "unknown flag" applies rather than a suggestion that names a flag the tool never had. */
export function aliasRefusal(flag: string, knownFlags: ReadonlySet<string>): string | null {
  const real = ALIAS_REFUSALS.get(flag);
  if (real === undefined || !knownFlags.has(real)) {
    return null;
  }
  if (flag === "--os-full-motion") {
    return "unknown flag --os-full-motion — full motion is already the default; omit the flag";
  }
  return `unknown flag ${flag} — did you mean ${real}?`;
}

/** `--session <name>` (design §3.4/§5, #1285). The sibling tools this constant was minted for are gone
 *  (#1315) and Snap owns the flag outright (`snap/ops/flags-session.ts`); it stays a named member of
 *  `WHERE_FLAGS` below because the family roster is what `instrumentFamilyRosterErrors` enforces. */
export const SESSION_FLAG = "--session";

/** WHERE_FLAGS (§4.3): the complete shared location/session vocabulary for all public rendered tools. */
const WHERE_FLAG_NAMES = ["--base", "--isolated", "--ref", "--dirty", "--fresh", SESSION_FLAG] as const;
export type WhereFlag = (typeof WHERE_FLAG_NAMES)[number];
export const WHERE_FLAGS: ReadonlySet<WhereFlag> = new Set(WHERE_FLAG_NAMES);

/** The canonical `--reduced-motion` spelling — the RENAME target (owner ruling 2026-09-03) for the
 *  retired `--os-reduced-motion`/`--os-full-motion`; snap has carried this spelling since phase 1. A
 *  named constant (SESSION_FLAG's shape) rather than a bare literal so a future consumer of this same
 *  member never re-spells it. */
export const REDUCED_MOTION_FLAG = "--reduced-motion";

/** ENVIRONMENT_FLAGS (§4.3): one spelling, no aliases, and one accepted roster across all public rendered tools. */
const ENVIRONMENT_FLAG_NAMES = ["--viewport", "--wide", "--mobile", "--desktop", "--dark", "--light", REDUCED_MOTION_FLAG] as const;
export type EnvironmentFlag = (typeof ENVIRONMENT_FLAG_NAMES)[number];
export const ENVIRONMENT_FLAGS: ReadonlySet<EnvironmentFlag> = new Set(ENVIRONMENT_FLAG_NAMES);

const ARTIFACT_FLAG_NAMES = ["--out", "--json"] as const;
export type ArtifactFlag = (typeof ARTIFACT_FLAG_NAMES)[number];
export const ARTIFACT_FLAGS: ReadonlySet<ArtifactFlag> = new Set(ARTIFACT_FLAG_NAMES);

export const INSTRUMENT_FLAG_FAMILIES = {
  where: WHERE_FLAGS,
  environment: ENVIRONMENT_FLAGS,
  artifact: ARTIFACT_FLAGS,
} as const satisfies Readonly<Record<"where" | "environment" | "artifact", ReadonlySet<string>>>;

/** The parser-side enforcement seam for §4.2/§4.3. This checks vocabulary membership only; tool-specific
 * semantics, value validation, conflicts, and legacy refusals remain in each parser. */
export function instrumentFamilyRosterErrors(tool: string, acceptedFlags: ReadonlySet<string>): string[] {
  const errors: string[] = [];
  for (const [family, flags] of Object.entries(INSTRUMENT_FLAG_FAMILIES)) {
    const missing = [...flags].filter((flag) => !acceptedFlags.has(flag));
    if (missing.length > 0) {
      errors.push(`${tool} parser is missing shared ${family} flags: ${missing.join(", ")}`);
    }
  }
  return errors;
}

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
