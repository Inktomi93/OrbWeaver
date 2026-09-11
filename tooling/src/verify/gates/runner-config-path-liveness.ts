// Gate: runner-config-path-liveness — a FILE-EXACT path in a TEST-RUNNER config's file-SELECTION lists
// (`include`/`exclude`/`testDir`/`globalSetup` in vitest.config.ts + the two playwright configs) names ONE
// tree node, and a runner NEVER complains when it names nothing: vitest silently drops a non-matching
// include/exclude entry. #1018's founding defect: `tests/tooling/ast-observability.int.test.ts` moved in
// 8931a886c and vitest.config.ts's SERIAL_INT row was not repointed, so the row matched NOTHING for months
// and the heaviest file in the repo (17.6 min) ran in the PARALLEL lane — the load bomb that row exists to
// prevent. This is eslint-grant-liveness's shape (GATE-AUTHORING.md §4.4 mode B) on the RUNNER configs,
// which are CODE: kind globs and named selector arrays hide behind imports, calls and spreads, so a bare-StringLiteral
// reader finds almost nothing. Vitest crosses its public native loader through config-snapshot; the two
// still-literal Playwright configs use lib/config-static-read.ts and fail loud on unreadable syntax. Arms:
// DEAD · MISSING-CONFIG ·
// UNPARSEABLE-CONFIG · UNREADABLE-SHAPE · NO-ROWS (the §4.6 blindness tripwire) · the two-sided EXEMPT arms.
// DECLARED LIMITS: (1) glob rows (`tests/**/*.int.test.ts`) are declared skips; (2) `testMatch` is NOT
// judged — playwright takes a glob or a RegExp there and the per-mode values are computed from
// tests/e2e/support/modes.ts, so it is a PATTERN axis by construction and carries no file-exact row;
// (3) reporter/output paths (`outputDir`, `outputFile`, a custom reporter module) are NOT judged — a
// missing reporter module fails the runner LOUDLY at start-up, and the silent class this gate exists for is
// file SELECTION; (4) Vitest is executable config, so its values come from the public native loader through
// the synchronous config-snapshot CLI boundary; Playwright remains literal and statically read; (5)
// liveness is filesystem resolution, exactly as in the sibling grant-liveness gates —
// a deliberately-absent-on-a-clean-checkout path takes an EXEMPT row, as `tsconfig-entry-liveness` does.
// COMMENT POSTURE: comment-SAFE — extraction is pure AST over node kinds, never a text match.
// CONVERSION TO `defineGate` REFUSED 2026-09-11 (#1584 resume step 3 / #1930), orchestrator-approved; this
// module stays on the legacy descriptor and stays fully armed. Two of its reads have NO door on the closed
// `ResourceHost` surface (`contract/resource-host.ts`), and both protect a COMMITTED regression proof in
// tests/tooling/verify/gates/runner-config-path-liveness.int.test.ts:
//   1. `realpathSync` containment (`resolveExactRows` below): an in-repo SYMLINK must not grant a runner
//      access to an outside target. `trackedFiles()` returns repo paths only and git lists a symlink as an
//      ordinary path, so that escape would silently PASS; `ResourceReader.snapshot`'s `kind:"symlink"`
//      (`contract/resource.ts`) is internal and never reaches a policy.
//   2. root-relative resolution of an ABSOLUTE selector (`resolve(rootAbs, row.path)`): `GatePolicyContext`
//      deliberately carries no root, so an absolute selector cannot be related to the repository at all.
// The third filesystem read, `statSync(...).isFile()`, IS derivable from `tracked-files` directory prefixes
// and is not a blocker. Unblocking needs ONE shared door: authored-path identity for a repo-relative
// selector (exists · file|directory · symlink-resolves-outside) plus absolute-selector normalization.
// Separately, converting today would move a WORKING gate into a class that cannot run here: a
// `native-config` declaration drags the whole repository inventory into the policy's resource population,
// and `lib/policy-pass.ts`'s ordinary-waiver carrier demand then throws on this tree's tracked symlinks
// (measured on `eslint-grant-liveness`, 2026-09-11).
import { existsSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { ConfigSnapshotField } from "../contract/config-snapshot.ts";
import type { ExemptionTable, Finding, GateDescriptor, GateScanDeclaration } from "../contract/gate.ts";
import { readConfigSnapshot } from "../lib/config-snapshot.ts";
import { extractRows, readConfigSource } from "../lib/config-static-read.ts";
import type { ExactRow, GrantExemption, LivenessMessages } from "../lib/grant-liveness.ts";
import { isFileExact, livenessFindings } from "../lib/grant-liveness.ts";

/** Every runner config carrying a file-SELECTION list. Findings with no config of their own anchor on the
 *  primary Vitest config. */
const VITEST_REL = "vitest.config.ts";
const E2E_REL = "playwright.config.ts";
const CT_REL = "playwright-ct.config.ts";
const PLAYWRIGHT_RELS: readonly string[] = [E2E_REL, CT_REL];
const UNIT = "runner path row";
const JUDGED_KEYS = ["include", "exclude", "testDir", "globalSetup"] as const;

/** §4.5 real-tree anchor in its rename-proof COUNT form: the real configs derive ~80 values across their
 *  selection lists; a conformance mini-project plants a handful. Counted over ALL derived values, never
 *  over the exact ones, so it can guard the very arm that judges the exact/glob classifier. */
const REAL_CONFIG_MIN_CANDIDATES = 40;

/** Empty but ARMED at mint — every file-exact runner path resolves today (#1012 repointed the last dead
 *  one). The two-sided machinery is shared (lib/grant-liveness.ts) and proven by the sibling gates' pins;
 *  a row added here inherits both arms automatically. */
const EXEMPT: ExemptionTable<GrantExemption> = {};

const MESSAGES: LivenessMessages = {
  dead:
    "a FILE-EXACT path in a test-runner config's `include`/`exclude`/`testDir`/`globalSetup` names nothing " +
    "on the tree — the row is DEAD, and a runner never says so: vitest silently drops a non-matching entry, " +
    "so the file it was routing runs in the WRONG LANE (or not at all) and nothing goes red. #1018's " +
    "founding case: a SERIAL_INT row left behind by a rename put the repo's heaviest suite (17.6 min) into " +
    "the parallel lane for months. The finding token is the dead path — see tooling/src/verify/gates/runner-config-path-liveness.ts.",
  staleExempt:
    "a runner-config-path-liveness EXEMPT row forgives a path no runner config carries any more — a standing " +
    "exemption for a row that is gone is a LOADED GUN. Delete the row from EXEMPT in " +
    "tooling/src/verify/gates/runner-config-path-liveness.ts.",
  deadCite:
    "a runner-config-path-liveness EXEMPT row's `cite` no longer resolves — the producer that justified the " +
    "exemption moved or was deleted. Re-derive the cite, or delete the row from EXEMPT in " +
    "tooling/src/verify/gates/runner-config-path-liveness.ts.",
};

const MSG_MISSING =
  "a test-runner config this gate is keyed on is not at the repo root — its whole subject is gone, so the " +
  "verdict is unknowable and a ✓ here would be a lie (tooling/src/verify/gates/GATE-AUTHORING.md §4.6). " +
  "Re-point CONFIG_RELS in tooling/src/verify/gates/runner-config-path-liveness.ts, or delete the gate with " +
  "the config. The finding token names the missing config.";

const MSG_UNPARSEABLE =
  "a test-runner config did not parse. Fail LOUD, never fall back to a default: a silently-defaulted runner " +
  "config runs a different test set than this repo asked for, and every verdict downstream of it becomes a " +
  "lie. See tooling/src/verify/gates/runner-config-path-liveness.ts.";

const MSG_UNREADABLE =
  "an `include`/`exclude`/`testDir`/`globalSetup` value in a test-runner config is a shape this gate CANNOT " +
  "resolve through its owning config reader, so the rows behind it are unjudged and a ✓ would be a lie " +
  "about coverage this gate does not have. Vitest runs through its public native loader and the synchronous " +
  "config-snapshot boundary; Playwright's still-literal fields run through config-static-read.ts. An " +
  "unreadable config is 'I could not measure', never 'clean'. The finding token names the failed reader.";

const MSG_NO_ROWS =
  "the test-runner configs parsed but ZERO file-exact rows were derived from an anchor-sized value set — the " +
  "glob/exact classifier has rotted past every exact testDir/globalSetup row, so this gate is BLIND " +
  "and its ✓ means nothing (tooling/src/verify/gates/GATE-AUTHORING.md §4.6). Re-derive the classifier in " +
  "tooling/src/verify/gates/runner-config-path-liveness.ts.";

const MSG_OUTSIDE =
  "a FILE-EXACT test-runner selector resolves outside the repository root. An existing path outside the " +
  "checkout must never satisfy config liveness, and an in-repo symlink cannot grant a runner access to an " +
  "outside target. Re-point the exact selector inside the repository. Glob rows remain a declared skip; " +
  "this containment verdict applies only to file-exact selectors.";

const MSG_INCLUDE_NOT_FILE =
  "a FILE-EXACT Vitest `include` selector resolves to a directory rather than a file. Vitest collects " +
  "zero tests for an exact empty/root or directory include, so filesystem existence alone is a false " +
  "liveness signal. Point the exact include at a test file, or use a real Vitest glob when the intended " +
  "population contains multiple files. This check is field-specific: exact excludes and globalSetup may " +
  "legitimately name directories, and Playwright testDir is directory-valued.";

interface Outcome {
  readonly findings: readonly Finding[];
  readonly declaration: GateScanDeclaration;
}

interface RunnerExactRow extends ExactRow {
  readonly owner?: string;
  readonly field?: ConfigSnapshotField;
  readonly selectorPath?: string;
}

interface ReadRows {
  readonly exact: readonly RunnerExactRow[];
  readonly findings: readonly Finding[];
  readonly candidates: number;
  readonly skipped: number;
}

function fileFinding(file: string, message: string, token?: string): Finding {
  return token === undefined ? { file, line: 0, column: 0, message } : { file, line: 0, column: 0, token, message };
}

/** A vitest `include`/`exclude` entry and a playwright `testDir` are tinyglobby/minimatch patterns; one
 *  carrying no glob metacharacter names ONE tree node. A leading `./` is how a config spells a
 *  root-relative path (`globalSetup`) — `existsSync` resolves it, so it stays exact. */
function classifyGlob(value: string): string | undefined {
  return isFileExact(value) ? value : undefined;
}

function readVitestRows(root: string): ReadRows {
  const exact: RunnerExactRow[] = [];
  let candidates = 0;
  let skipped = 0;
  const vitestSource = readConfigSource(root, VITEST_REL);
  if (vitestSource.kind === "missing") {
    return { exact, findings: [fileFinding(VITEST_REL, MSG_MISSING, VITEST_REL)], candidates, skipped };
  }
  if (vitestSource.kind === "unparseable") {
    return { exact, findings: [fileFinding(VITEST_REL, `${MSG_UNPARSEABLE} (${vitestSource.detail})`)], candidates, skipped };
  }
  const native = readConfigSnapshot(root, "vitest", VITEST_REL);
  if (native.kind === "unreadable") {
    return {
      exact,
      findings: [fileFinding(VITEST_REL, `${MSG_UNREADABLE} Native loader detail: ${native.detail}`, "native-loader")],
      candidates,
      skipped,
    };
  }
  for (const selector of native.snapshot.selectors) {
    for (const value of selector.values) {
      candidates += 1;
      if (classifyGlob(value) === undefined) {
        skipped += 1;
      } else {
        exact.push({ file: VITEST_REL, path: value, line: 0, owner: selector.owner, field: selector.field });
      }
    }
  }
  return { exact, findings: [], candidates, skipped };
}

function readPlaywrightRows(root: string): ReadRows {
  const exact: ExactRow[] = [];
  const findings: Finding[] = [];
  let candidates = 0;
  let skipped = 0;
  for (const rel of PLAYWRIGHT_RELS) {
    const read = readConfigSource(root, rel);
    if (read.kind === "missing") {
      findings.push(fileFinding(VITEST_REL, MSG_MISSING, rel));
      continue;
    }
    if (read.kind === "unparseable") {
      findings.push(fileFinding(rel, `${MSG_UNPARSEABLE} (${read.detail})`));
      continue;
    }
    const rows = extractRows({ sf: read.sf, rel, text: read.text, keys: JUDGED_KEYS, classify: classifyGlob });
    candidates += rows.candidates;
    skipped += rows.skipped;
    exact.push(...rows.exact);
    findings.push(...rows.unresolved.map((u) => fileFinding(rel, MSG_UNREADABLE, u.kind)));
  }
  return { exact, findings, candidates, skipped };
}

function isContained(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function resolveExactRows(root: string, rows: readonly RunnerExactRow[]): { readonly exact: readonly RunnerExactRow[]; readonly findings: readonly Finding[] } {
  const rootAbs = resolve(root);
  const rootReal = realpathSync(rootAbs);
  const exact: RunnerExactRow[] = [];
  const findings: Finding[] = [];
  for (const row of rows) {
    const targetAbs = resolve(rootAbs, row.path);
    const targetInside = isContained(rootAbs, targetAbs);
    const realInside = !existsSync(targetAbs) || isContained(rootReal, realpathSync(targetAbs));
    if (!(targetInside && realInside)) {
      findings.push({ file: row.file, line: row.line, column: 0, token: row.path, message: MSG_OUTSIDE });
      continue;
    }
    if ((row.field === "test.include" || row.field === "typecheck.include") && existsSync(targetAbs) && !statSync(targetAbs).isFile()) {
      findings.push({
        file: row.file,
        line: row.line,
        column: 0,
        token: row.path,
        message: `${MSG_INCLUDE_NOT_FILE} Native selector: ${row.owner ?? "vitest"}.${row.field}.`,
      });
      continue;
    }
    exact.push({ ...row, path: relative(rootAbs, targetAbs) || ".", selectorPath: row.path });
  }
  return { exact, findings };
}

function identifyDeadFindings(root: string, exact: readonly RunnerExactRow[], findings: readonly Finding[]): readonly Finding[] {
  const deadIdentities = exact.filter((row) => EXEMPT[row.path] === undefined && !existsSync(join(root, row.path)));
  let deadIndex = 0;
  return findings.map((finding) => {
    if (finding.message !== MESSAGES.dead) {
      return finding;
    }
    const row = deadIdentities[deadIndex];
    deadIndex += 1;
    const identified = row?.selectorPath === undefined ? finding : { ...finding, token: row.selectorPath };
    return row?.owner === undefined || row.field === undefined
      ? identified
      : { ...identified, message: `${MESSAGES.dead} Native selector: ${row.owner}.${row.field}.` };
  });
}

function scanRunnerConfigPaths(root: string): Outcome {
  const reads = [readVitestRows(root), readPlaywrightRows(root)];
  const rawExact = reads.flatMap((read) => read.exact);
  const resolved = resolveExactRows(root, rawExact);
  const exact = resolved.exact;
  const blindFindings = [...reads.flatMap((read) => read.findings), ...resolved.findings];
  const candidates = reads.reduce((total, read) => total + read.candidates, 0);
  const skipped = reads.reduce((total, read) => total + read.skipped, 0);
  const declaration: GateScanDeclaration = { unit: UNIT, candidates, scanned: rawExact.length, skipped: { glob: skipped } };
  if (blindFindings.length > 0) {
    return { findings: blindFindings, declaration };
  }
  const anchorOk = candidates >= REAL_CONFIG_MIN_CANDIDATES;
  if (exact.length === 0) {
    return { findings: anchorOk ? [fileFinding(VITEST_REL, MSG_NO_ROWS)] : [], declaration };
  }
  const findings = livenessFindings({ root, exact, exempt: EXEMPT, exemptAnchorFile: VITEST_REL, anchorOk, messages: MESSAGES });
  return { findings: identifyDeadFindings(root, exact, findings), declaration };
}

// ── self-proof fixtures ───────────────────────────────────────────────────────────────────────────────
const LIVE_REL = "tests/tooling/live.int.test.ts";
const LIVE_SOURCE = "export const live = 1;\n";
const DEAD_REL = "tests/tooling/gone.int.test.ts";
const E2E_SOURCE = 'export default { testDir: "tests/e2e", testMatch: "**/*.spec.ts" };\n';
const CT_SOURCE = 'export default { testDir: "tests", testMatch: "**/*.ct.tsx" };\n';

/** Every example must plant all three configs: the gate is keyed on their EXACT filenames, so an absent
 *  one is (correctly) the blindness arm and would drown the row under test. The `keep.spec.ts` file makes
 *  BOTH playwright `testDir` values (`tests` and `tests/e2e`) resolve, so their two exact rows are live and
 *  silent instead of adding phantom DEAD findings to every row under test. */
function configs(vitest: string, extra: Readonly<Record<string, string>> = {}): Record<string, string> {
  return { [VITEST_REL]: vitest, [E2E_REL]: E2E_SOURCE, [CT_REL]: CT_SOURCE, "tests/e2e/keep.spec.ts": LIVE_SOURCE, ...extra };
}

/** The NO-ROWS arm needs a corpus with ZERO exact rows, so its playwright configs carry no `testDir`. */
function configsWithoutTestDir(vitest: string): Record<string, string> {
  return {
    [VITEST_REL]: vitest,
    [E2E_REL]: 'export default { testMatch: "**/*.spec.ts" };\n',
    [CT_REL]: 'export default { testMatch: "**/*.ct.tsx" };\n',
  };
}

/** `count` distinct glob entries — filler that clears the anchor while deriving zero exact rows. */
function globFiller(count: number): string {
  return Array.from({ length: count }, (_, i) => `"tests/p${i}/**"`).join(", ");
}

export const gate: GateDescriptor = {
  name: "runner-config-path-liveness",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  // The unit is a config VALUE, not a workspace source file — this gate subscribes to no node kinds, so it
  // admits no files and declares its own scan counts through ctx.scan (GATE-AUTHORING.md §1 scan health).
  scanRoot: () => false,
  message: MESSAGES.dead,
  fix:
    "re-point the row at the file's new path (a rename is a COUPLED SITE: the runner config moves with the " +
    "file), or delete it if the file is gone. A named const may spread the same path into several execution " +
    "groups, so repair every reported site. If a path is legitimately absent on a clean checkout, add a row to " +
    "EXEMPT in tooling/src/verify/gates/runner-config-path-liveness.ts with its `why` + END CONDITION and " +
    "the `cite` that proves it.",
  run: (ctx) => {
    const outcome = scanRunnerConfigPaths(ctx.root);
    ctx.scan(outcome.declaration);
    for (const finding of outcome.findings) {
      ctx.report(finding);
    }
  },
  mustFlag: [
    {
      files: configs(`export default { test: { projects: [{ test: { include: ["${DEAD_REL}"] } }] } };\n`),
      expect: { count: 1, token: DEAD_REL },
      why: "the founding shape — a file-exact runner row whose file is GONE (mode B: no runner ever visits it, so nothing examines the promise and the suite silently changes lane)",
    },
    {
      files: configs('export default { test: { projects: [{ test: { include: ["../outside.test.ts"] } }] } };\n'),
      expect: { count: 1, token: "../outside.test.ts", messageIncludes: "outside the repository root" },
      why: "containment is judged before existence — an outside missing path is not allowed to masquerade as an ordinary dead in-repo selector",
    },
    {
      files: configs('export default { test: { projects: [{ test: { include: [""] } }] } };\n'),
      expect: { count: 1, token: "", messageIncludes: "exact empty/root or directory include" },
      why: "Vitest's native collector returns zero files for an empty exact include; resolving it to the existing repository root must not pass liveness",
    },
    {
      files: configs('export default { test: { projects: [{ test: { include: ["tests"] } }] } };\n'),
      expect: { count: 1, token: "tests", messageIncludes: "directory rather than a file" },
      why: "Vitest's native collector returns zero files for an exact directory include even though the directory exists",
    },
    {
      files: configs(
        `const SERIAL = ["${DEAD_REL}", "${LIVE_REL}"];\n` +
          `export default { test: { projects: [{ test: { include: ["tests/**/*.int.test.ts"], exclude: [...SERIAL] } }, { test: { include: SERIAL } }] } };\n`,
        { [LIVE_REL]: LIVE_SOURCE },
      ),
      expect: { count: 2, token: DEAD_REL },
      why: "the dead path hides behind a named const SPREAD into two execution groups — invisible to a bare-StringLiteral reader — and it reds ONCE PER SITE, because a rename must repoint both the include and the exclude",
    },
    {
      files: configs("export default { test: { include: [resolvePaths()] } };\n"),
      expect: { count: 1, token: "native-loader", messageIncludes: "CANNOT resolve through its owning config reader" },
      why: "THE FAIL-LOUD REQUIREMENT: a config that fails native evaluation must REFUSE, never pass as a clean zero",
    },
    {
      files: { [VITEST_REL]: "export default {};\n", [E2E_REL]: E2E_SOURCE },
      expect: { count: 1, messageIncludes: "not at the repo root" },
      why: "§4.6 blindness tripwire: the gate is keyed on EXACT config filenames, so one of them resolving to nothing must be RED (here playwright-ct.config.ts)",
    },
    {
      files: configs("export default { test: { include: [ ;;; (((( } };\n"),
      expect: { count: 1, messageIncludes: "did not parse" },
      why: "a broken runner config must FAIL LOUD — a silent default-fallback would run a different test set than this repo asked for",
    },
    {
      files: configsWithoutTestDir(`export default { test: { include: [${globFiller(REAL_CONFIG_MIN_CANDIDATES)}] } };\n`),
      expect: { count: 1, messageIncludes: "ZERO file-exact rows" },
      why: "zero derived rows on an anchor-sized value set is 'I could not measure', never 'clean' — the classifier-rot tripwire",
    },
  ],
  mustPass: [
    {
      files: configs(`export default { test: { projects: [{ test: { include: ["${LIVE_REL}"] } }] } };\n`, { [LIVE_REL]: LIVE_SOURCE }),
      why: "a file-exact runner row whose file is on the tree — the sanctioned shape, silent (and the two planted playwright configs' `testDir` values are directories that exist in the mini-project)",
    },
    {
      files: configs('export default { test: { projects: [{ test: { include: ["tests/tooling/../tooling/live.int.test.ts"] } }] } };\n', {
        [LIVE_REL]: LIVE_SOURCE,
      }),
      why: "a selector containing `..` is valid when normalization still resolves to a live in-repository target",
    },
    {
      files: configs(`export default { test: { exclude: [${globFiller(2)}, "tests/**/*.{int,contract}.test.ts", "**/__g_*"] } };\n`),
      why: "DECLARED LIMIT — every glob spelling (`**`, a brace set, a `*` segment) is a pattern, never resolved as a path; the config stays UNDER the anchor so the NO-ROWS arm (which owns the anchor-sized zero) cannot fire here",
    },
    {
      files: configs(`export default { test: { include: ["${LIVE_REL}"] }, reporter: ["${DEAD_REL}"], outputDir: "reports/ct-results" };\n`, {
        [LIVE_REL]: LIVE_SOURCE,
      }),
      why: "DECLARED LIMIT — only the file-SELECTION keys are judged; a reporter module or an output directory is not a selection row, and a missing reporter fails the runner LOUDLY at start-up rather than silently changing which files run",
    },
  ],
};
