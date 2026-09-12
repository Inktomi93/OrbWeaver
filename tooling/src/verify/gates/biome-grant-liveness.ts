// Policy: biome-grant-liveness — a path in a `biome.json` override `includes` is a SUPPRESSION GRANT (it
// turns a lint rule off, or lifts a limit, for what it names). When the file is deleted or moved, or the
// glob stops matching anything, the row goes SILENTLY dead: an over-grant nobody sees, and a future file
// created at that path inherits a suppression nobody re-approved. That is GATE-AUTHORING.md §4.4 mode (B)
// applied to the lint config itself — the row's subject is never visited, so nothing ever examines the
// promise. TWO arms: a DEAD file-exact grant, and a DEAD glob grant (a glob is live when at least one
// TRACKED file is inside it — never an FS walk, which answers differently depending on whether
// node_modules/dist/reports happen to exist).
//
// FAMILY: `grant-liveness`, with `depcruise-grant-liveness`, `eslint-grant-liveness`,
// `runner-config-path-liveness` and the `tsconfig-entry-liveness` pair. Readers: `lib/grant-liveness.ts`
// (`patternLivenessFindings`, `globMatcher`, `lineFinder`, `isFileExact`) for the arms identical across all
// four registries, and `lib/config-grant-rows.ts` (`biomeGrantRows`, `groupGrantRows`, `trackedPathOracle`)
// for the per-config row reading this policy shares with its `-health` sibling.
//
// AUTHORITY — and this is a DELIBERATE divergence from the two siblings that converted first (#2021).
// `depcruise-grant-liveness` and `eslint-grant-liveness` landed 2026-09-11 as `authority: "hard"` carrying
// gate-local `ExemptionTable`s. `exception-authority-census.md:96-100` classifies all four external-config
// grant families as REVIEWED GRANTS, and §12.5 forbids a gate-owned exemption grammar outright, so this
// pair carries the census's disposition: the table is gone and its rows are exact
// `(policy, subject, operation)` rows in `lib/reviewed-grants.ts`. The siblings are the PRE-#1922 state, not
// a precedent — read the family as mid-migration, never as accidentally inconsistent.
//
// WHAT CENTRAL RECONCILIATION NOW OWNS. The retired table was two-sided by hand: a row `biome.json` no
// longer carries was RED (a standing allowance for a gone row is a loaded gun), and a row whose `cite`
// stopped resolving was RED. The first half is now the central engine's — a grant consumed zero times after
// a complete owner run is STALE and reds there, which is strictly stronger because it cannot be forgotten.
// The second half has NO successor AT ALL, and the first version of this sentence was WRONG about where it
// went (#2124). It claimed `dangling-refs` still catches a moved justification through the path cited in a
// grant's `why`. It does not, and the claim was checkable: `dangling-refs` arm 1 `readdirSync`s
// `tooling/src/verify/gates` alone and reads only the gate object's `docRow`/`message`/`fix`, resolving
// `*.md` refs; arms 2-5 are markdown corpora. `lib/reviewed-grants.ts` is in NO arm's population, so a
// grant whose cited decision moved or was deleted is caught by nothing. That is a retired property with no
// successor — the same disposition arm six got, and it is owed the same thing: a row, and a citation check
// over the grant table's own `why`/`endsWhen` prose. Stated here rather than absorbed, because a header
// naming a gate that does not look is worse than a header naming nothing.
//
// WHAT MOVED TO THE RUNTIME. MISSING-CONFIG and UNPARSEABLE-CONFIG are no longer reportable arms: a
// `json` resource that cannot resolve makes population resolution itself throw
// (`resolveResourceDeclarations`), which withholds the whole run as a TOOL ERROR — the fail-LOUD
// requirement is the runtime's own refusal now, and the proof harness has no "expect a tool error" arm
// (§4.5b), so both are pinned in `tests/tooling/verify/gates/biome-grant-liveness.int.test.ts`. The same is
// true of a blind tracked corpus: an empty `tracked-files` fact is an `empty` resource, which refuses.
//
// WHAT MOVED TO THE `-health` SIBLING. The §4.6 classifier-rot tripwire (an anchor-sized config deriving
// ZERO file-exact rows) is `biome-grant-liveness-health`, `hard`, same family. A tripwire that refuses a
// false clean must not itself be suppressible by the door this policy's findings carry.
//
// ARM SIX LEFT THIS POLICY, AND ITS PROPERTY IS HELD BY A STAGE (#2021 deleted it; #2074 rebuilt it).
// The `judgeRuleLiveness` reader asks the only question path liveness cannot: a `"rule": "off"` grant on a
// file that would not violate that rule is DEAD TEXT reading as protection. It answers it by writing a
// probe config into the repository ROOT and spawning the biome binary over the granted files — a filesystem
// WRITE plus a subprocess, where §12.3 bans even a read from a policy. So it is not carried HERE: its home
// is the `config:biome-rule-liveness` STATIC stage (`ops/biome-rule-liveness.ts`, the class
// `ops/config-snapshot.ts` already spawns a child for), and its controls are
// `tests/tooling/verify/ops/biome-rule-liveness.test.ts`. This policy's arms are the PATH half only; the
// RULE half is that stage's, and neither reads as the other's verdict.
//
// POPULATION PORT, and the LEGACY SHA that makes it checkable (#2123; the legacy descriptor is
// `git show c97de9d2f:tooling/src/verify/gates/biome-grant-liveness.ts`, the parent of the conversion
// commit `97e68be91`). The legacy `scanRoot` was `() => false` — it admitted no TypeScript source at all —
// and its SUBJECT was the single repo-root `biome.json`, read with `existsSync` + `readFileSync` and
// judged against `existsSync` + `git ls-files`. The port is `{ of: "none" }` for the TS dispatch plus three
// declarations that carry exactly those three reads: `json:biome` (the parse, with missing and unparseable
// as distinct non-ready facts rather than one `catch`), `tracked-files` (the existence oracle and the glob
// member corpus), and `authored-text` (the config's own bytes, for line identity). The admitted SUBJECT set
// is therefore byte-identical — one config, the same one — and the only intentional correction is the
// existence oracle moving from the filesystem to the TRACKED corpus, which is the same decision the glob
// half already made and which makes the verdict independent of whether a build or install has run.
//
// THE UNIT IS AN OVERRIDE ROW, NEVER THE TOP-LEVEL `files.includes` (#2122, and the legacy header declared
// this fence while the first converted header dropped it). `files.includes` is biome's own IGNORE/selection
// list: a preemptive entry for a generated or transient path — `playwright/.cache`, a build output — is
// legitimately allowed to name nothing, so judging it would red a correct config. An override row is the
// opposite: it GRANTS a rule posture to what it names, so naming nothing is an over-grant. The fence is a
// real narrowing and it carries its own `mustPass` row; before that row existed, widening the read killed
// ZERO proof rows, which is the §4.1 definition of unenforced.
//
// COMMENT POSTURE: n/a — the scanned unit is STRICT JSON, which has no comment syntax.
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import type { ConfigGrantCandidate, ConfigGrantRow } from "../lib/config-grant-rows.ts";
import { biomeGrantRows, groupGrantRows, readAcquiredConfigText, trackedPathOracle } from "../lib/config-grant-rows.ts";
import { globMatcher, lineFinder, patternLivenessFindings } from "../lib/grant-liveness.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const CONFIG_REL = "biome.json";

