// Policy: runner-config-path-liveness — a FILE-EXACT path in a TEST-RUNNER config's file-SELECTION lists
// (`include`/`exclude`/`testDir`/`globalSetup` in vitest.config.ts + the two playwright configs) names ONE
// tree node, and a runner NEVER complains when it names nothing: vitest silently drops a non-matching
// include/exclude entry. #1018's founding defect: `tests/tooling/ast-observability.int.test.ts` moved in
// 8931a886c and vitest.config.ts's SERIAL_INT row was not repointed, so the row matched NOTHING for months
// and the heaviest file in the repo (17.6 min) ran in the PARALLEL lane — the load bomb that row exists to
// prevent. This is eslint-grant-liveness's shape on the RUNNER configs, which are CODE: kind globs and named
// selector arrays hide behind imports, calls and spreads, so a bare-StringLiteral reader finds almost
// nothing. Arms: DEAD · OUTSIDE · INCLUDE-NOT-FILE · UNRESOLVED-IDENTITY · NO-ROWS (the blindness tripwire).
//
// FAMILY: `grant-liveness`, with `depcruise-grant-liveness` and `eslint-grant-liveness`. The shared readers,
// as module AND function: `lib/grant-liveness.ts` `deadExactFindings` (the DEAD arm) and
// the executable-config subject readers behind the ResourceHost — `native-config` (vitest, through Vitest's
// public `resolveConfig` across the config-snapshot process boundary) and `static-config` (both Playwright
// configs, through `lib/config-static-read.ts`'s preserved evaluator). No reader is private to this module.
//
// POPULATION PORT: the legacy descriptor declared `scanRoot: () => false` — it admitted NO source file and
// judged only config values — so the final population is `{ of: "none" }` and the admitted AST set is
// byte-identical (empty on both sides). The judged SUBJECT set moved from three private
// `readConfigSource`/`readConfigSnapshot` reads to three declared resources; the four judged KEYS are now
// owned by `ops/resource-config.ts` `STATIC_KEYS` for the Playwright half, which spells exactly the legacy
// `JUDGED_KEYS` (`include`/`exclude`/`testDir`/`globalSetup`), and by `VITEST_CONFIG_SNAPSHOT_FIELDS` for
// the Vitest half, which is the same five selector fields the legacy module read off the same snapshot.
//
// CONVERSION, 2026-09-12 (#1584 / #1930), and what it retires. The legacy header refused conversion on a
// missing authored-path identity door. THAT DOOR SHIPPED — `authored-path` is one of the 18 frozen resource
// kinds (`contract/resource-declaration.ts`), minted FROM this module's refusal and specified by it
// (`contract/resource-path.ts` cites these lines by name), and it serves both reads the refusal named:
// symlink-aware containment, and root-relative normalization of an ABSOLUTE selector. The refusal's second
// half — that a `native-config` declaration drags the whole repository inventory into the population and the
// ordinary-waiver carrier demand then throws on tracked symlinks — was a `lib/policy-pass.ts` defect fixed at
// #1947: the demand is HARD-owner-exempt, and this policy is `authority: "hard"` exactly like its two
// converted siblings. Neither ground survives; a re-refusal on them would be inherited, not measured.
//
// WHAT THE CONVERSION MOVED OUT OF THIS MODULE, deliberately: MISSING-CONFIG, UNPARSEABLE-CONFIG, and
// UNREADABLE-SHAPE are now population-phase refusals. The integration drive retains their runtime envelope
// and real-root twin: each failure names its status and phase, while the live repository run completes the
// owner, files a resource receipt, and has no tool errors or carrier refusals (§6.3).
//
// DECLARED LIMITS: (1) glob rows (`tests/**/*.int.test.ts`) are declared skips; (2) `testMatch` is NOT
// judged — playwright takes a glob or a RegExp there and the per-mode values are computed from
// tests/e2e/support/modes.ts, so it is a PATTERN axis by construction and carries no file-exact row;
// (3) reporter/output paths (`outputDir`, `outputFile`, a custom reporter module) are NOT judged — a
// missing reporter module fails the runner LOUDLY at start-up, and the silent class this gate exists for is
// file SELECTION; (4) a deliberately-absent-on-a-clean-checkout class is expressed with the runner's
// pattern syntax rather than a dead exact selector; (5) the UNRESOLVED-IDENTITY arm is REACHABLE BUT
// UNPROVABLE BY FIXTURE:
// `ops/resource-path.ts` returns `unresolved` for a tree node that is neither file nor directory (a socket,
// FIFO or device node) or for a `stat` failure behind a link, and the proof runtime can create only files
// and symlinks (`GatePolicyProof.files` / `.links`). The arm is fail-closed and carries its own message; no
// row is invented for it, per guide §6.1's structurally-unfalsifiable classification.
// §4.1 NARROWING CUTS, measured 2026-09-12 in the guide's direction (make the policy flag MORE), each run
// against this module's own rows through `grant-liveness-family.suite.test.ts`:
//   · the field fence (`FILE_ONLY_FIELDS`) → widened to every directory identity: RED across both arms.
//   · the glob classifier (`classifyGlob` returning every value) → RED across both arms.
//   · the containment arm (`status === "outside"` no longer reported) → RED on the two containment rows (`mustFlag[1]`, `mustFlag[2]`), which is the receipt that the new SYMLINK row discriminates rather than passing by luck.
//   · the real-tree anchor (`anchorOk` forced true) → RED on `mustPass[5]`, which is the row that exists to
//     hold it. The anchor decides ONE thing no other fence decides: whether a zero-exact corpus is the
//     classifier having ROTTED (report MSG_NO_ROWS) or a corpus that legitimately derives no exact row
//     (stay silent). Forced true, a five-value all-glob config is accused of blindness — the tripwire firing
//     FALSELY, which is the failure mode a blindness tripwire cannot have. Recorded UNFALSIFIABLE until
//     2026-09-12; the cut came back clean only because EVERY row then in the module went through `configs()`,
//     which plants two exact playwright `testDir` values and so never reaches the zero-exact branch the anchor
//     guards. The clean cut measured THE HELPER, not the fence (guide §6.1) — `mustPass[5]` stops using it.
// MEASURED INTERACTION worth knowing before you write a fixture: a TRACKED symlink whose target escapes the
// repository makes `readPolicyRepositoryInventory` throw ("resolves outside repository"), which refuses
// every `native-config` consumer at the population phase. So the OUTSIDE-through-a-symlink finding is
// reachable only for a selector git does not track, and this module's own symlink proof gitignores its link
// for that reason — the loud upstream refusal covers the tracked case.
// COMMENT POSTURE: comment-SAFE — extraction is pure AST/native-loader observation over config values.
import type { ConfigSnapshotField } from "../contract/config-snapshot.ts";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import type { StaticConfigResourceId } from "../contract/resource-config.ts";
import type { AuthoredPathIdentity } from "../contract/resource-path.ts";
import { deadExactFindings, isFileExact } from "../lib/grant-liveness.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

