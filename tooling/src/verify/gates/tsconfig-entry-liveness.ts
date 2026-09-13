// Policy: tsconfig-entry-liveness — an `include`/`exclude` entry in a `tsconfig*.json` names a set of tree
// nodes. When that set becomes EMPTY the entry goes SILENTLY dead: a dead exclude is stale weight that the
// next file created under it inherits, and a dead include silently drops the coverage it was carrying — a
// whole program checking nothing, or (tsconfig.tests-dom.json) a moved DOM-coupled escapee that stops being
// libbed at all. This is `biome-grant-liveness`'s shape (GATE-AUTHORING.md §4.4 mode B) turned on the TYPE
// configs, which feed the unified native typecheck list. THREE arms: a dead FILE-EXACT entry, a dead GLOB
// entry, and a `${configDir}` TEMPLATE entry, which is irreducible rather than dead.
//
// THE TRAP THIS FAMILY EXISTS AROUND: an entry is authored relative to ITS OWN CONFIG'S directory.
// `tooling/tsconfig.json`'s `src` is `tooling/src`; `packages/client/tsconfig.json`'s `../../tests/client/**`
// is `tests/client/**` at the root, and the naive concatenation leaves a `..` segment matching nothing at
// all — a silent false verdict in BOTH directions. `lib/config-grant-rows.ts` owns that resolution.
//
// THE CONVERSION BLOCKER IS GONE — do not re-derive the retired refusal (#2021, closing #2017's ARM C).
// This module's header carried a dated refusal reading "BLOCKED ON A SHARED READER: raw unfolded
// include/exclude is not published by the compiler reader", plus a standing note that `jsonc` was ruled out
// as a nineteenth ResourceHost kind because this gate was the corpus's ONLY JSONC parse. Both are now
// HISTORY: the ruling stands and its INPUT changed. `lib/policy-program-membership.ts` — the world program's
// ONE config-grammar reader (#1351) — now publishes `readCompilerConfigEntries` (the raw, unfolded,
// unexpanded entries WITH line identity, which `ParsedCommandLine` consumes and destroys) and
// `compilerConfigRoster` (the config roster as declared data, derived from the tracked inventory rather
// than from the `readdirSync` walk this gate used to do, which was blind to any config outside the three
// directories it looked in). So there is no second JSONC parse and no private roster; the route was a
// shared-READER question, exactly as §12.4's residual 2 said.
//
// FAMILY: `grant-liveness`, with the `biome-grant-liveness` pair, `depcruise-grant-liveness`,
// `eslint-grant-liveness` and `runner-config-path-liveness`. Readers: `lib/policy-program-membership.ts`
// (roster + entries), `lib/config-grant-rows.ts` (`tsconfigGrantRows`, `groupGrantRows`,
// `trackedPathOracle` — shared with the `-health` sibling), `lib/grant-liveness.ts` (`globMatcher`,
// `patternLivenessFindings`).
//
// AUTHORITY — a DELIBERATE divergence from the two siblings that converted first; the reasoning is written
// once, in `biome-grant-liveness.ts`'s header, and is not restated here. In short: the nine retired
// `EXEMPT`/`RATIFIED` rows are now exact `(policy, subject, operation)` rows in `lib/reviewed-grants.ts`
// per `exception-authority-census.md:96-100`, so this policy is `reviewed-grant` and its blindness
// tripwires live in the `hard` `-health` sibling. The census counted FOUR rows on 2026-09-05; the tables
// had grown to NINE by 2026-09-12 (1 `EXEMPT` + 8 `RATIFIED`), and all nine port one-for-one — the grant
// subject is the table's OWN key, so the per-config narrowing the legacy table lacked is not silently
// introduced here either.
//
// POPULATION PORT, with the LEGACY SHA that makes it checkable (#2123): the legacy descriptor is
// `git show c97de9d2f:tooling/src/verify/gates/tsconfig-entry-liveness.ts`, the parent of the conversion
// commit `97e68be91`. The legacy `scanRoot` was `() => false` (no TypeScript source at all) and the SUBJECT
// set was a `readdirSync` of the repo root plus `packages/*/tsconfig.json` plus `tooling/tsconfig.json` —
// 14 configs on 2026-09-12. The port is `{ of: "none" }` plus the tracked-corpus roster, which derives the
// SAME 14 today and is strictly broader by construction: a config authored anywhere else is now judged
// instead of being invisible. That widening is the intentional correction, recorded per §8.5.
//
// §4.6 DIFFERENTIAL — RECORDED 2026-09-13 (#2273), AND IT IS CATEGORY 5 WITH A ZERO LEGACY SIDE, SO IT IS
// A LIVENESS-AND-OUTCOME RECEIPT AND NOT CATCH PARITY. The conversion commit `97e68be91` states no
// differential and lands none as a test, and §4.6 (#2000) stopped accepting silence; this is the record it
// owes, all three axes named separately, driven on ONE corpus at `ce8e5174f`.
//   · FINDINGS. FINAL side through `runPolicyPass` over the real root: raw 8, granted 8, effective 0,
//     owner `success`/`complete`, `authorityAlarms []` — the empty alarm set measured with a planted stale
//     grant (`probe:never-matches` → one `stale-reviewed-grant`), so it is a measurement and not a silence.
//     The eight are one per GRANT IDENTITY: `**/__g_*`, `**/__g_*/**`, `**/node_modules`,
//     `scripts/**/*.mts`, `scripts/**/*.cts`, `tests/**/*.cts`, `scripts/**/*.tsx` and
//     `scripts/probes/st-goldens/sillytavern-runtime`, each consumed EXACTLY once.
//     LEGACY side: the frozen descriptor at `c97de9d2f`, header-import-shimmed into a scratch module
//     OUTSIDE `gates/` and driven through `runPass` over the SAME real root — **0 findings, 0 tool
//     errors**, declaring 106 candidates / 46 scanned / `{glob-live: 20, glob-ratified: 40}`.
//     THE PLANTED POSITIVE CONTROL for that zero: the same frozen source with `EXEMPT` and `RATIFIED`
//     emptied (each cut anchor asserted to occur exactly once in the file) reports **36** — 34 dead globs
//     plus 2 dead file-exacts. So the legacy reader was LIVE and its zero came from the EXEMPTION
//     SUBTRACTION, which is guide §6.4's EXEMPTION-MECHANISM MOVE classification, the exemption-table twin
//     of vacuity shape 2. Catch parity is NOT proven and is not claimed.
//     THE 36 → 8 ACCOUNTING, which is what category 5's own falsifier asks ("did every hidden site become
//     exactly ONE live, consumed row"): the 36 sites carry 8 DISTINCT subjects — `**/__g_*` and
//     `**/__g_*/**` in 11 configs each, `**/node_modules` in 8, `sillytavern-runtime` in 2, and one each
//     for the four `scripts`/`tests` dialect roots — and `reportCandidates` reports one finding per
//     subject by design. 8 subjects → 8 raw → 8 grants → 0 effective. ANSWERED YES.
//   · POPULATION. `{ of: "none" }` on both sides in effect: the legacy `scanRoot` was `() => false` and
//     the final declares it. The SUBJECT set is 14 configs both ways — the legacy `readdirSync` walk and
//     today's `authored-text#1` receipt (`resources: 14, unresolved: 0`) — beside `tracked-files` 9,707
//     (`unresolved: 0`), which is the existence oracle the legacy `existsSync` used to be.
//   · TOOL ERRORS. 0 on the final side. The legacy descriptor could emit none by construction (its reads
//     had no refusal shape); that capability is what the conversion bought, and the `-health` sibling is
//     where its refusals are proven.
//   · THE NINTH GRANT IS NOT A LOST CATCH. `cb-v-wave-8b` measured raw 9 on `50e31c534`; it is 8 here
//     because `tsconfig-entry-liveness:tests-iso-helpers` was DELETED at `815741e6c` when the first
//     `tests/support/iso` source landed and its glob went live — the two-sided ratchet working, named
//     path-by-path rather than absorbed into a count.
//
// THE NON-VACUOUS ARM NOW EXISTS, AND IT IS A REAL-TMPDIR FIXTURE REPLAY (#2319, 2026-09-13). The record
// above stands exactly as written — it is the REAL-TREE drive, category 5 with a zero legacy side, and it
// still disclaims catch parity. What it could not do is §4.6's only method that reaches catch parity:
// replay each legacy `GateExample` file map through the frozen descriptor and the final pair over the SAME
// BYTES. The shared harness refused, correctly, because it replays IN-MEMORY and this descriptor reads
// disk (#2119) — so the door §4.6 names for that class was BUILT rather than the refusal relaxed:
// `tests/support/legacy-differential.ts` `createTmpdirDifferential`, and the table is
// `tests/tooling/verify/gates/grant-liveness-legacy-replay.test.ts`. All 11 legacy examples, both engines,
// findings + populations + subjects + tool errors, each row classified with a MATCHED successor:
//   · 2 IDENTICAL (`mustFlag[0]`/`[1]`, the founding file-exact catch WITH its line identity) — catch
//     parity, measured, and it is the arm the `readCompilerConfigEntries` port was riskiest for.
//   · 2 SPLIT — UNPARSEABLE and NO-ROWS both fire as `tsconfig-entry-liveness-health` on the same
//     fixtures. UNPARSEABLE also MOVED ITS ANCHOR (line 0 file-level → line 1 with the config as its
//     token), which is §4.6 category 6 and is recorded rather than bucketed.
//   · 1 RUNTIME-REFUSAL — legacy MISSING-CONFIG, whose premise died with the derived roster, is answered
//     by the EMPTY-ROSTER throw as this header's `-health` sibling predicts.
//   · 2 RETIRED-ARM — STALE-EXEMPT (successor is central zero-consumption staleness, a whole-run fact) and
//     DEAD-CITE (no successor at all — the same gap `biome-grant-liveness.ts`'s header records).
//   · 2 STRONGER-READER — the glob half and the `${configDir}` TEMPLATE arm were legacy DECLARED SKIPS at
//     fixture scope and report here.
//   · 1 CATEGORY 5, driven with the SHIPPED `tsconfig-entry-liveness:st-goldens-runtime` row: raw 30 →
//     granted 1 → effective 29, the falsifier answered per fixture.
//   · 1 VACUOUS-BOTH-ZERO, labelled as such.
// THE IN-MEMORY REFUSAL IS UNCHANGED and still pinned with both controls in
// `grant-liveness-family.test.ts`; the tmpdir door carries the opposite fence (a replay root inside the
// running checkout is refused) so a frozen `readdirSync` arm can never walk this repository.
//
// COMMENT POSTURE: comment-SAFE — a tsconfig is JSONC and the reader parses it as such, so a comment is
// structurally out of the scanned unit rather than being stripped by this module.
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import type { ConfigGrantCandidate, ConfigGrantRow } from "../lib/config-grant-rows.ts";
import { groupGrantRows, trackedPathOracle, tsconfigGrantRows, tsconfigRosterFrom, tsconfigRosterPaths } from "../lib/config-grant-rows.ts";
import { globMatcher, patternLivenessFindings } from "../lib/grant-liveness.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