/** The licensed act, and the `operation` half of every grant row this policy's findings consume. Two, not
 *  one: a file-exact grant and a glob grant are different permissions over different evidence, and the
 *  retired tables kept them apart (`EXEMPT` vs `RATIFIED_PATTERNS`) for that reason. */
const EXACT_OPERATION = "biome-exact-grant";
const GLOB_OPERATION = "biome-glob-grant";

const MESSAGE =
  "a path in a `biome.json` override `includes` names nothing on the tree — the suppression grant it " +
  "carries is DEAD. A grant whose subject was deleted or moved is an over-grant nobody can see, and the " +
  "next file created at that path silently inherits a rule exemption nobody re-approved (the loaded-gun " +
  "class, tooling/src/verify/gates/GATE-AUTHORING.md §4.4 mode B).";

const GLOB_MESSAGE =
  "a GLOB in a `biome.json` override `includes` matches NO tracked file — the override is granting a rule " +
  "posture to nothing. That is the loaded-gun class one level up from a dead file-exact grant: the next " +
  "file created under that glob silently inherits a suppression nobody re-approved.";

const FIX =
  "delete the dead row from its override's `includes` in biome.json. If the file MOVED, re-point the row " +
  "and re-read the override's rule list — a grant follows a decision, not a filename. If the subject is " +
  "absent BY DESIGN (a write-then-delete intermediate, a generated tree), it is a REVIEWED GRANT: add a row " +
  "to tooling/src/verify/lib/reviewed-grants.ts keyed on this policy id, this subject and this operation, " +
  "with its `why` and its `endsWhen`.";