/** Every runner config carrying a file-SELECTION list. Findings with no config of their own anchor on the
 *  primary Vitest config. */
const VITEST_REL = "vitest.config.ts";
const E2E_REL = "playwright.config.ts";
const CT_REL = "playwright-ct.config.ts";
/** The two still-literal configs, paired with the `static-config` id that owns each one's evaluator. */
const PLAYWRIGHT_CONFIGS: readonly (readonly [StaticConfigResourceId, string])[] = [
  ["playwright", E2E_REL],
  ["ct", CT_REL],
];

/** §4.5 real-tree anchor in its rename-proof COUNT form: the real configs derive ~80 values across their
 *  selection lists; a conformance mini-project plants a handful. Counted over ALL derived values, never
 *  over the exact ones, so it can guard the very arm that judges the exact/glob classifier. */
const REAL_CONFIG_MIN_CANDIDATES = 40;

const MESSAGE_DEAD =
  "a FILE-EXACT path in a test-runner config's `include`/`exclude`/`testDir`/`globalSetup` names nothing " +
  "on the tree — the row is DEAD, and a runner never says so: vitest silently drops a non-matching entry, " +
  "so the file it was routing runs in the WRONG LANE (or not at all) and nothing goes red. #1018's " +
  "founding case: a SERIAL_INT row left behind by a rename put the repo's heaviest suite (17.6 min) into " +
  "the parallel lane for months. The finding token is the dead path — see tooling/src/verify/gates/runner-config-path-liveness.ts.";

