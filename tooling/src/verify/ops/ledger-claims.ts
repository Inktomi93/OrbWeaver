// The `ledger-claims` BARRIER verb (#2195) — the two-sided check on what a COMMIT MESSAGE claims about the
// refutation ledger. Ruled 2026-09-12 (orchestrator playbook §5, after a verifier found EIGHTEEN ledger rows
// reading OPEN for landed work): **only the ledger's OWNER writes `flipped ledger rows:`; every other author
// writes `ledger rows OWED: <ids>`.** A lane fenced out of the ledger cannot flip a row, so `flipped` from a
// lane is a false claim BY CONSTRUCTION — and the phrase had carried no information for the whole program.
// One commit (`b5490a02a`) claimed three flips and touched the ledger zero times; two more said "none" while
// closing seven rows. Nothing checked any of it. This is the check.
//
// THE THREE ARMS, exactly as ruled:
//   (a) RED — a `flipped ledger rows:` line in a commit that touched NO hunk of the ledger. Names the sha.
//   (b) RED — an id in a `ledger rows OWED:` line that exists as no ROW in the ledger. Names the id.
//   (c) REPORT (never red) — an OWED id still in an OPEN-ish state after N later commits in the range. It is
//       a slow-moving fact about the queue, not a defect in the commit that owed it, and reddening on it
//       would make a lane's honest OWED line a liability.
//
// WHY IT IS A VERB AND NOT A `pnpm check` STAGE, which is the shape the brief asked for and the shape this
// tree refuses. A registry stage runs with FIXED argv and therefore needs a DEFAULT base, and both
// constructible defaults were measured on this tree and rejected (lane cb-x-verify-lib-fixes, 2026-09-13;
// orchestrator ruled the same day):
//
//   - `origin/main..HEAD` — the range already contains a commit whose `ledger rows OWED: #2201 #2203` names
//     ids that appear in ZERO ledger rows (`grep -c '^|.*#2201\b' <the ledger>` → 0; positive control
//     `#2214` → 1). Arm (b) would red on it FOREVER, and history cannot be edited: a stage whose only green
//     door is rewriting the past, which the lane skill bans outright.
//   - `merge-base(main, HEAD)..HEAD` — on main's own checkout the range is EMPTY (green always); on a lane it
//     is that lane's EARLIER commits, and under the one-commit-per-lane law that is zero. A stage that
//     measures nothing.
//
// So the RANGE IS REQUIRED and the operator supplies it: the orchestrator runs this over a merge train's
// range at the barrier, which is the moment the ruling actually bites. `--since` missing is MISUSE (3), not
// a defaulted guess — the whole failure mode this file exists for is a claim nobody checked, and a check
// that quietly picks its own subject is the same disease.
//
// EXIT CONTRACT (UNIFIED-VERIFICATION-DESIGN.md): 0 clean · 1 violations · 2 TOOL ERROR · 3 misuse. A git
// invocation that fails, and a LEDGER THAT PARSES TO ZERO ROWS, are both exit 2 — a comparison against an
// empty ledger would report every OWED id missing and read as a rich verdict. An empty COMMIT RANGE is
// legitimate and exits 0, but it says so on its own line: a bare zero is never a verdict.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { UsageError } from "@orb/tooling/_shared/run-tool";

refuseDirectInvocation(import.meta.url, "pnpm check:ledger-claims --since <rev> [--until <rev>]");

export const LEDGER_CLAIMS_HELP =
  "usage: node tooling/src/verify/cli.ts ledger-claims --since <rev> [--until <rev>]\n" +
  "  The BARRIER check on commit-message ledger claims (#2195). --since is REQUIRED: this verb judges an\n" +
  "  operator-stated range and never picks one for you.\n" +
  "  RED: a `flipped ledger rows:` line in a commit that touched no ledger hunk (only the ledger's owner\n" +
  "  writes that phrase) · an id in `ledger rows OWED:` that exists as no row in the ledger.\n" +
  "  REPORTED, never red: an OWED id still open after later commits in the same range.";

const REFUTATION_LEDGER_REL = "docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md";

/** The two ruled phrases, ONE home. Matched case-insensitively at a line start (a commit body wraps, and an
 *  author writing `Ledger rows OWED:` meant the same thing); the ids follow on the same line. */
const FLIPPED_RE = /^flipped ledger rows:(.*)$/gimu;
const OWED_RE = /^ledger rows owed:(.*)$/gimu;
/** A board id as a lane writes it: `#2214`. */
const ID_RE = /#(\d+)/gu;
/** The legal empty value — `none`, with or without the trailing prose every honest lane adds. */
const NONE_RE = /^\s*none\b/iu;