/** Report ONE finding per grant identity, anchored at the first site and naming every site in the message. */
function reportCandidates(ctx: GatePolicyContext, candidates: readonly ConfigGrantCandidate[], operation: string, message: string): void {
  for (const candidate of candidates.toSorted((left, right) => left.subject.localeCompare(right.subject))) {
    ctx.report.file(CONFIG_REL, {
      line: Math.max(candidate.line, 1),
      column: 1,
      token: candidate.subject,
      subject: candidate.subject,
      operation,
      // The POINTER goes last, after the identity: `diagnostic-legibility` reads the message's TAIL, and a
      // site list ending in `biome.json:843` is a coordinate rather than a home an agent can go read.
      message: `${message} Subject: ${candidate.subject}, operation: ${operation}, site(s): ${candidate.sites.join(", ")}. See tooling/src/verify/lib/config-grant-rows.ts.`,
      fix: FIX,
    });
  }
}

/** The glob rows with no tracked member, judged through the shared member-major sweep. */
function deadGlobs(rows: readonly ConfigGrantRow[], repoPaths: readonly string[]): readonly ConfigGrantRow[] {
  const bySubject = new Map(rows.map((row) => [row.subject, row]));
  const outcome = patternLivenessFindings({
    rows: [...bySubject.values()].map((row) => ({ file: row.config, pattern: row.subject, line: row.line, matches: globMatcher(row.rooted) })),
    sources: { repoPaths, dependencyModules: [] },
    ratified: {},
    ratifiedAnchorFile: CONFIG_REL,
    anchorOk: false,
    messages: { deadPattern: GLOB_MESSAGE, staleRatified: "", deadCite: "", budgetMoved: "" },
    exists: () => true,
  });
  return outcome.findings.flatMap((finding) => {
    const row = finding.token === undefined ? undefined : bySubject.get(finding.token);
    return row === undefined ? [] : [row];
  });
}