const MSG_NO_ROWS =
  "the test-runner configs resolved but ZERO file-exact rows were derived from an anchor-sized value set — " +
  "the glob/exact classifier has rotted past every exact testDir/globalSetup row, so this gate is BLIND " +
  "and its ✓ means nothing. Re-derive the classifier in " +
  "tooling/src/verify/gates/runner-config-path-liveness.ts.";

const MSG_OUTSIDE =
  "a FILE-EXACT test-runner selector resolves outside the repository root. An existing path outside the " +
  "checkout must never satisfy config liveness, and an in-repo symlink cannot grant a runner access to an " +
  "outside target. Re-point the exact selector inside the repository. Glob rows remain a declared skip; " +
  "this containment verdict applies only to file-exact selectors.";

const MSG_UNRESOLVED =
  "a FILE-EXACT test-runner selector could not be resolved to a tree identity at all — it names something " +
  "that is neither a file nor a directory, or its target could not be stat-ed. That is 'I could not " +
  "measure', never 'clean': the row is unjudged and a ✓ would be a lie about coverage this gate does not " +
  "have. Re-point the exact selector at a real file.";

const MSG_INCLUDE_NOT_FILE =
  "a FILE-EXACT Vitest `include` selector resolves to a directory rather than a file. Vitest collects " +
  "zero tests for an exact empty/root or directory include, so filesystem existence alone is a false " +
  "liveness signal. Point the exact include at a test file, or use a real Vitest glob when the intended " +
  "population contains multiple files. This check is field-specific: exact excludes and globalSetup may " +
  "legitimately name directories, and Playwright testDir is directory-valued.";

/** The Vitest selector fields whose exact value must be a FILE. An exact `exclude`, a `globalSetup` and a
 *  Playwright `testDir` are legitimately directory-valued. */
const FILE_ONLY_FIELDS: readonly ConfigSnapshotField[] = ["test.include", "typecheck.include"];

interface RunnerRow {
  /** The config file the finding anchors at. */
  readonly file: string;
  /** The selector exactly as the config carries it — the finding token, so the diagnostic names what the
   *  reader must fix (a `..` segment or an absolute path is repaired where it was authored). */
  readonly selector: string;
  readonly line: number;
  /** Native Vitest provenance, absent for the statically-read Playwright rows. */
  readonly owner?: string;
  readonly field?: ConfigSnapshotField;
}

interface Candidates {
  readonly exact: readonly RunnerRow[];
  readonly count: number;
  readonly skipped: number;
}

/** A vitest `include`/`exclude` entry and a playwright `testDir` are tinyglobby/minimatch patterns; one
 *  carrying no glob metacharacter names ONE tree node. A leading `./` is how a config spells a
 *  root-relative path (`globalSetup`) — normalization resolves it, so it stays exact. */
function classifyGlob(value: string): string | undefined {
  return isFileExact(value) ? value : undefined;
}

function collectCandidates(ctx: GatePolicyContext): Candidates {
  const exact: RunnerRow[] = [];
  let count = 0;
  let skipped = 0;
  const record = (row: RunnerRow, value: string): void => {
    count += 1;
    if (classifyGlob(value) === undefined) {
      skipped += 1;
    } else {
      exact.push(row);
    }
  };
  // Every declared resource must be ACQUIRED on every run (the receipt phase reds an unconsumed
  // declaration), and population resolution already refused a non-ready one before `create` — so each fact
  // here is guaranteed ready and the narrowing is an assertion about the runtime, never a silent return.
  const native = readyResourceValue(ctx.resources.nativeConfig("vitest"));
  for (const selector of native.selectors) {
    for (const value of selector.values) {
      record({ file: VITEST_REL, selector: value, line: 0, owner: selector.owner, field: selector.field }, value);
    }
  }
  for (const [id, rel] of PLAYWRIGHT_CONFIGS) {
    for (const row of readyResourceValue(ctx.resources.staticConfig(id)).rows) {
      record({ file: rel, selector: row.value, line: row.line }, row.value);
    }
  }
  return { exact, count, skipped };
}

