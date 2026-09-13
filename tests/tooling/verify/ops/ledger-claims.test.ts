// THE #2195 PIN — the barrier check on what a COMMIT MESSAGE claims about the refutation ledger.
//
// RED-FIRST is a different shape here: the defect was that NOTHING checked these claims, so the red-first
// receipt is the tree itself. Measured before this verb existed, on this checkout:
//   • `b5490a02a` carries `flipped ledger rows:` naming three ids and its `--name-only` list contains no
//     hunk of the ledger at all — arm (a)'s founding case, and the reason the ruling exists.
//   • a commit in the same history carries `ledger rows OWED: #2201 #2203` and BOTH ids appear in zero
//     ledger rows (`grep -c '^|.*#2201\b' <the ledger>` → 0, positive control `#2214` → 1) — arm (b)'s.
// Neither produced a single byte of output from any instrument.
//
// The judgement is driven as a PURE function over parsed commits plus a parsed ledger, so every control is
// planted in BOTH directions in the same invocation and none of them needs a scratch repository: the git
// call is one `git log --format=<fence>%n%H --name-only`, and its PARSING is pinned separately below on a
// verbatim sample of that stream.
import { judgeLedgerClaims, ledgerRowStates, parseClaimCommits } from "../../../../tooling/src/verify/ops/ledger-claims.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const LEDGER = "docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md";
const FENCE = "ORB-LEDGER-CLAIMS-RECORD";
const PATH_FENCE = "ORB-LEDGER-CLAIMS-PATHS";

/** A two-row ledger: one OPEN, one CLOSED — so the state arm has both polarities to read. */
const LEDGER_TEXT = [
  "# Refutation ledger",
  "",
  "Prose naming #9999, which is NOT a row — a paragraph mention is not a tracked defect.",
  "",
  "| module | wave | defect | class | state | receipt |",
  "| - | - | - | - | - | - |",
  "| `a-policy` | w1 | a defect | gate blind spot | **OPEN** (board #1111) | driven |",
  "| `b-policy` | w1 | another | §5b.2 message | **CLOSED** (board #2222) | driven |",
  "",
].join("\n");

function commit(sha: string, body: string, files: readonly string[]): { readonly sha: string; readonly body: string; readonly files: readonly string[] } {
  return { sha, body, files };
}

test("the ledger's ROWS are its table lines — a prose mention is not a row", () => {
  const rows = ledgerRowStates(LEDGER_TEXT);
  expect([...rows.keys()].toSorted()).toEqual(["1111", "2222"]);
  expect(rows.get("1111"), "the OPEN row").toBe(true);
  expect(rows.get("2222"), "the CLOSED row").toBe(false);
  expect(rows.has("9999"), "the prose mention is NOT a row — the negative control").toBe(false);
});

// ── arm (a): a false `flipped` claim ─────────────────────────────────────────────────────────────────
test("a `flipped ledger rows:` line in a commit that touched NO ledger hunk is RED and names the sha", () => {
  const findings = judgeLedgerClaims(
    [commit("deadbee", "fix(x): a thing\n\nflipped ledger rows: #1111", ["tooling/src/verify/lib/pass.ts"])],
    ledgerRowStates(LEDGER_TEXT),
  );
  expect(findings).toHaveLength(1);
  expect(findings[0]?.kind).toBe("false-flip");
  expect(findings[0]?.line).toContain("deadbee");
  expect(findings[0]?.line, "the remedy names the phrase a lane is allowed to write").toContain("ledger rows OWED");
});

test("the SAME claim in a commit that DID touch the ledger is clean — the acquitting control", () => {
  expect(
    judgeLedgerClaims(
      [commit("deadbee", "docs(ledger): a reconcile\n\nflipped ledger rows: #1111", [LEDGER, "tooling/src/verify/lib/pass.ts"])],
      ledgerRowStates(LEDGER_TEXT),
    ),
  ).toEqual([]);
});

// ── arm (b): an OWED id that is no row ───────────────────────────────────────────────────────────────
test("an OWED id with no ledger row is RED and names the id", () => {
  const findings = judgeLedgerClaims(
    [commit("cafe123", "fix(y): a thing\n\nledger rows OWED: #1111 #7777", ["tooling/src/verify/lib/pass.ts"])],
    ledgerRowStates(LEDGER_TEXT),
  );
  expect(findings).toHaveLength(1);
  expect(findings[0]?.kind).toBe("missing-row");
  expect(findings[0]?.line, "the id that does not resolve").toContain("#7777");
  expect(findings[0]?.line, "and not the one that does").not.toContain("#1111");
});

test("an OWED id that IS a row is clean, and so is the legal `none` — both acquitting controls", () => {
  const rows = ledgerRowStates(LEDGER_TEXT);
  expect(judgeLedgerClaims([commit("cafe123", "fix(y)\n\nledger rows OWED: #1111 #2222", ["x.ts"])], rows)).toEqual([]);
  expect(judgeLedgerClaims([commit("cafe123", "fix(y)\n\nledger rows OWED: none", ["x.ts"])], rows)).toEqual([]);
  expect(
    judgeLedgerClaims([commit("cafe123", "fix(y)\n\nledger rows OWED: none — this commit carries the owner's own rows.", ["x.ts"])], rows),
    "the trailing prose every honest lane writes must not be mined for ids",
  ).toEqual([]);
});

test("a commit that claims NOTHING is clean — the arm is about claims, not about commits", () => {
  expect(judgeLedgerClaims([commit("cafe123", "fix(y): a thing with no ledger line at all", ["x.ts"])], ledgerRowStates(LEDGER_TEXT))).toEqual([]);
});