export const gate = defineGate({
  id: "biome-grant-liveness",
  family: "grant-liveness",
  authority: "reviewed-grant",
  severity: "error",
  population: { of: "none", why: "the lint config and the tracked corpus are closed ResourceHost facts; this policy judges no TypeScript source" },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  // `authored-text` is parasitic on the `json` acquisition above it: it serves `biome.json` only because
  // that declaration already admitted the path. It buys LINE IDENTITY, which the parsed value cannot carry
  // and which every finding here anchors at.
  resources: [{ kind: "json", id: "biome" }, { kind: "tracked-files" }, { kind: "authored-text" }],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      const config = readyResourceValue(ctx.resources.json("biome"));
      const repoPaths = readyResourceValue(ctx.resources.trackedFiles()).repoPaths;
      // REFUSES rather than substituting empty text (#2121): a `?? ""` fallback here silently anchored
      // every finding at line 1 with nothing saying the position had been lost.
      const rows = biomeGrantRows(config.value, lineFinder(readAcquiredConfigText(ctx.resources, CONFIG_REL)), CONFIG_REL);
      const exists = trackedPathOracle(repoPaths);
      reportCandidates(ctx, groupGrantRows(rows.exact.filter((row) => !exists(row.rooted))), EXACT_OPERATION, MESSAGE);
      reportCandidates(ctx, groupGrantRows(deadGlobs(rows.globs, repoPaths)), GLOB_OPERATION, GLOB_MESSAGE);
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: {
        "biome.json": '{\n  "overrides": [\n    {\n      "includes": ["packages/client/src/gone.ts"],\n      "linter": { "rules": {} }\n    }\n  ]\n}\n',
      },
      expect: { count: 1, token: "packages/client/src/gone.ts", line: 4 },
      why: "the founding shape — a file-exact grant whose file is GONE (mode B: nothing ever visits it, so nothing ever examines the promise). The line pins that the parasitic `authored-text` read supplies real line identity, which the parsed `json` value cannot.",
    },
    {
      mode: "resource",
      files: {
        "biome.json":
          '{\n  "overrides": [\n    {\n      "includes": ["packages/ui/**", "packages/client/src/live.ts", "packages/client/src/gone.ts"],\n      "linter": { "rules": {} }\n    }\n  ]\n}\n',
        "packages/ui/live.ts": "export const live = 1;\n",
        "packages/client/src/live.ts": "export const live = 1;\n",
      },
      expect: { count: 1, token: "packages/client/src/gone.ts" },
      why: "the LIVE glob and the live exact row are both silent; only the dead exact row fires — the exact/glob classifier is the load-bearing half",
    },
    {
      mode: "resource",
      files: {
        "biome.json":
          '{\n  "overrides": [\n    {\n      "includes": ["packages/nonexistent/**", "packages/client/src/live.ts"],\n      "linter": { "rules": {} }\n    }\n  ]\n}\n',
        "packages/client/src/live.ts": "export const live = 1;\n",
      },
      expect: { count: 1, token: "packages/nonexistent/**", messageIncludes: "matches NO tracked file" },
      why: "#973 — a glob grant with no tracked member is the loaded-gun class one level up, and it is a DISTINCT message from the exact arm so the two can be told apart in a proof",
    },
    {
      mode: "resource",
      files: {
        "biome.json":
          '{\n  "overrides": [\n    {\n      "includes": ["packages/client/src/gone.ts"],\n      "linter": { "rules": {} }\n    },\n    {\n      "includes": ["packages/client/src/gone.ts"],\n      "linter": { "rules": {} }\n    }\n  ]\n}\n',
      },
      expect: { count: 1, token: "packages/client/src/gone.ts" },
      why: "INVENTED ROW (§4.7) — one subject granted by TWO overrides must report ONCE, or its own reviewed grant matches two findings, is called OVER-BROAD and licenses neither. Planted-break receipt in the landing commit: with `groupGrantRows` removed this row reports 2 and dies.",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        "biome.json":
          '{\n  "files": { "includes": ["**", "!packages/client/src/gone.ts", "reports/generated.json"] },\n  "overrides": [\n    {\n      "includes": ["packages/client/src/live.ts"],\n      "linter": { "rules": {} }\n    }\n  ]\n}\n',
        "packages/client/src/live.ts": "export const live = 1;\n",
      },
      why: "§4.1 NARROWING (#2122) — the UNIT fence. `reports/generated.json` is a dead path in the TOP-LEVEL `files.includes`, which is biome's selection/ignore list rather than a grant: a preemptive entry for a generated path is legitimately allowed to name nothing. Beside it a LIVE override grant keeps the row from passing by emptiness. Widen `overrideIncludes` to read `files.includes` and this row reds; before it existed that same widening killed ZERO rows, which is the §4.1 definition of unenforced.",
    },
    {
      mode: "resource",
      files: {
        "biome.json": '{\n  "overrides": [\n    {\n      "includes": ["packages/client/src/live.ts"],\n      "linter": { "rules": {} }\n    }\n  ]\n}\n',
        "packages/client/src/live.ts": "export const live = 1;\n",
      },
      why: "a file-exact grant whose file is on the tree — the sanctioned shape, silent",
    },
    {
      mode: "resource",
      files: {
        "biome.json":
          '{\n  "overrides": [\n    {\n      "includes": ["!packages/client/src/gone.ts", "packages/client/src/live.ts"],\n      "linter": { "rules": {} }\n    }\n  ]\n}\n',
        "packages/client/src/live.ts": "export const live = 1;\n",
      },
      why: "DECLARED LIMIT — a NEGATED entry inside an override EXCLUDES rather than grants, so its subject is legitimately allowed not to exist",
    },
    {
      mode: "resource",
      files: {
        "biome.json": '{\n  "overrides": [\n    {\n      "includes": ["packages/ui/**"],\n      "linter": { "rules": {} }\n    }\n  ]\n}\n',
        "packages/ui/src/live.ts": "export const live = 1;\n",
      },
      why: "#973's other direction — a glob grant with at least one tracked member is LIVE and silent; without the member sweep this row cannot be told from the dead-glob row above",
    },
    {
      mode: "resource",
      files: {
        "biome.json": '{\n  "overrides": [\n    {\n      "includes": ["packages/ui"],\n      "linter": { "rules": {} }\n    }\n  ]\n}\n',
        "packages/ui/src/live.ts": "export const live = 1;\n",
      },
      why: "§4.1 NARROWING — `trackedPathOracle`'s DIRECTORY arm. `packages/ui` is a tree node with no tracked path equal to it, so a bare set-membership oracle (the depcruise shape, whose subjects are all files) reports it dead. Cut the prefix arm and this row reds.",
    },
  ],
});