/** The selector is the finding token — EXCEPT when the config authored the EMPTY string, which the report
 *  sink refuses ("finding token must be a nonempty string when present"). That row anchors on its config
 *  file and line instead; its message names the shape, and it is the one row in this module whose position
 *  cannot be spelled. */
function reportRow(ctx: GatePolicyContext, row: RunnerRow, message: string): void {
  const details = { line: row.line === 0 ? 1 : row.line, column: 1, message };
  ctx.report.file(row.file, row.selector === "" ? details : { ...details, token: row.selector });
}

/** The native provenance suffix — which project and field carried the row, so a repair reaches the right
 *  execution group rather than the first spelling of the path in the file. */
function withProvenance(message: string, row: RunnerRow): string {
  return row.owner === undefined || row.field === undefined ? message : `${message} Native selector: ${row.owner}.${row.field}.`;
}

/** `AuthoredPathIdentity` is an INTERSECTION of a common half with a status union, and TypeScript does not
 *  narrow `path` through the discriminant on that shape (the intersection breaks discriminant narrowing).
 *  A `in` test is the narrowing that works, and it is the contract's own partition: the three resolved
 *  statuses carry `path`, the two refusals carry `reason`. */
function identityPath(identity: AuthoredPathIdentity): string | undefined {
  return "path" in identity ? identity.path : undefined;
}

interface Resolved {
  /** Rows whose selector resolved to a contained identity, keyed for the shared liveness reconciler. */
  readonly live: readonly (RunnerRow & { readonly path: string })[];
  /** Repo-relative paths that exist as a file or a directory — the shared reader's existence oracle. */
  readonly present: ReadonlySet<string>;
}

/** Judge each row's IDENTITY through the `authored-path` door, reporting the two verdicts that are not a
 *  liveness question (containment, and an identity the door could not decide) plus the field-specific
 *  file-vs-directory rule, and hand the rest to the shared reconciler. */
function resolveRows(ctx: GatePolicyContext, rows: readonly RunnerRow[]): Resolved {
  const index = readyResourceValue(ctx.resources.authoredPaths(rows.map((row) => row.selector)));
  const bySelector = new Map<string, AuthoredPathIdentity>(index.identities.map((identity) => [identity.selector, identity]));
  const present = new Set(
    index.identities
      .filter((identity) => identity.status === "file" || identity.status === "directory")
      .map((identity) => identityPath(identity))
      .filter((path): path is string => path !== undefined),
  );
  const live: (RunnerRow & { readonly path: string })[] = [];
  for (const row of rows) {
    const identity = bySelector.get(row.selector);
    if (identity === undefined) {
      // The door's partition is TOTAL (`contract/resource-path.ts`); a missing identity is a broken runtime
      // guarantee, which is a tool error and never a quiet skip.
      throw new Error(`authored-path identity is missing for selector ${JSON.stringify(row.selector)}`);
    }
    if (identity.status === "outside") {
      reportRow(ctx, row, MSG_OUTSIDE);
      continue;
    }
    if (identity.status === "unresolved") {
      reportRow(ctx, row, `${MSG_UNRESOLVED} (${identity.reason})`);
      continue;
    }
    if (identity.status === "directory" && row.field !== undefined && FILE_ONLY_FIELDS.includes(row.field)) {
      reportRow(ctx, row, withProvenance(MSG_INCLUDE_NOT_FILE, row));
      continue;
    }
    const path = identityPath(identity);
    if (path === undefined) {
      throw new Error(`authored-path identity ${identity.status} carries no repo-relative path for ${JSON.stringify(row.selector)}`);
    }
    live.push({ ...row, path });
  }
  return { live, present };
}