/** How many LATER commits in the same range make an unclosed OWED id worth a report line. Arbitrary by
 *  nature and deliberately generous: the point is to surface a row the queue forgot, not to police a lane
 *  whose fix landed an hour ago. */
const STALE_OWED_AFTER = 10;

/** A ledger STATE cell that still means "not closed". The ledger's own vocabulary; a row whose state cell
 *  matches none of these (CLOSED, FIXED) is settled and never reported. */
const OPEN_STATE_RE = /\b(OPEN|PARTIAL|UNADJUDICATED)\b/u;

/** THE RECORD FENCE. `git log --format=<sep>%n%H --name-only` emits one record per commit; the fence is a
 *  token on its OWN LINE, so the split is line-anchored rather than substring-matched and a commit body
 *  would have to contain that exact line alone to collide. A NUL byte was the first choice and is NOT
 *  usable: it survives into the TypeScript literal, turns the module into a BINARY file to grep and every
 *  other text tool, and renders as a plain space with nothing failing. */
const RECORD_SEP = "ORB-LEDGER-CLAIMS-RECORD";
const RECORD_SPLIT_RE = /^ORB-LEDGER-CLAIMS-RECORD$/mu;
/** THE SECOND FENCE, AND IT IS NOT DECORATION — IT IS THIS TOOL'S OWN FALSE-CLEAN, CAUGHT BY DRIVING IT
 *  AT ITS FOUNDING CASE (2026-09-13). The first draft separated body from paths by a heuristic — *a line
 *  containing a slash is a path* — and reasoned in a comment that the failure direction was safe. It was
 *  not: `b5490a02a`, the commit the whole ruling was minted from, NAMES the ledger path in its own PROSE,
 *  so the heuristic read that sentence as a ledger hunk and ACQUITTED the false `flipped` claim. The verb
 *  reported `1 commit(s) … ` and zero findings on the one commit it exists to catch. `--name-only` emits
 *  the paths AFTER the format output, so the format ends with this fence and everything past it — and
 *  only that — is a path. A heuristic where the format can carry a delimiter is a choice to be wrong. */
const PATH_SEP = "ORB-LEDGER-CLAIMS-PATHS";

interface ClaimCommit {
  readonly sha: string;
  readonly body: string;
  readonly files: readonly string[];
}

export interface LedgerClaimsFinding {
  readonly kind: "false-flip" | "missing-row" | "stale-owed";
  readonly sha: string;
  readonly line: string;
}

/** Every `#nnnn` on a claim line, or `[]` when the line is the legal `none`. */
function claimedIds(value: string): readonly string[] {
  if (NONE_RE.test(value)) {
    return [];
  }
  return [...value.matchAll(ID_RE)].map(([, id]) => id ?? "");
}

/** Parse `git log`'s record stream. Each record is `<sha>\n<body>\n\n<name-only paths>`; a merge commit with
 *  no diff contributes no paths, which is correct — it authored no ledger hunk either. */
export function parseClaimCommits(stdout: string): readonly ClaimCommit[] {
  const out: ClaimCommit[] = [];
  for (const record of stdout.split(RECORD_SPLIT_RE)) {
    const trimmed = record.replace(/^\n+/u, "");
    if (trimmed.trim().length === 0) {
      continue;
    }
    const [sha = "", ...rest] = trimmed.split("\n");
    const fence = rest.indexOf(PATH_SEP);
    if (fence === -1) {
      // The format ALWAYS emits the fence, so its absence means the stream is not what this parser was
      // written against — a silent skip here is how a parser stops measuring. Say so, loudly.
      throw new Error(`ledger-claims: commit ${sha} record carries no ${PATH_SEP} fence — the git format and this parser disagree`);
    }
    out.push({ sha, body: rest.slice(0, fence).join("\n"), files: rest.slice(fence + 1).filter((line) => line.trim().length > 0) });
  }
  return out;
}

/** The ledger's row ids: every `#nnnn` that appears inside a TABLE ROW (a line starting `|`), paired with
 *  whether that row still reads open. Prose mentions outside a row are deliberately not rows — an id named
 *  only in a paragraph is not a tracked defect. */