// ── arm (c): a stale OWED id REPORTS and never reds ──────────────────────────────────────────────────
test("an OWED id still OPEN after N later commits is a REPORT line, never a red", () => {
  const owing = commit("cafe123", "fix(y)\n\nledger rows OWED: #1111", ["x.ts"]);
  const later = Array.from({ length: 12 }, (_, index) => commit(`later${String(index)}`, "chore: unrelated", ["x.ts"]));
  const findings = judgeLedgerClaims([owing, ...later], ledgerRowStates(LEDGER_TEXT));
  expect(findings).toHaveLength(1);
  expect(findings[0]?.kind, "REPORTED — the queue has not reconciled it, which is not this commit's defect").toBe("stale-owed");
  expect(findings[0]?.line).toContain("#1111");
});

test("a CLOSED OWED id never reports however long the range is — the state arm reads the ledger, not the clock", () => {
  const owing = commit("cafe123", "fix(y)\n\nledger rows OWED: #2222", ["x.ts"]);
  const later = Array.from({ length: 12 }, (_, index) => commit(`later${String(index)}`, "chore: unrelated", ["x.ts"]));
  expect(judgeLedgerClaims([owing, ...later], ledgerRowStates(LEDGER_TEXT))).toEqual([]);
});

test("the same OPEN id owed by the NEWEST commit does not report — N later commits is the whole predicate", () => {
  const owing = commit("cafe123", "fix(y)\n\nledger rows OWED: #1111", ["x.ts"]);
  expect(judgeLedgerClaims([owing], ledgerRowStates(LEDGER_TEXT))).toEqual([]);
});

// ── the git stream's parsing, on a verbatim sample of what the verb asks for ─────────────────────────
test("the record stream splits on the line-anchored fence and keeps each commit's paths", () => {
  const stdout = [
    FENCE,
    "aaaaaaa",
    "fix(one): a thing",
    "",
    "ledger rows OWED: #1111",
    PATH_FENCE,
    "tooling/src/verify/lib/pass.ts",
    "tests/tooling/verify/lib/pass.test.ts",
    FENCE,
    "bbbbbbb",
    "docs(ledger): the reconcile",
    "",
    "flipped ledger rows: #1111",
    PATH_FENCE,
    LEDGER,
    "",
  ].join("\n");
  const commits = parseClaimCommits(stdout);
  expect(commits.map(({ sha }) => sha)).toEqual(["aaaaaaa", "bbbbbbb"]);
  expect(commits[0]?.files).toContain("tooling/src/verify/lib/pass.ts");
  expect(commits[1]?.files, "the ledger hunk is what acquits the `flipped` claim").toContain(LEDGER);
  expect(judgeLedgerClaims(commits, ledgerRowStates(LEDGER_TEXT)), "the whole sample is a clean pair").toEqual([]);
});

test("a MERGE commit with no diff contributes no paths, so its `flipped` claim is still RED", () => {
  const stdout = [FENCE, "ccccccc", "Merge branch 'x'", "", "flipped ledger rows: #1111", PATH_FENCE, ""].join("\n");
  const commits = parseClaimCommits(stdout);
  expect(commits).toHaveLength(1);
  expect(commits[0]?.files).toEqual([]);
  expect(judgeLedgerClaims(commits, ledgerRowStates(LEDGER_TEXT))[0]?.kind).toBe("false-flip");
});

// A LEDGER THAT PARSES TO ZERO ROWS is blindness, not cleanliness — every OWED id would read as missing and
// the run would print a rich, entirely false verdict. `runLedgerClaims` refuses (exit 2) on it; this pins the
// reader half, which is where the emptiness becomes observable.
test("a ledger with no table rows parses to ZERO ids — the blindness the runner refuses on", () => {
  expect(ledgerRowStates("# Refutation ledger\n\nnothing but prose about #1111.\n").size).toBe(0);
});

// THE FALSE CLEAN THIS TOOL SHIPPED FOR ONE HOUR, kept as a permanent pin (the lying-tool contract). The
// first draft split body from paths by "a line containing a slash is a path", and `b5490a02a` — the commit
// the whole #2195 ruling was minted from — NAMES the ledger path in its own PROSE. The heuristic read that
// sentence as a ledger hunk, acquitted the false `flipped` claim, and the verb printed `1 commit(s)` with
// zero findings on the one commit it exists to catch. Driven at tip after the second fence landed:
// `pnpm check:ledger-claims --since b5490a02a~1 --until b5490a02a` -> exit 1, naming the sha.
test("a commit whose PROSE names the ledger path, with no ledger hunk, is still RED", () => {
  const stdout = [
    FENCE,
    "ddddddd",
    "fix(gates): a conversion",
    "",
    `The rows are recorded in ${LEDGER} under the wave's heading.`,
    "",
    "flipped ledger rows: #1111",
    PATH_FENCE,
    "tooling/src/verify/gates/list-row-adoption.ts",
    "",
  ].join("\n");
  const commits = parseClaimCommits(stdout);
  expect(commits[0]?.files, "the PROSE mention is body, not a path").toEqual(["tooling/src/verify/gates/list-row-adoption.ts"]);
  expect(judgeLedgerClaims(commits, ledgerRowStates(LEDGER_TEXT))[0]?.kind).toBe("false-flip");
});

test("a record with no path fence REFUSES loudly — a parser that silently skips is a parser that stops measuring", () => {
  expect(() => parseClaimCommits([FENCE, "eeeeeee", "fix(x): a thing", ""].join("\n"))).toThrow(/carries no ORB-LEDGER-CLAIMS-PATHS fence/u);
});