/** The licensed acts, and the `operation` half of every grant row this policy's findings consume. */
const EXACT_OPERATION = "tsconfig-exact-entry";
const GLOB_OPERATION = "tsconfig-glob-entry";
const TEMPLATE_OPERATION = "tsconfig-template-entry";

const MESSAGE =
  "a FILE-EXACT `include`/`exclude` entry in a tsconfig names nothing on the tree — the entry is DEAD. A " +
  "dead exclude is stale dead-weight the next file created under it inherits; a dead include silently " +
  "drops the coverage it carried, and for tsconfig.tests-dom.json it stops libbing a DOM-coupled escapee " +
  "(tooling/src/verify/gates/GATE-AUTHORING.md §4.4 mode B).";

const GLOB_MESSAGE =
  "a GLOB `include`/`exclude` entry in a tsconfig matches NO tracked file, after resolving it against its " +
  "OWN config's directory. A dead include is a program checking nothing; a dead exclude is stale weight " +
  "that the next file created under it inherits.";

const TEMPLATE_MESSAGE =
  "a `${configDir}` TEMPLATE entry in a tsconfig has no member set a static reader can test: TypeScript " +
  "expands the token per INHERITING config, so the entry denotes a different path in each extender and " +
  "there is no single root to resolve it against. It is not dead — it is IRREDUCIBLE, and an irreducible " +
  "authority is reviewed rather than counted.";