export function ledgerRowStates(text: string): ReadonlyMap<string, boolean> {
  const out = new Map<string, boolean>();
  for (const line of text.split("\n")) {
    if (!line.startsWith("|")) {
      continue;
    }
    const open = OPEN_STATE_RE.test(line);
    for (const [, id] of line.matchAll(ID_RE)) {
      if (id !== undefined) {
        // A row id can appear twice (a defect refiled under a second wave); ANY open occurrence keeps it open.
        out.set(id, (out.get(id) ?? false) || open);
      }
    }
  }
  return out;
}

/** The whole judgement, as a pure function of the parsed range and the ledger — so the pins drive it
 *  directly and a planted control never needs a real repository at this tier. */
/** Arm (a) for ONE commit. */
function falseFlipFindings(commit: ClaimCommit): readonly LedgerClaimsFinding[] {
  if (commit.files.includes(REFUTATION_LEDGER_REL)) {
    return [];
  }
  return [...commit.body.matchAll(FLIPPED_RE)].map(([, value]) => ({
    kind: "false-flip" as const,
    sha: commit.sha,
    line:
      `${commit.sha} claims \`flipped ledger rows:${value ?? ""}\` and touched NO hunk of ${REFUTATION_LEDGER_REL}. ` +
      "Only the ledger's OWNER writes that phrase; every other author writes `ledger rows OWED: <ids>` (playbook §5, #2195).",
  }));
}

/** Arms (b) and (c) for ONE commit. `later` is how many commits follow it inside the judged range. */
function owedFindings(commit: ClaimCommit, rows: ReadonlyMap<string, boolean>, later: number): readonly LedgerClaimsFinding[] {
  const out: LedgerClaimsFinding[] = [];
  for (const [, value] of commit.body.matchAll(OWED_RE)) {
    for (const id of claimedIds(value ?? "")) {
      const state = rows.get(id);
      if (state === undefined) {
        out.push({
          kind: "missing-row",
          sha: commit.sha,
          line: `${commit.sha} owes ledger row #${id}, which exists as no row in ${REFUTATION_LEDGER_REL} — name an id the ledger carries, or file the row.`,
        });
      } else if (state && later >= STALE_OWED_AFTER) {
        // The queue arm: a report line, never a red — reddening here would make an honest OWED line a
        // liability for the lane that wrote it, months after that lane ended.
        out.push({
          kind: "stale-owed",
          sha: commit.sha,
          line: `${commit.sha} owed #${id} and it still reads OPEN ${String(later)} commit(s) later — the queue has not reconciled it.`,
        });
      }
    }
  }
  return out;
}

/** The whole judgement, as a pure function of the parsed range and the ledger — so the pins drive it
 *  directly and a planted control never needs a real repository at this tier. */
export function judgeLedgerClaims(commits: readonly ClaimCommit[], rows: ReadonlyMap<string, boolean>): readonly LedgerClaimsFinding[] {
  return commits.flatMap((commit, index) => [...falseFlipFindings(commit), ...owedFindings(commit, rows, commits.length - index - 1)]);
}

/** THE CAPTURE CEILING FOR THE RANGE READ (#2284). node's `spawnSync` default is ~1 MiB and it does NOT
 *  truncate at it — it KILLS the child with `ENOBUFS` — and this verb's whole subject is a git log carrying
 *  every commit MESSAGE and every changed PATH over an operator-chosen range, which is the payload shape most
 *  likely to outgrow a default nobody chose. Bracketed on the real repository 2026-09-13 by the lane that
 *  filed the row: 1,023,170 bytes came back judged, 1,457,840 bytes came back `status: null` — and the barrier
 *  use this verb exists for (a whole merge train, HEAD~300 in the measurement) is on the far side of that
 *  line. 256 MiB is ~180× the observed HEAD~300 read: this is a ceiling that keeps a runaway from eating the
 *  box, not a size anyone should approach, and the refusal below NAMES it so the next reader who does
 *  approach it is told which number stopped them rather than being told git failed. */
const BYTES_PER_KIB = 1024;
const KIB_PER_MIB = 1024;
const GIT_LOG_BUFFER_MIB = 256;
const GIT_LOG_MAX_BUFFER_BYTES = GIT_LOG_BUFFER_MIB * KIB_PER_MIB * BYTES_PER_KIB;
const ENOBUFS = "ENOBUFS";

/** THE RANGE READ, with its ceiling as a defaulted PARAMETER — the `ops/eslint.ts#readDiscoveredPopulation`
 *  shape, for its reason: a ceiling nobody can plant is a ceiling whose refusal nobody can prove, and 256 MiB
 *  of real log is not a fixture anyone will ever build. The pin passes a tiny one over a planted repository
 *  and reads the refusal; production passes nothing. */