function reportLiveness(ctx: GatePolicyContext, live: Resolved["live"], present: ReadonlySet<string>): void {
  const findings = deadExactFindings({
    exact: live.map((row) => ({ file: row.file, path: row.path, line: row.line })),
    message: MESSAGE_DEAD,
    exists: (path) => present.has(path),
  });
  // The DEAD findings come back in `exact` order, so they are consumed IN ORDER against the same predicate
  // the shared reader applied. A lookup BY PATH would be wrong on the shape this gate exists for: one named
  // const spread into two execution groups produces two findings with the SAME path, and both would inherit
  // the first site's provenance — a message telling the reader to repair the wrong row.
  const deadRows = live.filter((row) => !present.has(row.path));
  let deadIndex = 0;
  for (const finding of findings) {
    const row = deadRows[deadIndex];
    deadIndex += 1;
    if (row === undefined || finding.token !== row.path) {
      throw new Error(
        `the shared liveness reader's dead-row identity/order disagrees with this policy (${String(findings.length)} findings vs ${String(deadRows.length)} rows)`,
      );
    }
    reportRow(ctx, row, withProvenance(MESSAGE_DEAD, row));
  }
}

// ── self-proof fixtures ───────────────────────────────────────────────────────────────────────────────
const LIVE_REL = "tests/tooling/live.int.test.ts";
const LIVE_SOURCE = "export const live = 1;\n";
const DEAD_REL = "tests/tooling/gone.int.test.ts";
const E2E_SOURCE = 'export default { testDir: "tests/e2e", testMatch: "**/*.spec.ts" };\n';
const CT_SOURCE = 'export default { testDir: "tests", testMatch: "**/*.ct.tsx" };\n';

/** Every example must plant all three configs: each is a DECLARED resource, so an absent or row-less one is
 *  a population-phase tool error that would drown the row under test. The `keep.spec.ts` file makes BOTH
 *  playwright `testDir` values (`tests` and `tests/e2e`) resolve, so their two exact rows are live and
 *  silent instead of adding phantom DEAD findings to every row under test. */
function configs(vitest: string, extra: Readonly<Record<string, string>> = {}): Record<string, string> {
  return { [VITEST_REL]: vitest, [E2E_REL]: E2E_SOURCE, [CT_REL]: CT_SOURCE, "tests/e2e/keep.spec.ts": LIVE_SOURCE, ...extra };
}

/** The NO-ROWS arm needs a corpus with ZERO exact rows, so its playwright configs carry GLOB `testDir`
 *  values: a row-less static config would refuse as an empty fact before this arm could fire. */
function configsWithGlobTestDir(vitest: string): Record<string, string> {
  return {
    [VITEST_REL]: vitest,
    [E2E_REL]: 'export default { testDir: "tests/*", testMatch: "**/*.spec.ts" };\n',
    [CT_REL]: 'export default { testDir: "tests/**", testMatch: "**/*.ct.tsx" };\n',
  };
}

/** A value set too SMALL to be the real configs — the below-anchor half of the NO-ROWS pair (`mustPass[5]`),
 *  which with the two planted glob `testDir` values derives five candidates against a floor of 40. */
const BELOW_ANCHOR_GLOBS = 3;

/** `count` distinct glob entries — filler that clears the anchor while deriving zero exact rows. */
function globFiller(count: number): string {
  return Array.from({ length: count }, (_, i) => `"tests/p${i}/**"`).join(", ");
}

