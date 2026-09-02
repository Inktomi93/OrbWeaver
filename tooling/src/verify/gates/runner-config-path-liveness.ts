// Gate: runner-config-path-liveness — a FILE-EXACT path in a TEST-RUNNER config's file-SELECTION lists
// (`include`/`exclude`/`testDir`/`globalSetup` in vitest.config.ts + the two playwright configs) names ONE
// tree node, and a runner NEVER complains when it names nothing: vitest silently drops a non-matching
// include/exclude entry. #1018's founding defect: `tests/tooling/ast-observability.int.test.ts` moved in
// 8931a886c and vitest.config.ts's SERIAL_INT row was not repointed, so the row matched NOTHING for months
// and the heaviest file in the repo (17.6 min) ran in the PARALLEL lane — the load bomb that row exists to
// prevent. This is eslint-grant-liveness's shape (GATE-AUTHORING.md §4.4 mode B) on the RUNNER configs,
// which are CODE: SERIAL_INT hides behind a named const spread into two projects, so a bare-StringLiteral
// reader would find almost nothing — extraction runs through lib/config-static-read.ts, which resolves what
// it can prove and REFUSES LOUDLY (arm UNREADABLE) on every shape it cannot. Arms: DEAD · MISSING-CONFIG ·
// UNPARSEABLE-CONFIG · UNREADABLE-SHAPE · NO-ROWS (the §4.6 blindness tripwire) · the two-sided EXEMPT arms.
// DECLARED LIMITS: (1) glob rows (`tests/**/*.int.test.ts`) are declared skips; (2) `testMatch` is NOT
// judged — playwright takes a glob or a RegExp there and the per-mode values are computed from
// tests/e2e/support/modes.ts, so it is a PATTERN axis by construction and carries no file-exact row;
// (3) reporter/output paths (`outputDir`, `outputFile`, a custom reporter module) are NOT judged — a
// missing reporter module fails the runner LOUDLY at start-up, and the silent class this gate exists for is
// file SELECTION; (4) liveness is filesystem resolution, exactly as in the sibling grant-liveness gates —
// a deliberately-absent-on-a-clean-checkout path takes an EXEMPT row, as `tsconfig-entry-liveness` does.
// COMMENT POSTURE: comment-SAFE — extraction is pure AST over node kinds, never a text match.
import type { ExemptionTable, Finding, GateDescriptor, GateScanDeclaration } from "../contract/gate.ts";
import { extractRows, readConfigSource } from "../lib/config-static-read.ts";
import type { ExactRow, GrantExemption, LivenessMessages } from "../lib/grant-liveness.ts";
import { isFileExact, livenessFindings } from "../lib/grant-liveness.ts";

/** Every runner config carrying a file-SELECTION list. The primary (findings with no config of their own
 *  anchor here) is the vitest config — the one that owns SERIAL_INT. */
const VITEST_REL = "vitest.config.ts";
const E2E_REL = "playwright.config.ts";
const CT_REL = "playwright-ct.config.ts";
const CONFIG_RELS: readonly string[] = [VITEST_REL, E2E_REL, CT_REL];
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
  "statically read (a call, a conditional, a spread of something non-literal), so the rows behind it are " +
  "unjudged and a ✓ would be a lie about coverage this gate does not have. This is the fail-loud half of " +
  "the CODE-config extractor: an unreadable shape is 'I could not measure', never 'clean'. Either spell the " +
  "value as a literal/const the reader resolves (tooling/src/verify/lib/config-static-read.ts), or widen the " +
  "reader deliberately. The finding token names the offending syntax kind.";

const MSG_NO_ROWS =
  "the test-runner configs parsed but ZERO file-exact rows were derived from an anchor-sized value set — the " +
  "glob/exact classifier has rotted past every row (SERIAL_INT alone carries dozens), so this gate is BLIND " +
  "and its ✓ means nothing (tooling/src/verify/gates/GATE-AUTHORING.md §4.6). Re-derive the classifier in " +
  "tooling/src/verify/gates/runner-config-path-liveness.ts.";

interface Outcome {
  readonly findings: readonly Finding[];
  readonly declaration: GateScanDeclaration;
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

function scanRunnerConfigPaths(root: string): Outcome {
  const exact: ExactRow[] = [];
  const blindFindings: Finding[] = [];
  const unreadable: Finding[] = [];
  let candidates = 0;
  let skipped = 0;
  for (const rel of CONFIG_RELS) {
    const read = readConfigSource(root, rel);
    if (read.kind === "missing") {
      blindFindings.push(fileFinding(VITEST_REL, MSG_MISSING, rel));
      continue;
    }
    if (read.kind === "unparseable") {
      blindFindings.push(fileFinding(rel, `${MSG_UNPARSEABLE} (${read.detail})`));
      continue;
    }
    const rows = extractRows({ sf: read.sf, rel, text: read.text, keys: JUDGED_KEYS, classify: classifyGlob });
    candidates += rows.candidates;
    skipped += rows.skipped;
    exact.push(...rows.exact);
    unreadable.push(...rows.unresolved.map((u) => fileFinding(rel, MSG_UNREADABLE, u.kind)));
  }
  const declaration: GateScanDeclaration = { unit: UNIT, candidates, scanned: exact.length, skipped: { glob: skipped } };
  if (blindFindings.length > 0 || unreadable.length > 0) {
    return { findings: [...blindFindings, ...unreadable], declaration };
  }
  const anchorOk = candidates >= REAL_CONFIG_MIN_CANDIDATES;
  if (exact.length === 0) {
    return { findings: anchorOk ? [fileFinding(VITEST_REL, MSG_NO_ROWS)] : [], declaration };
  }
  const findings = livenessFindings({ root, exact, exempt: EXEMPT, exemptAnchorFile: VITEST_REL, anchorOk, messages: MESSAGES });
  return { findings, declaration };
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
    "file), or delete it if the file is gone. For vitest.config.ts's SERIAL_INT the path appears TWICE by " +
    "construction — the `integration` project excludes it and `integration-serial` includes it — so both " +
    "copies come from the one const. If a path is legitimately absent on a clean checkout, add a row to " +
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
      files: configs(
        `const SERIAL = ["${DEAD_REL}", "${LIVE_REL}"];\n` +
          `export default { test: { projects: [{ test: { include: ["tests/**/*.int.test.ts"], exclude: [...SERIAL] } }, { test: { include: SERIAL } }] } };\n`,
        { [LIVE_REL]: LIVE_SOURCE },
      ),
      expect: { count: 2, token: DEAD_REL },
      why: "THE SERIAL_INT CASE: the dead path hides behind a named const SPREAD into two projects — invisible to a bare-StringLiteral reader — and it reds ONCE PER SITE, because a rename must repoint both the include and the exclude",
    },
    {
      files: configs("export default { test: { include: [resolvePaths()] } };\n"),
      expect: { count: 1, messageIncludes: "CANNOT statically read" },
      why: "THE FAIL-LOUD REQUIREMENT: a call expression is unreadable, and an unreadable shape must REFUSE, never pass as a clean zero",
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