const FIX =
  "delete the dead entry from its tsconfig `include`/`exclude`. If the path MOVED, re-point the entry. If " +
  "its members are absent BY DESIGN (a gitignored subtree, installed dependencies, the `__g_` fixture " +
  "sentinel, a root declared before its first member), it is a REVIEWED GRANT: add a row to " +
  "tooling/src/verify/lib/reviewed-grants.ts keyed on this policy id, this subject and this operation, " +
  "with its `why` and its `endsWhen`. A `${configDir}` entry is reviewed the same way, or spelled as a real " +
  "path.";

/** Report ONE finding per grant identity, anchored at the first site and naming every site in the message.
 *  The grouping is load-bearing: a reviewed grant matching more than one finding is OVER-BROAD and licenses
 *  NOTHING, and an entry like `**\/node_modules` is authored in twelve configs. */
function reportCandidates(ctx: GatePolicyContext, candidates: readonly ConfigGrantCandidate[], operation: string, message: string): void {
  for (const candidate of candidates.toSorted((left, right) => left.subject.localeCompare(right.subject))) {
    ctx.report.file(candidate.config, {
      line: Math.max(candidate.line, 1),
      column: 1,
      token: candidate.subject,
      subject: candidate.subject,
      operation,
      // The POINTER goes last, after the identity: `diagnostic-legibility` reads the message's TAIL, and a
      // site list ending in `tsconfig.json:36` is a coordinate rather than a home an agent can go read.
      message: `${message} Subject: ${candidate.subject}, operation: ${operation}, site(s): ${candidate.sites.join(", ")}. See tooling/src/verify/lib/config-grant-rows.ts.`,
      fix: FIX,
    });
  }
}