export const gate = defineGate({
  id: "runner-config-path-liveness",
  family: "grant-liveness",
  authority: "hard",
  severity: "error",
  population: {
    of: "none",
    why: "the three runner configs are closed ResourceHost facts and every selector identity is answered by the authored-path door; this policy admits no source file",
  },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [
    { kind: "native-config", id: "vitest" },
    { kind: "static-config", id: "playwright" },
    { kind: "static-config", id: "ct" },
    { kind: "authored-path" },
  ],
  message: MESSAGE_DEAD,
  fix:
    "re-point the row at the file's new path (a rename is a COUPLED SITE: the runner config moves with the " +
    "file), or delete it if the file is gone. A named const may spread the same path into several execution " +
    "groups, so repair every reported site. If a path is deliberately absent on a clean checkout, express the " +
    "intended population with the runner's supported pattern syntax rather than a dead exact selector.",
  create: (ctx) => ({
    evaluate: () => {
      const candidates = collectCandidates(ctx);
      const anchorOk = candidates.count >= REAL_CONFIG_MIN_CANDIDATES;
      if (candidates.exact.length === 0) {
        if (anchorOk) {
          ctx.report.file(VITEST_REL, { line: 1, column: 1, message: MSG_NO_ROWS });
        }
        // The demand door refuses a zero-subject call by contract (an `empty` fact plus a zero-resource
        // receipt is a tool error), and a declared request nobody consumed is a tool error too. A blind run
        // therefore demands the one selector it can always name: the anchor config it just reported on.
        readyResourceValue(ctx.resources.authoredPaths([VITEST_REL]));
        return;
      }
      const resolved = resolveRows(ctx, candidates.exact);
      reportLiveness(ctx, resolved.live, resolved.present);
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: configs(`export default { test: { projects: [{ test: { include: ["${DEAD_REL}"] } }] } };\n`),
      expect: { count: 1, token: DEAD_REL },
      why: "the founding shape — a file-exact runner row whose file is GONE (mode B: no runner ever visits it, so nothing examines the promise and the suite silently changes lane)",
    },
    {
      mode: "resource",
      files: configs('export default { test: { projects: [{ test: { include: ["../outside.test.ts"] } }] } };\n'),
      expect: { count: 1, token: "../outside.test.ts", messageIncludes: "outside the repository root" },
      why: "containment is judged before existence — an outside missing path is not allowed to masquerade as an ordinary dead in-repo selector",
    },
    {
      mode: "resource",
      files: {
        ...configs(`export default { test: { projects: [{ test: { include: ["tests/tooling/linked.int.test.ts"] } }] } };\n`),
        // The link ESCAPES the fixture root, so git must not track it: `readPolicyRepositoryInventory`
        // refuses an escaping tracked path outright and would tool-error every `native-config` consumer
        // before this arm could fire (measured, and stated in the header).
        ".gitignore": "tests/tooling/linked.int.test.ts\n",
      },
      links: { "tests/tooling/linked.int.test.ts": "../../.." },
      expect: { count: 1, token: "tests/tooling/linked.int.test.ts", messageIncludes: "outside the repository root" },
      why: "THE READ THIS POLICY WAS BLOCKED ON — an in-repo SYMLINK whose target is outside the checkout. Git lists it as an ordinary path, so a tracked-membership test PASSES it; only the authored-path door's realpath containment sees the escape",
    },
    {
      mode: "resource",
      files: configs('export default { test: { projects: [{ test: { include: [""] } }] } };\n'),
      expect: { count: 1, messageIncludes: "exact empty/root or directory include" },
      why:
        "Vitest's native collector returns zero files for an empty exact include; resolving it to the existing repository root must not pass liveness. " +
        "The reported token IS the empty selector, and `assertExpectation` refuses an empty `token` (a nonempty control-free string), so this row pins the " +
        "message instead — the one row in this module whose position cannot be named by the expectation grammar",
    },
    {
      mode: "resource",
      files: configs('export default { test: { projects: [{ test: { include: ["tests"] } }] } };\n'),
      expect: { count: 1, token: "tests", messageIncludes: "directory rather than a file" },
      why: "Vitest's native collector returns zero files for an exact directory include even though the directory exists",
    },
    {
      mode: "resource",
      files: configs(
        `const SERIAL = ["${DEAD_REL}", "${LIVE_REL}"];\n` +
          `export default { test: { projects: [{ test: { include: ["tests/**/*.int.test.ts"], exclude: [...SERIAL] } }, { test: { include: SERIAL } }] } };\n`,
        { [LIVE_REL]: LIVE_SOURCE },
      ),
      expect: { count: 2, token: DEAD_REL, messageIncludes: "project[0].test.exclude" },
      why: "the dead path hides behind a named const SPREAD into two execution groups — invisible to a bare-StringLiteral reader — and it reds ONCE PER SITE, because a rename must repoint both the include and the exclude. This row pins the FIRST site's native provenance",
    },
    {
      mode: "resource",
      files: configs(
        `const SERIAL = ["${DEAD_REL}", "${LIVE_REL}"];\n` +
          `export default { test: { projects: [{ test: { include: ["tests/**/*.int.test.ts"], exclude: [...SERIAL] } }, { test: { include: SERIAL } }] } };\n`,
        { [LIVE_REL]: LIVE_SOURCE },
      ),
      expect: { count: 2, token: DEAD_REL, messageIncludes: "project[1].test.include" },
      why: "THE SAME FIXTURE, pinning the SECOND site's provenance. Two rows because the expectation grammar matches ONE finding, and the per-site mapping is exactly what a by-path lookup silently gets wrong when two findings share a path — both would name the first site and send the reader to repair the wrong row",
    },
    {
      mode: "resource",
      files: configsWithGlobTestDir(`export default { test: { include: [${globFiller(REAL_CONFIG_MIN_CANDIDATES)}] } };\n`),
      expect: { count: 1, messageIncludes: "ZERO file-exact rows" },
      why: "zero derived rows on an anchor-sized value set is 'I could not measure', never 'clean' — the classifier-rot tripwire",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: configs(`export default { test: { projects: [{ test: { include: ["${LIVE_REL}"] } }] } };\n`, { [LIVE_REL]: LIVE_SOURCE }),
      why: "a file-exact runner row whose file is on the tree — the sanctioned shape, silent (and the two planted playwright configs' `testDir` values are directories that exist in the mini-project)",
    },
    {
      mode: "resource",
      files: configs('export default { test: { projects: [{ test: { include: ["tests/tooling/../tooling/live.int.test.ts"] } }] } };\n', {
        [LIVE_REL]: LIVE_SOURCE,
      }),
      why: "a selector containing `..` is valid when normalization still resolves to a live in-repository target — the door's repo-relative normalization, which a raw string compare against the tracked set would fail",
    },
    {
      mode: "resource",
      files: configs('export default { test: { projects: [{ test: { include: ["tests/tooling/linked.int.test.ts"] } }] } };\n', {
        [LIVE_REL]: LIVE_SOURCE,
      }),
      links: { "tests/tooling/linked.int.test.ts": "live.int.test.ts" },
      why: "THE OTHER DIRECTION OF THE SYMLINK ARM — a link whose target stays INSIDE the repository is an ordinary live selector, so the containment verdict is not a blanket accusation of every symlink",
    },
    {
      mode: "resource",
      files: configs(`export default { test: { exclude: [${globFiller(2)}, "tests/**/*.{int,contract}.test.ts", "**/__g_*"] } };\n`),
      why:
        "DECLARED LIMIT — every glob spelling (`**`, a brace set, a `*` segment) is a pattern, never resolved as a path. The legacy row's `why` also claimed the " +
        "config stays UNDER the anchor so NO-ROWS cannot fire; that reason is RETIRED as false — the two planted Playwright `testDir` values are exact rows, so " +
        "this fixture never reaches the zero-exact branch at all, whatever the anchor says (measured: forcing `anchorOk` true leaves THIS row green — `mustPass[5]` below is the row that does reach that branch and does red)",
    },
    {
      mode: "resource",
      files: configs(`export default { test: { include: ["${LIVE_REL}"] }, reporter: ["${DEAD_REL}"], outputDir: "reports/ct-results" };\n`, {
        [LIVE_REL]: LIVE_SOURCE,
      }),
      why: "DECLARED LIMIT — only the file-SELECTION keys are judged; a reporter module or an output directory is not a selection row, and a missing reporter fails the runner LOUDLY at start-up rather than silently changing which files run",
    },
    {
      mode: "resource",
      files: configsWithGlobTestDir(`export default { test: { include: [${globFiller(BELOW_ANCHOR_GLOBS)}] } };\n`),
      why:
        "THE ROW THAT HOLDS THE §4.5 ANCHOR, and the only one that reaches the zero-exact branch BELOW it: five derived " +
        "values (three vitest globs plus the two glob `testDir` values), all patterns, so `exact` is empty and `count` is " +
        "under REAL_CONFIG_MIN_CANDIDATES. A corpus that small has not PROVED the classifier rotted — it has proved nothing " +
        "— so the blindness tripwire must stay silent. Forcing `anchorOk` true reds exactly this row, which is the anchor's " +
        "whole job: MSG_NO_ROWS is an accusation that this gate's ✓ is a lie, and a tripwire that fires on any small corpus " +
        "would make that accusation constantly. Its mustFlag twin plants REAL_CONFIG_MIN_CANDIDATES values through the same " +
        "helper, so the pair differ only in the anchor",
    },
  ],
});