export function readClaimRange(
  root: string,
  since: string,
  until: string,
  maxBuffer: number = GIT_LOG_MAX_BUFFER_BYTES,
): { readonly stdout: string } | { readonly error: string } {
  const res = runNicedSync("git", ["-C", root, "log", `--format=${RECORD_SEP}%n%H%n%B%n${PATH_SEP}`, "--name-only", `${since}..${until}`], {
    cwd: root,
    maxBuffer,
  });
  // THE CEILING IS OURS, SO THE REFUSAL MUST SAY SO. A `status: null` with `ENOBUFS` is this process killing
  // the child for producing more than WE agreed to capture; reporting it as "git log failed" is the
  // instrument blaming its subject for its own limit, and it read exactly like a broken repository.
  if (res.errorCode === ENOBUFS) {
    return {
      error:
        // The ceiling IN FORCE, never the module constant: they differ whenever a caller passes one, and a
        // refusal that quotes a number the run did not use is the same class of lie as blaming git.
        `the git log for ${since}..${until} exceeded this verb's ${String(maxBuffer)}-byte stdout ceiling ` +
        "(GIT_LOG_MAX_BUFFER_BYTES in tooling/src/verify/ops/ledger-claims.ts), so the child was KILLED with ENOBUFS rather " +
        "than truncated and NO range was read. git did not fail. Narrow the range, or raise the ceiling.",
    };
  }
  if (res.errorCode !== undefined) {
    return { error: `git log ${since}..${until} could not be spawned (${res.errorCode}) — this run read no range and is not a verdict.\n${res.stderr}` };
  }
  if (res.status !== 0) {
    return { error: `git log ${since}..${until} failed (status ${String(res.status)})\n${res.stderr}` };
  }
  return { stdout: res.stdout };
}

interface ParsedArgv {
  readonly since: string;
  readonly until: string;
}

function parseLedgerClaimsArgv(argv: readonly string[]): ParsedArgv {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({ args: [...argv], options: { since: { type: "string" }, until: { type: "string" } }, strict: true, allowPositionals: false });
  } catch (error) {
    throw new UsageError(`${error instanceof Error ? error.message : String(error)}\n${LEDGER_CLAIMS_HELP}`, { cause: error });
  }
  const since = parsed.values["since"];
  if (typeof since !== "string" || since.trim().length === 0) {
    throw new UsageError(`ledger-claims needs --since <rev>: this verb judges a STATED range and never picks one.\n${LEDGER_CLAIMS_HELP}`);
  }
  const until = parsed.values["until"];
  return { since, until: typeof until === "string" && until.trim().length > 0 ? until : "HEAD" };
}

/** `cli.ts ledger-claims --since <rev> [--until <rev>]`. */
export function runLedgerClaims(root: string, argv: readonly string[]): number {
  const { since, until } = parseLedgerClaimsArgv(argv);
  let text: string;
  try {
    text = readFileSync(join(root, REFUTATION_LEDGER_REL), "utf8");
  } catch (error) {
    process.stderr.write(`TOOL ERROR ledger-claims cannot read ${REFUTATION_LEDGER_REL}: ${String(error)}\n`);
    return EXIT.toolError;
  }
  const rows = ledgerRowStates(text);
  if (rows.size === 0) {
    // Blindness, not cleanliness — the same refusal `ledgers-fresh` makes for an empty derivation.
    process.stderr.write(`TOOL ERROR ${REFUTATION_LEDGER_REL} parsed to ZERO rows — every OWED id would read as missing; this run is not a verdict.\n`);
    return EXIT.toolError;
  }
  const log = readClaimRange(root, since, until);
  if ("error" in log) {
    process.stderr.write(`TOOL ERROR ${log.error}\n`);
    return EXIT.toolError;
  }
  const commits = parseClaimCommits(log.stdout);
  const findings = judgeLedgerClaims(commits, rows);
  // The SUBJECT is printed on every run, clean or not: an empty range is a legitimate answer and an
  // unlabelled zero is the thing this whole file exists to refuse.
  process.stdout.write(`ledger-claims  ${String(commits.length)} commit(s) in ${since}..${until} · ${String(rows.size)} ledger row id(s)\n`);
  for (const finding of findings) {
    process.stdout.write(`${finding.kind === "stale-owed" ? "report" : "RED   "}  ${finding.line}\n`);
  }
  return findings.some(({ kind }) => kind !== "stale-owed") ? EXIT.violations : EXIT.clean;
}