/** The glob rows with no tracked member, judged through the shared member-major sweep. One row per SUBJECT:
 *  the sweep is keyed on the authored spelling, which is also the grant subject. */
function deadGlobs(rows: readonly ConfigGrantRow[], repoPaths: readonly string[]): readonly ConfigGrantRow[] {
  const bySubject = new Map<string, ConfigGrantRow>();
  for (const row of rows) {
    if (!bySubject.has(row.subject)) {
      bySubject.set(row.subject, row);
    }
  }
  const outcome = patternLivenessFindings({
    rows: [...bySubject.values()].map((row) => ({ file: row.config, pattern: row.subject, line: row.line, matches: globMatcher(row.rooted) })),
    sources: { repoPaths, dependencyModules: [] },
    ratified: {},
    ratifiedAnchorFile: "tsconfig.json",
    anchorOk: false,
    messages: { deadPattern: GLOB_MESSAGE, staleRatified: "", deadCite: "", budgetMoved: "" },
    exists: () => true,
  });
  return outcome.findings.flatMap((finding) => {
    const row = finding.token === undefined ? undefined : bySubject.get(finding.token);
    return row === undefined ? [] : [row];
  });
}

/** A one-config tsconfig carrying exactly the given raw `include` entries (already JSON-quoted). */
function includeJson(entries: readonly string[]): string {
  return `{\n  "include": [${entries.join(", ")}]\n}\n`;
}

const LIVE_REL = "packages/client/src/live.ts";
const LIVE_SOURCE = "export const live = 1;\n";
// A literal `${configDir}` token, assembled so biome does not read it as a real placeholder.
const CONFIG_DIR_TOKEN = ["$", "{configDir}/src"].join("");

export const gate = defineGate({
  id: "tsconfig-entry-liveness",
  family: "grant-liveness",
  authority: "reviewed-grant",
  severity: "error",
  population: {
    of: "none",
    why: "the type configs and the tracked corpus are closed ResourceHost facts read through the shared compiler reader; this policy judges no TypeScript source",
  },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  // `authored-text` is parasitic on `tracked-files`: it serves a config only because the tracked inventory
  // already admitted that path. Together they replace the legacy `readdirSync` roster AND its `readFileSync`.
  resources: [{ kind: "tracked-files" }, { kind: "authored-text" }],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      const repoPaths = readyResourceValue(ctx.resources.trackedFiles()).repoPaths;
      // `.configs` ONLY, and the omission is deliberate rather than a drop (#2120): a roster member the
      // text door REFUSED is a condition about this policy's own subject set that it cannot measure, and
      // "I could not read my subject" must not be licensable by the grant door these findings carry. The
      // `-health` sibling reports it, unsuppressibly, off the same total partition.
      // THE DOOR IS READ HERE, not inside the shared reader (#2148). `ctx.resources` never leaves the call
      // site: `tsconfigRosterPaths` says WHICH configs to demand (and carries the empty-roster refusal, so it
      // still precedes the door), this line acquires and narrows them, and `tsconfigRosterFrom` takes the
      // ready value. The seam used to hand the closed host to `lib/`, which `policy-soundness` ARM E4 had to
      // carve an exception for — and E4's population is the gates tree, so the carve stopped policing exactly
      // where the host crossed into `lib/`.
      const corpus = readyResourceValue(ctx.resources.authoredText(tsconfigRosterPaths(repoPaths)));
      const rows = tsconfigGrantRows(tsconfigRosterFrom(corpus).configs);
      const exists = trackedPathOracle(repoPaths);
      reportCandidates(ctx, groupGrantRows(rows.exact.filter((row) => !exists(row.rooted))), EXACT_OPERATION, MESSAGE);
      reportCandidates(ctx, groupGrantRows(deadGlobs(rows.globs, repoPaths)), GLOB_OPERATION, GLOB_MESSAGE);
      reportCandidates(ctx, groupGrantRows(rows.templates), TEMPLATE_OPERATION, TEMPLATE_MESSAGE);
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      grant: { subject: "packages/client/src/gone.ts", operation: "tsconfig-exact-entry" },
      files: { "tsconfig.json": '{\n  "exclude": ["packages/client/src/gone.ts"]\n}\n' },
      expect: { count: 1, token: "packages/client/src/gone.ts", line: 2 },
      why: "the founding shape — a file-exact EXCLUDE whose file is GONE (mode B: nothing ever visits it, so nothing examines the promise). The line pins that `readCompilerConfigEntries` carries real position identity.",
    },
    {
      mode: "resource",
      files: {
        "tsconfig.json": '{\n  "include": ["packages/*/src", "packages/client/src/live.ts", "packages/client/src/gone.ts"]\n}\n',
        [LIVE_REL]: LIVE_SOURCE,
      },
      expect: { count: 1, token: "packages/client/src/gone.ts" },
      why: "the LIVE glob and the live exact row are both silent; only the dead exact row fires — the exact/glob classifier is the load-bearing half",
    },
    {
      mode: "resource",
      files: { "tsconfig.json": '{\n  "include": ["packages/nonexistent/**/*.ts", "packages/client/src/live.ts"]\n}\n', [LIVE_REL]: LIVE_SOURCE },
      expect: { count: 1, token: "packages/nonexistent/**/*.ts", messageIncludes: "matches NO tracked file" },
      why: "#973 — a glob entry with no tracked member, carried from the legacy pattern half. Its message is DISJOINT from the exact arm's, so the two cannot pass for each other in a proof.",
    },
    {
      mode: "resource",
      files: { "tsconfig.json": includeJson([`"${CONFIG_DIR_TOKEN}"`, `"${LIVE_REL}"`]), [LIVE_REL]: LIVE_SOURCE },
      expect: { count: 1, token: CONFIG_DIR_TOKEN, messageIncludes: "IRREDUCIBLE" },
      why: "the retired CONFIG_DIR_BUDGET's successor. §12.5 bans a count ratchet, so the irreducible population is reviewed one row at a time instead of budgeted: the entry REPORTS and a reviewed grant licenses it. Zero such entries exist today, so this replaces a budget of 0 with a door.",
    },
    {
      mode: "resource",
      files: {
        "tsconfig.json": '{\n  "exclude": ["packages/client/src/gone.ts"]\n}\n',
        "tooling/tsconfig.json": '{\n  "exclude": ["../packages/client/src/gone.ts"]\n}\n',
      },
      expect: { count: 1, token: "packages/client/src/gone.ts" },
      why: "INVENTED ROW (§4.7) — TWO configs naming ONE subject through different spellings must report ONCE, or the reviewed grant matches two findings, is called OVER-BROAD and licenses neither. It also pins the config-dir resolution: `tooling/tsconfig.json`'s `../packages/...` and the root's `packages/...` are the SAME subject. Planted-break receipt in the landing commit.",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: { "tsconfig.json": '{\n  "exclude": ["packages/client/src/live.ts"]\n}\n', [LIVE_REL]: LIVE_SOURCE },
      why: "a file-exact exclude whose file is on the tree — the sanctioned shape, silent",
    },
    {
      mode: "resource",
      files: { "tooling/tsconfig.json": '{\n  "include": ["src", "../reset.d.ts"]\n}\n', "tooling/src/live.ts": LIVE_SOURCE, "reset.d.ts": "export {};\n" },
      why: "§4.1 NARROWING — the CONFIG-DIR resolution, in both directions at once. `src` means `tooling/src` and `../reset.d.ts` means root `reset.d.ts`; resolve either against the repo root instead and it names nothing, so this row reds. It also exercises `trackedPathOracle`'s DIRECTORY arm, since no tracked path equals `tooling/src`.",
    },
    {
      mode: "resource",
      files: {
        "tsconfig.json": includeJson([`"packages/*/src"`, `"tests/**/*.tsx"`, `"packages/client/**"`]),
        [LIVE_REL]: LIVE_SOURCE,
        "tests/a.tsx": LIVE_SOURCE,
      },
      why: "every glob spelling with a live member is silent — a `*` segment, a `**` suffix and a `**` directory all resolve through node's own matcher rather than a hand-rolled translator",
    },
  ],
});
